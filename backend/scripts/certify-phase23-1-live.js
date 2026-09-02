"use strict";

/**
 * ============================================================================
 * AIRA PHASE 23.1E
 * LIVE HUMAN TAKEOVER POSTGRESQL CERTIFICATION
 * ============================================================================
 *
 * SAFETY LAWS
 * -----------
 *
 * HUMAN TAKEOVER != EXECUTION AUTHORIZATION
 * ASSIGNMENT != CONTROL
 * ACKNOWLEDGEMENT != CONTROL
 * CONTROL LEASE != PERMANENT AUTHORITY
 * LEASE EXPIRY / RELEASE => FRESH RE-EVALUATION
 * STALE PLAN RESUME: PROHIBITED
 *
 * RLS CERTIFICATION LAW
 * ---------------------
 *
 * Tenant isolation MUST be tested through a PostgreSQL role that is:
 *
 *   NOSUPERUSER
 *   NOBYPASSRLS
 *
 * Testing RLS through a superuser would produce a false failure because
 * PostgreSQL superusers intentionally bypass row-level security.
 *
 * The temporary certification role created here:
 *
 *   - cannot login directly;
 *   - is not superuser;
 *   - cannot bypass RLS;
 *   - receives only the minimum schema/table privileges required;
 *   - is removed after the certification run.
 *
 * This script performs NO infrastructure recovery action.
 * ============================================================================
 */


const path =
  require(
    "node:path"
  );


require(
  "dotenv"
).config({
  path:
    path.resolve(
      __dirname,
      "../.env"
    ),
});


const crypto =
  require(
    "node:crypto"
  );


const {
  getPostgresPool,
  closePostgresPool,
} = require(
  "../persistence/postgres"
);


const PostgresTenantScope =
  require(
    "../persistence/postgres/PostgresTenantScope"
  );


const PostgresHumanOperationsRepository =
  require(
    "../persistence/postgres/PostgresHumanOperationsRepository"
  );


const PostgresHumanTakeoverRepository =
  require(
    "../persistence/postgres/PostgresHumanTakeoverRepository"
  );


const {
  HumanTakeoverLifecycleService,
} = require(
  "../services/humanOperations/humanTakeoverLifecycleService"
);


const {
  HUMAN_TASK_STATUS,
  TAKEOVER_SESSION_STATUS,
  CONTROL_LEASE_STATUS,
} = require(
  "../constants/humanTakeover"
);


/*
 * ============================================================================
 * CONFIGURATION
 * ============================================================================
 */

const CONFIG =
  Object.freeze({
    organizationId:
      process.env
        .PHASE23_ORGANIZATION_ID ||
      "aira-dev-org",

    environmentId:
      process.env
        .PHASE23_ENVIRONMENT_ID ||
      "env_aira_development",
  });


const REQUIRED_TABLES =
  Object.freeze([
    "tasks",
    "assignments",
    "acknowledgements",
    "resolutions",
    "takeover_sessions",
    "control_leases",
    "task_status_history",
    "takeover_events",
  ]);


/*
 * ============================================================================
 * GENERIC HELPERS
 * ============================================================================
 */

function pass(
  label,
  details = ""
) {
  console.log(
    `PASS  ${label}${
      details
        ? ` — ${details}`
        : ""
    }`
  );
}


function fail(
  label,
  details = ""
) {
  console.error(
    `FAIL  ${label}${
      details
        ? ` — ${details}`
        : ""
    }`
  );
}


function assertCondition(
  condition,
  code,
  message
) {
  if (
    condition
  ) {
    return;
  }


  throw Object.assign(
    new Error(
      message
    ),
    {
      code,
    }
  );
}


function randomPublicId(
  prefix
) {
  return [
    prefix,
    crypto
      .randomBytes(
        10
      )
      .toString(
        "hex"
      ),
  ].join(
    "_"
  );
}


function quoteIdentifier(
  value
) {
  return `"${String(
    value
  ).replace(
    /"/g,
    '""'
  )}"`;
}


/*
 * ============================================================================
 * CANONICAL TENANT RESOLUTION
 * ============================================================================
 */

async function resolveCanonicalScope(
  pool
) {
  const result =
    await pool.query(
      `
        SELECT
          o.id
            AS organization_uuid,

          o.public_id
            AS organization_public_id,

          e.id
            AS environment_uuid,

          e.public_id
            AS environment_public_id

        FROM
          tenancy.organizations o

        JOIN
          tenancy.environments e
        ON
          e.organization_id =
            o.id

        WHERE
          o.public_id = $1

          AND
          e.public_id = $2

        LIMIT 1
      `,
      [
        CONFIG.organizationId,
        CONFIG.environmentId,
      ]
    );


  assertCondition(
    result.rows.length ===
      1,

    "PHASE23_SCOPE_NOT_FOUND",

    [
      "Phase 23 certification organization/environment",
      "could not be resolved.",
      `organization=${CONFIG.organizationId}`,
      `environment=${CONFIG.environmentId}`,
    ].join(
      " "
    )
  );


  return result.rows[0];
}


/*
 * ============================================================================
 * CONNECTION ROLE INSPECTION
 * ============================================================================
 */

async function inspectCurrentRole(
  pool
) {
  const result =
    await pool.query(
      `
        SELECT
          r.rolname,
          r.rolsuper,
          r.rolbypassrls

        FROM
          pg_roles r

        WHERE
          r.rolname =
            current_user
      `
    );


  assertCondition(
    Boolean(
      result.rows[0]
    ),

    "PHASE23_DATABASE_ROLE_NOT_FOUND",

    "Current PostgreSQL role could not be inspected"
  );


  return result.rows[0];
}


/*
 * ============================================================================
 * HARDENED RLS CERTIFICATION ROLE
 * ============================================================================
 */

