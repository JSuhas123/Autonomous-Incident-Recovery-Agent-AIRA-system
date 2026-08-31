"use strict";

const {
  DOCKER_LAB_CONTAINER_PREFIX,
} =
  require(
    "../failureInjectionSafetyBoundary"
  );


const {
  INJECTION_OPERATION,
} =
  require(
    "../failureInjectionPlanFactory"
  );


const {
  runCommand,
} =
  require(
    "./reliabilityLabCommandRunner"
  );


const DOCKER_RUNTIME_VERSION =
  "21.9-docker-v1";


const STOPPABLE_OPERATIONS =
  Object.freeze(
    new Set([
      INJECTION_OPERATION
        .DEPENDENCY_OUTAGE,

      INJECTION_OPERATION
        .POSTGRES_UNAVAILABLE,

      INJECTION_OPERATION
        .REDIS_UNAVAILABLE,

      INJECTION_OPERATION
        .RABBITMQ_UNAVAILABLE,
    ])
  );


class DockerReliabilityLabRuntime {
  constructor(
    options =
      {}
  ) {
    this.commandRunner =
      options.commandRunner ||
      runCommand;
  }


  async execute(
    plan,
    context =
      {}
  ) {
    assertRuntimeContext(
      context
    );


    assertPlan(
      plan
    );


    if (
      !STOPPABLE_OPERATIONS
        .has(
          plan.operation
        )
    ) {
      throw runtimeError(
        "DOCKER_RUNTIME_OPERATION_NOT_LIVE_CERTIFIED",
        `Docker Reliability Lab operation ${plan.operation} is not live-certified yet`
      );
    }


    return this
      .stopLabContainer(
        plan
      );
  }


  async stopLabContainer(
    plan
  ) {
    const containerName =
      requireContainerName(
        plan.target
          .containerName
      );


    const container =
      await this
        .inspectContainer(
          containerName
        );


    assertRealLabContainer(
      container,
      containerName
    );


    await this
      .commandRunner(
        "docker",
        [
          "stop",
          "--time",
          "10",
          containerName,
        ],
        {
          timeoutMs:
            30_000,
        }
      );


    return Object.freeze({
      success:
        true,

      operation:
        plan.operation,

      changed:
        true,

      reference:
        `container/${containerName}`,

      provenance: {
        runtime:
          "DOCKER_RELIABILITY_LAB_RUNTIME",

        runtimeVersion:
          DOCKER_RUNTIME_VERSION,

        targetContainer:
          containerName,

        targetContainerId:
          container.Id ||
          null,

        mutation:
          "STOP_CONTAINER",

        shell:
          false,

        independentlyVerifiedLabLabels:
          true,

        executionAuthorized:
          false,
      },

      executionAuthorized:
        false,
    });
  }


  async inspectContainer(
    containerName
  ) {
    const result =
      await this
        .commandRunner(
          "docker",
          [
            "inspect",
            containerName,
          ],
          {
            timeoutMs:
              15_000,
          }
        );


    let parsed;


    try {
      parsed =
        JSON.parse(
          result.stdout
        );
    } catch (
      error
    ) {
      throw runtimeError(
        "DOCKER_RUNTIME_TARGET_RESPONSE_INVALID",
        `docker inspect returned invalid JSON for ${containerName}`,
        {
          cause:
            error,
        }
      );
    }


    if (
      !Array.isArray(
        parsed
      ) ||

      parsed.length !==
        1
    ) {
      throw runtimeError(
        "DOCKER_RUNTIME_TARGET_NOT_FOUND",
        `Unable to resolve exactly one container named ${containerName}`
      );
    }


    return parsed[0];
  }
}


function assertRuntimeContext(
  context
) {
  if (
    context.reliabilityLab !==
      true
  ) {
    throw runtimeError(
      "DOCKER_RUNTIME_RELIABILITY_LAB_CONTEXT_REQUIRED",
      "Explicit Reliability Lab runtime context is required"
    );
  }


  if (
    context.safetyClass !==
      "LAB_ONLY"
  ) {
    throw runtimeError(
      "DOCKER_RUNTIME_LAB_ONLY_REQUIRED",
      "Docker Reliability Lab runtime requires LAB_ONLY context"
    );
  }


  if (
    context.executionAuthorized ===
      true
  ) {
    throw runtimeError(
      "DOCKER_RUNTIME_CANNOT_AUTHORIZE",
      "Docker Reliability Lab runtime cannot grant execution authorization"
    );
  }
}


function assertPlan(
  plan
) {
  if (
    !plan ||

    typeof plan !==
      "object"
  ) {
    throw runtimeError(
      "DOCKER_RUNTIME_PLAN_REQUIRED",
      "Failure injection plan is required"
    );
  }


  if (
    plan.executionAuthorized ===
      true
  ) {
    throw runtimeError(
      "DOCKER_RUNTIME_PLAN_CANNOT_AUTHORIZE",
      "Failure injection plan cannot grant execution authorization"
    );
  }


  if (
    plan.evaluatorGroundTruthIncluded ===
      true
  ) {
    throw runtimeError(
      "DOCKER_RUNTIME_GROUND_TRUTH_FORBIDDEN",
      "Evaluator ground truth cannot enter Docker Reliability Lab runtime"
    );
  }
}


function assertRealLabContainer(
  container,
  requestedName
) {
  const name =
    String(
      container?.Name ||
      ""
    ).replace(
      /^\//,
      ""
    );


  if (
    name !==
      requestedName
  ) {
    throw runtimeError(
      "DOCKER_RUNTIME_TARGET_IDENTITY_MISMATCH",
      "Resolved Docker container does not match requested target"
    );
  }


  if (
    !name.startsWith(
      DOCKER_LAB_CONTAINER_PREFIX
    )
  ) {
    throw runtimeError(
      "DOCKER_RUNTIME_REAL_TARGET_OUTSIDE_LAB",
      `Resolved Docker container must begin with ${DOCKER_LAB_CONTAINER_PREFIX}`
    );
  }


  const labels =
    container?.Config
      ?.Labels ||
    {};


  if (
    labels[
      "aira.reliability-lab"
    ] !==
      "true"
  ) {
    throw runtimeError(
      "DOCKER_RUNTIME_REAL_TARGET_NOT_LAB_RESOURCE",
      "Resolved Docker target is not labelled as an AIRA Reliability Lab resource"
    );
  }


  if (
    labels[
      "aira.safety-class"
    ] !==
      "LAB_ONLY"
  ) {
    throw runtimeError(
      "DOCKER_RUNTIME_REAL_TARGET_NOT_LAB_ONLY",
      "Resolved Docker target is not LAB_ONLY"
    );
  }
}


function requireContainerName(
  value
) {
  if (
    typeof value !==
      "string" ||

    !value.startsWith(
      DOCKER_LAB_CONTAINER_PREFIX
    ) ||

    !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/
      .test(
        value
      )
  ) {
    throw runtimeError(
      "DOCKER_RUNTIME_TARGET_NAME_INVALID",
      `Docker Reliability Lab target must begin with ${DOCKER_LAB_CONTAINER_PREFIX}`
    );
  }


  return value;
}


function runtimeError(
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
        "DockerReliabilityLabRuntimeError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  DOCKER_RUNTIME_VERSION,

  STOPPABLE_OPERATIONS,

  DockerReliabilityLabRuntime,

  assertRealLabContainer,

  runtimeError,
};