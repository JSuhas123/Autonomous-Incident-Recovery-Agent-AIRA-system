"use strict";


const {
  humanLearningError,
} = require(
  "./humanLearning"
);


const HUMAN_LEARNING_REVIEW_VERSION =
  "24.7.0";


const REVIEW_STATUS =
  Object.freeze({
    PENDING:
      "PENDING",

    COMPLETED:
      "COMPLETED",

    CANCELLED:
      "CANCELLED",
  });


const REVIEW_DECISION =
  Object.freeze({
    APPROVE:
      "APPROVE",

    REJECT:
      "REJECT",

    REQUEST_CHANGES:
      "REQUEST_CHANGES",

    DEFER:
      "DEFER",
  });


const PUBLICATION_STATUS =
  Object.freeze({
    PUBLISHED:
      "PUBLISHED",

    DEPRECATED:
      "DEPRECATED",

    REVOKED:
      "REVOKED",
  });


function assertReviewCannotAuthorize(
  input = {}
) {
  if (
    input.executionAuthorized === true
    ||
    input.execution_authorized === true
    ||
    input.productionAuthorized === true
    ||
    input.production_authorized === true
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_REVIEW_AUTHORITY_FORBIDDEN",

      (
        "Human learning review cannot grant " +
        "execution or production authority"
      ),

      403
    );
  }


  return true;
}


function assertReviewDecision(
  decision
) {
  if (
    !Object
      .values(
        REVIEW_DECISION
      )
      .includes(
        decision
      )
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_REVIEW_DECISION_INVALID",

      "Invalid human learning review decision"
    );
  }


  return true;
}


module.exports = {
  HUMAN_LEARNING_REVIEW_VERSION,

  REVIEW_STATUS,

  REVIEW_DECISION,

  PUBLICATION_STATUS,

  assertReviewCannotAuthorize,

  assertReviewDecision,
};