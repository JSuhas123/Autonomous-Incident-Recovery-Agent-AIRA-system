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


const {
  rebuildSystemDna,
} =
  require(
    "./services/memory/dna/postgresSystemDnaService"
  );


const ORGANIZATION_ID =
  "aira-dev-org";


const ENVIRONMENT_ID =
  "env_aira_development";


const SERVICE_ID =
  "phase16-certification-service";


const REPORT_PATH =
  "phase16-15-certification-results.txt";


const checks =
  [];


const report =
  [];


function log(
  ...values
) {
  const line =
    values
      .map(
        (
          value
        ) =>
          typeof value ===
            "string"
            ? value
            : JSON.stringify(
                value,
                null,
                2
              )
      )
      .join(
        " "
      );


  console.log(
    line
  );


  report.push(
    line
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
    detail,
  });


  log(
    `${
      passed
        ? "✓"
        : "✗"
    } ${name}`
  );


  if (
    detail !==
      null &&
    detail !==
      undefined
  ) {
    log(
      `  ${detail}`
    );
  }


  return passed;
}


async function resolveIdentity(
  pool
) {
  section(
    "STEP 1 — RESOLVE REAL TENANT / ENVIRONMENT"
  );


  const result =
    await pool.query(
      `
        SELECT
          o.id AS organization_uuid,
          o.public_id AS organization_public_id,
          e.id AS environment_uuid,
          e.public_id AS environment_public_id

        FROM tenancy.organizations o

        JOIN tenancy.environments e
          ON e.organization_id =
            o.id

        WHERE
          o.public_id =
            $1

          AND e.public_id =
            $2

        LIMIT 1
      `,
      [
        ORGANIZATION_ID,
        ENVIRONMENT_ID,
      ]
    );


  const identity =
    result.rows[0];


  check(
    "Organization resolved",
    Boolean(
      identity
    )
  );


  if (
    !identity
  ) {
    throw new Error(
      "Phase 16 certification tenant not found"
    );
  }


  check(
    "Organization public ID correct",
    identity.organization_public_id ===
      ORGANIZATION_ID
  );


  check(
    "Environment public ID correct",
    identity.environment_public_id ===
      ENVIRONMENT_ID
  );


  log({
    organizationUuid:
      identity.organization_uuid,

    environmentUuid:
      identity.environment_uuid,
  });


  return identity;
}


async function verifyDnaSchema(
  pool
) {
  section(
    "STEP 2 — VERIFY SYSTEM DNA DATABASE SCHEMA"
  );


  const result =
    await pool.query(
      `
        SELECT
          to_regclass(
            'memory.system_dna_snapshots'
          ) AS dna_table
      `
    );


  check(
    "System DNA snapshot table exists",
    result.rows[0]
      ?.dna_table ===
      "memory.system_dna_snapshots"
  );


  const columns =
    await pool.query(
      `
        SELECT
          column_name

        FROM information_schema.columns

        WHERE
          table_schema =
            'memory'

          AND table_name =
            'system_dna_snapshots'
      `
    );


  const names =
    columns.rows.map(
      (
        row
      ) =>
        row.column_name
    );


  for (
    const column
    of [
      "organization_id",
      "tenant_public_id",
      "scope_type",
      "fingerprint",
      "trust_score",
      "confidence",
      "evidence_count",
      "dna",
      "provenance",
      "status",
    ]
  ) {
    check(
      `DNA column exists: ${column}`,
      names.includes(
        column
      )
    );
  }
}


async function buildServiceDna(
  identity
) {
  section(
    "STEP 3 — BUILD REAL SERVICE SYSTEM DNA"
  );


  const result =
    await rebuildSystemDna({
      organizationId:
        ORGANIZATION_ID,

      canonicalOrganizationId:
        identity.organization_uuid,

      scopeType:
        "SERVICE",

      environmentId:
        ENVIRONMENT_ID,

      canonicalEnvironmentId:
        identity.environment_uuid,

      serviceId:
        SERVICE_ID,

      query:
        (
          "Build complete operational DNA for " +
          "phase16 certification service"
        ),
    });


  log({
    created:
      result.created,

    duplicate:
      result.duplicate,

    fingerprint:
      result.dna
        ?.fingerprint,

    scopeType:
      result.dna
        ?.scopeType,

    evidenceCount:
      result.dna
        ?.evidenceCount,

    confidence:
      result.dna
        ?.confidence,

    trustScore:
      result.dna
        ?.trustScore,

    memoryFamilyCounts:
      result.dna
        ?.memoryFamilyCounts,
  });


  check(
    "Service DNA generated",
    Boolean(
      result.dna
    )
  );


  check(
    "DNA scope is SERVICE",
    result.dna
      ?.scopeType ===
      "SERVICE"
  );


  check(
    "DNA tenant identity preserved",
    result.dna
      ?.tenantPublicId ===
      ORGANIZATION_ID
  );


  check(
    "DNA environment identity preserved",
    result.dna
      ?.environmentPublicId ===
      ENVIRONMENT_ID
  );


  check(
    "DNA service identity preserved",
    result.dna
      ?.servicePublicId ===
      SERVICE_ID
  );


  check(
    "DNA contains evidence",
    Number(
      result.dna
        ?.evidenceCount ||
      0
    ) >
      0
  );


  check(
    "DNA fingerprint exists",
    typeof result.dna
      ?.fingerprint ===
      "string" &&
    result.dna
      .fingerprint
      .length >
      20
  );


  return result;
}


