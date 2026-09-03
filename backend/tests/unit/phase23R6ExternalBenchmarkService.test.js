"use strict";


const {
  EXTERNAL_BENCHMARK_SERVICE_VERSION,

  RealityExternalBenchmarkService,

  assertExternalRawDataset,

  assertReplayEligibleCase,
} =
  require(
    "../../services/reality/realityExternalBenchmarkService"
  );


function rawCase() {
  return {
    rawFormat:
      "EXTERNAL_BENCHMARK_V1",

    benchmark: {
      benchmarkId:
        "RCAEVAL",
    },

    case: {
      evidenceGrade:
        "E2",
    },
  };
}


function replayCase() {
  return {
    groundTruthIncluded:
      false,

    executionAuthorized:
      false,

    realityCase: {
      evidenceGrade:
        "E2",

      provenance: {
        sourceKind:
          "EXTERNAL_BENCHMARK",
      },

      replayConfiguration: {
        seed:
          23,

        speedMultiplier:
          1,

        deterministicTimestamps:
          true,
      },

      sealing: {
        groundTruthAgentVisible:
          false,
      },

      executionAuthorized:
        false,
    },
  };
}


describe(
  "AIRA Phase 23R.6D/E — external benchmark ingestion and replay",

  () => {
    test(
      "exports the combined 23R.6D/E version",

      () => {
        expect(
          EXTERNAL_BENCHMARK_SERVICE_VERSION
        ).toBe(
          "23R.6D-E.0"
        );
      }
    );


    test(
      "accepts only RCAEval E2 raw benchmark input",

      () => {
        expect(
          assertExternalRawDataset(
            rawCase()
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "rejects non-E2 external benchmark input",

      () => {
        const value =
          rawCase();


        value
          .case
          .evidenceGrade =
          "E1";


        expect(
          () =>
            assertExternalRawDataset(
              value
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_EXTERNAL_BENCHMARK_GRADE_INVALID",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "batch ingestion delegates to the frozen ingestion service",

      async () => {
        const ingestionService = {
          ingestRawDataset:
            jest
              .fn()
              .mockResolvedValue({
                case: {
                  publicId:
                    "reality_case_1",
                },

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new RealityExternalBenchmarkService({
            ingestionService,

            corpusService:
              {},

            replayService:
              {},
          });


        const result =
          await service
            .ingestBatch({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              corpusId:
                "corpus_test",

              rawDatasets: [
                rawCase(),
                rawCase(),
              ],
            });


        expect(
          ingestionService
            .ingestRawDataset
        ).toHaveBeenCalledTimes(
          2
        );


        expect(
          result.ingestedCount
        ).toBe(
          2
        );


        expect(
          result.evidenceGrade
        ).toBe(
          "E2"
        );


        expect(
          result
            .groundTruthAgentVisible
        ).toBe(
          false
        );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "replay eligibility requires sealed E2 external benchmark case",

      () => {
        expect(
          assertReplayEligibleCase(
            replayCase()
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "replay eligibility rejects leaked evaluator truth",

      () => {
        const value =
          replayCase();


        value
          .realityCase
          .sealedEvaluation = {
            expectedDiagnosis:
              "secret",
          };


        expect(
          () =>
            assertReplayEligibleCase(
              value
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_EXTERNAL_BENCHMARK_GROUND_TRUTH_LEAKAGE",
          })
        );
      }
    );


    test(
      "creates replay through frozen replay engine without authority",

      async () => {
        const corpusService = {
          getCaseForReplay:
            jest
              .fn()
              .mockResolvedValue(
                replayCase()
              ),
        };


        const replayService = {
          createRun:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "replay_1",

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new RealityExternalBenchmarkService({
            ingestionService:
              {},

            corpusService,

            replayService,
          });


        const result =
          await service
            .createReplay({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              caseId:
                "reality_case_1",

              airaVersion:
                "23R",
            });


        expect(
          corpusService
            .getCaseForReplay
        ).toHaveBeenCalledWith({
          organizationId:
            "org_test",

          environmentId:
            "env_test",

          caseId:
            "reality_case_1",
        });


        expect(
          replayService
            .createRun
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            caseId:
              "reality_case_1",

            seed:
              23,

            deterministicTimestamps:
              true,
          })
        );


        expect(
          result.evidenceGrade
        ).toBe(
          "E2"
        );


        expect(
          result.productionCertified
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "rejects replay engine authority leakage",

      async () => {
        const service =
          new RealityExternalBenchmarkService({
            ingestionService:
              {},

            corpusService: {
              getCaseForReplay:
                jest
                  .fn()
                  .mockResolvedValue(
                    replayCase()
                  ),
            },

            replayService: {
              createRun:
                jest
                  .fn()
                  .mockResolvedValue({
                    executionAuthorized:
                      true,
                  }),
            },
          });


        await expect(
          service.createReplay({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            caseId:
              "reality_case_1",

            airaVersion:
              "23R",
          })
        ).rejects.toMatchObject({
          code:
            "REALITY_EXTERNAL_BENCHMARK_REPLAY_AUTHORITY_VIOLATION",

          executionAuthorized:
            false,
        });
      }
    );
  }
);