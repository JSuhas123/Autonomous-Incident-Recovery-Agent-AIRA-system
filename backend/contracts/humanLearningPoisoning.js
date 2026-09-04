"use strict";

const {
  humanLearningError,
} = require("./humanLearning");


const HUMAN_LEARNING_POISONING_VERSION =
  "24.6.0";


const CONTENT_CHANNEL =
  Object.freeze({
    SYSTEM_POLICY:
      "SYSTEM_POLICY",

    OPERATOR_ASSERTION:
      "OPERATOR_ASSERTION",

    RETRIEVED_EVIDENCE:
      "RETRIEVED_EVIDENCE",

    TOOL_OUTPUT:
      "TOOL_OUTPUT",

    MODEL_INTERPRETATION:
      "MODEL_INTERPRETATION",

    VALIDATED_FACT:
      "VALIDATED_FACT",
  });


const POISONING_CLASS =
  Object.freeze({
    BAD_HUMAN_RESOLUTION:
      "BAD_HUMAN_RESOLUTION",

    INCORRECT_RCA:
      "INCORRECT_RCA",

    MALICIOUS_OPERATOR_CONTENT:
      "MALICIOUS_OPERATOR_CONTENT",

    PROMPT_INJECTION:
      "PROMPT_INJECTION",

    RETRIEVED_EVIDENCE_POISONING:
      "RETRIEVED_EVIDENCE_POISONING",

    FALSE_SUCCESS:
      "FALSE_SUCCESS",

    TEMPORARY_MITIGATION:
      "TEMPORARY_MITIGATION",

    CONTRADICTORY_EVIDENCE:
      "CONTRADICTORY_EVIDENCE",

    UNSUPPORTED_CAUSAL_CLAIM:
      "UNSUPPORTED_CAUSAL_CLAIM",

    SECRET_EXFILTRATION:
      "SECRET_EXFILTRATION",

    CROSS_TENANT_CONTAMINATION:
      "CROSS_TENANT_CONTAMINATION",

    RUNBOOK_INSTRUCTION_INJECTION:
      "RUNBOOK_INSTRUCTION_INJECTION",
  });


const TRUST_LEVEL =
  Object.freeze({
    UNTRUSTED:
      "UNTRUSTED",

    LOW:
      "LOW",

    MEDIUM:
      "MEDIUM",

    HIGH:
      "HIGH",

    VERIFIED:
      "VERIFIED",
  });


function assertPoisoningCannotAuthorize(
  input = {}
) {
  if (
    input.executionAuthorized === true ||
    input.execution_authorized === true ||
    input.productionAuthorized === true ||
    input.production_authorized === true
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_POISONING_AUTHORITY_FORBIDDEN",

      "Poisoning evaluation cannot grant execution authority",

      403
    );
  }


  return true;
}


module.exports = {
  HUMAN_LEARNING_POISONING_VERSION,

  CONTENT_CHANNEL,

  POISONING_CLASS,

  TRUST_LEVEL,

  assertPoisoningCannotAuthorize,
};