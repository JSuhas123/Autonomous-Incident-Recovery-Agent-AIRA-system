"use strict";

/**
 * ============================================================================
 * AIRA PHASE 23.2
 * HUMAN ESCALATION DOMAIN CONSTANTS
 * ============================================================================
 *
 * Safety law:
 *
 * ESCALATION != EXECUTION AUTHORIZATION
 * ROUTING != EXECUTION AUTHORIZATION
 * ON-CALL TARGET != EXECUTION AUTHORIZATION
 *
 * Escalation exists only to transfer attention/responsibility to a human
 * workflow when AIRA cannot safely continue autonomously.
 * ============================================================================
 */


const ESCALATION_DECISION =
  Object.freeze({
    ESCALATE:
      "ESCALATE",

    NO_ESCALATION:
      "NO_ESCALATION",
  });


const ESCALATION_REASON =
  Object.freeze({
    RECOVERY_UNSAFE:
      "RECOVERY_UNSAFE",

    INSUFFICIENT_EVIDENCE:
      "INSUFFICIENT_EVIDENCE",

    APPROVAL_REQUIRED:
      "APPROVAL_REQUIRED",

    AUTONOMY_NOT_ELIGIBLE:
      "AUTONOMY_NOT_ELIGIBLE",

    RECOVERY_FAILED:
      "RECOVERY_FAILED",

    VERIFICATION_FAILED:
      "VERIFICATION_FAILED",

    CONTROL_REQUIRED:
      "CONTROL_REQUIRED",

    POLICY_ESCALATION:
      "POLICY_ESCALATION",

    MANUAL_ESCALATION:
      "MANUAL_ESCALATION",
  });


const ESCALATION_STATUS =
  Object.freeze({
    DECIDED:
      "DECIDED",

    ROUTED:
      "ROUTED",

    WAITING_ACK:
      "WAITING_ACK",

    ACKNOWLEDGED:
      "ACKNOWLEDGED",

    RESOLVED:
      "RESOLVED",

    EXPIRED:
      "EXPIRED",

    FAILED:
      "FAILED",

    CANCELLED:
      "CANCELLED",
  });


const ON_CALL_TARGET_TYPE =
  Object.freeze({
    USER:
      "USER",

    TEAM:
      "TEAM",

    INTEGRATION:
      "INTEGRATION",
  });


const ESCALATION_TRIGGER_SOURCE =
  Object.freeze({
    RECOVERY_ENGINE:
      "RECOVERY_ENGINE",

    VERIFICATION_ENGINE:
      "VERIFICATION_ENGINE",

    APPROVAL_ENGINE:
      "APPROVAL_ENGINE",

    AUTONOMY_GATE:
      "AUTONOMY_GATE",

    HUMAN_OPERATOR:
      "HUMAN_OPERATOR",

    INCIDENT_COMMAND:
      "INCIDENT_COMMAND",

    SYSTEM_POLICY:
      "SYSTEM_POLICY",
  });


const ESCALATION_INVARIANTS =
  Object.freeze({
    NEVER_AUTHORIZES_EXECUTION:
      true,

    ROUTING_NEVER_GRANTS_CONTROL:
      true,

    ACKNOWLEDGEMENT_NEVER_GRANTS_CONTROL:
      true,

    POSTGRES_IS_ESCALATION_AUTHORITY:
      true,

    POLICY_SELECTION_IS_DETERMINISTIC:
      true,
  });


module.exports = {
  ESCALATION_DECISION,
  ESCALATION_REASON,
  ESCALATION_STATUS,
  ON_CALL_TARGET_TYPE,
  ESCALATION_TRIGGER_SOURCE,
  ESCALATION_INVARIANTS,
};