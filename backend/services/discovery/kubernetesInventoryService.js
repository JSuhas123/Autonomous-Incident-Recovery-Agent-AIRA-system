"use strict";

const KubernetesResource =
  require("../../models/KubernetesResource");

const KubernetesClusterSnapshot =
  require("../../models/KubernetesClusterSnapshot");

class KubernetesInventoryService {
async persistDiscovery({
  tenantId,
  organizationId,
  environmentId,
  integrationId,
  discovery,
  durationMs = null,
}) {
  if (!tenantId) {
    throw Object.assign(
      new Error(
        "tenantId is required for Kubernetes inventory persistence"
      ),
      {
        code:
          "K8S_TENANT_CONTEXT_REQUIRED",
      }
    );
  }

  if (!organizationId) {
    throw Object.assign(
      new Error(
        "organizationId is required for Kubernetes inventory persistence"
      ),
      {
        code:
          "K8S_ORGANIZATION_CONTEXT_REQUIRED",
      }
    );
  }

  if (!environmentId) {
    throw Object.assign(
      new Error(
        "environmentId is required for Kubernetes inventory persistence"
      ),
      {
        code:
          "K8S_ENVIRONMENT_CONTEXT_REQUIRED",
      }
    );
  }

  if (!integrationId) {
    throw Object.assign(
      new Error(
        "integrationId is required for Kubernetes inventory persistence"
      ),
      {
        code:
          "K8S_INTEGRATION_CONTEXT_REQUIRED",
      }
    );
  }

  if (!discovery) {
    throw Object.assign(
      new Error(
        "discovery payload is required"
      ),
      {
        code:
          "K8S_DISCOVERY_REQUIRED",
      }
    );
  }

  const now =
    new Date();

  const resources = [
    ...this._normaliseNamespaces(
      discovery.namespaces || []
    ),

    ...this._normaliseDeployments(
      discovery.deployments || []
    ),

    ...this._normaliseReplicaSets(
      discovery.replicaSets || []
    ),

    ...this._normalisePods(
      discovery.pods || []
    ),

    ...this._normaliseServices(
      discovery.services || []
    ),

    ...this._normaliseNodes(
      discovery.nodes || []
    ),
  ];

  /**
   * Keep only the canonical resource identity fields
   * needed to determine whether an active resource
   * disappeared from the latest discovery.
   */
  const seenKeys =
    [];

  for (
    const resource
    of resources
  ) {
    if (!resource.name) {
      continue;
    }

    const key = {
      organizationId,

      environmentId,

      integrationId,

      kind:
        resource.kind,

      namespace:
        resource.namespace ||
        null,

      name:
        resource.name,
    };

    seenKeys.push({
      kind:
        resource.kind,

      namespace:
        resource.namespace ||
        null,

      name:
        resource.name,
    });

    await KubernetesResource
      .findOneAndUpdate(
        key,
        {
          $set: {
            tenantId,

            organizationId,

            environmentId,

            integrationId,

            uid:
              resource.uid ||
              null,

            labels:
              resource.labels ||
              {},

            metadata:
              resource.metadata ||
              {},

            status:
              resource.status ||
              {},

            spec:
              resource.spec ||
              {},

            discoveredAt:
              now,

            lastSeenAt:
              now,

            active:
              true,
          },

          $setOnInsert: {
            provider:
              "kubernetes",
          },
        },
        {
          upsert:
            true,

          new:
            true,

          setDefaultsOnInsert:
            true,
        }
      );
  }

  /**
   * Existing resources that disappeared from this exact
   * environment + integration become inactive.
   *
   * We never inspect inventory belonging to another
   * environment while performing stale-resource cleanup.
   */
  const activeResources =
    await KubernetesResource
      .find({
        organizationId,

        environmentId,

        integrationId,

        active:
          true,
      });

  for (
    const existing
    of activeResources
  ) {
    const stillPresent =
      seenKeys.some(
        (key) =>
          key.kind ===
            existing.kind &&
          (
            key.namespace ||
            null
          ) ===
            (
              existing.namespace ||
              null
            ) &&
          key.name ===
            existing.name
      );

    if (!stillPresent) {
      existing.active =
        false;

      await existing.save();
    }
  }

  /**
   * Every discovery produces an immutable environment-scoped
   * cluster snapshot.
   */
  const snapshot =
    await KubernetesClusterSnapshot
      .create({
        tenantId,

        organizationId,

        environmentId,

        integrationId,

        discoveredAt:
          now,

        summary: {
          namespaces:
            discovery.summary
              ?.namespaces ??
            0,

          deployments:
            discovery.summary
              ?.deployments ??
            0,

          replicaSets:
            discovery.summary
              ?.replicaSets ??
            0,

          pods:
            discovery.summary
              ?.pods ??
            0,

          services:
            discovery.summary
              ?.services ??
            0,

          nodes:
            discovery.summary
              ?.nodes ??
            0,

          unhealthyPods:
            discovery.summary
              ?.unhealthyPods ??
            0,

          unhealthyNodes:
            discovery.summary
              ?.unhealthyNodes ??
            0,
        },

        durationMs,

        success:
          true,

        error:
          null,
      });

  return {
    snapshotId:
      snapshot._id,

    environmentId:
      snapshot.environmentId,

    resourceCount:
      resources.length,

    activeResourceCount:
      seenKeys.length,

    summary:
      discovery.summary ||
      {},
  };
}
  // ───────────────────────────────────────────────────────────────────────────
  // Namespaces
  // ───────────────────────────────────────────────────────────────────────────

