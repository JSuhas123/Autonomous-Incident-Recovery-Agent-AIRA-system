"use strict";


const PostgresHumanNotificationDeliveryRepository =
  require(
    "../persistence/postgres/PostgresHumanNotificationDeliveryRepository"
  );


const humanNotificationDeliveryService =
  require(
    "../services/humanOperations/humanNotificationDeliveryService"
  );


function createError(
  message,
  code,
  retryable =
    false,
  details =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      retryable,

      executionAuthorized:
        false,

      ...details,
    }
  );
}


class HumanNotificationWorker {
  constructor(
    options =
      {}
  ) {
    this.repository =
      options.repository ||

      new PostgresHumanNotificationDeliveryRepository(
        options.postgres ||
        {}
      );


    this.deliveryService =
      options.deliveryService ||
      humanNotificationDeliveryService;
  }


  async process(
    job =
      {}
  ) {
    this.assertSafeJob(
      job
    );


    const scope = {
      organizationId:
        job.organizationId,

      environmentId:
        job.environmentId,
    };


    /*
     * ========================================================================
     * CANONICAL RELOAD
     * ========================================================================
     *
     * RabbitMQ payload is not authoritative.
     */


    const request =
      await this
        .repository
        .getRequest({
          ...scope,

          notificationRequestId:
            job.notificationRequestId,
        });


    if (
      !request
    ) {
      throw createError(
        `Notification request not found: ${job.notificationRequestId}`,
        "HUMAN_NOTIFICATION_REQUEST_NOT_FOUND",
        false
      );
    }


    if (
      request.executionAuthorized ===
      true
    ) {
      throw createError(
        "Persisted notification request contains forbidden execution authority",
        "HUMAN_NOTIFICATION_AUTHORITY_VIOLATION",
        false
      );
    }


    /*
     * ========================================================================
     * DEDUPE + ATTEMPT CLAIM
     * ========================================================================
     */


    const attempt =
      await this
        .repository
        .beginAttempt({
          ...scope,

          notificationRequestId:
            request.publicId,

          brokerMessageId:
            job.outboxEventId ||
            job.eventId ||
            null,
        });


    if (
      attempt.terminal ===
      true
    ) {
      return {
        processed:
          true,

        delivered:
          attempt
            .request
            .status ===
          "DELIVERED",

        duplicate:
          attempt.duplicate ===
          true,

        deadLettered:
          attempt.deadLettered ===
          true,

        request:
          attempt.request,

        humanControlGranted:
          false,

        acknowledgementGranted:
          false,

        executionAuthorized:
          false,
      };
    }


    let delivery;


    try {
      delivery =
        await this
          .deliveryService
          .deliver(
            attempt.request
          );
    } catch (
      error
    ) {
      const failed =
        await this
          .repository
          .markFailed({
            ...scope,

            notificationRequestId:
              request.publicId,

            attemptId:
              attempt
                .attempt
                .publicId,

            provider:
              error.provider ||
              null,

            integrationId:
              error.integrationId ||
              null,

            providerResult:
              error.providerResult ||
              null,

            error,

            retryable:
              error.retryable !==
              false,
          });


      /*
       * Request-level retry budget exhausted.
       *
       * QueueService.consumeEvents() sees retryable=false and routes the
       * RabbitMQ message to the existing DLX instead of requeueing forever.
       */


      if (
        failed.deadLettered ===
        true ||
        error.retryable ===
        false
      ) {
        throw createError(
          error.message ||
          "Notification delivery permanently failed",

          failed.deadLettered ===
            true
            ? "HUMAN_NOTIFICATION_RETRY_EXHAUSTED"
            : error.code ||
              "HUMAN_NOTIFICATION_DELIVERY_NON_RETRYABLE",

          false,

          {
            cause:
              error,

            notificationRequestId:
              request.publicId,

            deadLettered:
              failed.deadLettered,
          }
        );
      }


      throw createError(
        error.message ||
        "Notification delivery failed",

        error.code ||
        "HUMAN_NOTIFICATION_DELIVERY_FAILED",

        true,

        {
          cause:
            error,

          notificationRequestId:
            request.publicId,
        }
      );
    }


    if (
      !delivery ||
      delivery.delivered !==
        true
    ) {
      throw createError(
        "Notification delivery service returned without delivery confirmation",
        "HUMAN_NOTIFICATION_DELIVERY_UNCONFIRMED",
        true
      );
    }


    const delivered =
      await this
        .repository
        .markDelivered({
          ...scope,

          notificationRequestId:
            request.publicId,

          attemptId:
            attempt
              .attempt
              .publicId,

          provider:
            delivery.provider ||
            null,

          integrationId:
            delivery.integrationId ||
            null,

          channelType:
            delivery.channelType ||
            null,

          destinationRef:
            delivery.destinationRef ||
            null,

          providerResult:
            delivery.providerResult ||
            {},
        });


    return {
      processed:
        true,

      delivered:
        true,

      duplicate:
        false,

      deadLettered:
        false,

      request:
        delivered,

      provider:
        delivery.provider ||
        null,

      mode:
        delivery.mode ||
        null,

      partial:
        delivery.partial ===
        true,

      humanControlGranted:
        false,

      acknowledgementGranted:
        false,

      executionAuthorized:
        false,
    };
  }


  assertSafeJob(
    job
  ) {
    if (
      !job ||
      typeof job !==
        "object"
    ) {
      throw createError(
        "Human notification worker requires job",
        "HUMAN_NOTIFICATION_JOB_REQUIRED",
        false
      );
    }


    if (
      job.executionAuthorized ===
        true ||
      job.authorizationGranted ===
        true ||
      job.humanControlGranted ===
        true ||
      job.acknowledgementGranted ===
        true
    ) {
      throw createError(
        "Human notification transport attempted to grant authority",
        "HUMAN_NOTIFICATION_AUTHORITY_VIOLATION",
        false
      );
    }


    for (
      const [
        field,
        value,
      ]
      of Object.entries({
        organizationId:
          job.organizationId,

        environmentId:
          job.environmentId,

        incidentId:
          job.incidentId,

        escalationId:
          job.escalationId,

        notificationRequestId:
          job.notificationRequestId,
      })
    ) {
      if (
        !value
      ) {
        throw createError(
          `Human notification worker requires ${field}`,
          "HUMAN_NOTIFICATION_JOB_IDENTITY_REQUIRED",
          false,
          {
            field,
          }
        );
      }
    }


    return true;
  }
}


const defaultWorker =
  new HumanNotificationWorker();


module.exports =
  defaultWorker;


module.exports
  .HumanNotificationWorker =
  HumanNotificationWorker;