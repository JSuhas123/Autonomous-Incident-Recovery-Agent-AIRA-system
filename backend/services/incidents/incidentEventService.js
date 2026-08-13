"use strict";

const crypto =
  require(
    "node:crypto"
  );

const IncidentEvent =
  require(
    "../../models/IncidentEvent"
  );

const {
  getQueueService,
} =
  require(
    "../infrastructure/queueService"
  );

class IncidentEventService {
  // ==========================================================================
  // CREATE EVENT
  // ==========================================================================

  async createLifecycleEvent({
    incident,
    eventType,
    source =
      "incident_service",
    changeType =
      null,
    previousStatus =
      null,
    newStatus =
      null,
    signalId =
      null,
    correlationId =
      null,
    payload =
      {},
    metadata =
      {},
    occurredAt =
      new Date(),
  }) {
    if (
      !incident?._id ||
      !incident.organizationId ||
      !incident.environmentId ||
      !incident.tenantId ||
      !incident.serviceId
    ) {
      throw Object.assign(
        new Error(
          "Complete incident context is required to create IncidentEvent"
        ),
        {
          code:
            "INCIDENT_EVENT_CONTEXT_REQUIRED",
        }
      );
    }

    const eventId =
      crypto
        .randomUUID();

    const resolvedCorrelationId =
      correlationId ||
      incident
        .correlationGroupId ||
      `incident:${incident._id}`;

    return IncidentEvent
      .create({
        eventId,

        eventType,

        source,

        organizationId:
          incident
            .organizationId,

        environmentId:
          incident
            .environmentId,

        tenantId:
          incident
            .tenantId,

        incidentId:
          incident._id,

        serviceId:
          incident
            .serviceId,

        monitorId:
          incident
            .monitorId ||
          null,

        correlationId:
          resolvedCorrelationId,

        correlationGroupId:
          incident
            .correlationGroupId ||
          null,

        signalId,

        incidentStatus:
          incident.status,

        severity:
          incident.severity,

        issue:
          incident.title,

        occurrenceCount:
          incident
            .occurrenceCount ||
          0,

        previousStatus,

        newStatus,

        changeType,

        confidenceScore:
          incident
            .correlationConfidence ??
          null,

        payload,

        metadata,

        status:
          "pending",

        occurredAt,
      });
  }

  // ==========================================================================
  // PERSIST + PUBLISH
  // ==========================================================================

  async persistAndPublish({
    incident,
    eventType,
    topicName,
    source =
      "incident_service",
    changeType =
      null,
    previousStatus =
      null,
    newStatus =
      null,
    signalId =
      null,
    payload =
      {},
    metadata =
      {},
    occurredAt =
      new Date(),
  }) {
    const event =
      await this
        .createLifecycleEvent({
          incident,

          eventType,

          source,

          changeType,

          previousStatus,

          newStatus,

          signalId,

          payload,

          metadata,

          occurredAt,
        });

    const publication =
      await this
        .publishEvent(
          event,
          topicName
        );

    return {
      event,

      publication,
    };
  }

  // ==========================================================================
  // PUBLISH EXISTING EVENT
  // ==========================================================================