  _normaliseNamespaces(
    items
  ) {
    return items.map(
      (item) => ({
        kind:
          "namespace",

        name:
          item.name,

        namespace:
          null,

        uid:
          item.uid || null,

        labels:
          item.labels || {},

        status: {
          phase:
            item.phase ||
            null,
        },

        metadata: {
          annotations:
            item.annotations ||
            {},

          createdAt:
            item.createdAt ||
            null,
        },

        spec: {},
      })
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Deployments
  // ───────────────────────────────────────────────────────────────────────────

  _normaliseDeployments(
    items
  ) {
    return items.map(
      (item) => ({
        kind:
          "deployment",

        name:
          item.name,

        namespace:
          item.namespace ||
          null,

        uid:
          item.uid || null,

        labels:
          item.labels || {},

        status: {
          readyReplicas:
            item.readyReplicas ??
            0,

          availableReplicas:
            item.availableReplicas ??
            0,

          unavailableReplicas:
            item.unavailableReplicas ??
            0,

          updatedReplicas:
            item.updatedReplicas ??
            0,

          observedGeneration:
            item.observedGeneration ??
            null,

          conditions:
            item.conditions ||
            [],
        },

        spec: {
          replicas:
            item.replicas ??
            0,

          selector:
            item.selector ||
            {},

          containers:
            item.containers ||
            [],

          ownerReferences:
            item.ownerReferences ||
            [],

          revision:
            item.revision ||
            null,

          strategy:
            item.strategy ||
            {},
        },

        metadata: {
          annotations:
            item.annotations ||
            {},

          createdAt:
            item.createdAt ||
            null,
        },
      })
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ReplicaSets
  // ───────────────────────────────────────────────────────────────────────────

  _normaliseReplicaSets(
    items
  ) {
    return items.map(
      (item) => ({
        kind:
          "replicaset",

        name:
          item.name,

        namespace:
          item.namespace ||
          null,

        uid:
          item.uid ||
          null,

        labels:
          item.labels ||
          {},

        status: {
          replicas:
            item.replicas ??
            0,

          fullyLabeledReplicas:
            item.fullyLabeledReplicas ??
            0,

          readyReplicas:
            item.readyReplicas ??
            0,

          availableReplicas:
            item.availableReplicas ??
            0,
        },

        spec: {
          selector:
            item.selector ||
            {},

          revision:
            item.revision ||
            null,

          ownerReferences:
            item.ownerReferences ||
            [],

          containers:
            item.containers ||
            [],
        },

        metadata: {
          annotations:
            item.annotations ||
            {},

          createdAt:
            item.createdAt ||
            null,
        },
      })
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pods
  // ───────────────────────────────────────────────────────────────────────────

  _normalisePods(
    items
  ) {
    return items.map(
      (item) => ({
        kind:
          "pod",

        name:
          item.name,

        namespace:
          item.namespace ||
          null,

        uid:
          item.uid ||
          null,

        labels:
          item.labels ||
          {},

        status: {
          phase:
            item.phase ||
            null,

          reason:
            item.reason ||
            null,

          message:
            item.message ||
            null,

          podIP:
            item.podIP ||
            null,

          hostIP:
            item.hostIP ||
            null,

          qosClass:
            item.qosClass ||
            null,

          restartCount:
            item.restartCount ??
            0,

          readyContainers:
            item.readyContainers ??
            0,

          totalContainers:
            item.totalContainers ??
            0,

          startTime:
            item.startTime ||
            null,

          conditions:
            item.conditions ||
            [],

          failureSignals:
            item.failureSignals ||
            [],
        },

        spec: {
          nodeName:
            item.nodeName ||
            null,

          serviceAccountName:
            item.serviceAccountName ||
            null,

          restartPolicy:
            item.restartPolicy ||
            null,

          containers:
            item.containers ||
            [],

          initContainers:
            item.initContainers ||
            [],

          ownerReferences:
            item.ownerReferences ||
            [],
        },

        metadata: {
          annotations:
            item.annotations ||
            {},

          createdAt:
            item.createdAt ||
            null,
        },
      })
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Kubernetes Services
  // ───────────────────────────────────────────────────────────────────────────

  _normaliseServices(
    items
  ) {
    return items.map(
      (item) => ({
        kind:
          "service",

        name:
          item.name,

        namespace:
          item.namespace ||
          null,

        uid:
          item.uid ||
          null,

        labels:
          item.labels ||
          {},

        status: {},

        spec: {
          type:
            item.type ||
            null,

          clusterIP:
            item.clusterIP ||
            null,

          clusterIPs:
            item.clusterIPs ||
            [],

          externalIPs:
            item.externalIPs ||
            [],

          externalName:
            item.externalName ||
            null,

          selector:
            item.selector ||
            {},

          ports:
            item.ports ||
            [],

          ownerReferences:
            item.ownerReferences ||
            [],
        },

        metadata: {
          annotations:
            item.annotations ||
            {},

          createdAt:
            item.createdAt ||
            null,
        },
      })
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Nodes
  // ───────────────────────────────────────────────────────────────────────────

  _normaliseNodes(
    items
  ) {
    return items.map(
      (item) => ({
        kind:
          "node",

        name:
          item.name,

        namespace:
          null,

        uid:
          item.uid ||
          null,

        labels:
          item.labels ||
          {},

        status: {
          conditions:
            item.conditions ||
            [],

          capacity:
            item.capacity ||
            {},

          allocatable:
            item.allocatable ||
            {},

          addresses:
            item.addresses ||
            [],
        },

        spec: {
          unschedulable:
            Boolean(
              item.unschedulable
            ),

          taints:
            item.taints ||
            [],

          kubeletVersion:
            item.kubeletVersion ||
            null,

          kubeProxyVersion:
            item.kubeProxyVersion ||
            null,

          containerRuntimeVersion:
            item.containerRuntimeVersion ||
            null,

          kernelVersion:
            item.kernelVersion ||
            null,

          osImage:
            item.osImage ||
            null,

          operatingSystem:
            item.operatingSystem ||
            null,

          architecture:
            item.architecture ||
            null,
        },

        metadata: {
          annotations:
            item.annotations ||
            {},

          createdAt:
            item.createdAt ||
            null,
        },
      })
    );
  }
}

module.exports =
  new KubernetesInventoryService();