async function createRlsCertificationRole(
  pool
) {
  const suffix =
    crypto
      .randomBytes(
        6
      )
      .toString(
        "hex"
      );


  const roleName =
    `aira_phase23_rls_${suffix}`;


  const quotedRole =
    quoteIdentifier(
      roleName
    );


  const client =
    await pool.connect();


  try {
    await client.query(
      "BEGIN"
    );


    /*
     * NOLOGIN prevents this role from becoming an independent
     * database credential.
     */
    await client.query(
      `
        CREATE ROLE
          ${quotedRole}

        NOLOGIN
        NOSUPERUSER
        NOCREATEDB
        NOCREATEROLE
        NOINHERIT
        NOREPLICATION
        NOBYPASSRLS
      `
    );


    /*
     * Allow the current certification connection to SET ROLE.
     */
    await client.query(
      `
        GRANT
          ${quotedRole}
        TO
          CURRENT_USER
      `
    );


    /*
     * Minimum schema visibility.
     */
    await client.query(
      `
        GRANT USAGE
        ON SCHEMA
          human_operations
        TO
          ${quotedRole}
      `
    );


    /*
     * RLS probes only need SELECT + UPDATE on tasks.
     */
    await client.query(
      `
        GRANT
          SELECT,
          UPDATE
        ON
          human_operations.tasks
        TO
          ${quotedRole}
      `
    );


    await client.query(
      "COMMIT"
    );


    return {
      roleName,
      quotedRole,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch {
      // Best effort.
    }


    throw error;
  } finally {
    client.release();
  }
}


async function certifyRlsRole({
  pool,
  roleName,
}) {
  const result =
    await pool.query(
      `
        SELECT
          rolname,
          rolsuper,
          rolbypassrls,
          rolcanlogin

        FROM
          pg_roles

        WHERE
          rolname = $1
      `,
      [
        roleName,
      ]
    );


  const role =
    result.rows[0];


  assertCondition(
    Boolean(
      role
    ),

    "PHASE23_RLS_ROLE_MISSING",

    "Phase 23 RLS certification role was not created"
  );


  assertCondition(
    role.rolsuper ===
      false,

    "PHASE23_RLS_ROLE_SUPERUSER",

    "Phase 23 RLS certification role is unexpectedly a superuser"
  );


  assertCondition(
    role.rolbypassrls ===
      false,

    "PHASE23_RLS_ROLE_BYPASS",

    "Phase 23 RLS certification role can bypass row-level security"
  );


  assertCondition(
    role.rolcanlogin ===
      false,

    "PHASE23_RLS_ROLE_LOGIN_ENABLED",

    "Temporary RLS certification role unexpectedly permits direct login"
  );


  pass(
    "RLS certification role",
    "NOSUPERUSER / NOBYPASSRLS / NOLOGIN"
  );


  return role;
}


async function cleanupRlsCertificationRole({
  pool,
  role,
}) {
  if (
    !role
      ?.roleName
  ) {
    return;
  }


  const quotedRole =
    quoteIdentifier(
      role.roleName
    );


  const client =
    await pool.connect();


  try {
    await client.query(
      "BEGIN"
    );


    await client.query(
      `
        REVOKE
          SELECT,
          UPDATE
        ON
          human_operations.tasks
        FROM
          ${quotedRole}
      `
    );


    await client.query(
      `
        REVOKE USAGE
        ON SCHEMA
          human_operations
        FROM
          ${quotedRole}
      `
    );


    await client.query(
      `
        REVOKE
          ${quotedRole}
        FROM
          CURRENT_USER
      `
    );


    await client.query(
      `
        DROP ROLE
          ${quotedRole}
      `
    );


    await client.query(
      "COMMIT"
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch {
      // Best effort.
    }


    throw error;
  } finally {
    client.release();
  }
}


/*
 * ============================================================================
 * OPERATOR RESOLUTION
 * ============================================================================
 */

async function resolveOperator(
  pool,
  organizationUuid
) {
  const activeResult =
    await pool.query(
      `
        SELECT
          m.id
            AS membership_id,

          m.user_id,

          m.role,

          m.status,

          FALSE
            AS certification_fixture,

          NULL::uuid
            AS certification_user_id,

          NULL::uuid
            AS certification_membership_id

        FROM
          identity.organization_memberships m

        WHERE
          m.organization_id = $1

          AND
          m.status = 'active'

        ORDER BY
          m.joined_at ASC NULLS LAST,
          m.created_at ASC

        LIMIT 1
      `,
      [
        organizationUuid,
      ]
    );


  if (
    activeResult.rows[0]
  ) {
    return activeResult.rows[0];
  }


  const existingResult =
    await pool.query(
      `
        SELECT
          m.id
            AS membership_id,

          m.user_id,

          m.role,

          m.status,

          FALSE
            AS certification_fixture,

          NULL::uuid
            AS certification_user_id,

          NULL::uuid
            AS certification_membership_id

        FROM
          identity.organization_memberships m

        WHERE
          m.organization_id = $1

        ORDER BY
          m.created_at ASC

        LIMIT 1
      `,
      [
        organizationUuid,
      ]
    );


  if (
    existingResult.rows[0]
  ) {
    return existingResult.rows[0];
  }


  /*
   * Local development database has no canonical PostgreSQL
   * membership for this organization.
   *
   * Create an explicit temporary certification actor.
   */
  const suffix =
    crypto
      .randomBytes(
        8
      )
      .toString(
        "hex"
      );


  const userPublicId =
    `phase23_cert_user_${suffix}`;


  const membershipPublicId =
    `phase23_cert_membership_${suffix}`;


  const email =
    `phase23-cert-${suffix}@aira.invalid`;


  const client =
    await pool.connect();


  try {
    await client.query(
      "BEGIN"
    );


    const userResult =
      await client.query(
        `
          INSERT INTO
            identity.users (
              public_id,
              full_name,
              email,
              normalized_email,
              status,
              email_verified_at,
              primary_organization_id,
              metadata
            )

          VALUES (
            $1,
            $2,
            $3,
            $3,
            'active',
            NOW(),
            $4,
            $5::jsonb
          )

          RETURNING
            id,
            public_id
        `,
        [
          userPublicId,

          "Phase 23 Certification Operator",

          email,

          organizationUuid,

          JSON.stringify({
            certificationFixture:
              true,

            phase:
              "23.1E",

            temporary:
              true,

            executionAuthorized:
              false,
          }),
        ]
      );


    const user =
      userResult.rows[0];


    assertCondition(
      Boolean(
        user
          ?.id
      ),

      "PHASE23_CERT_OPERATOR_CREATE_FAILED",

      "Temporary Phase 23 certification user was not created"
    );


    const membershipResult =
      await client.query(
        `
          INSERT INTO
            identity.organization_memberships (
              public_id,
              user_id,
              organization_id,
              role,
              status,
              joined_at,
              metadata
            )

          VALUES (
            $1,
            $2,
            $3,
            'admin',
            'active',
            NOW(),
            $4::jsonb
          )

          RETURNING
            id,
            user_id,
            role,
            status
        `,
        [
          membershipPublicId,

          user.id,

          organizationUuid,

          JSON.stringify({
            certificationFixture:
              true,

            phase:
              "23.1E",

            temporary:
              true,

            executionAuthorized:
              false,
          }),
        ]
      );


    const membership =
      membershipResult.rows[0];


    assertCondition(
      Boolean(
        membership
          ?.id
      ),

      "PHASE23_CERT_MEMBERSHIP_CREATE_FAILED",

      "Temporary Phase 23 certification membership was not created"
    );


    await client.query(
      "COMMIT"
    );


    return {
      membership_id:
        membership.id,

      user_id:
        membership.user_id,

      role:
        membership.role,

      status:
        membership.status,

      certification_fixture:
        true,

      certification_user_id:
        user.id,

      certification_membership_id:
        membership.id,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch {
      // Best effort.
    }


    throw error;
  } finally {
    client.release();
  }
}


/*
 * ============================================================================
 * SCHEMA CERTIFICATION
 * ============================================================================
 */

async function certifySchema(
  pool
) {
  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "POSTGRESQL HUMAN OPERATIONS SCHEMA"
  );

  console.log(
    "--------------------------------------------------------------"
  );


  const relationResult =
    await pool.query(
      `
        SELECT
          c.relname
            AS table_name,

          c.relrowsecurity
            AS rls_enabled,

          c.relforcerowsecurity
            AS rls_forced

        FROM
          pg_class c

        JOIN
          pg_namespace n
        ON
          n.oid =
            c.relnamespace

        WHERE
          n.nspname =
            'human_operations'

          AND
          c.relname =
            ANY($1::text[])

        ORDER BY
          c.relname
      `,
      [
        REQUIRED_TABLES,
      ]
    );


  const relationByName =
    new Map(
      relationResult.rows.map(
        (
          row
        ) => [
          row.table_name,
          row,
        ]
      )
    );


  for (
    const tableName
    of REQUIRED_TABLES
  ) {
    const row =
      relationByName.get(
        tableName
      );


    assertCondition(
      Boolean(
        row
      ),

      "PHASE23_TABLE_MISSING",

      `human_operations.${tableName} is missing`
    );


    assertCondition(
      row.rls_enabled ===
        true,

      "PHASE23_RLS_NOT_ENABLED",

      `RLS is not enabled on human_operations.${tableName}`
    );


    assertCondition(
      row.rls_forced ===
        true,

      "PHASE23_RLS_NOT_FORCED",

      `RLS is not forced on human_operations.${tableName}`
    );


    pass(
      `${tableName} RLS`,
      "ENABLED + FORCED"
    );
  }


  const executionColumnResult =
    await pool.query(
      `
        SELECT
          table_name,
          column_default,
          is_nullable

        FROM
          information_schema.columns

        WHERE
          table_schema =
            'human_operations'

          AND
          table_name =
            ANY($1::text[])

          AND
          column_name =
            'execution_authorized'
      `,
      [
        REQUIRED_TABLES,
      ]
    );


  const columnByTable =
    new Map(
      executionColumnResult.rows.map(
        (
          row
        ) => [
          row.table_name,
          row,
        ]
      )
    );


  for (
    const tableName
    of REQUIRED_TABLES
  ) {
    const row =
      columnByTable.get(
        tableName
      );


    assertCondition(
      Boolean(
        row
      ),

      "PHASE23_EXECUTION_COLUMN_MISSING",

      `execution_authorized missing from human_operations.${tableName}`
    );


    assertCondition(
      row.is_nullable ===
        "NO",

      "PHASE23_EXECUTION_COLUMN_NULLABLE",

      `execution_authorized is nullable on human_operations.${tableName}`
    );


    assertCondition(
      String(
        row.column_default ||
        ""
      )
        .toLowerCase()
        .includes(
          "false"
        ),

      "PHASE23_EXECUTION_DEFAULT_UNSAFE",

      `execution_authorized does not default FALSE on human_operations.${tableName}`
    );


    pass(
      `${tableName} authority boundary`,
      "execution_authorized DEFAULT FALSE"
    );
  }
}


/*
 * ============================================================================
 * HARDENED-RLS EXECUTION HELPER
 * ============================================================================
 */

async function runAsRlsRole({
  pool,
  roleName,
  organizationUuid,
  environmentUuid,
  work,
}) {
  const client =
    await pool.connect();


  const quotedRole =
    quoteIdentifier(
      roleName
    );


  try {
    await client.query(
      "BEGIN"
    );


    /*
     * IMPORTANT:
     *
     * SET LOCAL ROLE changes current_user to the hardened
     * NOSUPERUSER/NOBYPASSRLS certification role.
     *
     * RLS is therefore genuinely enforced.
     */
    await client.query(
      `
        SET LOCAL ROLE
          ${quotedRole}
      `
    );


    const roleCheck =
      await client.query(
        `
          SELECT
            current_user
              AS current_user,

            session_user
              AS session_user
        `
      );


    assertCondition(
      roleCheck
        .rows[0]
        .current_user ===
        roleName,

      "PHASE23_RLS_SET_ROLE_FAILED",

      [
        "SET LOCAL ROLE did not activate",
        "the hardened Phase 23 RLS role.",
      ].join(
        " "
      )
    );


    await client.query(
      `
        SELECT
          set_config(
            'aira.organization_id',
            $1,
            true
          ),

          set_config(
            'aira.environment_id',
            $2,
            true
          )
      `,
      [
        organizationUuid,
        environmentUuid,
      ]
    );


    const result =
      await work(
        client
      );


    await client.query(
      "ROLLBACK"
    );


    return result;
  } catch (
    error
  ) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch {
      // Best effort.
    }


    throw error;
  } finally {
    client.release();
  }
}


/*
 * ============================================================================
 * RLS CANARIES
 * ============================================================================
 */

async function sourceScopeReadCount({
  pool,
  roleName,
  organizationUuid,
  environmentUuid,
  taskDatabaseId,
}) {
  return runAsRlsRole({
    pool,
    roleName,
    organizationUuid,
    environmentUuid,

    work:
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT
                COUNT(*)::integer
                  AS count

              FROM
                human_operations.tasks

              WHERE
                id = $1
            `,
            [
              taskDatabaseId,
            ]
          );


        return Number(
          result.rows[0]
            ?.count ||
          0
        );
      },
  });
}


async function foreignScopeReadCount({
  pool,
  roleName,
  taskDatabaseId,
}) {
  return runAsRlsRole({
    pool,
    roleName,

    organizationUuid:
      crypto.randomUUID(),

    environmentUuid:
      crypto.randomUUID(),

    work:
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT
                COUNT(*)::integer
                  AS count

              FROM
                human_operations.tasks

              WHERE
                id = $1
            `,
            [
              taskDatabaseId,
            ]
          );


        return Number(
          result.rows[0]
            ?.count ||
          0
        );
      },
  });
}


