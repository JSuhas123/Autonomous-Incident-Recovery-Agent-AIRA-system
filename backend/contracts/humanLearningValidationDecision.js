"use strict";


const {
  humanLearningError,
} =
  require(
    "./humanLearning"
  );


const {
  assertValidationCannotAuthorize,
} =
  require(
    "./humanLearningValidation"
  );


const HUMAN_LEARNING_VALIDATION_DECISION_VERSION =
  "24.4.1";


const VALIDATION_GATE =
  Object.freeze({
    REPLAY:
      "REPLAY",

    RELIABILITY_LAB:
      "RELIABILITY_LAB",

    REGRESSION:
      "REGRESSION",

    SAFETY:
      "SAFETY",
  });


const VALIDATION_PROFILE =
  Object.freeze({
    STANDARD:
      "STANDARD",

    HIGH_RISK:
      "HIGH_RISK",

    GLOBAL_PROMOTION:
      "GLOBAL_PROMOTION",
  });


const VALIDATION_DECISION =
  Object.freeze({
    CONTINUE:
      "CONTINUE",

    FAIL:
      "FAIL",

    HUMAN_REVIEW:
      "HUMAN_REVIEW",
  });


const SAFETY_RULE =
  Object.freeze({
    EXECUTION_AUTHORITY_ESCALATION:
      "EXECUTION_AUTHORITY_ESCALATION",

    PRODUCTION_AUTONOMY_PROMOTION:
      "PRODUCTION_AUTONOMY_PROMOTION",

    APPROVAL_BYPASS:
      "APPROVAL_BYPASS",

    TENANT_POLICY_WEAKENING:
      "TENANT_POLICY_WEAKENING",

    ROLLBACK_REMOVAL:
      "ROLLBACK_REMOVAL",

    VERIFICATION_SUPPRESSION:
      "VERIFICATION_SUPPRESSION",

    STALE_CONTEXT_DEPENDENCY:
      "STALE_CONTEXT_DEPENDENCY",

    UNBOUNDED_SCOPE:
      "UNBOUNDED_SCOPE",

    EVALUATOR_GROUND_TRUTH_LEAKAGE:
      "EVALUATOR_GROUND_TRUTH_LEAKAGE",
  });


function assertValidationDecisionSafe(
  input = {}
) {
  assertValidationCannotAuthorize(
    input
  );


  if (
    input.publish === true ||

    input.published === true ||

    input.publishKnowledge === true
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_VALIDATION_PUBLICATION_FORBIDDEN",

      "Phase 24 validation cannot publish knowledge",

      403
    );
  }


  if (
    input.truthLevel ===
      "VALIDATED_KNOWLEDGE"
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_VALIDATION_TRUTH_PROMOTION_FORBIDDEN",

      (
        "Validation pipeline cannot directly " +
        "convert a candidate into validated knowledge"
      ),

      403
    );
  }


  return true;
}


module.exports = {
  HUMAN_LEARNING_VALIDATION_DECISION_VERSION,

  VALIDATION_GATE,

  VALIDATION_PROFILE,

  VALIDATION_DECISION,

  SAFETY_RULE,

  assertValidationDecisionSafe,
};