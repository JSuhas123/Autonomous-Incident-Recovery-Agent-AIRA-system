"use strict";

const {
  Signal,
} =
  require(
    "../../models/Signal"
  );

const signalNormalizationService =
  require(
    "./signalNormalizationService"
  );

const signalDeduplicationService =
  require(
    "./signalDeduplicationService"
  );

const signalEnrichmentService =
  require(
    "./signalEnrichmentService"
  );

const signalCorrelationService =
  require(
    "./signalCorrelationService"
  );

const signalCorrelationGroupService =
  require(
    "./signalCorrelationGroupService"
  );

const signalRouterService =
  require(
    "./signalRouterService"
  );

class SignalIngestionService {
  // ==========================================================================
  // INGEST ONE
  // ==========================================================================

  async ingest(
    input,
    context = {},
    options = {}
  ) {
    let persistedSignal =
      null;

    try {
      // ----------------------------------------------------------------------
      // 1. NORMALIZE
      // ----------------------------------------------------------------------

      const normalized =
        signalNormalizationService
          .normalize(
            input,
            context
          );

      // ----------------------------------------------------------------------
      // 2. DEDUPLICATE
      // ----------------------------------------------------------------------

      const deduplication =
        await signalDeduplicationService
          .deduplicate(
            normalized,
            {
              windowMs:
                options
                  .dedupWindowMs,
            }
          );

      if (
        deduplication
          .duplicate
      ) {
        return {
          accepted:
            true,

          duplicate:
            true,

          signal:
            deduplication
              .signal,

          correlation:
            null,

          correlationGroup:
            null,

          routing: {
            routed:
              false,

            reason:
              "DUPLICATE_SIGNAL",
          },
        };
      }

      // ----------------------------------------------------------------------
      // 3. ENRICH
      // ----------------------------------------------------------------------

      const enriched =
        await signalEnrichmentService
          .enrich(
            normalized
          );

      // ----------------------------------------------------------------------
      // 4. PERSIST
      // ----------------------------------------------------------------------

      persistedSignal =
        await Signal
          .create({
            ...enriched,

            processingStatus:
              "enriched",

            enrichedAt:
              enriched
                .enrichedAt ||
              new Date(),
          });

      // ----------------------------------------------------------------------
      // 5. CORRELATE
      // ----------------------------------------------------------------------

      const correlation =
        await signalCorrelationService
          .correlate(
            persistedSignal,
            {
              windowMs:
                options
                  .correlationWindowMs,

              minimumScore:
                options
                  .minimumCorrelationScore,
            }
          );

      /*
       * Refresh after correlation because correlationService
       * updates the stored document directly.
       */
      persistedSignal =
        await Signal
          .findById(
            persistedSignal
              ._id
          );

      // ----------------------------------------------------------------------
      // 6. UPDATE / CREATE CORRELATION GROUP
      // ----------------------------------------------------------------------

      const correlationGroup =
        await signalCorrelationGroupService
          .updateGroup(
            persistedSignal,
            correlation
          );

      /*
       * Refresh again because correlationGroupService may set:
       *
       * - correlationGroupId
       * - correlationScore
       * - incidentCandidate
       */
      persistedSignal =
        await Signal
          .findById(
            persistedSignal
              ._id
          );

      // ----------------------------------------------------------------------
      // 7. ROUTE
      // ----------------------------------------------------------------------

      const routing =
        await signalRouterService
          .route(
            persistedSignal,
            correlationGroup
          );

      /*
       * Router / incident orchestration may attach incidentId and
       * update processing state.
       */
      persistedSignal =
        await Signal
          .findById(
            persistedSignal
              ._id
          );

      return {
        accepted:
          true,

        duplicate:
          false,

        signal:
          persistedSignal,

        correlation,

        correlationGroup,

        routing,
      };
    } catch (
      error
    ) {
      // ----------------------------------------------------------------------
      // FAILURE TRACKING
      // ----------------------------------------------------------------------

      if (
        persistedSignal
          ?._id
      ) {
        try {
          await Signal
            .updateOne(
              {
                _id:
                  persistedSignal
                    ._id,

                organizationId:
                  persistedSignal
                    .organizationId,

                environmentId:
                  persistedSignal
                    .environmentId,
              },
              {
                $set: {
                  processingStatus:
                    "failed",

                  processingError:
                    this
                      .safeErrorMessage(
                        error
                      ),
                },
              }
            );
        } catch (
          persistenceError
        ) {
          console.error(
            "[signal-ingestion] Failed to record processing failure:",
            persistenceError
              .message
          );
        }
      }

      throw error;
    }
  }

  // ==========================================================================
  // INGEST MANY
  // ==========================================================================

