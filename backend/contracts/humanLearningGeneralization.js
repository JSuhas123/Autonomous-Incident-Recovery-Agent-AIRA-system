"use strict";


const {
  humanLearningError,
} =
  require(
    "./humanLearning"
  );


const HUMAN_LEARNING_GENERALIZATION_VERSION =
  "24.5.0";


const GENERALIZATION_TARGET_SCOPE =
  Object.freeze({
    GLOBAL:
      "GLOBAL",
  });


const GENERALIZATION_STATUS =
  Object.freeze({
    REQUESTED:
      "REQUESTED",

    PROCESSING:
      "PROCESSING",

    BOUNDARY_REVIEW_PENDING:
      "BOUNDARY_REVIEW_PENDING",

    BOUNDARY_APPROVED:
      "BOUNDARY_APPROVED",

    BOUNDARY_REJECTED:
      "BOUNDARY_REJECTED",

    FAILED:
      "FAILED",

    CANCELLED:
      "CANCELLED",
  });


const GENERALIZED_ARTIFACT_STATUS =
  Object.freeze({
    QUARANTINED:
      "QUARANTINED",

    BOUNDARY_CLEAN:
      "BOUNDARY_CLEAN",

    BOUNDARY_REJECTED:
      "BOUNDARY_REJECTED",
  });


const GENERALIZATION_REVIEW_DECISION =
  Object.freeze({
    APPROVE:
      "APPROVE",

    REJECT:
      "REJECT",

    REQUEST_CHANGES:
      "REQUEST_CHANGES",
  });


const ISOLATION_CHECK =
  Object.freeze({
    TENANT_IDENTIFIER_LEAKAGE:
      "TENANT_IDENTIFIER_LEAKAGE",

    SECRET_LEAKAGE:
      "SECRET_LEAKAGE",

    TOPOLOGY_LEAKAGE:
      "TOPOLOGY_LEAKAGE",

    SOURCE_IDENTITY_LEAKAGE:
      "SOURCE_IDENTITY_LEAKAGE",

    CROSS_TENANT_RETRIEVAL:
      "CROSS_TENANT_RETRIEVAL",
  });


function assertGeneralizationCannotAuthorize(
  input = {}
) {
  const authorityValues = [
    input.executionAuthorized,
    input.execution_authorized,
    input.productionAuthorized,
    input.production_authorized,
    input.autonomyPromoted,
    input.autonomy_promoted,
  ];


  if (
    authorityValues.some(
      (
        value
      ) =>
        value ===
        true
    )
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERALIZATION_AUTHORITY_FORBIDDEN",

      (
        "Knowledge generalization cannot grant " +
        "execution, production, or autonomy authority"
      ),

      403
    );
  }


  return true;
}


function assertTenantCandidateScope(
  scope
) {
  if (
    scope !==
      "ORGANIZATION"
    &&
    scope !==
      "ENVIRONMENT"
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_GENERALIZATION_SOURCE_SCOPE_INVALID",

      (
        "Only ORGANIZATION or ENVIRONMENT candidates " +
        "may enter tenant-to-global generalization"
      ),

      409
    );
  }


  return true;
}


module.exports = {
  HUMAN_LEARNING_GENERALIZATION_VERSION,

  GENERALIZATION_TARGET_SCOPE,

  GENERALIZATION_STATUS,

  GENERALIZED_ARTIFACT_STATUS,

  GENERALIZATION_REVIEW_DECISION,

  ISOLATION_CHECK,

  assertGeneralizationCannotAuthorize,

  assertTenantCandidateScope,
};