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


const {
  INTEGRATION_CAPABILITY,
} =
  require(
    "../../../constants/integrationPlatform"
  );


const PROVIDER =
  "kubernetes";


const EXECUTION_CAPABILITY =
  Object.freeze({
    RESTART_DEPLOYMENT:
      "kubernetes.restartDeployment",
  });


const CAPABILITIES = [
  INTEGRATION_CAPABILITY
    .HEALTH_CHECK,

  INTEGRATION_CAPABILITY
    .DISCOVER_RESOURCES,

  INTEGRATION_CAPABILITY
    .EXECUTE_CAPABILITY,

  INTEGRATION_CAPABILITY
    .REVOKE,
];


const STRATEGIC_MERGE_PATCH =
  k8s
    ?.PatchUtils
    ?.PATCH_FORMAT_STRATEGIC_MERGE_PATCH ||
  "application/strategic-merge-patch+json";


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
    const errors =
      [];


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
        config
          .allowedNamespaces
          .some(
            namespace =>
              typeof namespace !==
                "string" ||
              !namespace
                .trim()
          );


      if (
        invalidNamespace
      ) {
        errors.push(
          "allowedNamespaces entries must be non-empty strings"
        );
      }


      if (
        config
          .allowedNamespaces
          .length >
        500
      ) {
        errors.push(
          "allowedNamespaces cannot contain more than 500 entries"
        );
      }
    }


    if (
      config
        .allowedExecutionCapabilities !==
        undefined &&
      !Array.isArray(
        config
          .allowedExecutionCapabilities
      )
    ) {
      errors.push(
        "allowedExecutionCapabilities must be an array"
      );
    }


    if (
      Array.isArray(
        config
          .allowedExecutionCapabilities
      )
    ) {
      const supported =
        new Set(
          Object.values(
            EXECUTION_CAPABILITY
          )
        );


      for (
        const capability
        of config
          .allowedExecutionCapabilities
      ) {
        if (
          !supported.has(
            capability
          )
        ) {
          errors.push(
            `Unsupported Kubernetes execution capability: ${capability}`
          );
        }
      }
    }


    if (
      config.allowedDeployments !==
        undefined &&
      !Array.isArray(
        config.allowedDeployments
      )
    ) {
      errors.push(
        "allowedDeployments must be an array"
      );
    }


    if (
      Array.isArray(
        config.allowedDeployments
      )
    ) {
      const invalid =
        config
          .allowedDeployments
          .some(
            value =>
              typeof value !==
                "string" ||
              !value
                .trim()
          );


      if (
        invalid
      ) {
        errors.push(
          "allowedDeployments entries must be non-empty strings"
        );
      }
    }


    if (
      config.clusterName !==
        undefined &&
      (
        typeof config.clusterName !==
          "string" ||
        !config
          .clusterName
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
    } catch (
      error
    ) {
      return {
        success:
          false,

        provider:
          PROVIDER,

        latencyMs:
          Date.now() -
          startedAt,

        detail:
          extractKubernetesErrorMessage(
            error
          ),

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


  async healthCheck(
    connection
  ) {
    return this
      .getHealth(
        connection
      );
  },


  // ==========================================================================
  // DISCOVERY
  // ==========================================================================

  async discoverResources(
    connection
  ) {
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

      executionAuthorized:
        false,
    };
  },


  // ==========================================================================
  // AUTHORIZED EXECUTION
  // ==========================================================================

  async executeCapability(
    connection,
    executionRequest = {},
    metadata = {}
  ) {
    const capability =
      requireText(
        executionRequest
          ?.capability,
        "capability",
        "KUBERNETES_EXECUTION_CAPABILITY_REQUIRED"
      );


    if (
      capability !==
        EXECUTION_CAPABILITY
          .RESTART_DEPLOYMENT
    ) {
      throw adapterError(
        `Unsupported Kubernetes execution capability: ${capability}`,
        "KUBERNETES_EXECUTION_CAPABILITY_UNSUPPORTED"
      );
    }


    const authorizationProof =
      metadata
        ?.authorizationProof;


    assertAuthorizationProof({
      authorizationProof,

      capability,
    });


    const parameters =
      (
        executionRequest
          ?.parameters &&
        typeof executionRequest
          .parameters ===
          "object"
      )
        ? executionRequest
            .parameters
        : {};


    const namespace =
      requireText(
        parameters.namespace,
        "namespace",
        "KUBERNETES_EXECUTION_NAMESPACE_REQUIRED"
      );


    const deploymentName =
      requireText(
        parameters.deploymentName ||
        parameters.deployment ||
        parameters.resource,
        "deploymentName",
        "KUBERNETES_EXECUTION_DEPLOYMENT_REQUIRED"
      );


    validateKubernetesName(
      namespace,
      "namespace"
    );


    validateKubernetesName(
      deploymentName,
      "deployment"
    );


    assertExecutionScope({
      connection,

      capability,

      namespace,

      deploymentName,
    });


    const kc =
      buildKubeConfig(
        connection
      );


    const appsApi =
      kc.makeApiClient(
        k8s.AppsV1Api
      );


    const restartedAt =
      new Date()
        .toISOString();


    /*
     * IMPORTANT:
     *
     * Do NOT send the full Deployment object back as a patch.
     *
     * We only mutate one well-defined field:
     *
     * spec.template.metadata.annotations[
     *   "kubectl.kubernetes.io/restartedAt"
     * ]
     *
     * Kubernetes sees the pod-template change and creates a new ReplicaSet /
     * replacement pod.
     */
    const patch = {
      spec: {
        template: {
          metadata: {
            annotations: {
              "kubectl.kubernetes.io/restartedAt":
                restartedAt,
            },
          },
        },
      },
    };


    let patched;


    try {
      /*
       * @kubernetes/client-node 0.21 uses the positional generated API.
       *
       * The patch content type MUST be explicit.
       *
       * Without this header, Kubernetes may interpret the object as a
       * JSON Patch document and reject it at the HTTP boundary.
       */
      patched =
        await appsApi
          .patchNamespacedDeployment(
            deploymentName,

            namespace,

            patch,

            undefined, // pretty

            undefined, // dryRun

            undefined, // fieldManager

            undefined, // fieldValidation

            undefined, // force

            {
              headers: {
                "Content-Type":
                  STRATEGIC_MERGE_PATCH,
              },
            }
          );
    } catch (
      error
    ) {
      const detail =
        extractKubernetesErrorMessage(
          error
        );


      throw Object.assign(
        new Error(
          `Kubernetes deployment restart failed: ${detail}`
        ),
        {
          name:
            "KubernetesIntegrationAdapterError",

          code:
            "KUBERNETES_RESTART_DEPLOYMENT_FAILED",

          provider:
            PROVIDER,

          statusCode:
            extractStatusCode(
              error
            ),

          kubernetesDetail:
            detail,

          cause:
            error,

          executionAuthorized:
            false,

          productionCertified:
            false,
        }
      );
    }


    const patchedBody =
      patched?.body ||
      patched ||
      {};


    return {
      success:
        true,

      status:
        "SUCCEEDED",

      provider:
        PROVIDER,

      capability,

      operation:
        "restartDeployment",

      target: {
        resourceType:
          "kubernetes.deployment",

        namespace,

        deployment:
          deploymentName,
      },

      restartedAt,

      resourceVersionAfter:
        patchedBody
          ?.metadata
          ?.resourceVersion ||
        null,

      authorization: {
        authorizationId:
          authorizationProof
            .authorizationId,

        executionRequestId:
          authorizationProof
            .executionRequestId,

        planId:
          authorizationProof
            .planId,

        planHash:
          authorizationProof
            .planHash,
      },

      /*
       * Successful execution is evidence.
       *
       * It is NEVER authorization.
       */
      executionAuthorized:
        false,

      productionCertified:
        false,
    };
  },


  // ==========================================================================
  // REVOCATION
  // ==========================================================================

  async revoke(
    _connection
  ) {
    return {
      success:
        true,

      remoteRevocationRequired:
        false,

      executionAuthorized:
        false,
    };
  },
};


// ============================================================================
// EXECUTION SAFETY
// ============================================================================

function assertAuthorizationProof({
  authorizationProof,
  capability,
}) {
  if (
    !authorizationProof ||
    authorizationProof
      .verified !==
      true
  ) {
    throw adapterError(
      "Verified execution authorization proof is required",
      "KUBERNETES_EXECUTION_AUTHORIZATION_REQUIRED"
    );
  }


  for (
    const field
    of [
      "authorizationId",
      "executionRequestId",
      "planId",
      "planHash",
    ]
  ) {
    if (
      !authorizationProof[
        field
      ]
    ) {
      throw adapterError(
        `Authorization proof is missing ${field}`,
        "KUBERNETES_EXECUTION_AUTHORIZATION_INCOMPLETE"
      );
    }
  }


  if (
    authorizationProof
      .capability &&
    authorizationProof
      .capability !==
      capability
  ) {
    throw adapterError(
      "Authorization capability does not match requested capability",
      "KUBERNETES_EXECUTION_CAPABILITY_AUTHORIZATION_MISMATCH"
    );
  }
}


function assertExecutionScope({
  connection,
  capability,
  namespace,
  deploymentName,
}) {
  const config =
    connection
      ?.nonSecretConfig ||
    {};


  const allowedExecutionCapabilities =
    Array.isArray(
      config
        .allowedExecutionCapabilities
    )
      ? config
          .allowedExecutionCapabilities
      : [];


  if (
    !allowedExecutionCapabilities
      .includes(
        capability
      )
  ) {
    throw adapterError(
      `Execution capability "${capability}" is not enabled for this Kubernetes integration`,
      "KUBERNETES_EXECUTION_CAPABILITY_NOT_ALLOWED"
    );
  }


  const allowedNamespaces =
    Array.isArray(
      config.allowedNamespaces
    )
      ? config
          .allowedNamespaces
          .map(
            value =>
              String(
                value
              )
                .trim()
          )
          .filter(
            Boolean
          )
      : [];


  if (
    allowedNamespaces.length ===
      0
  ) {
    throw adapterError(
      "Kubernetes execution requires an explicit allowedNamespaces configuration",
      "KUBERNETES_EXECUTION_NAMESPACE_ALLOWLIST_REQUIRED"
    );
  }


  if (
    !allowedNamespaces
      .includes(
        namespace
      )
  ) {
    throw adapterError(
      `Namespace "${namespace}" is outside the integration execution scope`,
      "KUBERNETES_EXECUTION_NAMESPACE_NOT_ALLOWED"
    );
  }


  const allowedDeployments =
    Array.isArray(
      config.allowedDeployments
    )
      ? config
          .allowedDeployments
          .map(
            value =>
              String(
                value
              )
                .trim()
          )
          .filter(
            Boolean
          )
      : [];


  if (
    allowedDeployments.length >
      0
  ) {
    const scopedName =
      `${namespace}/${deploymentName}`;


    if (
      !allowedDeployments
        .includes(
          deploymentName
        ) &&
      !allowedDeployments
        .includes(
          scopedName
        )
    ) {
      throw adapterError(
        `Deployment "${scopedName}" is outside the integration execution scope`,
        "KUBERNETES_EXECUTION_DEPLOYMENT_NOT_ALLOWED"
      );
    }
  }
}


// ============================================================================
// KUBECONFIG
// ============================================================================

function buildKubeConfig(
  connection
) {
  if (
    !connection
  ) {
    throw adapterError(
      "Kubernetes integration connection is required",
      "KUBERNETES_CONNECTION_REQUIRED"
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
    } catch (
      error
    ) {
      throw adapterError(
        `Unable to load in-cluster Kubernetes configuration: ${error.message}`,
        "KUBERNETES_IN_CLUSTER_CONFIG_FAILED"
      );
    }


    return kc;
  }


  if (
    authMode !==
      "kubeconfig"
  ) {
    throw adapterError(
      `Unsupported Kubernetes authentication mode: ${authMode}`,
      "KUBERNETES_AUTH_MODE_UNSUPPORTED"
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
    throw adapterError(
      "Kubernetes kubeconfig secret is missing",
      "KUBERNETES_SECRET_MISSING"
    );
  }


  try {
    kc.loadFromString(
      rawKubeconfig
    );
  } catch (
    error
  ) {
    throw adapterError(
      `Invalid Kubernetes kubeconfig: ${error.message}`,
      "KUBERNETES_KUBECONFIG_INVALID"
    );
  }


  return kc;
}


// ============================================================================
// ERROR NORMALIZATION
// ============================================================================

function extractStatusCode(
  error
) {
  const candidates = [
    error?.statusCode,
    error?.status,
    error?.response?.statusCode,
    error?.response?.status,
    error?.body?.code,
  ];


  for (
    const candidate
    of candidates
  ) {
    const number =
      Number(
        candidate
      );


    if (
      Number.isInteger(
        number
      ) &&
      number >
        0
    ) {
      return number;
    }
  }


  return null;
}


function extractKubernetesErrorMessage(
  error
) {
  const candidates = [
    error?.body?.message,
    error?.response?.body?.message,
    error?.response?.body?.reason,
    error?.body?.reason,
    error?.message,
  ];


  for (
    const candidate
    of candidates
  ) {
    if (
      candidate !==
        null &&
      candidate !==
        undefined &&
      String(
        candidate
      )
        .trim()
    ) {
      return String(
        candidate
      )
        .trim()
        .slice(
          0,
          2048
        );
    }
  }


  try {
    if (
      error?.body
    ) {
      return JSON.stringify(
        error.body
      )
        .slice(
          0,
          2048
        );
    }


    if (
      error?.response?.body
    ) {
      return JSON.stringify(
        error.response.body
      )
        .slice(
          0,
          2048
        );
    }
  } catch {
    // Ignore serialization failure.
  }


  return "Unknown Kubernetes API error";
}


// ============================================================================
// VALIDATION
// ============================================================================

function validateKubernetesName(
  value,
  type
) {
  const text =
    String(
      value ||
      ""
    );


  const maxLength =
    type ===
      "namespace"
      ? 63
      : 253;


  if (
    text.length >
      maxLength ||
    !/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/
      .test(
        text
      )
  ) {
    throw adapterError(
      `Invalid Kubernetes ${type}: ${text}`,
      `KUBERNETES_EXECUTION_${String(
        type
      )
        .toUpperCase()}_INVALID`
    );
  }
}


function requireText(
  value,
  field,
  code
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    String(
      value
    )
      .trim() ===
      ""
  ) {
    throw adapterError(
      `${field} is required`,
      code
    );
  }


  return String(
    value
  )
    .trim();
}


function adapterError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "KubernetesIntegrationAdapterError",

      code,

      provider:
        PROVIDER,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
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


adapter.EXECUTION_CAPABILITY =
  EXECUTION_CAPABILITY;


adapter.STRATEGIC_MERGE_PATCH =
  STRATEGIC_MERGE_PATCH;


module.exports =
  adapter;