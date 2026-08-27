#!/usr/bin/env node
"use strict";


require(
  "dotenv"
).config({
  path:
    ".env",
});


const fs =
  require(
    "node:fs"
  );


const {
  buildAgentMemoryContext,
} =
  require(
    "./services/memory/context/agentMemoryContextPipeline"
  );


const {
  memoryLifecycleService,
} =
  require(
    "./services/memory/context/memoryLifecycleService"
  );


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


const CERTIFICATION_SERVICE =
  "phase16-certification-service";


const REPORT_PATH =
  "phase16-14-certification-results.txt";


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


async function resolveScope(
  pool
) {
  section(
    "STEP 1 — RESOLVE REAL AIRA TENANT"
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
    throw new Error(
      "aira-dev-org / env_aira_development not found"
    );
  }


  const scope =
    result.rows[0];


  log(
    `Organization: ${scope.organization_public_id}`
  );

  log(
    `Organization UUID: ${scope.organization_uuid}`
  );

  log(
    `Environment: ${scope.environment_public_id}`
  );

  log(
    `Environment UUID: ${scope.environment_uuid}`
  );


  check(
    "Real organization resolved",
    scope.organization_public_id ===
      ORGANIZATION_ID
  );


  check(
    "Real environment resolved",
    scope.environment_public_id ===
      ENVIRONMENT_ID
  );


  return scope;
}


async function inspectLifecycleConstraint(
  pool
) {
  section(
    "STEP 2 — VERIFY REAL MEMORY LIFECYCLE SCHEMA"
  );


  const result =
    await pool.query(
      `
        SELECT
          conname,
          pg_get_constraintdef(
            oid
          ) AS definition

        FROM pg_constraint

        WHERE
          conrelid =
            'memory.memories'::regclass

          AND contype =
            'c'

        ORDER BY
          conname
      `
    );


  for (
    const row
    of result.rows
  ) {
    if (
      String(
        row.definition
      )
        .toUpperCase()
        .includes(
          "STATUS"
        )
    ) {
      log(
        `${row.conname}: ${row.definition}`
      );
    }
  }


  const combined =
    result.rows
      .map(
        (
          row
        ) =>
          row.definition
      )
      .join(
        " "
      )
      .toUpperCase();


  check(
    "Database supports ACTIVE memory lifecycle",
    combined.includes(
      "ACTIVE"
    )
  );


  check(
    "Database supports STALE memory lifecycle",
    combined.includes(
      "STALE"
    )
  );


  check(
    "Database supports SUPERSEDED memory lifecycle",
    combined.includes(
      "SUPERSEDED"
    )
  );


  check(
    "Database supports ARCHIVED memory lifecycle",
    combined.includes(
      "ARCHIVED"
    )
  );


  check(
    "Database supports REVOKED memory lifecycle",
    combined.includes(
      "REVOKED"
    )
  );
}


async function discoverMemoryFamilies(
  pool,
  scope
) {
  section(
    "STEP 3 — DISCOVER REAL PHASE 16 MEMORY FAMILIES"
  );


  const result =
    await pool.query(
      `
        SELECT
          m.id,
          m.public_id,
          m.memory_type,
          m.scope_type,
          m.service_id,
          m.resource_id,
          m.title,
          m.summary,
          m.status,
          m.confidence,
          m.trust_score,
          m.evidence_count,
          m.source_count,
          m.observation_count,
          m.created_at,
          m.updated_at,

          e.public_id AS environment_public_id,

          i.public_id AS incident_public_id

        FROM memory.memories m

        LEFT JOIN tenancy.environments e
          ON e.id =
            m.environment_id

        LEFT JOIN incidents.incidents i
          ON i.id =
            m.incident_id

        WHERE
          m.organization_id =
            $1

          AND m.memory_type IN (
            'EPISODIC',
            'OUTCOME',
            'PROCEDURAL',
            'SEMANTIC',
            'HUMAN',
            'BEHAVIOURAL'
          )

        ORDER BY
          m.memory_type,
          m.updated_at DESC
      `,
      [
        scope.organization_uuid,
      ]
    );


  const families =
    {};


  for (
    const row
    of result.rows
  ) {
    if (
      !families[
        row.memory_type
      ] &&
      row.status ===
        "ACTIVE"
    ) {
      families[
        row.memory_type
      ] =
        row;
    }
  }


  const required = [
    "EPISODIC",
    "OUTCOME",
    "PROCEDURAL",
    "SEMANTIC",
    "HUMAN",
    "BEHAVIOURAL",
  ];


  for (
    const type
    of required
  ) {
    const memory =
      families[
        type
      ];


    check(
      `${type} memory exists in PostgreSQL`,
      Boolean(
        memory
      ),
      memory
        ? memory.public_id
        : "missing"
    );
  }


  log(
    "\nRepresentative memories:"
  );


  for (
    const [
      type,
      memory,
    ]
    of Object.entries(
      families
    )
  ) {
    log({
      type,

      publicId:
        memory.public_id,

      scope:
        memory.scope_type,

      environment:
        memory.environment_public_id,

      service:
        memory.service_id,

      incident:
        memory.incident_public_id,

      status:
        memory.status,
    });
  }


  return families;
}


