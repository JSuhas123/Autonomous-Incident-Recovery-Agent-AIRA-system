"use strict";


const {
  LearningReliabilityLabValidationService,
} =
  require(
    "../../services/humanLearning/learningReliabilityLabValidationService"
  );


describe(
  "AIRA Phase 24.4B — Reliability Lab candidate validation",
  () => {
    test(
      "requires recovery, verification, rollback and safety",
      async () => {
        const validationRepository = {
          addEvidence:
            jest.fn(),

          setStageResult:
            jest.fn(),
        };


        const service =
          new LearningReliabilityLabValidationService({
            validationRepository,

            labAdapter: {
              validateCandidate:
                jest
                  .fn()
                  .mockResolvedValue({
                    experimentRunId:
                      "exp_001",

                    recoveryPass:
                      true,

                    verificationPass:
                      true,

                    rollbackPass:
                      true,

                    safetyPass:
                      true,

                    sideEffects:
                      [],

                    falsePositiveRate:
                      0,

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

              candidate:
                {},

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
      }
    );


    test(
      "recovery without rollback safety fails validation",
      async () => {
        const service =
          new LearningReliabilityLabValidationService({
            validationRepository: {
              addEvidence:
                jest.fn(),

              setStageResult:
                jest.fn(),
            },

            labAdapter: {
              validateCandidate:
                jest
                  .fn()
                  .mockResolvedValue({
                    recoveryPass:
                      true,

                    verificationPass:
                      true,

                    rollbackPass:
                      false,

                    safetyPass:
                      true,

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

              candidate:
                {},
            });


        expect(
          result.passed
        ).toBe(
          false
        );
      }
    );


    test(
      "recovery without verification fails validation",
      async () => {
        const service =
          new LearningReliabilityLabValidationService({
            validationRepository: {
              addEvidence:
                jest.fn(),

              setStageResult:
                jest.fn(),
            },

            labAdapter: {
              validateCandidate:
                jest
                  .fn()
                  .mockResolvedValue({
                    recoveryPass:
                      true,

                    verificationPass:
                      false,

                    rollbackPass:
                      true,

                    safetyPass:
                      true,

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

              candidate:
                {},
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