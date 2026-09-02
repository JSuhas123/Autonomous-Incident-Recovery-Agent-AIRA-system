"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.9
 * FINAL CLOSED-LOOP LIVE CERTIFICATION
 * ============================================================================
 *
 * This is the final Phase-23 certification.
 *
 * It composes the independently live-certified safety blocks and then
 * performs a final PostgreSQL authority audit.
 *
 * NO INFRASTRUCTURE RECOVERY IS EXECUTED.
 *
 * ============================================================================
 */


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  spawnSync,
} =
  require(
    "node:child_process"
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


const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../persistence/postgres"
  );


const {
  certifyPhase23Final,

  certifyAuthorityCount,

  certifyRlsState,

  certifySchemaState,
} =
  require(
    "../services/certification/phase23FinalCertificationService"
  );


const PHASE23_TABLES =
  Object.freeze([
    "tasks",

    "assignments",

    "acknowledgements",

    "resolutions",

    "takeover_sessions",

    "control_leases",

    "task_status_history",

    "takeover_events",

    "escalations",

    "incident_handoff_packages",

    "control_return_fences",
  ]);


const REQUIRED_MIGRATIONS =
  Object.freeze([
    "0088_human_takeover_domain.sql",

    "0089_human_escalation_engine.sql",

    "0090_human_escalation_reliability.sql",

    "0091_phase23_notification_platform.sql",

    "0092_incident_handoff_packages.sql",

    "0093_control_return_fresh_evaluation.sql",
  ]);


const LIVE_CERTIFICATIONS =
  Object.freeze([
    {
      id:
        "PHASE23_1_LIVE_CONTROL_FOUNDATION",

      script:
        "certify-phase23-1-live.js",
    },

    {
      id:
        "PHASE23_1F_DURABLE_LEASE_EXPIRY",

      script:
        "certify-phase23-1f-lease-expiry-live.js",
    },

    {
      id:
        "PHASE23_8_TENANT_ADVERSARIAL",

      script:
        "certify-phase23-8-adversarial-live.js",
    },
  ]);


const ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase23"
  );


function pass(
  name,
  detail =
    ""
) {
  console.log(
    `PASS  ${name}${
      detail
        ? ` — ${detail}`
        : ""
    }`
  );
}


