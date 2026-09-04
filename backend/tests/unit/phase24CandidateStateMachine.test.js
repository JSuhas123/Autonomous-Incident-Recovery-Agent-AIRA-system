"use strict";


const {
  LearningCandidateStateMachine,
} =
  require(
    "../../services/humanLearning/learningCandidateStateMachine"
  );


describe(
  "AIRA Phase 24.4D — candidate validation state machine",
  () => {
    test(
      "quarantined candidate enters VALIDATING through VALIDATION_PENDING",
      async () => {
        const repository = {
          transitionCandidate:
            jest
              .fn()
              .mockResolvedValue({
                executionAuthorized:
                  false,
              }),
        };


        const machine =
          new LearningCandidateStateMachine({
            candidateRepository:
              repository,
          });


        const output =
          await machine.beginValidation({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_1",
          });


        expect(
          output.state
        ).toBe(
          "VALIDATING"
        );


        expect(
          repository
            .transitionCandidate
        ).toHaveBeenNthCalledWith(
          1,

          expect.objectContaining({
            nextState:
              "VALIDATION_PENDING",

            executionAuthorized:
              false,
          })
        );


        expect(
          repository
            .transitionCandidate
        ).toHaveBeenNthCalledWith(
          2,

          expect.objectContaining({
            nextState:
              "VALIDATING",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "failed validation terminates in VALIDATION_FAILED",
      async () => {
        const machine =
          new LearningCandidateStateMachine({
            candidateRepository: {
              transitionCandidate:
                jest.fn(),
            },
          });


        const output =
          await machine.failValidation({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_1",

            reason:
              "Regression failed",
          });


        expect(
          output.state
        ).toBe(
          "VALIDATION_FAILED"
        );


        expect(
          output.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "automated validation can only progress to HUMAN_REVIEW_PENDING",
      async () => {
        const machine =
          new LearningCandidateStateMachine({
            candidateRepository: {
              transitionCandidate:
                jest.fn(),
            },
          });


        const output =
          await machine.requestHumanReview({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_1",
          });


        expect(
          output.state
        ).toBe(
          "HUMAN_REVIEW_PENDING"
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