function requestForMemory(
  memory
) {
  const request = {
    organizationId:
      ORGANIZATION_ID,

    query:
      (
        memory.summary ||
        memory.title ||
        memory.public_id
      ),

    memoryTypes: [
      memory.memory_type,
    ],

    scopes: [
      memory.scope_type,
    ],

    includeGlobal:
      false,

    limit:
      50,
  };


  if (
    memory.environment_public_id
  ) {
    request.environmentId =
      memory.environment_public_id;
  }


  if (
    memory.service_id
  ) {
    request.serviceId =
      memory.service_id;
  }


  if (
    memory.resource_id
  ) {
    request.resourceId =
      memory.resource_id;
  }


  if (
    memory.incident_public_id
  ) {
    request.incidentId =
      memory.incident_public_id;
  }


  return request;
}


async function certifyFamilyRetrieval(
  families
) {
  section(
    "STEP 4 — REAL QDRANT → POSTGRESQL → AGENT CONTEXT RETRIEVAL"
  );


  const results =
    {};


  for (
    const [
      type,
      representative,
    ]
    of Object.entries(
      families
    )
  ) {
    log(
      `\nRetrieving ${type}: ${representative.public_id}`
    );


    const request =
      requestForMemory(
        representative
      );


    const context =
      await buildAgentMemoryContext(
        request
      );


    const returned =
      context
        .memories
        .find(
          (
            memory
          ) =>
            memory.publicId ===
            representative.public_id
        );


    log({
      type,

      candidateCount:
        context
          ?.diagnostics
          ?.retrieval
          ?.candidateCount,

      hydratedCount:
        context
          ?.diagnostics
          ?.retrieval
          ?.hydratedCount,

      finalCount:
        context.memories.length,

      topMemory:
        context
          ?.diagnostics
          ?.ranking
          ?.topMemoryPublicId,

      expectedMemoryReturned:
        Boolean(
          returned
        ),
    });


    check(
      `${type} retrieval produced candidates`,
      Number(
        context
          ?.diagnostics
          ?.retrieval
          ?.candidateCount ||
        0
      ) >
        0
    );


    check(
      `${type} retrieval hydrated PostgreSQL memory`,
      Number(
        context
          ?.diagnostics
          ?.retrieval
          ?.hydratedCount ||
        0
      ) >
        0
    );


    check(
      `${type} representative reached final agent context`,
      Boolean(
        returned
      ),
      representative.public_id
    );


    if (
      returned
    ) {
      check(
        `${type} returned canonical PostgreSQL summary`,
        returned.summary ===
          representative.summary
      );


     check(
  `${type} remains tenant scoped`,
  returned.scopeType ===
    "GLOBAL" ||
  returned.tenantPublicId ===
    ORGANIZATION_ID,
  returned.scopeType ===
    "GLOBAL"
    ? "GLOBAL memory"
    : (
        `tenantPublicId=${returned.tenantPublicId}, ` +
        `canonicalOrganizationId=${returned.organizationId}`
      )
);
    }


    results[
      type
    ] =
      context;
  }


  return results;
}


