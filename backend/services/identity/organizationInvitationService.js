"use strict";

const crypto =
  require("crypto");

const {
  getPostgresPool,
} =
  require(
    "../../persistence/postgres/postgresPool"
  );

const {
  userRepository,
  passwordCredentialRepository,
  organizationMembershipRepository,
  organizationRepository,
  persistenceTransactionManager,
} =
  require(
    "../../persistence/repositories"
  );

const {
  hashPassword,
} =
  require(
    "./passwordService"
  );

const {
  ORGANIZATION_ROLE_VALUES,
  ORGANIZATION_ROLES,
} =
  require(
    "../../constants/roles"
  );

const {
  record:
    auditRecord,
} =
  require(
    "./identityAuditService"
  );

const INVITATION_PREFIX =
  "aira_inv_";

const DEFAULT_EXPIRY_HOURS =
  72;

const MAX_EXPIRY_HOURS =
  168;

const INVITABLE_ROLES =
  new Set(
    ORGANIZATION_ROLE_VALUES
      .filter(
        (
          role
        ) =>
          role !==
          ORGANIZATION_ROLES
            .OWNER
      )
  );

// ============================================================================
// HELPERS
// ============================================================================

function createError(
  message,
  status,
  code
) {
  const error =
    new Error(
      message
    );

  error.status =
    status;

  error.code =
    code;

  error.executionAuthorized =
    false;

  return error;
}

function normalizeEmail(
  email
) {
  return String(
    email ||
    ""
  )
    .trim()
    .toLowerCase();
}

function hashToken(
  rawToken
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      String(
        rawToken
      ),
      "utf8"
    )
    .digest(
      "hex"
    );
}

function generateInvitationToken() {
  return (
    INVITATION_PREFIX +
    crypto
      .randomBytes(
        48
      )
      .toString(
        "base64url"
      )
  );
}

function generatePublicId() {
  return (
    "inv_" +
    crypto
      .randomBytes(
        12
      )
      .toString(
        "hex"
      )
  );
}

function invitationStatus(
  invitation
) {
  if (
    invitation.accepted_at
  ) {
    return "accepted";
  }

  if (
    invitation.revoked_at
  ) {
    return "revoked";
  }

  if (
    invitation.superseded_at
  ) {
    return "superseded";
  }

  if (
    new Date(
      invitation.expires_at
    ).getTime() <=
    Date.now()
  ) {
    return "expired";
  }

  return "pending";
}

function serializeInvitation(
  invitation
) {
  return {
    id:
      invitation.public_id,

    organizationId:
      invitation.organization_id,

    email:
      invitation.email,

    role:
      invitation.role,

    status:
      invitationStatus(
        invitation
      ),

    invitedByUserId:
      invitation.invited_by_user_id,

    expiresAt:
      invitation.expires_at,

    acceptedAt:
      invitation.accepted_at,

    acceptedByUserId:
      invitation.accepted_by_user_id,

    revokedAt:
      invitation.revoked_at,

    createdAt:
      invitation.created_at,

    updatedAt:
      invitation.updated_at,
  };
}

function getPool() {
  return getPostgresPool();
}

function transactionClient(
  transaction
) {
  if (
    transaction?.kind ===
      "postgres" &&
    transaction.client
  ) {
    return transaction.client;
  }

  return null;
}

// ============================================================================
// CREATE INVITATION
// ============================================================================

