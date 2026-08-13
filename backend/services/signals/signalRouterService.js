"use strict";

const {
  Signal,
} =
  require(
    "../../models/Signal"
  );

const {
  SignalCorrelation,
} =
  require(
    "../../models/SignalCorrelation"
  );

const {
  getQueueService,
} =
  require(
    "../infrastructure/queueService"
  );

class SignalRouterService {
  // ==========================================================================
  // MAIN ROUTER
  // ==========================================================================

  async route(
    signal,
    correlationGroup = null
  ) {
    if (
      !signal ||
      !signal.organizationId ||
      !signal.environmentId ||
      !signal.tenantId
    ) {
      throw Object.assign(
        new Error(
          "Complete signal routing context is required"
        ),
        {
          code:
            "SIGNAL_ROUTING_CONTEXT_REQUIRED",
        }
      );
    }

    const candidate =
      Boolean(
        correlationGroup
          ?.incidentCandidate ||
        signal.incidentCandidate
      );

    /*
     * We cannot create/route a service incident safely if
     * the signal could not be mapped to an AIRA Service.
     *
     * Keep it as evidence instead of guessing.
     */
    if (
      candidate &&
      !signal.serviceId
    ) {
      await this
        .markSignal(
          signal,
          {
            processingStatus:
              "routed",

            routedAt:
              new Date(),

            incidentCandidate:
              true,

            processingError:
              "Incident candidate could not be routed because service resolution failed.",
          }
        );

      return {
        routed:
          false,

        incidentCandidate:
          true,

        reason:
          "SERVICE_UNRESOLVED",
      };
    }

    // ------------------------------------------------------------------------
    // SIGNAL EVENT
    // ------------------------------------------------------------------------

    const signalQueue =
      await this
        .publishSafely(
          "SIGNAL_RECEIVED",
          {
            signalId:
              signal.signalId,

            organizationId:
              String(
                signal.organizationId
              ),

            environmentId:
              String(
                signal.environmentId
              ),

            serviceId:
              signal.serviceId
                ? String(
                    signal.serviceId
                  )
                : null,

            provider:
              signal.provider,

            source:
              signal.source,

            signalType:
              signal.signalType,

            eventType:
              signal.eventType,

            severity:
              signal.severity,

            incidentCandidate:
              candidate,

            correlationGroupId:
              correlationGroup
                ?.correlationGroupId ||
              signal
                .correlationGroupId ||
              null,

            observedAt:
              signal.observedAt,
          },
          signal
        );

    // ------------------------------------------------------------------------
    // NON-INCIDENT SIGNAL
    // ------------------------------------------------------------------------

    if (!candidate) {
      await this
        .markSignal(
          signal,
          {
            processingStatus:
              "routed",

            routedAt:
              new Date(),

            incidentCandidate:
              false,

            processingError:
              null,
          }
        );

      return {
        routed:
          true,

        incidentCandidate:
          false,

        signalQueue,
      };
    }

    // ------------------------------------------------------------------------
    // INCIDENT CANDIDATE
    // ------------------------------------------------------------------------

    const incidentPayload = {
      organizationId:
        String(
          signal.organizationId
        ),

      environmentId:
        String(
          signal.environmentId
        ),

      tenantId:
        signal.tenantId,

      serviceId:
        String(
          signal.serviceId
        ),

      monitorId:
        signal.monitorId
          ? String(
              signal.monitorId
            )
          : null,

      signalId:
        signal.signalId,

      correlationGroupId:
        correlationGroup
          ?.correlationGroupId ||
        signal
          .correlationGroupId ||
        null,

      provider:
        signal.provider,

      source:
        signal.source,

      eventType:
        signal.eventType,

      severity:
        correlationGroup
          ?.highestSeverity ||
        signal.severity,

      title:
        signal.title,

      description:
        signal.description,

      fingerprint:
        signal.fingerprint,

      errorCode:
        signal.errorCode,

      statusCode:
        signal.statusCode,

      observedAt:
        signal.observedAt,

      evidence: {
        providerCount:
          correlationGroup
            ?.providerCount ||
          1,

        signalCount:
          correlationGroup
            ?.signalCount ||
          1,

        confidenceScore:
          correlationGroup
            ?.confidenceScore ||
          signal
            .correlationScore ||
          0,

        reason:
          correlationGroup
            ?.incidentCandidateReason ||
          "Signal marked as an incident candidate.",
      },
    };

    const incidentQueue =
      await this
        .publishSafely(
          "INCIDENT_DETECTED",
          incidentPayload,
          signal
        );

    const now =
      new Date();

    await this
      .markSignal(
        signal,
        {
          processingStatus:
            "routed",

          routedAt:
            now,

          incidentCandidate:
            true,

          processingError:
            null,
        }
      );

    if (
      correlationGroup
        ?._id
    ) {
      await SignalCorrelation
        .updateOne(
          {
            _id:
              correlationGroup._id,

            organizationId:
              signal.organizationId,

            environmentId:
              signal.environmentId,
          },
          {
            $set: {
              status:
                "routed",

              routedAt:
                now,
            },
          }
        );
    }

    return {
      routed:
        true,

      incidentCandidate:
        true,

      signalQueue,

      incidentQueue,

      incidentPayload,
    };
  }

  // ==========================================================================
  // QUEUE
  // ==========================================================================

  async publishSafely(
    topicName,
    payload,
    signal
  ) {
    try {
      const queue =
        await getQueueService();

      /*
       * Local development may intentionally run without
       * RabbitMQ.
       */
      if (
        !queue ||
        typeof queue
          .publishEvent !==
          "function" ||
        queue.connected !==
          true
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
            "QUEUE_TOPIC_NOT_FOUND",
        };
      }

      const result =
        await queue
          .publishEvent(
            topic,
            payload,
            {
              tenantId:
                signal.tenantId,

              correlationId:
                signal
                  .correlationGroupId ||
                signal
                  .correlationId ||
                undefined,

              priority:
                this
                  .priorityForSeverity(
                    signal.severity
                  ),
            }
          );

      return {
        published:
          true,

        ...result,
      };
    } catch (error) {
      /*
       * Signal persistence must not disappear merely because
       * RabbitMQ is temporarily unavailable.
       *
       * Platform reliability/retry handling is strengthened
       * later in Concept 17.
       */
      console.error(
        "[signal-router] Queue publication failed:",
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

  // ==========================================================================
  // STATUS
  // ==========================================================================

  async markSignal(
    signal,
    updates
  ) {
    if (!signal._id) {
      Object.assign(
        signal,
        updates
      );

      return signal;
    }

    await Signal
      .updateOne(
        {
          _id:
            signal._id,

          organizationId:
            signal.organizationId,

          environmentId:
            signal.environmentId,
        },
        {
          $set:
            updates,
        }
      );

    Object.assign(
      signal,
      updates
    );

    return signal;
  }
}

module.exports =
  new SignalRouterService();

module.exports
  .SignalRouterService =
  SignalRouterService;