async function createConflictMemory() {
  section(
    "STEP 5 — CREATE CONTROLLED LIVE HUMAN/PROCEDURAL CONFLICT"
  );


  const eventId =
    "phase16_14_conflict_restart_rejected_001";


  const result =
    await recordHumanMemory({
      organizationId:
        ORGANIZATION_ID,

      environmentId:
        ENVIRONMENT_ID,

      serviceId:
        CERTIFICATION_SERVICE,

      eventId,

      actionType:
        "REJECTED",

      actorId:
        "phase16-14-certification-sre",

      actorDisplay:
        "Phase 16.14 Certification SRE",

      actorType:
        "HUMAN",

      recommendation:
        "restart-service",

      finalAction:
        null,

      reason:
        (
          "Controlled Phase 16.14 conflict evidence. " +
          "Restart requires human review for this certification scenario."
        ),

      comment:
        "Used only to certify conflict detection.",

      occurredAt:
        new Date(),

      metadata: {
        phase:
          "16.14",

        certificationFixture:
          true,
      },
    });


  log({
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
  });


  check(
    "Controlled HUMAN conflict memory exists",
    Boolean(
      result.memory
    )
  );


  check(
    "Controlled human memory remains execution-safe",
    result
      .memory
      ?.metadata
      ?.executionAuthorized ===
      false
  );


  return result.memory;
}


async function findProcedure(
  pool,
  scope
) {
  const result =
    await pool.query(
      `
        SELECT
          m.public_id,
          m.content,
          m.status

        FROM memory.memories m

        WHERE
          m.organization_id =
            $1

          AND m.environment_id =
            $2

          AND m.service_id =
            $3

          AND m.memory_type =
            'PROCEDURAL'

          AND m.status =
            'ACTIVE'

          AND (
            m.content
              -> 'procedure'
              ->> 'action'
          ) =
            'restart-service'

        LIMIT 1
      `,
      [
        scope.organization_uuid,
        scope.environment_uuid,
        CERTIFICATION_SERVICE,
      ]
    );


  return (
    result.rows[0] ||
    null
  );
}


async function buildConflictContext(
  humanPublicId
) {
  const context =
    await buildAgentMemoryContext({
      organizationId:
        ORGANIZATION_ID,

      environmentId:
        ENVIRONMENT_ID,

      serviceId:
        CERTIFICATION_SERVICE,

      query:
        (
          "restart-service recovery procedure operator rejected " +
          "restart-service"
        ),

      memoryTypes: [
        "PROCEDURAL",
        "HUMAN",
      ],

      scopes: [
        "SERVICE",
      ],

      limit:
        100,
    });


  const ids =
    context.memories.map(
      (
        memory
      ) =>
        memory.publicId
    );


  return {
    context,

    ids,

    humanReturned:
      ids.includes(
        humanPublicId
      ),
  };
}


async function certifyConflictHandling(
  pool,
  scope,
  humanMemory
) {
  section(
    "STEP 6 — CERTIFY LIVE CONFLICT DETECTION"
  );


  const procedure =
    await findProcedure(
      pool,
      scope
    );


  check(
    "restart-service PROCEDURAL memory exists",
    Boolean(
      procedure
    ),
    procedure
      ?.public_id ||
      "missing"
  );


  if (
    !procedure
  ) {
    throw new Error(
      "Required restart-service PROCEDURAL memory not found"
    );
  }


  const result =
    await buildConflictContext(
      humanMemory.publicId
    );


  log({
    returnedIds:
      result.ids,

    conflicts:
      result
        .context
        .conflicts,
  });


  check(
    "PROCEDURAL memory reached conflict context",
    result.ids.includes(
      procedure.public_id
    )
  );


  check(
    "HUMAN rejection reached conflict context",
    result.humanReturned
  );


  check(
    "Conflict resolver detected disagreement",
    result
      .context
      .conflicts
      .hasConflicts ===
      true
  );


  check(
    "Human override conflict is surfaced",
    result
      .context
      .conflicts
      .conflicts
      .some(
        (
          conflict
        ) =>
          conflict.type ===
          "HUMAN_OVERRIDE_CONFLICT"
      )
  );


  check(
    "Human review is required for live conflict",
    result
      .context
      .conflicts
      .requiresHumanReview ===
      true
  );


  check(
    "Conflict is not automatically resolved",
    result
      .context
      .safety
      .automaticConflictResolution ===
      false
  );


  return result.context;
}


