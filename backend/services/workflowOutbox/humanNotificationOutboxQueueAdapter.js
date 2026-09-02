"use strict";


const {
  assertNoExecutionAuthority,
} =
  require(
    "./workflowOutboxContracts"
  );


function createError(
  message,
  code,
  retryable = false
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
    }
  );
}


function requireValue(
  value,
  field
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    String(
      value
    ).trim() ===
      ""
  ) {
    throw createError(
      `Human notification outbox route requires ${field}`,
      "HUMAN_NOTIFICATION_OUTBOX_IDENTITY_REQUIRED",
      false
    );
  }


  return value;
}


function buildHumanNotificationJob(
  message
) {
  if (
    !message ||
    typeof message !==
      "object"
  ) {
    throw createError(
      "Human notification outbox message is required",
      "HUMAN_NOTIFICATION_OUTBOX_MESSAGE_REQUIRED"
    );
  }


  const payload =
    message.payload;


  if (
    !payload ||
    typeof payload !==
      "object" ||
    Array.isArray(
      payload
    )
  ) {
    throw createError(
      "Human notification outbox payload is required",
      "HUMAN_NOTIFICATION_OUTBOX_PAYLOAD_REQUIRED"
    );
  }


  assertNoExecutionAuthority(
    payload
  );


  if (
    payload.humanControlGranted ===
      true ||
    payload.acknowledgementGranted ===
      true
  ) {
    throw createError(
      "Notification transport cannot grant acknowledgement or human control",
      "HUMAN_NOTIFICATION_AUTHORITY_VIOLATION"
    );
  }


  const organizationId =
    requireValue(
      payload.organizationId,
      "organizationId"
    );


  const environmentId =
    requireValue(
      payload.environmentId,
      "environmentId"
    );


  const incidentId =
    requireValue(
      payload.incidentId,
      "incidentId"
    );


  const notificationRequestId =
    requireValue(
      payload.notificationRequestId,
      "notificationRequestId"
    );


  const escalationId =
    requireValue(
      payload.escalationId,
      "escalationId"
    );


  return {
    ...payload,

    organizationId,

    environmentId,

    incidentId,

    escalationId,

    notificationRequestId,

    outboxEventId:
      message.outboxEventId ||
      null,

    outboxEventKey:
      message.outboxEventKey ||
      null,

    correlationId:
      payload.correlationId ||
      message.correlationId ||
      escalationId,

    humanControlGranted:
      false,

    acknowledgementGranted:
      false,

    executionAuthorized:
      false,
  };
}


function createHumanNotificationRoute({
  publisher,
} = {}) {
  if (
    typeof publisher !==
    "function"
  ) {
    throw createError(
      "Human notification queue publisher is required",
      "HUMAN_NOTIFICATION_QUEUE_PUBLISHER_REQUIRED"
    );
  }


  return {
    name:
      "human-notification-requested",

    queue:
      "human-notification",

    routingKey:
      "human.notification.requested",

    publish:
      async (
        message
      ) => {
        const job =
          buildHumanNotificationJob(
            message
          );


        const result =
          await publisher(
            job
          );


        return {
          messageId:
            result?.eventId ||
            result?.messageId ||
            null,

          correlationId:
            result?.correlationId ||
            job.correlationId ||
            null,

          queue:
            "human-notification",

          routingKey:
            "human.notification.requested",

          executionAuthorized:
            false,
        };
      },
  };
}


module.exports = {
  buildHumanNotificationJob,

  createHumanNotificationRoute,
};