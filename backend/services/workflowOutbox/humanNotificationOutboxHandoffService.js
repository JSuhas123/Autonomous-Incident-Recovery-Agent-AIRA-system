"use strict";


const workflowOutboxPersistenceService =
  require(
    "./workflowOutboxPersistenceService"
  );


const PostgresHumanNotificationRepository =
  require(
    "../../persistence/postgres/PostgresHumanNotificationRepository"
  );


const {
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
  assertNoExecutionAuthority,
} =
  require(
    "./workflowOutboxContracts"
  );


const {
  HUMAN_NOTIFICATION_EVENT_TYPE,
} =
  require(
    "../../constants/humanNotification"
  );


function createError(
  message,
  code,
  status = 422
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,
      status,

      executionAuthorized:
        false,
    }
  );
}


function requireValue(
  value,
  field,
  code
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
      `${field} is required`,
      code
    );
  }


  return value;
}


function targetReference(
  target
) {
  if (
    !target
  ) {
    return null;
  }


  return (
    target.publicId ||
    target.targetKey ||
    target.integrationRef ||
    target.targetUserId ||
    target.targetTeamId ||
    target.id ||
    null
  );
}


function normalizeSeverity(
  value
) {
  const normalized =
    String(
      value ||
      "HIGH"
    )
      .trim()
      .toUpperCase();


  if (
    [
      "CRITICAL",
      "HIGH",
      "MEDIUM",
      "LOW",
      "INFO",
    ].includes(
      normalized
    )
  ) {
    return normalized;
  }


  return "HIGH";
}


class HumanNotificationOutboxHandoffService {
  constructor(
    options = {}
  ) {
    this.outbox =
      options.outbox ||
      workflowOutboxPersistenceService;


    this.notificationRepository =
      options.notificationRepository ||

      new PostgresHumanNotificationRepository(
        options.postgres ||
        {}
      );
  }


  /*
   * ==========================================================================
   * CREATE DURABLE ESCALATION NOTIFICATION HANDOFF
   * ==========================================================================
   */


