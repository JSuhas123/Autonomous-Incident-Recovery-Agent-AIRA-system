"use strict";

const {
  CANONICAL_LAB_NAMESPACE,
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


const KUBERNETES_RUNTIME_VERSION =
  "21.9-kubernetes-v1";


class KubernetesReliabilityLabRuntime {
  constructor(
    options =
      {}
  ) {
    this.commandRunner =
      options.commandRunner ||
      runCommand;


    this.namespace =
      options.namespace ||
      CANONICAL_LAB_NAMESPACE;
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
      this.namespace !==
      CANONICAL_LAB_NAMESPACE
    ) {
      throw runtimeError(
        "KUBERNETES_RUNTIME_NAMESPACE_FORBIDDEN",
        `Kubernetes Reliability Lab runtime may only operate in ${CANONICAL_LAB_NAMESPACE}`
      );
    }


    if (
      plan.target.namespace !==
      CANONICAL_LAB_NAMESPACE
    ) {
      throw runtimeError(
        "KUBERNETES_RUNTIME_TARGET_NAMESPACE_FORBIDDEN",
        `Target namespace must be ${CANONICAL_LAB_NAMESPACE}`
      );
    }


    switch (
      plan.operation
    ) {
      case INJECTION_OPERATION
        .K8S_DELETE_POD:

        return this
          .deleteLabPod(
            plan
          );


      default:

        throw runtimeError(
          "KUBERNETES_RUNTIME_OPERATION_NOT_LIVE_CERTIFIED",
          `Kubernetes Reliability Lab operation ${plan.operation} is not live-certified yet`
        );
    }
  }


  async deleteLabPod(
    plan
  ) {
    const podName =
      requireKubernetesName(
        plan.target.podName,
        "podName"
      );


    const pod =
      await this
        .readPod(
          podName
        );


    assertRealLabResource(
      pod
    );


    const uid =
      pod.metadata?.uid;


    if (
      !uid
    ) {
      throw runtimeError(
        "KUBERNETES_RUNTIME_POD_UID_MISSING",
        `Pod ${podName} does not expose a UID`
      );
    }


    await this
      .commandRunner(
        "kubectl",
        [
          "delete",
          "pod",

          podName,

          "-n",
          CANONICAL_LAB_NAMESPACE,

          "--wait=false",
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
        `pod/${podName}`,

      provenance: {
        runtime:
          "KUBERNETES_RELIABILITY_LAB_RUNTIME",

        runtimeVersion:
          KUBERNETES_RUNTIME_VERSION,

        namespace:
          CANONICAL_LAB_NAMESPACE,

        targetPod:
          podName,

        targetUid:
          uid,

        mutation:
          "DELETE_POD",

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


  async readPod(
    podName
  ) {
    const result =
      await this
        .commandRunner(
          "kubectl",
          [
            "get",
            "pod",

            podName,

            "-n",
            CANONICAL_LAB_NAMESPACE,

            "-o",
            "json",
          ],
          {
            timeoutMs:
              15_000,
          }
        );


    try {
      return JSON.parse(
        result.stdout
      );
    } catch (
      error
    ) {
      throw runtimeError(
        "KUBERNETES_RUNTIME_TARGET_RESPONSE_INVALID",
        `kubectl returned invalid JSON for pod ${podName}`,
        {
          cause:
            error,
        }
      );
    }
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
      "KUBERNETES_RUNTIME_RELIABILITY_LAB_CONTEXT_REQUIRED",
      "Explicit Reliability Lab runtime context is required"
    );
  }


  if (
    context.safetyClass !==
      "LAB_ONLY"
  ) {
    throw runtimeError(
      "KUBERNETES_RUNTIME_LAB_ONLY_REQUIRED",
      "Kubernetes injector requires LAB_ONLY runtime context"
    );
  }


  if (
    context.executionAuthorized ===
      true
  ) {
    throw runtimeError(
      "KUBERNETES_RUNTIME_CANNOT_AUTHORIZE",
      "Reliability Lab runtime cannot grant execution authorization"
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
      "KUBERNETES_RUNTIME_PLAN_REQUIRED",
      "Failure injection plan is required"
    );
  }


  if (
    plan.executionAuthorized ===
      true
  ) {
    throw runtimeError(
      "KUBERNETES_RUNTIME_PLAN_CANNOT_AUTHORIZE",
      "Failure injection plan cannot grant execution authorization"
    );
  }


  if (
    plan.evaluatorGroundTruthIncluded ===
      true
  ) {
    throw runtimeError(
      "KUBERNETES_RUNTIME_GROUND_TRUTH_FORBIDDEN",
      "Evaluator ground truth cannot enter the Kubernetes injection runtime"
    );
  }
}


function assertRealLabResource(
  resource
) {
  const labels =
    resource?.metadata
      ?.labels ||
    {};


  const namespace =
    resource?.metadata
      ?.namespace;


  if (
    namespace !==
    CANONICAL_LAB_NAMESPACE
  ) {
    throw runtimeError(
      "KUBERNETES_RUNTIME_REAL_TARGET_NAMESPACE_FORBIDDEN",
      `Resolved Kubernetes target is outside ${CANONICAL_LAB_NAMESPACE}`
    );
  }


  if (
    labels[
      "aira.reliability-lab"
    ] !==
      "true"
  ) {
    throw runtimeError(
      "KUBERNETES_RUNTIME_REAL_TARGET_NOT_LAB_RESOURCE",
      "Resolved Kubernetes target is not labelled as an AIRA Reliability Lab resource"
    );
  }


  if (
    labels[
      "aira.safety-class"
    ] !==
      "LAB_ONLY"
  ) {
    throw runtimeError(
      "KUBERNETES_RUNTIME_REAL_TARGET_NOT_LAB_ONLY",
      "Resolved Kubernetes target is not LAB_ONLY"
    );
  }
}


function requireKubernetesName(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||

    !/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/
      .test(
        value
      )
  ) {
    throw runtimeError(
      "KUBERNETES_RUNTIME_TARGET_NAME_INVALID",
      `${field} is not a valid Kubernetes resource name`
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
        "KubernetesReliabilityLabRuntimeError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  KUBERNETES_RUNTIME_VERSION,

  KubernetesReliabilityLabRuntime,

  assertRealLabResource,

  runtimeError,
};