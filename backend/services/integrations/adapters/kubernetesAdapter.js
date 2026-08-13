"use strict";

const k8s =
  require(
    "@kubernetes/client-node"
  );

const {
  makeStubAdapter,
  UnsupportedOperationError,
} =
  require(
    "../adapterInterface"
  );

const PROVIDER =
  "kubernetes";

const CAPABILITIES = [
  "get_health",
  "discover_resources",
  "revoke",
];

const adapter = {
  ...makeStubAdapter(
    PROVIDER,
    CAPABILITIES
  ),

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  async validateConfiguration(
    config = {}
  ) {
    const errors = [];

    if (
      !config ||
      typeof config !==
        "object" ||
      Array.isArray(
        config
      )
    ) {
      return {
        valid:
          false,

        errors: [
          "Configuration must be an object",
        ],
      };
    }

    const authMode =
      config.authMode ||
      "kubeconfig";

    if (
      ![
        "kubeconfig",
        "in_cluster",
      ].includes(
        authMode
      )
    ) {
      errors.push(
        'authMode must be either "kubeconfig" or "in_cluster"'
      );
    }

    if (
      config.allowedNamespaces !==
        undefined &&
      !Array.isArray(
        config.allowedNamespaces
      )
    ) {
      errors.push(
        "allowedNamespaces must be an array"
      );
    }

    if (
      Array.isArray(
        config.allowedNamespaces
      )
    ) {
      const invalidNamespace =
        config.allowedNamespaces
          .some(
            (namespace) =>
              typeof namespace !==
                "string" ||
              !namespace.trim()
          );

      if (
        invalidNamespace
      ) {
        errors.push(
          "allowedNamespaces entries must be non-empty strings"
        );
      }

      if (
        config.allowedNamespaces
          .length > 500
      ) {
        errors.push(
          "allowedNamespaces cannot contain more than 500 entries"
        );
      }
    }

    if (
      config.clusterName !==
        undefined &&
      (
        typeof config.clusterName !==
          "string" ||
        !config.clusterName
          .trim()
      )
    ) {
      errors.push(
        "clusterName must be a non-empty string"
      );
    }

    return {
      valid:
        errors.length ===
        0,

      errors,
    };
  },

  // ==========================================================================
  // CONNECTION TEST
  // ==========================================================================

  async testConnection(
    connection
  ) {
    const startedAt =
      Date.now();

    try {
      const kc =
        buildKubeConfig(
          connection
        );

      const versionApi =
        kc.makeApiClient(
          k8s.VersionApi
        );

      const response =
        await versionApi
          .getCode();

      const version =
        response?.body ||
        response ||
        {};

      const gitVersion =
        version.gitVersion ||
        version.git_version ||
        "unknown";

      return {
        success:
          true,

        provider:
          PROVIDER,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          `Connected to Kubernetes ${gitVersion}`,

        metadata: {
          version:
            gitVersion,

          major:
            version.major ||
            null,

          minor:
            version.minor ||
            null,

          platform:
            version.platform ||
            null,
        },
      };
    } catch (error) {
      return {
        success:
          false,

        provider:
          PROVIDER,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          error.message,

        code:
          error.code ||
          "KUBERNETES_CONNECTION_FAILED",
      };
    }
  },

  // ==========================================================================
  // HEALTH
  // ==========================================================================

  async getHealth(
    connection
  ) {
    const result =
      await this
        .testConnection(
          connection
        );

    return {
      status:
        result.success
          ? "healthy"
          : "unhealthy",

      latencyMs:
        result.latencyMs,

      detail:
        result.detail,

      metadata:
        result.metadata ||
        null,
    };
  },

  // ==========================================================================
  // DISCOVERY
  // ==========================================================================

  async discoverResources(
    connection
  ) {
    /*
     * This adapter intentionally exposes only the capability boundary.
     *
     * Actual normalized persistence continues to live in:
     *
     * kubernetesDiscoveryService
     * kubernetesInventoryService
     * kubernetesRelationshipService
     *
     * This avoids duplicating Concept 2 logic inside the adapter.
     */

    const kc =
      buildKubeConfig(
        connection
      );

    /*
     * Validate the credential here and return the context
     * needed by the dedicated discovery layer.
     */
    const versionApi =
      kc.makeApiClient(
        k8s.VersionApi
      );

    const response =
      await versionApi
        .getCode();

    const version =
      response?.body ||
      response ||
      {};

    return {
      provider:
        PROVIDER,

      ready:
        true,

      metadata: {
        version:
          version.gitVersion ||
          version.git_version ||
          "unknown",
      },
    };
  },

  // ==========================================================================
  // REVOCATION
  // ==========================================================================

  async revoke(
    _connection
  ) {
    /*
     * AIRA does not own the underlying Kubernetes credential.
     *
     * Disabling/removing the integration prevents AIRA from
     * using it, but remote credential deletion belongs to the
     * Kubernetes administrator.
     */

    return {
      success:
        true,

      remoteRevocationRequired:
        false,
    };
  },
};

