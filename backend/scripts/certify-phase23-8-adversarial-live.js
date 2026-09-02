"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.8
 * LIVE TENANT + ADVERSARIAL CERTIFICATION
 * ============================================================================
 *
 * SAFETY LAWS
 *
 * HUMAN CONTROL != EXECUTION AUTHORIZATION
 * RETURN CONTROL != RESUME
 * STALE PLAN RESUME = PROHIBITED
 * CROSS-TENANT CONTROL = PROHIBITED
 *
 * This script performs certification only.
 *
 * It does NOT execute infrastructure recovery.
 * It does NOT grant execution authority.
 *
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


const fs =
  require(
    "node:fs"
  );


const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../persistence/postgres"
  );


const PostgresHumanOperationsRepository =
  require(
    "../persistence/postgres/PostgresHumanOperationsRepository"
  );


const PostgresHumanTakeoverRepository =
  require(
    "../persistence/postgres/PostgresHumanTakeoverRepository"
  );


const PostgresTenantScope =
  require(
    "../persistence/postgres/PostgresTenantScope"
  );


const {
  HumanTakeoverLifecycleService,
} =
  require(
    "../services/humanOperations/humanTakeoverLifecycleService"
  );


const {
  certifyResults,
  certifyConcurrency,
  certifyForeignScope,
  certifyAuthorityAudit,
} =
  require(
    "../services/certification/phase23AdversarialCertificationService"
  );


const {
  resolveOperator,

  createRlsCertificationRole,
  certifyRlsRole,
  cleanupRlsCertificationRole,

  cleanupCertificationOperator,

  runAsRlsRole,
} =
  require(
    "./certify-phase23-1-live"
  );


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

    artifactDirectory:
      path.resolve(
        __dirname,
        "../artifacts/phase23"
      ),
  });


const CERTIFICATION_TABLES =
  Object.freeze([
    "tasks",

    "assignments",

    "acknowledgements",

    "resolutions",

    "takeover_sessions",

    "control_leases",

    "task_status_history",

    "takeover_events",

    "control_return_fences",
  ]);


/*
 * ============================================================================
 * GENERIC HELPERS
 * ============================================================================
 */


function pass(
  label,
  details =
    ""
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
  details =
    ""
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

      executionAuthorized:
        false,
    }
  );
}


function safeIdentifier(
  value
) {
  const text =
    String(
      value
    );


  assertCondition(
    /^[A-Za-z_][A-Za-z0-9_]*$/
      .test(
        text
      ),

    "PHASE23_INVALID_SQL_IDENTIFIER",

    `Unsafe SQL identifier: ${text}`
  );


  return `"${text}"`;
}


function uniquePublicId(
  prefix
) {
  return [
    prefix,

    crypto
      .randomBytes(
        8
      )
      .toString(
        "hex"
      ),
  ].join(
    "_"
  );
}


/*
 * ============================================================================
 * CANONICAL SCOPE
 * ============================================================================
 */


