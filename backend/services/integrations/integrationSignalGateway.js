"use strict";

/**
 * ============================================================================
 * AIRA PHASE 20.8
 * INTEGRATION SIGNAL GATEWAY
 * ============================================================================
 *
 * Canonical path:
 *
 * Provider
 *    ↓
 * IntegrationRuntime.receiveSignals()
 *    ↓
 * Provider normalization
 *    ↓
 * IntegrationSignalGateway
 *    ↓
 * Existing AIRA SignalIngestionService
 *    ↓
 * normalize
 * deduplicate
 * enrich
 * PostgreSQL signals.signals
 * correlate
 * route
 *
 * Architectural laws:
 *
 * - Phase 20 does not create a second signal store.
 * - PostgreSQL-backed canonical signal infrastructure remains authoritative.
 * - Provider-specific payloads are normalized before entering AIRA Core.
 * - Integration results cannot authorize execution.
 * - Duplicate handling remains the responsibility of the canonical signal
 *   ingestion pipeline.
 * - A provider cannot override tenant ownership from the invocation context.
 * ============================================================================
 */

const signalIngestionService =
  require(
    "../signals/signalIngestionService"
  );

const {
  IntegrationRuntime,
} =
  require(
    "./integrationRuntime"
  );


const DEFAULT_MAX_SIGNALS_PER_INVOCATION =
  100;


class IntegrationSignalGateway {
  constructor(
    options = {}
  ) {
    this.runtime =
      options.runtime ||
      new IntegrationRuntime(
        options
      );


    this.signalIngestionService =
      options
        .signalIngestionService ||
      signalIngestionService;


    this.maxSignalsPerInvocation =
      normalizePositiveInteger(
        options.maxSignalsPerInvocation,
        DEFAULT_MAX_SIGNALS_PER_INVOCATION
      );
  }


  async receiveSignals({
    organizationId,

    environmentId,

    tenantId =
      null,

    integrationId,

    provider,

    payload,

    headers =
      {},

    serviceId =
      null,

    correlationId =
      null,

    ingestionOptions =
      {},
  } = {}) {
    const context = {
      organizationId,

      environmentId,

      integrationId,

      provider,

      executionAuthorized:
        false,
    };


    const providerResult =
      await this.runtime
        .receiveSignals(
          context,
          payload,
          headers
        );


    if (
      providerResult
        ?.executionAuthorized ===
      true
    ) {
      throw gatewayError(
        "Integration runtime illegally returned execution authorization",
        "INTEGRATION_SIGNAL_AUTHORITY_VIOLATION"
      );
    }


    const normalizedEvents =
      normalizeProviderEvents(
        providerResult?.data
      );


    if (
      normalizedEvents.length >
      this.maxSignalsPerInvocation
    ) {
      throw gatewayError(
        `Provider produced ${normalizedEvents.length} signals; maximum allowed per invocation is ${this.maxSignalsPerInvocation}`,
        "INTEGRATION_SIGNAL_BATCH_TOO_LARGE",
        {
          received:
            normalizedEvents.length,

          maximum:
            this.maxSignalsPerInvocation,
        }
      );
    }


    const canonicalTenantId =
      tenantId ||
      organizationId;


    const ingestionResults =
      [];


    let accepted =
      0;

    let duplicates =
      0;

    let failed =
      0;


    for (
      let index = 0;
      index <
      normalizedEvents.length;
      index++
    ) {
      const providerEvent =
        normalizedEvents[
          index
        ];


      const signalInput =
        buildCanonicalSignalInput({
          providerEvent,

          organizationId,

          environmentId,

          tenantId:
            canonicalTenantId,

          integrationId,

          provider,

          serviceId,

          correlationId,

          providerResult,

          eventIndex:
            index,
        });


      try {
        const ingestion =
          await this
            .signalIngestionService
            .ingest(
              signalInput,

              {
                organizationId,

                environmentId,

                tenantId:
                  canonicalTenantId,

                integrationId,

                integrationConnectionId:
                  integrationId,

                provider,

                source:
                  provider ===
                  "opentelemetry"
                    ? "telemetry"
                    : "integration",

                serviceId,

                correlationId,

                executionAuthorized:
                  false,
              },

              ingestionOptions
            );


        if (
          ingestion
            ?.duplicate ===
          true
        ) {
          duplicates +=
            1;
        } else if (
          ingestion
            ?.accepted ===
          true
        ) {
          accepted +=
            1;
        }


        ingestionResults.push({
          index,

          accepted:
            ingestion
              ?.accepted ===
            true,

          duplicate:
            ingestion
              ?.duplicate ===
            true,

          signal:
            ingestion
              ?.signal ||
            null,

          correlation:
            ingestion
              ?.correlation ||
            null,

          correlationGroup:
            ingestion
              ?.correlationGroup ||
            null,

          routing:
            ingestion
              ?.routing ||
            null,

          executionAuthorized:
            false,
        });
      } catch (
        error
      ) {
        failed +=
          1;


        ingestionResults.push({
          index,

          accepted:
            false,

          duplicate:
            false,

          signal:
            null,

          error: {
            code:
              error?.code ||
              "SIGNAL_INGESTION_FAILED",

            message:
              safeErrorMessage(
                error
              ),
          },

          executionAuthorized:
            false,
        });
      }
    }


    return {
      provider,

      integrationId,

      received:
        normalizedEvents.length,

      accepted,

      duplicates,

      failed,

      results:
        ingestionResults,

      providerProvenance:
        sanitizeProvenance(
          providerResult
            ?.provenance
        ),

      executionAuthorized:
        false,
    };
  }
}


