"use strict";


const {
  LearningReviewService,
} = require(
    "../../services/humanLearning/learningReviewService"
  );


describe(
  "AIRA Phase 24.7 — human learning review",
  () => {
    test(
      "approval moves candidate only to APPROVED",
      async () => {
        const candidateRepository = {
          transitionCandidate:
            jest.fn()
              .mockResolvedValue({
                executionAuthorized:
                  false,
              }),
        };


        const reviewRepository = {
          recordDecision:
            jest.fn()
              .mockResolvedValue({
                publicId:
                  "lrdec_1",

                decision:
                  "APPROVE",

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new LearningReviewService({
            candidateRepository,

            reviewRepository,
          });


        const result =
          await service.decide({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_1",

            reviewTaskId:
              "lrview_1",

            decision:
              "APPROVE",

            reason:
              "Validated evidence supports publication",

            reviewerId:
              "reviewer_2",

            executionAuthorized:
              false,
          });


        expect(
          result.candidateState
        ).toBe(
          "APPROVED"
        );


        expect(
          result.knowledgePublished
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          candidateRepository
            .transitionCandidate
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            nextState:
              "APPROVED",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "rejection moves candidate to REJECTED",
      async () => {
        const candidateRepository = {
          transitionCandidate:
            jest.fn(),
        };


        const service =
          new LearningReviewService({
            candidateRepository,

            reviewRepository: {
              recordDecision:
                jest.fn()
                  .mockResolvedValue({
                    decision:
                      "REJECT",
                  }),
            },
          });


        const result =
          await service.decide({
            organizationId:
              "org",

            environmentId:
              "env",

            candidateId:
              "lcand_1",

            reviewTaskId:
              "lrview_1",

            decision:
              "REJECT",

            reason:
              "Evidence does not prove causality",

            reviewerId:
              "reviewer",
          });


        expect(
          result.candidateState
        ).toBe(
          "REJECTED"
        );
      }
    );
  }
);