function verifyFamilies(
  result
) {
  section(
    "STEP 4 — VERIFY SIX-FAMILY SYSTEM DNA"
  );


  const counts =
    result.dna
      ?.memoryFamilyCounts ||
    {};


  const families = [
    "EPISODIC",
    "OUTCOME",
    "PROCEDURAL",
    "SEMANTIC",
    "HUMAN",
    "BEHAVIOURAL",
  ];


  for (
    const family
    of families
  ) {
    const count =
      Number(
        counts[
          family
        ] ||
        0
      );


    check(
      `${family} contributes to System DNA`,
      count >
        0,
      `count=${count}`
    );
  }


  check(
    "Full six-family DNA coverage",
    families.every(
      (
        family
      ) =>
        Number(
          counts[
            family
          ] ||
          0
        ) >
        0
    )
  );
}


function verifySynthesis(
  result
) {
  section(
    "STEP 5 — VERIFY OPERATIONAL SYNTHESIS"
  );


  check(
    "Procedural DNA exists",
    Array.isArray(
      result.dna
        ?.procedures
    ) &&
    result.dna
      .procedures
      .length >
      0
  );


  check(
    "Semantic pattern DNA exists",
    Array.isArray(
      result.dna
        ?.patterns
    ) &&
    result.dna
      .patterns
      .length >
      0
  );


  check(
    "Human guidance DNA exists",
    Array.isArray(
      result.dna
        ?.humanGuidance
    ) &&
    result.dna
      .humanGuidance
      .length >
      0
  );


  check(
    "Behavioural baseline DNA exists",
    Array.isArray(
      result.dna
        ?.behaviouralBaselines
    ) &&
    result.dna
      .behaviouralBaselines
      .length >
      0
  );


  check(
    "Recovery outcome DNA exists",
    Array.isArray(
      result.dna
        ?.outcomes
    ) &&
    result.dna
      .outcomes
      .length >
      0
  );


  check(
    "Operational traits exist",
    Array.isArray(
      result.dna
        ?.traits
    ) &&
    result.dna
      .traits
      .length >
      0
  );
}


function verifyTrust(
  result
) {
  section(
    "STEP 6 — VERIFY DNA TRUST + PROVENANCE"
  );


  check(
    "DNA trust is bounded",
    result.dna
      ?.trustScore >=
      0 &&
    result.dna
      ?.trustScore <=
      1
  );


  check(
    "DNA confidence is bounded",
    result.dna
      ?.confidence >=
      0 &&
    result.dna
      ?.confidence <=
      1
  );


  check(
    "DNA provenance contains evidence",
    Number(
      result.trust
        ?.provenance
        ?.evidenceCount ||
      0
    ) >
      0
  );


  check(
    "DNA provenance retains memory IDs",
    Array.isArray(
      result.trust
        ?.provenance
        ?.evidenceMemoryIds
    ) &&
    result.trust
      .provenance
      .evidenceMemoryIds
      .length >
      0
  );
}


async function verifySnapshot(
  pool,
  identity,
  firstResult
) {
  section(
    "STEP 7 — VERIFY POSTGRESQL DNA SNAPSHOT"
  );


  const result =
    await pool.query(
      `
        SELECT
          *

        FROM memory.system_dna_snapshots

        WHERE
          organization_id =
            $1

          AND scope_type =
            'SERVICE'

          AND environment_public_id =
            $2

          AND service_id =
            $3

          AND status =
            'ACTIVE'

        ORDER BY
          created_at DESC

        LIMIT 1
      `,
      [
        identity.organization_uuid,
        ENVIRONMENT_ID,
        SERVICE_ID,
      ]
    );


  const snapshot =
    result.rows[0];


  check(
    "ACTIVE DNA snapshot exists in PostgreSQL",
    Boolean(
      snapshot
    )
  );


  if (
    !snapshot
  ) {
    return null;
  }


  check(
    "Snapshot fingerprint matches generated DNA",
    snapshot.fingerprint ===
      firstResult.dna
        .fingerprint
  );


  check(
    "Snapshot trust matches generated DNA",
    Number(
      snapshot.trust_score
    ) ===
      Number(
        firstResult.dna
          .trustScore
      )
  );


  check(
    "Snapshot evidence count matches generated DNA",
    Number(
      snapshot.evidence_count
    ) ===
      Number(
        firstResult.dna
          .evidenceCount
      )
  );


  check(
    "Snapshot remains ACTIVE",
    snapshot.status ===
      "ACTIVE"
  );


  return snapshot;
}


