"use strict";

/**
 * AIRA Recovery Retry Orchestrator
 *
 * Phase 10.5
 *
 * Converts a verified retry route into a fresh recovery-cycle request.
 *
 * SAFETY:
 *
 * - never reuses old execution authorization
 * - never executes infrastructure directly
 * - enforces attempt limits
 * - requires critic-accepted verification outcome
 * - hands control back to Phase 7 recovery decision flow
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
} =
  require(
    "./incidentLifecycleContracts"
  );

const incidentLifecycleStateMachine =
  require(
    "./incidentLifecycleStateMachine"
  );

const RETRY_ORCHESTRATION_STATUS =
  Object.freeze({
    READY:
      "READY",

    BLOCKED:
      "BLOCKED",

    EXHAUSTED:
      "EXHAUSTED",
  });

class RecoveryRetryOrchestrator {
  constructor(
    options = {}
  ) {
    this.stateMachine =
      options.stateMachine ||
      incidentLifecycleStateMachine;
  }

  async prepareRetry(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const currentAttempt =
      normalizeAttempt(
        input.currentAttempt,
        0
      );

    const maxAttempts =
      Math.max(
        1,
        normalizeAttempt(
          input.maxAttempts,
          1
        )
      );

    if (
      input.retryAllowed !==
      true
    ) {
      return this.blocked(
        "Retry is not allowed for this recovery flow."
      );
    }

    if (
      currentAttempt >=
      maxAttempts
    ) {
      return {
        status:
          RETRY_ORCHESTRATION_STATUS
            .EXHAUSTED,

        ready:
          false,

        exhausted:
          true,

        reason:
          "Maximum recovery retry attempts have been reached.",

        currentAttempt,

        maxAttempts,

        executionAuthorized:
          false,
      };
    }

    if (
      input.routingResult
        ?.route !==
      "REQUEST_RETRY"
    ) {
      return this.blocked(
        "Verification outcome did not request retry."
      );
    }

    if (
      input.criticResult
        ?.rejected ===
        true ||
      input.criticResult
        ?.requiresManualReview ===
        true
    ) {
      return this.blocked(
        "Verification critic does not permit automated retry."
      );
    }

    const incident =
      await this.loadIncident(
        input,
        dependencies
      );

    const currentState =
      incident.lifecycleState ||
      incident.status;

    const transition =
      this.stateMachine
        .transition({
          fromState:
            currentState,

          toState:
            INCIDENT_LIFECYCLE_STATE
              .RETRY_PENDING,

          reason:
            input.reason ||
            "Post-execution verification requested another recovery cycle.",

          actor:
            input.actor,

          source: {
            phase:
              10,

            component:
              "recoveryRetryOrchestrator",

            referenceId:
              input.verificationId ||
              null,
          },

          metadata: {
            previousRecoveryDecisionId:
              input.recoveryDecisionId ||
              null,

            previousExecutionRequestId:
              input.executionRequestId ||
              null,

            currentAttempt,

            nextAttempt:
              currentAttempt +
              1,

            maxAttempts,
          },

          executionAuthorized:
            false,
        });

    const retryRequest = {
      retryRequestId:
        this.generateRetryRequestId(
          input
        ),

      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      verificationId:
        input.verificationId ||
        null,

      previousRecoveryDecisionId:
        input.recoveryDecisionId ||
        null,

      previousExecutionRequestId:
        input.executionRequestId ||
        null,

      diagnosisId:
        input.diagnosisId ||
        null,

      diagnosisRevision:
        input.diagnosisRevision ??
        null,

      attempt:
        currentAttempt +
        1,

      maxAttempts,

      requestedReason:
        input.reason ||
        "Post-execution recovery verification failed.",

      /*
       * Phase 7 must re-evaluate the recovery decision.
       * Phase 8 must later issue a completely fresh authorization.
       */
      requiresFreshRecoveryDecision:
        true,

      requiresFreshAuthorization:
        true,

      previousAuthorizationReusable:
        false,

      executionAuthorized:
        false,

      requestedAt:
        new Date(),
    };

    if (
      typeof dependencies
        .enqueueRecoveryRetry ===
      "function"
    ) {
      await dependencies
        .enqueueRecoveryRetry(
          retryRequest
        );
    }

    return {
      status:
        RETRY_ORCHESTRATION_STATUS
          .READY,

      ready:
        true,

      exhausted:
        false,

      transition,

      retryRequest,

      retryQueued:
        typeof dependencies
          .enqueueRecoveryRetry ===
        "function",

      recoveryStarted:
        false,

      executionStarted:
        false,

      executionAuthorized:
        false,
    };
  }

  blocked(
    reason
  ) {
    return {
      status:
        RETRY_ORCHESTRATION_STATUS
          .BLOCKED,

      ready:
        false,

      exhausted:
        false,

      reason,

      retryQueued:
        false,

      recoveryStarted:
        false,

      executionStarted:
        false,

      executionAuthorized:
        false,
    };
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
              "RETRY_INCIDENT_NOT_FOUND",
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
        "Retry orchestration requires incident provider"
      ),
      {
        code:
          "RETRY_INCIDENT_PROVIDER_REQUIRED",
      }
    );
  }

  generateRetryRequestId(
    input
  ) {
    return (
      "retry_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            input.organizationId,
            input.environmentId,
            input.incidentId,
            input.executionRequestId ||
              "",
            Date.now(),
            crypto.randomUUID(),
          ]
            .join(
              ":"
            )
        )
        .digest(
          "hex"
        )
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
          "Recovery retry orchestration input is required"
        ),
        {
          code:
            "RECOVERY_RETRY_INPUT_REQUIRED",
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
          "Recovery retry orchestration requires organization, environment and incident scope"
        ),
        {
          code:
            "RECOVERY_RETRY_SCOPE_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Recovery retry orchestrator cannot authorize execution"
        ),
        {
          code:
            "RECOVERY_RETRY_UNSAFE_INPUT",
        }
      );
    }
  }
}

function normalizeAttempt(
  value,
  fallback
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return fallback;
  }

  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return fallback;
  }

  return Math.max(
    0,
    Math.floor(
      numeric
    )
  );
}

module.exports =
  new RecoveryRetryOrchestrator();

module.exports
  .RecoveryRetryOrchestrator =
  RecoveryRetryOrchestrator;

module.exports
  .RETRY_ORCHESTRATION_STATUS =
  RETRY_ORCHESTRATION_STATUS;