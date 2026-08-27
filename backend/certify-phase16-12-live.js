#!/usr/bin/env node
"use strict";

/**
 * ============================================================================
 * AIRA PHASE 16.12
 * HUMAN OPERATIONAL MEMORY — LIVE CERTIFICATION
 * ============================================================================
 *
 * Certification target:
 *
 *   Organization : aira-dev-org
 *   Environment  : env_aira_development
 *   Incident     : inc_cert_1787762657172
 *
 * This verifies:
 *
 *   1. APPROVED human memory
 *   2. REJECTED human memory
 *   3. MODIFIED human memory
 *   4. MANUAL_ACTION human memory
 *   5. Canonical PostgreSQL persistence
 *   6. Correct INCIDENT scope
 *   7. Human provenance
 *   8. Incident provenance
 *   9. Idempotency
 *  10. No reusable authorization
 *  11. No execution authorization
 *  12. Qdrant failure/indexing does not affect PostgreSQL truth
 *
 * PostgreSQL = authoritative
 * Qdrant     = retrieval only
 * ============================================================================
 */

require("dotenv").config({
  path: ".env",
});


const {
  recordHumanMemory,
} =
  require(
    "./services/memory/human/humanMemoryService"
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


const INCIDENT_ID =
  "inc_cert_1787762657172";


const CERTIFICATION_EVENTS = [
  {
    eventId:
      "phase16_12_human_approved_001",

    actionType:
      "APPROVED",

    actorId:
      "sre-certification-001",

    actorDisplay:
      "Phase 16 Certification SRE",

    actorType:
      "HUMAN",

    recommendation:
      "restart api service",

    finalAction:
      "restart api service",

    reason:
      "Recovery proposal was reviewed and considered safe.",

    comment:
      "Approved during Phase 16.12 certification.",
  },

  {
    eventId:
      "phase16_12_human_rejected_001",

    actionType:
      "REJECTED",

    actorId:
      "sre-certification-001",

    actorDisplay:
      "Phase 16 Certification SRE",

    actorType:
      "HUMAN",

    recommendation:
      "fail over primary database",

    finalAction:
      null,

    reason:
      "Database failover was considered unnecessary for this incident.",

    comment:
      "Rejected during Phase 16.12 certification.",
  },

  {
    eventId:
      "phase16_12_human_modified_001",

    actionType:
      "MODIFIED",

    actorId:
      "sre-certification-001",

    actorDisplay:
      "Phase 16 Certification SRE",

    actorType:
      "HUMAN",

    recommendation:
      "restart api deployment",

    finalAction:
      "drain traffic then restart api deployment",

    reason:
      "Traffic should be drained before restart to reduce disruption.",

    comment:
      "Modified during Phase 16.12 certification.",
  },

  {
    eventId:
      "phase16_12_human_manual_001",

    actionType:
      "MANUAL_ACTION",

    actorId:
      "sre-certification-001",

    actorDisplay:
      "Phase 16 Certification SRE",

    actorType:
      "HUMAN",

    recommendation:
      null,

    finalAction:
      "scaled api replicas from 3 to 6",

    reason:
      "Operator manually increased capacity while investigating.",

    comment:
      "Manual action recorded during Phase 16.12 certification.",
  },
];


const checks =
  [];


function section(
  title
) {
  console.log(
    "\n" +
    "=".repeat(76)
  );

  console.log(
    title
  );

  console.log(
    "=".repeat(76)
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
        e.public_id AS environment_public_id,

        i.id AS incident_uuid,
        i.public_id AS incident_public_id,
        i.status AS incident_status,
        i.closed_at

      FROM tenancy.organizations o

      JOIN tenancy.environments e
        ON e.organization_id = o.id

      JOIN incidents.incidents i
        ON i.organization_id = o.id
       AND i.environment_id = e.id

      WHERE o.public_id = $1
        AND e.public_id = $2
        AND i.public_id = $3

      LIMIT 1;
      `,
      [
        ORGANIZATION_ID,
        ENVIRONMENT_ID,
        INCIDENT_ID,
      ]
    );


  if (
    result.rows.length ===
      0
  ) {
    throw Object.assign(
      new Error(
        "Phase 16.12 certification scope could not be resolved"
      ),
      {
        code:
          "PHASE16_12_SCOPE_NOT_FOUND",
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

  console.log(
    `Incident     : ${row.incident_public_id}`
  );

  console.log(
    `UUID         : ${row.incident_uuid}`
  );

  console.log(
    `Status       : ${row.incident_status}`
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


  check(
    "Incident resolved",
    row.incident_public_id ===
      INCIDENT_ID
  );


  return row;
}


async function createHumanMemories() {
  section(
    "STEP 2 — RECORD HUMAN OPERATIONAL MEMORIES"
  );


  const results =
    [];


  for (
    const event
    of CERTIFICATION_EVENTS
  ) {
    console.log(
      `\nRecording ${event.actionType}: ${event.eventId}`
    );


    const result =
      await recordHumanMemory({
        organizationId:
          ORGANIZATION_ID,

        environmentId:
          ENVIRONMENT_ID,

        incidentId:
          INCIDENT_ID,

        eventId:
          event.eventId,

        actionType:
          event.actionType,

        actorId:
          event.actorId,

        actorDisplay:
          event.actorDisplay,

        actorType:
          event.actorType,

        recommendation:
          event.recommendation,

        finalAction:
          event.finalAction,

        reason:
          event.reason,

        comment:
          event.comment,

        occurredAt:
          new Date(),

        metadata: {
          certification:
            true,

          certificationPhase:
            "16.12",
        },
      });


    console.log(
      JSON.stringify(
        {
          actionType:
            event.actionType,

          eventId:
            event.eventId,

          created:
            result.created,

          duplicate:
            result.duplicate,

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

          sourceCount:
            result.sourceCount,

          indexing:
            result.indexing,
        },
        null,
        2
      )
    );


    check(
      `${event.actionType} memory returned`,
      Boolean(
        result.memory
      )
    );


    results.push({
      event,
      result,
    });
  }


  return results;
}


async function verifyCanonicalMemories(
  pool,
  scope
) {
  section(
    "STEP 3 — VERIFY CANONICAL POSTGRESQL HUMAN MEMORIES"
  );


  const eventIds =
    CERTIFICATION_EVENTS
      .map(
        (
          event
        ) =>
          event.eventId
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
        m.incident_id,
        m.status,
        m.confidence,
        m.trust_score,
        m.importance,
        m.evidence_count,
        m.source_count,
        m.observation_count,
        m.content,
        m.metadata,
        m.created_at

      FROM memory.memories m

      WHERE m.organization_id = $1
        AND m.environment_id = $2
        AND m.incident_id = $3
        AND m.memory_type = 'HUMAN'
        AND (
          m.content
            -> 'humanAction'
            ->> 'eventId'
        ) = ANY($4::text[])

      ORDER BY
        m.content
          -> 'humanAction'
          ->> 'eventId';
      `,
      [
        scope.organization_uuid,
        scope.environment_uuid,
        scope.incident_uuid,
        eventIds,
      ]
    );


  console.log(
    `Found ${result.rows.length} certification HUMAN memories.`
  );


  for (
    const row
    of result.rows
  ) {
    const action =
      row.content
        ?.humanAction;


    console.log(
      "\n" +
      JSON.stringify(
        {
          publicId:
            row.public_id,

          memoryType:
            row.memory_type,

          scopeType:
            row.scope_type,

          status:
            row.status,

          actionType:
            action
              ?.actionType,

          eventId:
            action
              ?.eventId,

          confidence:
            row.confidence,

          trustScore:
            row.trust_score,

          executionAuthorized:
            row.metadata
              ?.executionAuthorized,

          reusableAuthorization:
            row.metadata
              ?.reusableAuthorization,
        },
        null,
        2
      )
    );
  }


  check(
    "Exactly four certification HUMAN memories exist",
    result.rows.length ===
      4,
    `count=${result.rows.length}`
  );


  check(
    "All memories have HUMAN memory type",
    result.rows.every(
      (
        row
      ) =>
        row.memory_type ===
        "HUMAN"
    )
  );


  check(
    "All memories are INCIDENT scoped",
    result.rows.every(
      (
        row
      ) =>
        row.scope_type ===
        "INCIDENT"
    )
  );


  check(
    "All memories belong to correct organization",
    result.rows.every(
      (
        row
      ) =>
        row.organization_id ===
        scope.organization_uuid
    )
  );


  check(
    "All memories belong to correct environment",
    result.rows.every(
      (
        row
      ) =>
        row.environment_id ===
        scope.environment_uuid
    )
  );


  check(
    "All memories belong to correct incident",
    result.rows.every(
      (
        row
      ) =>
        row.incident_id ===
        scope.incident_uuid
    )
  );


  const actionTypes =
    new Set(
      result.rows.map(
        (
          row
        ) =>
          row.content
            ?.humanAction
            ?.actionType
      )
    );


  for (
    const expected
    of [
      "APPROVED",
      "REJECTED",
      "MODIFIED",
      "MANUAL_ACTION",
    ]
  ) {
    check(
      `${expected} action persisted`,
      actionTypes.has(
        expected
      )
    );
  }


  return result.rows;
}


async function verifySafety(
  rows
) {
  section(
    "STEP 4 — VERIFY AUTHORIZATION SAFETY"
  );


  check(
    "Every HUMAN memory has metadata.executionAuthorized=false",
    rows.every(
      (
        row
      ) =>
        row.metadata
          ?.executionAuthorized ===
        false
    )
  );


  check(
    "Every HUMAN memory has metadata.reusableAuthorization=false",
    rows.every(
      (
        row
      ) =>
        row.metadata
          ?.reusableAuthorization ===
        false
    )
  );


  check(
    "Every HUMAN memory content marks executionAuthorized=false",
    rows.every(
      (
        row
      ) =>
        row.content
          ?.interpretation
          ?.executionAuthorized ===
        false
    )
  );


  check(
    "Every HUMAN memory content marks reusableAuthorization=false",
    rows.every(
      (
        row
      ) =>
        row.content
          ?.interpretation
          ?.reusableAuthorization ===
        false
    )
  );


  check(
    "Human memories are historical evidence only",
    rows.every(
      (
        row
      ) =>
        row.content
          ?.interpretation
          ?.historicalEvidence ===
        true
    )
  );
}


async function verifyProvenance(
  pool,
  rows
) {
  section(
    "STEP 5 — VERIFY HUMAN MEMORY PROVENANCE"
  );


  const memoryIds =
    rows.map(
      (
        row
      ) =>
        row.id
    );


  const result =
    await pool.query(
      `
      SELECT
        m.public_id AS memory_public_id,
        ms.source_type,
        ms.source_id,
        ms.evidence_role,
        ms.observed_at

      FROM memory.memory_sources ms

      JOIN memory.memories m
        ON m.id = ms.memory_id

      WHERE ms.memory_id =
        ANY($1::uuid[])

      ORDER BY
        m.public_id,
        ms.source_type,
        ms.source_id;
      `,
      [
        memoryIds,
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
      `${row.memory_public_id} | ` +
      `${row.source_type} | ` +
      `${row.source_id} | ` +
      `${row.evidence_role}`
    );
  }


  for (
    const memory
    of rows
  ) {
    const sources =
      result.rows.filter(
        (
          row
        ) =>
          row.memory_public_id ===
          memory.public_id
      );


    check(
      `${memory.public_id} has HUMAN_EVENT provenance`,
      sources.some(
        (
          source
        ) =>
          source.source_type ===
          "HUMAN_EVENT"
      )
    );


    check(
      `${memory.public_id} has INCIDENT provenance`,
      sources.some(
        (
          source
        ) =>
          source.source_type ===
          "INCIDENT" &&
          source.source_id ===
          INCIDENT_ID
      )
    );
  }


  return result.rows;
}


async function verifyIdempotency(
  pool,
  scope,
  rows
) {
  section(
    "STEP 6 — VERIFY IDEMPOTENCY"
  );


  const approved =
    CERTIFICATION_EVENTS[0];


  const beforeResult =
    await pool.query(
      `
      SELECT COUNT(*)::integer AS count

      FROM memory.memories

      WHERE organization_id = $1
        AND memory_type = 'HUMAN'
        AND (
          content
            -> 'humanAction'
            ->> 'eventId'
        ) = $2;
      `,
      [
        scope.organization_uuid,
        approved.eventId,
      ]
    );


  const before =
    beforeResult
      .rows[0]
      .count;


  const duplicate =
    await recordHumanMemory({
      organizationId:
        ORGANIZATION_ID,

      environmentId:
        ENVIRONMENT_ID,

      incidentId:
        INCIDENT_ID,

      eventId:
        approved.eventId,

      actionType:
        approved.actionType,

      actorId:
        approved.actorId,

      actorDisplay:
        approved.actorDisplay,

      actorType:
        approved.actorType,

      recommendation:
        approved.recommendation,

      finalAction:
        approved.finalAction,

      reason:
        approved.reason,

      comment:
        approved.comment,

      occurredAt:
        new Date(),
    });


  const afterResult =
    await pool.query(
      `
      SELECT COUNT(*)::integer AS count

      FROM memory.memories

      WHERE organization_id = $1
        AND memory_type = 'HUMAN'
        AND (
          content
            -> 'humanAction'
            ->> 'eventId'
        ) = $2;
      `,
      [
        scope.organization_uuid,
        approved.eventId,
      ]
    );


  const after =
    afterResult
      .rows[0]
      .count;


  console.log(
    JSON.stringify(
      {
        before,
        after,

        duplicate:
          duplicate.duplicate,

        created:
          duplicate.created,

        publicId:
          duplicate
            .memory
            ?.publicId,
      },
      null,
      2
    )
  );


  check(
    "Repeated human event is detected as duplicate",
    duplicate.duplicate ===
      true
  );


  check(
    "Repeated human event does not create another memory",
    before ===
      1 &&
    after ===
      1
  );


  check(
    "Human memory public ID remains deterministic",
    duplicate
      .memory
      ?.publicId ===
    rows.find(
      (
        row
      ) =>
        row.content
          ?.humanAction
          ?.eventId ===
        approved.eventId
    )
      ?.public_id
  );
}


async function verifyEmbeddingState(
  pool,
  rows
) {
  section(
    "STEP 7 — VERIFY RETRIEVAL INDEX STATE"
  );


  const memoryIds =
    rows.map(
      (
        row
      ) =>
        row.id
    );


  const result =
    await pool.query(
      `
      SELECT
        m.public_id,
        er.embedding_provider,
        er.embedding_model,
        er.status,
        er.qdrant_collection,
        er.qdrant_point_id,
        er.indexed_at

      FROM memory.memories m

      LEFT JOIN memory.embedding_records er
        ON er.memory_id = m.id

      WHERE m.id =
        ANY($1::uuid[])

      ORDER BY m.public_id;
      `,
      [
        memoryIds,
      ]
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

          embeddingProvider:
            row.embedding_provider,

          embeddingModel:
            row.embedding_model,

          status:
            row.status,

          collection:
            row.qdrant_collection,

          pointId:
            row.qdrant_point_id,

          indexedAt:
            row.indexed_at,
        },
        null,
        2
      )
    );
  }


  check(
    "All four HUMAN memories remain canonical in PostgreSQL regardless of index state",
    rows.length ===
      4
  );


  const indexed =
    result.rows.filter(
      (
        row
      ) =>
        row.status ===
        "INDEXED"
    ).length;


  console.log(
    `\nQdrant indexed memories: ${indexed}/${rows.length}`
  );


  if (
    indexed ===
    rows.length
  ) {
    check(
      "All HUMAN memories indexed for retrieval",
      true
    );
  } else {
    console.log(
      "ℹ Some memories are not INDEXED. This does NOT invalidate canonical memory."
    );

    console.log(
      "  PostgreSQL remains authoritative; Qdrant is retrieval-only."
    );
  }
}


