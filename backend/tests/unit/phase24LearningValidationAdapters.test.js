"use strict";


const {
  LearningRealityReplayAdapter,
} =
  require(
    "../../services/humanLearning/learningRealityReplayAdapter"
  );


const {
  LearningReliabilityLabAdapter,
} =
  require(
    "../../services/humanLearning/learningReliabilityLabAdapter"
  );


describe(
  "AIRA Phase 24.4 — validation adapter safety",
  () => {
    test(
      "Reality adapter refuses requested execution authority",
      async () => {
        const adapter =
          new LearningRealityReplayAdapter({
            realityReplayService:
              {},
          });


        await expect(
          adapter.replayCandidate({
            executionAuthorized:
              true,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",
        });
      }
    );


    test(
      "Reliability Lab adapter refuses requested execution authority",
      async () => {
        const adapter =
          new LearningReliabilityLabAdapter({
            labService:
              {},
          });


        await expect(
          adapter.validateCandidate({
            executionAuthorized:
              true,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",
        });
      }
    );


    test(
      "Reliability Lab authority leakage is rejected",
      async () => {
        const adapter =
          new LearningReliabilityLabAdapter({
            labService: {
              validateLearningCandidate:
                jest
                  .fn()
                  .mockResolvedValue({
                    recoveryPass:
                      true,

                    verificationPass:
                      true,

                    rollbackPass:
                      true,

                    safetyPass:
                      true,

                    executionAuthorized:
                      true,
                  }),
            },
          });


        await expect(
          adapter.validateCandidate({
            candidate:
              {},

            validationRunId:
              "lval_001",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_LEARNING_LAB_AUTHORITY_LEAK",
        });
      }
    );
  }
);