"use strict";

const KubernetesResource =
  require("../../models/KubernetesResource");

const KubernetesResourceRelation =
  require("../../models/KubernetesResourceRelation");

class KubernetesRelationshipService {
  /**
   * Rebuild Kubernetes topology relationships for one integration.
   *
   * Authoritative relationships:
   *
   * Deployment
   *   ↓ ownerReference
   * ReplicaSet
   *   ↓ ownerReference
   * Pod
   *   ↓ nodeName
   * Node
   *
   * Service → Pod remains selector-based because that is how
   * Kubernetes Services actually target workloads.
   *
   * Deployment → Pod label matching is retained only as fallback.
   */
 async rebuildRelationships({
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

  /**
   * Only resources belonging to this exact
   * organization + environment + integration
   * may participate in this topology graph.
   */
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
          resource.kind === "service"
      );

    const deployments =
      resources.filter(
        (resource) =>
          resource.kind === "deployment"
      );

    const replicaSets =
      resources.filter(
        (resource) =>
          resource.kind === "replicaset"
      );

    const pods =
      resources.filter(
        (resource) =>
          resource.kind === "pod"
      );

    const nodes =
      resources.filter(
        (resource) =>
          resource.kind === "node"
      );

    const seenRelations = [];

    // ────────────────────────────────────────────────────────────────────────
    // Lookup maps
    // ────────────────────────────────────────────────────────────────────────

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

    // ────────────────────────────────────────────────────────────────────────
    // Service → Pod
    //
    // Kubernetes Services select pods through label selectors.
    // This relationship is therefore authoritative when selectors match.
    // ────────────────────────────────────────────────────────────────────────

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
            pod.labels || {}
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
                pod.labels || {},
            },
          });
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Deployment → ReplicaSet
    //
    // Authoritative ownership through Kubernetes ownerReferences.
    // ────────────────────────────────────────────────────────────────────────

    for (
      const replicaSet
      of replicaSets
    ) {
      const owners =
        replicaSet.spec
          ?.ownerReferences ||
        [];

      const deploymentOwner =
        owners.find(
          (owner) =>
            owner.kind ===
              "Deployment" &&
            owner.controller ===
              true
        );

      if (!deploymentOwner) {
        continue;
      }

      const deployment =
        deploymentByUid.get(
          String(
            deploymentOwner.uid
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
            deploymentOwner.kind,

          ownerName:
            deploymentOwner.name,

          ownerUid:
            deploymentOwner.uid,
        },
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // ReplicaSet → Pod
    //
    // Authoritative ownership through Kubernetes ownerReferences.
    // ────────────────────────────────────────────────────────────────────────

    const podsWithAuthoritativeOwners =
      new Set();

    for (
      const pod
      of pods
    ) {
      const owners =
        pod.spec
          ?.ownerReferences ||
        [];

      const replicaSetOwner =
        owners.find(
          (owner) =>
            owner.kind ===
              "ReplicaSet" &&
            owner.controller ===
              true
        );

      if (!replicaSetOwner) {
        continue;
      }

      const replicaSet =
        replicaSetByUid.get(
          String(
            replicaSetOwner.uid
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
            replicaSetOwner.kind,

          ownerName:
            replicaSetOwner.name,

          ownerUid:
            replicaSetOwner.uid,
        },
      });

      podsWithAuthoritativeOwners.add(
        String(
          pod._id
        )
      );
    }

    // ────────────────────────────────────────────────────────────────────────
    // Deployment → Pod fallback
    //
    // Only used when the pod could NOT be authoritatively mapped through
    // ReplicaSet ownerReferences.
    //
    // This exists for:
    // - incomplete RBAC permissions
    // - partial discovery
    // - older/unusual workloads
    //
    // Confidence is deliberately lower.
    // ────────────────────────────────────────────────────────────────────────

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
          podsWithAuthoritativeOwners.has(
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
            pod.labels || {}
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
                pod.labels || {},
            },
          });
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Pod → Node
    //
    // nodeName is authoritative scheduling information from Kubernetes.
    // ────────────────────────────────────────────────────────────────────────

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

    // ────────────────────────────────────────────────────────────────────────
    // Persist relationships
    // ────────────────────────────────────────────────────────────────────────

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
    relation.relationType,
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
                relation.confidence ??
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
          }
        );
    }

    // ────────────────────────────────────────────────────────────────────────
    // Mark stale relationships inactive
    // ────────────────────────────────────────────────────────────────────────

    const existingRelations =
  await KubernetesResourceRelation
    .find({
      organizationId,

      environmentId,

      integrationId,

      active:
        true,
    });

    for (
      const existing
      of existingRelations
    ) {
      const stillExists =
        activeRelationKeys.some(
          (key) =>
            String(
              key.sourceResourceId
            ) ===
              String(
                existing
                  .sourceResourceId
              ) &&
            String(
              key.targetResourceId
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
      }
    }

    return {
      total:
        seenRelations.length,

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
              relation.confidence ??
              1
            ) === 1
        ).length,

      inferred:
        seenRelations.filter(
          (relation) =>
            (
              relation.confidence ??
              1
            ) < 1
        ).length,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

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
        relation.relationType ===
        relationType
    ).length;
  }
}

module.exports =
  new KubernetesRelationshipService();