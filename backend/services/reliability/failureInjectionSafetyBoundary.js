"use strict";

const {
  LAB_ENVIRONMENT_KIND,
  LAB_ENVIRONMENT_STATUS,
  LAB_SAFETY_CLASS,
  EXPERIMENT_RUN_STATUS,
} =
  require(
    "../../constants/reliabilityLab"
  );


const FAILURE_INJECTION_SAFETY_VERSION =
  "21.10-v1";


const CANONICAL_LAB_NAMESPACE =
  "aira-reliability-lab";


const DOCKER_LAB_CONTAINER_PREFIX =
  "aira-lab-";


function assertFailureInjectionAllowed({
  environment,
  scenario,
  experimentRun,
  target,
} = {}) {
  requireObject(
    environment,
    "environment"
  );


  requireObject(
    scenario,
    "scenario"
  );


  requireObject(
    experimentRun,
    "experimentRun"
  );


  requireObject(
    target,
    "target"
  );


  /*
   * --------------------------------------------------------------------------
   * Environment safety
   * --------------------------------------------------------------------------
   */

  if (
    environment.production ===
    true
  ) {
    throw safetyError(
      "FAILURE_INJECTION_PRODUCTION_ENVIRONMENT_FORBIDDEN",
      "Failure injection is forbidden for production environments"
    );
  }


  if (
    environment.safetyClass !==
    LAB_SAFETY_CLASS.LAB_ONLY
  ) {
    throw safetyError(
      "FAILURE_INJECTION_LAB_ONLY_REQUIRED",
      "Failure injection requires LAB_ONLY safety class"
    );
  }


  if (
    environment.status !==
    LAB_ENVIRONMENT_STATUS
      .RUNNING_EXPERIMENT
  ) {
    throw safetyError(
      "FAILURE_INJECTION_ENVIRONMENT_NOT_RUNNING_EXPERIMENT",
      `Failure injection requires RUNNING_EXPERIMENT environment status, received ${environment.status}`
    );
  }


  if (
    !Object.values(
      LAB_ENVIRONMENT_KIND
    ).includes(
      environment.kind
    )
  ) {
    throw safetyError(
      "FAILURE_INJECTION_LAB_KIND_INVALID",
      `Unsupported Reliability Lab kind ${environment.kind}`
    );
  }


  /*
   * --------------------------------------------------------------------------
   * Scenario safety
   * --------------------------------------------------------------------------
   */

  if (
    scenario.executionAuthorized ===
    true
  ) {
    throw safetyError(
      "FAILURE_SCENARIO_CANNOT_AUTHORIZE_EXECUTION",
      "Failure scenario cannot grant execution authorization"
    );
  }


  if (
    !Array.isArray(
      scenario.supportedLabTypes
    ) ||

    !scenario
      .supportedLabTypes
      .includes(
        environment.kind
      )
  ) {
    throw safetyError(
      "FAILURE_INJECTION_LAB_KIND_UNSUPPORTED",
      `${scenario.failureKey}@${scenario.version} does not support lab kind ${environment.kind}`
    );
  }


  /*
   * --------------------------------------------------------------------------
   * Experiment-run safety
   * --------------------------------------------------------------------------
   */

  if (
    experimentRun
      .executionAuthorized ===
    true
  ) {
    throw safetyError(
      "FAILURE_INJECTION_EXPERIMENT_CANNOT_AUTHORIZE",
      "Reliability experiment run cannot grant execution authorization"
    );
  }


  if (
    experimentRun.status !==
    EXPERIMENT_RUN_STATUS
      .INJECTING
  ) {
    throw safetyError(
      "FAILURE_INJECTION_RUN_NOT_INJECTING",
      `Failure injection requires experiment status INJECTING, received ${experimentRun.status}`
    );
  }


  /*
   * PostgreSQL maps:
   *
   *   experimentRun.labEnvironmentId
   *
   * to reliability.lab_environments.id, which is the UUID.
   *
   * Mock/in-memory callers may still carry the public ID.
   *
   * Therefore either canonical identifier is accepted, but an unrelated
   * environment is always rejected.
   */

  if (
    experimentRun.labEnvironmentId
  ) {
    const belongsToEnvironment =
      experimentRun
        .labEnvironmentId ===
        environment.id ||

      experimentRun
        .labEnvironmentId ===
        environment.publicId;


    if (
      !belongsToEnvironment
    ) {
      throw safetyError(
        "FAILURE_INJECTION_LAB_ENVIRONMENT_MISMATCH",
        "Experiment run does not belong to the selected Reliability Lab environment"
      );
    }
  }


  /*
   * --------------------------------------------------------------------------
   * Target safety
   * --------------------------------------------------------------------------
   */

  if (
    target.production ===
    true
  ) {
    throw safetyError(
      "FAILURE_INJECTION_PRODUCTION_TARGET_FORBIDDEN",
      "Failure injection cannot target a production resource"
    );
  }


  if (
    target.executionAuthorized ===
    true
  ) {
    throw safetyError(
      "FAILURE_INJECTION_TARGET_CANNOT_AUTHORIZE",
      "Failure injection target cannot grant execution authorization"
    );
  }


  if (
    target.resourceType !==
    scenario.targetResourceType
  ) {
    throw safetyError(
      "FAILURE_INJECTION_TARGET_TYPE_MISMATCH",
      `Scenario requires ${scenario.targetResourceType}, received ${target.resourceType}`
    );
  }


  assertLabTargetBoundary(
    environment,
    target
  );


  return Object.freeze({
    allowed:
      true,

    safetyVersion:
      FAILURE_INJECTION_SAFETY_VERSION,

    labEnvironmentId:
      environment.publicId ||
      environment.id ||
      null,

    canonicalLabEnvironmentId:
      environment.id ||
      null,

    failureKey:
      scenario.failureKey,

    failureVersion:
      scenario.version,

    targetResourcePublicId:
      target.resourcePublicId ||
      null,

    executionAuthorized:
      false,
  });
}


