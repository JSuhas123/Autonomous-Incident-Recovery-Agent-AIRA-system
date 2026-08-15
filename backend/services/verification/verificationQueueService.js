"use strict";

/**
 * AIRA Verification Queue Service
 *
 * Phase 9.12
 *
 * Publishes durable post-execution verification jobs.
 *
 * Safety:
 *
 * - only references persisted executionRequestId
 * - does not execute recovery
 * - does not close incidents
 * - does not grant execution authorization
 */

const queueService =
  require(
    "../infrastructure/queueService"
  );

const VERIFICATION_EVENT =
  Object.freeze({
    REQUESTED:
      "verification.requested",

    STARTED:
      "verification.started",

    COMPLETED:
      "verification.completed",

    FAILED:
      "verification.failed",

    BLOCKED:
      "verification.blocked",
  });

class VerificationQueueService {
  async enqueue(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const payload = {
      eventType:
        VERIFICATION_EVENT
          .REQUESTED,

      executionRequestId:
        String(
          input.executionRequestId
        ),

      organizationId:
        String(
          input.organizationId
        ),

      environmentId:
        String(
          input.environmentId
        ),

      incidentId:
        String(
          input.incidentId
        ),

      authorizationId:
        input.authorizationId
          ? String(
              input.authorizationId
            )
          : null,

      recoveryDecisionId:
        input.recoveryDecisionId
          ? String(
              input.recoveryDecisionId
            )
          : null,

      requestedAt:
        new Date()
          .toISOString(),
    };

    await queueService
      .publishEvent(
        VERIFICATION_EVENT
          .REQUESTED,

        payload,

        {
          organizationId:
            payload.organizationId,

          environmentId:
            payload.environmentId,

          correlationId:
            payload.executionRequestId,

          schemaVersion:
            1,
        }
      );

    return {
      queued:
        true,

      eventType:
        VERIFICATION_EVENT
          .REQUESTED,

      executionRequestId:
        payload.executionRequestId,

      verificationStarted:
        false,

      executionAuthorized:
        false,
    };
  }

  async publishStarted(
    input = {}
  ) {
    return this.publishLifecycleEvent(
      VERIFICATION_EVENT
        .STARTED,
      input
    );
  }

  async publishCompleted(
    input = {}
  ) {
    return this.publishLifecycleEvent(
      VERIFICATION_EVENT
        .COMPLETED,
      input
    );
  }

  async publishFailed(
    input = {}
  ) {
    return this.publishLifecycleEvent(
      VERIFICATION_EVENT
        .FAILED,
      input
    );
  }

  async publishBlocked(
    input = {}
  ) {
    return this.publishLifecycleEvent(
      VERIFICATION_EVENT
        .BLOCKED,
      input
    );
  }

  async publishLifecycleEvent(
    eventType,
    input
  ) {
    this.assertLifecycleInput(
      input
    );

    const payload = {
      eventType,

      executionRequestId:
        String(
          input.executionRequestId
        ),

      verificationId:
        input.verificationId ||
        null,

      organizationId:
        String(
          input.organizationId
        ),

      environmentId:
        String(
          input.environmentId
        ),

      incidentId:
        String(
          input.incidentId
        ),

      result:
        input.result ||
        null,

      error:
        input.error
          ? {
              code:
                input.error.code ||
                "VERIFICATION_WORKER_ERROR",

              message:
                String(
                  input.error.message ||
                  input.error
                )
                  .slice(
                    0,
                    2048
                  ),
            }
          : null,

      timestamp:
        new Date()
          .toISOString(),
    };

    return queueService
      .publishEvent(
        eventType,

        payload,

        {
          organizationId:
            payload.organizationId,

          environmentId:
            payload.environmentId,

          correlationId:
            payload.executionRequestId,

          schemaVersion:
            1,
        }
      );
  }

  assertInput(
    input
  ) {
    this.assertLifecycleInput(
      input
    );
  }

  assertLifecycleInput(
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
          "Verification queue input is required"
        ),
        {
          code:
            "VERIFICATION_QUEUE_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.executionRequestId
    ) {
      throw Object.assign(
        new Error(
          "Verification queue requires executionRequestId"
        ),
        {
          code:
            "VERIFICATION_QUEUE_EXECUTION_REQUEST_REQUIRED",
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
          "Verification queue requires organization, environment and incident scope"
        ),
        {
          code:
            "VERIFICATION_QUEUE_SCOPE_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Verification queue cannot authorize execution"
        ),
        {
          code:
            "VERIFICATION_QUEUE_UNSAFE_INPUT",
        }
      );
    }
  }
}

module.exports =
  new VerificationQueueService();

module.exports
  .VerificationQueueService =
  VerificationQueueService;

module.exports
  .VERIFICATION_EVENT =
  VERIFICATION_EVENT;