function finalReport() {
  section(
    "PHASE 16.12 CERTIFICATION CHECKLIST"
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
      "\n✓✓✓ PHASE 16.12 CERTIFIED ✓✓✓"
    );


    console.log(
      "\nHuman Operational Memory is working against the real AIRA database."
    );


    console.log(
      "\nCritical safety invariant:"
    );


    console.log(
      "  HISTORICAL HUMAN APPROVAL ≠ CURRENT EXECUTION AUTHORIZATION"
    );


    return true;
  }


  console.log(
    "\n✗✗✗ PHASE 16.12 NOT CERTIFIED ✗✗✗"
  );


  return false;
}


async function main() {
  const pool =
    getPostgresPool();


  try {
    section(
      "AIRA PHASE 16.12 — LIVE HUMAN MEMORY CERTIFICATION"
    );


    const scope =
      await resolveScope(
        pool
      );


    await createHumanMemories();


    const memories =
      await verifyCanonicalMemories(
        pool,
        scope
      );


    await verifySafety(
      memories
    );


    await verifyProvenance(
      pool,
      memories
    );


    await verifyIdempotency(
      pool,
      scope,
      memories
    );


    await verifyEmbeddingState(
      pool,
      memories
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
      "\nPHASE 16.12 CERTIFICATION FAILED:",
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