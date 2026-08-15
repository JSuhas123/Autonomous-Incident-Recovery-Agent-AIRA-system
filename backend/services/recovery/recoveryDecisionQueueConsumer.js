"use strict";

const queueService =
  require(
    "../infrastructure/queueService"
  );

const recoveryDecisionWorker =
  require(
    "../../workers/recoveryDecisionWorker"
  );

const {
  RECOVERY_EVENT,
} =
  require(
    "./recoveryDecisionQueueService"
  );

const RECOVERY_QUEUE_NAME =
  process.env
    .RECOVERY_DECISION_QUEUE_NAME ||
  "aira.recovery.decision.worker.v1";

class RecoveryDecisionQueueConsumer {
  constructor(
    options = {}
  ) {
    this.queueService =
      options.queueService ||
      queueService;

    this.worker =
      options.worker ||
      recoveryDecisionWorker;

    this.queueName =
      options.queueName ||
      RECOVERY_QUEUE_NAME;

    this.prefetch =
      Math.max(
        1,
        Number(
          options.prefetch ||
          process.env
            .RECOVERY_DECISION_PREFETCH ||
          2
        )
      );

    this.started =
      false;
  }

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
      };
    }

    if (
      !this.queueService
        .connected
    ) {
      await this.queueService
        .connect();
    }

    await this.queueService
      .consumeEvents(
        RECOVERY_EVENT
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
            `[recovery-consumer] Processing ${job.jobId || "unknown-job"}`
          );

          return this.worker
            .process(
              job,
              dependencies
            );
        },

        {
          prefetch:
            this.prefetch,
        }
      );

    this.started =
      true;

    return {
      started:
        true,

      queueName:
        this.queueName,

      topic:
        RECOVERY_EVENT
          .REQUESTED,

      executionAuthorized:
        false,
    };
  }

  normalizeJob(
    event
  ) {
    const source =
      event
        ?.payload &&
      typeof event.payload ===
        "object"
        ? event.payload
        : event;

    return {
      ...source,

      eventType:
        source
          ?.eventType ||
        event
          ?.topic ||
        RECOVERY_EVENT
          .REQUESTED,

      jobId:
        source
          ?.jobId ||
        event
          ?.eventId ||
        null,

      organizationId:
        source
          ?.organizationId ||
        event
          ?.organizationId ||
        null,

      environmentId:
        source
          ?.environmentId ||
        event
          ?.environmentId ||
        null,

      executionAuthorized:
        false,
    };
  }
}

module.exports =
  new RecoveryDecisionQueueConsumer();

module.exports
  .RecoveryDecisionQueueConsumer =
  RecoveryDecisionQueueConsumer;