function normalizeProviderEvents(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return [];
  }


  const candidates =
    Array.isArray(
      value
    )
      ? value
      : [
          value,
        ];


  return candidates.filter(
    (
      event
    ) =>
      event &&
      typeof event ===
        "object" &&
      !Array.isArray(
        event
      )
  );
}


function buildCanonicalSignalInput({
  providerEvent,

  organizationId,

  environmentId,

  tenantId,

  integrationId,

  provider,

  serviceId,

  correlationId,

  providerResult,

  eventIndex,
}) {
  /*
   * Scope fields are intentionally written AFTER provider data.
   *
   * A provider payload must not be able to move a signal into another
   * organization/environment.
   */
  return {
    ...providerEvent,

    provider,

    organizationId,

    environmentId,

    tenantId,

    integrationId,

    integrationConnectionId:
      integrationId,

    serviceId:
      serviceId ||
      providerEvent
        .serviceId ||
      null,

    correlationId:
      correlationId ||
      providerEvent
        .correlationId ||
      null,

    receivedAt:
      providerEvent
        .receivedAt ||
      new Date(),

    metadata: {
      ...safeObject(
        providerEvent
          .metadata
      ),

      integration: {
        integrationId,

        provider,

        invocationId:
          providerResult
            ?.provenance
            ?.invocationId ||
          null,

        eventIndex,

        executionAuthorized:
          false,
      },
    },
  };
}


function sanitizeProvenance(
  provenance
) {
  if (
    !provenance ||
    typeof provenance !==
      "object" ||
    Array.isArray(
      provenance
    )
  ) {
    return {};
  }


  return {
    invocationId:
      provenance
        .invocationId ||
      null,

    integrationPublicId:
      provenance
        .integrationPublicId ||
      null,

    integrationCanonicalId:
      provenance
        .integrationCanonicalId ||
      null,

    provider:
      provenance
        .provider ||
      null,

    startedAt:
      provenance
        .startedAt ||
      null,

    finishedAt:
      provenance
        .finishedAt ||
      null,

    durationMs:
      provenance
        .durationMs ??
      null,

    executionAuthorized:
      false,
  };
}


function safeObject(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return {};
  }


  return {
    ...value,
  };
}


function safeErrorMessage(
  error
) {
  const message =
    String(
      error?.message ||
      "Signal ingestion failed"
    );


  return message
    .replace(
      /(?:password|secret|token|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi,
      "[REDACTED]"
    )
    .slice(
      0,
      1000
    );
}


function normalizePositiveInteger(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <=
      0
  ) {
    return fallback;
  }


  return parsed;
}


function gatewayError(
  message,
  code,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "IntegrationSignalGatewayError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  IntegrationSignalGateway,

  DEFAULT_MAX_SIGNALS_PER_INVOCATION,

  normalizeProviderEvents,

  buildCanonicalSignalInput,
};