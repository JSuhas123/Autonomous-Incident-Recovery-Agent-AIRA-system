"use strict";

require("dotenv").config();

const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );


const COMPANY_NAME =
  "AIRA Labs Sandbox";


const EXPECTED_USERS = [
  {
    email:
      "owner@aira-sandbox.local",

    role:
      "owner",
  },

  {
    email:
      "admin@aira-sandbox.local",

    role:
      "admin",
  },

  {
    email:
      "sre@aira-sandbox.local",

    role:
      "platform_engineer",
  },

  {
    email:
      "developer@aira-sandbox.local",

    role:
      "developer",
  },

  {
    email:
      "security@aira-sandbox.local",

    role:
      "security_analyst",
  },

  {
    email:
      "auditor@aira-sandbox.local",

    role:
      "auditor",
  },

  {
    email:
      "executive@aira-sandbox.local",

    role:
      "viewer",
  },
];


function pass(
  message
) {
  console.log(
    `PASS  ${message}`
  );
}


function fail(
  message
) {
  throw new Error(
    message
  );
}


async function main() {
  if (
    String(
      process.env.NODE_ENV ||
      "development"
    )
      .trim()
      .toLowerCase() ===
    "production"
  ) {
    throw new Error(
      "Sandbox certification is prohibited in production"
    );
  }


  const pool =
    getPostgresPool();


  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 25 — SANDBOX COMPANY CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Company: ${COMPANY_NAME}`
  );

  console.log(
    "Execution authority: NONE"
  );

  console.log(
    ""
  );


  /*
   * ========================================================================
   * ORGANIZATION
   * ========================================================================
   *
   * IMPORTANT:
   *
   * Current Phase-25 identity/product tenancy uses:
   *
   *     tenancy.organizations.tenant_public_id
   *
   * as the product-facing tenant identifier.
   *
   * The older UUID tenant_id column belongs to the earlier Phase-13
   * foundation and is not authoritative for the current registration path.
   */

  const orgResult =
    await pool.query(
      `
      SELECT
        id,
        public_id,
        legacy_mongo_id,
        tenant_id,
        tenant_public_id,
        name,
        slug,
        status,
        settings,
        metadata,
        created_at
      FROM tenancy.organizations
      WHERE name = $1
      ORDER BY created_at ASC
      `,
      [
        COMPANY_NAME,
      ]
    );


  if (
    orgResult.rowCount !==
    1
  ) {
    fail(
      `Expected exactly one ${COMPANY_NAME} organization, found ${orgResult.rowCount}`
    );
  }


  const organization =
    orgResult.rows[0];


  pass(
    "exactly one sandbox organization"
  );


  if (
    organization.status !==
    "active"
  ) {
    fail(
      `Sandbox organization is not active: ${organization.status}`
    );
  }


  pass(
    "sandbox organization ACTIVE"
  );


  if (
    !organization.public_id
  ) {
    fail(
      "Sandbox organization has no public_id"
    );
  }


  pass(
    "organization public identity present"
  );


  if (
    !organization.tenant_public_id
  ) {
    fail(
      "Sandbox organization has no tenant_public_id"
    );
  }


  pass(
    `authoritative product tenant identity present: ${organization.tenant_public_id}`
  );


  if (
    !organization.slug
  ) {
    fail(
      "Sandbox organization has no slug"
    );
  }


  pass(
    `organization slug present: ${organization.slug}`
  );


  /*
   * Do not require legacy UUID tenant_id.
   *
   * It may legitimately be NULL for identities created by the current
   * PostgreSQL auth repository because PostgresOrganizationRepository maps
   * tenantId -> tenant_public_id.
   */

  if (
    organization.tenant_id
  ) {
    pass(
      "legacy UUID tenant binding also present"
    );
  } else {
    pass(
      "legacy UUID tenant binding not required by current Phase-25 product tenancy contract"
    );
  }


  /*
   * ========================================================================
   * TENANT CONFIG
   * ========================================================================
   */

  const tenantConfigResult =
    await pool.query(
      `
      SELECT
        id,
        tenant_id,
        tenant_public_id,
        name,
        status,
        settings,
        created_at
      FROM tenancy.tenant_configs
      WHERE tenant_public_id = $1
      `,
      [
        organization
          .tenant_public_id,
      ]
    );


  if (
    tenantConfigResult.rowCount !==
    1
  ) {
    fail(
      `Expected exactly one tenant_config for ${organization.tenant_public_id}, found ${tenantConfigResult.rowCount}`
    );
  }


  const tenantConfig =
    tenantConfigResult.rows[0];


  if (
    tenantConfig.status !==
    "active"
  ) {
    fail(
      `Sandbox tenant_config is not active: ${tenantConfig.status}`
    );
  }


  pass(
    "tenant configuration exists and is ACTIVE"
  );


  if (
    tenantConfig.tenant_public_id !==
    organization.tenant_public_id
  ) {
    fail(
      "Organization and tenant configuration tenant identities differ"
    );
  }


  pass(
    "organization ↔ tenant configuration identity consistent"
  );


  /*
   * ========================================================================
   * ENVIRONMENTS
   * ========================================================================
   */

  const environmentResult =
    await pool.query(
      `
      SELECT
        id,
        public_id,
        legacy_mongo_id,
        organization_id,
        tenant_id,
        name,
        slug,
        environment_type,
        status,
        criticality,
        description,
        settings,
        metadata,
        created_at
      FROM tenancy.environments
      WHERE organization_id = $1
      ORDER BY created_at ASC
      `,
      [
        organization.id,
      ]
    );


  if (
    environmentResult.rowCount <
    1
  ) {
    fail(
      "Sandbox organization has no environment"
    );
  }


  pass(
    `${environmentResult.rowCount} environment(s) belong to sandbox organization`
  );


  const developmentEnvironment =
    environmentResult.rows
      .find(
        (
          environment
        ) =>
          environment.slug ===
            "development" ||
          environment.environment_type ===
            "development"
      );


  if (
    !developmentEnvironment
  ) {
    fail(
      "Canonical Development environment is missing"
    );
  }


  pass(
    "canonical Development environment present"
  );


  if (
    developmentEnvironment.status !==
    "active"
  ) {
    fail(
      `Development environment is not active: ${developmentEnvironment.status}`
    );
  }


  pass(
    "Development environment ACTIVE"
  );


  /*
   * The organization bootstrap intentionally disables autonomous execution
   * in the development environment.
   */

  const environmentSettings =
    developmentEnvironment.settings ||
    {};


  if (
    environmentSettings
      .allowAutonomousExecution ===
    true
  ) {
    fail(
      "Sandbox Development environment unexpectedly permits autonomous execution"
    );
  }


  pass(
    "Development autonomous execution disabled"
  );


  if (
    environmentSettings
      .requireApprovalForDestructiveActions !==
    true
  ) {
    fail(
      "Sandbox Development environment does not require approval for destructive actions"
    );
  }


  pass(
    "destructive actions require approval"
  );


  /*
   * ========================================================================
   * DEFAULT ENVIRONMENT BINDING
   * ========================================================================
   */

  const organizationSettings =
    organization.settings ||
    {};


  const defaultEnvironmentId =
    organizationSettings
      .defaultEnvironmentId;


  if (
    !defaultEnvironmentId
  ) {
    fail(
      "Organization has no defaultEnvironmentId"
    );
  }


  const defaultEnvironmentMatches =
    environmentResult.rows
      .some(
        (
          environment
        ) =>
          String(
            environment.public_id ||
            environment.legacy_mongo_id ||
            environment.id
          ) ===
          String(
            defaultEnvironmentId
          )
      );


  if (
    !defaultEnvironmentMatches
  ) {
    fail(
      "Organization defaultEnvironmentId does not resolve to one of its environments"
    );
  }


  pass(
    "default environment binding resolves correctly"
  );


  /*
   * ========================================================================
   * ROLE MATRIX
   * ========================================================================
   */

  for (
    const expected
    of EXPECTED_USERS
  ) {
    const result =
      await pool.query(
        `
        SELECT
          u.id,
          u.public_id,
          u.email,
          u.normalized_email,
          u.status AS user_status,
          u.email_verified_at,
          u.primary_organization_id,

          m.id AS membership_id,
          m.role,
          m.status AS membership_status,
          m.organization_id

        FROM identity.users u

        JOIN identity.organization_memberships m
          ON m.user_id = u.id

        WHERE
          u.normalized_email = LOWER($1)
          AND m.organization_id = $2
        `,
        [
          expected.email,
          organization.id,
        ]
      );


    if (
      result.rowCount !==
      1
    ) {
      fail(
        `${expected.email}: expected one sandbox membership, found ${result.rowCount}`
      );
    }


    const row =
      result.rows[0];


    if (
      row.user_status !==
      "active"
    ) {
      fail(
        `${expected.email}: user is not active`
      );
    }


    if (
      row.membership_status !==
      "active"
    ) {
      fail(
        `${expected.email}: membership is not active`
      );
    }


    if (
      row.role !==
      expected.role
    ) {
      fail(
        `${expected.email}: expected role ${expected.role}, got ${row.role}`
      );
    }


    if (
      !row.email_verified_at
    ) {
      fail(
        `${expected.email}: sandbox identity is not email-verified`
      );
    }


    if (
      String(
        row.primary_organization_id
      ) !==
      String(
        organization.id
      )
    ) {
      fail(
        `${expected.email}: primary organization mismatch`
      );
    }


    pass(
      `${expected.email} -> ${expected.role}`
    );
  }


  /*
   * ========================================================================
   * PASSWORD CREDENTIALS
   * ========================================================================
   */

  const credentialResult =
    await pool.query(
      `
      SELECT
        COUNT(*)::int AS total,

        COUNT(*) FILTER (
          WHERE pc.algorithm = 'argon2id'
        )::int AS argon2id_total

      FROM identity.password_credentials pc

      JOIN identity.users u
        ON u.id = pc.user_id

      WHERE u.normalized_email LIKE '%@aira-sandbox.local'
      `
    );


  const credentialSummary =
    credentialResult.rows[0];


  if (
    credentialSummary.total !==
    EXPECTED_USERS.length
  ) {
    fail(
      `Expected ${EXPECTED_USERS.length} sandbox password credentials, found ${credentialSummary.total}`
    );
  }


  if (
    credentialSummary.argon2id_total !==
    EXPECTED_USERS.length
  ) {
    fail(
      "Not all sandbox credentials use Argon2id"
    );
  }


  pass(
    "all sandbox credentials use Argon2id"
  );


  /*
   * ========================================================================
   * DUPLICATE IDENTITY CHECK
   * ========================================================================
   */

  const duplicateEmailResult =
    await pool.query(
      `
      SELECT
        normalized_email,
        COUNT(*)::int AS count

      FROM identity.users

      WHERE normalized_email LIKE '%@aira-sandbox.local'

      GROUP BY normalized_email

      HAVING COUNT(*) > 1
      `
    );


  if (
    duplicateEmailResult.rowCount !==
    0
  ) {
    fail(
      "Duplicate sandbox identities detected"
    );
  }


  pass(
    "no duplicate sandbox identities"
  );


  /*
   * ========================================================================
   * EXACT SANDBOX USER COUNT
   * ========================================================================
   */

  const sandboxUserCountResult =
    await pool.query(
      `
      SELECT
        COUNT(*)::int AS count

      FROM identity.users

      WHERE normalized_email LIKE '%@aira-sandbox.local'
      `
    );


  if (
    sandboxUserCountResult.rows[0]
      .count !==
    EXPECTED_USERS.length
  ) {
    fail(
      `Expected ${EXPECTED_USERS.length} persistent sandbox users, found ${sandboxUserCountResult.rows[0].count}`
    );
  }


  pass(
    `exactly ${EXPECTED_USERS.length} persistent sandbox identities`
  );


  /*
   * ========================================================================
   * TEMPORARY 25.2H USER CLEANUP CHECK
   * ========================================================================
   */

  const temporaryCertificationUsers =
    await pool.query(
      `
      SELECT
        COUNT(*)::int AS count

      FROM identity.users

      WHERE
        normalized_email LIKE 'phase25-cert-%@aira-sandbox.local'
      `
    );


  if (
    temporaryCertificationUsers
      .rows[0]
      .count !==
    0
  ) {
    fail(
      `${temporaryCertificationUsers.rows[0].count} temporary Phase-25.2H certification user(s) remain`
    );
  }


  pass(
    "temporary Phase-25.2H identities cleaned up"
  );


  /*
   * ========================================================================
   * FINAL CERTIFICATE
   * ========================================================================
   */

  console.log(
    ""
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "SANDBOX CERTIFICATION"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Organization ID: ${
      organization.public_id ||
      organization.id
    }`
  );

  console.log(
    `Tenant public ID: ${organization.tenant_public_id}`
  );

  console.log(
    `Legacy tenant UUID: ${organization.tenant_id || "NOT REQUIRED"}`
  );

  console.log(
    `Users: ${EXPECTED_USERS.length}`
  );

  console.log(
    `Environments: ${environmentResult.rowCount}`
  );

  console.log(
    `Development environment: ${
      developmentEnvironment.public_id ||
      developmentEnvironment.id
    }`
  );

  console.log(
    "Production customer: false"
  );

  console.log(
    "Autonomous execution: false"
  );

  console.log(
    "Execution authority: false"
  );

  console.log(
    "Delete before AIRA 1.0 GA: true"
  );

  console.log(
    ""
  );

  console.log(
    "PASS — AIRA Labs Sandbox certified"
  );
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        "[sandbox-certification] FAILED:",
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
        // Nothing further.
      }
    }
  );