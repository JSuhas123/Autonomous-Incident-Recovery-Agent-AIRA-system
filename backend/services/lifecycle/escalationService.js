"use strict";

/**
 * AIRA Lifecycle Escalation Service
 *
 * Phase 10.7
 *
 * Converts unrecoverable / unsafe autonomous outcomes into
 * structured operator escalation requests.
 *
 * SAFETY:
 * - does not execute infrastructure actions
 * - does not approve execution
 * - does not retry or rollback directly
 */

const crypto =
  require("node:crypto");

const incidentLifecycleStateMachine =
  require("./incidentLifecycleStateMachine");

const {
  INCIDENT_LIFECYCLE_STATE,
  ESCALATION_REASON,
} =
  require("./incidentLifecycleContracts");

const ESCALATION_STATUS =
  Object.freeze({
    CREATED:
      "CREATED",

    QUEUED:
      "QUEUED",

    BLOCKED:
      "BLOCKED",
  });

const ESCALATION_PRIORITY =
  Object.freeze({
    CRITICAL:
      "CRITICAL",

    HIGH:
      "HIGH",

    MEDIUM:
      "MEDIUM",

    LOW:
      "LOW",
  });

class EscalationService {
  constructor(
    options = {}
  ) {
    this.stateMachine =
      options.stateMachine ||
      incidentLifecycleStateMachine;
  }

  async escalate(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const incident =
      await this.loadIncident(
        input,
        dependencies
      );

    const currentState =
      incident.lifecycleState ||
      incident.status ||
      INCIDENT_LIFECYCLE_STATE
        .OPEN;

    /*
     * Idempotency:
     * an already escalated incident should not require
     * another lifecycle transition.
     */
    let transition =
      null;

    if (
      currentState !==
      INCIDENT_LIFECYCLE_STATE
        .ESCALATED
    ) {
      transition =
        this.stateMachine
          .transition({
            fromState:
              currentState,

            toState:
              INCIDENT_LIFECYCLE_STATE
                .ESCALATED,

            reason:
              input.message ||
              this.defaultMessage(
                input.reason
              ),

            actor:
              input.actor,

            source: {
              phase:
                10,

              component:
                "escalationService",

              referenceId:
                input.referenceId ||
                input.verificationId ||
                null,
            },

            metadata: {
              escalationReason:
                input.reason,

              recoveryAttempt:
                input.recoveryAttempt ??
                null,

              maxRecoveryAttempts:
                input.maxRecoveryAttempts ??
                null,
            },

            executionAuthorized:
              false,
          });
    }

    const escalation = {
      escalationId:
        this.generateId(
          input
        ),

      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      reason:
        input.reason,

      priority:
        input.priority ||
        this.resolvePriority(
          input
        ),

      message:
        input.message ||
        this.defaultMessage(
          input.reason
        ),

      verificationId:
        input.verificationId ||
        null,

      recoveryDecisionId:
        input.recoveryDecisionId ||
        null,

      executionRequestId:
        input.executionRequestId ||
        null,

      recoveryAttempt:
        input.recoveryAttempt ??
        null,

      maxRecoveryAttempts:
        input.maxRecoveryAttempts ??
        null,

      evidence:
        Array.isArray(
          input.evidence
        )
          ? input.evidence
          : [],

      recommendedActions:
        this.recommendedActions(
          input.reason
        ),

      requiresOperator:
        true,

      requiresAcknowledgement:
        true,

      autonomousRecoveryBlocked:
        true,

      executionAuthorized:
        false,

      createdAt:
        new Date(),
    };

    let queued =
      false;

    if (
      typeof dependencies
        .enqueueEscalation ===
      "function"
    ) {
      await dependencies
        .enqueueEscalation(
          escalation
        );

      queued =
        true;
    }

    return {
      status:
        queued
          ? ESCALATION_STATUS
              .QUEUED
          : ESCALATION_STATUS
              .CREATED,

      escalated:
        true,

      queued,

      transition,

      escalation,

      requiresOperator:
        true,

      recoveryStarted:
        false,

      rollbackStarted:
        false,

      executionStarted:
        false,

      executionAuthorized:
        false,
    };
  }

  resolvePriority(
    input
  ) {
    switch (
      input.reason
    ) {
      case ESCALATION_REASON
        .ROLLBACK_FAILED:

      case ESCALATION_REASON
        .STABILITY_REGRESSION:
        return ESCALATION_PRIORITY
          .CRITICAL;

      case ESCALATION_REASON
        .RETRIES_EXHAUSTED:

      case ESCALATION_REASON
        .ROLLBACK_UNAVAILABLE:

      case ESCALATION_REASON
        .POLICY_BLOCKED:
        return ESCALATION_PRIORITY
          .HIGH;

      case ESCALATION_REASON
        .VERIFICATION_INCONCLUSIVE:

      case ESCALATION_REASON
        .MANUAL_APPROVAL_REQUIRED:
        return ESCALATION_PRIORITY
          .MEDIUM;

      default:
        return ESCALATION_PRIORITY
          .HIGH;
    }
  }

