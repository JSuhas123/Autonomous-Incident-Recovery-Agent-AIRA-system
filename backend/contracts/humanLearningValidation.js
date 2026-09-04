"use strict";


const {
  assertNoExecutionAuthority,

  humanLearningError,
} =
  require(
    "./humanLearning"
  );


const LEARNING_VALIDATION_VERSION =
  "24.4.0";


const VALIDATION_STAGE =
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


const VALIDATION_STAGE_STATUS =
  Object.freeze({
    PENDING:
      "PENDING",

    RUNNING:
      "RUNNING",

    PASSED:
      "PASSED",

    FAILED:
      "FAILED",

    SKIPPED:
      "SKIPPED",
  });


const REPLAY_BINDING_ROLE =
  Object.freeze({
    SOURCE_INCIDENT:
      "SOURCE_INCIDENT",

    SIMILAR_CASE:
      "SIMILAR_CASE",

    NEGATIVE_CASE:
      "NEGATIVE_CASE",

    COUNTEREXAMPLE:
      "COUNTEREXAMPLE",
  });


const REPLAY_RESULT_STATUS =
  Object.freeze({
    PENDING:
      "PENDING",

    RUNNING:
      "RUNNING",

    PASSED:
      "PASSED",

    FAILED:
      "FAILED",

    INCONCLUSIVE:
      "INCONCLUSIVE",
  });


function assertValidationCannotAuthorize(
  input = {}
) {
  assertNoExecutionAuthority(
    input
  );


  if (
    input.productionAuthorized ===
      true ||

    input.production_authorized ===
      true ||

    input.autonomyPromoted ===
      true ||

    input.autonomy_promoted ===
      true
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_VALIDATION_AUTHORITY_FORBIDDEN",
      "Learning validation cannot grant production or autonomy authority",
      403
    );
  }


  return true;
}


module.exports = {
  LEARNING_VALIDATION_VERSION,

  VALIDATION_STAGE,

  VALIDATION_STAGE_STATUS,

  REPLAY_BINDING_ROLE,

  REPLAY_RESULT_STATUS,

  assertValidationCannotAuthorize,
};