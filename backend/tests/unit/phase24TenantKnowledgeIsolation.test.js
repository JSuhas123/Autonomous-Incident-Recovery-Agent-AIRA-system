"use strict";


const {
  LearningCandidateScopeService,
} =
  require(
    "../../services/humanLearning/learningCandidateScopeService"
  );


describe(
  "AIRA Phase 24.5 — tenant knowledge isolation",
  () => {
    const service =
      new LearningCandidateScopeService();


    test(
      "validated environment candidate may enter explicit generalization",
      () => {
        expect(
          () =>
            service
              .assertEligibleForGeneralization({
                knowledgeScope:
                  "ENVIRONMENT",

                truthLevel:
                  "CANDIDATE",

                candidateState:
                  "HUMAN_REVIEW_PENDING",

                executionAuthorized:
                  false,
              })
        ).not.toThrow();
      }
    );


    test(
      "raw GLOBAL source candidate is rejected",
      () => {
        expect(
          () =>
            service
              .assertEligibleForGeneralization({
                knowledgeScope:
                  "GLOBAL",

                truthLevel:
                  "CANDIDATE",

                candidateState:
                  "HUMAN_REVIEW_PENDING",

                executionAuthorized:
                  false,
              })
        ).toThrow();
      }
    );


    test(
      "quarantined unvalidated candidate cannot generalize",
      () => {
        expect(
          () =>
            service
              .assertEligibleForGeneralization({
                knowledgeScope:
                  "ENVIRONMENT",

                truthLevel:
                  "CANDIDATE",

                candidateState:
                  "QUARANTINED",

                executionAuthorized:
                  false,
              })
        ).toThrow();
      }
    );
  }
);