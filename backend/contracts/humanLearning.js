"use strict";

/**
 * ============================================================================
 * AIRA PHASE 24.0
 * HUMAN-TO-AIRA LEARNING CONTRACT
 * ============================================================================
 *
 * Core laws:
 *
 *   HUMAN ASSERTION != TRUTH
 *
 *   INCIDENT RESOLVED != ROOT CAUSE PROVEN
 *
 *   ACTION SUCCEEDED != SAFE GENERAL STRATEGY
 *
 *   MITIGATION != ROOT FIX
 *
 *   CANDIDATE != PUBLISHED KNOWLEDGE
 *
 *   TENANT KNOWLEDGE != GLOBAL KNOWLEDGE
 *
 *   RETRIEVED CONTENT != SYSTEM INSTRUCTION
 *
 *   LEARNING != EXECUTION AUTHORIZATION
 *
 *   HUMAN TAKEOVER != AUTONOMY PROMOTION
 *
 *   REPLAY PASS != PRODUCTION AUTHORIZATION
 *
 *   CAPABILITY
 *       !=
 *   CERTIFICATION
 *       !=
 *   KNOWLEDGE
 *       !=
 *   EXECUTION AUTHORITY
 *
 * ============================================================================
 */


const HUMAN_LEARNING_VERSION =
  "24.0.0";


const TRUTH_LEVEL =
  Object.freeze({
    OBSERVATION:
      "OBSERVATION",

    ASSERTION:
      "ASSERTION",

    CANDIDATE:
      "CANDIDATE",

    VALIDATED_KNOWLEDGE:
      "VALIDATED_KNOWLEDGE",
  });


const INTERVENTION_SESSION_STATUS =
  Object.freeze({
    OPEN:
      "OPEN",

    COMPLETED:
      "COMPLETED",

    ABANDONED:
      "ABANDONED",
  });


const INTERVENTION_EVENT_TYPE =
  Object.freeze({
    INVESTIGATION_STARTED:
      "INVESTIGATION_STARTED",

    QUERY_PERFORMED:
      "QUERY_PERFORMED",

    EVIDENCE_OBSERVED:
      "EVIDENCE_OBSERVED",

    HYPOTHESIS_PROPOSED:
      "HYPOTHESIS_PROPOSED",

    HYPOTHESIS_REJECTED:
      "HYPOTHESIS_REJECTED",

    DIAGNOSIS_DECLARED:
      "DIAGNOSIS_DECLARED",

    ACTION_PROPOSED:
      "ACTION_PROPOSED",

    ACTION_ATTEMPTED:
      "ACTION_ATTEMPTED",

    ACTION_REJECTED:
      "ACTION_REJECTED",

    ACTION_FAILED:
      "ACTION_FAILED",

    ACTION_SUCCEEDED:
      "ACTION_SUCCEEDED",

    MITIGATION_APPLIED:
      "MITIGATION_APPLIED",

    ROOT_FIX_APPLIED:
      "ROOT_FIX_APPLIED",

    VERIFICATION_PERFORMED:
      "VERIFICATION_PERFORMED",

    OUTCOME_DECLARED:
      "OUTCOME_DECLARED",

    INVESTIGATION_COMPLETED:
      "INVESTIGATION_COMPLETED",
  });


const HUMAN_ACTION_OUTCOME =
  Object.freeze({
    UNKNOWN:
      "UNKNOWN",

    NO_EFFECT:
      "NO_EFFECT",

    WORSENED:
      "WORSENED",

    PARTIAL_RECOVERY:
      "PARTIAL_RECOVERY",

    TEMPORARY_MITIGATION:
      "TEMPORARY_MITIGATION",

    FULL_RECOVERY:
      "FULL_RECOVERY",

    ROOT_CAUSE_CORRECTED:
      "ROOT_CAUSE_CORRECTED",

    FALSE_POSITIVE_RECOVERY:
      "FALSE_POSITIVE_RECOVERY",
  });


const KNOWLEDGE_CANDIDATE_TYPE =
  Object.freeze({
    FAILURE_MODE:
      "FAILURE_MODE",

    INVESTIGATION_PROCEDURE:
      "INVESTIGATION_PROCEDURE",

    RUNBOOK:
      "RUNBOOK",

    PLAYBOOK:
      "PLAYBOOK",

    RECOVERY_STRATEGY:
      "RECOVERY_STRATEGY",

    EVIDENCE_PATTERN:
      "EVIDENCE_PATTERN",

    NEGATIVE_PROCEDURE:
      "NEGATIVE_PROCEDURE",

    ANTI_PATTERN:
      "ANTI_PATTERN",

    CONTRAINDICATION:
      "CONTRAINDICATION",

    PREREQUISITE:
      "PREREQUISITE",

    ESCALATION_PATTERN:
      "ESCALATION_PATTERN",
  });


