"use strict";
const crypto =
  require("node:crypto");

const {
  KubernetesResource,
} = require(
  "../../persistence/operational/operationalModels"
);

const {
  KubernetesResourceRelation,
} = require(
  "../../persistence/operational/operationalModels"
);

const kubernetesInventoryAdapter =
  require(
    "../inventory/kubernetesInventoryAdapter"
  );

class KubernetesRelationshipService {
  async rebuildRelationships({
    tenantId,
  organizationId,
  environmentId,
  integrationId,
  syncCanonical = true,
  syncId = null,
  }) {
    this._validateContext({
      tenantId,
      organizationId,
      environmentId,
      integrationId,
    });

    const currentSyncId =
      syncId ||
      `k8s-topology-${crypto.randomUUID()}`;

    const resources =
      await KubernetesResource
        .find({
          organizationId,
          environmentId,
          integrationId,

          active:
            true,
        })
        .lean();

    const services =
      resources.filter(
        (resource) =>
          resource.kind ===
          "service"
      );

    const deployments =
      resources.filter(
        (resource) =>
          resource.kind ===
          "deployment"
      );

    const replicaSets =
      resources.filter(
        (resource) =>
          resource.kind ===
          "replicaset"
      );

    const pods =
      resources.filter(
        (resource) =>
          resource.kind ===
          "pod"
      );

    const nodes =
      resources.filter(
        (resource) =>
          resource.kind ===
          "node"
      );

    const seenRelations =
      [];

    // ========================================================================
    // LOOKUP MAPS
    // ========================================================================

    const deploymentByUid =
      new Map(
        deployments
          .filter(
            (deployment) =>
              deployment.uid
          )
          .map(
            (deployment) => [
              String(
                deployment.uid
              ),

              deployment,
            ]
          )
      );

    const replicaSetByUid =
      new Map(
        replicaSets
          .filter(
            (replicaSet) =>
              replicaSet.uid
          )
          .map(
            (replicaSet) => [
              String(
                replicaSet.uid
              ),

              replicaSet,
            ]
          )
      );

    const nodeByName =
      new Map(
        nodes
          .filter(
            (node) =>
              node.name
          )
          .map(
            (node) => [
              node.name,

              node,
            ]
          )
      );

    // ========================================================================
    // SERVICE -> POD
    // ========================================================================

    for (
      const service
      of services
    ) {
      const selector =
        service.spec
          ?.selector ||
        {};

      if (
        Object.keys(
          selector
        ).length === 0
      ) {
        continue;
      }

      for (
        const pod
        of pods
      ) {
        if (
          service.namespace !==
          pod.namespace
        ) {
          continue;
        }

        if (
          this._labelsMatch(
            selector,
            pod.labels ||
              {}
          )
        ) {
          seenRelations.push({
            source:
              service,

            target:
              pod,

            relationType:
              "service_selects_pod",

            confidence:
              1,

            evidence: {
              method:
                "service_selector",

              selector,

              podLabels:
                pod.labels ||
                {},
            },
          });
        }
      }
    }

    // ========================================================================
    // DEPLOYMENT -> REPLICASET
    // ========================================================================

    for (
      const replicaSet
      of replicaSets
    ) {
      const owners =
        replicaSet.spec
          ?.ownerReferences ||
        [];

      const owner =
        owners.find(
          (reference) =>
            reference.kind ===
              "Deployment" &&
            reference.controller ===
              true
        );

      if (!owner) {
        continue;
      }

      const deployment =
        deploymentByUid.get(
          String(
            owner.uid
          )
        );

      if (!deployment) {
        continue;
      }

      if (
        deployment.namespace !==
        replicaSet.namespace
      ) {
        continue;
      }

      seenRelations.push({
        source:
          deployment,

        target:
          replicaSet,

        relationType:
          "deployment_owns_replicaset",

        confidence:
          1,

        evidence: {
          method:
            "ownerReference",

          ownerKind:
            owner.kind,

          ownerName:
            owner.name,

          ownerUid:
            owner.uid,
        },
      });
    }

    // ========================================================================
    // REPLICASET -> POD
    // ========================================================================

    const podsWithOwners =
      new Set();

    for (
      const pod
      of pods
    ) {
      const owners =
        pod.spec
          ?.ownerReferences ||
        [];

      const owner =
        owners.find(
          (reference) =>
            reference.kind ===
              "ReplicaSet" &&
            reference.controller ===
              true
        );

      if (!owner) {
        continue;
      }

      const replicaSet =
        replicaSetByUid.get(
          String(
            owner.uid
          )
        );

      if (!replicaSet) {
        continue;
      }

      if (
        replicaSet.namespace !==
        pod.namespace
      ) {
        continue;
      }

      seenRelations.push({
        source:
          replicaSet,

        target:
          pod,

        relationType:
          "replicaset_owns_pod",

        confidence:
          1,

        evidence: {
          method:
            "ownerReference",

          ownerKind:
            owner.kind,

          ownerName:
            owner.name,

          ownerUid:
            owner.uid,
        },
      });

      podsWithOwners.add(
        String(
          pod._id
        )
      );
    }

    // ========================================================================
    // DEPLOYMENT -> POD FALLBACK
    // ========================================================================

    for (
      const deployment
      of deployments
    ) {
      const selector =
        deployment.spec
          ?.selector ||
        {};

      if (
        Object.keys(
          selector
        ).length === 0
      ) {
        continue;
      }

      for (
        const pod
        of pods
      ) {
        if (
          podsWithOwners.has(
            String(
              pod._id
            )
          )
        ) {
          continue;
        }

        if (
          deployment.namespace !==
          pod.namespace
        ) {
          continue;
        }

        if (
          this._labelsMatch(
            selector,
            pod.labels ||
              {}
          )
        ) {
          seenRelations.push({
            source:
              deployment,

            target:
              pod,

            relationType:
              "deployment_owns_pod",

            confidence:
              0.8,

            evidence: {
              method:
                "label_selector_fallback",

              selector,

              podLabels:
                pod.labels ||
                {},
            },
          });
        }
      }
    }

    // ========================================================================
    // POD -> NODE
    // ========================================================================

    for (
      const pod
      of pods
    ) {
      const nodeName =
        pod.spec
          ?.nodeName;

      if (!nodeName) {
        continue;
      }

      const node =
        nodeByName.get(
          nodeName
        );

      if (!node) {
        continue;
      }

      seenRelations.push({
        source:
          pod,

        target:
          node,

        relationType:
          "pod_runs_on_node",

        confidence:
          1,

        evidence: {
          method:
            "pod_spec_nodeName",

          nodeName,
        },
      });
    }

       // ========================================================================
    // PHASE A — PERSIST PROVIDER RELATIONSHIPS
    // ========================================================================

    const now =
      new Date();

    const activeRelationKeys =
      [];

    for (
      const relation
      of seenRelations
    ) {
      const key = {
        organizationId,
        environmentId,
        integrationId,

        sourceResourceId:
          relation.source._id,

        targetResourceId:
          relation.target._id,

        relationType:
          relation
            .relationType,
      };

      activeRelationKeys.push(
        key
      );

      await KubernetesResourceRelation
        .findOneAndUpdate(
          key,
          {
            $set: {
              tenantId,

              organizationId,

              environmentId,

              integrationId,

              confidence:
                relation
                  .confidence ??
                1,

              evidence:
                relation.evidence ||
                {},

              active:
                true,

              lastSeenAt:
                now,
            },

            $setOnInsert: {
              discoveredAt:
                now,
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

    // ========================================================================
    // PHASE B — RECONCILE PROVIDER RELATIONSHIPS
    // ========================================================================

    const existingRelations =
      await KubernetesResourceRelation
        .find({
          organizationId,
          environmentId,
          integrationId,

          active:
            true,
        });

    let staleCount =
      0;

    for (
      const existing
      of existingRelations
    ) {
      const stillExists =
        activeRelationKeys.some(
          (key) =>
            String(
              key
                .sourceResourceId
            ) ===
              String(
                existing
                  .sourceResourceId
              ) &&
            String(
              key
                .targetResourceId
            ) ===
              String(
                existing
                  .targetResourceId
              ) &&
            key.relationType ===
              existing
                .relationType
        );

      if (!stillExists) {
        existing.active =
          false;

        await existing.save();

        staleCount++;
      }
    }

    // ========================================================================
    // PHASE C — CANONICAL GRAPH
    // ========================================================================

    let canonicalRelationships =
      null;

    if (syncCanonical) {
      canonicalRelationships =
        await kubernetesInventoryAdapter
          .syncRelationships({
            tenantId,

            organizationId,

            environmentId,

            integrationId,

            syncId:
              currentSyncId,
          });
    }

    return {
      syncId:
        currentSyncId,

      total:
        seenRelations.length,

      stale:
        staleCount,

      serviceToPod:
        this._countRelations(
          seenRelations,
          "service_selects_pod"
        ),

      deploymentToReplicaSet:
        this._countRelations(
          seenRelations,
          "deployment_owns_replicaset"
        ),

      replicaSetToPod:
        this._countRelations(
          seenRelations,
          "replicaset_owns_pod"
        ),

      fallbackDeploymentToPod:
        this._countRelations(
          seenRelations,
          "deployment_owns_pod"
        ),

      podToNode:
        this._countRelations(
          seenRelations,
          "pod_runs_on_node"
        ),

      authoritative:
        seenRelations.filter(
          (relation) =>
            (
              relation
                .confidence ??
              1
            ) === 1
        ).length,

      inferred:
        seenRelations.filter(
          (relation) =>
            (
              relation
                .confidence ??
              1
            ) < 1
        ).length,

      canonicalRelationships,
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
  }) {
    if (
      !tenantId ||
      !organizationId ||
      !environmentId ||
      !integrationId
    ) {
      throw Object.assign(
        new Error(
          "Complete Kubernetes ownership context is required"
        ),
        {
          code:
            "K8S_RELATIONSHIP_CONTEXT_REQUIRED",
        }
      );
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  _labelsMatch(
    selector,
    labels
  ) {
    if (
      !selector ||
      typeof selector !==
        "object"
    ) {
      return false;
    }

    const entries =
      Object.entries(
        selector
      );

    if (
      entries.length ===
      0
    ) {
      return false;
    }

    return entries.every(
      ([key, value]) =>
        labels?.[key] ===
        value
    );
  }

  _countRelations(
    relations,
    relationType
  ) {
    return relations.filter(
      (relation) =>
        relation
          .relationType ===
        relationType
    ).length;
  }
}

module.exports =
  new KubernetesRelationshipService();

module.exports
  .KubernetesRelationshipService =
  KubernetesRelationshipService;