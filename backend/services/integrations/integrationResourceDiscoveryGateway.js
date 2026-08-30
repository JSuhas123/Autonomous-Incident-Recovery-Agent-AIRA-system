"use strict";

/**
 * ============================================================================
 * AIRA PHASE 20.10
 * RESOURCE DISCOVERY → PHASE 17
 * ============================================================================
 *
 * Provider
 *    ↓
 * IntegrationRuntime.discoverResources()
 *    ↓
 * Integration discovery normalization
 *    ↓
 * ResourceStateIngestionService.ingestNormalized()
 *    ↓
 * Phase 17 canonical PostgreSQL Resource + immutable ResourceState
 *
 * There is intentionally NO Phase 20 resource database.
 * ============================================================================
 */

const {
  IntegrationRuntime,
} =
  require(
    "./integrationRuntime"
  );

const ResourceStateIngestionService =
  require(
    "../topology/ResourceStateIngestionService"
  );

const {
  normalizeDiscoveredResource,

  extractProviderResources,
} =
  require(
    "./integrationDiscoveryNormalizer"
  );


const DEFAULT_DISCOVERY_BATCH_LIMIT =
  500;


class IntegrationResourceDiscoveryGateway {
  constructor(
    options = {}
  ) {
    this.runtime =
      options.runtime ||
      new IntegrationRuntime(
        options
      );


    this.resourceStateIngestionService =
      options
        .resourceStateIngestionService ||
      new ResourceStateIngestionService(
        options
      );


    this.maxResources =
      normalizePositiveInteger(
        options.maxResources,
        DEFAULT_DISCOVERY_BATCH_LIMIT
      );
  }


  async discoverResources({
    organizationId,

    environmentId,

    integrationId,

    provider,

    options =
      {},
  } = {}) {
    requireContext({
      organizationId,

      environmentId,

      integrationId,

      provider,
    });


    const runtimeResult =
      await this.runtime
        .discoverResources(
          {
            organizationId,

            environmentId,

            integrationId,

            provider,

            executionAuthorized:
              false,
          },

          options
        );


    if (
      runtimeResult
        ?.executionAuthorized ===
      true
    ) {
      throw discoveryError(
        "Resource discovery cannot grant execution authorization",
        "INTEGRATION_DISCOVERY_AUTHORITY_VIOLATION"
      );
    }


    const rawResources =
      extractProviderResources(
        provider,
        runtimeResult
          ?.data
      );


    return this.persistProviderResources({
      organizationId,

      environmentId,

      integrationId,

      provider,

      rawResources,

      observedAt:
        runtimeResult
          ?.observedAt ||
        new Date(),

      provenance:
        runtimeResult
          ?.provenance ||
        {},
    });
  }


  async persistProviderResources({
    organizationId,

    environmentId,

    integrationId,

    provider,

    rawResources =
      [],

    observedAt =
      new Date(),

    provenance =
      {},
  } = {}) {
    requireContext({
      organizationId,

      environmentId,

      integrationId,

      provider,
    });


    if (
      !Array.isArray(
        rawResources
      )
    ) {
      throw discoveryError(
        "Discovered resources must be an array",
        "INTEGRATION_DISCOVERY_RESOURCES_INVALID"
      );
    }


    if (
      rawResources.length >
      this.maxResources
    ) {
      throw discoveryError(
        `Resource discovery returned ${rawResources.length} resources; maximum is ${this.maxResources}`,
        "INTEGRATION_DISCOVERY_BATCH_TOO_LARGE",
        {
          count:
            rawResources.length,

          maximum:
            this.maxResources,
        }
      );
    }


    const results =
      [];


    let persisted =
      0;

    let created =
      0;

    let updated =
      0;

    let skipped =
      0;

    let failed =
      0;


    for (
      let index = 0;
      index <
      rawResources.length;
      index++
    ) {
      const rawResource =
        rawResources[
          index
        ];


      try {
        const normalized =
          normalizeDiscoveredResource({
            organizationId,

            environmentId,

            integrationId,

            provider,

            rawResource,

            observedAt,
          });


        const ingestion =
          await this
            .resourceStateIngestionService
            .ingestNormalized(
              normalized
            );


        persisted +=
          1;


        if (
          ingestion
            .resourceCreated
        ) {
          created +=
            1;
        } else {
          updated +=
            1;
        }


        results.push({
          index,

          status:
            ingestion
              .resourceCreated
              ? "CREATED"
              : "UPDATED",

          resource:
            ingestion
              .resource,

          state:
            ingestion
              .state,

          fingerprint:
            ingestion
              .fingerprint,

          executionAuthorized:
            false,
        });
      } catch (
        error
      ) {
        if (
          error?.code ===
          "INTEGRATION_DISCOVERY_NOT_RESOURCE_INSTANCE"
        ) {
          skipped +=
            1;


          results.push({
            index,

            status:
              "SKIPPED",

            reason:
              error.code,

            executionAuthorized:
              false,
          });


          continue;
        }


        failed +=
          1;


        results.push({
          index,

          status:
            "FAILED",

          error: {
            code:
              error?.code ||
              "INTEGRATION_RESOURCE_PERSISTENCE_FAILED",

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

      discovered:
        rawResources.length,

      persisted,

      created,

      updated,

      skipped,

      failed,

      resources:
        results,

      provenance:
        safeProvenance(
          provenance
        ),

      canonicalAuthority:
        "PHASE_17_POSTGRESQL_RESOURCE_GRAPH",

      executionAuthorized:
        false,
    };
  }
}


function requireContext(
  input
) {
  for (
    const field
    of [
      "organizationId",

      "environmentId",

      "integrationId",

      "provider",
    ]
  ) {
    if (
      !input[
        field
      ]
    ) {
      throw discoveryError(
        `${field} is required for resource discovery`,
        "INTEGRATION_DISCOVERY_CONTEXT_REQUIRED",
        {
          field,
        }
      );
    }
  }
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


function safeProvenance(
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
    return {
      executionAuthorized:
        false,
    };
  }


  return {
    invocationId:
      value.invocationId ||
      null,

    integrationPublicId:
      value.integrationPublicId ||
      null,

    integrationCanonicalId:
      value.integrationCanonicalId ||
      null,

    provider:
      value.provider ||
      null,

    startedAt:
      value.startedAt ||
      null,

    finishedAt:
      value.finishedAt ||
      null,

    durationMs:
      value.durationMs ??
      null,

    executionAuthorized:
      false,
  };
}


function safeErrorMessage(
  error
) {
  return String(
    error?.message ||
    "Resource discovery failed"
  )
    .replace(
      /(?:password|secret|token|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi,
      "[REDACTED]"
    )
    .slice(
      0,
      1000
    );
}


function discoveryError(
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
        "IntegrationResourceDiscoveryError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  IntegrationResourceDiscoveryGateway,

  DEFAULT_DISCOVERY_BATCH_LIMIT,
};