"use strict";


const crypto =
  require(
    "node:crypto"
  );


const {
  REALITY_ARTIFACT_KIND,

  REALITY_VISIBILITY,
} =
  require(
    "../../constants/reality"
  );


const {
  RealityDatasetIngestionService,

  validateNormalizedBundle,
} =
  require(
    "../../services/reality/realityDatasetIngestionService"
  );


function hash(
  body
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      body
    )
    .digest(
      "hex"
    );
}


function buildNormalizedBundle() {
  const body =
    Buffer.from(
      "dependency timeout\n"
    );


  const contentHash =
    hash(
      body
    );


  return {
    schemaVersion:
      "23R.3.0",


    adapter:
      "AIRA_RAW_BUNDLE_V1",


    sourceRegistration: {
      publicId:
        "reality_source_123",

      sourceKind:
        "AIRA_LAB",

      sourceName:
        "AIRA Reliability Lab",

      sourceVersion:
        "phase21",

      license:
        "INTERNAL",

      modified:
        false,

      groundTruthMethod:
        "controlled fault injection",

      metadata: {},

      executionAuthorized:
        false,
    },


    realityCase: {
      identity: {
        caseId:
          "case_dependency_001",

        title:
          "Dependency failure",
      },


      scope: {
        organizationId:
          "org_test",

        environmentId:
          "env_test",
      },


      provenance: {
        sourceKind:
          "AIRA_LAB",

        sourceName:
          "AIRA Reliability Lab",

        sourceVersion:
          "phase21",

        license:
          "INTERNAL",

        modified:
          false,

        groundTruthMethod:
          "controlled fault injection",
      },


      evidenceGrade:
        "E2",


      workload: {
        service:
          "api",
      },


      timeline: [
        {
          eventId:
            "event_1",

          offsetMs:
            0,

          kind:
            "LOG",

          artifactId:
            "logs_1",
        },
      ],


      visibleEvidence: {
        signals: [],

        metrics: [],

        logs: [
          {
            artifactId:
              "logs_1",

            kind:
              "LOG",

            contentHash,
          },
        ],

        traces: [],

        topology: [],

        resourceStates: [],
      },


      sealedEvaluation: {
        knownFault:
          "dependency unavailable",

        expectedDiagnosis:
          "dependency outage",

        acceptableDiagnoses: [
          "dependency outage",
        ],

        expectedRecoveryFamily:
          "DEPENDENCY_RECOVERY",
      },


      safetyRestrictions: [
        "LAB_ONLY",
      ],


      evaluationRubric: {
        safetyDominates:
          true,
      },


      replayConfiguration: {
        seed:
          23,

        speedMultiplier:
          1,

        deterministicTimestamps:
          true,
      },


      artifacts: [
        {
          artifactId:
            "logs_1",

          kind:
            "LOG",

          contentHash,
        },
      ],


      sealing: {
        evidenceVisibility:
          REALITY_VISIBILITY
            .EVIDENCE,

        evaluationVisibility:
          REALITY_VISIBILITY
            .SEALED_EVALUATION,

        groundTruthAgentVisible:
          false,
      },


      version: {
        revision:
          1,

        contentHash:
          null,
      },


      executionAuthorized:
        false,
    },


    artifacts: [
      {
        artifactId:
          "logs_1",

        kind:
          REALITY_ARTIFACT_KIND
            .LOG,

        channel:
          REALITY_VISIBILITY
            .EVIDENCE,

        mediaType:
          "text/plain",

        byteSize:
          body.length,

        contentHash,

        contentBase64:
          body.toString(
            "base64"
          ),

        provenance: {},

        trustedGroundTruth:
          false,

        executionAuthorized:
          false,
      },
    ],


    normalizationDigest:
      "a".repeat(
        64
      ),


    executionAuthorized:
      false,
  };
}


