"use strict";

/**
 * ============================================================================
 * AIRA INTERNAL DEVELOPMENT TENANT SEED
 * ============================================================================
 *
 * Purpose:
 *   Create one long-lived Phase-25 -> Phase-34 development organization using
 *   AIRA's REAL identity, password and membership persistence.
 *
 * Organization:
 *   AIRA Labs Sandbox
 *
 * This is NOT:
 *   - production data
 *   - a customer tenant
 *   - execution authorization
 *   - an autonomy certification
 *
 * Delete before AIRA 1.0 GA / final Phase 34 freeze.
 * ============================================================================
 */

require("dotenv").config();

const crypto =
  require("node:crypto");

const {
  register,
} =
  require(
    "../services/identity/authService"
  );

const {
  hashPassword,
} =
  require(
    "../services/identity/passwordService"
  );

const {
  userRepository,
  passwordCredentialRepository,
  organizationMembershipRepository,
  persistenceTransactionManager,
} =
  require(
    "../persistence/repositories"
  );

const {
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );

const {
  ORGANIZATION_ROLES,
} =
  require(
    "../constants/roles"
  );

const COMPANY_NAME =
  "AIRA Labs Sandbox";

const PASSWORD =
  process.env
    .AIRA_SANDBOX_PASSWORD ||
  "AiraSandbox@2026!";

const USERS = [
  {
    fullName:
      "AIRA Sandbox Owner",

    email:
      "owner@aira-sandbox.local",

    role:
      ORGANIZATION_ROLES
        .OWNER,
  },

  {
    fullName:
      "AIRA Sandbox Administrator",

    email:
      "admin@aira-sandbox.local",

    role:
      ORGANIZATION_ROLES
        .ADMIN,
  },

  {
    fullName:
      "AIRA Sandbox Platform Engineer",

    email:
      "sre@aira-sandbox.local",

    role:
      ORGANIZATION_ROLES
        .PLATFORM_ENGINEER,
  },

  {
    fullName:
      "AIRA Sandbox Developer",

    email:
      "developer@aira-sandbox.local",

    role:
      ORGANIZATION_ROLES
        .DEVELOPER,
  },

  {
    fullName:
      "AIRA Sandbox Security Analyst",

    email:
      "security@aira-sandbox.local",

    role:
      ORGANIZATION_ROLES
        .SECURITY_ANALYST,
  },

  {
    fullName:
      "AIRA Sandbox Auditor",

    email:
      "auditor@aira-sandbox.local",

    role:
      ORGANIZATION_ROLES
        .AUDITOR,
  },

  {
    fullName:
      "AIRA Sandbox Executive Viewer",

    email:
      "executive@aira-sandbox.local",

    role:
      ORGANIZATION_ROLES
        .VIEWER,
  },
];

function normalizeEmail(
  email
) {
  return String(
    email
  )
    .trim()
    .toLowerCase();
}

async function ensureOwner() {
  const owner =
    USERS[0];

  const normalizedEmail =
    normalizeEmail(
      owner.email
    );

  const existing =
    await userRepository
      .findOne({
        normalizedEmail,
      });

  if (existing) {
    if (
      !existing
        .primaryOrganizationId
    ) {
      throw new Error(
        "Sandbox owner already exists but has no primary organization"
      );
    }

    return {
      userId:
        existing._id,

      organizationId:
        existing
          .primaryOrganizationId,

      created:
        false,
    };
  }

  /*
   * Use the real AIRA registration flow for the owner.
   *
   * This creates:
   *   user
   *   Argon2id credential
   *   organization
   *   owner membership
   *   default environment
   *   session/audit foundation
   */
  const result =
    await register(
      {
        fullName:
          owner.fullName,

        email:
          owner.email,

        password:
          PASSWORD,

        organizationName:
          COMPANY_NAME,
      },

      {
        ip:
          "127.0.0.1",

        userAgent:
          "AIRA_PHASE25_SANDBOX_SEED",
      }
    );

  /*
   * Internal seed accounts should be ready for UI testing without requiring
   * external email transport.
   */
  await userRepository
    .updateOne(
      {
        _id:
          result.user.id,
      },

      {
        $set: {
          emailVerifiedAt:
            new Date(),

          metadata: {
            internalSandbox:
              true,

            sandboxPhase:
              "25-34",

            deleteBeforeGA:
              true,

            executionAuthorized:
              false,
          },
        },
      }
    );

  return {
    userId:
      result.user.id,

    organizationId:
      result.organization.id,

    created:
      true,
  };
}

