"use strict";

const queueService =
  require(
    "../infrastructure/queueService"
  );

const verificationWorker =
  require(
    "../../workers/verificationWorker"
  );

const {
  VERIFICATION_EVENT,
} =
  require(
    "./verificationQueueService"
  );

const VERIFICATION_QUEUE_NAME =
  process.env
    .VERIFICATION_QUEUE_NAME ||
  "aira.verification.worker.v1";

class VerificationQueueConsumer {
  constructor(
    options = {}
  ) {
    this.queueService =
      options.queueService ||
      queueService;

    this.worker =
      options.worker ||
      verificationWorker;

    this.queueName =
      options.queueName ||
      VERIFICATION_QUEUE_NAME;

    this.prefetch =
      Math.max(
        1,
        Number(
          options.prefetch ||
          process.env
            .VERIFICATION_QUEUE_PREFETCH ||
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
        VERIFICATION_EVENT
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
        VERIFICATION_EVENT
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

      recoveryDecisionId:
        source
          ?.recoveryDecisionId ||
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

      executionAuthorized:
        false,
    };
  }
}


module.exports =
  new VerificationQueueConsumer();

module.exports
  .VerificationQueueConsumer =
  VerificationQueueConsumer;