  async createFromEscalationHandoff(
    input = {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,
        "organizationId",
        "HUMAN_NOTIFICATION_ORGANIZATION_REQUIRED"
      );


    const environmentId =
      requireValue(
        input.environmentId,
        "environmentId",
        "HUMAN_NOTIFICATION_ENVIRONMENT_REQUIRED"
      );


    const handoff =
      input.notificationHandoff;


    if (
      !handoff ||
      handoff.ready !==
      true
    ) {
      throw createError(
        "Notification handoff must be ready",
        "HUMAN_NOTIFICATION_HANDOFF_NOT_READY"
      );
    }


    if (
      handoff.deliveryStarted ===
      true
    ) {
      throw createError(
        "Phase 23.2 handoff must not already have started notification delivery",
        "HUMAN_NOTIFICATION_DELIVERY_ALREADY_STARTED"
      );
    }


    const incidentId =
      requireValue(
        handoff.incidentId ||
        input.incidentId,
        "incidentId",
        "HUMAN_NOTIFICATION_INCIDENT_REQUIRED"
      );


    const escalationId =
      requireValue(
        handoff.escalationId ||
        input.escalationId,
        "escalationId",
        "HUMAN_NOTIFICATION_ESCALATION_REQUIRED"
      );


    const target =
      handoff.target ||
      input.target ||
      null;


    const targetRef =
      targetReference(
        target
      );


    if (
      !targetRef
    ) {
      throw createError(
        "Notification handoff requires a resolved target",
        "HUMAN_NOTIFICATION_TARGET_REQUIRED"
      );
    }


    const notificationEventType =
      input.notificationEventType ||

      (
        Number(
          handoff.attemptNumber ||
          1
        ) >
        1
          ? HUMAN_NOTIFICATION_EVENT_TYPE
              .HUMAN_ESCALATION_RETRY

          : HUMAN_NOTIFICATION_EVENT_TYPE
              .HUMAN_ESCALATION_REQUIRED
      );


    const severity =
      normalizeSeverity(
        input.severity
      );


    const title =
      input.title ||

      `AIRA escalation requires human attention — ${incidentId}`;


    const message =
      input.message ||

      [
        `Incident ${incidentId} requires human intervention.`,

        `Escalation ${escalationId} is waiting for acknowledgement.`,

        "This notification does not grant human control or execution authorization.",
      ].join(
        " "
      );


    /*
     * ------------------------------------------------------------------------
     * DURABLE POSTGRESQL REQUEST
     * ------------------------------------------------------------------------
     */


    const requestResult =
      await this
        .notificationRepository
        .createOrGetRequest({
          organizationId,

          environmentId,

          incidentId,

          escalationId,

          humanTaskId:
            handoff.taskId ||
            null,

          assignmentId:
            handoff.assignmentId ||
            null,

          notificationEventType,

          severity,

          maxAttempts:
            input.maxAttempts ||
            3,

          targetType:
            target.targetType ||
            null,

          targetRef,

          targetSnapshot: {
            ...target,

            executionAuthorized:
              false,
          },

          title,

          message,

          payload: {
            acknowledgementDeadline:
              handoff.acknowledgementDeadline ||
              null,

            attemptNumber:
              Number(
                handoff.attemptNumber ||
                1
              ),

            executionAuthorized:
              false,
          },

          metadata: {
            source:
              "PHASE_23_3_NOTIFICATION_OUTBOX",

            handoffOwner:
              handoff.owner ||
              null,

            executionAuthorized:
              false,
          },

          correlationId:
            input.correlationId ||
            escalationId,

          acknowledgementDeadline:
            handoff.acknowledgementDeadline ||
            null,
        });


    const request =
      requestResult.request;


    /*
     * ------------------------------------------------------------------------
     * OUTBOX PAYLOAD
     * ------------------------------------------------------------------------
     *
     * Keep the payload self-sufficient for the queue consumer.
     *
     * The consumer can still reload canonical PostgreSQL state.
     */


    const payload = {
      organizationId,

      environmentId,

      incidentId,

      escalationId,

      notificationRequestId:
        request.publicId,

      humanTaskId:
        request.humanTaskId,

      assignmentId:
        request.assignmentId,

      notificationEventType:
        request.notificationEventType,

      severity:
        request.severity,

      title:
        request.title,

      message:
        request.message,

      target: {
        ...request.targetSnapshot,

        executionAuthorized:
          false,
      },

      attemptNumber:
        Number(
          handoff.attemptNumber ||
          1
        ),

      acknowledgementDeadline:
        request.acknowledgementDeadline,

      correlationId:
        request.correlationId ||
        request.publicId,

      humanControlGranted:
        false,

      acknowledgementGranted:
        false,

      executionAuthorized:
        false,
    };


    assertNoExecutionAuthority(
      payload
    );


    /*
     * ------------------------------------------------------------------------
     * DURABLE WORKFLOW OUTBOX
     * ------------------------------------------------------------------------
     *
     * createOrGet already has deterministic identity + duplicate race
     * protection.
     */


    const outboxResult =
      await this
        .outbox
        .createOrGet({
          organizationId,

          environmentId,

          incidentId,

          aggregateType:
            OUTBOX_AGGREGATE_TYPE
              .HUMAN_NOTIFICATION,

          aggregateId:
            request.publicId,

          eventType:
            OUTBOX_EVENT_TYPE
              .HUMAN_NOTIFICATION_REQUESTED,

          transitionId:
            [
              "human-notification",

              request.notificationEventType,

              Number(
                handoff.attemptNumber ||
                1
              ),
            ].join(
              ":"
            ),

          payload,

          metadata: {
            phase:
              "23.3B",

            notificationRequestId:
              request.publicId,

            escalationId,

            targetRef,

            executionAuthorized:
              false,
          },

          maxAttempts:
            Math.max(
              1,

              Number.parseInt(
                input.outboxMaxAttempts,
                10
              ) ||
              10
            ),
        });


    /*
     * Only after the durable outbox event exists do we mark the request
     * QUEUED.
     *
     * If createOrGet throws, request stays PENDING_OUTBOX and can be retried.
     */


    const queued =
      await this
        .notificationRepository
        .markQueued({
          organizationId,

          environmentId,

          notificationRequestId:
            request.publicId,

          outboxEventId:
            outboxResult
              .event
              .eventId,

          outboxEventKey:
            outboxResult
              .event
              .eventKey,
        });


    return {
      created:
        requestResult.created ===
        true,

      duplicateRequest:
        requestResult.duplicate ===
        true,

      duplicateOutbox:
        outboxResult.duplicate ===
        true,

      request:
        queued,

      outbox:
        outboxResult.event,

      deliveryStarted:
        false,

      humanControlGranted:
        false,

      acknowledgementGranted:
        false,

      executionAuthorized:
        false,
    };
  }
}


const defaultService =
  new HumanNotificationOutboxHandoffService();


module.exports =
  defaultService;


module.exports
  .HumanNotificationOutboxHandoffService =
  HumanNotificationOutboxHandoffService;


module.exports
  .targetReference =
  targetReference;


module.exports
  .normalizeSeverity =
  normalizeSeverity;