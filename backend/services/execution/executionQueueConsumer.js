"use strict";

const queueService =
  require(
    "../infrastructure/queueService"
  );

const executionWorker =
  require(
    "../../workers/executionWorker"
  );

const {
  EXECUTION_EVENT,
} =
  require(
    "./executionQueueService"
  );

const EXECUTION_QUEUE_NAME =
  process.env
    .EXECUTION_QUEUE_NAME ||
  "aira.execution.worker.v1";

class ExecutionQueueConsumer {
  constructor(
    options = {}
  ) {
    this.queueService =
      options.queueService ||
      queueService;

    this.worker =
      options.worker ||
      executionWorker;

    this.queueName =
      options.queueName ||
      EXECUTION_QUEUE_NAME;

    this.prefetch =
      Math.max(
        1,
        Number(
          options.prefetch ||
          process.env
            .EXECUTION_QUEUE_PREFETCH ||
          1
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
        EXECUTION_EVENT
          .REQUESTED,

        this.queueName,

        async (
          event
        ) => {
          const job =
            this.normalizeJob(
              event
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

      eventType:
        EXECUTION_EVENT
          .REQUESTED,
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
      executionRequestId:
        source
          ?.executionRequestId ||
        null,

      authorizationId:
        source
          ?.authorizationId ||
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

      incidentId:
        source
          ?.incidentId ||
        null,
    };
  }
}

module.exports =
  new ExecutionQueueConsumer();

module.exports
  .ExecutionQueueConsumer =
  ExecutionQueueConsumer;