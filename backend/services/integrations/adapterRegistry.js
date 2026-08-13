"use strict";

const {
  UnsupportedOperationError,
  validateAdapterContract,
  normalizeCapabilities,
} =
  require(
    "./adapterInterface"
  );

const {
  findDefinition,
} =
  require(
    "../../config/integrationCatalogue"
  );

const ADAPTERS =
  Object.freeze({
    webhook_incoming:
      require(
        "./adapters/webhookIncomingAdapter"
      ),

    webhook_outgoing:
      require(
        "./adapters/webhookOutgoingAdapter"
      ),

    prometheus_alertmanager:
      require(
        "./adapters/prometheusAlertmanagerAdapter"
      ),

    grafana_alerting:
      require(
        "./adapters/grafanaAlertingAdapter"
      ),

    opentelemetry:
      require(
        "./adapters/opentelemetryAdapter"
      ),

    kubernetes:
      require(
        "./adapters/kubernetesAdapter"
      ),

    datadog:
      require(
        "./adapters/datadogAdapter"
      ),

    aws_cloudwatch:
      require(
        "./adapters/awsCloudWatchAdapter"
      ),

    azure_monitor:
      require(
        "./adapters/azureMonitorAdapter"
      ),

    gcp_monitoring:
      require(
        "./adapters/gcpMonitoringAdapter"
      ),
  });
// ============================================================================
// ADAPTER VALIDATION
// ============================================================================

function validateAdapter(
  provider,
  adapter
) {
  const result =
    validateAdapterContract(
      adapter
    );

  if (!result.valid) {
    throw Object.assign(
      new Error(
        `Integration adapter "${provider}" violates the adapter contract: ${result.errors.join(
          "; "
        )}`
      ),
      {
        code:
          "INCOMPLETE_INTEGRATION_ADAPTER",

        provider,

        contractErrors:
          result.errors,
      }
    );
  }

  if (
    adapter.provider !==
    provider
  ) {
    throw Object.assign(
      new Error(
        `Adapter provider mismatch: registry="${provider}", adapter="${adapter.provider}"`
      ),
      {
        code:
          "INTEGRATION_ADAPTER_PROVIDER_MISMATCH",

        registryProvider:
          provider,

        adapterProvider:
          adapter.provider,
      }
    );
  }

  const capabilities =
    normalizeCapabilities(
      adapter.capabilities
    );

  /*
   * Available providers must agree with the product catalogue.
   */
  const definition =
    findDefinition(
      provider
    );

  if (
    definition &&
    definition
      .availabilityStatus ===
      "available"
  ) {
    const catalogueCapabilities =
      [
        ...definition
          .capabilities,
      ].sort();

    const adapterCapabilities =
      [
        ...capabilities,
      ].sort();

    if (
      JSON.stringify(
        catalogueCapabilities
      ) !==
      JSON.stringify(
        adapterCapabilities
      )
    ) {
      throw Object.assign(
        new Error(
          `Adapter capabilities for "${provider}" do not match the integration catalogue`
        ),
        {
          code:
            "INTEGRATION_CAPABILITY_MISMATCH",

          provider,

          catalogueCapabilities,

          adapterCapabilities,
        }
      );
    }
  }

  return adapter;
}

// ============================================================================
// RESOLVE ADAPTER
// ============================================================================

function getAdapter(
  provider
) {
  if (
    !provider ||
    typeof provider !==
      "string"
  ) {
    throw new UnsupportedOperationError(
      String(
        provider ||
        "unknown"
      ),
      "getAdapter"
    );
  }

  const normalized =
    provider
      .trim()
      .toLowerCase();

  const adapter =
    ADAPTERS[
      normalized
    ];

  if (!adapter) {
    throw new UnsupportedOperationError(
      normalized,
      "getAdapter"
    );
  }

  return validateAdapter(
    normalized,
    adapter
  );
}

// ============================================================================
// REGISTRY INTROSPECTION
// ============================================================================

function hasAdapter(
  provider
) {
  if (
    !provider ||
    typeof provider !==
      "string"
  ) {
    return false;
  }

  const normalized =
    provider
      .trim()
      .toLowerCase();

  return Boolean(
    ADAPTERS[
      normalized
    ]
  );
}

function getRegisteredProviders() {
  return Object.keys(
    ADAPTERS
  );
}

function getAdapterCapabilities(
  provider
) {
  const adapter =
    getAdapter(
      provider
    );

  return adapter
    .getCapabilities();
}

function supportsCapability(
  provider,
  capability
) {
  if (
    !capability ||
    typeof capability !==
      "string"
  ) {
    return false;
  }

  try {
    return getAdapterCapabilities(
      provider
    ).includes(
      capability
    );
  } catch {
    return false;
  }
}

function requireCapability(
  provider,
  capability
) {
  const adapter =
    getAdapter(
      provider
    );

  if (
    !adapter
      .getCapabilities()
      .includes(
        capability
      )
  ) {
    throw new UnsupportedOperationError(
      provider,
      capability
    );
  }

  return adapter;
}

// ============================================================================
// REGISTRY VALIDATION
// ============================================================================

function validateRegistry() {
  const results = [];

  for (
    const [
      provider,
      adapter,
    ]
    of Object.entries(
      ADAPTERS
    )
  ) {
    try {
      validateAdapter(
        provider,
        adapter
      );

      results.push({
        provider,

        valid:
          true,

        capabilities:
          adapter
            .getCapabilities(),
      });
    } catch (error) {
      results.push({
        provider,

        valid:
          false,

        error:
          error.message,

        code:
          error.code ||
          "ADAPTER_VALIDATION_FAILED",
      });
    }
  }

  return results;
}

function assertRegistryValid() {
  const results =
    validateRegistry();

  const invalid =
    results.filter(
      (result) =>
        !result.valid
    );

  if (
    invalid.length >
    0
  ) {
    throw Object.assign(
      new Error(
        `Integration adapter registry contains ${invalid.length} invalid adapter(s)`
      ),
      {
        code:
          "INTEGRATION_REGISTRY_INVALID",

        adapters:
          invalid,
      }
    );
  }

  return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ADAPTERS,

  getAdapter,

  hasAdapter,

  getRegisteredProviders,

  getAdapterCapabilities,

  supportsCapability,

  requireCapability,

  validateRegistry,

  assertRegistryValid,
};