async function verifyIdempotency(
  identity,
  firstResult
) {
  section(
    "STEP 8 — VERIFY DNA IDEMPOTENCY"
  );


  const second =
    await rebuildSystemDna({
      organizationId:
        ORGANIZATION_ID,

      canonicalOrganizationId:
        identity.organization_uuid,

      scopeType:
        "SERVICE",

      environmentId:
        ENVIRONMENT_ID,

      canonicalEnvironmentId:
        identity.environment_uuid,

      serviceId:
        SERVICE_ID,

      query:
        (
          "Build complete operational DNA for " +
          "phase16 certification service"
        ),
    });


  log({
    created:
      second.created,

    duplicate:
      second.duplicate,

    fingerprint:
      second.dna
        ?.fingerprint,
  });


  check(
    "Second rebuild is idempotent",
    second.created ===
      false &&
    second.duplicate ===
      true
  );


  check(
    "Fingerprint remains deterministic",
    second.dna
      ?.fingerprint ===
      firstResult.dna
        ?.fingerprint
  );


  return second;
}


async function verifySingleActiveSnapshot(
  pool,
  identity
) {
  section(
    "STEP 9 — VERIFY SNAPSHOT UNIQUENESS"
  );


  const result =
    await pool.query(
      `
        SELECT
          COUNT(*)::int AS count

        FROM memory.system_dna_snapshots

        WHERE
          organization_id =
            $1

          AND scope_type =
            'SERVICE'

          AND environment_public_id =
            $2

          AND service_id =
            $3

          AND status =
            'ACTIVE'
      `,
      [
        identity.organization_uuid,
        ENVIRONMENT_ID,
        SERVICE_ID,
      ]
    );


  const count =
    result.rows[0]
      ?.count ||
    0;


  check(
    "Exactly one ACTIVE service DNA snapshot exists",
    count ===
      1,
    `count=${count}`
  );
}


function verifySafety(
  result
) {
  section(
    "STEP 10 — VERIFY SYSTEM DNA SAFETY BOUNDARY"
  );


  const safety =
    result.dna
      ?.safety ||
    {};


  check(
    "DNA is evidence only",
    safety.evidenceOnly ===
      true
  );


  check(
    "DNA cannot authorize execution",
    safety.executionAuthorized ===
      false
  );


  check(
    "DNA cannot grant execution permission",
    safety.grantsExecutionPermission ===
      false
  );


  check(
    "DNA cannot bypass policy",
    safety.bypassesPolicy ===
      false
  );


  check(
    "DNA cannot bypass approval",
    safety.bypassesApproval ===
      false
  );


  check(
    "DNA cannot bypass entitlements",
    safety.bypassesEntitlements ===
      false
  );


  check(
    "DNA cannot bypass kill switch",
    safety.bypassesKillSwitch ===
      false
  );


  check(
    "DNA metadata cannot authorize execution",
    result.dna
      ?.metadata
      ?.executionAuthorized ===
      false
  );
}


function finalReport() {
  section(
    "PHASE 16.15 CERTIFICATION CHECKLIST"
  );


  let passed =
    0;


  let failed =
    0;


  for (
    const result
    of checks
  ) {
    if (
      result.passed
    ) {
      passed +=
        1;

      log(
        `[PASS] ${result.name}`
      );

    } else {
      failed +=
        1;

      log(
        `[FAIL] ${result.name}`
      );
    }
  }


  section(
    "FINAL PHASE 16.15 RESULT"
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
      "\n✓✓✓ PHASE 16.15 CERTIFIED ✓✓✓"
    );

    return true;
  }


  log(
    "\n✗✗✗ PHASE 16.15 NOT CERTIFIED ✗✗✗"
  );


  return false;
}


async function main() {
  const pool =
    getPostgresPool();


  try {
    section(
      "AIRA PHASE 16.15 — SYSTEM DNA LIVE CERTIFICATION"
    );


    const identity =
      await resolveIdentity(
        pool
      );


    await verifyDnaSchema(
      pool
    );


    const first =
      await buildServiceDna(
        identity
      );


    verifyFamilies(
      first
    );


    verifySynthesis(
      first
    );


    verifyTrust(
      first
    );


    await verifySnapshot(
      pool,
      identity,
      first
    );


    await verifyIdempotency(
      identity,
      first
    );


    await verifySingleActiveSnapshot(
      pool,
      identity
    );


    verifySafety(
      first
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
      "PHASE 16.15 CERTIFICATION FAILED"
    );


    log({
      code:
        error.code,

      message:
        error.message,

      detail:
        error.detail,

      constraint:
        error.constraint,

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