async function createInvitation({
  organizationId,
  email,
  role,
  invitedByUserId,
  expiresInHours =
    DEFAULT_EXPIRY_HOURS,
}) {
  if (
    !organizationId ||
    !invitedByUserId
  ) {
    throw createError(
      "Organization and inviter identity are required",
      400,
      "INVITATION_CONTEXT_REQUIRED"
    );
  }

  const normalizedEmail =
    normalizeEmail(
      email
    );

  if (
    !normalizedEmail
  ) {
    throw createError(
      "Email is required",
      422,
      "INVITATION_EMAIL_REQUIRED"
    );
  }

  if (
    !INVITABLE_ROLES.has(
      role
    )
  ) {
    throw createError(
      "Invalid invitation role",
      422,
      "INVITATION_ROLE_INVALID"
    );
  }

  const organization =
    await organizationRepository
      .findOne({
        _id:
          organizationId,

        status:
          "active",
      });

  if (
    !organization
  ) {
    throw createError(
      "Organization not found",
      404,
      "ORGANIZATION_NOT_FOUND"
    );
  }

  const existingUser =
    await userRepository
      .findOne({
        normalizedEmail,
      });

  if (
    existingUser
  ) {
    const existingMembership =
      await organizationMembershipRepository
        .findOne({
          userId:
            existingUser._id,

          organizationId,
        });

    if (
      existingMembership &&
      existingMembership.status !==
        "removed"
    ) {
      throw createError(
        "User already belongs to this organization",
        409,
        "ORGANIZATION_MEMBERSHIP_EXISTS"
      );
    }
  }

  const boundedHours =
    Math.min(
      Math.max(
        Number(
          expiresInHours
        ) ||
          DEFAULT_EXPIRY_HOURS,
        1
      ),
      MAX_EXPIRY_HOURS
    );

  const expiresAt =
    new Date(
      Date.now() +
      boundedHours *
        60 *
        60 *
        1000
    );

  const rawToken =
    generateInvitationToken();

  const tokenHash =
    hashToken(
      rawToken
    );

  const pool =
    getPool();

  /**
   * Supersede any still-live invitation for the same organization/email.
   *
   * This ensures only the newest invitation link remains valid.
   */
  await pool.query(
    `
      UPDATE identity.organization_invitations
      SET
        superseded_at = NOW(),
        updated_at = NOW()
      WHERE
        organization_id = $1
        AND normalized_email = $2
        AND accepted_at IS NULL
        AND revoked_at IS NULL
        AND superseded_at IS NULL
    `,
    [
      organizationId,
      normalizedEmail,
    ]
  );

  const result =
    await pool.query(
      `
        INSERT INTO identity.organization_invitations (
          public_id,
          organization_id,
          email,
          normalized_email,
          role,
          token_hash,
          invited_by_user_id,
          expires_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
        RETURNING *
      `,
      [
        generatePublicId(),
        organizationId,
        normalizedEmail,
        normalizedEmail,
        role,
        tokenHash,
        invitedByUserId,
        expiresAt,
      ]
    );

  const invitation =
    result.rows[0];

  await auditRecord(
    "organization_invitation_created",
    "success",
    {
      userId:
        invitedByUserId,

      organizationId,

      metadata: {
        invitationId:
          invitation.public_id,

        email:
          normalizedEmail,

        role,

        expiresAt:
          expiresAt.toISOString(),
      },
    }
  ).catch(
    () => {}
  );

  return {
    invitation:
      serializeInvitation(
        invitation
      ),

    /**
     * Raw token exists exactly at issuance.
     *
     * Production email delivery will consume this value.
     */
    token:
      rawToken,
  };
}

// ============================================================================
// LIST
// ============================================================================

async function listInvitations(
  organizationId
) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        SELECT *
        FROM identity.organization_invitations
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 500
      `,
      [
        organizationId,
      ]
    );

  return result.rows.map(
    serializeInvitation
  );
}

// ============================================================================
// REVOKE
// ============================================================================

async function revokeInvitation({
  organizationId,
  invitationId,
  revokedByUserId,
}) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        UPDATE identity.organization_invitations
        SET
          revoked_at = NOW(),
          revoked_by_user_id = $3,
          updated_at = NOW()
        WHERE
          organization_id = $1
          AND public_id = $2
          AND accepted_at IS NULL
          AND revoked_at IS NULL
          AND superseded_at IS NULL
        RETURNING *
      `,
      [
        organizationId,
        invitationId,
        revokedByUserId,
      ]
    );

  if (
    !result.rows[0]
  ) {
    throw createError(
      "Active invitation not found",
      404,
      "INVITATION_NOT_FOUND"
    );
  }

  await auditRecord(
    "organization_invitation_revoked",
    "success",
    {
      userId:
        revokedByUserId,

      organizationId,

      metadata: {
        invitationId,
      },
    }
  ).catch(
    () => {}
  );

  return serializeInvitation(
    result.rows[0]
  );
}

