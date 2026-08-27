#!/usr/bin/env node
"use strict";

/**
 * ============================================================================
 * AIRA PHASE 16.13
 * BEHAVIOURAL MEMORY & TENANT BASELINES — LIVE CERTIFICATION
 * ============================================================================
 *
 * Target:
 *
 *   organization : aira-dev-org
 *   environment  : env_aira_development
 *   service      : phase16-certification-service
 *
 * Certification goals:
 *
 *   1. Only HEALTHY + eligible + high-quality observations influence baseline
 *   2. INCIDENT observations are rejected
 *   3. DEGRADED observations are rejected
 *   4. Low-quality observations are rejected
 *   5. One canonical BEHAVIOURAL memory is created
 *   6. Re-synthesis updates the same memory, not duplicates
 *   7. Version history is created
 *   8. PostgreSQL remains authoritative
 *   9. Qdrant remains retrieval-only
 *  10. executionAuthorized=false
 *  11. suppressAlerts=false
 * ============================================================================
 */

require("dotenv").config({
  path: ".env",
});


const {
  synthesizeBehaviouralMemory,
} =
  require(
    "./services/memory/behavioural/behaviouralMemoryService"
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


const ORGANIZATION_ID =
  "aira-dev-org";


const ENVIRONMENT_ID =
  "env_aira_development";


const SERVICE_ID =
  "phase16-certification-service";


const METRIC_NAME =
  "cpu_percent";


const METRIC_UNIT =
  "%";


const checks =
  [];


function section(
  title
) {
  console.log(
    "\n" +
    "=".repeat(78)
  );

  console.log(
    title
  );

  console.log(
    "=".repeat(78)
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


  console.log(
    `${passed ? "✓" : "✗"} ${name}`
  );


  if (
    detail !==
      null &&
    detail !==
      undefined
  ) {
    console.log(
      `  ${detail}`
    );
  }


  return passed;
}


function observation({
  id,
  value,
  healthState =
    "HEALTHY",
  incidentActive =
    false,
  degraded =
    false,
  baselineEligible =
    true,
  qualityScore =
    1,
}) {
  return {
    observationId:
      id,

    sourceId:
      id,

    value,

    healthState,

    incidentActive,

    degraded,

    baselineEligible,

    qualityScore,

    observedAt:
      new Date(),
  };
}


function initialObservations() {
  return [
    observation({
      id: "phase16_13_obs_01",
      value: 40,
    }),

    observation({
      id: "phase16_13_obs_02",
      value: 42,
    }),

    observation({
      id: "phase16_13_obs_03",
      value: 44,
    }),

    observation({
      id: "phase16_13_obs_04",
      value: 45,
    }),

    observation({
      id: "phase16_13_obs_05",
      value: 47,
    }),

    observation({
      id: "phase16_13_obs_06",
      value: 48,
    }),

    observation({
      id: "phase16_13_obs_07",
      value: 50,
    }),

    observation({
      id: "phase16_13_obs_08",
      value: 52,
    }),

    observation({
      id: "phase16_13_obs_09",
      value: 53,
    }),

    observation({
      id: "phase16_13_obs_10",
      value: 55,
    }),

    /**
     * Must NOT influence normal baseline.
     */
    observation({
      id: "phase16_13_incident_01",
      value: 97,
      healthState: "INCIDENT",
      incidentActive: true,
    }),

    observation({
      id: "phase16_13_incident_02",
      value: 98,
      healthState: "INCIDENT",
      incidentActive: true,
    }),

    observation({
      id: "phase16_13_degraded_01",
      value: 82,
      healthState: "DEGRADED",
      degraded: true,
    }),

    observation({
      id: "phase16_13_low_quality_01",
      value: 5,
      qualityScore: 0.2,
    }),
  ];
}


function updatedObservations() {
  return [
    ...initialObservations(),

    observation({
      id: "phase16_13_obs_11",
      value: 56,
    }),

    observation({
      id: "phase16_13_obs_12",
      value: 58,
    }),
  ];
}


async function resolveScope(
  pool
) {
  section(
    "STEP 1 — RESOLVE CERTIFICATION SCOPE"
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


  if (
    !result.rows[0]
  ) {
    throw Object.assign(
      new Error(
        "Phase 16.13 certification scope not found"
      ),
      {
        code:
          "PHASE16_13_SCOPE_NOT_FOUND",
      }
    );
  }


  const row =
    result.rows[0];


  console.log(
    `Organization : ${row.organization_public_id}`
  );

  console.log(
    `UUID         : ${row.organization_uuid}`
  );

  console.log(
    `Environment  : ${row.environment_public_id}`
  );

  console.log(
    `UUID         : ${row.environment_uuid}`
  );


  check(
    "Organization resolved",
    row.organization_public_id ===
      ORGANIZATION_ID
  );


  check(
    "Environment resolved",
    row.environment_public_id ===
      ENVIRONMENT_ID
  );


  return row;
}


async function runInitialSynthesis() {
  section(
    "STEP 2 — INITIAL BEHAVIOURAL SYNTHESIS"
  );


  const result =
    await synthesizeBehaviouralMemory({
      organizationId:
        ORGANIZATION_ID,

      environmentId:
        ENVIRONMENT_ID,

      serviceId:
        SERVICE_ID,

      resourceId:
        null,

      metricName:
        METRIC_NAME,

      metricUnit:
        METRIC_UNIT,

      observations:
        initialObservations(),

      minimumSamples:
        10,

      minimumQuality:
        0.8,
    });


  console.log(
    JSON.stringify(
      {
        synthesized:
          result.synthesized,

        created:
          result.created,

        updated:
          result.updated,

        indexed:
          result.indexed,

        publicId:
          result
            .memory
            ?.publicId,

        memoryType:
          result
            .memory
            ?.memoryType,

        scopeType:
          result
            .memory
            ?.scopeType,

        serviceId:
          result
            .memory
            ?.serviceId,

        statistics: {
          total:
            result
              .statistics
              ?.total,

          eligible:
            result
              .statistics
              ?.eligible,

          rejected:
            result
              .statistics
              ?.rejected,

          minimum:
            result
              .statistics
              ?.minimum,

          maximum:
            result
              .statistics
              ?.maximum,

          mean:
            result
              .statistics
              ?.mean,

          median:
            result
              .statistics
              ?.median,

          p95:
            result
              .statistics
              ?.p95,

          standardDeviation:
            result
              .statistics
              ?.standardDeviation,
        },

        indexing:
          result.indexing,
      },
      null,
      2
    )
  );


  check(
    "Behavioural synthesis succeeded",
    result.synthesized ===
      true
  );


  check(
    "Initial behavioural memory created",
    result.created ===
      true ||
    result.updated ===
      true
  );


  check(
    "Exactly 10 healthy observations were eligible",
    result
      .statistics
      ?.eligible ===
      10,
    `eligible=${result.statistics?.eligible}`
  );


  check(
    "Exactly 4 unhealthy/low-quality observations were rejected",
    result
      .statistics
      ?.rejected ===
      4,
    `rejected=${result.statistics?.rejected}`
  );


  check(
    "Rejected incident values did not affect maximum baseline",
    result
      .statistics
      ?.maximum ===
      55,
    `max=${result.statistics?.maximum}`
  );


  check(
    "Rejected low-quality value did not affect minimum baseline",
    result
      .statistics
      ?.minimum ===
      40,
    `min=${result.statistics?.minimum}`
  );


  return result;
}


async function verifyCanonicalMemory(
  pool,
  scope
) {
  section(
    "STEP 3 — VERIFY CANONICAL POSTGRESQL BASELINE"
  );


  const result =
    await pool.query(
      `
        SELECT
          m.id,
          m.public_id,
          m.memory_type,
          m.scope_type,
          m.organization_id,
          m.environment_id,
          m.service_id,
          m.resource_id,
          m.status,
          m.confidence,
          m.trust_score,
          m.importance,
          m.evidence_count,
          m.source_count,
          m.observation_count,
          m.content,
          m.metadata,
          m.created_at,
          m.updated_at

        FROM memory.memories m

        WHERE
          m.organization_id =
            $1

          AND m.environment_id =
            $2

          AND m.service_id =
            $3

          AND m.memory_type =
            'BEHAVIOURAL'

          AND m.content
            -> 'baseline'
            ->> 'metric' =
            $4

        ORDER BY
          m.created_at DESC
      `,
      [
        scope.organization_uuid,
        scope.environment_uuid,
        SERVICE_ID,
        METRIC_NAME,
      ]
    );


  console.log(
    `Found ${result.rows.length} matching behavioural memories.`
  );


  for (
    const row
    of result.rows
  ) {
    console.log(
      JSON.stringify(
        {
          publicId:
            row.public_id,

          memoryType:
            row.memory_type,

          scopeType:
            row.scope_type,

          serviceId:
            row.service_id,

          status:
            row.status,

          confidence:
            row.confidence,

          trustScore:
            row.trust_score,

          observationCount:
            row.observation_count,

          baseline:
            row.content
              ?.baseline,

          learningPolicy:
            row.content
              ?.learningPolicy,

          metadata:
            row.metadata,
        },
        null,
        2
      )
    );
  }


  check(
    "Exactly one canonical behavioural baseline exists",
    result.rows.length ===
      1,
    `count=${result.rows.length}`
  );


  const memory =
    result.rows[0];


  if (
    !memory
  ) {
    return null;
  }


  check(
    "Memory type is BEHAVIOURAL",
    memory.memory_type ===
      "BEHAVIOURAL"
  );


  check(
    "Scope type is SERVICE",
    memory.scope_type ===
      "SERVICE"
  );


  check(
    "Correct organization stored",
    memory.organization_id ===
      scope.organization_uuid
  );


  check(
    "Correct environment stored",
    memory.environment_id ===
      scope.environment_uuid
  );


  check(
    "Correct service stored",
    memory.service_id ===
      SERVICE_ID
  );


  check(
    "Behavioural memory is ACTIVE",
    memory.status ===
      "ACTIVE"
  );


  check(
    "Baseline sampleCount is 10",
    Number(
      memory
        .content
        ?.baseline
        ?.sampleCount
    ) ===
      10
  );


  check(
    "Incident observations excluded by policy",
    memory
      .content
      ?.learningPolicy
      ?.incidentObservationsExcluded ===
      true
  );


  check(
    "Degraded observations excluded by policy",
    memory
      .content
      ?.learningPolicy
      ?.degradedObservationsExcluded ===
      true
  );


  check(
    "Low-quality observations excluded by policy",
    memory
      .content
      ?.learningPolicy
      ?.lowQualityObservationsExcluded ===
      true
  );


  check(
    "Behavioural memory cannot authorize execution",
    memory
      .metadata
      ?.executionAuthorized ===
      false &&
    memory
      .content
      ?.learningPolicy
      ?.executionAuthorized ===
      false
  );


  check(
    "Behavioural memory cannot suppress alerts",
    memory
      .metadata
      ?.suppressAlerts ===
      false &&
    memory
      .content
      ?.learningPolicy
      ?.suppressAlerts ===
      false
  );


  return memory;
}


async function verifyProvenance(
  pool,
  memory
) {
  section(
    "STEP 4 — VERIFY BASELINE PROVENANCE"
  );


  const result =
    await pool.query(
      `
        SELECT
          source_type,
          source_id,
          evidence_role,
          observed_at

        FROM memory.memory_sources

        WHERE memory_id =
          $1

        ORDER BY
          source_id
      `,
      [
        memory.id,
      ]
    );


  console.log(
    `Found ${result.rows.length} provenance records.`
  );


  for (
    const row
    of result.rows
  ) {
    console.log(
      `${row.source_type} | ${row.source_id} | ${row.evidence_role}`
    );
  }


  const sourceIds =
    new Set(
      result.rows.map(
        (
          row
        ) =>
          row.source_id
      )
    );


  check(
    "Healthy observations are recorded as provenance",
    [
      "phase16_13_obs_01",
      "phase16_13_obs_02",
      "phase16_13_obs_03",
      "phase16_13_obs_04",
      "phase16_13_obs_05",
      "phase16_13_obs_06",
      "phase16_13_obs_07",
      "phase16_13_obs_08",
      "phase16_13_obs_09",
      "phase16_13_obs_10",
    ]
      .every(
        (
          sourceId
        ) =>
          sourceIds.has(
            sourceId
          )
      )
  );


  check(
    "Incident observations are NOT baseline provenance",
    !sourceIds.has(
      "phase16_13_incident_01"
    ) &&
    !sourceIds.has(
      "phase16_13_incident_02"
    )
  );


  check(
    "Degraded observation is NOT baseline provenance",
    !sourceIds.has(
      "phase16_13_degraded_01"
    )
  );


  check(
    "Low-quality observation is NOT baseline provenance",
    !sourceIds.has(
      "phase16_13_low_quality_01"
    )
  );
}


async function runUpdatedSynthesis(
  originalPublicId
) {
  section(
    "STEP 5 — RE-SYNTHESIZE WITH ADDITIONAL HEALTHY EVIDENCE"
  );


  const result =
    await synthesizeBehaviouralMemory({
      organizationId:
        ORGANIZATION_ID,

      environmentId:
        ENVIRONMENT_ID,

      serviceId:
        SERVICE_ID,

      resourceId:
        null,

      metricName:
        METRIC_NAME,

      metricUnit:
        METRIC_UNIT,

      observations:
        updatedObservations(),

      minimumSamples:
        10,

      minimumQuality:
        0.8,
    });


  console.log(
    JSON.stringify(
      {
        synthesized:
          result.synthesized,

        created:
          result.created,

        updated:
          result.updated,

        publicId:
          result
            .memory
            ?.publicId,

        statistics: {
          total:
            result
              .statistics
              ?.total,

          eligible:
            result
              .statistics
              ?.eligible,

          rejected:
            result
              .statistics
              ?.rejected,

          mean:
            result
              .statistics
              ?.mean,

          p95:
            result
              .statistics
              ?.p95,
        },
      },
      null,
      2
    )
  );


  check(
    "Re-synthesis succeeded",
    result.synthesized ===
      true
  );


  check(
    "Existing behavioural memory was updated",
    result.updated ===
      true
  );


  check(
    "Re-synthesis did not create a second behavioural memory",
    result.created ===
      false
  );


  check(
    "Deterministic behavioural public ID remained unchanged",
    result
      .memory
      ?.publicId ===
      originalPublicId
  );


  check(
    "Additional healthy samples increased eligible sample count to 12",
    result
      .statistics
      ?.eligible ===
      12,
    `eligible=${result.statistics?.eligible}`
  );


  return result;
}


async function verifyNoDuplicate(
  pool,
  scope
) {
  section(
    "STEP 6 — VERIFY NO DUPLICATE BASELINE"
  );


  const result =
    await pool.query(
      `
        SELECT
          COUNT(*)::integer AS count

        FROM memory.memories

        WHERE
          organization_id =
            $1

          AND environment_id =
            $2

          AND service_id =
            $3

          AND memory_type =
            'BEHAVIOURAL'

          AND content
            -> 'baseline'
            ->> 'metric' =
            $4
      `,
      [
        scope.organization_uuid,
        scope.environment_uuid,
        SERVICE_ID,
        METRIC_NAME,
      ]
    );


  const count =
    result
      .rows[0]
      .count;


  check(
    "Exactly one behavioural baseline exists after re-synthesis",
    count ===
      1,
    `count=${count}`
  );
}


async function verifyVersionHistory(
  pool,
  memoryId
) {
  section(
    "STEP 7 — VERIFY MEMORY VERSION HISTORY"
  );


  const result =
    await pool.query(
      `
        SELECT
          version,
          change_reason,
          changed_by_type,
          confidence,
          trust_score,
          status,
          created_at

        FROM memory.memory_versions

        WHERE memory_id =
          $1

        ORDER BY
          version
      `,
      [
        memoryId,
      ]
    );


  console.log(
    `Found ${result.rows.length} memory versions.`
  );


  for (
    const row
    of result.rows
  ) {
    console.log(
      JSON.stringify(
        row,
        null,
        2
      )
    );
  }


  check(
    "Behavioural memory has version history",
    result.rows.length >=
      1
  );


  check(
    "Version history records MEMORY_SYNTHESIS",
    result.rows.some(
      (
        row
      ) =>
        row.changed_by_type ===
        "MEMORY_SYNTHESIS"
    )
  );
}


async function verifyIndexing(
  pool,
  memoryId
) {
  section(
    "STEP 8 — VERIFY QDRANT / INDEX STATE"
  );


  const result =
    await pool.query(
      `
        SELECT
          status,
          embedding_provider,
          embedding_model,
          qdrant_collection,
          qdrant_point_id,
          indexed_at

        FROM memory.embedding_records

        WHERE memory_id =
          $1

        ORDER BY
          created_at DESC

        LIMIT 5
      `,
      [
        memoryId,
      ]
    );


  if (
    result.rows.length ===
      0
  ) {
    console.log(
      "No embedding record found."
    );


    console.log(
      "PostgreSQL behavioural memory still remains authoritative."
    );


    return;
  }


  for (
    const row
    of result.rows
  ) {
    console.log(
      JSON.stringify(
        row,
        null,
        2
      )
    );
  }


  const indexed =
    result.rows.some(
      (
        row
      ) =>
        row.status ===
        "INDEXED"
    );


  if (
    indexed
  ) {
    check(
      "Behavioural memory indexed for retrieval",
      true
    );
  } else {
    console.log(
      "ℹ Qdrant indexing is not currently INDEXED."
    );

    console.log(
      "  This does not invalidate canonical PostgreSQL memory."
    );
  }
}


function finalReport() {
  section(
    "PHASE 16.13 CERTIFICATION CHECKLIST"
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

      console.log(
        `[PASS] ${result.name}`
      );

    } else {
      failed +=
        1;

      console.log(
        `[FAIL] ${result.name}`
      );
    }
  }


  section(
    "FINAL CERTIFICATION RESULT"
  );


  console.log(
    `Passed : ${passed}`
  );

  console.log(
    `Failed : ${failed}`
  );


  if (
    failed ===
      0
  ) {
    console.log(
      "\n✓✓✓ PHASE 16.13 CERTIFIED ✓✓✓"
    );


    console.log(
      "\nBehavioural Memory & Tenant Baselines are working against the real AIRA database."
    );


    console.log(
      "\nSafety invariants:"
    );


    console.log(
      "  OUTAGE ≠ NORMAL"
    );

    console.log(
      "  BEHAVIOURAL MEMORY ≠ ALERT SUPPRESSION"
    );

    console.log(
      "  BEHAVIOURAL MEMORY ≠ EXECUTION AUTHORIZATION"
    );


    return true;
  }


  console.log(
    "\n✗✗✗ PHASE 16.13 NOT CERTIFIED ✗✗✗"
  );


  return false;
}


async function main() {
  const pool =
    getPostgresPool();


  try {
    section(
      "AIRA PHASE 16.13 — LIVE BEHAVIOURAL MEMORY CERTIFICATION"
    );


    const scope =
      await resolveScope(
        pool
      );


    const initial =
      await runInitialSynthesis();


    const memory =
      await verifyCanonicalMemory(
        pool,
        scope
      );


    if (
      !memory
    ) {
      throw new Error(
        "Canonical behavioural memory not found"
      );
    }


    await verifyProvenance(
      pool,
      memory
    );


    await runUpdatedSynthesis(
      memory.public_id
    );


    await verifyNoDuplicate(
      pool,
      scope
    );


    await verifyVersionHistory(
      pool,
      memory.id
    );


    await verifyIndexing(
      pool,
      memory.id
    );


    const certified =
      finalReport();


    if (
      !certified
    ) {
      process.exitCode =
        1;
    }

  } catch (
    error
  ) {
    console.error(
      "\nPHASE 16.13 CERTIFICATION FAILED:",
      {
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
      }
    );


    process.exitCode =
      1;

  } finally {
    await closePostgresPool();
  }
}


main();