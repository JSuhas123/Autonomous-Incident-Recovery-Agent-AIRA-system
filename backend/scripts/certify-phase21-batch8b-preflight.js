"use strict";

/**
 * Phase 21 Batch-8B Positive Execution Preflight
 *
 * No infrastructure mutation.
 *
 * Determines whether the existing canonical runtime is actually capable
 * of executing the positive Kubernetes path.
 */

const kubernetesAdapter =
  require(
    "../services/integrations/adapters/kubernetesAdapter"
  );


const executorRegistry =
  require(
    "../services/execution/executorRegistry"
  );


const executorBootstrapService =
  require(
    "../services/execution/executorBootstrapService"
  );


const {
  INTEGRATION_CAPABILITY,
} =
  require(
    "../constants/integrationPlatform"
  );


function main() {
  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 21.16 BATCH-8B POSITIVE EXECUTION PRE-FLIGHT"
  );

  console.log(
    "=============================================================="
  );


  requireCondition(
    String(
      process.env
        .AIRA_RELIABILITY_LAB ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "true",
    "PHASE21_BATCH8B_LAB_FLAG_REQUIRED",
    "AIRA_RELIABILITY_LAB=true is required"
  );


  requireCondition(
    String(
      process.env
        .PERSISTENCE_PROVIDER ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "postgres",
    "PHASE21_BATCH8B_POSTGRES_REQUIRED",
    "PERSISTENCE_PROVIDER=postgres is required"
  );


  requireCondition(
    String(
      process.env
        .NODE_ENV ||
      "development"
    )
      .trim()
      .toLowerCase() !==
      "production",
    "PHASE21_BATCH8B_PRODUCTION_FORBIDDEN",
    "Positive Reliability Lab execution cannot run in production"
  );


  executorBootstrapService
    .registerDefaults();


  const executor =
    executorRegistry
      .get(
        "kubernetes.restartDeployment"
      );


  const adapterCapabilities =
    Array.isArray(
      kubernetesAdapter
        .capabilities
    )
      ? kubernetesAdapter
          .capabilities
      : [];


  const hasPhase20Capability =
    adapterCapabilities
      .includes(
        INTEGRATION_CAPABILITY
          .EXECUTE_CAPABILITY
      );


  const hasExecuteMethod =
    typeof kubernetesAdapter
      .executeCapability ===
      "function";


  const executorRegistered =
    Boolean(
      executor
    );


  console.log(
    `Phase20 execute capability: ${hasPhase20Capability}`
  );

  console.log(
    `Phase20 execute method:     ${hasExecuteMethod}`
  );

  console.log(
    `Phase8 executor registered: ${executorRegistered}`
  );

  console.log(
    `Executor enabled:           ${Boolean(
      executor
        ?.enabled
    )}`
  );

  console.log(
    `Requires authorization:     ${Boolean(
      executor
        ?.requiresAuthorization
    )}`
  );

  console.log(
    "Production certified:       false"
  );

  console.log(
    "Execution authorized:       false"
  );


  requireCondition(
    executorRegistered,
    "PHASE21_BATCH8B_EXECUTOR_NOT_REGISTERED",
    "kubernetes.restartDeployment executor is not registered"
  );


  requireCondition(
    executor
      ?.requiresAuthorization ===
      true,
    "PHASE21_BATCH8B_EXECUTOR_AUTHORIZATION_NOT_REQUIRED",
    "Kubernetes mutation capability must require authorization"
  );


  /*
   * This intentionally fails until Phase-20 provider execution support
   * actually exists.
   *
   * We will NOT bypass Phase 20 with direct kubectl/k8sClient execution.
   */
  requireCondition(
    hasPhase20Capability &&
    hasExecuteMethod,
    "PHASE21_BATCH8B_PHASE20_KUBERNETES_EXECUTION_NOT_READY",
    [
      "Canonical Phase-20 Kubernetes execution capability is not implemented.",
      "Do not bypass IntegrationRuntime.",
      "A controlled adapter implementation is required before positive live execution.",
    ].join(
      " "
    )
  );


  console.log(
    ""
  );

  console.log(
    "BATCH 8B PRE-FLIGHT: PASS"
  );
}


function requireCondition(
  condition,
  code,
  message
) {
  if (
    condition
  ) {
    return;
  }


  throw Object.assign(
    new Error(
      message
    ),
    {
      code,

      productionCertified:
        false,

      executionAuthorized:
        false,
    }
  );
}


try {
  main();
} catch (
  error
) {
  console.error(
    ""
  );

  console.error(
    "BATCH 8B PRE-FLIGHT: FAIL"
  );

  console.error(
    `Code: ${error.code || "UNEXPECTED_ERROR"}`
  );

  console.error(
    error.message
  );

  console.error(
    "Production certified: false"
  );

  console.error(
    "Execution authorized: false"
  );


  process.exitCode =
    1;
}