  defaultMessage(
    reason
  ) {
    const messages = {
      [ESCALATION_REASON
        .RETRIES_EXHAUSTED]:
        "Automated recovery attempts have been exhausted.",

      [ESCALATION_REASON
        .ROLLBACK_UNAVAILABLE]:
        "Recovery failed and no approved rollback path is available.",

      [ESCALATION_REASON
        .ROLLBACK_FAILED]:
        "Rollback did not restore the system safely.",

      [ESCALATION_REASON
        .VERIFICATION_INCONCLUSIVE]:
        "Recovery outcome could not be verified conclusively.",

      [ESCALATION_REASON
        .STABILITY_REGRESSION]:
        "The service regressed after initially verified recovery.",

      [ESCALATION_REASON
        .POLICY_BLOCKED]:
        "Further autonomous recovery is blocked by policy.",

      [ESCALATION_REASON
        .MANUAL_APPROVAL_REQUIRED]:
        "Further recovery requires explicit operator approval.",

      [ESCALATION_REASON
        .UNKNOWN_FAILURE]:
        "AIRA encountered an unresolved recovery failure.",
    };

    return (
      messages[
        reason
      ] ||
      "AIRA requires operator intervention."
    );
  }

  recommendedActions(
    reason
  ) {
    switch (
      reason
    ) {
      case ESCALATION_REASON
        .RETRIES_EXHAUSTED:
        return [
          "Review previous recovery attempts.",
          "Inspect latest diagnosis and verification evidence.",
          "Select an alternative approved recovery strategy.",
        ];

      case ESCALATION_REASON
        .ROLLBACK_UNAVAILABLE:
        return [
          "Inspect the affected service manually.",
          "Review the original execution changes.",
          "Create or approve a safe rollback procedure.",
        ];

      case ESCALATION_REASON
        .ROLLBACK_FAILED:
        return [
          "Stop further autonomous mutation.",
          "Inspect rollback execution evidence.",
          "Assess service and infrastructure state manually.",
        ];

      case ESCALATION_REASON
        .VERIFICATION_INCONCLUSIVE:
        return [
          "Inspect missing verification telemetry.",
          "Restore observability if required.",
          "Repeat verification after evidence becomes available.",
        ];

      case ESCALATION_REASON
        .STABILITY_REGRESSION:
        return [
          "Review regression evidence.",
          "Compare pre-recovery and post-recovery state.",
          "Determine whether retry or rollback is appropriate.",
        ];

      case ESCALATION_REASON
        .POLICY_BLOCKED:
        return [
          "Review the policy decision.",
          "Request authorized policy or operator approval if appropriate.",
        ];

      default:
        return [
          "Review incident evidence.",
          "Determine the safest operator action.",
        ];
    }
  }

  async loadIncident(
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getIncident ===
      "function"
    ) {
      const incident =
        await dependencies
          .getIncident({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,
          });

      if (
        !incident
      ) {
        throw Object.assign(
          new Error(
            "Incident not found"
          ),
          {
            code:
              "ESCALATION_INCIDENT_NOT_FOUND",
          }
        );
      }

      return incident;
    }

    if (
      input.incident
    ) {
      return input.incident;
    }

    throw Object.assign(
      new Error(
        "Escalation requires incident provider"
      ),
      {
        code:
          "ESCALATION_INCIDENT_PROVIDER_REQUIRED",
      }
    );
  }

  generateId(
    input
  ) {
    return (
      "escalation_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            input.organizationId,
            input.environmentId,
            input.incidentId,
            input.reason,
            Date.now(),
            crypto.randomUUID(),
          ].join(":")
        )
        .digest("hex")
        .slice(
          0,
          24
        )
    );
  }

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object" ||
      Object.keys(
        input
      ).length ===
        0
    ) {
      throw Object.assign(
        new Error(
          "Escalation input is required"
        ),
        {
          code:
            "ESCALATION_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId ||
      !input.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Escalation requires organization, environment and incident scope"
        ),
        {
          code:
            "ESCALATION_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !Object.values(
        ESCALATION_REASON
      ).includes(
        input.reason
      )
    ) {
      throw Object.assign(
        new Error(
          "Valid escalation reason is required"
        ),
        {
          code:
            "ESCALATION_REASON_INVALID",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Escalation service cannot authorize execution"
        ),
        {
          code:
            "ESCALATION_UNSAFE_INPUT",
        }
      );
    }
  }
}

module.exports =
  new EscalationService();

module.exports
  .EscalationService =
  EscalationService;

module.exports
  .ESCALATION_STATUS =
  ESCALATION_STATUS;

module.exports
  .ESCALATION_PRIORITY =
  ESCALATION_PRIORITY;