  async ingestBatch(
    inputs,
    context = {},
    options = {}
  ) {
    if (
      !Array.isArray(
        inputs
      )
    ) {
      throw Object.assign(
        new Error(
          "Signal batch must be an array"
        ),
        {
          code:
            "SIGNAL_BATCH_INVALID",
        }
      );
    }

    const maxBatchSize =
      Number(
        process.env
          .SIGNAL_MAX_BATCH_SIZE
      ) ||
      1000;

    if (
      inputs.length >
      maxBatchSize
    ) {
      throw Object.assign(
        new Error(
          `Signal batch cannot exceed ${maxBatchSize} items`
        ),
        {
          code:
            "SIGNAL_BATCH_TOO_LARGE",
        }
      );
    }

    const results = [];

    let accepted =
      0;

    let duplicates =
      0;

    let failed =
      0;

    for (
      let index = 0;
      index <
        inputs.length;
      index++
    ) {
      try {
        const result =
          await this
            .ingest(
              inputs[index],
              context,
              options
            );

        results.push({
          index,

          success:
            true,

          ...result,
        });

        if (
          result
            .duplicate
        ) {
          duplicates +=
            1;
        } else {
          accepted +=
            1;
        }
      } catch (
        error
      ) {
        failed +=
          1;

        results.push({
          index,

          success:
            false,

          error: {
            code:
              error.code ||
              "SIGNAL_INGESTION_FAILED",

            message:
              this
                .safeErrorMessage(
                  error
                ),
          },
        });
      }
    }

    return {
      received:
        inputs.length,

      accepted,

      duplicates,

      failed,

      results,
    };
  }

  // ==========================================================================
  // MONITOR CONVENIENCE
  // ==========================================================================