function verifyTrustRanking(
  context
) {
  section(
    "STEP 7 — VERIFY REAL TRUST RANKING"
  );


  log(
    context
      .rankedMemories
      .map(
        (
          item
        ) => ({
          rank:
            item.rank,

          publicId:
            item
              .memory
              .publicId,

          memoryType:
            item
              .memory
              .memoryType,

          scope:
            item
              .scope
              .type,

          scopeScore:
            item
              .scope
              .score,

          trustScore:
            item
              .trust
              .score,

          components:
            item
              .trust
              .components,
        })
      )
  );


  let sorted =
    true;


  for (
    let index = 1;
    index <
      context
        .rankedMemories
        .length;
    index +=
      1
  ) {
    if (
      context
        .rankedMemories[
          index
        ]
        .trust
        .score >
      context
        .rankedMemories[
          index -
          1
        ]
        .trust
        .score
    ) {
      sorted =
        false;

      break;
    }
  }


  check(
    "Trust scores are sorted descending",
    sorted
  );


  check(
    "Trust scores remain between zero and one",
    context
      .rankedMemories
      .every(
        (
          item
        ) =>
          item.trust.score >=
            0 &&
          item.trust.score <=
            1
      )
  );


  check(
    "Ranking itself grants no execution permission",
    context
      .safety
      .executionAuthorized ===
      false
  );
}


async function certifyLifecycleFiltering(
  pool,
  scope,
  humanMemory
) {
  section(
    "STEP 8 — LIVE STALE MEMORY FILTERING"
  );


  const before =
    await buildConflictContext(
      humanMemory.publicId
    );


  check(
    "Target HUMAN memory is initially retrievable",
    before.humanReturned
  );


  const stale =
    await memoryLifecycleService
      .markStale({
        organizationId:
          ORGANIZATION_ID,

        publicId:
          humanMemory.publicId,

        reason:
          "Phase 16.14H lifecycle certification",
      });


  log({
    lifecycleChanged:
      stale.changed,

    previousStatus:
      stale.previousStatus,

    currentStatus:
      stale.currentStatus,
  });


  check(
    "Human memory transitioned to STALE",
    stale.currentStatus ===
      "STALE"
  );


  const dbAfterStale =
    await pool.query(
      `
        SELECT
          public_id,
          status

        FROM memory.memories

        WHERE
          organization_id =
            $1

          AND public_id =
            $2

        LIMIT 1
      `,
      [
        scope.organization_uuid,
        humanMemory.publicId,
      ]
    );


  check(
    "STALE memory remains preserved in PostgreSQL",
    dbAfterStale
      .rows[0]
      ?.status ===
      "STALE"
  );


  const duringStale =
    await buildConflictContext(
      humanMemory.publicId
    );


  check(
    "STALE memory is removed from final agent context",
    duringStale
      .humanReturned ===
      false
  );


  const retrievalCandidateCount =
  Number(
    duringStale
      .context
      ?.diagnostics
      ?.retrieval
      ?.candidateCount ||
    0
  );


const retrievalHydratedCount =
  Number(
    duringStale
      .context
      ?.diagnostics
      ?.retrieval
      ?.hydratedCount ||
    0
  );


const lifecycleRejectedCount =
  Number(
    duringStale
      .context
      ?.diagnostics
      ?.lifecycle
      ?.rejectedCount ||
    0
  );


const staleExcludedBeforeLifecycle =
  (
    retrievalCandidateCount >
      retrievalHydratedCount
  ) &&
  (
    duringStale.humanReturned ===
      false
  );


const staleExcludedByLifecycle =
  (
    lifecycleRejectedCount >
      0
  ) &&
  (
    duringStale.humanReturned ===
      false
  );


check(
  "Lifecycle enforcement excludes STALE memory",
  staleExcludedBeforeLifecycle ||
    staleExcludedByLifecycle,
  (
    `retrievalCandidates=${retrievalCandidateCount}, ` +
    `hydrated=${retrievalHydratedCount}, ` +
    `lifecycleRejected=${lifecycleRejectedCount}, ` +
    `returned=${duringStale.humanReturned}`
  )
);


  const reactivated =
    await memoryLifecycleService
      .reactivate({
        organizationId:
          ORGANIZATION_ID,

        publicId:
          humanMemory.publicId,

        reason:
          "Phase 16.14H memory revalidated",
      });


  check(
    "STALE memory can be explicitly revalidated",
    reactivated.currentStatus ===
      "ACTIVE"
  );


  const after =
    await buildConflictContext(
      humanMemory.publicId
    );


  check(
    "Reactivated memory returns to agent context",
    after.humanReturned
  );


  return after.context;
}


