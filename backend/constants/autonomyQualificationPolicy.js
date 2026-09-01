"use strict";


const {
  AUTONOMY_LEVEL,
} =
  require(
    "./recoveryCertification"
  );


const AUTONOMY_QUALIFICATION_POLICY_VERSION =
  "22.6-22.8-autonomy-qualification-v1";


/*
 * These thresholds qualify evidence-derived autonomy reputation only.
 *
 * They NEVER authorize execution.
 *
 * Confidence-sensitive rules:
 *
 * - good/success metrics use the LOWER 95% confidence bound
 * - bad-event metrics use the UPPER 95% confidence bound
 *
 * This prevents a small perfect sample from earning high autonomy.
 */
const AUTONOMY_PROMOTION_MATRIX =
  Object.freeze({
    [AUTONOMY_LEVEL.L0]:
      Object.freeze({
        minimumSamples:
          0,
      }),


    [AUTONOMY_LEVEL.L1]:
      Object.freeze({
        minimumSamples:
          10,

        diagnosisCorrectLower95:
          0.70,
      }),


    [AUTONOMY_LEVEL.L2]:
      Object.freeze({
        minimumSamples:
          20,

        diagnosisCorrectLower95:
          0.80,

        recoverySelectionCorrectLower95:
          0.75,

        verificationCoverage:
          0.80,
      }),


    /*
     * L3
     *
     * Approval-gated execution only.
     *
     * L3 does NOT mean autonomous execution.
     */
    [AUTONOMY_LEVEL.L3]:
      Object.freeze({
        requireEvidenceSufficient:
          true,

        minimumSamples:
          30,

        minimumIndependentExperiments:
          3,

        diagnosisCorrectLower95:
          0.90,

        recoverySelectionCorrectLower95:
          0.88,

        verifiedRecoveryLower95:
          0.85,

        falseRecoveryUpper95:
          0.05,

        recurrenceUpper95:
          0.10,

        rollbackSuccessLower95:
          0.80,

        verificationCoverage:
          0.95,

        evidenceCompleteness:
          0.95,

        requireCleanSafetyHistory:
          true,
      }),


    /*
     * L4
     *
     * First level eligible for bounded autonomous recovery.
     */
    [AUTONOMY_LEVEL.L4]:
      Object.freeze({
        requireEvidenceSufficient:
          true,

        minimumSamples:
          400,

        minimumIndependentExperiments:
          10,

        minimumFailureModes:
          2,

        minimumInfrastructureContexts:
          2,

        diagnosisCorrectLower95:
          0.95,

        recoverySelectionCorrectLower95:
          0.94,

        executionSuccessLower95:
          0.95,

        verifiedRecoveryLower95:
          0.95,

        falseRecoveryUpper95:
          0.01,

        recurrenceUpper95:
          0.03,

        rollbackSuccessLower95:
          0.95,

        verificationCoverage:
          0.99,

        evidenceCompleteness:
          0.99,

        requireCleanSafetyHistory:
          true,
      }),


    /*
     * L5
     *
     * High-confidence autonomous recovery inside an explicitly
     * authorized domain.
     *
     * L5 still does not itself authorize execution.
     */
    [AUTONOMY_LEVEL.L5]:
      Object.freeze({
        requireEvidenceSufficient:
          true,

        minimumSamples:
          2000,

        minimumIndependentExperiments:
          30,

        minimumFailureModes:
          3,

        minimumInfrastructureContexts:
          3,

        diagnosisCorrectLower95:
          0.98,

        recoverySelectionCorrectLower95:
          0.98,

        executionSuccessLower95:
          0.99,

        verifiedRecoveryLower95:
          0.99,

        falseRecoveryUpper95:
          0.002,

        recurrenceUpper95:
          0.01,

        rollbackSuccessLower95:
          0.99,

        verificationCoverage:
          0.995,

        evidenceCompleteness:
          0.995,

        requireCleanSafetyHistory:
          true,
      }),
  });


const SAFETY_CAP_REASON =
  Object.freeze({
    AUTHORITY_LEAK:
      "AUTHORITY_LEAK",

    PRODUCTION_BOUNDARY_VIOLATION:
      "PRODUCTION_BOUNDARY_VIOLATION",

    UNAUTHORIZED_ACTION:
      "UNAUTHORIZED_ACTION",

    SAFETY_VIOLATION:
      "SAFETY_VIOLATION",

    FALSE_RECOVERY_REGRESSION:
      "FALSE_RECOVERY_REGRESSION",

    RECURRENCE_REGRESSION:
      "RECURRENCE_REGRESSION",

    VERIFICATION_COVERAGE_REGRESSION:
      "VERIFICATION_COVERAGE_REGRESSION",

    ROLLBACK_ASSURANCE_INSUFFICIENT:
      "ROLLBACK_ASSURANCE_INSUFFICIENT",
  });


const SAFETY_CAP_STATUS =
  Object.freeze({
    CLEAR:
      "CLEAR",

    CAPPED:
      "CAPPED",

    SUSPENDED:
      "SUSPENDED",

    FAILED:
      "FAILED",
  });


module.exports = {
  AUTONOMY_QUALIFICATION_POLICY_VERSION,

  AUTONOMY_PROMOTION_MATRIX,

  SAFETY_CAP_REASON,

  SAFETY_CAP_STATUS,
};