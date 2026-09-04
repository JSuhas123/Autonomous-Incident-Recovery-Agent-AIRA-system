"use strict";


const {
  LearningValidationPipelineService,
} =
  require(
    "../../services/humanLearning/learningValidationPipelineService"
  );


function dependencies(
  overrides =
    {}
)
{
  return {
    validationRepository: {
      createValidationRun:
        jest.fn()
          .mockResolvedValue({
            publicId:
              "lval_001",

            executionAuthorized:
              false,
          }),
    },

    validationDecisionRepository: {
      markRunning:
        jest.fn(),

      completePassed:
        jest.fn(),

      completeFailed:
        jest.fn(),

      skipPendingStages:
        jest.fn(),
    },

    candidateRepository: {
      getCandidate:
        jest.fn()
          .mockResolvedValue({
            publicId:
              "lcand_001",

            knowledgeScope:
              "ENVIRONMENT",

            truthLevel:
              "CANDIDATE",

            executionAuthorized:
              false,
          }),
    },

    stateMachine: {
      beginValidation:
        jest.fn(),

      failValidation:
        jest.fn(),

      requestHumanReview:
        jest.fn(),
    },

    replayService: {
      validate:
        jest.fn()
          .mockResolvedValue({
            passed:
              true,

            results: [
              {
                replayCase: {
                  bindingRole:
                    "SOURCE_INCIDENT",
                },

                passed:
                  true,
              },

              {
                replayCase: {
                  bindingRole:
                    "SIMILAR_CASE",
                },

                passed:
                  true,
              },

              {
                replayCase: {
                  bindingRole:
                    "COUNTEREXAMPLE",
                },

                passed:
                  true,
              },
            ],

            executionAuthorized:
              false,
          }),
    },

    reliabilityLabService: {
      validate:
        jest.fn()
          .mockResolvedValue({
            passed:
              true,

            executionAuthorized:
              false,
          }),
    },

    regressionService: {
      validate:
        jest.fn()
          .mockResolvedValue({
            passed:
              true,

            executionAuthorized:
              false,
          }),
    },

    safetyService: {
      validate:
        jest.fn()
          .mockResolvedValue({
            passed:
              true,

            executionAuthorized:
              false,
          }),
    },

    ...overrides,
  };
}


describe(
  "AIRA Phase 24.4 — complete validation pipeline",
  () => {
    test(
      "all automated gates pass only to HUMAN_REVIEW_PENDING",
      async () => {
        const deps =
          dependencies();


        const pipeline =
          new LearningValidationPipelineService(
            deps
          );


        const output =
          await pipeline.run({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_001",

            replayCases: [
              {
                realityCaseId:
                  "source",
              },

              {
                realityCaseId:
                  "similar",
              },

              {
                realityCaseId:
                  "counter",
              },
            ],
          });


        expect(
          output.passed
        ).toBe(
          true
        );


        expect(
          output.candidateState
        ).toBe(
          "HUMAN_REVIEW_PENDING"
        );


        expect(
          output.knowledgePublished
        ).toBe(
          false
        );


        expect(
          output.executionAuthorized
        ).toBe(
          false
        );


        expect(
          deps.stateMachine
            .requestHumanReview
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    test(
      "Reality failure immediately produces VALIDATION_FAILED",
      async () => {
        const deps =
          dependencies({
            replayService: {
              validate:
                jest.fn()
                  .mockResolvedValue({
                    passed:
                      false,

                    results:
                      [],

                    executionAuthorized:
                      false,
                  }),
            },
          });


        const pipeline =
          new LearningValidationPipelineService(
            deps
          );


        const output =
          await pipeline.run({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_001",

            replayCases: [
              {
                realityCaseId:
                  "source",
              },
            ],
          });


        expect(
          output.passed
        ).toBe(
          false
        );


        expect(
          output.failedGate
        ).toBe(
          "REPLAY"
        );


        expect(
          output.candidateState
        ).toBe(
          "VALIDATION_FAILED"
        );


        expect(
          deps.reliabilityLabService
            .validate
        ).not.toHaveBeenCalled();


        expect(
          deps.regressionService
            .validate
        ).not.toHaveBeenCalled();


        expect(
          deps.safetyService
            .validate
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "Reliability Lab failure stops later validation",
      async () => {
        const deps =
          dependencies({
            reliabilityLabService: {
              validate:
                jest.fn()
                  .mockResolvedValue({
                    passed:
                      false,

                    executionAuthorized:
                      false,
                  }),
            },
          });


        const pipeline =
          new LearningValidationPipelineService(
            deps
          );


        const output =
          await pipeline.run({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_001",

            replayCases: [
              {
                realityCaseId:
                  "source",
              },
            ],
          });


        expect(
          output.failedGate
        ).toBe(
          "RELIABILITY_LAB"
        );


        expect(
          deps.regressionService
            .validate
        ).not.toHaveBeenCalled();


        expect(
          deps.safetyService
            .validate
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "safety failure cannot publish or authorize candidate",
      async () => {
        const deps =
          dependencies({
            safetyService: {
              validate:
                jest.fn()
                  .mockResolvedValue({
                    passed:
                      false,

                    violations: [
                      {
                        rule:
                          "APPROVAL_BYPASS",
                      },
                    ],

                    executionAuthorized:
                      false,
                  }),
            },
          });


        const pipeline =
          new LearningValidationPipelineService(
            deps
          );


        const output =
          await pipeline.run({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_001",

            replayCases:
              [],
          });


        expect(
          output.passed
        ).toBe(
          false
        );


        expect(
          output.failedGate
        ).toBe(
          "SAFETY"
        );


        expect(
          output.knowledgePublished
        ).toBe(
          false
        );


        expect(
          output.executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);