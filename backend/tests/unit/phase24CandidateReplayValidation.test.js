"use strict";


const {
  LearningCandidateReplayService,
} =
  require(
    "../../services/humanLearning/learningCandidateReplayService"
  );


describe(
  "AIRA Phase 24.4A — candidate Reality replay validation",
  () => {
    test(
      "passes only when every supplied replay case passes",
      async () => {
        const validationRepository = {
          bindReplayCase:
            jest
              .fn()
              .mockResolvedValue({
                executionAuthorized:
                  false,
              }),

          addEvidence:
            jest
              .fn()
              .mockResolvedValue({
                executionAuthorized:
                  false,
              }),

          setStageResult:
            jest
              .fn()
              .mockResolvedValue({
                executionAuthorized:
                  false,
              }),
        };


        const replayAdapter = {
          replayCandidate:
            jest
              .fn()
              .mockResolvedValueOnce({
                replayRunId:
                  "replay_1",

                passed:
                  true,

                executionAuthorized:
                  false,
              })
              .mockResolvedValueOnce({
                replayRunId:
                  "replay_2",

                passed:
                  true,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new LearningCandidateReplayService({
            validationRepository,

            replayAdapter,
          });


        const result =
          await service
            .validate({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              validationRunId:
                "lval_001",

              candidateId:
                "lcand_001",

              candidate: {
                candidateType:
                  "RECOVERY_STRATEGY",
              },

              cases: [
                {
                  realityCaseId:
                    "case_source",

                  bindingRole:
                    "SOURCE_INCIDENT",
                },

                {
                  realityCaseId:
                    "case_similar",

                  bindingRole:
                    "SIMILAR_CASE",
                },
              ],

              executionAuthorized:
                false,
            });


        expect(
          result.passed
        ).toBe(
          true
        );


        expect(
          validationRepository
            .bindReplayCase
        ).toHaveBeenCalledTimes(
          2
        );


        expect(
          validationRepository
            .setStageResult
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            stageType:
              "REPLAY",

            passed:
              true,

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "one failed counterexample fails replay stage",
      async () => {
        const validationRepository = {
          bindReplayCase:
            jest.fn(),

          addEvidence:
            jest.fn(),

          setStageResult:
            jest.fn(),
        };


        const service =
          new LearningCandidateReplayService({
            validationRepository,

            replayAdapter: {
              replayCandidate:
                jest
                  .fn()
                  .mockResolvedValueOnce({
                    replayRunId:
                      "replay_source",

                    passed:
                      true,

                    executionAuthorized:
                      false,
                  })
                  .mockResolvedValueOnce({
                    replayRunId:
                      "replay_counter",

                    passed:
                      false,

                    executionAuthorized:
                      false,
                  }),
            },
          });


        const result =
          await service
            .validate({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              validationRunId:
                "lval_001",

              candidateId:
                "lcand_001",

              candidate:
                {},

              cases: [
                {
                  realityCaseId:
                    "source",

                  bindingRole:
                    "SOURCE_INCIDENT",
                },

                {
                  realityCaseId:
                    "counterexample",

                  bindingRole:
                    "COUNTEREXAMPLE",
                },
              ],
            });


        expect(
          result.passed
        ).toBe(
          false
        );
      }
    );
  }
);