"use strict";

/**
 * AIRA Diagnosis Queue Service
 *
 * Phase 6.15
 *
 * Thin queue boundary between incident ingestion and Phase 6 diagnosis.
 *
 * This service does NOT perform diagnosis itself.
 *
 * It only publishes canonical diagnosis jobs.
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  getQueueService,
} =
  require(
    "../infrastructure/queueService"
  );

const DIAGNOSIS_EVENT =
  Object.freeze({
    REQUESTED:
      "diagnosis.requested",

    COMPLETED:
      "diagnosis.completed",

    FAILED:
      "diagnosis.failed",
  });

class DiagnosisQueueService {
  // ==========================================================================
  // REQUEST DIAGNOSIS
  // ==========================================================================

  async requestDiagnosis({
    organizationId,
    environmentId,
    incidentId,
    trigger,
    correlationId = null,
    correlationGroupId = null,
    metadata = {},
  }) {
    if (
      !organizationId ||
      !environmentId ||
      !incidentId
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis queue request requires organizationId, environmentId and incidentId"
        ),
        {
          code:
            "DIAGNOSIS_QUEUE_SCOPE_REQUIRED",
        }
      );
    }

    const requestedAt =
      new Date();

    const jobId =
      this.createJobId({
        organizationId,
        environmentId,
        incidentId,
        trigger,
        requestedAt,
      });

    const payload = {
      jobId,

      eventType:
        DIAGNOSIS_EVENT
          .REQUESTED,

      organizationId:
        String(
          organizationId
        ),

      environmentId:
        String(
          environmentId
        ),

      incidentId:
        String(
          incidentId
        ),

      correlationId:
        correlationId
          ? String(
              correlationId
            )
          : null,

      correlationGroupId:
        correlationGroupId
          ? String(
              correlationGroupId
            )
          : null,

      trigger:
        trigger ||
        "incident_updated",

      requestedAt:
        requestedAt
          .toISOString(),

      metadata: {
        ...metadata,

        source:
          "incident_orchestration",

        diagnosisVersion:
          "phase6-v1",
      },

      executionAuthorized:
        false,
    };

    await this.publish(
      DIAGNOSIS_EVENT
        .REQUESTED,
      payload
    );

    return {
      queued:
        true,

      jobId,

      incidentId:
        payload.incidentId,

      eventType:
        DIAGNOSIS_EVENT
          .REQUESTED,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // COMPLETED
  // ==========================================================================

  async publishCompleted({
    job,
    result,
  }) {
    return this.publish(
      DIAGNOSIS_EVENT
        .COMPLETED,
      {
        eventType:
          DIAGNOSIS_EVENT
            .COMPLETED,

        jobId:
          job.jobId,

        incidentId:
          job.incidentId,

        organizationId:
          job.organizationId,

        environmentId:
          job.environmentId,

        runId:
          result
            ?.runId ||
          null,

        diagnosisId:
          result
            ?.diagnosisId
            ? String(
                result.diagnosisId
              )
            : null,

        revision:
          result
            ?.revision ||
          null,

        confidence:
          result
            ?.confidence ??
          null,

        decision:
          result
            ?.decision ||
          null,

        completedAt:
          new Date()
            .toISOString(),

        executionAuthorized:
          false,
      }
    );
  }

  // ==========================================================================
  // FAILED
  // ==========================================================================

  async publishFailed({
    job,
    error,
  }) {
    return this.publish(
      DIAGNOSIS_EVENT
        .FAILED,
      {
        eventType:
          DIAGNOSIS_EVENT
            .FAILED,

        jobId:
          job.jobId,

        incidentId:
          job.incidentId,

        organizationId:
          job.organizationId,

        environmentId:
          job.environmentId,

        error: {
          code:
            error
              ?.code ||
            "DIAGNOSIS_FAILED",

          message:
            String(
              error
                ?.message ||
              "Diagnosis failed"
            )
              .slice(
                0,
                2048
              ),
        },

        failedAt:
          new Date()
            .toISOString(),

        executionAuthorized:
          false,
      }
    );
  }

  // ==========================================================================
  // QUEUE ADAPTER
  // ==========================================================================

   async publish(
    eventType,
    payload
  ) {
    const queue =
      await getQueueService();


    if (
      !queue ||
      typeof queue
        .publishEvent !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis queue publisher is unavailable"
        ),
        {
          code:
            "DIAGNOSIS_QUEUE_PUBLISHER_UNAVAILABLE",

          executionAuthorized:
            false,
        }
      );
    }


    /*
     * QueueService owns the canonical topic names.
     *
     * Prefer a registered topic when present. The explicit event type remains
     * the fallback for compatibility with queue implementations/tests that
     * intentionally do not expose a topics map.
     */
    const topicName =
      eventType ===
        DIAGNOSIS_EVENT
          .REQUESTED
        ? "DIAGNOSIS_REQUESTED"
        : eventType ===
            DIAGNOSIS_EVENT
              .COMPLETED
          ? "DIAGNOSIS_COMPLETED"
          : eventType ===
              DIAGNOSIS_EVENT
                .FAILED
            ? "DIAGNOSIS_FAILED"
            : null;


    const topic =
      (
        topicName &&
        queue.topics
          ?.[topicName]
      ) ||
      eventType;


    return queue
      .publishEvent(
        topic,

        payload,

        {
          organizationId:
            payload.organizationId ||
            null,

          environmentId:
            payload.environmentId ||
            null,

          correlationId:
            payload.correlationId ||
            payload.jobId ||
            null,

          tenantId:
            payload.tenantId ||
            null,

          schemaVersion:
            1,

          executionAuthorized:
            false,
        }
      );
  }
  // ==========================================================================
  // JOB ID
  // ==========================================================================

  createJobId({
    organizationId,
    environmentId,
    incidentId,
    trigger,
    requestedAt,
  }) {
    return (
      "diagjob_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            organizationId,
            environmentId,
            incidentId,
            trigger ||
              "unknown",
            requestedAt
              .toISOString(),
            crypto.randomUUID(),
          ]
            .map(
              String
            )
            .join(
              "::"
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
}

module.exports =
  new DiagnosisQueueService();

module.exports
  .DiagnosisQueueService =
  DiagnosisQueueService;

module.exports
  .DIAGNOSIS_EVENT =
  DIAGNOSIS_EVENT;