  async ingestMonitorCheck(
    monitor,
    check,
    options = {}
  ) {
    if (
      !monitor
    ) {
      throw Object.assign(
        new Error(
          "Monitor is required"
        ),
        {
          code:
            "SIGNAL_MONITOR_REQUIRED",
        }
      );
    }

    if (
      !check
    ) {
      throw Object.assign(
        new Error(
          "Monitor check is required"
        ),
        {
          code:
            "SIGNAL_MONITOR_CHECK_REQUIRED",
        }
      );
    }

    if (
      !monitor
        .organizationId ||
      !monitor
        .environmentId ||
      !monitor
        .tenantId ||
      !monitor
        .serviceId ||
      !monitor._id
    ) {
      throw Object.assign(
        new Error(
          "Complete monitor ownership context is required"
        ),
        {
          code:
            "SIGNAL_MONITOR_CONTEXT_REQUIRED",
        }
      );
    }

    const effectiveStatus =
      String(
        check.status ||
        ""
      )
        .trim()
        .toLowerCase();

    const previousStatus =
      String(
        check.previousStatus ||
        ""
      )
        .trim()
        .toLowerCase();

    const transitioned =
      check.transitioned ===
      true;

    // ------------------------------------------------------------------------
    // CLASSIFY CANONICAL MONITOR EVENT
    // ------------------------------------------------------------------------

    const recovered =
      transitioned &&
      effectiveStatus ===
        "healthy" &&
      [
        "down",
        "degraded",
      ].includes(
        previousStatus
      );

    const degraded =
      effectiveStatus ===
      "degraded";

    const failure =
      effectiveStatus ===
      "down";

    let eventType;

    let severity;

    let title;

    let description;

    if (
      recovered
    ) {
      eventType =
        "monitor.recovered";

      severity =
        "info";

      title =
        `${monitor.name} recovered`;

      description =
        `Monitor "${monitor.name}" recovered after previously being ${previousStatus}.`;
    } else if (
      degraded
    ) {
      eventType =
        "monitor.degraded";

      severity =
        "warning";

      title =
        `${monitor.name} degraded`;

      description =
        check
          .sanitizedErrorMessage ||
        `Monitor "${monitor.name}" is reporting degraded health.`;
    } else if (
      failure
    ) {
      eventType =
        "monitor.failure";

      severity =
        this
          .monitorSeverity(
            check
          );

      title =
        `${monitor.name} failure`;

      description =
        check
          .sanitizedErrorMessage ||
        `Monitor "${monitor.name}" observed a confirmed failure.`;
    } else {
      /*
       * Healthy heartbeats normally do not reach this method after
       * the Phase 5 monitor cutover.
       *
       * Keep this representation for tests/direct callers.
       */
      eventType =
        "monitor.healthy";

      severity =
        "info";

      title =
        `${monitor.name} healthy`;

      description =
        `Monitor "${monitor.name}" is healthy.`;
    }

    // ------------------------------------------------------------------------
    // OBSERVATION TIME
    // ------------------------------------------------------------------------

    const checkedAt =
      check.checkedAt ||
      new Date();

    // ------------------------------------------------------------------------
    // SOURCE EVENT ID
    // ------------------------------------------------------------------------

    /*
     * MonitorCheck currently may not expose its Mongo _id here because
     * monitorExecution persists the check before calling ingestion.
     *
     * Generate deterministic-enough event identity from monitor +
     * observation timestamp + event type.
     */
    const sourceEventId =
      check.checkId ||
      check.eventId ||
      [
        "monitor",
        String(
          monitor._id
        ),
        eventType,
        new Date(
          checkedAt
        )
          .toISOString(),
      ]
        .join(
          ":"
        );

    // ------------------------------------------------------------------------
    // CANONICAL PAYLOAD
    // ------------------------------------------------------------------------

    const canonicalInput = {
      provider:
        "monitor",

      source:
        "monitor",

      signalType:
        "alert",

      eventType,

      title,

      description,

      severity,

      status:
        effectiveStatus ||
        "unknown",

      statusCode:
        check
          .statusCode ??
        null,

      /*
       * Recovery must not carry the previous failure code.
       */
      errorCode:
        recovered
          ? null
          : (
              check
                .errorCode ||
              null
            ),

      errorMessage:
        recovered
          ? null
          : (
              check
                .sanitizedErrorMessage ||
              null
            ),

      responseTimeMs:
        check
          .responseTimeMs ??
        null,

      observedAt:
        checkedAt,

      sourceEventId,

      /*
       * Preserve explicit ownership both in payload and context.
       */
      serviceId:
        monitor
          .serviceId,

      monitorId:
        monitor._id,

      resource: {
        serviceName:
          monitor.name,

        host:
          this
            .extractHost(
              monitor.url
            ),

        region:
          check
            .checkerRegion ||
          null,
      },

      attributes: {
        monitor: {
          id:
            String(
              monitor._id
            ),

          name:
            monitor.name,

          url:
            monitor.url,

          type:
            monitor.type,

          previousStatus:
            previousStatus ||
            null,

          effectiveStatus,

          rawCheckStatus:
            check
              .rawCheckStatus ||
            null,

          transitioned,

          consecutiveFailures:
            check
              .consecutiveFailures ??
            null,

          consecutiveSuccesses:
            check
              .consecutiveSuccesses ??
            null,

          consecutiveFailureThreshold:
            monitor
              .consecutiveFailureThreshold,

          recoverySuccessThreshold:
            monitor
              .recoverySuccessThreshold,
        },
      },

      /*
       * Raw evidence is retained for investigation but remains
       * separated from canonical normalized fields.
       */
      rawPayload: {
        status:
          check.status,

        rawCheckStatus:
          check
            .rawCheckStatus ||
          null,

        previousStatus:
          check
            .previousStatus ||
          null,

        transitioned,

        statusCode:
          check
            .statusCode ??
          null,

        responseTimeMs:
          check
            .responseTimeMs ??
          null,

        responseSizeBytes:
          check
            .responseSizeBytes ??
          null,

        dnsTimeMs:
          check
            .dnsTimeMs ??
          null,

        tcpTimeMs:
          check
            .tcpTimeMs ??
          null,

        tlsTimeMs:
          check
            .tlsTimeMs ??
          null,

        firstByteTimeMs:
          check
            .firstByteTimeMs ??
          null,

        sslValid:
          check
            .sslValid ??
          null,

        sslDaysRemaining:
          check
            .sslDaysRemaining ??
          null,

        contentMatched:
          check
            .contentMatched ??
          null,

        redirectCount:
          check
            .redirectCount ??
          0,

        errorCode:
          check
            .errorCode ||
          null,

        sanitizedErrorMessage:
          check
            .sanitizedErrorMessage ||
          null,

        checkerRegion:
          check
            .checkerRegion ||
          null,

        checkedAt,
      },
    };

    const canonicalContext = {
      organizationId:
        monitor
          .organizationId,

      environmentId:
        monitor
          .environmentId,

      tenantId:
        monitor
          .tenantId,

      serviceId:
        monitor
          .serviceId,

      monitorId:
        monitor._id,

      monitorName:
        monitor.name,

      serviceName:
        monitor.name,

      host:
        this
          .extractHost(
            monitor.url
          ),
    };

    return this
      .ingest(
        canonicalInput,
        canonicalContext,
        options
      );
  }

  // ==========================================================================
  // MONITOR SEVERITY
  // ==========================================================================

