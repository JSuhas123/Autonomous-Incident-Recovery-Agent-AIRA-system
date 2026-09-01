"use strict";

/**
 * Kubernetes Diagnosis Service
 *
 * Deterministic diagnosis helpers for common Kubernetes failure modes.
 *
 * IMPORTANT:
 *
 * - READ-ONLY diagnosis.
 * - Does not execute infrastructure.
 * - Does not select/execute playbooks.
 * - Does not authorize recovery.
 * - Does not consume Reliability Lab ground truth.
 * - Classification comes only from observable Kubernetes evidence.
 */

class KubernetesDiagnosisService {
  diagnose({
    incident,
    evidencePackage,
  }) {
    const evidenceItems =
      Array.isArray(
        evidencePackage?.items
      )
        ? evidencePackage.items
        : [];

    /*
     * Accept canonical Kubernetes inventory/API evidence plus persisted
     * Kubernetes signals.
     *
     * Persisted signal evidence is important because a terminated pod can
     * disappear from the live API before diagnosis runs.
     */
    const kubernetesItems =
      evidenceItems.filter(
        (item) =>
          isKubernetesEvidence(
            item
          )
      );

    const candidates =
      [];

    const podCandidate =
      this._diagnosePodFailure(
        kubernetesItems
      );

    if (
      podCandidate
    ) {
      candidates.push(
        podCandidate
      );
    }

    const replacementCandidate =
      this._diagnosePodReplacement(
        kubernetesItems
      );

    if (
      replacementCandidate
    ) {
      candidates.push(
        replacementCandidate
      );
    }

    const rolloutCandidate =
      this._diagnoseRolloutFailure(
        kubernetesItems
      );

    if (
      rolloutCandidate
    ) {
      candidates.push(
        rolloutCandidate
      );
    }

    const nodeCandidate =
      this._diagnoseNodeFailure(
        kubernetesItems
      );

    if (
      nodeCandidate
    ) {
      candidates.push(
        nodeCandidate
      );
    }

    const deduplicated =
      deduplicateCandidates(
        candidates
      );

    deduplicated.sort(
      (
        left,
        right
      ) =>
        Number(
          right.confidence ||
          0
        ) -
        Number(
          left.confidence ||
          0
        )
    );

    return {
      incidentType:
        incident?.type ||
        incident?.incidentType ||
        "unknown",

      candidates:
        deduplicated,

      primary:
        deduplicated[0] ||
        null,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // POD FAILURE
  // ==========================================================================

  _diagnosePodFailure(
    items
  ) {
    const podEvidence =
      items.find(
        (item) =>
          hasPodFailureSignals(
            item
          )
      );

    if (
      !podEvidence
    ) {
      return null;
    }

    const data =
      podEvidence
        .structuredData ||
      {};

    const failureSignals =
      Array.isArray(
        data.failureSignals
      )
        ? data.failureSignals
        : [];

    // ------------------------------------------------------------------------
    // CrashLoopBackOff
    // ------------------------------------------------------------------------

    const crashLoop =
      failureSignals.find(
        (signal) =>
          String(
            signal?.reason ||
            ""
          ) ===
          "CrashLoopBackOff"
      );

    if (
      crashLoop
    ) {
      const previousTermination =
        failureSignals.find(
          (signal) =>
            signal?.type ===
            "previous_termination"
        );

      return {
        code:
          "K8S_CRASH_LOOP_BACKOFF",

        failureModeKey:
          "kubernetes.pod.crashloopbackoff",

        category:
          "container_failure",

        title:
          "Container repeatedly crashing",

        rootCause:
          this._crashLoopRootCause(
            previousTermination
          ),

        confidence:
          previousTermination
            ? 0.97
            : 0.92,

        severity:
          "high",

        evidenceIds: [
          podEvidence.id,
        ]
          .filter(
            Boolean
          ),

        evidence: {
          reason:
            "CrashLoopBackOff",

          previousTermination:
            previousTermination ||
            null,

          restartCount:
            data.restartCount ??
            0,

          conditions:
            data.conditions ||
            [],
        },

        recommendedPlaybook:
          "k8s-crashloopbackoff-recovery",

        executionAuthorized:
          false,
      };
    }

    // ------------------------------------------------------------------------
    // OOMKilled
    // ------------------------------------------------------------------------

    const oomKilled =
      failureSignals.find(
        (signal) =>
          String(
            signal?.reason ||
            ""
          ) ===
          "OOMKilled"
      );

    if (
      oomKilled
    ) {
      return {
        code:
          "K8S_OOM_KILLED",

        failureModeKey:
          "kubernetes.pod.oom",

        category:
          "resource_exhaustion",

        title:
          "Container terminated due to memory exhaustion",

        rootCause:
          "The container was terminated after exceeding its available memory limit or encountering memory pressure.",

        confidence:
          0.98,

        severity:
          "high",

        evidenceIds: [
          podEvidence.id,
        ]
          .filter(
            Boolean
          ),

        evidence: {
          reason:
            "OOMKilled",

          exitCode:
            oomKilled.exitCode ??
            null,

          restartCount:
            data.restartCount ??
            0,

          containers:
            data.containers ||
            [],
        },

        recommendedPlaybook:
          "k8s-oomkilled-recovery",

        executionAuthorized:
          false,
      };
    }

    // ------------------------------------------------------------------------
    // ImagePullBackOff / ErrImagePull
    // ------------------------------------------------------------------------

    const imagePull =
      failureSignals.find(
        (signal) =>
          [
            "ImagePullBackOff",
            "ErrImagePull",
          ]
            .includes(
              String(
                signal?.reason ||
                ""
              )
            )
      );

    if (
      imagePull
    ) {
      return {
        code:
          "K8S_IMAGE_PULL_FAILURE",

        failureModeKey:
          "kubernetes.image.pull_failure",

        category:
          "image_failure",

        title:
          "Container image could not be pulled",

        rootCause:
          "Kubernetes could not retrieve the configured container image.",

        confidence:
          0.97,

        severity:
          "high",

        evidenceIds: [
          podEvidence.id,
        ]
          .filter(
            Boolean
          ),

        evidence: {
          reason:
            imagePull.reason,

          message:
            imagePull.message ||
            null,
        },

        recommendedPlaybook:
          "k8s-image-pull-recovery",

        executionAuthorized:
          false,
      };
    }

    // ------------------------------------------------------------------------
    // Explicit previous Error termination
    // ------------------------------------------------------------------------

    const previousError =
      failureSignals.find(
        (signal) =>
          signal?.type ===
            "previous_termination" &&
          (
            String(
              signal?.reason ||
              ""
            ) ===
              "Error" ||
            (
              signal?.exitCode !==
                null &&
              signal?.exitCode !==
                undefined &&
              Number(
                signal.exitCode
              ) !==
                0
            )
          )
      );

    if (
      previousError
    ) {
      return {
        code:
          "K8S_POD_CRASH",

        failureModeKey:
          "kubernetes.pod.crash",

        category:
          "container_failure",

        title:
          "Kubernetes pod container terminated unexpectedly",

        rootCause:
          previousError.reason ===
            "Error"
            ? "The Kubernetes workload container terminated with an application error."
            : `The Kubernetes workload container terminated with non-zero exit code ${previousError.exitCode}.`,

        confidence:
          0.95,

        severity:
          "high",

        evidenceIds: [
          podEvidence.id,
        ]
          .filter(
            Boolean
          ),

        evidence: {
          reason:
            previousError.reason ||
            "Error",

          exitCode:
            previousError.exitCode ??
            null,

          restartCount:
            data.restartCount ??
            0,
        },

        executionAuthorized:
          false,
      };
    }

    return null;
  }


  // ==========================================================================
  // OBSERVED POD REPLACEMENT
  // ==========================================================================

  _diagnosePodReplacement(
    items
  ) {
    const observations =
      items
        .map(
          normalizePodReplacementObservation
        )
        .filter(
          Boolean
        );

    if (
      observations.length ===
      0
    ) {
      return null;
    }

    /*
     * We require actual before/after identity evidence.
     *
     * Merely seeing the string "pod replacement" is not enough.
     */
    const strongObservation =
      observations.find(
        (observation) =>
          observation.oldPodUid &&
          observation.newPodUid &&
          observation.oldPodUid !==
            observation.newPodUid
      );

    if (
      !strongObservation
    ) {
      return null;
    }

    /*
     * A replacement accompanied by an explicit rollout/change marker must
     * not be labelled as a crash.
     */
    if (
      strongObservation
        .plannedRollout ===
        true ||
      strongObservation
        .deploymentChanged ===
        true
    ) {
      return null;
    }

    /*
     * This diagnosis is based on independently observable before/after pod
     * identity, not Reliability Lab experiment metadata.
     *
     * It represents an unexpected workload pod termination followed by
     * controller replacement.
     */
    return {
      code:
        "K8S_POD_CRASH",

      failureModeKey:
        "kubernetes.pod.crash",

      category:
        "container_failure",

      title:
        "Kubernetes workload pod terminated and was replaced",

      rootCause:
        "A previously running Kubernetes workload pod disappeared and a different pod instance replaced it without evidence of a planned rollout.",

      confidence:
        strongObservation
          .replacementReady ===
          true
          ? 0.88
          : 0.82,

      severity:
        "high",

      evidenceIds:
        strongObservation
          .evidenceId
          ? [
              strongObservation
                .evidenceId,
            ]
          : [],

      evidence: {
        namespace:
          strongObservation
            .namespace,

        workload:
          strongObservation
            .workload,

        oldPodName:
          strongObservation
            .oldPodName,

        oldPodUid:
          strongObservation
            .oldPodUid,

        newPodName:
          strongObservation
            .newPodName,

        newPodUid:
          strongObservation
            .newPodUid,

        replacementReady:
          strongObservation
            .replacementReady,

        plannedRollout:
          false,
      },

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // ROLLOUT
  // ==========================================================================

  _diagnoseRolloutFailure(
    items
  ) {
    const ownership =
      items.find(
        (item) =>
          String(
            item?.id ||
            ""
          )
            .startsWith(
              "k8s-ownership:"
            ) ||
          String(
            item?.id ||
            ""
          )
            .startsWith(
              "ev-k8s-ownership-"
            )
      );

    const siblings =
      items.find(
        (item) =>
          String(
            item?.id ||
            ""
          )
            .startsWith(
              "k8s-siblings:"
            ) ||
          String(
            item?.id ||
            ""
          )
            .startsWith(
              "ev-k8s-siblings-"
            )
      );

    if (
      !ownership ||
      !siblings
    ) {
      return null;
    }

    const deployment =
      ownership
        .structuredData
        ?.deployment;

    const health =
      siblings
        .structuredData
        ?.health;

    if (
      !deployment ||
      !health
    ) {
      return null;
    }

    const desired =
      deployment.spec
        ?.replicas ??
      deployment.status
        ?.replicas ??
      0;

    const ready =
      deployment.status
        ?.readyReplicas ??
      0;

    const unavailable =
      deployment.status
        ?.unavailableReplicas ??
      0;

    if (
      desired > 0 &&
      (
        ready <
          desired ||
        unavailable >
          0
      )
    ) {
      return {
        code:
          "K8S_FAILED_ROLLOUT",

        failureModeKey:
          "kubernetes.deployment.failed_rollout",

        category:
          "deployment_failure",

        title:
          "Deployment rollout is unhealthy",

        rootCause:
          "The deployment has not reached its desired ready replica count.",

        confidence:
          0.9,

        severity:
          "high",

        evidenceIds: [
          ownership.id,
          siblings.id,
        ]
          .filter(
            Boolean
          ),

        evidence: {
          deployment:
            deployment.name,

          desiredReplicas:
            desired,

          readyReplicas:
            ready,

          unavailableReplicas:
            unavailable,

          revision:
            deployment.spec
              ?.revision ||
            null,

          siblingHealth:
            health,
        },

        recommendedPlaybook:
          "k8s-failed-rollout-recovery",

        executionAuthorized:
          false,
      };
    }

    return null;
  }


  // ==========================================================================
  // NODE
  // ==========================================================================

  _diagnoseNodeFailure(
    items
  ) {
    const nodeEvidence =
      items.find(
        (item) =>
          String(
            item?.id ||
            ""
          )
            .startsWith(
              "k8s-node:"
            ) ||
          String(
            item?.id ||
            ""
          )
            .startsWith(
              "ev-k8s-node-"
            )
      );

    const node =
      nodeEvidence
        ?.structuredData
        ?.node;

    if (
      !node
    ) {
      return null;
    }

    const ready =
      node.status
        ?.conditions
        ?.find(
          (condition) =>
            condition.type ===
            "Ready"
        );

    if (
      ready &&
      ready.status ===
        "True"
    ) {
      return null;
    }

    return {
      code:
        "K8S_NODE_NOT_READY",

      failureModeKey:
        "kubernetes.node.not_ready",

      category:
        "node_failure",

      title:
        "Pod is running on an unhealthy node",

      rootCause:
        "The Kubernetes node hosting the workload is not reporting Ready status.",

      confidence:
        0.88,

      severity:
        "high",

      evidenceIds: [
        nodeEvidence.id,
      ]
        .filter(
          Boolean
        ),

      evidence: {
        node:
          node.name,

        conditions:
          node.status
            ?.conditions ||
          [],
      },

      recommendedPlaybook:
        "k8s-node-not-ready-recovery",

      executionAuthorized:
        false,
    };
  }


  _crashLoopRootCause(
    previousTermination
  ) {
    if (
      previousTermination
        ?.reason ===
      "OOMKilled"
    ) {
      return "The container is repeatedly restarting after being terminated for exceeding its memory limit.";
    }

    if (
      previousTermination
        ?.reason ===
      "Error"
    ) {
      return "The application process repeatedly exits with an error and Kubernetes restarts the container.";
    }

    if (
      previousTermination
        ?.exitCode !==
        null &&
      previousTermination
        ?.exitCode !==
        undefined
    ) {
      return (
        "The application container repeatedly exits with code " +
        `${previousTermination.exitCode} and Kubernetes restarts it.`
      );
    }

    return "The container repeatedly starts and exits, causing Kubernetes to enter CrashLoopBackOff.";
  }
}


// ============================================================================
// EVIDENCE HELPERS
// ============================================================================

function isKubernetesEvidence(
  item
) {
  if (
    !item ||
    typeof item !==
      "object"
  ) {
    return false;
  }

  const source =
    String(
      item.source ||
      ""
    )
      .trim()
      .toLowerCase();

  const provider =
    String(
      item.provider ||
      item.structuredData
        ?.provider ||
      ""
    )
      .trim()
      .toLowerCase();

  const type =
    String(
      item.type ||
      ""
    )
      .trim()
      .toLowerCase();

  const eventType =
    String(
      item.structuredData
        ?.eventType ||
      ""
    )
      .trim()
      .toLowerCase();

  return (
    source ===
      "aira-kubernetes-inventory" ||
    source ===
      "aira-kubernetes-topology" ||
    source ===
      "kubernetes-api" ||
    source ===
      "kubernetes" ||
    provider ===
      "kubernetes" ||
    type.includes(
      "kubernetes"
    ) ||
    eventType.startsWith(
      "kubernetes."
    )
  );
}


function hasPodFailureSignals(
  item
) {
  return (
    Array.isArray(
      item?.structuredData
        ?.failureSignals
    ) &&
    item
      .structuredData
      .failureSignals
      .length >
      0
  );
}

function normalizePodReplacementObservation(
  item
) {
  if (
    !item ||
    typeof item !==
      "object"
  ) {
    return null;
  }


  const data =
    item.structuredData &&
    typeof item.structuredData ===
      "object"
      ? item.structuredData
      : {};


  const attributes =
    data.attributes &&
    typeof data.attributes ===
      "object"
      ? data.attributes
      : {};


  const kubernetes =
    attributes.kubernetes &&
    typeof attributes.kubernetes ===
      "object"
      ? attributes.kubernetes
      : {};


  const resource =
    data.resource &&
    typeof data.resource ===
      "object"
      ? data.resource
      : (
          item.resource &&
          typeof item.resource ===
            "object"
            ? item.resource
            : {}
        );


  // ==========================================================================
  // EVENT IDENTITY
  // ==========================================================================

  const eventType =
    firstNonEmpty(
      data.eventType,

      item.eventType,

      attributes.eventType,

      attributes.event_type,

      kubernetes.eventType,

      kubernetes.event_type
    );


  const normalizedEventType =
    String(
      eventType ||
      ""
    )
      .trim()
      .toLowerCase();


  const looksLikeReplacement =
    [
      "kubernetes.pod.replacement",
      "kubernetes.pod.replaced",
      "pod.replacement",
      "pod.replaced",
    ]
      .includes(
        normalizedEventType
      ) ||
    (
      normalizedEventType.includes(
        "pod"
      ) &&
      (
        normalizedEventType.includes(
          "replacement"
        ) ||
        normalizedEventType.includes(
          "replaced"
        )
      )
    );


  if (
    !looksLikeReplacement
  ) {
    return null;
  }


  // ==========================================================================
  // ORIGINAL POD
  // ==========================================================================

  const oldPodUid =
    firstNonEmpty(
      kubernetes.originalUid,

      kubernetes.originalPodUid,

      kubernetes.original_pod_uid,

      kubernetes.previousUid,

      kubernetes.previousPodUid,

      attributes.originalUid,

      attributes.oldPodUid,

      attributes.old_pod_uid,

      attributes.previousPodUid,

      attributes.previous_pod_uid,

      resource.originalUid,

      resource.oldPodUid,

      resource.previousPodUid
    );


  const oldPodName =
    firstNonEmpty(
      kubernetes.originalPod,

      kubernetes.originalPodName,

      kubernetes.original_pod,

      kubernetes.original_pod_name,

      kubernetes.previousPod,

      kubernetes.previousPodName,

      attributes.originalPod,

      attributes.oldPodName,

      attributes.old_pod_name,

      attributes.previousPodName,

      resource.originalPod,

      resource.oldPodName,

      resource.previousPodName,

      resource.pod
    );


  // ==========================================================================
  // REPLACEMENT POD
  // ==========================================================================

  const newPodUid =
    firstNonEmpty(
      kubernetes.replacementUid,

      kubernetes.replacementPodUid,

      kubernetes.replacement_pod_uid,

      kubernetes.newUid,

      kubernetes.newPodUid,

      attributes.replacementUid,

      attributes.newPodUid,

      attributes.new_pod_uid,

      attributes.replacementPodUid,

      attributes.replacement_pod_uid,

      resource.replacementUid,

      resource.newPodUid,

      resource.replacementPodUid
    );


  const newPodName =
    firstNonEmpty(
      kubernetes.replacementPod,

      kubernetes.replacementPodName,

      kubernetes.replacement_pod,

      kubernetes.replacement_pod_name,

      kubernetes.newPod,

      kubernetes.newPodName,

      attributes.replacementPod,

      attributes.newPodName,

      attributes.new_pod_name,

      attributes.replacementPodName,

      resource.replacementPod,

      resource.newPodName,

      resource.replacementPodName
    );


  // ==========================================================================
  // RESOURCE CONTEXT
  // ==========================================================================

  const namespace =
    firstNonEmpty(
      kubernetes.namespace,

      attributes.namespace,

      resource.namespace
    );


  const workload =
    firstNonEmpty(
      kubernetes.workload,

      kubernetes.deployment,

      attributes.workload,

      attributes.deployment,

      attributes.service,

      resource.deployment,

      resource.workload,

      resource.serviceName
    );


  // ==========================================================================
  // CHANGE / ROLLOUT EVIDENCE
  // ==========================================================================

  /*
   * These fields are intentionally optional.
   *
   * If a canonical signal explicitly says that a rollout/deployment change
   * occurred, KubernetesDiagnosisService must NOT classify the replacement
   * as an unexpected pod crash.
   */

  const plannedRollout =
    booleanOrNull(
      firstDefined(
        kubernetes.plannedRollout,

        kubernetes.planned_rollout,

        kubernetes.rollout,

        attributes.plannedRollout,

        attributes.planned_rollout,

        attributes.rollout
      )
    );


  const deploymentChanged =
    booleanOrNull(
      firstDefined(
        kubernetes.deploymentChanged,

        kubernetes.deployment_changed,

        kubernetes.generationChanged,

        kubernetes.generation_changed,

        attributes.deploymentChanged,

        attributes.deployment_changed,

        attributes.generationChanged,

        attributes.generation_changed
      )
    );


  const replacementReady =
    booleanOrNull(
      firstDefined(
        kubernetes.replacementReady,

        kubernetes.replacement_ready,

        kubernetes.newPodReady,

        kubernetes.new_pod_ready,

        attributes.replacementReady,

        attributes.replacement_ready,

        attributes.newPodReady,

        attributes.new_pod_ready
      )
    );


  // ==========================================================================
  // FAIL CLOSED
  // ==========================================================================

  /*
   * A replacement diagnosis requires two independently observable pod
   * identities.
   *
   * We do NOT infer a crash from the event name alone.
   */

  if (
    !oldPodUid ||
    !newPodUid
  ) {
    return null;
  }


  if (
    String(
      oldPodUid
    ) ===
    String(
      newPodUid
    )
  ) {
    return null;
  }


  return {
    evidenceId:
      item.id ||
      null,

    namespace:
      namespace ||
      null,

    workload:
      workload ||
      null,

    oldPodName:
      oldPodName ||
      null,

    oldPodUid:
      String(
        oldPodUid
      ),

    newPodName:
      newPodName ||
      null,

    newPodUid:
      String(
        newPodUid
      ),

    plannedRollout,

    deploymentChanged,

    replacementReady,

    eventType:
      normalizedEventType,

    executionAuthorized:
      false,
  };
}


function deduplicateCandidates(
  candidates
) {
  const byIdentity =
    new Map();

  for (
    const candidate
    of candidates
  ) {
    if (
      !candidate
    ) {
      continue;
    }

    const key =
      candidate
        .failureModeKey ||
      candidate.code;

    const existing =
      byIdentity.get(
        key
      );

    if (
      !existing ||
      Number(
        candidate.confidence ||
        0
      ) >
      Number(
        existing.confidence ||
        0
      )
    ) {
      byIdentity.set(
        key,
        candidate
      );
    }
  }

  return Array.from(
    byIdentity.values()
  );
}


function firstNonEmpty(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value !==
        null &&
      value !==
        undefined &&
      String(
        value
      )
        .trim() !==
        ""
    ) {
      return value;
    }
  }

  return null;
}


function firstDefined(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value !==
        undefined &&
      value !==
        null
    ) {
      return value;
    }
  }

  return null;
}


function booleanOrNull(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  if (
    typeof value ===
      "boolean"
  ) {
    return value;
  }

  const normalized =
    String(
      value
    )
      .trim()
      .toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
    ]
      .includes(
        normalized
      )
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
    ]
      .includes(
        normalized
      )
  ) {
    return false;
  }

  return null;
}


module.exports =
  new KubernetesDiagnosisService();