function assertLabTargetBoundary(
  environment,
  target
) {
  /*
   * --------------------------------------------------------------------------
   * Kubernetes-family boundary
   * --------------------------------------------------------------------------
   */

  if (
    [
      LAB_ENVIRONMENT_KIND.KIND,
      LAB_ENVIRONMENT_KIND.KUBERNETES,
      LAB_ENVIRONMENT_KIND.K3D,
    ].includes(
      environment.kind
    )
  ) {
    const expectedNamespace =
      environment.namespace ||
      CANONICAL_LAB_NAMESPACE;


    /*
     * Phase 21 currently permits mutations ONLY in the dedicated namespace.
     *
     * Even if a caller registers another namespace in PostgreSQL, the injector
     * refuses it.
     */

    if (
      expectedNamespace !==
      CANONICAL_LAB_NAMESPACE
    ) {
      throw safetyError(
        "FAILURE_INJECTION_ENVIRONMENT_NAMESPACE_OUTSIDE_LAB",
        `Reliability Lab environment namespace must be ${CANONICAL_LAB_NAMESPACE}`
      );
    }


    if (
      target.namespace !==
      CANONICAL_LAB_NAMESPACE
    ) {
      throw safetyError(
        "FAILURE_INJECTION_NAMESPACE_OUTSIDE_LAB",
        `Failure injection namespace must be ${CANONICAL_LAB_NAMESPACE}`
      );
    }
  }


  /*
   * --------------------------------------------------------------------------
   * Docker boundary
   * --------------------------------------------------------------------------
   */

  if (
    environment.kind ===
    LAB_ENVIRONMENT_KIND.DOCKER
  ) {
    if (
      typeof target.containerName !==
        "string" ||

      !target
        .containerName
        .startsWith(
          DOCKER_LAB_CONTAINER_PREFIX
        )
    ) {
      throw safetyError(
        "FAILURE_INJECTION_DOCKER_TARGET_OUTSIDE_LAB",
        `Docker failure injection targets must begin with ${DOCKER_LAB_CONTAINER_PREFIX}`
      );
    }
  }


  /*
   * --------------------------------------------------------------------------
   * Registration labels
   * --------------------------------------------------------------------------
   */

  const labels =
    target.labels ||
    {};


  const reliabilityLabLabel =
    labels[
      "aira.reliability-lab"
    ];


  const safetyClassLabel =
    labels[
      "aira.safety-class"
    ];


  if (
    reliabilityLabLabel !==
      true &&

    reliabilityLabLabel !==
      "true"
  ) {
    throw safetyError(
      "FAILURE_INJECTION_TARGET_NOT_REGISTERED_LAB_RESOURCE",
      "Failure injection target must carry aira.reliability-lab=true"
    );
  }


  if (
    safetyClassLabel !==
    LAB_SAFETY_CLASS.LAB_ONLY
  ) {
    throw safetyError(
      "FAILURE_INJECTION_TARGET_NOT_LAB_ONLY",
      "Failure injection target must carry aira.safety-class=LAB_ONLY"
    );
  }


  return true;
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
    throw safetyError(
      "FAILURE_INJECTION_INPUT_INVALID",
      `${field} is required`
    );
  }
}


function safetyError(
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
        "ReliabilityFailureInjectionSafetyError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  FAILURE_INJECTION_SAFETY_VERSION,

  CANONICAL_LAB_NAMESPACE,

  DOCKER_LAB_CONTAINER_PREFIX,

  assertFailureInjectionAllowed,

  assertLabTargetBoundary,

  safetyError,
};