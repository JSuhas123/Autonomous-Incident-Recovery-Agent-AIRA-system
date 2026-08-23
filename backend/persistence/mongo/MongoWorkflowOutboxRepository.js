"use strict";

const WorkflowOutboxRepository =
  require(
    "../repositories/WorkflowOutboxRepository"
  );

const WorkflowOutboxEvent =
  require(
    "../../models/WorkflowOutboxEvent"
  );

const {
  OUTBOX_STATUS,
} =
  require(
    "../../services/workflowOutbox/workflowOutboxContracts"
  );

function sessionFrom(
  transaction
) {
  return transaction?.kind ===
    "mongo"
    ? transaction.session
    : null;
}

class MongoWorkflowOutboxRepository
  extends WorkflowOutboxRepository {
  async create(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (!session) {
      return WorkflowOutboxEvent
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await WorkflowOutboxEvent
        .create(
          [
            data,
          ],
          {
            session,
          }
        );

    return created;
  }

  async findByEventId(
    scope,
    eventId,
    transaction = null
  ) {
    let query =
      WorkflowOutboxEvent
        .findOne({
          eventId,

          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,
        });

    return attachSession(
      query,
      transaction
    );
  }

  async findByEventKey(
    scope,
    eventKey,
    transaction = null
  ) {
    let query =
      WorkflowOutboxEvent
        .findOne({
          eventKey,

          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,
        });

    return attachSession(
      query,
      transaction
    );
  }

  async claim(
    scope,
    {
      eventId,
      ownerId,
      claimToken,
      currentTime,
      leaseExpiresAt,
    },
    transaction = null
  ) {
    let query =
      WorkflowOutboxEvent
        .findOneAndUpdate(
          {
            eventId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            status: {
              $in: [
                OUTBOX_STATUS.PENDING,
                OUTBOX_STATUS.FAILED,
                OUTBOX_STATUS.PROCESSING,
              ],
            },

            $or: [
              {
                "owner.leaseExpiresAt":
                  null,
              },
              {
                "owner.leaseExpiresAt": {
                  $lte:
                    currentTime,
                },
              },
            ],

            $expr: {
              $lt: [
                "$attempts.count",
                "$attempts.maxAttempts",
              ],
            },
          },
          {
            $set: {
              status:
                OUTBOX_STATUS.PROCESSING,

              "owner.workerId":
                ownerId,

              "owner.claimToken":
                claimToken,

              "owner.claimedAt":
                currentTime,

              "owner.heartbeatAt":
                currentTime,

              "owner.leaseExpiresAt":
                leaseExpiresAt,

              "failure.code":
                null,

              "failure.message":
                null,

              "failure.retryable":
                false,

              "failure.failedAt":
                null,
            },

            $inc: {
              "attempts.count":
                1,
            },
          },
          {
            new:
              true,
          }
        );

    return attachSession(
      query,
      transaction
    );
  }

  async heartbeat(
    scope,
    {
      eventId,
      ownerId,
      claimToken,
      currentTime,
      leaseExpiresAt,
    },
    transaction = null
  ) {
    let query =
      WorkflowOutboxEvent
        .findOneAndUpdate(
          {
            eventId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            status:
              OUTBOX_STATUS.PROCESSING,

            "owner.workerId":
              ownerId,

            "owner.claimToken":
              claimToken,

            "owner.leaseExpiresAt": {
              $gt:
                currentTime,
            },
          },
          {
            $set: {
              "owner.heartbeatAt":
                currentTime,

              "owner.leaseExpiresAt":
                leaseExpiresAt,
            },
          },
          {
            new:
              true,
          }
        );

    return attachSession(
      query,
      transaction
    );
  }

  async markDelivered(
    scope,
    {
      eventId,
      ownerId,
      claimToken,
      currentTime,
      messageId = null,
      queue = null,
      exchange = null,
      routingKey = null,
    },
    transaction = null
  ) {
    let query =
      WorkflowOutboxEvent
        .findOneAndUpdate(
          {
            eventId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            status:
              OUTBOX_STATUS.PROCESSING,

            "owner.workerId":
              ownerId,

            "owner.claimToken":
              claimToken,

            "owner.leaseExpiresAt": {
              $gt:
                currentTime,
            },
          },
          {
            $set: {
              status:
                OUTBOX_STATUS.DELIVERED,

              "delivery.deliveredAt":
                currentTime,

              "delivery.messageId":
                messageId,

              "delivery.queue":
                queue,

              "delivery.exchange":
                exchange,

              "delivery.routingKey":
                routingKey,

              "owner.heartbeatAt":
                currentTime,

              "owner.leaseExpiresAt":
                currentTime,

              "attempts.nextAttemptAt":
                null,

              "failure.code":
                null,

              "failure.message":
                null,

              "failure.retryable":
                false,

              "failure.failedAt":
                null,
            },
          },
          {
            new:
              true,
          }
        );

    return attachSession(
      query,
      transaction
    );
  }

  async markFailed(
    scope,
    {
      eventId,
      ownerId,
      claimToken,
      currentTime,
      error,
      retryable,
      nextAttemptAt,
    },
    transaction = null
  ) {
    let query =
      WorkflowOutboxEvent
        .findOneAndUpdate(
          {
            eventId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            status:
              OUTBOX_STATUS.PROCESSING,

            "owner.workerId":
              ownerId,

            "owner.claimToken":
              claimToken,

            "owner.leaseExpiresAt": {
              $gt:
                currentTime,
            },
          },
          {
            $set: {
              status:
                OUTBOX_STATUS.FAILED,

              "failure.code":
                error?.code ||
                "OUTBOX_DELIVERY_FAILED",

              "failure.message":
                error?.message ||
                "Workflow outbox delivery failed",

              "failure.retryable":
                retryable ===
                true,

              "failure.failedAt":
                currentTime,

              "attempts.lastAttemptAt":
                currentTime,

              "attempts.nextAttemptAt":
                nextAttemptAt,

              "owner.heartbeatAt":
                currentTime,

              "owner.leaseExpiresAt":
                currentTime,
            },
          },
          {
            new:
              true,
          }
        );

    return attachSession(
      query,
      transaction
    );
  }

  async markDeadLetter(
    scope,
    {
      eventId,
      ownerId,
      claimToken,
      currentTime,
      reason,
    },
    transaction = null
  ) {
    let query =
      WorkflowOutboxEvent
        .findOneAndUpdate(
          {
            eventId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            status:
              OUTBOX_STATUS.PROCESSING,

            "owner.workerId":
              ownerId,

            "owner.claimToken":
              claimToken,

            "owner.leaseExpiresAt": {
              $gt:
                currentTime,
            },
          },
          {
            $set: {
              status:
                OUTBOX_STATUS.DEAD_LETTER,

              "deadLetter.reason":
                String(
                  reason
                ).trim(),

              "deadLetter.deadLetteredAt":
                currentTime,

              "attempts.nextAttemptAt":
                null,

              "owner.heartbeatAt":
                currentTime,

              "owner.leaseExpiresAt":
                currentTime,
            },
          },
          {
            new:
              true,
          }
        );

    return attachSession(
      query,
      transaction
    );
  }


  async findForIncident(
    scope,
    incidentId,
    transaction = null
  ) {
    let query =
      WorkflowOutboxEvent
        .find({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          incidentId,
        })
        .sort({
          createdAt: 1,
        });

    return attachSession(
      query,
      transaction
    );
  }
  async findDeliverable(
    {
      limit = 50,
      now = new Date(),
    } = {},
    transaction = null
  ) {
    const safeLimit =
      Math.min(
        Math.max(
          Number(
            limit
          ) ||
          50,
          1
        ),
        500
      );

    let query =
      WorkflowOutboxEvent
        .find({
          status: {
            $in: [
              OUTBOX_STATUS.PENDING,
              OUTBOX_STATUS.FAILED,
            ],
          },

          "attempts.nextAttemptAt": {
            $lte:
              now,
          },

          $or: [
            {
              "owner.leaseExpiresAt":
                null,
            },
            {
              "owner.leaseExpiresAt": {
                $lte:
                  now,
              },
            },
          ],

          $expr: {
            $lt: [
              "$attempts.count",
              "$attempts.maxAttempts",
            ],
          },
        })
        .sort({
          "attempts.nextAttemptAt":
            1,

          createdAt:
            1,
        })
        .limit(
          safeLimit
        );

    return attachSession(
      query,
      transaction
    );
  }
}

function attachSession(
  query,
  transaction
) {
  const session =
    sessionFrom(
      transaction
    );

  if (
    session &&
    typeof query.session ===
      "function"
  ) {
    return query.session(
      session
    );
  }

  return query;
}

module.exports =
  MongoWorkflowOutboxRepository;
