"use strict";

const crypto =
  require("node:crypto");

const {
  KubernetesResource,
} = require(
  "../../persistence/operational/operationalModels"
);

const KubernetesClusterSnapshot =
  require(
    "../../persistence/operational/PostgresKubernetesClusterSnapshot"
  );

const kubernetesInventoryAdapter =
  require(
    "../inventory/kubernetesInventoryAdapter"
  );

class KubernetesInventoryService {
  async persistDiscovery({
    tenantId,
    organizationId,
    environmentId,
    integrationId,
    discovery,
    durationMs = null,
    syncCanonical = true,
    syncId = null,
  }) {
    this._validateContext({
      tenantId,
      organizationId,
      environmentId,
      integrationId,
      discovery,
    });

    const currentSyncId =
      syncId ||
      `k8s-discovery-${crypto.randomUUID()}`;

    const now =
      new Date();

    const resources = [
      ...this
        ._normaliseNamespaces(
          discovery.namespaces ||
          []
        ),

      ...this
        ._normaliseDeployments(
          discovery.deployments ||
          []
        ),

      ...this
        ._normaliseReplicaSets(
          discovery.replicaSets ||
          []
        ),

      ...this
        ._normalisePods(
          discovery.pods ||
          []
        ),

      ...this
        ._normaliseServices(
          discovery.services ||
          []
        ),

      ...this
        ._normaliseNodes(
          discovery.nodes ||
          []
        ),
    ];

    const seenKeys =
      [];

    /*
     * ========================================================================
     * PHASE A â€” PROVIDER INVENTORY
     * ========================================================================
     *
     * All provider records are persisted BEFORE anything is marked inactive.
     *
     * If one write fails, this method throws and provider stale cleanup,
     * canonical reconciliation and snapshot finalization are skipped.
     */

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

            runValidators:
              true,
          }
        );
    }

    /*
     * ========================================================================
     * PHASE B â€” PROVIDER RECONCILIATION
     * ========================================================================
     *
     * Reached only if every discovered provider resource was persisted.
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

    let inactiveCount =
      0;

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

        inactiveCount++;
      }
    }

    /*
     * ========================================================================
     * PHASE C â€” CANONICAL INVENTORY
     * ========================================================================
     */

    let canonicalInventory =
      null;

    if (syncCanonical) {
      canonicalInventory =
        await kubernetesInventoryAdapter
          .syncResources({
            tenantId,

            organizationId,

            environmentId,

            integrationId,

            /*
             * Same discovery run ID is propagated to canonical inventory.
             */
            syncId:
              currentSyncId,
          });
    }

    /*
     * ========================================================================
     * PHASE D â€” SUCCESS SNAPSHOT
     * ========================================================================
     *
     * Snapshot is written AFTER provider + canonical persistence succeeds.
     *
     * Therefore success=true means inventory reconciliation actually
     * completed rather than merely Kubernetes API discovery completing.
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
      syncId:
        currentSyncId,

      snapshotId:
        snapshot._id,

      environmentId:
        snapshot.environmentId,

      resourceCount:
        resources.length,

      activeResourceCount:
        seenKeys.length,

      inactiveResourceCount:
        inactiveCount,

      summary:
        discovery.summary ||
        {},

      canonicalInventory,
    };
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  _validateContext({
    tenantId,
    organizationId,
    environmentId,
    integrationId,
    discovery,
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

    if (
      !discovery ||
      typeof discovery !==
        "object"
    ) {
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

    const requiredArrays = [
      "namespaces",
      "deployments",
      "replicaSets",
      "pods",
      "services",
      "nodes",
    ];

    for (
      const field
      of requiredArrays
    ) {
      if (
        discovery[field] !==
          undefined &&
        !Array.isArray(
          discovery[field]
        )
      ) {
        throw Object.assign(
          new Error(
            `Invalid Kubernetes discovery field: ${field}`
          ),
          {
            code:
              "K8S_DISCOVERY_INVALID",
          }
        );
      }
    }
  }

  // KEEP ALL YOUR EXISTING _normaliseNamespaces,
  // _normaliseDeployments, _normaliseReplicaSets,
  // _normalisePods, _normaliseServices and _normaliseNodes
  // METHODS HERE UNCHANGED.
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
          item.uid ||
          null,

        labels:
          item.labels ||
          {},

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

  // ==========================================================================
  // DEPLOYMENTS
  // ==========================================================================

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
          item.uid ||
          null,

        labels:
          item.labels ||
          {},

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

  // ==========================================================================
  // REPLICASETS
  // ==========================================================================

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
            item
              .fullyLabeledReplicas ??
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

  // ==========================================================================
  // PODS
  // ==========================================================================

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
            item
              .serviceAccountName ||
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

  // ==========================================================================
  // KUBERNETES SERVICES
  // ==========================================================================

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

  // ==========================================================================
  // NODES
  // ==========================================================================

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
            item
              .kubeProxyVersion ||
            null,

          containerRuntimeVersion:
            item
              .containerRuntimeVersion ||
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

module.exports
  .KubernetesInventoryService =
  KubernetesInventoryService;
