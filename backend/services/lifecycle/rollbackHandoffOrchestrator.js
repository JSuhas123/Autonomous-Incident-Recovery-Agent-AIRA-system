"use strict";

/**
 * AIRA Rollback Handoff Orchestrator
 *
 * Phase 10.6
 *
 * Converts a verified rollback route into a fresh rollback request.
 *
 * SAFETY:
 *
 * - never executes rollback directly
 * - never reuses old execution authorization
 * - binds rollback to original execution / plan identity
 * - requires predefined rollback availability
 * - requires critic-safe verification outcome
 * - hands request back to Phase 8 authorization boundary
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

const ROLLBACK_HANDOFF_STATUS =
  Object.freeze({
    READY:
      "READY",

    BLOCKED:
      "BLOCKED",

    UNAVAILABLE:
      "UNAVAILABLE",
  });

class RollbackHandoffOrchestrator {
  constructor(
    options = {}
  ) {
    this.stateMachine =
      options.stateMachine ||
      incidentLifecycleStateMachine;
  }

  async prepareRollback(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    // ========================================================================
    // 1. ROUTE MUST REQUEST ROLLBACK
    // ========================================================================

    if (
      input.routingResult
        ?.route !==
      "REQUEST_ROLLBACK"
    ) {
      return this.blocked(
        "Verification outcome did not request rollback."
      );
    }

    // ========================================================================
    // 2. ROLLBACK MUST EXIST
    // ========================================================================

    if (
      input.rollbackAvailable !==
      true
    ) {
      return {
        status:
          ROLLBACK_HANDOFF_STATUS
            .UNAVAILABLE,

        ready:
          false,

        rollbackAvailable:
          false,

        reason:
          "No predefined rollback path is available.",

        rollbackQueued:
          false,

        rollbackStarted:
          false,

        executionAuthorized:
          false,
      };
    }

    // ========================================================================
    // 3. CRITIC SAFETY
    // ========================================================================

    if (
      input.criticResult
        ?.rejected ===
        true
    ) {
      return this.blocked(
        "Verification critic rejected the outcome."
      );
    }

    if (
      input.criticResult
        ?.requiresManualReview ===
        true
    ) {
      return this.blocked(
        "Verification critic requires manual review before rollback."
      );
    }

    // ========================================================================
    // 4. ORIGINAL EXECUTION IDENTITY REQUIRED
    // ========================================================================

    if (
      !input.executionRequestId ||
      !input.executionPlanId ||
      !input.executionPlanHash
    ) {
      return this.blocked(
        "Rollback handoff requires immutable original execution identity."
      );
    }

    // ========================================================================
    // 5. INCIDENT STATE
    // ========================================================================

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
              .ROLLBACK_PENDING,

          reason:
            input.reason ||
            "Post-execution verification requested rollback.",

          actor:
            input.actor,

          source: {
            phase:
              10,

            component:
              "rollbackHandoffOrchestrator",

            referenceId:
              input.verificationId ||
              null,
          },

          metadata: {
            executionRequestId:
              input.executionRequestId,

            executionPlanId:
              input.executionPlanId,

            executionPlanHash:
              input.executionPlanHash,

            recoveryDecisionId:
              input.recoveryDecisionId ||
              null,
          },

          executionAuthorized:
            false,
        });

    // ========================================================================
    // 6. CREATE FRESH ROLLBACK REQUEST
    // ========================================================================

    const rollbackRequest = {
      rollbackRequestId:
        this.generateRollbackRequestId(
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

      recoveryDecisionId:
        input.recoveryDecisionId ||
        null,

      originalExecutionRequestId:
        input.executionRequestId,

      originalExecutionPlanId:
        input.executionPlanId,

      originalExecutionPlanHash:
        input.executionPlanHash,

      authorizationId:
        input.authorizationId ||
        null,

      rollbackPlanId:
        input.rollbackPlanId ||
        null,

      reason:
        input.reason ||
        "Post-execution recovery verification requested rollback.",

      /*
       * Important:
       *
       * The old authorization cannot authorize rollback.
       * Phase 8 must issue a fresh authorization for this rollback request.
       */
      requiresFreshAuthorization:
        true,

      previousAuthorizationReusable:
        false,

      executionAuthorized:
        false,

      requestedAt:
        new Date(),
    };

    // ========================================================================
    // 7. HANDOFF ONLY
    // ========================================================================

    if (
      typeof dependencies
        .enqueueRollbackRequest ===
      "function"
    ) {
      await dependencies
        .enqueueRollbackRequest(
          rollbackRequest
        );
    }

    return {
      status:
        ROLLBACK_HANDOFF_STATUS
          .READY,

      ready:
        true,

      rollbackAvailable:
        true,

      transition,

      rollbackRequest,

      rollbackQueued:
        typeof dependencies
          .enqueueRollbackRequest ===
        "function",

      rollbackStarted:
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
        ROLLBACK_HANDOFF_STATUS
          .BLOCKED,

      ready:
        false,

      rollbackAvailable:
        null,

      reason,

      rollbackQueued:
        false,

      rollbackStarted:
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
              "ROLLBACK_HANDOFF_INCIDENT_NOT_FOUND",
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
        "Rollback handoff requires incident provider"
      ),
      {
        code:
          "ROLLBACK_HANDOFF_INCIDENT_PROVIDER_REQUIRED",
      }
    );
  }

  generateRollbackRequestId(
    input
  ) {
    return (
      "rollback_" +
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
            input.executionPlanHash ||
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
          "Rollback handoff input is required"
        ),
        {
          code:
            "ROLLBACK_HANDOFF_INPUT_REQUIRED",
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
          "Rollback handoff requires organization, environment and incident scope"
        ),
        {
          code:
            "ROLLBACK_HANDOFF_SCOPE_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Rollback handoff orchestrator cannot authorize execution"
        ),
        {
          code:
            "ROLLBACK_HANDOFF_UNSAFE_INPUT",
        }
      );
    }
  }
}

module.exports =
  new RollbackHandoffOrchestrator();

module.exports
  .RollbackHandoffOrchestrator =
  RollbackHandoffOrchestrator;

module.exports
  .ROLLBACK_HANDOFF_STATUS =
  ROLLBACK_HANDOFF_STATUS;