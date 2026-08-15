"use strict";

/**
 * AIRA Diagnosis Worker
 *
 * Phase 6.15
 *
 * Consumes diagnosis.requested jobs asynchronously.
 *
 * Worker responsibilities:
 *
 * - validate queued diagnosis job
 * - invoke DiagnosisLifecycleService
 * - persist diagnosis
 * - publish completion/failure event
 *
 * Safety:
 *
 * - never performs remediation
 * - never authorizes infrastructure execution
 */

const diagnosisLifecycleService =
  require(
    "../services/diagnosis/diagnosisLifecycleService"
  );

const diagnosisQueueService =
  require(
    "../services/diagnosis/diagnosisQueueService"
  );

const {
  DIAGNOSIS_EVENT,
} =
  require(
    "../services/diagnosis/diagnosisQueueService"
  );

class DiagnosisWorker {
  constructor(
    options = {}
  ) {
    this.lifecycleService =
      options.lifecycleService ||
      diagnosisLifecycleService;

    this.queueService =
      options.queueService ||
      diagnosisQueueService;

    this.maxAttempts =
      Number(
        options.maxAttempts ||
        process.env
          .DIAGNOSIS_MAX_ATTEMPTS
      ) ||
      3;
  }

  // ==========================================================================
  // PROCESS JOB
  // ==========================================================================

  async process(
    job,
    dependencies = {}
  ) {
    this.validateJob(
      job
    );

    const attempt =
      Number(
        job.attempt ||
        1
      );

    try {
      const lifecycleResult =
        await this.lifecycleService
          .runDiagnosis({
            organizationId:
              job.organizationId,

            environmentId:
              job.environmentId,

            incidentId:
              job.incidentId,

            reason:
              job.trigger ||
              "diagnosis_requested",

            dependencies,
          });

      try {
        await this.queueService
          .publishCompleted({
            job,

            result:
              lifecycleResult,
          });
      } catch (
        eventError
      ) {
        /*
         * Diagnosis has already succeeded and persisted.
         *
         * Failure to emit an informational completed event must not
         * convert a successful diagnosis into a failed diagnosis.
         */
        console.error(
          "[diagnosis-worker] Could not publish diagnosis.completed:",
          eventError.message
        );
      }

      return {
        processed:
          true,

        success:
          true,

        jobId:
          job.jobId,

        incidentId:
          job.incidentId,

        runId:
          lifecycleResult
            .runId,

        diagnosisId:
          lifecycleResult
            .diagnosisId,

        revision:
          lifecycleResult
            .revision,

        confidence:
          lifecycleResult
            .confidence,

        decision:
          lifecycleResult
            .decision,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      const retryable =
        this.isRetryable(
          error
        );

      const shouldRetry =
        retryable &&
        attempt <
        this.maxAttempts;

      if (
        !shouldRetry
      ) {
        try {
          await this.queueService
            .publishFailed({
              job,

              error,
            });
        } catch (
          eventError
        ) {
          console.error(
            "[diagnosis-worker] Could not publish diagnosis.failed:",
            eventError.message
          );
        }
      }

      throw Object.assign(
        error,
        {
          diagnosisJob: {
            jobId:
              job.jobId,

            attempt,

            maxAttempts:
              this.maxAttempts,

            retryable,

            shouldRetry,
          },
        }
      );
    }
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  validateJob(
    job
  ) {
    if (
      !job
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis job is required"
        ),
        {
          code:
            "DIAGNOSIS_JOB_REQUIRED",
        }
      );
    }

    if (
      job.eventType &&
      job.eventType !==
      DIAGNOSIS_EVENT
        .REQUESTED
    ) {
      throw Object.assign(
        new Error(
          `Unsupported diagnosis event: ${job.eventType}`
        ),
        {
          code:
            "DIAGNOSIS_JOB_EVENT_INVALID",
        }
      );
    }

    for (
      const field
      of [
        "organizationId",
        "environmentId",
        "incidentId",
      ]
    ) {
      if (
        !job[field]
      ) {
        throw Object.assign(
          new Error(
            `Diagnosis job requires ${field}`
          ),
          {
            code:
              "DIAGNOSIS_JOB_SCOPE_REQUIRED",

            field,
          }
        );
      }
    }
  }

  // ==========================================================================
  // RETRY CLASSIFICATION
  // ==========================================================================

  isRetryable(
    error
  ) {
    const nonRetryableCodes =
      new Set([
        "DIAGNOSIS_LIFECYCLE_ORGANIZATION_REQUIRED",
        "DIAGNOSIS_LIFECYCLE_ENVIRONMENT_REQUIRED",
        "DIAGNOSIS_LIFECYCLE_INCIDENT_REQUIRED",
        "DIAGNOSIS_JOB_SCOPE_REQUIRED",
        "DIAGNOSIS_JOB_EVENT_INVALID",
        "SIGNAL_NOT_FOUND",
        "INCIDENT_NOT_FOUND",
      ]);

    if (
      nonRetryableCodes.has(
        error?.code
      )
    ) {
      return false;
    }

    /*
     * Concurrent diagnosis conflicts are retryable because another
     * diagnosis revision may have committed at the same time.
     */
    if (
      error?.code ===
      "DIAGNOSIS_REVISION_CONFLICT"
    ) {
      return true;
    }

    /*
     * Mongo/Rabbit/network/transient reasoning-provider failures
     * are treated as retryable by default.
     */
    return true;
  }
}

module.exports =
  new DiagnosisWorker();

module.exports
  .DiagnosisWorker =
  DiagnosisWorker;