// ============================================================================
// KUBECONFIG
// ============================================================================

function buildKubeConfig(
  connection
) {
  if (!connection) {
    throw Object.assign(
      new Error(
        "Kubernetes integration connection is required"
      ),
      {
        code:
          "KUBERNETES_CONNECTION_REQUIRED",
      }
    );
  }

  const config =
    connection
      .nonSecretConfig ||
    {};

  const authMode =
    config.authMode ||
    "kubeconfig";

  const kc =
    new k8s.KubeConfig();

  if (
    authMode ===
    "in_cluster"
  ) {
    try {
      kc.loadFromCluster();
    } catch (error) {
      throw Object.assign(
        new Error(
          `Unable to load in-cluster Kubernetes configuration: ${error.message}`
        ),
        {
          code:
            "KUBERNETES_IN_CLUSTER_CONFIG_FAILED",
        }
      );
    }

    return kc;
  }

  if (
    authMode !==
    "kubeconfig"
  ) {
    throw Object.assign(
      new Error(
        `Unsupported Kubernetes authentication mode: ${authMode}`
      ),
      {
        code:
          "KUBERNETES_AUTH_MODE_UNSUPPORTED",
      }
    );
  }

  const rawKubeconfig =
    connection
      ._decryptedSecret;

  if (
    !rawKubeconfig ||
    typeof rawKubeconfig !==
      "string"
  ) {
    throw Object.assign(
      new Error(
        "Kubernetes kubeconfig secret is missing"
      ),
      {
        code:
          "KUBERNETES_SECRET_MISSING",
      }
    );
  }

  try {
    kc.loadFromString(
      rawKubeconfig
    );
  } catch (error) {
    throw Object.assign(
      new Error(
        `Invalid Kubernetes kubeconfig: ${error.message}`
      ),
      {
        code:
          "KUBERNETES_KUBECONFIG_INVALID",
      }
    );
  }

  return kc;
}

// ============================================================================
// EXPLICIT UNSUPPORTED OPERATIONS
// ============================================================================

adapter.receiveEvent =
  async function receiveEvent() {
    throw new UnsupportedOperationError(
      PROVIDER,
      "receiveEvent"
    );
  };

adapter.normalizeEvent =
  function normalizeEvent() {
    throw new UnsupportedOperationError(
      PROVIDER,
      "normalizeEvent"
    );
  };

adapter.sendNotification =
  async function sendNotification() {
    throw new UnsupportedOperationError(
      PROVIDER,
      "sendNotification"
    );
  };

adapter.queryMetrics =
  async function queryMetrics() {
    throw new UnsupportedOperationError(
      PROVIDER,
      "queryMetrics"
    );
  };

adapter.queryLogs =
  async function queryLogs() {
    throw new UnsupportedOperationError(
      PROVIDER,
      "queryLogs"
    );
  };

adapter.queryTraces =
  async function queryTraces() {
    throw new UnsupportedOperationError(
      PROVIDER,
      "queryTraces"
    );
  };

// ============================================================================
// EXPORTS
// ============================================================================

adapter.buildKubeConfig =
  buildKubeConfig;

module.exports =
  adapter;