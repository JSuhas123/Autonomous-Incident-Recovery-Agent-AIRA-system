"use strict";

const REALITY_EXECUTABLE_WORKLOAD_VERSION =
  "23R.7.0";

const CANONICAL_RELIABILITY_NAMESPACE =
  "aira-reliability-lab";

const EXECUTABLE_WORKLOADS =
  Object.freeze({
    AIRA_MICROSERVICES_LAB_V1:
      Object.freeze({
        workloadId:
          "AIRA_MICROSERVICES_LAB_V1",

        workloadFamily:
          "MICROSERVICES",

        runtime:
          "KUBERNETES",

        namespace:
          CANONICAL_RELIABILITY_NAMESPACE,

        evidenceGrade:
          "E1",

        safetyClass:
          "LAB_ONLY",

        production:
          false,

        executionAuthorized:
          false,

        dynamics:
          Object.freeze([
            "DEPENDENCY_DEGRADATION",
            "LATENCY_PROPAGATION",
            "RETRY_AMPLIFICATION",
            "RESOURCE_EXHAUSTION",
            "QUEUE_BUILDUP",
            "DATABASE_BOTTLENECK",
            "NETWORK_DEGRADATION",
            "CASCADING_FAILURE",
          ]),

        allowedFailureFamilies:
          Object.freeze([
            "POD_CRASH",
            "CPU_SATURATION",
            "MEMORY_PRESSURE",
            "DEPENDENCY_LATENCY",
            "DEPENDENCY_UNAVAILABLE",
            "NETWORK_LOSS",
            "QUEUE_BACKLOG",
            "DATABASE_LATENCY",
          ]),
      }),
  });

function workloadError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}

function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw workloadError(
      "REALITY_EXECUTABLE_WORKLOAD_FIELD_REQUIRED",
      `${field} is required`
    );
  }

  return value.trim();
}

function getExecutableWorkload(
  workloadId
) {
  const key =
    requireString(
      workloadId,
      "workloadId"
    );

  const workload =
    EXECUTABLE_WORKLOADS[
      key
    ];

  if (
    !workload
  ) {
    throw workloadError(
      "REALITY_EXECUTABLE_WORKLOAD_UNKNOWN",
      (
        "Unknown executable Reality workload: " +
        key
      )
    );
  }

  return workload;
}

function buildExecutableWorkloadPlan(
  input =
    {}
) {
  const workload =
    getExecutableWorkload(
      input.workloadId
    );

  const failureFamily =
    requireString(
      input.failureFamily,
      "failureFamily"
    );

  if (
    workload
      .allowedFailureFamilies
      .includes(
        failureFamily
      ) ===
      false
  ) {
    throw workloadError(
      "REALITY_EXECUTABLE_WORKLOAD_FAILURE_UNSUPPORTED",
      (
        `${failureFamily} is not supported by ` +
        workload.workloadId
      )
    );
  }

  const requestedNamespace =
    input.namespace ||
    workload.namespace;

  if (
    requestedNamespace !==
      CANONICAL_RELIABILITY_NAMESPACE
  ) {
    throw workloadError(
      "REALITY_EXECUTABLE_WORKLOAD_NAMESPACE_FORBIDDEN",
      (
        "Executable Reality workloads are restricted to " +
        CANONICAL_RELIABILITY_NAMESPACE
      )
    );
  }

  if (
    input.production ===
      true ||
    input.executionAuthorized ===
      true
  ) {
    throw workloadError(
      "REALITY_EXECUTABLE_WORKLOAD_AUTHORITY_FORBIDDEN",
      (
        "Reality workload planning cannot enable production " +
        "or execution authority"
      )
    );
  }

  return Object.freeze({
    version:
      REALITY_EXECUTABLE_WORKLOAD_VERSION,

    workloadId:
      workload.workloadId,

    workloadFamily:
      workload.workloadFamily,

    runtime:
      workload.runtime,

    namespace:
      CANONICAL_RELIABILITY_NAMESPACE,

    targetLabels:
      Object.freeze({
        "aira.reliability-lab":
          "true",

        "aira.safety-class":
          "LAB_ONLY",
      }),

    failureFamily,

    evidenceGrade:
      "E1",

    safetyClass:
      "LAB_ONLY",

    production:
      false,

    mutationOwner:
      "PHASE_21_FAILURE_INJECTION_ENGINE",

    recoveryOwner:
      "EXISTING_EXECUTION_AUTHORIZATION_PATH",

    replayOwner:
      "PHASE_23R_REALITY_REPLAY",

    executionAuthorized:
      false,

    productionCertified:
      false,
  });
}

module.exports = {
  REALITY_EXECUTABLE_WORKLOAD_VERSION,

  CANONICAL_RELIABILITY_NAMESPACE,

  EXECUTABLE_WORKLOADS,

  getExecutableWorkload,

  buildExecutableWorkloadPlan,
};