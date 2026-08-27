#!/usr/bin/env node
"use strict";

/**
 * ============================================================================
 * AIRA PHASE 16.11
 * SEMANTIC MEMORY CERTIFICATION FIXTURES
 * ============================================================================
 *
 * Creates controlled canonical source memories containing explicit:
 *
 *   content.semanticEvidence
 *
 * These are the authoritative inputs consumed by Phase 16.11.
 *
 * Initial evidence:
 *
 *   3 SUPPORTING observations
 *
 * Relationship:
 *
 *   symptom:
 *     high API latency
 *
 *   cause:
 *     database connection saturation
 *
 * Scope:
 *
 *   aira-dev-org
 *   env_aira_development
 *   phase16-certification-service
 *
 * PostgreSQL is authoritative.
 * Qdrant is retrieval only.
 * ============================================================================
 */

require(
  "dotenv"
).config({
  path:
    ".env",
});


const {
  canonicalMemoryService,
} =
  require(
    "./services/memory/canonicalMemoryService"
  );


const {
  memoryIndexService,
} =
  require(
    "./services/memory/vector/memoryIndexService"
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


const SYMPTOM =
  "high API latency";


const CAUSE =
  "database connection saturation";


function section(
  title
) {
  console.log(
    "\n" +
    "=".repeat(
      72
    )
  );

  console.log(
    title
  );

  console.log(
    "=".repeat(
      72
    )
  );
}


async function createEvidenceMemory({
  index,

  contradicts =
    false,
}) {
  const publicId =
    contradicts
      ? `phase16_11_semantic_contradiction_${index}`
      : `phase16_11_semantic_support_${index}`;


  const result =
    await canonicalMemoryService
      .upsertByPublicId(
        {
          publicId,

          organizationId:
            ORGANIZATION_ID,

          environmentId:
            ENVIRONMENT_ID,

          serviceId:
            SERVICE_ID,

          resourceId:
            null,

          incidentId:
            null,

          memoryType:
            "EPISODIC",

          scopeType:
            "SERVICE",

          title:
            contradicts
              ? `Semantic contradiction evidence ${index}`
              : `Semantic supporting evidence ${index}`,

          summary:
            contradicts
              ? (
                  `${CAUSE} was observed without producing ${SYMPTOM}.`
                )
              : (
                  `${CAUSE} was observed together with ${SYMPTOM}.`
                ),

          content: {
            semanticEvidence: {
              symptom:
                SYMPTOM,

              cause:
                CAUSE,

              contradicts,

              confidence:
                contradicts
                  ? 0.88
                  : 0.94,

              trustScore:
                contradicts
                  ? 0.88
                  : 0.92,
            },

            certification: {
              phase:
                "16.11",

              fixture:
                true,

              evidenceType:
                contradicts
                  ? "CONTRADICTING"
                  : "SUPPORTING",
            },
          },

          confidence:
            contradicts
              ? 0.88
              : 0.94,

          trustScore:
            contradicts
              ? 0.88
              : 0.92,

          importance:
            0.8,

          status:
            "ACTIVE",

          sourceType:
            "PHASE16_11_CERTIFICATION",

          sourceCount:
            0,

          evidenceCount:
            1,

          observationCount:
            1,

          observedAt:
            new Date(),

          validFrom:
            null,

          validUntil:
            null,

          supersedesMemoryId:
            null,

          legacySourceType:
            null,

          legacySourceId:
            null,

          metadata: {
            phase:
              "16.11",

            certificationFixture:
              true,

            semanticEvidence: {
              symptom:
                SYMPTOM,

              cause:
                CAUSE,

              contradicts,
            },

            authoritativeStore:
              "postgresql",

            retrievalStore:
              "qdrant",

            executionAuthorized:
              false,
          },

          schemaVersion:
            1,
        },
        {
          changeReason:
            "Phase 16.11 semantic certification fixture synchronization",

          changedByType:
            "CERTIFICATION",
        }
      );


  await canonicalMemoryService
    .addSource({
      organizationId:
        ORGANIZATION_ID,

      memoryPublicId:
        publicId,

      sourceType:
        "CERTIFICATION_OBSERVATION",

      sourceId:
        publicId,

      evidenceRole:
        contradicts
          ? "CONTRADICTING"
          : "SUPPORTING",

      observedAt:
        new Date(),

      metadata: {
        phase:
          "16.11",

        certificationFixture:
          true,
      },
    });


  let indexing;


  try {
    indexing =
      await memoryIndexService
        .indexMemory({
          organizationId:
            ORGANIZATION_ID,

          publicId,
        });

  } catch (
    error
  ) {
    indexing = {
      indexed:
        false,

      error: {
        code:
          error.code ||
          "INDEX_FAILED",

        message:
          error.message,
      },
    };
  }


  return {
    publicId,

    created:
      result.created,

    updated:
      result.updated,

    memory:
      result.memory,

    indexing,
  };
}


async function main() {
  try {
    section(
      "AIRA PHASE 16.11 — CREATE SUPPORTING SEMANTIC EVIDENCE"
    );


    const results =
      [];


    for (
      let index = 1;
      index <= 3;
      index += 1
    ) {
      const result =
        await createEvidenceMemory({
          index,

          contradicts:
            false,
        });


      console.log(
        JSON.stringify(
          {
            publicId:
              result.publicId,

            created:
              result.created,

            updated:
              result.updated,

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

            semanticEvidence:
              result
                .memory
                ?.content
                ?.semanticEvidence,

            indexed:
              result
                .indexing
                ?.indexed,
          },
          null,
          2
        )
      );


      results.push(
        result
      );
    }


    section(
      "SUMMARY"
    );


    console.log(
      JSON.stringify(
        {
          supportingEvidence:
            results.length,

          symptom:
            SYMPTOM,

          cause:
            CAUSE,

          organizationId:
            ORGANIZATION_ID,

          environmentId:
            ENVIRONMENT_ID,

          serviceId:
            SERVICE_ID,
        },
        null,
        2
      )
    );


    console.log(
      "\n✓ Phase 16.11 supporting evidence ready"
    );

  } catch (
    error
  ) {
    console.error(
      "\nFAILED:",
      {
        code:
          error.code,

        message:
          error.message,

        detail:
          error.detail,

        constraint:
          error.constraint,
      }
    );


    process.exitCode =
      1;

  } finally {
    await closePostgresPool();
  }
}


main();