const KNOWLEDGE_CANDIDATE_STATE =
  Object.freeze({
    GENERATED:
      "GENERATED",

    QUARANTINED:
      "QUARANTINED",

    VALIDATION_PENDING:
      "VALIDATION_PENDING",

    VALIDATING:
      "VALIDATING",

    VALIDATION_FAILED:
      "VALIDATION_FAILED",

    HUMAN_REVIEW_PENDING:
      "HUMAN_REVIEW_PENDING",

    APPROVED:
      "APPROVED",

    REJECTED:
      "REJECTED",

    PUBLISHED:
      "PUBLISHED",

    REVOKED:
      "REVOKED",
  });


const KNOWLEDGE_SCOPE =
  Object.freeze({
    GLOBAL:
      "GLOBAL",

    ORGANIZATION:
      "ORGANIZATION",

    ENVIRONMENT:
      "ENVIRONMENT",
  });


/**
 * This is the lifecycle contract.
 *
 * Later Phase-24 batches may introduce validation-stage
 * records, but the external candidate lifecycle remains
 * constrained by this graph.
 */
const ALLOWED_CANDIDATE_TRANSITIONS =
  Object.freeze({
    GENERATED:
      Object.freeze([
        "QUARANTINED",
      ]),

    QUARANTINED:
      Object.freeze([
        "VALIDATION_PENDING",
        "REJECTED",
      ]),

    VALIDATION_PENDING:
      Object.freeze([
        "VALIDATING",
        "REJECTED",
      ]),

    VALIDATING:
      Object.freeze([
        "VALIDATION_FAILED",
        "HUMAN_REVIEW_PENDING",
      ]),

    VALIDATION_FAILED:
      Object.freeze([
        "QUARANTINED",
        "REJECTED",
      ]),

    HUMAN_REVIEW_PENDING:
      Object.freeze([
        "APPROVED",
        "REJECTED",
      ]),

    APPROVED:
      Object.freeze([
        "PUBLISHED",
        "REJECTED",
      ]),

    REJECTED:
      Object.freeze([]),

    PUBLISHED:
      Object.freeze([
        "REVOKED",
      ]),

    REVOKED:
      Object.freeze([]),
  });


function humanLearningError(
  code,
  message,
  status = 422
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      status,

      executionAuthorized:
        false,
    }
  );
}


function requireEnum(
  value,
  values,
  code,
  label
) {
  if (
    !Object
      .values(
        values
      )
      .includes(
        value
      )
  ) {
    throw humanLearningError(
      code,
      `${label} is invalid`
    );
  }


  return value;
}


function assertNoExecutionAuthority(
  input = {}
) {
  if (
    input.executionAuthorized ===
      true ||
    input.execution_authorized ===
      true
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",
      "Human-to-AIRA learning cannot grant execution authority",
      403
    );
  }
}


function assertCandidateTransition(
  fromState,
  toState
) {
  requireEnum(
    fromState,
    KNOWLEDGE_CANDIDATE_STATE,
    "HUMAN_LEARNING_CANDIDATE_STATE_INVALID",
    "fromState"
  );


  requireEnum(
    toState,
    KNOWLEDGE_CANDIDATE_STATE,
    "HUMAN_LEARNING_CANDIDATE_STATE_INVALID",
    "toState"
  );


  if (
    !ALLOWED_CANDIDATE_TRANSITIONS[
      fromState
    ].includes(
      toState
    )
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_CANDIDATE_TRANSITION_FORBIDDEN",
      `Candidate transition ${fromState} -> ${toState} is forbidden`
    );
  }


  return true;
}


module.exports = {
  HUMAN_LEARNING_VERSION,

  TRUTH_LEVEL,

  INTERVENTION_SESSION_STATUS,

  INTERVENTION_EVENT_TYPE,

  HUMAN_ACTION_OUTCOME,

  KNOWLEDGE_CANDIDATE_TYPE,

  KNOWLEDGE_CANDIDATE_STATE,

  KNOWLEDGE_SCOPE,

  ALLOWED_CANDIDATE_TRANSITIONS,

  humanLearningError,

  requireEnum,

  assertNoExecutionAuthority,

  assertCandidateTransition,
};