describe(
  "Phase 23R.3 dataset ingestion + normalization",

  () => {
    test(
      "normalized bundle is scope-bound and answer sealed",

      () => {
        expect(
          validateNormalizedBundle(
            buildNormalizedBundle(),

            {
              organizationId:
                "org_test",

              environmentId:
                "env_test",
            }
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "normalized artifact bytes are independently rehashed by Node",

      () => {
        const bundle =
          buildNormalizedBundle();


        bundle
          .artifacts[0]
          .contentHash =
          "f".repeat(
            64
          );


        expect(
          () =>
            validateNormalizedBundle(
              bundle,

              {
                organizationId:
                  "org_test",

                environmentId:
                  "env_test",
              }
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_NORMALIZED_ARTIFACT_HASH_MISMATCH",
          })
        );
      }
    );


    test(
      "sealed artifacts cannot enter dataset evidence channel",

      () => {
        const bundle =
          buildNormalizedBundle();


        bundle
          .artifacts[0]
          .channel =
          REALITY_VISIBILITY
            .SEALED_EVALUATION;


        expect(
          () =>
            validateNormalizedBundle(
              bundle,

              {
                organizationId:
                  "org_test",

                environmentId:
                  "env_test",
              }
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_NORMALIZED_SEALED_ARTIFACT_FORBIDDEN",
          })
        );
      }
    );


    test(
      "ingestion persists source, case, then immutable evidence artifacts",

      async () => {
        const normalized =
          buildNormalizedBundle();


        const corpusService = {
          createDatasetSource:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "reality_source_123",

                executionAuthorized:
                  false,
              }),


          registerCase:
            jest
              .fn()
              .mockResolvedValue({
                created:
                  true,

                contentHash:
                  "b".repeat(
                    64
                  ),

                executionAuthorized:
                  false,
              }),
        };


        const evidenceStore = {
          storeArtifact:
            jest
              .fn()
              .mockImplementation(
                async (
                  input
                ) => ({
                  created:
                    true,

                  duplicate:
                    false,

                  artifact: {
                    artifactId:
                      input
                        .artifactId,

                    contentHash:
                      hash(
                        input.body
                      ),
                  },

                  executionAuthorized:
                    false,
                })
              ),
        };


        const service =
          new RealityDatasetIngestionService({
            normalizer: {
              normalize:
                jest
                  .fn()
                  .mockResolvedValue(
                    normalized
                  ),
            },


            corpusService,


            evidenceStore,
          });


        const result =
          await service
            .ingestRawDataset({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              corpusId:
                "corpus_1",

              rawDataset: {
                rawFormat:
                  "AIRA_RAW_BUNDLE_V1",
              },
            });


        expect(
          result.artifactCount
        ).toBe(
          1
        );


        expect(
          result.groundTruthAgentVisible
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          corpusService
            .createDatasetSource
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          corpusService
            .registerCase
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          evidenceStore
            .storeArtifact
        ).toHaveBeenCalledTimes(
          1
        );


        const artifactInput =
          evidenceStore
            .storeArtifact
            .mock
            .calls[0][0];


        expect(
          artifactInput.channel
        ).toBe(
          REALITY_VISIBILITY
            .EVIDENCE
        );


        expect(
          Buffer.isBuffer(
            artifactInput.body
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "ingestion rejects normalized cross-tenant scope",

      async () => {
        const normalized =
          buildNormalizedBundle();


        normalized
          .realityCase
          .scope
          .organizationId =
          "other_org";


        const service =
          new RealityDatasetIngestionService({
            normalizer: {
              normalize:
                jest
                  .fn()
                  .mockResolvedValue(
                    normalized
                  ),
            },

            corpusService: {},

            evidenceStore: {},
          });


        await expect(
          service
            .ingestRawDataset({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              corpusId:
                "corpus_1",

              rawDataset: {},
            })
        ).rejects.toMatchObject({
          code:
            "REALITY_NORMALIZED_SCOPE_MISMATCH",

          executionAuthorized:
            false,
        });
      }
    );
  }
);