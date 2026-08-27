#!/usr/bin/env node
"use strict";


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
  closePostgresPool,
} =
  require(
    "./persistence/postgres"
  );


async function main() {
  try {
    const publicId =
      "phase16_11_semantic_contradiction_1";


    const result =
      await canonicalMemoryService
        .upsertByPublicId(
          {
            publicId,

            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            serviceId:
              "phase16-certification-service",

            resourceId:
              null,

            incidentId:
              null,

            memoryType:
              "EPISODIC",

            scopeType:
              "SERVICE",

            title:
              "Phase 16.11 contradiction evidence",

            summary:
              (
                "Database connection saturation was observed without " +
                "high API latency."
              ),

            content: {
              semanticEvidence: {
                symptom:
                  "high API latency",

                cause:
                  "database connection saturation",

                contradicts:
                  true,

                confidence:
                  0.9,

                trustScore:
                  0.9,
              },
            },

            confidence:
              0.9,

            trustScore:
              0.9,

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

              contradiction:
                true,

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
              "Phase 16.11 contradiction certification fixture",

            changedByType:
              "CERTIFICATION",
          }
        );


    await canonicalMemoryService
      .addSource({
        organizationId:
          "aira-dev-org",

        memoryPublicId:
          publicId,

        sourceType:
          "CERTIFICATION_OBSERVATION",

        sourceId:
          publicId,

        evidenceRole:
          "CONTRADICTING",

        observedAt:
          new Date(),

        metadata: {
          phase:
            "16.11",
        },
      });


    console.log(
      JSON.stringify(
        {
          created:
            result.created,

          updated:
            result.updated,

          publicId:
            result
              .memory
              ?.publicId,

          semanticEvidence:
            result
              .memory
              ?.content
              ?.semanticEvidence,
        },
        null,
        2
      )
    );

  } catch (
    error
  ) {
    console.error({
      code:
        error.code,

      message:
        error.message,

      detail:
        error.detail,

      stack:
        error.stack,
    });


    process.exitCode =
      1;

  } finally {
    await closePostgresPool();
  }
}


main();