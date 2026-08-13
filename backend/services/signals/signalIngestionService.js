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

          routing:
            {
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
       * Refresh once more because group service adds
       * correlationGroupId / candidate status.
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
    } catch (error) {
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
          result.duplicate
        ) {
          duplicates +=
            1;
        } else {
          accepted +=
            1;
        }
      } catch (error) {
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
    if (!monitor) {
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

    return this
      .ingest(
        {
          provider:
            "monitor",

          ...check,
        },
        {
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
            null,

          host:
            this
              .extractHost(
                monitor.url
              ),
        },
        options
      );
  }

  // ==========================================================================
  // QUERY
  // ==========================================================================

  async getById(
    context,
    signalId
  ) {
    return Signal
      .findOne({
        organizationId:
          context.organizationId,

        environmentId:
          context.environmentId,

        signalId,
      })
      .lean();
  }

  async list(
    context,
    query = {}
  ) {
    const filter = {
      organizationId:
        context.organizationId,

      environmentId:
        context.environmentId,
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
      query.incidentCandidate !==
      undefined
    ) {
      filter.incidentCandidate =
        query.incidentCandidate ===
          true ||
        query.incidentCandidate ===
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
      query.from ||
      query.to
    ) {
      filter.observedAt =
        {};

      if (
        query.from
      ) {
        filter
          .observedAt
          .$gte =
          new Date(
            query.from
          );
      }

      if (
        query.to
      ) {
        filter
          .observedAt
          .$lte =
          new Date(
            query.to
          );
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
  // HELPERS
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

  extractHost(
    url
  ) {
    try {
      return new URL(
        url
      ).hostname;
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