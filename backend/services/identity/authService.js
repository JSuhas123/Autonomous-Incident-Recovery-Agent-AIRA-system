"use strict";

const crypto = require("crypto");

const {
  userRepository,
  passwordCredentialRepository,
  organizationMembershipRepository,
  organizationRepository,
  tenantConfigRepository,
  persistenceTransactionManager,
} = require(
  "../../persistence/repositories"
);

const OrganizationBootstrapService =
  require(
    "../core/organizationBootstrapService"
  );

const {
  hashPassword,
  verifyPassword,
  needsRehash,
} = require(
  "./passwordService"
);

const {
  createSession,
} = require(
  "./sessionService"
);

const {
  record: auditRecord,
} = require(
  "./identityAuditService"
);

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_OUTCOMES,
} = require(
  "../../constants/authEvents"
);

const {
  ORGANIZATION_ROLES,
} = require(
  "../../constants/roles"
);

function generateSlug(name) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org";
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

function slugToTenantId(slug) {
  return slug
    .replace(/-/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 50);
}

// ---------------------------------------------------------------------------
// Retry helper — re-provisions TenantConfig for a provisioning_failed org
// without creating duplicate identity records. Only called when the user already
// exists but their organization never finished provisioning.
// ---------------------------------------------------------------------------
async function _retryProvisionTenantConfig(
  user,
  organization,
  ip,
  userAgent
) {
  const {
    tenantId,
    name:
      organizationName,
  } =
    organization;

  try {
    const existing =
      await tenantConfigRepository
        .findOne(
          {
            tenantId,
          },
          {
            includeSecrets:
              true,
          }
        );

    if (
      !existing
    ) {
      await tenantConfigRepository
        .create({
          tenantId,

          name:
            organizationName,

          status:
            "active",

          settings:
            {},

          apiKeys:
            [],

          admins:
            [],
        });
    }

    /*
     * Repair the whole organization foundation.
     *
     * The bootstrap operation must be idempotent:
     *
     * - Development environment
     * - Subscription
     * - defaultEnvironmentId
     */
    await OrganizationBootstrapService
      .bootstrapOrganization(
        organization,
        user._id
      );

    /*
     * Activate only after every provisioning component exists.
     */
    await organizationRepository
      .updateOne(
        {
          _id:
            organization._id,
        },
        {
          status:
            "active",
        }
      );

    organization.status =
      "active";
  } catch (
    provisioningError
  ) {
    await organizationRepository
      .updateOne(
        {
          _id:
            organization._id,
        },
        {
          status:
            "provisioning_failed",
        }
      )
      .catch(
        () => {}
      );

    await auditRecord(
      AUTH_EVENT_TYPES
        .REGISTRATION_FAILED,

      AUTH_EVENT_OUTCOMES
        .FAILURE,

      {
        userId:
          user._id,

        organizationId:
          organization._id,

        reasonCode:
          "TENANT_PROVISIONING_RETRY_FAILED",

        metadata: {
          message:
            provisioningError
              .message,
        },
      }
    );

    const error =
      new Error(
        "Organization provisioning is still failing. Please contact support."
      );

    error.status =
      503;

    error.code =
      "TENANT_PROVISIONING_FAILED";

    throw error;
  }

  const membership =
    await organizationMembershipRepository
      .findOne({
        userId:
          user._id,

        organizationId:
          organization._id,
      });

  const {
    session,
    rawToken,
    csrfToken,
  } =
    await createSession({
      userId:
        user._id,

      organizationId:
        organization._id,

      rememberMe:
        false,

      ip,

      userAgent,
    });

  await auditRecord(
    AUTH_EVENT_TYPES
      .REGISTRATION_SUCCEEDED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        user._id,

      organizationId:
        organization._id,

      sessionId:
        session._id,

      metadata: {
        retried:
          true,
      },
    }
  );

  await auditRecord(
    AUTH_EVENT_TYPES
      .SESSION_CREATED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        user._id,

      organizationId:
        organization._id,

      sessionId:
        session._id,
    }
  );

  return {
    rawToken,

    session,

    csrfToken,

    user:
      safeUser(
        user
      ),

    organization:
      safeOrg(
        organization
      ),

    membership:
      membership
        ? safeMembership(
            membership
          )
        : null,
  };
}

