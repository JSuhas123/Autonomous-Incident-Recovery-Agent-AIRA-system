"use strict";


const {
  LearningRealityReplayAdapter,
} =
  require(
    "../../services/humanLearning/learningRealityReplayAdapter"
  );


describe(
  "AIRA Phase 24.4A — Reality integration boundary",
  () => {
    test(
      "forwards candidate to Reality with authority disabled",
      async () => {
        const realityReplayService = {
          replayLearningCandidate:
            jest
              .fn()
              .mockResolvedValue({
                replayRunId:
                  "replay_001",

                passed:
                  true,

                executionAuthorized:
                  false,
              }),
        };


        const adapter =
          new LearningRealityReplayAdapter({
            realityReplayService,
          });


        const result =
          await adapter
            .replayCandidate({
              candidate: {
                candidateType:
                  "FAILURE_MODE",
              },

              replayCase: {
                realityCaseId:
                  "case_001",
              },

              executionAuthorized:
                false,
            });


        expect(
          result.passed
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          realityReplayService
            .replayLearningCandidate
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "rejects authority leakage from Reality",
      async () => {
        const adapter =
          new LearningRealityReplayAdapter({
            realityReplayService: {
              replay:
                jest
                  .fn()
                  .mockResolvedValue({
                    passed:
                      true,

                    executionAuthorized:
                      true,
                  }),
            },
          });


        await expect(
          adapter.replayCandidate({
            candidate:
              {},

            replayCase:
              {},
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_LEARNING_REALITY_AUTHORITY_LEAK",
        });
      }
    );
  }
);