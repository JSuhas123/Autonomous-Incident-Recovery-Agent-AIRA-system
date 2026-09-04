"use strict";

const {
  assertPoisoningCannotAuthorize,
} = require(
  "../../contracts/humanLearningPoisoning"
);


class LearningOutcomeVerifier {
  verify(
    input = {}
  ) {
    assertPoisoningCannotAuthorize(
      input
    );


    const serviceRestored =
      input.serviceRestored ===
      true;


    const stabilityWindowPass =
      input.stabilityWindowPass ===
      true;


    const recurrenceCheckPass =
      input.recurrenceCheckPass ===
      true;


    const metricsNormalized =
      input.metricsNormalized ===
      true;


    const dependencyHealthPass =
      input.dependencyHealthPass ===
      true;


    const independentVerificationPass =
      input.independentVerificationPass ===
      true;


    const rootCauseEvidencePass =
      input.rootCauseEvidencePass ===
      true;


    const explicitRootFix =
      input.rootFixApplied ===
      true;


    const mitigationApplied =
      input.mitigationApplied ===
      true;


    /*
     * Service restoration requires more than a successful command.
     */
    const verifiedServiceRestored =
      serviceRestored
      &&
      stabilityWindowPass
      &&
      metricsNormalized
      &&
      dependencyHealthPass
      &&
      independentVerificationPass;


    /*
     * Root-cause correction is stronger again.
     */
    const rootCauseCorrected =
      verifiedServiceRestored
      &&
      explicitRootFix
      &&
      rootCauseEvidencePass
      &&
      recurrenceCheckPass;


    const falseSuccessDetected =
      serviceRestored
      &&
      verifiedServiceRestored !==
        true;


    const temporaryMitigationDetected =
      mitigationApplied
      &&
      rootCauseCorrected !==
        true;


    return {
      serviceRestored:
        verifiedServiceRestored,

      rootCauseCorrected,

      stabilityWindowPass,

      recurrenceCheckPass,

      metricsNormalized,

      dependencyHealthPass,

      independentVerificationPass,

      rootCauseEvidencePass,

      falseSuccessDetected,

      temporaryMitigationDetected,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningOutcomeVerifier,
};