"use strict";

const crypto =
  require(
    "crypto"
  );

const workflowOutboxClaimService =
  require(
    "./workflowOutboxClaimService"
  );

const {
  OUTBOX_EVENT_TYPE,
  OUTBOX_ERROR_CODE,
  DEFAULT_OUTBOX_LEASE_MS,
  assertNoExecutionAuthority,
} =
  require(
    "./workflowOutboxContracts"
  );

class WorkflowOutboxDispatcher {
  constructor(
    options = {}
  ) {
    this.claimService =
      options.claimService ||
      workflowOutboxClaimService;

    this.publishers =
      options.publishers ||
      {};

    this.ownerId =
      options.ownerId ||
      [
        "workflow-outbox",
        process.pid,
      ].join(
        ":"
      );

    this.leaseMs =
      options.leaseMs ||
      DEFAULT_OUTBOX_LEASE_MS;

    this.now =
      options.now ||
      (() =>
        new Date());

    this.generateMessageId =
      options.generateMessageId ||
      (() =>
        crypto
          .randomBytes(
            16
          )
          .toString(
            "hex"
          ));
  }

  async dispatch(
    event,
    options = {}
  ) {
    this.assertEvent(
      event
    );

    assertNoExecutionAuthority(
      event.payload ||
        {}
    );

    if (
      event.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox event cannot grant execution authority"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .UNSAFE_AUTHORITY,

          eventId:
            event.eventId,
        }
      );
    }

    const ownerId =
      options.ownerId ||
      this.ownerId;

    const leaseMs =
      options.leaseMs ||
      this.leaseMs;

    const now =
      options.now ||
      this.now();

    const claim =
      await this.claimService
        .claim({
          eventId:
            event.eventId,

          organizationId:
            event.organizationId,

          environmentId:
            event.environmentId,

          ownerId,

          leaseMs,

          now,
        });

    if (
      !claim.claimed
    ) {
      return {
        dispatched:
          false,

        published:
          false,

        eventId:
          event.eventId,

        decision:
          claim.decision,

        event:
          claim.event ||
          event,

        executionAuthorized:
          false,
      };
    }

    return this
      .dispatchClaimed({
        event:
          claim.event,

        ownerId,

        claimToken:
          claim.claimToken,

        leaseMs,

        now,
      });
  }

  async dispatchClaimed({
    event,
    ownerId,
    claimToken,
    leaseMs =
      this.leaseMs,
    now =
      this.now(),
  } = {}) {
    this.assertEvent(
      event
    );

    assertNoExecutionAuthority(
      event.payload ||
        {}
    );

    if (
      event.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox event cannot grant execution authority"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .UNSAFE_AUTHORITY,

          eventId:
            event.eventId,
        }
      );
    }

    if (
      !ownerId ||
      !claimToken
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox dispatcher requires active publisher ownership"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .CLAIM_TOKEN_REQUIRED,

          eventId:
            event.eventId,
        }
      );
    }

    const route =
      this.resolveRoute(
        event
      );

    const messageId =
      this.generateMessageId();

    const message =
      this.buildMessage({
        event,
        messageId,
      });

    await this
      .claimService
      .heartbeat({
        eventId:
          event.eventId,

        organizationId:
          event.organizationId,

        environmentId:
          event.environmentId,

        ownerId,

        claimToken,

        leaseMs,

        now,
      });

    let publishResult;

    try {
      publishResult =
        await route
          .publish(
            message,
            {
              event,
              messageId,
              ownerId,
              claimToken,
            }
          );
    } catch (
      error
    ) {
      throw Object.assign(
        error instanceof Error
          ? error
          : new Error(
              "Workflow outbox publication failed"
            ),
        {
          outboxContext: {
            eventId:
              event.eventId,

            eventType:
              event.eventType,

            organizationId:
              event.organizationId,

            environmentId:
              event.environmentId,

            ownerId,

            claimToken,

            messageId,

            route:
              route.name,

            queue:
              route.queue ||
              null,

            exchange:
              route.exchange ||
              null,

            routingKey:
              route.routingKey ||
              null,
          },
        }
      );
    }

    const deliveryMetadata = {
      messageId:
        publishResult
          ?.messageId ||
        messageId,

      queue:
        publishResult
          ?.queue ||
        route.queue ||
        null,

      exchange:
        publishResult
          ?.exchange ||
        route.exchange ||
        null,

      routingKey:
        publishResult
          ?.routingKey ||
        route.routingKey ||
        null,
    };

    const delivered =
      await this
        .claimService
        .markDelivered({
          eventId:
            event.eventId,

          organizationId:
            event.organizationId,

          environmentId:
            event.environmentId,

          ownerId,

          claimToken,

          messageId:
            deliveryMetadata
              .messageId,

          queue:
            deliveryMetadata
              .queue,

          exchange:
            deliveryMetadata
              .exchange,

          routingKey:
            deliveryMetadata
              .routingKey,

          now:
            this.now(),
        });

    return {
      dispatched:
        true,

      published:
        true,

      delivered:
        delivered
          .delivered ===
        true,

      eventId:
        event.eventId,

      eventType:
        event.eventType,

      messageId:
        deliveryMetadata
          .messageId,

      route:
        route.name,

      queue:
        deliveryMetadata
          .queue,

      exchange:
        deliveryMetadata
          .exchange,

      routingKey:
        deliveryMetadata
          .routingKey,

      publishResult:
        publishResult ||
        null,

      event:
        delivered.event,

      executionAuthorized:
        false,
    };
  }

  resolveRoute(
    event
  ) {
    const publisher =
      this.publishers[
        event.eventType
      ];

    if (
      !publisher
    ) {
      throw Object.assign(
        new Error(
          `No workflow outbox publisher configured for event type ${event.eventType}`
        ),
        {
          code:
            "OUTBOX_EVENT_ROUTE_NOT_CONFIGURED",

          eventId:
            event.eventId,

          eventType:
            event.eventType,
        }
      );
    }

    if (
      typeof publisher ===
        "function"
    ) {
      return {
        name:
          event.eventType,

        queue:
          null,

        exchange:
          null,

        routingKey:
          null,

        publish:
          publisher,
      };
    }

    if (
      typeof publisher !==
        "object" ||
      typeof publisher.publish !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          `Workflow outbox publisher for ${event.eventType} is invalid`
        ),
        {
          code:
            "OUTBOX_EVENT_ROUTE_INVALID",

          eventId:
            event.eventId,

          eventType:
            event.eventType,
        }
      );
    }

    return {
      name:
        publisher.name ||
        event.eventType,

      queue:
        publisher.queue ||
        null,

      exchange:
        publisher.exchange ||
        null,

      routingKey:
        publisher.routingKey ||
        null,

      publish:
        publisher.publish,
    };
  }

  buildMessage({
    event,
    messageId,
  } = {}) {
    this.assertEvent(
      event
    );

    assertNoExecutionAuthority(
      event.payload ||
        {}
    );

    return {
      messageId,

      outboxEventId:
        event.eventId,

      outboxEventKey:
        event.eventKey,

      eventType:
        event.eventType,

      aggregateType:
        event.aggregateType,

      aggregateId:
        event.aggregateId,

      organizationId:
        event.organizationId,

      environmentId:
        event.environmentId,

      incidentId:
        event.incidentId,

      payload: {
        ...(
          event.payload ||
          {}
        ),

        executionAuthorized:
          false,
      },

      metadata: {
        ...(
          event.metadata ||
          {}
        ),

        outbox: {
          eventId:
            event.eventId,

          eventKey:
            event.eventKey,

          payloadFingerprint:
            event
              .payloadFingerprint ||
            null,

          eventType:
            event.eventType,

          aggregateType:
            event.aggregateType,

          aggregateId:
            event.aggregateId,
        },
      },

      executionAuthorized:
        false,
    };
  }

  static route({
    name,
    queue = null,
    exchange = null,
    routingKey = null,
    publish,
  } = {}) {
    if (
      typeof publish !==
        "function"
    ) {
      throw new TypeError(
        "Workflow outbox route requires publish function"
      );
    }

    return {
      name:
        name ||
        "workflow-outbox-route",

      queue,

      exchange,

      routingKey,

      publish,
    };
  }

  assertEvent(
    event
  ) {
    if (
      !event ||
      typeof event !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox event is required"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_REQUIRED,
        }
      );
    }

    for (
      const field
      of [
        "eventId",
        "eventKey",
        "organizationId",
        "environmentId",
        "incidentId",
        "aggregateType",
        "aggregateId",
        "eventType",
      ]
    ) {
      if (
        !event[field]
      ) {
        throw Object.assign(
          new Error(
            `Workflow outbox event requires ${field}`
          ),
          {
            code:
              OUTBOX_ERROR_CODE
                .EVENT_REQUIRED,

            field,
          }
        );
      }
    }

    if (
      !Object.values(
        OUTBOX_EVENT_TYPE
      ).includes(
        event.eventType
      )
    ) {
      throw Object.assign(
        new Error(
          `Unknown workflow outbox event type: ${event.eventType}`
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_TYPE_REQUIRED,

          eventType:
            event.eventType,
        }
      );
    }

    return true;
  }
}

module.exports =
  new WorkflowOutboxDispatcher();

module.exports
  .WorkflowOutboxDispatcher =
  WorkflowOutboxDispatcher;