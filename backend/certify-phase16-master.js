#!/usr/bin/env node
"use strict";


require(
  "dotenv"
).config();


const fs =
  require(
    "node:fs"
  );


const {
  spawnSync,
} =
  require(
    "node:child_process"
  );


const {
  getPostgresPool,
} =
  require(
    "./persistence/postgres/postgresPool"
  );


const {
  closePostgresPool,
} =
  require(
    "./persistence/postgres"
  );


const REPORT_PATH =
  "phase16-master-certification-results.txt";


const report =
  [];


const checks =
  [];


function log(
  value =
    ""
) {
  const text =
    typeof value ===
      "string"
      ? value
      : JSON.stringify(
          value,
          null,
          2
        );


  console.log(
    text
  );


  report.push(
    text
  );
}


function section(
  title
) {
  log(
    "\n" +
    "=".repeat(
      78
    )
  );

  log(
    title
  );

  log(
    "=".repeat(
      78
    )
  );
}


function check(
  name,
  condition,
  detail =
    null
) {
  const passed =
    Boolean(
      condition
    );


  checks.push({
    name,
    passed,
  });


  log(
    `${
      passed
        ? "✓"
        : "✗"
    } ${name}`
  );


  if (
    detail
  ) {
    log(
      `  ${detail}`
    );
  }
}


function runCommand(
  name,
  command,
  args
) {
  section(
    name
  );


  const result =
    spawnSync(
      command,
      args,
      {
        cwd:
          process.cwd(),

        encoding:
          "utf8",

        shell:
          process.platform ===
          "win32",
      }
    );


  if (
    result.stdout
  ) {
    log(
      result.stdout
    );
  }


  if (
    result.stderr
  ) {
    log(
      result.stderr
    );
  }


  const passed =
    result.status ===
      0;


  check(
    `${name} passed`,
    passed,
    `exitCode=${result.status}`
  );


  return passed;
}


async function verifyArchitecture(
  pool
) {
  section(
    "VERIFY PHASE 16 DATABASE ARCHITECTURE"
  );


  const result =
    await pool.query(
      `
        SELECT
          to_regclass(
            'memory.memories'
          ) AS memories,

          to_regclass(
            'memory.memory_sources'
          ) AS memory_sources,

          to_regclass(
            'memory.retrieval_audit'
          ) AS retrieval_audit,

          to_regclass(
            'memory.system_dna_snapshots'
          ) AS system_dna_snapshots
      `
    );


  const row =
    result.rows[0];


  check(
    "Canonical memories table exists",
    row.memories ===
      "memory.memories"
  );


  check(
    "Memory provenance table exists",
    row.memory_sources ===
      "memory.memory_sources"
  );


  check(
    "Retrieval audit table exists",
    row.retrieval_audit ===
      "memory.retrieval_audit"
  );


  check(
    "System DNA snapshot table exists",
    row.system_dna_snapshots ===
      "memory.system_dna_snapshots"
  );


  const families =
    await pool.query(
      `
        SELECT
          memory_type,
          COUNT(*)::int AS count

        FROM memory.memories m

        JOIN tenancy.organizations o
          ON o.id =
            m.organization_id

        WHERE
          o.public_id =
            'aira-dev-org'

          AND m.status =
            'ACTIVE'

        GROUP BY
          memory_type
      `
    );


  const map =
    Object.fromEntries(
      families.rows.map(
        (
          row
        ) => [
          row.memory_type,
          row.count,
        ]
      )
    );


  for (
    const family
    of [
      "EPISODIC",
      "OUTCOME",
      "PROCEDURAL",
      "SEMANTIC",
      "HUMAN",
      "BEHAVIOURAL",
    ]
  ) {
    check(
      `${family} canonical memory exists`,
      Number(
        map[
          family
        ] ||
        0
      ) >
        0
    );
  }


  const dna =
    await pool.query(
      `
        SELECT
          COUNT(*)::int AS count

        FROM memory.system_dna_snapshots d

        JOIN tenancy.organizations o
          ON o.id =
            d.organization_id

        WHERE
          o.public_id =
            'aira-dev-org'

          AND d.status =
            'ACTIVE'
      `
    );


  check(
    "At least one ACTIVE System DNA snapshot exists",
    Number(
      dna.rows[0]
        ?.count ||
      0
    ) >
      0
  );
}


function finalReport() {
  section(
    "PHASE 16 MASTER CERTIFICATION CHECKLIST"
  );


  let passed =
    0;


  let failed =
    0;


  for (
    const item
    of checks
  ) {
    if (
      item.passed
    ) {
      passed +=
        1;

      log(
        `[PASS] ${item.name}`
      );

    } else {
      failed +=
        1;

      log(
        `[FAIL] ${item.name}`
      );
    }
  }


  section(
    "FINAL PHASE 16 CERTIFICATION RESULT"
  );


  log(
    `Passed: ${passed}`
  );


  log(
    `Failed: ${failed}`
  );


  if (
    failed ===
      0
  ) {
    log(
      "\n✓✓✓ AIRA PHASE 16 — OPERATIONAL MEMORY & SYSTEM DNA — CERTIFIED ✓✓✓"
    );


    log(
      "\nCertified architecture:"
    );


    log(
      "PostgreSQL → authoritative operational memory"
    );

    log(
      "Qdrant → retrieval acceleration only"
    );

    log(
      "EPISODIC → incident history"
    );

    log(
      "OUTCOME → recovery results"
    );

    log(
      "PROCEDURAL → proven recovery knowledge"
    );

    log(
      "SEMANTIC → learned operational relationships"
    );

    log(
      "HUMAN → operator intervention history"
    );

    log(
      "BEHAVIOURAL → tenant/service baselines"
    );

    log(
      "System DNA → derived operational identity"
    );

    log(
      "Memory/DNA → evidence only"
    );

    log(
      "Execution → policy + authorization remain mandatory"
    );


    return true;
  }


  log(
    "\n✗✗✗ PHASE 16 MASTER CERTIFICATION FAILED ✗✗✗"
  );


  return false;
}


async function main() {
  const pool =
    getPostgresPool();


  try {
    section(
      "AIRA PHASE 16 — MASTER CERTIFICATION"
    );


    runCommand(
      "Phase 16 unit regression",
      "npx",
      [
        "jest",
        "phase16",
        "--runInBand",
        "--forceExit",
      ]
    );


    runCommand(
      "Phase 16.14 integrated certification",
      "node",
      [
        "certify-phase16-14-live.js",
      ]
    );


    runCommand(
      "Phase 16.15 System DNA certification",
      "node",
      [
        "certify-phase16-15-live.js",
      ]
    );


    await verifyArchitecture(
      pool
    );


    const certified =
      finalReport();


    fs.writeFileSync(
      REPORT_PATH,
      report.join(
        "\n"
      ),
      "utf8"
    );


    log(
      `\nReport written to: ${REPORT_PATH}`
    );


    if (
      !certified
    ) {
      process.exitCode =
        1;
    }

  } catch (
    error
  ) {
    section(
      "MASTER CERTIFICATION ERROR"
    );


    log({
      code:
        error.code,

      message:
        error.message,

      detail:
        error.detail,

      stack:
        error.stack,
    });


    fs.writeFileSync(
      REPORT_PATH,
      report.join(
        "\n"
      ),
      "utf8"
    );


    process.exitCode =
      1;

  } finally {
    await closePostgresPool();
  }
}


main();