function fail(
  name,
  detail =
    ""
) {
  console.error(
    `FAIL  ${name}${
      detail
        ? ` — ${detail}`
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

      stalePlanResumeAllowed:
        false,

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

    "PHASE23_FINAL_UNSAFE_SQL_IDENTIFIER",

    `Unsafe SQL identifier: ${text}`
  );


  return `"${text}"`;
}


function runLiveCertification({
  id,
  script,
}) {
  const absolutePath =
    path.resolve(
      __dirname,
      script
    );


  assertCondition(
    fs.existsSync(
      absolutePath
    ),

    "PHASE23_FINAL_LIVE_SCRIPT_MISSING",

    `Required live certification script missing: ${script}`
  );


  console.log(
    ""
  );


  console.log(
    "--------------------------------------------------------------"
  );


  console.log(
    `RUN ${id}`
  );


  console.log(
    "--------------------------------------------------------------"
  );


  const result =
    spawnSync(
      process.execPath,
      [
        absolutePath,
      ],
      {
        cwd:
          path.resolve(
            __dirname,
            ".."
          ),

        env:
          process.env,

        encoding:
          "utf8",

        stdio: [
          "inherit",
          "pipe",
          "pipe",
        ],
      }
    );


  if (
    result.stdout
  ) {
    process.stdout.write(
      result.stdout
    );
  }


  if (
    result.stderr
  ) {
    process.stderr.write(
      result.stderr
    );
  }


  const passed =
    result.status ===
      0;


  return {
    id,

    passed,

    expected:
      0,

    observed:
      result.status,

    detail:
      passed
        ? `${script} exited successfully`
        : `${script} exited with status ${result.status}`,

    executionAuthorized:
      false,
  };
}


function verifyMigrationFiles() {
  const migrationDirectory =
    path.resolve(
      __dirname,
      "../persistence/postgres/migrations"
    );


  const missing =
    REQUIRED_MIGRATIONS.filter(
      (
        filename
      ) =>
        !fs.existsSync(
          path.join(
            migrationDirectory,
            filename
          )
        )
    );


  assertCondition(
    missing.length ===
      0,

    "PHASE23_FINAL_MIGRATION_FILES_MISSING",

    `Missing Phase-23 migrations: ${missing.join(", ")}`
  );


  pass(
    "Phase 23 migrations",
    `${REQUIRED_MIGRATIONS.length}/${REQUIRED_MIGRATIONS.length} present`
  );
}


async function getSchemaTables(
  pool
) {
  const result =
    await pool.query(
      `
        SELECT
          table_name

        FROM
          information_schema.tables

        WHERE
          table_schema =
            'human_operations'

          AND
          table_name =
            ANY($1::text[])

        ORDER BY
          table_name
      `,
      [
        PHASE23_TABLES,
      ]
    );


  return result.rows.map(
    (
      row
    ) =>
      row.table_name
  );
}


async function getRlsState(
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
        PHASE23_TABLES,
      ]
    );


  return result.rows.map(
    (
      row
    ) => ({
      tableName:
        row.table_name,

      rlsEnabled:
        row.rls_enabled ===
        true,

      rlsForced:
        row.rls_forced ===
        true,
    })
  );
}


async function countExecutionAuthorityRows(
  pool
) {
  const result =
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
    of result.rows
  ) {
    const tableName =
      safeIdentifier(
        row.table_name
      );


    const countResult =
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
        countResult.rows[0]
          ?.count ||
        0
      );
  }


  return total;
}


async function certifyActiveLeaseUniqueness(
  pool
) {
  const result =
    await pool.query(
      `
        SELECT
          incident_id,

          COUNT(*)::integer
            AS active_count

        FROM
          human_operations.control_leases

        WHERE
          status =
            'ACTIVE'

        GROUP BY
          incident_id

        HAVING
          COUNT(*) > 1
      `
    );


  return {
    id:
      "PHASE23_ACTIVE_LEASE_UNIQUENESS",

    passed:
      result.rows.length ===
      0,

    expected:
      "maximum 1 ACTIVE lease per incident",

    observed:
      result.rows,

    executionAuthorized:
      false,
  };
}


async function certifyReturnFence(
  pool
) {
  const trigger =
    await pool.query(
      `
        SELECT
          COUNT(*)::integer
            AS count

        FROM
          pg_trigger t

        JOIN
          pg_class c
        ON
          c.oid =
            t.tgrelid

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
            'control_leases'

          AND
          t.tgname =
            'trg_control_return_fence'

          AND
          NOT t.tgisinternal
      `
    );


  const present =
    Number(
      trigger.rows[0]
        ?.count ||
      0
    ) ===
    1;


  return {
    id:
      "PHASE23_RETURN_CONTROL_FENCE",

    passed:
      present,

    expected:
      "trg_control_return_fence present",

    observed:
      present,

    executionAuthorized:
      false,
  };
}


async function certifyStalePlanFence(
  pool
) {
  const result =
    await pool.query(
      `
        SELECT
          COUNT(*)::integer
            AS violation_count

        FROM
          human_operations.control_return_fences

        WHERE
          stale_plan_resume_allowed =
            TRUE

           OR
          execution_authorized =
            TRUE
      `
    );


  const violations =
    Number(
      result.rows[0]
        ?.violation_count ||
      0
    );


  return {
    id:
      "PHASE23_STALE_PLAN_FENCE",

    passed:
      violations ===
      0,

    expected:
      0,

    observed:
      violations,

    stalePlanResumeAllowed:
      false,

    executionAuthorized:
      false,
  };
}


async function writeFinalArtifact(
  report
) {
  fs.mkdirSync(
    ARTIFACT_DIRECTORY,
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


  const filename =
    `phase23-final-live-certification-${timestamp}.json`;


  const artifactPath =
    path.join(
      ARTIFACT_DIRECTORY,
      filename
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


async function main() {
  console.log(
    ""
  );


  console.log(
    "=============================================================="
  );


  console.log(
    "AIRA PHASE 23.9 — FINAL CLOSED-LOOP LIVE CERTIFICATION"
  );


  console.log(
    "=============================================================="
  );


  console.log(
    "CAPABILITY != AUTHORITY"
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
    "PHASE 23 EXECUTION AUTHORITY: MUST REMAIN ZERO"
  );


  console.log(
    ""
  );


  const certifications =
    [];


  let pool =
    null;


  try {
    /*
     * ========================================================================
     * SOURCE + MIGRATION FREEZE
     * ========================================================================
     */


    verifyMigrationFiles();


    /*
     * ========================================================================
     * RE-RUN INDEPENDENT LIVE SAFETY CERTIFICATIONS
     * ========================================================================
     */


    for (
      const certification
      of LIVE_CERTIFICATIONS
    ) {
      const result =
        runLiveCertification(
          certification
        );


      certifications.push(
        result
      );


      assertCondition(
        result.passed,

        "PHASE23_FINAL_CHILD_CERTIFICATION_FAILED",

        `${certification.id} failed`
      );


      pass(
        certification.id,
        "LIVE PASS"
      );
    }


    /*
     * ========================================================================
     * FINAL DATABASE STATE
     * ========================================================================
     */


    pool =
      getPostgresPool();


    const existingTables =
      await getSchemaTables(
        pool
      );


    const schemaCertification =
      certifySchemaState({
        expectedTables:
          PHASE23_TABLES,

        existingTables,
      });


    certifications.push(
      schemaCertification
    );


    assertCondition(
      schemaCertification.passed,

      "PHASE23_FINAL_SCHEMA_FAILED",

      `Missing Phase-23 tables: ${
        schemaCertification
          .observed
          .missing
          .join(", ")
      }`
    );


    pass(
      "Phase 23 authoritative schema",
      `${PHASE23_TABLES.length}/${PHASE23_TABLES.length} tables present`
    );


    const rlsState =
      await getRlsState(
        pool
      );


    const rlsCertification =
      certifyRlsState({
        expectedTables:
          PHASE23_TABLES,

        observedTables:
          rlsState,
      });


    certifications.push(
      rlsCertification
    );


    assertCondition(
      rlsCertification.passed,

      "PHASE23_FINAL_RLS_FAILED",

      "One or more Phase-23 tables do not have ENABLE + FORCE RLS"
    );


    pass(
      "Phase 23 RLS",
      "all authoritative tables ENABLED + FORCED"
    );


    /*
     * ========================================================================
     * ACTIVE LEASE UNIQUENESS
     * ========================================================================
     */


    const leaseUniqueness =
      await certifyActiveLeaseUniqueness(
        pool
      );


    certifications.push(
      leaseUniqueness
    );


    assertCondition(
      leaseUniqueness.passed,

      "PHASE23_FINAL_MULTIPLE_ACTIVE_LEASES",

      "Multiple ACTIVE control leases found for an incident"
    );


    pass(
      "Active lease uniqueness",
      "maximum 1 ACTIVE lease per incident"
    );


    /*
     * ========================================================================
     * RETURN CONTROL FENCE
     * ========================================================================
     */


    const returnFence =
      await certifyReturnFence(
        pool
      );


    certifications.push(
      returnFence
    );


    assertCondition(
      returnFence.passed,

      "PHASE23_FINAL_RETURN_FENCE_MISSING",

      "Control-return trigger is missing"
    );


    pass(
      "Return-control trigger",
      "durable fresh-evaluation fence present"
    );


    /*
     * ========================================================================
     * STALE PLAN FENCE
     * ========================================================================
     */


    const staleFence =
      await certifyStalePlanFence(
        pool
      );


    certifications.push(
      staleFence
    );


    assertCondition(
      staleFence.passed,

      "PHASE23_FINAL_STALE_PLAN_VIOLATION",

      `Found ${staleFence.observed} stale-plan/authority fence violations`
    );


    pass(
      "Stale-plan fence audit",
      "0 violations"
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

    const authorityCertification =
      certifyAuthorityCount(
        authorityCount
      );


    /*
     * The final live certifier explicitly freezes the canonical
     * Phase-23 authority-audit identity.
     *
     * This prevents a helper refactor from silently replacing or
     * weakening the mandatory final execution-authority gate.
     */
    assertCondition(
      authorityCertification.id ===
        "PHASE23_EXECUTION_AUTHORITY_AUDIT",

      "PHASE23_FINAL_AUTHORITY_CERTIFICATION_ID_INVALID",

      [
        "Unexpected execution-authority certification id:",
        authorityCertification.id,
      ].join(
        " "
      )
    );


    certifications.push(
      authorityCertification
    );


    assertCondition(
      authorityCertification.passed,

      "PHASE23_FINAL_EXECUTION_AUTHORITY_LEAK",

      `Found ${authorityCount} human_operations rows with execution_authorized=TRUE`
    );


    pass(
      "Final execution-authority audit",
      "0 TRUE rows"
    );


    /*
     * ========================================================================
     * FINAL FREEZE CERTIFICATION
     * ========================================================================
     */


    certifications.push({
      id:
        "PHASE23_FINAL_FREEZE",

      passed:
        true,

      expected:
        "PHASE 23 may freeze only after all safety certifications pass",

      observed:
        "all preceding certification gates passed",

      executionAuthorized:
        false,
    });


    const report =
      certifyPhase23Final(
        certifications
      );


    assertCondition(
      report.passed,

      "PHASE23_FINAL_CERTIFICATION_FAILED",

      `Failed final certifications: ${report.failedCases.join(", ")}`
    );


    const artifactPath =
      await writeFinalArtifact({
        ...report,

        timestamp:
          new Date()
            .toISOString(),

        certificationType:
          "PHASE23_FINAL_CLOSED_LOOP",

        architecture: {
          transactionalAuthority:
            "PostgreSQL",

          coordination:
            "Redis",

          eventTransport:
            "RabbitMQ",

          vectorMemory:
            "Qdrant",
        },

        permanentSafetyLaws: {
          assignmentIsControl:
            false,

          acknowledgementIsControl:
            false,

          notificationIsControl:
            false,

          handoffIsControl:
            false,

          takeoverRequestIsControl:
            false,

          takeoverAuthorizationIsControl:
            false,

          activeLeaseIsHumanControlAuthority:
            true,

          humanControlIsExecutionAuthorization:
            false,

          returnControlIsResume:
            false,

          stalePlanResumeAllowed:
            false,

          executionAuthorized:
            false,
        },

        phase23Frozen:
          true,
      });


    console.log(
      ""
    );


    console.log(
      "--------------------------------------------------------------"
    );


    console.log(
      "PHASE 23 FINAL CERTIFICATION"
    );


    console.log(
      "--------------------------------------------------------------"
    );


    console.log(
      `Result: ${report.certification}`
    );


    console.log(
      `Certifications: ${report.passedCount}/${report.total}`
    );


    console.log(
      `Frozen: ${report.frozen ? "YES" : "NO"}`
    );


    console.log(
      `Artifact: ${artifactPath}`
    );


    console.log(
      ""
    );


    console.log(
      "ASSIGNMENT != CONTROL"
    );


    console.log(
      "ACKNOWLEDGEMENT != CONTROL"
    );


    console.log(
      "NOTIFICATION != CONTROL"
    );


    console.log(
      "HANDOFF != CONTROL"
    );


    console.log(
      "TAKEOVER AUTHORIZATION != CONTROL"
    );


    console.log(
      "ACTIVE POSTGRES LEASE = HUMAN CONTROL AUTHORITY"
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
      "EXECUTION AUTHORITY: 0"
    );


    console.log(
      ""
    );


    console.log(
      "=============================================================="
    );


    console.log(
      "AIRA PHASE 23 — FINAL PASS / FROZEN"
    );


    console.log(
      "=============================================================="
    );
  } catch (
    error
  ) {
    fail(
      "Phase 23 final certification",
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
    if (
      pool
    ) {
      try {
        await closePostgresPool();
      } catch (
        closeError
      ) {
        console.error(
          "WARN  PostgreSQL close failed:",
          closeError?.stack ||
          closeError
        );


        process.exitCode =
          1;
      }
    }
  }
}


if (
  require.main ===
  module
) {
  main().catch(
    async (
      error
    ) => {
      console.error(
        "Unhandled Phase 23 final certification failure:",
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


module.exports = {
  PHASE23_TABLES,

  REQUIRED_MIGRATIONS,

  LIVE_CERTIFICATIONS,

  runLiveCertification,

  verifyMigrationFiles,

  getSchemaTables,

  getRlsState,

  countExecutionAuthorityRows,

  certifyActiveLeaseUniqueness,

  certifyReturnFence,

  certifyStalePlanFence,

  writeFinalArtifact,

  main,
};