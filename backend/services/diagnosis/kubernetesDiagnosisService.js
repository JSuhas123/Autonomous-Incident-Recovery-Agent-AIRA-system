"use strict";

/**
 * Kubernetes Diagnosis Service
 *
 * Deterministic diagnosis helpers for common Kubernetes failure modes.
 *
 * This service does not execute infrastructure.
 * It converts investigation evidence into structured diagnosis candidates
 * for the V2 DiagnosisAgent.
 */

class KubernetesDiagnosisService {
  diagnose({
    incident,
    evidencePackage,
  }) {
    const evidenceItems =
      evidencePackage?.items || [];

    const kubernetesItems =
      evidenceItems.filter(
        (item) =>
          item.source === "aira-kubernetes-inventory" ||
          item.source === "aira-kubernetes-topology" ||
          item.source === "kubernetes-api"
      );

    const candidates = [];

    const podCandidate =
      this._diagnosePodFailure(
        kubernetesItems
      );

    if (podCandidate) {
      candidates.push(
        podCandidate
      );
    }

    const rolloutCandidate =
      this._diagnoseRolloutFailure(
        kubernetesItems
      );

    if (rolloutCandidate) {
      candidates.push(
        rolloutCandidate
      );
    }

    const nodeCandidate =
      this._diagnoseNodeFailure(
        kubernetesItems
      );

    if (nodeCandidate) {
      candidates.push(
        nodeCandidate
      );
    }

    candidates.sort(
      (a, b) =>
        b.confidence -
        a.confidence
    );

    return {
      incidentType:
        incident?.type ||
        incident?.incidentType ||
        "unknown",

      candidates,

      primary:
        candidates[0] ||
        null,
    };
  }

  _diagnosePodFailure(
    items
  ) {
    const podEvidence =
      items.find(
        (item) =>
          item.id?.startsWith(
            "ev-k8s-pod-"
          )
      );

    if (!podEvidence) {
      return null;
    }

    const data =
      podEvidence.structuredData ||
      {};

    const failureSignals =
      data.failureSignals ||
      [];

    // ─────────────────────────────────────────────────────────────
    // CrashLoopBackOff
    // ─────────────────────────────────────────────────────────────

    const crashLoop =
      failureSignals.find(
        (signal) =>
          signal.reason ===
          "CrashLoopBackOff"
      );

    if (crashLoop) {
      const previousTermination =
        failureSignals.find(
          (signal) =>
            signal.type ===
            "previous_termination"
        );

      return {
        code:
          "K8S_CRASH_LOOP_BACKOFF",

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
      };
    }

    // ─────────────────────────────────────────────────────────────
    // OOMKilled
    // ─────────────────────────────────────────────────────────────

    const oomKilled =
      failureSignals.find(
        (signal) =>
          signal.reason ===
          "OOMKilled"
      );

    if (oomKilled) {
      return {
        code:
          "K8S_OOM_KILLED",

        category:
          "resource_exhaustion",

        title:
          "Container terminated due to memory exhaustion",

        rootCause:
          "The container exceeded its available memory limit or the node experienced memory pressure.",

        confidence:
          0.98,

        severity:
          "high",

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
      };
    }

    // ─────────────────────────────────────────────────────────────
    // ImagePullBackOff / ErrImagePull
    // ─────────────────────────────────────────────────────────────

    const imagePull =
      failureSignals.find(
        (signal) =>
          [
            "ImagePullBackOff",
            "ErrImagePull",
          ].includes(
            signal.reason
          )
      );

    if (imagePull) {
      return {
        code:
          "K8S_IMAGE_PULL_FAILURE",

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

        evidence: {
          reason:
            imagePull.reason,

          message:
            imagePull.message ||
            null,
        },

        recommendedPlaybook:
          "k8s-image-pull-recovery",
      };
    }

    return null;
  }

  _diagnoseRolloutFailure(
    items
  ) {
    const ownership =
      items.find(
        (item) =>
          item.id?.startsWith(
            "ev-k8s-ownership-"
          )
      );

    const siblings =
      items.find(
        (item) =>
          item.id?.startsWith(
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
      };
    }

    return null;
  }

  _diagnoseNodeFailure(
    items
  ) {
    const nodeEvidence =
      items.find(
        (item) =>
          item.id?.startsWith(
            "ev-k8s-node-"
          )
      );

    const node =
      nodeEvidence
        ?.structuredData
        ?.node;

    if (!node) {
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
        ?.exitCode != null
    ) {
      return (
        `The application container repeatedly exits with code ` +
        `${previousTermination.exitCode} and Kubernetes restarts it.`
      );
    }

    return "The container repeatedly starts and exits, causing Kubernetes to enter CrashLoopBackOff.";
  }
}

module.exports =
  new KubernetesDiagnosisService();