"use strict";


const FAILURE_INJECTION_PLAN_VERSION =
  "21.9-v1";


const INJECTION_OPERATION =
  Object.freeze({
    K8S_DELETE_POD:
      "K8S_DELETE_POD",

    K8S_BAD_DEPLOYMENT:
      "K8S_BAD_DEPLOYMENT",

    K8S_READINESS_FAILURE:
      "K8S_READINESS_FAILURE",

    K8S_MEMORY_OOM:
      "K8S_MEMORY_OOM",

    CPU_SATURATION:
      "CPU_SATURATION",

    DEPENDENCY_OUTAGE:
      "DEPENDENCY_OUTAGE",

    POSTGRES_UNAVAILABLE:
      "POSTGRES_UNAVAILABLE",

    POSTGRES_CONNECTION_EXHAUSTION:
      "POSTGRES_CONNECTION_EXHAUSTION",

    REDIS_UNAVAILABLE:
      "REDIS_UNAVAILABLE",

    RABBITMQ_UNAVAILABLE:
      "RABBITMQ_UNAVAILABLE",

    NETWORK_LATENCY:
      "NETWORK_LATENCY",

    DNS_FAILURE:
      "DNS_FAILURE",
  });


const INJECTOR_TO_OPERATION =
  Object.freeze({
    KUBERNETES_POD_TERMINATION:
      INJECTION_OPERATION
        .K8S_DELETE_POD,

    KUBERNETES_BAD_DEPLOYMENT:
      INJECTION_OPERATION
        .K8S_BAD_DEPLOYMENT,

    KUBERNETES_READINESS_FAILURE:
      INJECTION_OPERATION
        .K8S_READINESS_FAILURE,

    KUBERNETES_MEMORY_OOM:
      INJECTION_OPERATION
        .K8S_MEMORY_OOM,

    CPU_SATURATION:
      INJECTION_OPERATION
        .CPU_SATURATION,

    DEPENDENCY_OUTAGE:
      INJECTION_OPERATION
        .DEPENDENCY_OUTAGE,

    POSTGRES_UNAVAILABLE:
      INJECTION_OPERATION
        .POSTGRES_UNAVAILABLE,

    POSTGRES_CONNECTION_EXHAUSTION:
      INJECTION_OPERATION
        .POSTGRES_CONNECTION_EXHAUSTION,

    REDIS_UNAVAILABLE:
      INJECTION_OPERATION
        .REDIS_UNAVAILABLE,

    RABBITMQ_UNAVAILABLE:
      INJECTION_OPERATION
        .RABBITMQ_UNAVAILABLE,

    NETWORK_LATENCY:
      INJECTION_OPERATION
        .NETWORK_LATENCY,

    DNS_FAILURE:
      INJECTION_OPERATION
        .DNS_FAILURE,
  });


function buildFailureInjectionPlan({
  scenario,

  environment,

  experimentRun,

  target,

  parameters =
    {},
} = {}) {
  requireObject(
    scenario,
    "scenario"
  );


  requireObject(
    environment,
    "environment"
  );


  requireObject(
    experimentRun,
    "experimentRun"
  );


  requireObject(
    target,
    "target"
  );


  requireObject(
    parameters,
    "parameters"
  );


  const operation =
    INJECTOR_TO_OPERATION[
      scenario.injector
    ];


  if (
    !operation
  ) {
    throw planError(
      "FAILURE_INJECTOR_UNKNOWN",

      `No deterministic injection operation is registered for ${scenario.injector}`
    );
  }


  return deepFreeze({
    planVersion:
      FAILURE_INJECTION_PLAN_VERSION,

    injectorKey:
      scenario.injector,

    injectorVersion:
      FAILURE_INJECTION_PLAN_VERSION,

    operation,

    failureKey:
      scenario.failureKey,

    failureVersion:
      scenario.version,

    failureDomain:
      scenario.domain,

    failureType:
      scenario.failureType,

    labKind:
      environment.kind,

    labEnvironmentId:
      environment.publicId ||
      environment.id ||
      null,

    experimentRunId:
      experimentRun
        .experimentRunId ||
      experimentRun.publicId,

    correlationId:
      experimentRun
        .correlationId,

    target:
      sanitizeTarget(
        target
      ),

    parameters:
      sanitizeParameters(
        parameters
      ),

    evaluatorGroundTruthIncluded:
      false,

    recoveryExecution:
      false,

    executionAuthorized:
      false,
  });
}


function sanitizeTarget(
  target
) {
  return {
    resourcePublicId:
      target.resourcePublicId ||
      null,

    resourceType:
      target.resourceType,

    namespace:
      target.namespace ||
      null,

    workloadName:
      target.workloadName ||
      null,

    podName:
      target.podName ||
      null,

    containerName:
      target.containerName ||
      null,

    dependencyName:
      target.dependencyName ||
      null,

    labels: {
      ...(
        target.labels ||
        {}
      ),
    },

    production:
      false,

    executionAuthorized:
      false,
  };
}


function sanitizeParameters(
  parameters
) {
  const forbidden = [
    "groundTruth",

    "expectedFailureModeKey",

    "expectedDiagnosis",

    "expectedRecovery",

    "acceptableRecoveryStrategies",

    "prohibitedRecoveryStrategies",
  ];


  for (
    const key
    of Object.keys(
      parameters
    )
  ) {
    if (
      forbidden.includes(
        key
      )
    ) {
      throw planError(
        "FAILURE_INJECTION_GROUND_TRUTH_PARAMETER_FORBIDDEN",

        `${key} is evaluator-only and cannot enter an injection plan`
      );
    }
  }


  return JSON.parse(
    JSON.stringify(
      parameters
    )
  );
}


function requireObject(
  value,
  field
) {
  if (
    !value ||

    typeof value !==
      "object" ||

    Array.isArray(
      value
    )
  ) {
    throw planError(
      "FAILURE_INJECTION_PLAN_INPUT_INVALID",

      `${field} is required`
    );
  }
}


function deepFreeze(
  value
) {
  if (
    !value ||

    typeof value !==
      "object" ||

    Object.isFrozen(
      value
    )
  ) {
    return value;
  }


  Object.freeze(
    value
  );


  Object.values(
    value
  ).forEach(
    deepFreeze
  );


  return value;
}


function planError(
  code,
  message,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "ReliabilityFailureInjectionPlanError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  FAILURE_INJECTION_PLAN_VERSION,

  INJECTION_OPERATION,

  INJECTOR_TO_OPERATION,

  buildFailureInjectionPlan,

  planError,
};