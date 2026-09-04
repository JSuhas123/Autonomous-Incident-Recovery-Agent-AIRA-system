"use strict";

const {
  LearningOutcomeVerifier,
} = require(
  "../../services/humanLearning/learningOutcomeVerifier"
);


describe(
  "Phase 24.6 false success protection",
  () => {
    test(
      "command success and immediate health do not prove recovery",
      () => {
        const verifier =
          new LearningOutcomeVerifier();


        const result =
          verifier.verify({
            serviceRestored:
              true,

            stabilityWindowPass:
              false,

            metricsNormalized:
              true,

            dependencyHealthPass:
              true,

            independentVerificationPass:
              true,

            executionAuthorized:
              false,
          });


        expect(
          result.serviceRestored
        ).toBe(
          false
        );


        expect(
          result.falseSuccessDetected
        ).toBe(
          true
        );


        expect(
          result.rootCauseCorrected
        ).toBe(
          false
        );
      }
    );
  }
);