async function register(
  data,
  {
    ip =
      null,

    userAgent =
      null,
  } = {}
) {
  const {
    fullName,
    email,
    password,
    organizationName,
  } =
    data;

  const normalizedEmail =
    String(
      email ||
      ""
    )
      .toLowerCase()
      .trim();

  /*
   * -----------------------------------------------------------------------
   * EXISTING ACCOUNT / PROVISIONING RETRY
   * -----------------------------------------------------------------------
   */

  const existing =
    await userRepository
      .findOne({
        normalizedEmail,
      });

  if (
    existing
  ) {
    if (
      existing
        .primaryOrganizationId
    ) {
      const existingOrganization =
        await organizationRepository
          .findById(
            existing
              .primaryOrganizationId
          );

      if (
        existingOrganization &&
        existingOrganization
          .status ===
          "provisioning_failed"
      ) {
        return _retryProvisionTenantConfig(
          existing,
          existingOrganization,
          ip,
          userAgent
        );
      }
    }

    const error =
      new Error(
        "An account with this email address already exists"
      );

    error.status =
      409;

    error.code =
      "EMAIL_IN_USE";

    throw error;
  }

  /*
   * -----------------------------------------------------------------------
   * PASSWORD
   * -----------------------------------------------------------------------
   */

  const passwordHash =
    await hashPassword(
      password
    );

  /*
   * -----------------------------------------------------------------------
   * ORGANIZATION IDENTITY
   * -----------------------------------------------------------------------
   */

  let slug =
    generateSlug(
      organizationName
    );

  let tenantId =
    slugToTenantId(
      slug
    );

  for (
    let attempt = 0;
    attempt < 3;
    attempt += 1
  ) {
    const [
      existingSlug,
      existingTenant,
    ] =
      await Promise.all([
        organizationRepository
          .findOne({
            slug,
          }),

        organizationRepository
          .findOne({
            tenantId,
          }),
      ]);

    if (
      !existingSlug &&
      !existingTenant
    ) {
      break;
    }

    slug =
      generateSlug(
        organizationName
      );

    tenantId =
      slugToTenantId(
        slug
      );
  }

  /*
   * -----------------------------------------------------------------------
   * TRANSACTIONAL IDENTITY FOUNDATION
   * -----------------------------------------------------------------------
   *
   * This uses the provider-selected transaction manager:
   *
   * Mongo     -> Mongo transaction
   * PostgreSQL -> PostgreSQL transaction
   */

  let registrationResult;

  try {
    registrationResult =
      await persistenceTransactionManager
        .run(
          async (
            transaction
          ) => {
            const savedUser =
              await userRepository
                .create(
                  {
                    fullName,

                    email,

                    normalizedEmail,

                    status:
                      "active",
                  },
                  transaction
                );

            await passwordCredentialRepository
              .create(
                {
                  userId:
                    savedUser._id,

                  passwordHash,

                  algorithm:
                    "argon2id",

                  hashVersion:
                    1,

                  passwordChangedAt:
                    new Date(),
                },
                transaction
              );

            const savedOrganization =
              await organizationRepository
                .create(
                  {
                    name:
                      organizationName,

                    slug,

                    tenantId,

                    status:
                      "active",

                    createdByUserId:
                      savedUser._id,
                  },
                  transaction
                );

            const savedMembership =
              await organizationMembershipRepository
                .create(
                  {
                    userId:
                      savedUser._id,

                    organizationId:
                      savedOrganization
                        ._id,

                    role:
                      ORGANIZATION_ROLES
                        .OWNER,

                    status:
                      "active",

                    joinedAt:
                      new Date(),
                  },
                  transaction
                );

            await userRepository
              .updateOne(
                {
                  _id:
                    savedUser._id,
                },
                {
                  primaryOrganizationId:
                    savedOrganization
                      ._id,
                },
                {},
                transaction
              );

            savedUser
              .primaryOrganizationId =
              savedOrganization
                ._id;

            return {
              user:
                savedUser,

              organization:
                savedOrganization,

              membership:
                savedMembership,
            };
          }
        );
  } catch (
    error
  ) {
    /*
     * Repository-level PostgreSQL uniqueness errors are translated into
     * Mongo-compatible 11000 where possible.
     */
    if (
      error.code ===
        11000 &&
      (
        error.keyPattern
          ?.normalizedEmail ||
        error.constraint
          ?.includes?.(
            "normalized_email"
          )
      )
    ) {
      const conflict =
        new Error(
          "An account with this email address already exists"
        );

      conflict.status =
        409;

      conflict.code =
        "EMAIL_IN_USE";

      await auditRecord(
        AUTH_EVENT_TYPES
          .REGISTRATION_FAILED,

        AUTH_EVENT_OUTCOMES
          .FAILURE,

        {
          reasonCode:
            "EMAIL_IN_USE",

          ipHash:
            ip,
        }
      );

      throw conflict;
    }

    await auditRecord(
      AUTH_EVENT_TYPES
        .REGISTRATION_FAILED,

      AUTH_EVENT_OUTCOMES
        .FAILURE,

      {
        reasonCode:
          error.code ||
          "REGISTRATION_ERROR",

        ipHash:
          ip,

        metadata: {
          message:
            error.message,
        },
      }
    );

    throw error;
  }

  const {
    user,
    organization,
    membership,
  } =
    registrationResult;

  /*
   * -----------------------------------------------------------------------
   * TENANT CONFIG
   * -----------------------------------------------------------------------
   *
   * Kept outside the identity transaction because Mongo historically
   * experienced catalog-change conflicts when the collection was created
   * inside a transaction.
   *
   * PostgreSQL repository execution remains safe through the same neutral
   * persistence contract.
   */

  try {
    const existingTenantConfig =
      await tenantConfigRepository
        .findOne(
          {
            tenantId,
          },
          {
            includeSecrets:
              true,
          }
        );

    if (
      !existingTenantConfig
    ) {
      await tenantConfigRepository
        .create({
          tenantId,

          name:
            organizationName,

          status:
            "active",

          settings:
            {},

          apiKeys:
            [],

          admins:
            [],
        });
    }
  } catch (
    tenantError
  ) {
    await organizationRepository
      .updateOne(
        {
          _id:
            organization._id,
        },
        {
          status:
            "provisioning_failed",
        }
      );

    organization.status =
      "provisioning_failed";

    await auditRecord(
      AUTH_EVENT_TYPES
        .REGISTRATION_FAILED,

      AUTH_EVENT_OUTCOMES
        .FAILURE,

      {
        userId:
          user._id,

        organizationId:
          organization._id,

        reasonCode:
          "TENANT_PROVISIONING_FAILED",

        metadata: {
          message:
            tenantError
              .message,
        },
      }
    );

    const error =
      new Error(
        "Account created but organization provisioning failed. Please contact support or retry."
      );

    error.status =
      503;

    error.code =
      "TENANT_PROVISIONING_FAILED";

    throw error;
  }

  /*
   * -----------------------------------------------------------------------
   * ORGANIZATION BOOTSTRAP
   * -----------------------------------------------------------------------
   *
   * Before issuing a usable browser session, guarantee that the organization
   * has:
   *
   * - canonical Development environment
   * - defaultEnvironmentId
   * - subscription / entitlement state
   */

  try {
    await OrganizationBootstrapService
      .bootstrapOrganization(
        organization,
        user._id
      );
  } catch (
    bootstrapError
  ) {
    await organizationRepository
      .updateOne(
        {
          _id:
            organization._id,
        },
        {
          status:
            "provisioning_failed",
        }
      );

    organization.status =
      "provisioning_failed";

    await auditRecord(
      AUTH_EVENT_TYPES
        .REGISTRATION_FAILED,

      AUTH_EVENT_OUTCOMES
        .FAILURE,

      {
        userId:
          user._id,

        organizationId:
          organization._id,

        reasonCode:
          "ORGANIZATION_BOOTSTRAP_FAILED",

        metadata: {
          message:
            bootstrapError
              .message,
        },
      }
    );

    const error =
      new Error(
        "Account created but organization bootstrap failed. Please retry."
      );

    error.status =
      503;

    error.code =
      "ORGANIZATION_BOOTSTRAP_FAILED";

    throw error;
  }

  /*
   * -----------------------------------------------------------------------
   * SESSION
   * -----------------------------------------------------------------------
   *
   * Session creation happens only after the full organization foundation
   * exists.
   */

  const {
    session,
    rawToken,
    csrfToken,
  } =
    await createSession({
      userId:
        user._id,

      organizationId:
        organization._id,

      rememberMe:
        false,

      ip,

      userAgent,
    });

  /*
   * -----------------------------------------------------------------------
   * AUDIT
   * -----------------------------------------------------------------------
   */

  await auditRecord(
    AUTH_EVENT_TYPES
      .REGISTRATION_SUCCEEDED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        user._id,

      organizationId:
        organization._id,

      sessionId:
        session._id,

      ipHash:
        ip,
    }
  );

  await auditRecord(
    AUTH_EVENT_TYPES
      .SESSION_CREATED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        user._id,

      organizationId:
        organization._id,

      sessionId:
        session._id,
    }
  );

  return {
    rawToken,

    session,

    csrfToken,

    user:
      safeUser(
        user
      ),

    organization:
      safeOrg(
        organization
      ),

    membership:
      safeMembership(
        membership
      ),
  };
}