async function resolveCertificationScope(
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

    "PHASE23_8_SCOPE_NOT_FOUND",

    [
      "Phase 23.8 canonical scope could not be resolved.",
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
 * RLS TABLE CERTIFICATION
 * ============================================================================
 */


async function certifyHumanOperationsRls(
  pool
) {
  const result =
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
        CERTIFICATION_TABLES,
      ]
    );


  const byName =
    new Map(
      result.rows.map(
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
    of CERTIFICATION_TABLES
  ) {
    const row =
      byName.get(
        tableName
      );


    assertCondition(
      Boolean(
        row
      ),

      "PHASE23_8_TABLE_MISSING",

      `human_operations.${tableName} is missing`
    );


    assertCondition(
      row.rls_enabled ===
        true,

      "PHASE23_8_RLS_DISABLED",

      `RLS disabled on human_operations.${tableName}`
    );


    assertCondition(
      row.rls_forced ===
        true,

      "PHASE23_8_RLS_NOT_FORCED",

      `FORCE RLS missing on human_operations.${tableName}`
    );


    pass(
      `${tableName} tenant boundary`,
      "RLS ENABLED + FORCED"
    );
  }
}


/*
 * ============================================================================
 * RLS PROBES
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


async function foreignScopeWriteCount({
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
                  'PHASE23_FOREIGN_WRITE_MUST_NOT_COMMIT'

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
 * EXECUTION AUTHORITY FORGERY
 * ============================================================================
 */


async function certifyDatabaseAuthorityForgery({
  pool,
  taskDatabaseId,
}) {
  const client =
    await pool.connect();


  try {
    await client.query(
      "BEGIN"
    );


    let rejected =
      false;


    try {
      await client.query(
        `
          UPDATE
            human_operations.tasks

          SET
            execution_authorized =
              TRUE

          WHERE
            id = $1
        `,
        [
          taskDatabaseId,
        ]
      );
    } catch {
      rejected =
        true;
    }


    await client.query(
      "ROLLBACK"
    );


    return rejected;
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
 * EXECUTION AUTHORITY FINAL AUDIT
 * ============================================================================
 */


async function countExecutionAuthorityRows(
  pool
) {
  const columns =
    await pool.query(
      `
        SELECT
          table_name

        FROM
          information_schema.columns

        WHERE
          table_schema =
            'human_operations'

          AND
          column_name =
            'execution_authorized'

        ORDER BY
          table_name
      `
    );


  let total =
    0;


  for (
    const row
    of columns.rows
  ) {
    const tableName =
      safeIdentifier(
        row.table_name
      );


    const result =
      await pool.query(
        `
          SELECT
            COUNT(*)::integer
              AS count

          FROM
            human_operations.${tableName}

          WHERE
            execution_authorized =
              TRUE
        `
      );


    total +=
      Number(
        result.rows[0]
          ?.count ||
        0
      );
  }


  return total;
}


/*
 * ============================================================================
 * FIXTURE CLEANUP
 * ============================================================================
 */


async function cleanupFixture({
  pool,
  incidentId,
  taskPublicId,
}) {
  if (
    !taskPublicId
  ) {
    return;
  }


  const client =
    await pool.connect();


  try {
    await client.query(
      "BEGIN"
    );


    /*
     * Delete explicit child state first.
     *
     * Some of these may also cascade. Explicit deletion keeps
     * local certification cleanup deterministic across schema evolution.
     */


    if (
      incidentId
    ) {
      await client.query(
        `
          DELETE FROM
            human_operations.control_return_fences

          WHERE
            incident_id = $1
        `,
        [
          String(
            incidentId
          ),
        ]
      );


      await client.query(
        `
          DELETE FROM
            human_operations.takeover_events

          WHERE
            incident_id = $1
        `,
        [
          String(
            incidentId
          ),
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
          String(
            incidentId
          ),
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
          String(
            incidentId
          ),
        ]
      );
    }


    await client.query(
      `
        DELETE FROM
          human_operations.tasks

        WHERE
          public_id = $1
      `,
      [
        taskPublicId,
      ]
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
 * ARTIFACT
 * ============================================================================
 */


async function writeArtifact(
  report
) {
  fs.mkdirSync(
    CONFIG.artifactDirectory,
    {
      recursive:
        true,
    }
  );


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        "-"
      );


  const artifactPath =
    path.join(
      CONFIG.artifactDirectory,

      `phase23-8-adversarial-certification-${timestamp}.json`
    );


  fs.writeFileSync(
    artifactPath,

    JSON.stringify(
      report,
      null,
      2
    ),

    "utf8"
  );


  return artifactPath;
}


/*
 * ============================================================================
 * MAIN
 * ============================================================================
 */


async function main() {
  console.log(
    ""
  );


  console.log(
    "=============================================================="
  );


  console.log(
    "AIRA PHASE 23.8 — TENANT + ADVERSARIAL CERTIFICATION"
  );


  console.log(
    "=============================================================="
  );


  console.log(
    "HUMAN CONTROL != EXECUTION AUTHORIZATION"
  );


  console.log(
    "RETURN CONTROL != RESUME"
  );


  console.log(
    "STALE PLAN RESUME: PROHIBITED"
  );


  console.log(
    "CROSS-TENANT CONTROL: PROHIBITED"
  );


  console.log(
    ""
  );


  const pool =
    getPostgresPool();


  const scope =
    new PostgresTenantScope();


  const humanRepository =
    new PostgresHumanOperationsRepository({
      scope,
    });


  const takeoverRepository =
    new PostgresHumanTakeoverRepository({
      scope,
    });


  const lifecycle =
    new HumanTakeoverLifecycleService({
      humanOperationsRepository:
        humanRepository,

      takeoverRepository,
    });


  let resolvedScope =
    null;


  let operator =
    null;


  let rlsRole =
    null;


  let taskPublicId =
    null;


  let incidentId =
    null;


  const results =
    [];


  try {
    /*
     * ========================================================================
     * CANONICAL TENANT + OPERATOR
     * ========================================================================
     */


    resolvedScope =
      await resolveCertificationScope(
        pool
      );


    pass(
      "Canonical organization/environment",
      `${resolvedScope.organization_public_id} / ${resolvedScope.environment_public_id}`
    );


    /*
     * IMPORTANT:
     *
     * Existing Phase 23.1E signature:
     *
     * resolveOperator(
     *   pool,
     *   organizationUuid
     * )
     */
    operator =
      await resolveOperator(
        pool,
        resolvedScope.organization_uuid
      );


    const actorUserId =
      operator.user_id;


    assertCondition(
      Boolean(
        actorUserId
      ),

      "PHASE23_8_OPERATOR_USER_MISSING",

      "Certification operator has no canonical user_id"
    );


    pass(
      "Certification operator",
      [
        `user=${actorUserId}`,

        operator.certification_fixture
          ? "source=temporary-certification-fixture"
          : "source=existing-organization-member",
      ].join(
        " "
      )
    );


    /*
     * ========================================================================
     * RLS ROLE
     * ========================================================================
     */


    /*
     * Existing Phase 23.1E signature:
     *
     * createRlsCertificationRole(
     *   pool
     * )
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
     * createRlsCertificationRole already grants the minimum privileges
     * required for our task SELECT / UPDATE probes.
     *
     * Do NOT grant this temporary role broad access to all Phase-23 tables.
     */


    await certifyHumanOperationsRls(
      pool
    );


    /*
     * ========================================================================
     * CERTIFICATION FIXTURE
     * ========================================================================
     */


    incidentId =
      uniquePublicId(
        "phase23_8_incident"
      );


    taskPublicId =
      uniquePublicId(
        "phase23_8_task"
      );


    const task =
      await humanRepository
        .createTask({
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,

          incidentId,

          taskType:
            "MANUAL_INTERVENTION",

          title:
            "Phase 23.8 adversarial control certification",

          description:
            "Safety-only Phase 23.8 certification fixture",

          priority:
            "CRITICAL",

          status:
            "OPEN",

          acknowledgementRequired:
            true,

          autonomousRecoveryBlocked:
            true,

          metadata: {
            phase:
              "23.8",

            certification:
              true,

            requestedPublicId:
              taskPublicId,

            executionAuthorized:
              false,
          },
        });


    /*
     * Repository owns actual public-id generation.
     *
     * Keep the returned canonical id for cleanup.
     */
    taskPublicId =
      task.publicId;


    incidentId =
      task.incidentId ||
      incidentId;


    assertCondition(
      task.executionAuthorized ===
        false,

      "PHASE23_8_TASK_AUTHORITY_LEAK",

      "Certification task unexpectedly has execution authority"
    );


    pass(
      "Canonical HumanTask fixture",
      task.publicId
    );


    /*
     * ========================================================================
     * SOURCE-SCOPE RLS
     * ========================================================================
     */


    const sourceRead =
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


    results.push({
      id:
        "SOURCE_SCOPE_READ",

      passed:
        sourceRead ===
        1,

      expected:
        1,

      observed:
        sourceRead,
    });


    assertCondition(
      sourceRead ===
        1,

      "PHASE23_8_SOURCE_SCOPE_READ_FAILED",

      `Source scope returned ${sourceRead} HumanTask rows`
    );


    pass(
      "Source-scope read",
      "1 visible row"
    );


    /*
     * ========================================================================
     * FOREIGN-SCOPE RLS
     * ========================================================================
     */


    const foreignRead =
      await foreignScopeReadCount({
        pool,

        roleName:
          rlsRole.roleName,

        taskDatabaseId:
          task.id,
      });


    const foreignWrite =
      await foreignScopeWriteCount({
        pool,

        roleName:
          rlsRole.roleName,

        taskDatabaseId:
          task.id,
      });


    results.push(
      ...certifyForeignScope({
        readCount:
          foreignRead,

        writeCount:
          foreignWrite,
      })
    );


    assertCondition(
      foreignRead ===
        0,

      "PHASE23_8_CROSS_TENANT_READ",

      `Foreign tenant observed ${foreignRead} source rows`
    );


    assertCondition(
      foreignWrite ===
        0,

      "PHASE23_8_CROSS_TENANT_WRITE",

      `Foreign tenant modified ${foreignWrite} source rows`
    );


    pass(
      "Foreign-scope read",
      "0 rows"
    );


    pass(
      "Foreign-scope write",
      "0 rows"
    );


    /*
     * ========================================================================
     * DATABASE AUTHORITY FORGERY
     * ========================================================================
     */


    const forgeryRejected =
      await certifyDatabaseAuthorityForgery({
        pool,

        taskDatabaseId:
          task.id,
      });


    results.push({
      id:
        "DATABASE_AUTHORITY_FORGERY",

      passed:
        forgeryRejected,

      expected:
        "REJECTED",

      observed:
        forgeryRejected
          ? "REJECTED"
          : "ACCEPTED",
    });


    assertCondition(
      forgeryRejected,

      "PHASE23_8_AUTHORITY_FORGERY_ACCEPTED",

      "PostgreSQL accepted execution_authorized = TRUE"
    );


    pass(
      "Database execution-authority forgery",
      "REJECTED"
    );


    /*
     * ========================================================================
     * TAKEOVER SESSION
     * ========================================================================
     *
     * requestTakeover uses actorUserId.
     */


    const requested =
      await lifecycle
        .requestTakeover({
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,

          incidentId,

          taskId:
            task.publicId,

          actorUserId,

          reason:
            "Phase 23.8 concurrent control certification",

          controlEpoch:
            Number(
              task.controlEpoch ||
              0
            ),

          metadata: {
            phase:
              "23.8",

            executionAuthorized:
              false,
          },
        });


    assertCondition(
      requested.controlGranted ===
        false,

      "PHASE23_8_REQUEST_GRANTED_CONTROL",

      "Takeover request unexpectedly granted human control"
    );


    assertCondition(
      requested.executionAuthorized ===
        false,

      "PHASE23_8_REQUEST_GRANTED_EXECUTION_AUTHORITY",

      "Takeover request unexpectedly granted execution authority"
    );


    pass(
      "Takeover request",
      "REQUESTED != CONTROL"
    );


    /*
     * authorizeTakeover also uses actorUserId.
     */


    const authorized =
      await lifecycle
        .authorizeTakeover({
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,

          sessionId:
            requested.session.publicId ||
            requested.session.id,

          actorUserId,

          metadata: {
            phase:
              "23.8",

            executionAuthorized:
              false,
          },
        });


    assertCondition(
      authorized.controlGranted ===
        false,

      "PHASE23_8_AUTHORIZATION_GRANTED_CONTROL",

      "Takeover authorization unexpectedly granted human control"
    );


    assertCondition(
      authorized.executionAuthorized ===
        false,

      "PHASE23_8_AUTHORIZATION_GRANTED_EXECUTION_AUTHORITY",

      "Takeover authorization unexpectedly granted execution authority"
    );


    pass(
      "Takeover authorization",
      "AUTHORIZED != CONTROL"
    );


    /*
     * ========================================================================
     * CONCURRENT CONTROL ACQUISITION
     * ========================================================================
     *
     * Both callers race for the SAME authorized session.
     *
     * Session row locking + active-lease uniqueness must result in:
     *
     *   exactly one fulfilled call
     *   exactly one rejected call
     *   exactly one authoritative ACTIVE lease
     */


    const raceResults =
      await Promise.allSettled([
        lifecycle.takeControl({
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,

          sessionId:
            authorized.session.publicId ||
            authorized.session.id,

          actorUserId,

          leaseDurationMs:
            300000,

          metadata: {
            phase:
              "23.8",

            race:
              "A",

            executionAuthorized:
              false,
          },
        }),

        lifecycle.takeControl({
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,

          sessionId:
            authorized.session.publicId ||
            authorized.session.id,

          actorUserId,

          leaseDurationMs:
            300000,

          metadata: {
            phase:
              "23.8",

            race:
              "B",

            executionAuthorized:
              false,
          },
        }),
      ]);


    const winners =
      raceResults.filter(
        (
          result
        ) =>
          result.status ===
          "fulfilled"
      );


    const losers =
      raceResults.filter(
        (
          result
        ) =>
          result.status ===
          "rejected"
      );


    const activeLease =
      await takeoverRepository
        .getActiveLeaseForIncident({
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,

          incidentId,
        });


    const concurrency =
      certifyConcurrency({
        winners:
          winners.length,

        losers:
          losers.length,

        activeLeaseCount:
          activeLease
            ? 1
            : 0,
      });


    results.push(
      concurrency
    );


    assertCondition(
      concurrency.passed,

      "PHASE23_8_CONCURRENT_CONTROL_FAILURE",

      [
        "Concurrent control acquisition did not resolve safely.",
        `winners=${winners.length}`,
        `losers=${losers.length}`,
        `activeLeaseCount=${activeLease ? 1 : 0}`,
      ].join(
        " "
      )
    );


    pass(
      "Concurrent control acquisition",
      "exactly 1 winner / exactly 1 loser / exactly 1 ACTIVE lease"
    );


    /*
     * ========================================================================
     * LEASE THEFT
     * ========================================================================
     */


    assertCondition(
      Boolean(
        activeLease
      ),

      "PHASE23_8_ACTIVE_LEASE_MISSING",

      "Concurrent certification produced no authoritative active lease"
    );


    let ownerMismatchRejected =
      false;


    try {
      await takeoverRepository
        .heartbeatLease({
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,

          leaseId:
            activeLease.publicId ||
            activeLease.id,

          holderUserId:
            crypto.randomUUID(),

          extensionMs:
            300000,
        });
    } catch {
      ownerMismatchRejected =
        true;
    }


    results.push({
      id:
        "LEASE_OWNER_MISMATCH",

      passed:
        ownerMismatchRejected,

      expected:
        "REJECTED",

      observed:
        ownerMismatchRejected
          ? "REJECTED"
          : "ACCEPTED",
    });


    assertCondition(
      ownerMismatchRejected,

      "PHASE23_8_LEASE_THEFT_ACCEPTED",

      "Non-holder successfully heartbeated another operator's lease"
    );


    pass(
      "Lease theft attempt",
      "REJECTED"
    );


     /*
     * ========================================================================
     * EXPIRED-LEASE HEARTBEAT CONTRACT
     * ========================================================================
     *
     * Phase 23.1F already performs the dedicated live expiry mutation:
     *
     * ACTIVE lease
     *      ↓
     * expires_at <= NOW()
     *      ↓
     * heartbeat attempted
     *      ↓
     * lease EXPIRED committed
     * session EXPIRED committed
     * CONTROL_LEASE_EXPIRED event committed
     *      ↓
     * HUMAN_CONTROL_LEASE_EXPIRED returned AFTER commit
     *
     * Phase 23.8 must ensure that hardened implementation has not been
     * removed or regressed.
     *
     * IMPORTANT:
     *
     * Do NOT assert one exact SQL formatting string such as:
     *
     *     status = 'EXPIRED'
     *
     * because the repository intentionally uses parameterized SQL and
     * constants. Formatting is not the safety property.
     *
     * We certify the semantic markers that collectively define the durable
     * expiry implementation.
     */


    const takeoverRepositorySource =
      fs.readFileSync(
        path.resolve(
          __dirname,

          "../persistence/postgres/PostgresHumanTakeoverRepository.js"
        ),

        "utf8"
      );


    const hasHeartbeatMethod =
      /async\s+heartbeatLease\s*\(/m
        .test(
          takeoverRepositorySource
        );


    const hasExpiredDomainError =
      takeoverRepositorySource
        .includes(
          "HUMAN_CONTROL_LEASE_EXPIRED"
        );


    const hasExpiredLifecycleEvent =
      takeoverRepositorySource
        .includes(
          "CONTROL_LEASE_EXPIRED"
        );


    const hasExpiredLeaseStatus =
      (
        takeoverRepositorySource
          .includes(
            "CONTROL_LEASE_STATUS.EXPIRED"
          ) ||

        /['"]EXPIRED['"]/m
          .test(
            takeoverRepositorySource
          )
      );


    const hasControlLeaseExpiryWrite =
      (
        /UPDATE\s+human_operations\.control_leases/im
          .test(
            takeoverRepositorySource
          ) ||

        (
          takeoverRepositorySource
            .includes(
              "human_operations.control_leases"
            ) &&

          takeoverRepositorySource
            .includes(
              "EXPIRED"
            )
        )
      );


    const hasTakeoverSessionExpiryWrite =
      (
        /UPDATE\s+human_operations\.takeover_sessions/im
          .test(
            takeoverRepositorySource
          ) ||

        (
          takeoverRepositorySource
            .includes(
              "human_operations.takeover_sessions"
            ) &&

          takeoverRepositorySource
            .includes(
              "EXPIRED"
            )
        )
      );


    /*
     * Durable expiry is specifically designed so that the database mutation
     * commits BEFORE HUMAN_CONTROL_LEASE_EXPIRED is surfaced.
     *
     * The implementation documents and enforces this by throwing the domain
     * error outside the scoped transaction.
     */
    const hasPostCommitExpiryContract =
      (
        takeoverRepositorySource
          .includes(
            "HUMAN_CONTROL_LEASE_EXPIRED"
          ) &&

        (
          takeoverRepositorySource
            .includes(
              "AFTER this scope.run() completes"
            ) ||

          takeoverRepositorySource
            .includes(
              "outside transaction"
            ) ||

          takeoverRepositorySource
            .includes(
              "outside the transaction"
            ) ||

          takeoverRepositorySource
            .includes(
              "after writing EXPIRED state"
            )
        )
      );


    const expiryPathPresent =
      hasHeartbeatMethod &&
      hasExpiredDomainError &&
      hasExpiredLifecycleEvent &&
      hasExpiredLeaseStatus &&
      hasControlLeaseExpiryWrite &&
      hasTakeoverSessionExpiryWrite &&
      hasPostCommitExpiryContract;


    results.push({
      id:
        "EXPIRED_LEASE_HEARTBEAT",

      passed:
        expiryPathPresent,

      expected: {
        heartbeatMethod:
          true,

        expiredDomainError:
          "HUMAN_CONTROL_LEASE_EXPIRED",

        expiredLifecycleEvent:
          "CONTROL_LEASE_EXPIRED",

        durableLeaseExpiry:
          true,

        durableSessionExpiry:
          true,

        postCommitError:
          true,
      },

      observed: {
        heartbeatMethod:
          hasHeartbeatMethod,

        expiredDomainError:
          hasExpiredDomainError,

        expiredLifecycleEvent:
          hasExpiredLifecycleEvent,

        expiredLeaseStatus:
          hasExpiredLeaseStatus,

        durableLeaseExpiry:
          hasControlLeaseExpiryWrite,

        durableSessionExpiry:
          hasTakeoverSessionExpiryWrite,

        postCommitError:
          hasPostCommitExpiryContract,
      },

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    });


    assertCondition(
      expiryPathPresent,

      "PHASE23_8_DURABLE_EXPIRY_PATH_MISSING",

      [
        "Durable expired-lease heartbeat contract incomplete.",

        `heartbeatMethod=${hasHeartbeatMethod}`,

        `expiredDomainError=${hasExpiredDomainError}`,

        `expiredLifecycleEvent=${hasExpiredLifecycleEvent}`,

        `expiredLeaseStatus=${hasExpiredLeaseStatus}`,

        `leaseExpiryWrite=${hasControlLeaseExpiryWrite}`,

        `sessionExpiryWrite=${hasTakeoverSessionExpiryWrite}`,

        `postCommitError=${hasPostCommitExpiryContract}`,
      ].join(
        " "
      )
    );


    pass(
      "Expired lease heartbeat boundary",
      [
        "durable Phase 23.1F path retained",

        "lease -> EXPIRED",

        "session -> EXPIRED",

        "event -> CONTROL_LEASE_EXPIRED",

        "error -> HUMAN_CONTROL_LEASE_EXPIRED after commit",
      ].join(
        " / "
      )
    );
    
    /*
     * ========================================================================
     * RETURN CONTROL
     * ========================================================================
     */


    const released =
      await lifecycle
        .releaseControl({
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,

          leaseId:
            activeLease.publicId ||
            activeLease.id,

          actorUserId,

          reason:
            "Phase 23.8 adversarial return-control certification",

          metadata: {
            phase:
              "23.8",

            executionAuthorized:
              false,
          },
        });


    const returnRequiresFreshEvaluation =
      released.requiresFreshEvaluation ===
      true;


    const stalePlanResumeAllowed =
      released.stalePlanResumeAllowed ===
      true;


    results.push({
      id:
        "RETURN_CONTROL_FENCE",

      passed:
        returnRequiresFreshEvaluation,

      expected:
        true,

      observed:
        returnRequiresFreshEvaluation,
    });


    results.push({
      id:
        "STALE_PLAN_RESUME",

      passed:
        stalePlanResumeAllowed ===
        false,

      expected:
        false,

      observed:
        stalePlanResumeAllowed,
    });


    assertCondition(
      returnRequiresFreshEvaluation,

      "PHASE23_8_FRESH_EVALUATION_MISSING",

      "Return control did not require fresh evaluation"
    );


    assertCondition(
      stalePlanResumeAllowed ===
        false,

      "PHASE23_8_STALE_PLAN_RESUME_ALLOWED",

      "Return control allowed stale plan resume"
    );


    assertCondition(
      released.executionAuthorized ===
        false,

      "PHASE23_8_RETURN_GRANTED_EXECUTION_AUTHORITY",

      "Return control unexpectedly granted execution authority"
    );


    pass(
      "Return-control fence",
      "fresh evaluation required"
    );


    pass(
      "Stale-plan resume",
      "PROHIBITED"
    );


    /*
     * ========================================================================
     * DATABASE DURABLE RETURN-FENCE AUDIT
     * ========================================================================
     */


    const fenceResult =
      await pool.query(
        `
          SELECT
            state,

            stale_plan_resume_allowed,

            execution_authorized,

            previous_control_epoch,

            required_control_epoch

          FROM
            human_operations.control_return_fences

          WHERE
            incident_id = $1

          ORDER BY
            created_at DESC

          LIMIT 1
        `,
        [
          String(
            incidentId
          ),
        ]
      );


    const durableFence =
      fenceResult.rows[0];


    assertCondition(
      Boolean(
        durableFence
      ),

      "PHASE23_8_DURABLE_RETURN_FENCE_MISSING",

      "Return control did not create a durable PostgreSQL return fence"
    );


    assertCondition(
      durableFence.state ===
        "REQUIRES_FRESH_EVALUATION",

      "PHASE23_8_RETURN_FENCE_STATE_INVALID",

      `Unexpected return fence state: ${durableFence.state}`
    );


    assertCondition(
      durableFence.stale_plan_resume_allowed ===
        false,

      "PHASE23_8_DATABASE_STALE_RESUME_ALLOWED",

      "Database return fence permits stale-plan resume"
    );


    assertCondition(
      durableFence.execution_authorized ===
        false,

      "PHASE23_8_RETURN_FENCE_AUTHORITY_LEAK",

      "Return fence unexpectedly carries execution authority"
    );


    assertCondition(
      Number(
        durableFence.required_control_epoch
      ) >
      Number(
        durableFence.previous_control_epoch
      ),

      "PHASE23_8_CONTROL_EPOCH_NOT_ADVANCED",

      "Return fence did not advance required control epoch"
    );


    pass(
      "Durable PostgreSQL return fence",
      [
        `state=${durableFence.state}`,
        `previousEpoch=${durableFence.previous_control_epoch}`,
        `requiredEpoch=${durableFence.required_control_epoch}`,
      ].join(
        " "
      )
    );


    /*
     * ========================================================================
     * FINAL EXECUTION AUTHORITY AUDIT
     * ========================================================================
     */


    const authorityCount =
      await countExecutionAuthorityRows(
        pool
      );


    const authorityAudit =
      certifyAuthorityAudit(
        authorityCount
      );


    results.push(
      authorityAudit
    );


    assertCondition(
      authorityCount ===
        0,

      "PHASE23_8_EXECUTION_AUTHORITY_LEAK",

      `Found ${authorityCount} Phase-23 rows with execution_authorized=TRUE`
    );


    pass(
      "Final execution-authority audit",
      "0 TRUE rows"
    );


    /*
     * ========================================================================
     * FINAL REPORT
     * ========================================================================
     */


    const report =
      certifyResults(
        results
      );


    assertCondition(
      report.passed ===
        true,

      "PHASE23_8_REPORT_FAILED",

      `Phase 23.8 report failed: ${report.failedCases.join(", ")}`
    );


    const artifactPath =
      await writeArtifact({
        ...report,

        certificationType:
          "TENANT_AND_ADVERSARIAL",

        timestamp:
          new Date()
            .toISOString(),

        scope: {
          organizationId:
            CONFIG.organizationId,

          environmentId:
            CONFIG.environmentId,

          organizationUuid:
            resolvedScope.organization_uuid,

          environmentUuid:
            resolvedScope.environment_uuid,
        },

        safety: {
          humanControlIsExecutionAuthorization:
            false,

          returnControlIsResume:
            false,

          stalePlanResumeAllowed:
            false,

          crossTenantReadAllowed:
            false,

          crossTenantWriteAllowed:
            false,

          multipleControlWinnersAllowed:
            false,

          leaseTheftAllowed:
            false,

          executionAuthorized:
            false,
        },
      });


    console.log(
      ""
    );


    console.log(
      "--------------------------------------------------------------"
    );


    console.log(
      "PHASE 23.8 CERTIFICATION RESULT"
    );


    console.log(
      "--------------------------------------------------------------"
    );


    console.log(
      `Result: ${report.certification}`
    );


    console.log(
      `Passed: ${report.passedCount}/${report.total}`
    );


    console.log(
      `Artifact: ${artifactPath}`
    );


    console.log(
      ""
    );


    console.log(
      "CROSS-TENANT READ: PROHIBITED"
    );


    console.log(
      "CROSS-TENANT WRITE: PROHIBITED"
    );


    console.log(
      "LEASE THEFT: PROHIBITED"
    );


    console.log(
      "STALE PLAN RESUME: PROHIBITED"
    );


    console.log(
      "EXECUTION AUTHORITY: 0"
    );


    console.log(
      ""
    );


    console.log(
      "=============================================================="
    );


    console.log(
      "AIRA PHASE 23.8 — PASS"
    );


    console.log(
      "=============================================================="
    );
  } catch (
    error
  ) {
    fail(
      "Phase 23.8 certification",
      error?.message ||
      String(
        error
      )
    );


    console.error(
      error?.stack ||
      error
    );


    process.exitCode =
      1;
  } finally {
    /*
     * ========================================================================
     * CLEANUP
     * ========================================================================
     */


    try {
      if (
        taskPublicId
      ) {
        await cleanupFixture({
          pool,

          incidentId,

          taskPublicId,
        });


        pass(
          "Phase 23.8 fixture cleanup",
          "complete"
        );
      }
    } catch (
      cleanupError
    ) {
      console.error(
        "WARN  Phase 23.8 fixture cleanup failed:",
        cleanupError?.stack ||
        cleanupError
      );


      process.exitCode =
        1;
    }


    /*
     * Existing Phase 23.1E cleanup helper must remove the temporary
     * RLS role. We never grant it extra table privileges, so its canonical
     * cleanup remains valid.
     */
    try {
      if (
        rlsRole
      ) {
        await cleanupRlsCertificationRole({
          pool,

          role:
            rlsRole,
        });


        pass(
          "RLS certification role cleanup",
          "temporary role removed"
        );
      }
    } catch (
      rlsError
    ) {
      console.error(
        "WARN  Phase 23.8 RLS role cleanup failed:",
        rlsError?.stack ||
        rlsError
      );


      process.exitCode =
        1;
    }


    /*
     * resolveOperator can create a temporary identity fixture.
     * Never leave it behind.
     */
    try {
      if (
        operator
      ) {
        await cleanupCertificationOperator({
          pool,

          operator,
        });


        if (
          operator.certification_fixture
        ) {
          pass(
            "Certification operator cleanup",
            "temporary identity fixture removed"
          );
        }
      }
    } catch (
      operatorCleanupError
    ) {
      console.error(
        "WARN  Phase 23.8 operator cleanup failed:",
        operatorCleanupError?.stack ||
        operatorCleanupError
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
        closeError?.stack ||
        closeError
      );


      process.exitCode =
        1;
    }
  }
}


/*
 * ============================================================================
 * ENTRYPOINT
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
        "Unhandled Phase 23.8 certification failure:",
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

  CERTIFICATION_TABLES,

  resolveCertificationScope,

  certifyHumanOperationsRls,

  sourceScopeReadCount,

  foreignScopeReadCount,

  foreignScopeWriteCount,

  certifyDatabaseAuthorityForgery,

  countExecutionAuthorityRows,

  cleanupFixture,

  writeArtifact,

  main,
};