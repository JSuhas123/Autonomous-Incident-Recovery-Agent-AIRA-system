"use strict";

/**
 * AIRA Diagnosis Queue Consumer
 *
 * Phase 6.15C
 *
 * Binds the Phase 6 DiagnosisWorker to the existing queueService.
 *
 * Flow:
 *
 * diagnosis.requested
 *        ↓
 * durable RabbitMQ queue
 *        ↓
 * DiagnosisWorker.process()
 *        ↓
 * DiagnosisLifecycleService
 *        ↓
 * DiagnosisCoordinator
 *        ↓
 * Persistence
 *
 * Safety:
 *
 * - no remediation execution
 * - no playbook execution
 * - no execution authorization
 */

const queueService =
  require(
    "../infrastructure/queueService"
  );

const diagnosisWorker =
  require(
    "../../workers/diagnosisWorker"
  );

const {
  DIAGNOSIS_EVENT,
} =
  require(
    "./diagnosisQueueService"
  );

const DIAGNOSIS_QUEUE_NAME =
  process.env
    .DIAGNOSIS_QUEUE_NAME ||
  "aira.diagnosis.worker.v1";

const DIAGNOSIS_PREFETCH =
  Math.max(
    1,
    Number(
      process.env
        .DIAGNOSIS_WORKER_PREFETCH
    ) ||
    2
  );

class DiagnosisQueueConsumer {
  constructor(
    options = {}
  ) {
    this.queueService =
      options.queueService ||
      queueService;

    this.worker =
      options.worker ||
      diagnosisWorker;

    this.queueName =
      options.queueName ||
      DIAGNOSIS_QUEUE_NAME;

    this.prefetch =
      Math.max(
        1,
        Number(
          options.prefetch ||
          DIAGNOSIS_PREFETCH
        )
      );

    this.started =
      false;
  }

  // ==========================================================================
  // START
  // ==========================================================================

  async start(
    dependencies = {}
  ) {
    if (
      this.started
    ) {
      return {
        started:
          true,

        alreadyStarted:
          true,

        queueName:
          this.queueName,

        topic:
          DIAGNOSIS_EVENT
            .REQUESTED,
      };
    }

    /*
     * queueService normally connects during application startup.
     *
     * But keeping this defensive check means the consumer can also
     * operate from a dedicated worker process later.
     */
    if (
      !this.queueService
        .connected
    ) {
      await this.queueService
        .connect();
    }

    if (
      !this.queueService
        .connected
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis queue consumer cannot start because RabbitMQ is unavailable"
        ),
        {
          code:
            "DIAGNOSIS_QUEUE_NOT_CONNECTED",
        }
      );
    }

    await this.queueService
      .consumeEvents(
        DIAGNOSIS_EVENT
          .REQUESTED,

        this.queueName,

        async (
          event
        ) => {
          const job =
            this.normalizeJob(
              event
            );

          console.log(
            `[diagnosis-consumer] Processing ${job.jobId || "unknown-job"} for incident ${job.incidentId}`
          );

          try {
            const result =
              await this.worker
                .process(
                  job,
                  dependencies
                );

            console.log(
              `[diagnosis-consumer] Diagnosis completed | jobId=${job.jobId || "unknown"} | incidentId=${job.incidentId} | runId=${result.runId || "unknown"}`
            );

            return result;
          } catch (
            error
          ) {
            console.error(
              `[diagnosis-consumer] Diagnosis failed | jobId=${job.jobId || "unknown"} | incidentId=${job.incidentId} | code=${error.code || "UNKNOWN"} | ${error.message}`
            );

            /*
             * IMPORTANT:
             *
             * Re-throw.
             *
             * queueService owns ack/nack/dead-letter behavior.
             * Swallowing this error would make RabbitMQ think the
             * diagnosis succeeded.
             */
            throw error;
          }
        },

        {
          prefetch:
            this.prefetch,
        }
      );

    this.started =
      true;

    console.log(
      `[diagnosis-consumer] ✓ Started | topic=${DIAGNOSIS_EVENT.REQUESTED} | queue=${this.queueName} | prefetch=${this.prefetch}`
    );

    return {
      started:
        true,

      alreadyStarted:
        false,

      queueName:
        this.queueName,

      topic:
        DIAGNOSIS_EVENT
          .REQUESTED,

      prefetch:
        this.prefetch,
    };
  }

  // ==========================================================================
  // NORMALIZE QUEUE ENVELOPE
  // ==========================================================================

  normalizeJob(
    event
  ) {
    if (
      !event
    ) {
      throw Object.assign(
        new Error(
          "Diagnosis queue event is empty"
        ),
        {
          code:
            "DIAGNOSIS_QUEUE_EVENT_EMPTY",
        }
      );
    }

    /*
     * queueService.publishEvent() wraps our actual payload:
     *
     * {
     *   eventId,
     *   topic,
     *   payload,
     *   organizationId,
     *   environmentId,
     *   ...
     * }
     *
     * Keep this tolerant so tests/direct invocations may also pass the
     * diagnosis job itself.
     */
    const source =
      (
        event.payload &&
        typeof event.payload ===
          "object"
      )
        ? event.payload
        : event;

    return {
      ...source,

      eventType:
        source.eventType ||
        event.topic ||
        DIAGNOSIS_EVENT
          .REQUESTED,

      jobId:
        source.jobId ||
        event.eventId ||
        null,

      organizationId:
        source.organizationId ||
        event.organizationId ||
        null,

      environmentId:
        source.environmentId ||
        event.environmentId ||
        null,

      correlationId:
        source.correlationId ||
        event.correlationId ||
        null,

      /*
       * First delivery is attempt 1.
       *
       * If we later add delayed retry queues, they can increment this
       * explicitly.
       */
      attempt:
        Math.max(
          1,
          Number(
            source.attempt ||
            1
          )
        ),

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  getStatus() {
    return {
      started:
        this.started,

      connected:
        Boolean(
          this.queueService
            .connected
        ),

      topic:
        DIAGNOSIS_EVENT
          .REQUESTED,

      queueName:
        this.queueName,

      prefetch:
        this.prefetch,

      executionAuthorized:
        false,
    };
  }
}

module.exports =
  new DiagnosisQueueConsumer();

module.exports
  .DiagnosisQueueConsumer =
  DiagnosisQueueConsumer;

module.exports
  .DIAGNOSIS_QUEUE_NAME =
  DIAGNOSIS_QUEUE_NAME;