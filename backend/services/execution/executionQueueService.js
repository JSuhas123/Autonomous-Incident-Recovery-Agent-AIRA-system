"use strict";

/**
 * AIRA Execution Queue Service
 *
 * Phase 8.12
 *
 * Publishes persisted execution requests to the execution worker.
 *
 * Safety:
 *
 * - accepts only persisted request IDs
 * - never embeds fresh authorization authority in queue payload
 * - never executes infrastructure
 */

const queueService =
  require(
    "../infrastructure/queueService"
  );

const EXECUTION_EVENT =
  Object.freeze({
    REQUESTED:
      "execution.requested",

    STARTED:
      "execution.started",

    COMPLETED:
      "execution.completed",

    FAILED:
      "execution.failed",

    BLOCKED:
      "execution.blocked",
  });

class ExecutionQueueService {
  async enqueue(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const payload = {
      eventType:
        EXECUTION_EVENT
          .REQUESTED,

      executionRequestId:
        String(
          input.executionRequestId
        ),

      authorizationId:
        String(
          input.authorizationId
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

      queuedAt:
        new Date()
          .toISOString(),
    };

    await queueService
      .publishEvent(
        EXECUTION_EVENT
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
        EXECUTION_EVENT
          .REQUESTED,

      executionRequestId:
        payload
          .executionRequestId,

      authorizationId:
        payload
          .authorizationId,

      executionStarted:
        false,
    };
  }

  async publishStarted(
    input = {}
  ) {
    return this.publishLifecycleEvent(
      EXECUTION_EVENT
        .STARTED,
      input
    );
  }

  async publishCompleted(
    input = {}
  ) {
    return this.publishLifecycleEvent(
      EXECUTION_EVENT
        .COMPLETED,
      input
    );
  }

  async publishFailed(
    input = {}
  ) {
    return this.publishLifecycleEvent(
      EXECUTION_EVENT
        .FAILED,
      input
    );
  }

  async publishBlocked(
    input = {}
  ) {
    return this.publishLifecycleEvent(
      EXECUTION_EVENT
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

      authorizationId:
        input.authorizationId
          ? String(
              input.authorizationId
            )
          : null,

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

      timestamp:
        new Date()
          .toISOString(),

      result:
        input.result ||
        null,

      error:
        input.error
          ? {
              code:
                input.error.code ||
                "EXECUTION_WORKER_ERROR",

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

    if (
      !input.authorizationId
    ) {
      throw Object.assign(
        new Error(
          "Execution queue requires authorizationId"
        ),
        {
          code:
            "EXECUTION_QUEUE_AUTHORIZATION_REQUIRED",
        }
      );
    }
  }

  assertLifecycleInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Execution queue input is required"
        ),
        {
          code:
            "EXECUTION_QUEUE_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.executionRequestId
    ) {
      throw Object.assign(
        new Error(
          "Execution queue requires executionRequestId"
        ),
        {
          code:
            "EXECUTION_QUEUE_REQUEST_REQUIRED",
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
          "Execution queue requires organization, environment and incident scope"
        ),
        {
          code:
            "EXECUTION_QUEUE_SCOPE_REQUIRED",
        }
      );
    }
  }
}

module.exports =
  new ExecutionQueueService();

module.exports
  .ExecutionQueueService =
  ExecutionQueueService;

module.exports
  .EXECUTION_EVENT =
  EXECUTION_EVENT;