async function ensureMember(
  userDefinition,
  organizationId,
  ownerUserId
) {
  const normalizedEmail =
    normalizeEmail(
      userDefinition.email
    );

  const existing =
    await userRepository
      .findOne({
        normalizedEmail,
      });

  if (existing) {
    console.log(
      `[sandbox] KEEP ${userDefinition.email}`
    );

    return;
  }

  const passwordHash =
    await hashPassword(
      PASSWORD
    );

  await persistenceTransactionManager
    .run(
      async (
        transaction
      ) => {
        const user =
          await userRepository
            .create(
              {
                fullName:
                  userDefinition
                    .fullName,

                email:
                  userDefinition
                    .email,

                normalizedEmail,

                status:
                  "active",

                emailVerifiedAt:
                  new Date(),

                primaryOrganizationId:
                  organizationId,

                metadata: {
                  internalSandbox:
                    true,

                  sandboxPhase:
                    "25-34",

                  deleteBeforeGA:
                    true,

                  executionAuthorized:
                    false,
                },
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

        await organizationMembershipRepository
          .create(
            {
              _id:
                crypto.randomUUID(),

              userId:
                user._id,

              organizationId,

              role:
                userDefinition.role,

              status:
                "active",

              projectIds:
                [],

              invitedByUserId:
                ownerUserId,

              joinedAt:
                new Date(),

              metadata: {
                internalSandbox:
                  true,

                sandboxPhase:
                  "25-34",

                deleteBeforeGA:
                  true,
              },
            },

            transaction
          );
      }
    );

  console.log(
    `[sandbox] CREATE ${userDefinition.email} -> ${userDefinition.role}`
  );
}

async function main() {
  if (
    String(
      process.env
        .NODE_ENV ||
        "development"
    )
      .trim()
      .toLowerCase() ===
    "production"
  ) {
    throw new Error(
      "Sandbox seed is prohibited in NODE_ENV=production"
    );
  }

  if (
    String(
      process.env
        .PERSISTENCE_PROVIDER ||
        ""
    )
      .trim()
      .toLowerCase() !==
    "postgres"
  ) {
    throw new Error(
      "AIRA sandbox seed currently requires PERSISTENCE_PROVIDER=postgres"
    );
  }

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 25 — INTERNAL SANDBOX COMPANY SEED"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Company: ${COMPANY_NAME}`
  );

  console.log(
    "Environment: DEVELOPMENT ONLY"
  );

  console.log(
    "Execution authority: NONE"
  );

  console.log(
    "Delete before AIRA 1.0 GA: YES"
  );

  console.log(
    ""
  );

  const owner =
    await ensureOwner();

  console.log(
    owner.created
      ? "[sandbox] owner + company created"
      : "[sandbox] owner + company already exist"
  );

  for (
    const user
    of USERS.slice(1)
  ) {
    await ensureMember(
      user,
      owner.organizationId,
      owner.userId
    );
  }

  console.log(
    ""
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "SANDBOX LOGINS"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  for (
    const user
    of USERS
  ) {
    console.log(
      `${user.role.padEnd(20)} ${user.email}`
    );
  }

  console.log(
    ""
  );

  console.log(
    `Password: ${PASSWORD}`
  );

  console.log(
    ""
  );

  console.log(
    "PASS — sandbox organization ready"
  );

  console.log(
    "executionAuthorized=false"
  );
}

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "[sandbox] FAILED:",
        {
          code:
            error.code ||
            null,

          message:
            error.message,
        }
      );

      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      try {
        await closePostgresPool();
      } catch {
        // No-op during shutdown.
      }
    }
  );