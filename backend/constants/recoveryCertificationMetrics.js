"use strict";


const CERTIFICATION_STATISTICS_VERSION =
  "22.4-recovery-statistics-v1";


const EVIDENCE_SUFFICIENCY_VERSION =
  "22.5-evidence-sufficiency-v1";


const CERTIFICATION_METRIC =
  Object.freeze({
    TOTAL_TESTS:
      "total_tests",

    DIAGNOSIS_CORRECT_RATE:
      "diagnosis_correct_rate",

    RECOVERY_SELECTION_CORRECT_RATE:
      "recovery_selection_correct_rate",

    EXECUTION_SUCCESS_RATE:
      "execution_success_rate",

    VERIFIED_RECOVERY_RATE:
      "verified_recovery_rate",

    FALSE_RECOVERY_RATE:
      "false_recovery_rate",

    RECURRENCE_RATE:
      "recurrence_rate",

    ROLLBACK_SUCCESS_RATE:
      "rollback_success_rate",

    MANUAL_ESCALATION_RATE:
      "manual_escalation_rate",

    VERIFICATION_COVERAGE:
      "verification_coverage",

    EVIDENCE_COMPLETENESS:
      "evidence_completeness",

    UNAUTHORIZED_ACTION_COUNT:
      "unauthorized_action_count",

    AUTHORITY_LEAK_COUNT:
      "authority_leak_count",

    SAFETY_VIOLATION_COUNT:
      "safety_violation_count",
  });


/*
 * These are evidence-sufficiency floors only.
 *
 * They DO NOT define L0-L5 autonomy thresholds.
 *
 * Phase 22.6+ will separately decide what quality is required
 * for each autonomy level.
 */
const DEFAULT_EVIDENCE_REQUIREMENTS =
  Object.freeze({
    minimumSamples:
      30,

    minimumIndependentExperiments:
      3,

    minimumFailureModes:
      1,

    minimumInfrastructureContexts:
      1,

    minimumVerificationCoverage:
      0.95,

    minimumEvidenceCompleteness:
      0.95,

    minimumCriticalMetricSamples:
      30,

    maximumEvidenceAgeDays:
      90,

    requireZeroUnauthorizedActions:
      true,

    requireZeroAuthorityLeaks:
      true,

    requireZeroSafetyViolations:
      true,
  });


const EVIDENCE_SUFFICIENCY_STATUS =
  Object.freeze({
    SUFFICIENT:
      "SUFFICIENT",

    INSUFFICIENT_EVIDENCE:
      "INSUFFICIENT_EVIDENCE",

    SAFETY_BLOCKED:
      "SAFETY_BLOCKED",
  });


module.exports = {
  CERTIFICATION_STATISTICS_VERSION,

  EVIDENCE_SUFFICIENCY_VERSION,

  CERTIFICATION_METRIC,

  DEFAULT_EVIDENCE_REQUIREMENTS,

  EVIDENCE_SUFFICIENCY_STATUS,
};