function certifySafetyBoundary(
  context
) {
  section(
    "STEP 9 — FINAL AGENT SAFETY BOUNDARY"
  );


  const safety =
    context.safety;


  check(
    "Memory is evidence only",
    safety.memoryIsEvidenceOnly ===
      true
  );


  check(
    "Memory cannot authorize execution",
    safety.executionAuthorized ===
      false
  );


  check(
    "Memory cannot grant execution permission",
    safety.grantsExecutionPermission ===
      false
  );


  check(
    "Memory cannot bypass policy",
    safety.bypassesPolicy ===
      false
  );


  check(
    "Memory cannot bypass approval",
    safety.bypassesApproval ===
      false
  );


  check(
    "Memory cannot bypass entitlements",
    safety.bypassesEntitlements ===
      false
  );


  check(
    "Memory cannot bypass kill switch",
    safety.bypassesKillSwitch ===
      false
  );


  check(
    "Memory cannot suppress alerts",
    safety.suppressesAlerts ===
      false
  );


  check(
    "Policy evaluation remains mandatory",
    safety.requiresPolicyEvaluation ===
      true
  );


  check(
    "Authorization remains mandatory",
    safety.requiresAuthorization ===
      true
  );
}


async function verifyPostgresAuthority(
  pool,
  scope,
  context
) {
  section(
    "STEP 10 — VERIFY POSTGRESQL REMAINS AUTHORITATIVE"
  );


  for (
    const item
    of context.rankedMemories
  ) {
    const memory =
      item.memory;


    const result =
      await pool.query(
        `
          SELECT
            public_id,
            memory_type,
            status,
            summary,
            confidence,
            trust_score

          FROM memory.memories

          WHERE
            organization_id =
              $1

            AND public_id =
              $2

          LIMIT 1
        `,
        [
          scope.organization_uuid,
          memory.publicId,
        ]
      );


    const canonical =
      result.rows[0];


    check(
      `${memory.publicId} exists canonically in PostgreSQL`,
      Boolean(
        canonical
      )
    );


    if (
      canonical
    ) {
      check(
        `${memory.publicId} hydrated status matches PostgreSQL`,
        memory.status ===
          canonical.status
      );


      check(
        `${memory.publicId} hydrated summary matches PostgreSQL`,
        memory.summary ===
          canonical.summary
      );
    }
  }
}


function finalReport() {
  section(
    "PHASE 16.14H CERTIFICATION CHECKLIST"
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
    "FINAL CERTIFICATION RESULT"
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
      "\n✓✓✓ PHASE 16.14 CERTIFIED ✓✓✓"
    );


    log(
      "\nCertified architecture:"
    );


    log(
      "Qdrant → candidate retrieval"
    );

    log(
      "PostgreSQL → authoritative hydration"
    );

    log(
      "Lifecycle → ACTIVE-only filtering"
    );

    log(
      "Scope → tenant/locality enforcement"
    );

    log(
      "Trust → evidence ranking"
    );

    log(
      "Conflict resolver → disagreement surfaced"
    );

    log(
      "Agent context → evidence only"
    );

    log(
      "Policy/authorization → still mandatory"
    );


    return true;
  }


  log(
    "\n✗✗✗ PHASE 16.14 NOT CERTIFIED ✗✗✗"
  );


  return false;
}


async function main() {
  const pool =
    getPostgresPool();


  try {
    section(
      "AIRA PHASE 16.14H — REAL INTEGRATED MEMORY CONTEXT CERTIFICATION"
    );


    const scope =
      await resolveScope(
        pool
      );


    await inspectLifecycleConstraint(
      pool
    );


    const families =
      await discoverMemoryFamilies(
        pool,
        scope
      );


    await certifyFamilyRetrieval(
      families
    );


    const humanMemory =
      await createConflictMemory();


    const conflictContext =
      await certifyConflictHandling(
        pool,
        scope,
        humanMemory
      );


    verifyTrustRanking(
      conflictContext
    );


    const finalContext =
      await certifyLifecycleFiltering(
        pool,
        scope,
        humanMemory
      );


    certifySafetyBoundary(
      finalContext
    );


    await verifyPostgresAuthority(
      pool,
      scope,
      finalContext
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
      "PHASE 16.14H CERTIFICATION FAILED"
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