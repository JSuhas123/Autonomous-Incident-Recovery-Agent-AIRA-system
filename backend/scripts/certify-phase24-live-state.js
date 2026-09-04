"use strict";


const fs =
  require(
    "node:fs"
  );


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


const {
  getPostgresPool,
  closePostgresPool,
} = require(
  "../persistence/postgres"
);


const {
  certificationResult,
} = require(
  "../services/humanLearning/learningCertificationService"
);


const VERSION =
  "24.9.LIVE.1";


const REQUIRED_TABLES = [
  "intervention_sessions",
  "intervention_events",
  "source_bundles",

  "knowledge_candidates",
  "candidate_lineage",
  "candidate_status_history",

  "validation_runs",
  "validation_stages",
  "validation_evidence",
  "replay_bindings",

  "generalization_requests",
  "generalization_artifacts",
  "generalization_isolation_checks",
  "generalization_reviews",

  "evidence_trust_assessments",
  "poisoning_findings",
  "outcome_verifications",

  "review_tasks",
  "review_decisions",
  "knowledge_publications",
  "knowledge_revocations",

  "certification_runs",
  "certification_evidence",
];


async function main()
{
  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 24.9 — LIVE POSTGRESQL STATE CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );


  const pool =
    getPostgresPool();


  const checks =
    [];


  const tableResult =
    await pool.query(
      `
        SELECT
          c.relname AS tablename,

          c.relrowsecurity AS rowsecurity,

          c.relforcerowsecurity AS forcerowsecurity

        FROM
          pg_class c

        JOIN
          pg_namespace n
            ON n.oid =
               c.relnamespace

        WHERE
          n.nspname =
            'learning'

          AND

          c.relkind =
            'r'

        ORDER BY
          c.relname
      `
    );


  const tableMap =
    new Map(
      tableResult.rows.map(
        (
          row
        ) => [
          row.tablename,
          row,
        ]
      )
    );


  for (
    const tableName
    of REQUIRED_TABLES
  ) {
    const row =
      tableMap.get(
        tableName
      );


    checks.push({
      name:
        `table:${tableName}`,

      passed:
        Boolean(
          row
          &&
          row.rowsecurity ===
            true
          &&
          row.forcerowsecurity ===
            true
        ),
    });
  }


  const authorityResult =
    await pool.query(
      `
        SELECT
          COUNT(*)::int AS violation_count

        FROM (
          SELECT execution_authorized
          FROM learning.intervention_sessions

          UNION ALL

          SELECT execution_authorized
          FROM learning.intervention_events

          UNION ALL

          SELECT execution_authorized
          FROM learning.source_bundles

          UNION ALL

          SELECT execution_authorized
          FROM learning.knowledge_candidates

          UNION ALL

          SELECT execution_authorized
          FROM learning.validation_runs

          UNION ALL

          SELECT execution_authorized
          FROM learning.generalization_requests

          UNION ALL

          SELECT execution_authorized
          FROM learning.generalization_artifacts

          UNION ALL

          SELECT execution_authorized
          FROM learning.evidence_trust_assessments

          UNION ALL

          SELECT execution_authorized
          FROM learning.poisoning_findings

          UNION ALL

          SELECT execution_authorized
          FROM learning.outcome_verifications

          UNION ALL

          SELECT execution_authorized
          FROM learning.review_tasks

          UNION ALL

          SELECT execution_authorized
          FROM learning.review_decisions

          UNION ALL

          SELECT execution_authorized
          FROM learning.knowledge_publications

          UNION ALL

          SELECT execution_authorized
          FROM learning.knowledge_revocations

          UNION ALL

          SELECT execution_authorized
          FROM learning.certification_runs
        ) q

        WHERE
          execution_authorized =
            TRUE
      `
    );


  checks.push({
    name:
      "database-zero-execution-authority",

    passed:
      authorityResult
        .rows[0]
        .violation_count ===
      0,
  });


  const globalWriteFunction =
    await pool.query(
      `
        SELECT
          pg_get_functiondef(
            'knowledge.scope_writable(text,uuid,uuid)'
              ::regprocedure
          ) AS definition
      `
    );


  const functionText =
    globalWriteFunction
      .rows[0]
      .definition;


  checks.push({
    name:
      "phase18-global-write-remains-controlled",

    passed:
      functionText.includes(
        "ORGANIZATION"
      )
      &&
      functionText.includes(
        "ENVIRONMENT"
      )
      &&
      !functionText.includes(
        "p_scope_type = 'GLOBAL'"
      ),
  });


  const candidateTruth =
    await pool.query(
      `
        SELECT
          COUNT(*)::int AS violation_count

        FROM
          learning.knowledge_candidates

        WHERE
          truth_level <>
            'CANDIDATE'

          OR

          execution_authorized <>
            FALSE
      `
    );


  checks.push({
    name:
      "candidate-truth-boundary",

    passed:
      candidateTruth
        .rows[0]
        .violation_count ===
      0,
  });


  const globalArtifact =
    await pool.query(
      `
        SELECT
          COUNT(*)::int AS violation_count

        FROM
          learning.generalization_artifacts

        WHERE
          proposed_scope <>
            'GLOBAL'

          OR

          truth_level <>
            'CANDIDATE'

          OR

          publication_eligible <>
            FALSE

          OR

          requires_independent_validation <>
            TRUE

          OR

          execution_authorized <>
            FALSE
      `
    );


  checks.push({
    name:
      "global-generalization-quarantine-boundary",

    passed:
      globalArtifact
        .rows[0]
        .violation_count ===
      0,
  });


  const publicationAuthority =
    await pool.query(
      `
        SELECT
          COUNT(*)::int AS violation_count

        FROM
          learning.knowledge_publications

        WHERE
          execution_authorized <>
            FALSE
      `
    );


  checks.push({
    name:
      "publication-does-not-authorize",

    passed:
      publicationAuthority
        .rows[0]
        .violation_count ===
      0,
  });


  const passed =
    checks.every(
      (
        check
      ) =>
        check.passed
    );


  const artifact =
    certificationResult({
      version:
        VERSION,

      certificationType:
        "LIVE_STATE",

      passed,

      checks,
    });


  const outputDirectory =
    path.join(
      __dirname,
      "..",
      "artifacts",
      "phase24"
    );


  fs.mkdirSync(
    outputDirectory,
    {
      recursive:
        true,
    }
  );


  const outputPath =
    path.join(
      outputDirectory,

      `phase24-live-state-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`
    );


  fs.writeFileSync(
    outputPath,

    JSON.stringify(
      artifact,
      null,
      2
    )
  );


  for (
    const check
    of checks
  ) {
    console.log(
      `${check.passed ? "PASS" : "FAIL"}  ${check.name}`
    );
  }


  console.log(
    ""
  );

  console.log(
    "STATUS:",
    artifact.status
  );

  console.log(
    "CERTIFICATION HASH:",
    artifact.certificationHash
  );

  console.log(
    "ARTIFACT:",
    outputPath
  );


  if (
    !passed
  ) {
    process.exitCode =
      1;
  }
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        "[phase24-live-state] FAILED",
        {
          code:
            error.code,

          message:
            error.message,

          details:
            error.details ||
            null,
        }
      );


      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      await closePostgresPool()
        .catch(
          () => {}
        );
    }
  );