"use strict";

/**
 * AIRA Lifecycle Queue Service
 *
 * Phase 10.13
 *
 * Publishes lifecycle-control jobs and lifecycle outcome events.
 *
 * SAFETY:
 * - does not mutate incidents
 * - does not execute recovery
 * - does not execute rollback
 * - does not authorize execution
 */

const queueService =
  require(
    "../infrastructure/queueService"
  );

const LIFECYCLE_QUEUE_EVENT =
  Object.freeze({
    REQUESTED:
      "lifecycle.requested",

    STARTED:
      "lifecycle.started",

    COMPLETED:
      "lifecycle.completed",

    FAILED:
      "lifecycle.failed",

    BLOCKED:
      "lifecycle.blocked",
  });

class LifecycleQueueService {
  constructor(
    options = {}
  ) {
    this.queueService =
      options.queueService ||
      queueService;
  }

  async enqueue(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const payload = {
      eventType:
        LIFECYCLE_QUEUE_EVENT
          .REQUESTED,

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

      verificationId:
        input.verificationId ||
        null,

      lifecycleIntent:
        input.lifecycleIntent ||
        null,

      requestedAt:
        new Date()
          .toISOString(),

      executionAuthorized:
        false,
    };

    await this.queueService
      .publishEvent(
        LIFECYCLE_QUEUE_EVENT
          .REQUESTED,

        payload,

        {
          organizationId:
            payload.organizationId,

          environmentId:
            payload.environmentId,

          correlationId:
            payload.incidentId,

          schemaVersion:
            1,
        }
      );

    return {
      queued:
        true,

      eventType:
        LIFECYCLE_QUEUE_EVENT
          .REQUESTED,

      incidentId:
        payload.incidentId,

      lifecycleStarted:
        false,

      executionAuthorized:
        false,
    };
  }

  async publishStarted(
    input
  ) {
    return this.publishLifecycleEvent(
      LIFECYCLE_QUEUE_EVENT
        .STARTED,
      input
    );
  }

  async publishCompleted(
    input
  ) {
    return this.publishLifecycleEvent(
      LIFECYCLE_QUEUE_EVENT
        .COMPLETED,
      input
    );
  }

  async publishFailed(
    input
  ) {
    return this.publishLifecycleEvent(
      LIFECYCLE_QUEUE_EVENT
        .FAILED,
      input
    );
  }

  async publishBlocked(
    input
  ) {
    return this.publishLifecycleEvent(
      LIFECYCLE_QUEUE_EVENT
        .BLOCKED,
      input
    );
  }

  async publishLifecycleEvent(
    eventType,
    input = {}
  ) {
    this.assertInput(
      input
    );

    const payload = {
      eventType,

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

      verificationId:
        input.verificationId ||
        null,

      result:
        input.result ||
        null,

      error:
        input.error
          ? {
              code:
                input.error.code ||
                "LIFECYCLE_WORKER_ERROR",

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

      executionAuthorized:
        false,
    };

    return this.queueService
      .publishEvent(
        eventType,

        payload,

        {
          organizationId:
            payload.organizationId,

          environmentId:
            payload.environmentId,

          correlationId:
            payload.incidentId,

          schemaVersion:
            1,
        }
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
          "Lifecycle queue input is required"
        ),
        {
          code:
            "LIFECYCLE_QUEUE_INPUT_REQUIRED",
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
          "Lifecycle queue requires organization, environment and incident scope"
        ),
        {
          code:
            "LIFECYCLE_QUEUE_SCOPE_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle queue cannot authorize execution"
        ),
        {
          code:
            "LIFECYCLE_QUEUE_UNSAFE_INPUT",
        }
      );
    }
  }
}

module.exports =
  new LifecycleQueueService();

module.exports
  .LifecycleQueueService =
  LifecycleQueueService;

module.exports
  .LIFECYCLE_QUEUE_EVENT =
  LIFECYCLE_QUEUE_EVENT;