  monitorSeverity(
    check
  ) {
    const errorCode =
      String(
        check
          ?.errorCode ||
        ""
      )
        .trim()
        .toUpperCase();

    /*
     * Hard availability / connectivity failures.
     */
    if (
      [
        "ENOTFOUND",
        "EAI_AGAIN",
        "ECONNREFUSED",
        "ECONNRESET",
        "ETIMEDOUT",
        "CERT_HAS_EXPIRED",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        "DEPTH_ZERO_SELF_SIGNED_CERT",
      ].includes(
        errorCode
      )
    ) {
      return "critical";
    }

    const statusCode =
      Number(
        check
          ?.statusCode
      );

    /*
     * Server failures are generally critical availability evidence.
     */
    if (
      Number.isFinite(
        statusCode
      ) &&
      statusCode >=
        500
    ) {
      return "critical";
    }

    /*
     * Degraded SSL, 4xx, content mismatch and other conditions
     * remain warnings unless correlation later escalates them.
     */
    return "warning";
  }

  // ==========================================================================
  // QUERY BY ID
  // ==========================================================================

  async getById(
    context,
    signalId
  ) {
    if (
      !context
        ?.organizationId ||
      !context
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Complete signal query context is required"
        ),
        {
          code:
            "SIGNAL_QUERY_CONTEXT_REQUIRED",
        }
      );
    }

    return Signal
      .findOne({
        organizationId:
          context
            .organizationId,

        environmentId:
          context
            .environmentId,

        signalId,
      })
      .lean();
  }

  // ==========================================================================
  // LIST
  // ==========================================================================

  async list(
    context,
    query = {}
  ) {
    if (
      !context
        ?.organizationId ||
      !context
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Complete signal query context is required"
        ),
        {
          code:
            "SIGNAL_QUERY_CONTEXT_REQUIRED",
        }
      );
    }

    const filter = {
      organizationId:
        context
          .organizationId,

      environmentId:
        context
          .environmentId,
    };

    if (
      query.provider
    ) {
      filter.provider =
        query.provider;
    }

    if (
      query.signalType
    ) {
      filter.signalType =
        query.signalType;
    }

    if (
      query.severity
    ) {
      filter.severity =
        query.severity;
    }

    if (
      query.processingStatus
    ) {
      filter.processingStatus =
        query
          .processingStatus;
    }

    if (
      query.serviceId
    ) {
      filter.serviceId =
        query.serviceId;
    }

    if (
      query.monitorId
    ) {
      filter.monitorId =
        query.monitorId;
    }

    if (
      query.incidentId
    ) {
      filter.incidentId =
        query.incidentId;
    }

    if (
      query.incidentCandidate !==
      undefined
    ) {
      filter.incidentCandidate =
        query
          .incidentCandidate ===
          true ||
        query
          .incidentCandidate ===
          "true";
    }

    if (
      query.correlationGroupId
    ) {
      filter.correlationGroupId =
        query
          .correlationGroupId;
    }

    if (
      query.eventType
    ) {
      filter.eventType =
        query.eventType;
    }

    if (
      query.from ||
      query.to
    ) {
      filter.observedAt =
        {};

      if (
        query.from
      ) {
        const from =
          new Date(
            query.from
          );

        if (
          Number.isNaN(
            from.getTime()
          )
        ) {
          throw Object.assign(
            new Error(
              "Invalid signal query from date"
            ),
            {
              code:
                "SIGNAL_QUERY_DATE_INVALID",

              status:
                400,
            }
          );
        }

        filter
          .observedAt
          .$gte =
          from;
      }

      if (
        query.to
      ) {
        const to =
          new Date(
            query.to
          );

        if (
          Number.isNaN(
            to.getTime()
          )
        ) {
          throw Object.assign(
            new Error(
              "Invalid signal query to date"
            ),
            {
              code:
                "SIGNAL_QUERY_DATE_INVALID",

              status:
                400,
            }
          );
        }

        filter
          .observedAt
          .$lte =
          to;
      }
    }

    const limit =
      Math.min(
        Math.max(
          Number.parseInt(
            query.limit,
            10
          ) ||
          100,
          1
        ),
        500
      );

    return Signal
      .find(
        filter
      )
      .sort({
        observedAt:
          -1,
      })
      .limit(
        limit
      )
      .lean();
  }

  // ==========================================================================
  // SAFE ERROR MESSAGE
  // ==========================================================================

  safeErrorMessage(
    error
  ) {
    return String(
      error
        ?.message ||
      "Signal processing failed"
    )
      .slice(
        0,
        2048
      );
  }

  // ==========================================================================
  // HOST EXTRACTION
  // ==========================================================================

  extractHost(
    url
  ) {
    if (
      !url
    ) {
      return null;
    }

    try {
      return new URL(
        url
      )
        .hostname;
    } catch {
      return null;
    }
  }
}

module.exports =
  new SignalIngestionService();

module.exports
  .SignalIngestionService =
  SignalIngestionService;