async function login(
  data,
  {
    ip =
      null,

    userAgent =
      null,
  } = {}
) {
  const {
    email,
    password,
    rememberMe =
      false,
  } =
    data;


  const normalizedEmail =
    String(
      email ||
      ""
    )
      .toLowerCase()
      .trim();


  /*
   * Same outward credential error for:
   *
   * - unknown user
   * - missing credential
   * - wrong password
   *
   * This prevents credential/account enumeration.
   */
  const credentialsError =
    (() => {
      const error =
        new Error(
          "Invalid email or password"
        );

      error.status =
        401;

      error.code =
        "INVALID_CREDENTIALS";

      error.executionAuthorized =
        false;

      return error;
    })();


  const user =
    await userRepository
      .findOne({
        normalizedEmail,
      });


  if (
    !user
  ) {
    await auditRecord(
      AUTH_EVENT_TYPES
        .LOGIN_FAILED,

      AUTH_EVENT_OUTCOMES
        .FAILURE,

      {
        reasonCode:
          "USER_NOT_FOUND",

        ipHash:
          ip,
      }
    );


    /*
     * Timing defence:
     * perform expensive password hashing even for unknown users.
     */
    await hashPassword(
      "aira-timing-defense-constant-input"
    )
      .catch(
        () => {}
      );


    throw credentialsError;
  }


  const credential =
    await passwordCredentialRepository
      .findOne({
        userId:
          user._id,
      }, { includePasswordHash: true });


  if (
    !credential
  ) {
    await auditRecord(
      AUTH_EVENT_TYPES
        .LOGIN_FAILED,

      AUTH_EVENT_OUTCOMES
        .FAILURE,

      {
        userId:
          user._id,

        reasonCode:
          "NO_CREDENTIAL",

        ipHash:
          ip,
      }
    );


    await hashPassword(
      "aira-timing-defense-constant-input"
    )
      .catch(
        () => {}
      );


    throw credentialsError;
  }


  /*
   * Prove knowledge of the password BEFORE revealing:
   *
   * - account suspended
   * - account disabled
   * - account locked
   *
   * This prevents email-only account state enumeration.
   */
  const valid =
    await verifyPassword(
      credential
        .passwordHash,
      password
    );


  const now =
    new Date();


  const locked =
    Boolean(
      credential
        .lockedUntil &&
      credential
        .lockedUntil >
      now
    );


  if (
    !valid
  ) {
    /*
     * Do not expose whether the account is currently locked.
     *
     * If already locked, retain the existing lock rather than
     * extending it for arbitrary bad attempts.
     */
    if (
      !locked
    ) {
      const newCount =
        (
          credential
            .failedAttempts ||
          0
        ) +
        1;


      const lockUntil =
        newCount >=
        10
          ? new Date(
              Date.now() +
              15 *
                60 *
                1000
            )
          : null;


      await passwordCredentialRepository
        .updateOne(
          {
            _id:
              credential._id,
          },
          {
            $set: {
              failedAttempts:
                newCount,

              lastFailedAt:
                new Date(),

              ...(
                lockUntil
                  ? {
                      lockedUntil:
                        lockUntil,
                    }
                  : {}
              ),
            },
          }
        );


      if (
        lockUntil
      ) {
        await auditRecord(
          AUTH_EVENT_TYPES
            .ACCOUNT_LOCKED,

          AUTH_EVENT_OUTCOMES
            .DENIED,

          {
            userId:
              user._id,

            ipHash:
              ip,
          }
        );
      }
    }


    await auditRecord(
      AUTH_EVENT_TYPES
        .LOGIN_FAILED,

      AUTH_EVENT_OUTCOMES
        .FAILURE,

      {
        userId:
          user._id,

        reasonCode:
          "INVALID_PASSWORD",

        ipHash:
          ip,
      }
    );


    throw credentialsError;
  }


  /*
   * At this point the caller has proven possession of the
   * correct password, so account-state responses no longer
   * reveal information to unauthenticated guessers.
   */

  if (
    locked
  ) {
    await auditRecord(
      AUTH_EVENT_TYPES
        .LOGIN_FAILED,

      AUTH_EVENT_OUTCOMES
        .DENIED,

      {
        userId:
          user._id,

        reasonCode:
          "ACCOUNT_LOCKED",

        ipHash:
          ip,
      }
    );


    const error =
      new Error(
        "Account locked. Try again later."
      );

    error.status =
      403;

    error.code =
      "ACCOUNT_LOCKED";

    error.executionAuthorized =
      false;

    throw error;
  }


  if (
    user.status ===
    "suspended"
  ) {
    await auditRecord(
      AUTH_EVENT_TYPES
        .LOGIN_FAILED,

      AUTH_EVENT_OUTCOMES
        .DENIED,

      {
        userId:
          user._id,

        reasonCode:
          "ACCOUNT_SUSPENDED",

        ipHash:
          ip,
      }
    );


    const error =
      new Error(
        "Account suspended. Contact support."
      );

    error.status =
      403;

    error.code =
      "ACCOUNT_SUSPENDED";

    error.executionAuthorized =
      false;

    throw error;
  }


  if (
    user.status ===
    "disabled"
  ) {
    await auditRecord(
      AUTH_EVENT_TYPES
        .LOGIN_FAILED,

      AUTH_EVENT_OUTCOMES
        .DENIED,

      {
        userId:
          user._id,

        reasonCode:
          "ACCOUNT_DISABLED",

        ipHash:
          ip,
      }
    );


    const error =
      new Error(
        "Account disabled. Contact support."
      );

    error.status =
      403;

    error.code =
      "ACCOUNT_DISABLED";

    error.executionAuthorized =
      false;

    throw error;
  }


  /*
   * Successful authentication clears lock/failure state.
   */
  await passwordCredentialRepository
    .updateOne(
      {
        _id:
          credential._id,
      },
      {
        $set: {
          failedAttempts:
            0,

          lockedUntil:
            null,

          lastFailedAt:
            null,
        },
      }
    );


  /*
   * Transparently migrate old Argon2 parameters.
   *
   * The plaintext password exists only within this request and
   * the newly generated hash replaces the older hash.
   */
  if (
    needsRehash(
      credential
        .passwordHash
    )
  ) {
    const newHash =
      await hashPassword(
        password
      );


    await passwordCredentialRepository
      .updateOne(
        {
          _id:
            credential._id,
        },
        {
          $set: {
            passwordHash:
              newHash,

            passwordChangedAt:
              new Date(),
          },

          $inc: {
            hashVersion:
              1,
          },
        }
      );
  }


  await userRepository
    .updateOne(
      {
        _id:
          user._id,
      },
      {
        $set: {
          lastLoginAt:
            new Date(),
        },
      }
    );


  const membership =
    await organizationMembershipRepository
      .findOne({
        userId:
          user._id,

        status:
          "active",
      });


  /*
   * Do not attach an inactive organization to a fresh session.
   */
  const organization =
    membership
      ? await organizationRepository
          .findOne({
            _id:
              membership
                .organizationId,

            status:
              "active",
          })
      : null;


  const {
    session,
    rawToken,
    csrfToken,
  } =
    await createSession({
      userId:
        user._id,

      organizationId:
        organization
          ?._id ||
        null,

      rememberMe,

      ip,

      userAgent,
    });


  await auditRecord(
    AUTH_EVENT_TYPES
      .LOGIN_SUCCEEDED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        user._id,

      organizationId:
        organization
          ?._id,

      sessionId:
        session._id,

      ipHash:
        ip,
    }
  );


  await auditRecord(
    AUTH_EVENT_TYPES
      .SESSION_CREATED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        user._id,

      sessionId:
        session._id,
    }
  );


  return {
    rawToken,

    session,

    csrfToken,

    user:
      safeUser(
        user
      ),

    organization:
      organization
        ? safeOrg(
            organization
          )
        : null,

    membership:
      membership
        ? safeMembership(
            membership
          )
        : null,

    executionAuthorized:
      false,
  };
}

function safeUser(user) {
  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    status: user.status,
    primaryOrganizationId: user.primaryOrganizationId || null,
    emailVerifiedAt: user.emailVerifiedAt || null,
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt,
  };
}

function safeOrg(org) {
  return {
    id: org._id,
    name: org.name,
    slug: org.slug,
    tenantId: org.tenantId,
    status: org.status,
    createdAt: org.createdAt,
  };
}

function safeMembership(m) {
  return { id: m._id, role: m.role, status: m.status, joinedAt: m.joinedAt || null };
}

module.exports = { register, login, safeUser, safeOrg, safeMembership };
