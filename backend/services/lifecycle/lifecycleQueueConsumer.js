"use strict";

const queueService =
  require(
    "../infrastructure/queueService"
  );

const lifecycleWorker =
  require(
    "../../workers/lifecycleWorker"
  );

const {
  LIFECYCLE_QUEUE_EVENT,
} =
  require(
    "./lifecycleQueueService"
  );

const LIFECYCLE_QUEUE_NAME =
  process.env
    .LIFECYCLE_QUEUE_NAME ||
  "aira.lifecycle.worker.v1";

class LifecycleQueueConsumer {
  constructor(
    options = {}
  ) {
    this.queueService =
      options.queueService ||
      queueService;

    this.worker =
      options.worker ||
      lifecycleWorker;

    this.queueName =
      options.queueName ||
      LIFECYCLE_QUEUE_NAME;

    this.prefetch =
      Math.max(
        1,
        Number(
          options.prefetch ||
          process.env
            .LIFECYCLE_QUEUE_PREFETCH ||
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
        LIFECYCLE_QUEUE_EVENT
          .REQUESTED,

        this.queueName,

        async (
          event
        ) => {
          return this.worker
            .process(
              this.normalizeJob(
                event
              ),
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

      verificationId:
        source
          ?.verificationId ||
        null,

      lifecycleIntent:
        source
          ?.lifecycleIntent ||
        null,

      executionAuthorized:
        false,
    };
  }
}

module.exports =
  new LifecycleQueueConsumer();

module.exports
  .LifecycleQueueConsumer =
  LifecycleQueueConsumer;