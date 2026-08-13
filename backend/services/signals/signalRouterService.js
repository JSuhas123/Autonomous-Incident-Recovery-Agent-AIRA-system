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

const incidentOrchestrationService =
  require(
    "../incidents/incidentOrchestrationService"
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
     * We cannot create an incident safely without a resolved AIRA Service.
     *
     * Keep the signal as evidence instead of guessing service ownership.
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

    // ==========================================================================
    // SIGNAL EVENT
    // ==========================================================================

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

    // ==========================================================================
    // NON-INCIDENT SIGNAL
    // ==========================================================================

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

        incidentResult:
          null,
      };
    }

    // ==========================================================================
    // INCIDENT CANDIDATE PAYLOAD
    // ==========================================================================

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

    // ==========================================================================
    // QUEUE — INCIDENT DETECTED
    // ==========================================================================

    /*
     * Keep the existing queue publication for now.
     *
     * Phase 5.7 will consolidate lifecycle event ownership so that
     * incident persistence and event publication cannot diverge.
     */
    const now =
      new Date();

    // ==========================================================================
    // MARK SIGNAL AS ROUTED
    // ==========================================================================

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

    // ==========================================================================
    // MARK CORRELATION GROUP AS ROUTED
    // ==========================================================================

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

    // ==========================================================================
    // PHASE 5 — INCIDENT ORCHESTRATION
    // ==========================================================================

    /*
     * This is the canonical bridge from Phase 4 into Phase 5.
     *
     * The orchestration service:
     *
     * 1. evaluates the signal
     * 2. identifies recovery / ignore / open-or-update
     * 3. creates or updates the canonical Incident
     * 4. links Signal -> Incident
     * 5. links SignalCorrelation -> Incident
     */
    let incidentResult =
      null;

    try {
      incidentResult =
        await incidentOrchestrationService
          .processSignal(
            signal
          );
    } catch (error) {
      /*
       * Do NOT lose the canonical Signal merely because downstream
       * incident orchestration fails.
       *
       * Record the error so it can be retried / inspected later.
       */
      console.error(
        "[signal-router] Incident orchestration failed:",
        error.message
      );

      await this
        .markSignal(
          signal,
          {
            processingError:
              `Incident orchestration failed: ${String(
                error.message ||
                "unknown error"
              ).slice(
                0,
                1900
              )}`,
          }
        );

      throw error;
    }

    // ==========================================================================
    // RETURN
    // ==========================================================================

    return {
      routed:
        true,

      incidentCandidate:
        true,

      signalQueue,

      incidentPayload,

      incidentResult,
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
       * Local development may intentionally run without RabbitMQ.
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