"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.2D
 * PHASE-14 HUMAN OPERATIONS COMPATIBILITY BRIDGE
 * ============================================================================
 *
 * Historical callers may still emit the older escalation-shaped payload.
 *
 * Phase 23 translates those requests into the canonical escalation engine.
 *
 * This module MUST NOT:
 *
 *   create HumanTasks directly
 *   publish notifications directly
 *   create ESCALATED task status
 *   grant human control
 *   authorize execution
 *
 * ============================================================================
 */


const humanEscalationReliabilityService =
  require(
    "./humanEscalationReliabilityService"
  );


const {
  ESCALATION_REASON,
  ESCALATION_TRIGGER_SOURCE,
} = require(
  "../../constants/humanEscalation"
);


function normalizeSeverity(
  value
) {
  const severity =
    String(
      value ||
      "MEDIUM"
    )
      .toUpperCase();


  if (
    [
      "CRITICAL",
      "HIGH",
      "MEDIUM",
      "LOW",
    ].includes(
      severity
    )
  ) {
    return severity;
  }


  return "MEDIUM";
}


async function handleEscalation(
  escalation = {}
) {
  const result =
    await humanEscalationReliabilityService
      .escalate({
        organizationId:
          escalation
            .organizationId,

        environmentId:
          escalation
            .environmentId,

        incidentId:
          escalation
            .incidentId,


        /*
         * Legacy escalation ID becomes the stable idempotency source.
         */
        idempotencyKey:
          escalation
            .idempotencyKey ||

          (
            "legacy:" +

            (
              escalation
                .escalationId ||

              escalation
                .incidentId ||

              "unknown"
            )
          ),


        reasonCode:
          escalation
            .reasonCode ||

          ESCALATION_REASON
            .MANUAL_ESCALATION,


        triggerSource:
          escalation
            .triggerSource ||

          ESCALATION_TRIGGER_SOURCE
            .SYSTEM_POLICY,


        severity:
          normalizeSeverity(
            escalation
              .priority ||

            escalation
              .severity
          ),


        createdByUserId:
          escalation
            .actorUserId ||

          escalation
            .createdByUserId ||

          null,


        taskTitle:
          escalation
            .title ||

          "AIRA operator intervention required",


        taskDescription:
          escalation
            .message ||

          "AIRA requires human operator intervention.",


        recommendedActions:
          escalation
            .recommendedActions ||
          [],


        evidence:
          escalation
            .evidence ||
          [],


        metadata: {
          compatibilitySource:
            "PHASE14_HUMAN_OPERATIONS_BRIDGE",

          legacyEscalationId:
            escalation
              .escalationId ||
            null,

          executionRequestId:
            escalation
              .executionRequestId ||
            null,

          recoveryDecisionId:
            escalation
              .recoveryDecisionId ||
            null,

          verificationId:
            escalation
              .verificationId ||
            null,

          executionAuthorized:
            false,
        },
      });


  return {
    escalation:
      result
        .escalation,

    humanTask:
      result
        .task,

    assignment:
      result
        .assignment ||
      null,

    notificationHandoff:
      result
        .notificationHandoff ||
      null,

    autonomousRecoveryBlocked:
      result
        .autonomousRecoveryBlocked ===
      true,

    idempotentReplay:
      result
        .idempotentReplay ===
      true,

    humanControlGranted:
      false,

    executionAuthorized:
      false,
  };
}


module.exports = {
  handleEscalation,
};