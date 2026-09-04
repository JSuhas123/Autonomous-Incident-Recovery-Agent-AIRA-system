"use strict";

const {
  LearningOutcomeVerifier,
} = require(
  "../../services/humanLearning/learningOutcomeVerifier"
);


describe(
  "Phase 24.6 mitigation vs root fix",
  () => {
    test(
      "stable mitigation still does not prove root-cause correction",
      () => {
        const verifier =
          new LearningOutcomeVerifier();


        const result =
          verifier.verify({
            serviceRestored:
              true,

            stabilityWindowPass:
              true,

            metricsNormalized:
              true,

            dependencyHealthPass:
              true,

            independentVerificationPass:
              true,

            mitigationApplied:
              true,

            rootFixApplied:
              false,

            rootCauseEvidencePass:
              false,

            recurrenceCheckPass:
              false,
          });


        expect(
          result.serviceRestored
        ).toBe(
          true
        );


        expect(
          result.rootCauseCorrected
        ).toBe(
          false
        );


        expect(
          result.temporaryMitigationDetected
        ).toBe(
          true
        );
      }
    );
  }
);