// ============================================================================
// RESEND
// ============================================================================

async function resendInvitation({
  organizationId,
  invitationId,
  actorUserId,
}) {
  const pool =
    getPool();

  const current =
    await pool.query(
      `
        SELECT *
        FROM identity.organization_invitations
        WHERE
          organization_id = $1
          AND public_id = $2
        LIMIT 1
      `,
      [
        organizationId,
        invitationId,
      ]
    );

  const invitation =
    current.rows[0];

  if (
    !invitation ||
    invitation.accepted_at ||
    invitation.revoked_at
  ) {
    throw createError(
      "Invitation cannot be resent",
      409,
      "INVITATION_NOT_RESENDABLE"
    );
  }

  return createInvitation({
    organizationId,

    email:
      invitation.email,

    role:
      invitation.role,

    invitedByUserId:
      actorUserId,

    expiresInHours:
      DEFAULT_EXPIRY_HOURS,
  });
}

// ============================================================================
// ACCEPT
// ============================================================================

async function acceptInvitation({
  rawToken,
  fullName =
    null,
  password =
    null,
}) {
  const tokenHash =
    hashToken(
      rawToken
    );

  return persistenceTransactionManager
    .run(
      async (
        transaction
      ) => {
        const client =
          transactionClient(
            transaction
          );

        if (
          !client
        ) {
          throw createError(
            "Organization invitations require PostgreSQL persistence",
            503,
            "INVITATION_POSTGRES_REQUIRED"
          );
        }

        /**
         * FOR UPDATE prevents two concurrent accept requests from consuming
         * the same invitation.
         */
        const invitationResult =
          await client.query(
            `
              SELECT *
              FROM identity.organization_invitations
              WHERE token_hash = $1
              LIMIT 1
              FOR UPDATE
            `,
            [
              tokenHash,
            ]
          );

        const invitation =
          invitationResult
            .rows[0];

        if (
          !invitation
        ) {
          throw createError(
            "Invitation is invalid",
            404,
            "INVITATION_INVALID"
          );
        }

        if (
          invitation.accepted_at
        ) {
          throw createError(
            "Invitation has already been used",
            409,
            "INVITATION_ALREADY_ACCEPTED"
          );
        }

        if (
          invitation.revoked_at ||
          invitation.superseded_at
        ) {
          throw createError(
            "Invitation is no longer active",
            410,
            "INVITATION_REVOKED"
          );
        }

        if (
          new Date(
            invitation.expires_at
          ).getTime() <=
          Date.now()
        ) {
          throw createError(
            "Invitation has expired",
            410,
            "INVITATION_EXPIRED"
          );
        }

        const organization =
          await organizationRepository
            .findOne(
              {
                _id:
                  invitation
                    .organization_id,

                status:
                  "active",
              },
              transaction
            );

        if (
          !organization
        ) {
          throw createError(
            "Organization is unavailable",
            409,
            "INVITATION_ORGANIZATION_UNAVAILABLE"
          );
        }

        let user =
          await userRepository
            .findOne(
              {
                normalizedEmail:
                  invitation
                    .normalized_email,
              },
              transaction
            );

        /**
         * Brand-new invited user.
         *
         * The possession of the invitation token proves control of the
         * invited email address.
         */
        if (
          !user
        ) {
          if (
            !fullName ||
            !password
          ) {
            throw createError(
              "fullName and password are required for a new AIRA user",
              422,
              "INVITATION_ACCOUNT_DETAILS_REQUIRED"
            );
          }

          const passwordHash =
            await hashPassword(
              password
            );

          user =
            await userRepository
              .create(
                {
                  fullName:
                    String(
                      fullName
                    )
                      .trim(),

                  email:
                    invitation
                      .normalized_email,

                  normalizedEmail:
                    invitation
                      .normalized_email,

                  status:
                    "active",

                  emailVerifiedAt:
                    new Date(),

                  primaryOrganizationId:
                    invitation
                      .organization_id,
                },
                transaction
              );

          await passwordCredentialRepository
            .create(
              {
                userId:
                  user._id,

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
        }

        let membership =
          await organizationMembershipRepository
            .findOne(
              {
                userId:
                  user._id,

                organizationId:
                  invitation
                    .organization_id,
              },
              transaction
            );

        if (
          membership &&
          membership.status ===
            "active"
        ) {
          /**
           * Make the invitation single-use even if membership was created by
           * another concurrent/admin path.
           */
          await client.query(
            `
              UPDATE identity.organization_invitations
              SET
                accepted_at = NOW(),
                accepted_by_user_id = $2,
                updated_at = NOW()
              WHERE id = $1
            `,
            [
              invitation.id,
              user._id,
            ]
          );

          return {
            organizationId:
              invitation
                .organization_id,

            userId:
              user._id,

            membershipId:
              membership._id,

            role:
              membership.role,

            alreadyMember:
              true,
          };
        }

        if (
          membership
        ) {
          await organizationMembershipRepository
            .updateOne(
              {
                _id:
                  membership._id,

                organizationId:
                  invitation
                    .organization_id,
              },
              {
                $set: {
                  role:
                    invitation.role,

                  status:
                    "active",

                  invitedByUserId:
                    invitation
                      .invited_by_user_id,

                  joinedAt:
                    new Date(),

                  suspendedAt:
                    null,
                },
              },
              {},
              transaction
            );

          membership =
            await organizationMembershipRepository
              .findById(
                membership._id,
                transaction
              );
        } else {
          membership =
            await organizationMembershipRepository
              .create(
                {
                  userId:
                    user._id,

                  organizationId:
                    invitation
                      .organization_id,

                  role:
                    invitation.role,

                  status:
                    "active",

                  invitedByUserId:
                    invitation
                      .invited_by_user_id,

                  joinedAt:
                    new Date(),

                  suspendedAt:
                    null,
                },
                transaction
              );
        }

        if (
          !user.primaryOrganizationId
        ) {
          await userRepository
            .updateOne(
              {
                _id:
                  user._id,
              },
              {
                $set: {
                  primaryOrganizationId:
                    invitation
                      .organization_id,
                },
              },
              {},
              transaction
            );
        }

        await client.query(
          `
            UPDATE identity.organization_invitations
            SET
              accepted_at = NOW(),
              accepted_by_user_id = $2,
              updated_at = NOW()
            WHERE
              id = $1
              AND accepted_at IS NULL
          `,
          [
            invitation.id,
            user._id,
          ]
        );

        return {
          organizationId:
            invitation
              .organization_id,

          userId:
            user._id,

          membershipId:
            membership._id,

          role:
            membership.role,

          alreadyMember:
            false,
        };
      }
    )
    .then(
      async (
        result
      ) => {
        await auditRecord(
          "organization_invitation_accepted",
          "success",
          {
            userId:
              result.userId,

            organizationId:
              result
                .organizationId,

            metadata: {
              membershipId:
                result
                  .membershipId,

              role:
                result.role,
            },
          }
        ).catch(
          () => {}
        );

        return result;
      }
    );
}

module.exports = {
  INVITABLE_ROLES,

  createInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  acceptInvitation,

  normalizeEmail,
  hashToken,
};