  async publishEvent(
    event,
    topicName
  ) {
    try {
      const queue =
        await getQueueService();

      if (
        !queue ||
        queue.connected !==
          true ||
        typeof queue
          .publishEvent !==
          "function"
      ) {
        return {
          published:
            false,

          reason:
            "QUEUE_NOT_CONNECTED",
        };
      }

      const topic =
        queue.topics
          ?.[topicName];

      if (!topic) {
        return {
          published:
            false,

          reason:
            "QUEUE_TOPIC_NOT_REGISTERED",
        };
      }

      const result =
        await queue
          .publishEvent(
            topic,
            {
              incidentEventId:
                String(
                  event._id
                ),

              eventId:
                event.eventId,

              eventType:
                event.eventType,

              incidentId:
                String(
                  event.incidentId
                ),

              organizationId:
                String(
                  event.organizationId
                ),

              environmentId:
                String(
                  event.environmentId
                ),

              tenantId:
                event.tenantId,

              serviceId:
                String(
                  event.serviceId
                ),

              monitorId:
                event.monitorId
                  ? String(
                      event.monitorId
                    )
                  : null,

              correlationId:
                event
                  .correlationId,

              correlationGroupId:
                event
                  .correlationGroupId,

              signalId:
                event.signalId,

              incidentStatus:
                event
                  .incidentStatus,

              severity:
                event.severity,

              occurrenceCount:
                event
                  .occurrenceCount,

              previousStatus:
                event
                  .previousStatus,

              newStatus:
                event.newStatus,

              changeType:
                event.changeType,

              occurredAt:
                event.occurredAt,

              payload:
                event.payload,

              metadata:
                event.metadata,
            },
            {
              eventId:
                event.eventId,

              tenantId:
                event.tenantId,

              organizationId:
                String(
                  event.organizationId
                ),

              environmentId:
                String(
                  event.environmentId
                ),

              correlationId:
                event
                  .correlationId,

              priority:
                this
                  .priorityForSeverity(
                    event.severity
                  ),
            }
          );

      event.status =
        "published";

      event.publishedAt =
        new Date();

      event.error =
        null;

      await event
        .save();

      return {
        published:
          true,

        ...result,
      };
    } catch (
      error
    ) {
      event.status =
        "failed";

      event.failedAt =
        new Date();

      event.retryCount =
        (
          event.retryCount ||
          0
        ) + 1;

      event.error =
        String(
          error.message ||
          "Incident event publication failed"
        )
          .slice(
            0,
            2048
          );

      await event
        .save();

      console.error(
        "[incident-event] publication failed:",
        error.message
      );

      return {
        published:
          false,

        reason:
          "QUEUE_PUBLICATION_FAILED",

        error:
          error.message,
      };
    }
  }

  // ==========================================================================
  // RETRY
  // ==========================================================================

  async retryFailedEvent(
    eventId,
    topicName
  ) {
    const event =
      await IncidentEvent
        .findOne({
          eventId,
        });

    if (!event) {
      return null;
    }

    if (
      event.status !==
      "failed"
    ) {
      return {
        event,

        publication: {
          published:
            false,

          reason:
            "EVENT_NOT_FAILED",
        },
      };
    }

    const publication =
      await this
        .publishEvent(
          event,
          topicName
        );

    return {
      event,

      publication,
    };
  }

  // ==========================================================================
  // MARK PROCESSED
  // ==========================================================================

  async markProcessed(
    eventId,
    processingTimeMs =
      null
  ) {
    return IncidentEvent
      .findOneAndUpdate(
        {
          eventId,
        },
        {
          $set: {
            status:
              "processed",

            processedAt:
              new Date(),

            processingTimeMs:
              processingTimeMs,
          },
        },
        {
          new:
            true,
        }
      );
  }

  // ==========================================================================
  // QUERY
  // ==========================================================================

  async listForIncident(
    {
      organizationId,
      environmentId,
    },
    incidentId,
    limit = 200
  ) {
    return IncidentEvent
      .find({
        organizationId,

        environmentId,

        incidentId,
      })
      .sort({
        occurredAt:
          1,
      })
      .limit(
        Math.min(
          Math.max(
            Number(
              limit
            ) ||
            200,
            1
          ),
          1000
        )
      )
      .lean();
  }

  // ==========================================================================
  // PRIORITY
  // ==========================================================================

  priorityForSeverity(
    severity
  ) {
    switch (
      severity
    ) {
      case "critical":
        return 9;

      case "warning":
        return 6;

      case "info":
        return 3;

      default:
        return 2;
    }
  }
}

module.exports =
  new IncidentEventService();

module.exports
  .IncidentEventService =
  IncidentEventService;