async function foreignScopeUpdateCount({
  pool,
  roleName,
  taskDatabaseId,
}) {
  return runAsRlsRole({
    pool,
    roleName,

    organizationUuid:
      crypto.randomUUID(),

    environmentUuid:
      crypto.randomUUID(),

    work:
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              UPDATE
                human_operations.tasks

              SET
                title =
                  'PHASE23_FOREIGN_SCOPE_SHOULD_NOT_WRITE'

              WHERE
                id = $1
            `,
            [
              taskDatabaseId,
            ]
          );


        return Number(
          result.rowCount ||
          0
        );
      },
  });
}


/*
 * ============================================================================
 * DATABASE EXECUTION-AUTHORITY FENCE
 * ============================================================================
 */

async function certifyDatabaseAuthorityFence({
  scope,
  taskId,
}) {
  let blocked =
    false;


  try {
    await scope.run(
      {
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,
      },

      async (
        client
      ) => {
        await client.query(
          `
            UPDATE
              human_operations.tasks

            SET
              execution_authorized =
                TRUE

            WHERE
              public_id = $1
              OR
              id::text = $1
          `,
          [
            String(
              taskId
            ),
          ]
        );
      }
    );
  } catch (
    error
  ) {
    blocked =
      error?.code ===
        "23514" ||
      error?.code ===
        "42501" ||
      /execution_authorized/i.test(
        String(
          error?.message ||
          ""
        )
      ) ||
      /authorize/i.test(
        String(
          error?.message ||
          ""
        )
      );
  }


  assertCondition(
    blocked,

    "PHASE23_DATABASE_AUTHORITY_FENCE_FAILED",

    [
      "PostgreSQL allowed human takeover state",
      "to set execution_authorized=true.",
    ].join(
      " "
    )
  );


  pass(
    "Database execution-authority fence",
    "TRUE rejected"
  );
}


/*
 * ============================================================================
 * HUMAN OPERATIONS CLEANUP
 * ============================================================================
 */

async function cleanup({
  scope,
  incidentId,
  taskDatabaseId,
}) {
  await scope.run(
    {
      organizationId:
        CONFIG.organizationId,

      environmentId:
        CONFIG.environmentId,
    },

    async (
      client
    ) => {
      await client.query(
        `
          DELETE FROM
            human_operations.takeover_events

          WHERE
            incident_id = $1
        `,
        [
          incidentId,
        ]
      );


      await client.query(
        `
          DELETE FROM
            human_operations.control_leases

          WHERE
            incident_id = $1
        `,
        [
          incidentId,
        ]
      );


      await client.query(
        `
          DELETE FROM
            human_operations.takeover_sessions

          WHERE
            incident_id = $1
        `,
        [
          incidentId,
        ]
      );


      if (
        !taskDatabaseId
      ) {
        return;
      }


      await client.query(
        `
          DELETE FROM
            human_operations.task_status_history

          WHERE
            task_id = $1
        `,
        [
          taskDatabaseId,
        ]
      );


      await client.query(
        `
          DELETE FROM
            human_operations.acknowledgements

          WHERE
            task_id = $1
        `,
        [
          taskDatabaseId,
        ]
      );


      await client.query(
        `
          DELETE FROM
            human_operations.resolutions

          WHERE
            task_id = $1
        `,
        [
          taskDatabaseId,
        ]
      );


      await client.query(
        `
          DELETE FROM
            human_operations.assignments

          WHERE
            task_id = $1
        `,
        [
          taskDatabaseId,
        ]
      );


      await client.query(
        `
          DELETE FROM
            human_operations.tasks

          WHERE
            id = $1
        `,
        [
          taskDatabaseId,
        ]
      );
    }
  );
}


/*
 * ============================================================================
 * TEMPORARY OPERATOR CLEANUP
 * ============================================================================
 */

async function cleanupCertificationOperator({
  pool,
  operator,
}) {
  if (
    !operator
      ?.certification_fixture
  ) {
    return;
  }


  const client =
    await pool.connect();


  try {
    await client.query(
      "BEGIN"
    );


    if (
      operator
        .certification_membership_id
    ) {
      await client.query(
        `
          DELETE FROM
            identity.organization_memberships

          WHERE
            id = $1
        `,
        [
          operator
            .certification_membership_id,
        ]
      );
    }


    if (
      operator
        .certification_user_id
    ) {
      await client.query(
        `
          DELETE FROM
            identity.users

          WHERE
            id = $1

            AND
            metadata
              ->> 'certificationFixture'
              = 'true'
        `,
        [
          operator
            .certification_user_id,
        ]
      );
    }


    await client.query(
      "COMMIT"
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch {
      // Best effort.
    }


    throw error;
  } finally {
    client.release();
  }
}


/*
 * ============================================================================
 * FINAL EXECUTION AUTHORITY AUDIT
 * ============================================================================
 */

async function countExecutionAuthorityRows({
  scope,
  incidentId,
}) {
  return scope.run(
    {
      organizationId:
        CONFIG.organizationId,

      environmentId:
        CONFIG.environmentId,
    },

    async (
      client
    ) => {
      const result =
        await client.query(
          `
            SELECT
              (
                SELECT COUNT(*)
                FROM human_operations.tasks
                WHERE
                  incident_id = $1
                  AND execution_authorized = TRUE
              )
              +
              (
                SELECT COUNT(*)
                FROM human_operations.takeover_sessions
                WHERE
                  incident_id = $1
                  AND execution_authorized = TRUE
              )
              +
              (
                SELECT COUNT(*)
                FROM human_operations.control_leases
                WHERE
                  incident_id = $1
                  AND execution_authorized = TRUE
              )
              +
              (
                SELECT COUNT(*)
                FROM human_operations.takeover_events
                WHERE
                  incident_id = $1
                  AND execution_authorized = TRUE
              )
              AS authority_count
          `,
          [
            incidentId,
          ]
        );


      return Number(
        result.rows[0]
          ?.authority_count ||
        0
      );
    }
  );
}


/*
 * ============================================================================
 * MAIN
 * ============================================================================
 */

async function main() {
  console.log("");
  console.log(
    "=============================================================="
  );
  console.log(
    "AIRA PHASE 23.1E — LIVE HUMAN TAKEOVER CERTIFICATION"
  );
  console.log(
    "=============================================================="
  );
  console.log(
    "HUMAN TAKEOVER != EXECUTION AUTHORIZATION"
  );
  console.log(
    "ASSIGNMENT != CONTROL"
  );
  console.log(
    "ACKNOWLEDGEMENT != CONTROL"
  );
  console.log(
    "CONTROL LEASE != PERMANENT AUTHORITY"
  );
  console.log(
    "LEASE EXPIRY / RELEASE => FRESH RE-EVALUATION"
  );
  console.log(
    "STALE PLAN RESUME: PROHIBITED"
  );
  console.log("");


  const pool =
    getPostgresPool();


  const scope =
    new PostgresTenantScope({
      pool,
    });


  const humanRepository =
    new PostgresHumanOperationsRepository({
      scope,
    });


  const takeoverRepository =
    new PostgresHumanTakeoverRepository({
      scope,
    });


  const lifecycleService =
    new HumanTakeoverLifecycleService({
      humanOperationsRepository:
        humanRepository,

      takeoverRepository:
        takeoverRepository,
    });


  const incidentId =
    randomPublicId(
      "phase23_incident"
    );


  let task =
    null;


  let operator =
    null;


  let rlsRole =
    null;


  let primaryFailure =
    null;


  try {
    /*
     * ------------------------------------------------------------------------
     * DATABASE CONNECTION
     * ------------------------------------------------------------------------
     */

    const health =
      await pool.query(
        `
          SELECT
            current_database()
              AS database,

            current_user
              AS username
        `
      );


    pass(
      "PostgreSQL connection",
      [
        `database=${health.rows[0].database}`,
        `user=${health.rows[0].username}`,
      ].join(
        " "
      )
    );


    const connectionRole =
      await inspectCurrentRole(
        pool
      );


    pass(
      "Database connection role",
      [
        `superuser=${connectionRole.rolsuper}`,
        `bypassRLS=${connectionRole.rolbypassrls}`,
      ].join(
        " "
      )
    );


    if (
      connectionRole.rolsuper ||
      connectionRole.rolbypassrls
    ) {
      console.log(
        "INFO  Administrative DB connection bypasses RLS; hardened certification role will be used for tenant canaries."
      );
    }


    /*
     * ------------------------------------------------------------------------
     * TENANT
     * ------------------------------------------------------------------------
     */

    const resolvedScope =
      await resolveCanonicalScope(
        pool
      );


    pass(
      "Canonical organization/environment",
      `${CONFIG.organizationId} / ${CONFIG.environmentId}`
    );


    /*
     * ------------------------------------------------------------------------
     * OPERATOR
     * ------------------------------------------------------------------------
     */

    operator =
      await resolveOperator(
        pool,
        resolvedScope.organization_uuid
      );


    pass(
      "Organization operator",
      [
        `user=${operator.user_id}`,
        `membership=${operator.status}`,

        operator.certification_fixture
          ? "source=temporary-certification-fixture"
          : "source=existing-organization-member",
      ].join(
        " "
      )
    );


    /*
     * ------------------------------------------------------------------------
     * RLS CERTIFICATION ROLE
     * ------------------------------------------------------------------------
     */

    rlsRole =
      await createRlsCertificationRole(
        pool
      );


    await certifyRlsRole({
      pool,

      roleName:
        rlsRole.roleName,
    });


    /*
     * ------------------------------------------------------------------------
     * SCHEMA
     * ------------------------------------------------------------------------
     */

    await certifySchema(
      pool
    );


    /*
     * ------------------------------------------------------------------------
     * HUMAN TASK
     * ------------------------------------------------------------------------
     */

    console.log("");
    console.log(
      "--------------------------------------------------------------"
    );
    console.log(
      "CANONICAL HUMAN TASK"
    );
    console.log(
      "--------------------------------------------------------------"
    );


    task =
      await humanRepository.createTask({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        publicId:
          randomPublicId(
            "phase23_task"
          ),

        incidentId,

        taskType:
          "MANUAL_INTERVENTION",

        title:
          "Phase 23.1E live certification human task",

        description:
          "Temporary Phase 23 live certification task",

        priority:
          "CRITICAL",

        source:
          "PHASE23_LIVE_CERTIFICATION",

        acknowledgementRequired:
          true,

        autonomousRecoveryBlocked:
          true,

        recommendedActions: [
          "Inspect incident evidence",
          "Take control only through canonical human-control lease",
        ],

        evidence: [
          {
            type:
              "PHASE23_LIVE_CERTIFICATION",

            live:
              true,

            executionAuthorized:
              false,
          },
        ],

        metadata: {
          phase:
            "23.1E",

          certification:
            true,

          executionAuthorized:
            false,
        },
      });


    assertCondition(
      Boolean(
        task?.id
      ),

      "PHASE23_TASK_CREATE_FAILED",

      "Canonical Phase 23 HumanTask was not created"
    );


    assertCondition(
      task.status ===
        HUMAN_TASK_STATUS.OPEN,

      "PHASE23_TASK_STATUS_INVALID",

      `Expected HumanTask OPEN, got ${task.status}`
    );


    assertCondition(
      task.executionAuthorized ===
        false,

      "PHASE23_TASK_AUTHORITY_INVALID",

      "HumanTask unexpectedly authorized execution"
    );


    pass(
      "Canonical HumanTask persistence",
      task.publicId ||
        task.id
    );


    /*
     * ------------------------------------------------------------------------
     * HARDENED SOURCE-SCOPE CANARY
     * ------------------------------------------------------------------------
     */

    const hardenedSourceCount =
      await sourceScopeReadCount({
        pool,

        roleName:
          rlsRole.roleName,

        organizationUuid:
          resolvedScope.organization_uuid,

        environmentUuid:
          resolvedScope.environment_uuid,

        taskDatabaseId:
          task.id,
      });


    assertCondition(
      hardenedSourceCount ===
        1,

      "PHASE23_RLS_SOURCE_READ_FAILED",

      [
        "Hardened RLS role could not read",
        "the HumanTask in its correct tenant scope.",
        `count=${hardenedSourceCount}`,
      ].join(
        " "
      )
    );


    pass(
      "Hardened source-scope read",
      "1 row"
    );


    /*
     * ------------------------------------------------------------------------
     * HARDENED FOREIGN READ
     * ------------------------------------------------------------------------
     */

    const foreignReadCount =
      await foreignScopeReadCount({
        pool,

        roleName:
          rlsRole.roleName,

        taskDatabaseId:
          task.id,
      });


    assertCondition(
      foreignReadCount ===
        0,

      "PHASE23_RLS_READ_LEAK",

      `Foreign scope observed ${foreignReadCount} source HumanTask rows`
    );


    pass(
      "Foreign-scope read isolation",
      "0 rows"
    );


    /*
     * ------------------------------------------------------------------------
     * HARDENED FOREIGN WRITE
     * ------------------------------------------------------------------------
     */

    const foreignUpdateCount =
      await foreignScopeUpdateCount({
        pool,

        roleName:
          rlsRole.roleName,

        taskDatabaseId:
          task.id,
      });


    assertCondition(
      foreignUpdateCount ===
        0,

      "PHASE23_RLS_WRITE_LEAK",

      `Foreign scope updated ${foreignUpdateCount} source HumanTask rows`
    );


    pass(
      "Foreign-scope write isolation",
      "0 rows updated"
    );


    /*
     * ------------------------------------------------------------------------
     * EXECUTION AUTHORITY FENCE
     * ------------------------------------------------------------------------
     */

    await certifyDatabaseAuthorityFence({
      scope,

      taskId:
        task.publicId ||
        task.id,
    });


    /*
     * ------------------------------------------------------------------------
     * TAKEOVER
     * ------------------------------------------------------------------------
     */

    console.log("");
    console.log(
      "--------------------------------------------------------------"
    );
    console.log(
      "REAL TAKEOVER LIFECYCLE"
    );
    console.log(
      "--------------------------------------------------------------"
    );


    const takeoverRequest =
      await lifecycleService.requestTakeover({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        incidentId,

        taskId:
          task.publicId ||
          task.id,

        actorUserId:
          operator.user_id,

        reason:
          "Phase 23.1E live certification",

        controlEpoch:
          1,

        metadata: {
          phase:
            "23.1E",

          live:
            true,

          executionAuthorized:
            false,
        },
      });


    assertCondition(
      takeoverRequest
        ?.session
        ?.status ===
        TAKEOVER_SESSION_STATUS.REQUESTED,

      "PHASE23_TAKEOVER_REQUEST_FAILED",

      "Takeover session did not enter REQUESTED"
    );


    assertCondition(
      takeoverRequest.controlGranted ===
        false,

      "PHASE23_REQUEST_GRANTED_CONTROL",

      "Takeover request incorrectly granted active control"
    );


    assertCondition(
      takeoverRequest.executionAuthorized ===
        false,

      "PHASE23_REQUEST_AUTHORIZED_EXECUTION",

      "Takeover request incorrectly granted execution authorization"
    );


    pass(
      "Takeover request",
      "REQUESTED / no control / no execution authority"
    );


    /*
     * ------------------------------------------------------------------------
     * AUTHORIZE TAKEOVER
     * ------------------------------------------------------------------------
     */

    const authorized =
      await lifecycleService.authorizeTakeover({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        sessionId:
          takeoverRequest.session.publicId ||
          takeoverRequest.session.id,

        actorUserId:
          operator.user_id,

        metadata: {
          phase:
            "23.1E",

          live:
            true,

          executionAuthorized:
            false,
        },
      });


    assertCondition(
      authorized
        ?.session
        ?.status ===
        TAKEOVER_SESSION_STATUS.AUTHORIZED,

      "PHASE23_TAKEOVER_AUTHORIZATION_FAILED",

      "Takeover session did not enter AUTHORIZED"
    );


    assertCondition(
      authorized.controlGranted ===
        false,

      "PHASE23_AUTHORIZATION_GRANTED_CONTROL",

      "Takeover authorization incorrectly granted active control"
    );


    assertCondition(
      authorized.executionAuthorized ===
        false,

      "PHASE23_AUTHORIZATION_GRANTED_EXECUTION",

      "Takeover authorization incorrectly granted execution authority"
    );


    pass(
      "Takeover authorization",
      "AUTHORIZED != CONTROL"
    );


    /*
     * ------------------------------------------------------------------------
     * CONCURRENT LEASE ACQUISITION
     * ------------------------------------------------------------------------
     */

    console.log("");
    console.log(
      "--------------------------------------------------------------"
    );
    console.log(
      "CONCURRENT CONTROL ACQUISITION"
    );
    console.log(
      "--------------------------------------------------------------"
    );


    const sessionId =
      authorized.session.publicId ||
      authorized.session.id;


    const attempts =
      await Promise.allSettled([
        takeoverRepository.acquireControlLease({
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,

          sessionId,

          holderUserId:
            operator.user_id,

          leaseDurationMs:
            300000,

          metadata: {
            contender:
              "A",

            executionAuthorized:
              false,
          },
        }),

        takeoverRepository.acquireControlLease({
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,

          sessionId,

          holderUserId:
            operator.user_id,

          leaseDurationMs:
            300000,

          metadata: {
            contender:
              "B",

            executionAuthorized:
              false,
          },
        }),
      ]);


    const winners =
      attempts.filter(
        (
          result
        ) =>
          result.status ===
          "fulfilled"
      );


    const losers =
      attempts.filter(
        (
          result
        ) =>
          result.status ===
          "rejected"
      );


    assertCondition(
      winners.length ===
        1,

      "PHASE23_CONCURRENT_LEASE_WINNER_COUNT",

      `Expected exactly 1 lease winner, got ${winners.length}`
    );


    assertCondition(
      losers.length ===
        1,

      "PHASE23_CONCURRENT_LEASE_LOSER_COUNT",

      `Expected exactly 1 lease loser, got ${losers.length}`
    );


    const winningLease =
      winners[0].value;


    assertCondition(
      winningLease.status ===
        CONTROL_LEASE_STATUS.ACTIVE,

      "PHASE23_LEASE_NOT_ACTIVE",

      "Winning control lease is not ACTIVE"
    );


    assertCondition(
      winningLease.executionAuthorized ===
        false,

      "PHASE23_LEASE_AUTHORIZED_EXECUTION",

      "Human control lease unexpectedly authorized execution"
    );


    const loserError =
      losers[0].reason;


    assertCondition(
      [
        "HUMAN_CONTROL_LEASE_CONFLICT",
        "HUMAN_TAKEOVER_SESSION_NOT_AUTHORIZED",
        "HUMAN_TAKEOVER_ALREADY_ACTIVE",
      ].includes(
        loserError?.code
      ),

      "PHASE23_UNEXPECTED_CONCURRENCY_ERROR",

      [
        "Losing lease acquisition did not fail safely.",
        `code=${loserError?.code || "NONE"}`,
        `message=${loserError?.message || "NONE"}`,
      ].join(
        " "
      )
    );


    pass(
      "Concurrent control acquisition",
      "1 winner / 1 safely rejected"
    );


    /*
     * ------------------------------------------------------------------------
     * ACTIVE CONTROL
     * ------------------------------------------------------------------------
     */

    const activeControl =
      await lifecycleService.getActiveControl({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        incidentId,
      });


    assertCondition(
      activeControl.active ===
        true,

      "PHASE23_ACTIVE_CONTROL_NOT_VISIBLE",

      "Active human control lease was not visible"
    );


    assertCondition(
      activeControl.executionAuthorized ===
        false,

      "PHASE23_ACTIVE_CONTROL_AUTHORIZED_EXECUTION",

      "Human control unexpectedly became execution authority"
    );


    pass(
      "Active human control",
      "visible / executionAuthorized=false"
    );


    const activeLeaseCount =
      await scope.run(
        {
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,
        },

        async (
          client
        ) => {
          const result =
            await client.query(
              `
                SELECT
                  COUNT(*)::integer
                    AS count

                FROM
                  human_operations.control_leases

                WHERE
                  incident_id = $1

                  AND
                  status = 'ACTIVE'
              `,
              [
                incidentId,
              ]
            );


          return Number(
            result.rows[0]
              ?.count ||
            0
          );
        }
      );


    assertCondition(
      activeLeaseCount ===
        1,

      "PHASE23_DATABASE_MULTIPLE_ACTIVE_LEASES",

      `Database contains ${activeLeaseCount} ACTIVE leases`
    );


    pass(
      "PostgreSQL exclusive lease fence",
      "exactly 1 ACTIVE lease"
    );


    /*
     * ------------------------------------------------------------------------
     * RETURN CONTROL
     * ------------------------------------------------------------------------
     */

    console.log("");
    console.log(
      "--------------------------------------------------------------"
    );
    console.log(
      "CONTROL RETURN"
    );
    console.log(
      "--------------------------------------------------------------"
    );


    const released =
      await lifecycleService.releaseControl({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        leaseId:
          winningLease.publicId ||
          winningLease.id,

        actorUserId:
          operator.user_id,

        reason:
          "Phase 23.1E live certification control return",
      });


    assertCondition(
      released
        ?.lease
        ?.status ===
        CONTROL_LEASE_STATUS.RELEASED,

      "PHASE23_RELEASE_FAILED",

      "Control lease did not enter RELEASED"
    );


    assertCondition(
      released.humanControlActive ===
        false,

      "PHASE23_CONTROL_STILL_ACTIVE",

      "Human control remained active after release"
    );


    assertCondition(
      released.requiresFreshEvaluation ===
        true,

      "PHASE23_REEVALUATION_NOT_REQUIRED",

      "Return of control did not require fresh evaluation"
    );


    assertCondition(
      released.stalePlanResumeAllowed ===
        false,

      "PHASE23_STALE_PLAN_RESUME_ALLOWED",

      "Stale autonomous recovery plan was allowed to resume"
    );


    assertCondition(
      released.executionAuthorized ===
        false,

      "PHASE23_RELEASE_AUTHORIZED_EXECUTION",

      "Control release incorrectly authorized execution"
    );


    pass(
      "Control release",
      "RELEASED"
    );


    pass(
      "Fresh evaluation fence",
      "REQUIRED"
    );


    pass(
      "Stale-plan resume",
      "PROHIBITED"
    );


    const afterRelease =
      await lifecycleService.getActiveControl({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        incidentId,
      });


    assertCondition(
      afterRelease.active ===
        false,

      "PHASE23_ACTIVE_LEASE_SURVIVED_RELEASE",

      "Released incident still exposes ACTIVE human control"
    );


    pass(
      "Post-release active control",
      "NONE"
    );


    /*
     * ------------------------------------------------------------------------
     * AUTHORITY AUDIT
     * ------------------------------------------------------------------------
     */

    const authorityCount =
      await countExecutionAuthorityRows({
        scope,
        incidentId,
      });


    assertCondition(
      authorityCount ===
        0,

      "PHASE23_EXECUTION_AUTHORITY_LEAK",

      `${authorityCount} Phase 23 rows contain execution_authorized=true`
    );


    pass(
      "Final execution-authority audit",
      "0 authorized rows"
    );


    /*
     * ------------------------------------------------------------------------
     * FINAL PASS
     * ------------------------------------------------------------------------
     */

    console.log("");
    console.log(
      "=============================================================="
    );
    console.log(
      "PHASE 23.1E — LIVE POSTGRESQL CERTIFICATION: PASS"
    );
    console.log(
      "=============================================================="
    );

    console.log(
      `Organization:        ${CONFIG.organizationId}`
    );

    console.log(
      `Environment:         ${CONFIG.environmentId}`
    );

    console.log(
      `Incident:            ${incidentId}`
    );

    console.log(
      `Task:                ${task.publicId || task.id}`
    );

    console.log(
      `DB admin role:       ${connectionRole.rolname}`
    );

    console.log(
      `DB admin superuser:  ${connectionRole.rolsuper}`
    );

    console.log(
      `DB admin bypassRLS:  ${connectionRole.rolbypassrls}`
    );

    console.log(
      "RLS cert role:       NOSUPERUSER / NOBYPASSRLS"
    );

    console.log(
      "RLS:                 PASS"
    );

    console.log(
      "FORCE RLS:           PASS"
    );

    console.log(
      "Source read:         PASS"
    );

    console.log(
      "Foreign read:        BLOCKED"
    );

    console.log(
      "Foreign write:       BLOCKED"
    );

    console.log(
      "Concurrent leases:   1 WINNER"
    );

    console.log(
      "Control release:     PASS"
    );

    console.log(
      "Fresh evaluation:    REQUIRED"
    );

    console.log(
      "Stale plan resume:   PROHIBITED"
    );

    console.log(
      "Execution authority: FALSE"
    );

    console.log(
      "=============================================================="
    );

    console.log("");
  } catch (
    error
  ) {
    primaryFailure =
      error;


    console.error("");
    console.error(
      "=============================================================="
    );
    console.error(
      "PHASE 23.1E — LIVE POSTGRESQL CERTIFICATION: FAIL"
    );
    console.error(
      "=============================================================="
    );


    fail(
      error?.code ||
        "UNEXPECTED_ERROR",

      error?.message ||
        String(
          error
        )
    );


    if (
      error?.stack
    ) {
      console.error(
        error.stack
      );
    }


    process.exitCode =
      1;
  } finally {
    /*
     * Human-operation fixture cleanup first.
     */
    try {
      await cleanup({
        scope,
        incidentId,

        taskDatabaseId:
          task?.id ||
          null,
      });


      pass(
        "Certification cleanup",
        "temporary human-operation rows removed"
      );
    } catch (
      cleanupError
    ) {
      console.error(
        "WARN  Phase 23 certification cleanup failed:",
        cleanupError?.message ||
          cleanupError
      );


      process.exitCode =
        1;
    }


    /*
     * Operator cleanup.
     */
    try {
      await cleanupCertificationOperator({
        pool,
        operator,
      });


      if (
        operator?.certification_fixture
      ) {
        pass(
          "Certification operator cleanup",
          "temporary identity removed"
        );
      }
    } catch (
      operatorCleanupError
    ) {
      console.error(
        "WARN  Phase 23 certification operator cleanup failed:",
        operatorCleanupError?.message ||
          operatorCleanupError
      );


      process.exitCode =
        1;
    }


    /*
     * RLS role cleanup last.
     */
    try {
      await cleanupRlsCertificationRole({
        pool,
        role:
          rlsRole,
      });


      if (
        rlsRole
      ) {
        pass(
          "RLS certification role cleanup",
          "temporary hardened role removed"
        );
      }
    } catch (
      rlsCleanupError
    ) {
      console.error(
        "WARN  Phase 23 RLS role cleanup failed:",
        rlsCleanupError?.message ||
          rlsCleanupError
      );


      process.exitCode =
        1;
    }


    try {
      await closePostgresPool();
    } catch (
      closeError
    ) {
      console.error(
        "WARN  PostgreSQL pool close failed:",
        closeError?.message ||
          closeError
      );


      process.exitCode =
        1;
    }


    if (
      primaryFailure
    ) {
      process.exitCode =
        1;
    }
  }
}


/*
 * ============================================================================
 * CLI
 * ============================================================================
 */

if (
  require.main ===
  module
) {
  main().catch(
    async (
      error
    ) => {
      console.error(
        "Unhandled Phase 23.1E certification failure:",
        error?.stack ||
          error
      );


      process.exitCode =
        1;


      try {
        await closePostgresPool();
      } catch {
        // Best effort.
      }
    }
  );
}


/*
 * ============================================================================
 * TEST EXPORTS
 * ============================================================================
 */

module.exports = {
  CONFIG,
  REQUIRED_TABLES,

  resolveCanonicalScope,
  resolveOperator,

  inspectCurrentRole,

  createRlsCertificationRole,
  certifyRlsRole,
  cleanupRlsCertificationRole,

  certifySchema,

  runAsRlsRole,

  sourceScopeReadCount,
  foreignScopeReadCount,
  foreignScopeUpdateCount,

  certifyDatabaseAuthorityFence,

  cleanup,
  cleanupCertificationOperator,

  countExecutionAuthorityRows,

  main,
};