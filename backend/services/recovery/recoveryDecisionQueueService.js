"use strict";

const crypto =
  require(
    "node:crypto"
  );

const queueService =
  require(
    "../infrastructure/queueService"
  );

const RECOVERY_EVENT =
  Object.freeze({
    REQUESTED:
      "recovery.decision.requested",

    COMPLETED:
      "recovery.decision.completed",

    FAILED:
      "recovery.decision.failed",
    
    RECOVERY_DECISION_REQUESTED:
  "recovery.decision.requested",

RECOVERY_DECISION_COMPLETED:
  "recovery.decision.completed",

RECOVERY_DECISION_FAILED:
  "recovery.decision.failed",
  });

class RecoveryDecisionQueueService {
  async requestDecision({
    organizationId,
    environmentId,
    incidentId,
    diagnosisId = null,
    diagnosisRevision = null,
    diagnosis,
    safetyGate,
    context,
    trigger = "diagnosis_completed",
    metadata = {},
  }) {
    if (
      !organizationId ||
      !environmentId ||
      !incidentId
    ) {
      throw Object.assign(
        new Error(
          "Recovery decision queue request requires organization, environment and incident scope"
        ),
        {
          code:
            "RECOVERY_QUEUE_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !diagnosis
    ) {
      throw Object.assign(
        new Error(
          "Recovery decision queue request requires diagnosis"
        ),
        {
          code:
            "RECOVERY_QUEUE_DIAGNOSIS_REQUIRED",
        }
      );
    }

    const requestedAt =
      new Date();

    const jobId =
      "recoveryjob_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          `${organizationId}:${environmentId}:${incidentId}:${requestedAt.toISOString()}:${crypto.randomUUID()}`
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          24
        );

    const payload = {
      jobId,

      eventType:
        RECOVERY_EVENT
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

      diagnosisId:
        diagnosisId
          ? String(
              diagnosisId
            )
          : null,

      diagnosisRevision:
        diagnosisRevision ??
        null,

      diagnosis,

      safetyGate:
        safetyGate ||
        null,

      context:
        context ||
        {},

      trigger,

      requestedAt:
        requestedAt
          .toISOString(),

      metadata,

      executionAuthorized:
        false,
    };

    await queueService
      .publishEvent(
        RECOVERY_EVENT
          .REQUESTED,

        payload,

        {
          organizationId:
            payload.organizationId,

          environmentId:
            payload.environmentId,

          correlationId:
            payload.jobId,

          schemaVersion:
            1,
        }
      );

    return {
      queued:
        true,

      jobId,

      incidentId:
        payload.incidentId,

      eventType:
        RECOVERY_EVENT
          .REQUESTED,

      executionAuthorized:
        false,
    };
  }

  async publishCompleted({
    job,
    result,
  }) {
    return queueService
      .publishEvent(
        RECOVERY_EVENT
          .COMPLETED,

        {
          eventType:
            RECOVERY_EVENT
              .COMPLETED,

          jobId:
            job.jobId,

          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,

          decisionId:
            result
              ?.decision
              ?.decisionId ||
            result
              ?.persisted
              ?.decision
              ?.decisionId ||
            null,

          completedAt:
            new Date()
              .toISOString(),

          executionAuthorized:
            false,
        },

        {
          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          correlationId:
            job.jobId,

          schemaVersion:
            1,
        }
      );
  }

  async publishFailed({
    job,
    error,
  }) {
    return queueService
      .publishEvent(
        RECOVERY_EVENT
          .FAILED,

        {
          eventType:
            RECOVERY_EVENT
              .FAILED,

          jobId:
            job.jobId,

          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,

          error: {
            code:
              error
                ?.code ||
              "RECOVERY_DECISION_FAILED",

            message:
              String(
                error
                  ?.message ||
                "Recovery decision failed"
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
        },

        {
          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          correlationId:
            job.jobId,

          schemaVersion:
            1,
        }
      );
  }
}

module.exports =
  new RecoveryDecisionQueueService();

module.exports
  .RecoveryDecisionQueueService =
  RecoveryDecisionQueueService;

module.exports
  .RECOVERY_EVENT =
  RECOVERY_EVENT;