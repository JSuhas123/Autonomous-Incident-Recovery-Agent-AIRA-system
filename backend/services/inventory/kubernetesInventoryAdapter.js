"use strict";

const crypto =
  require("node:crypto");

const KubernetesResource =
  require(
    "../../models/KubernetesResource"
  );

const KubernetesResourceRelation =
  require(
    "../../models/KubernetesResourceRelation"
  );

const InfrastructureResource =
  require(
    "../../models/InfrastructureResource"
  );

const ResourceRelationship =
  require(
    "../../models/ResourceRelationship"
  );

const inventoryService =
  require(
    "./inventoryService"
  );

class KubernetesInventoryAdapter {
  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  _context({
    tenantId,
    organizationId,
    environmentId,
  }) {
    if (
      !tenantId ||
      !organizationId ||
      !environmentId
    ) {
      throw Object.assign(
        new Error(
          "Complete Kubernetes canonical inventory context is required"
        ),
        {
          code:
            "K8S_CANONICAL_CONTEXT_REQUIRED",
        }
      );
    }

    return {
      tenantId:
        String(
          tenantId
        ),

      organizationId,

      environmentId,
    };
  }

  _scope({
    organizationId,
    environmentId,
    integrationId,
  }) {
    if (
      !organizationId ||
      !environmentId ||
      !integrationId
    ) {
      throw Object.assign(
        new Error(
          "Complete Kubernetes inventory scope is required"
        ),
        {
          code:
            "K8S_INVENTORY_SCOPE_REQUIRED",
        }
      );
    }

    return {
      organizationId,
      environmentId,
      integrationId,
    };
  }

  _syncId(
    prefix,
    supplied
  ) {
    return (
      supplied ||
      `${prefix}-${crypto.randomUUID()}`
    );
  }

  // ==========================================================================
  // RESOURCE NORMALIZATION
  // ==========================================================================

  _resourceType(kind) {
    const map = {
      namespace:
        "namespace",

      deployment:
        "workload",

      replicaset:
        "workload",

      pod:
        "workload",

      service:
        "service_endpoint",

      node:
        "node",
    };

    return (
      map[kind] ||
      "other"
    );
  }

  _inventoryKey(
    integrationId,
    resource
  ) {
    const namespace =
      resource.namespace ||
      "_cluster";

    /*
     * Prefer UID where available because names can eventually
     * be reused after deletion/recreation.
     *
     * Keep name in the key when UID is unavailable.
     */
    const identity =
      resource.uid ||
      resource.name;

    return [
      "kubernetes",
      String(
        integrationId
      ),
      resource.kind,
      namespace,
      identity,
    ].join(":");
  }

  _healthStatus(
    resource
  ) {
    switch (
      resource.kind
    ) {
      case "pod":
        return this
          ._podHealth(
            resource
          );

      case "deployment":
        return this
          ._deploymentHealth(
            resource
          );

      case "replicaset":
        return this
          ._replicaSetHealth(
            resource
          );

      case "node":
        return this
          ._nodeHealth(
            resource
          );

      case "namespace":
        return (
          resource.status
            ?.phase ===
          "Active"
            ? "healthy"
            : "unknown"
        );

      case "service":
        return "healthy";

      default:
        return "unknown";
    }
  }

  _podHealth(resource) {
    const status =
      resource.status ||
      {};

    if (
      [
        "Failed",
        "Unknown",
      ].includes(
        status.phase
      )
    ) {
      return "unhealthy";
    }

    const seriousReasons =
      new Set([
        "CrashLoopBackOff",
        "ImagePullBackOff",
        "ErrImagePull",
        "OOMKilled",
        "Error",
        "CreateContainerConfigError",
        "CreateContainerError",
        "RunContainerError",
      ]);

    const signals =
      status.failureSignals ||
      [];

    if (
      signals.some(
        (signal) =>
          seriousReasons.has(
            signal.reason
          )
      )
    ) {
      return "unhealthy";
    }

    if (
      status.totalContainers >
        0 &&
      status.readyContainers <
        status.totalContainers
    ) {
      return "degraded";
    }

    if (
      status.phase ===
      "Running"
    ) {
      return "healthy";
    }

    if (
      status.phase ===
      "Pending"
    ) {
      return "degraded";
    }

    return "unknown";
  }

  _deploymentHealth(
    resource
  ) {
    const status =
      resource.status ||
      {};

    const desired =
      resource.spec
        ?.replicas ??
      0;

    const ready =
      status.readyReplicas ??
      0;

    const unavailable =
      status
        .unavailableReplicas ??
      0;

    if (
      desired > 0 &&
      ready === 0
    ) {
      return "unhealthy";
    }

    if (
      unavailable > 0 ||
      ready < desired
    ) {
      return "degraded";
    }

    if (
      desired === ready
    ) {
      return "healthy";
    }

    return "unknown";
  }

  _replicaSetHealth(
    resource
  ) {
    const desired =
      resource.status
        ?.replicas ??
      0;

    const ready =
      resource.status
        ?.readyReplicas ??
      0;

    if (
      desired > 0 &&
      ready === 0
    ) {
      return "unhealthy";
    }

    if (
      ready < desired
    ) {
      return "degraded";
    }

    return "healthy";
  }

  _nodeHealth(
    resource
  ) {
    const ready =
      (
        resource.status
          ?.conditions ||
        []
      ).find(
        (condition) =>
          condition?.type ===
          "Ready"
      );

    if (!ready) {
      return "unknown";
    }

    return (
      ready.status ===
      "True"
        ? "healthy"
        : "unhealthy"
    );
  }

  _providerStatus(
    resource
  ) {
    switch (
      resource.kind
    ) {
      case "pod":
        return (
          resource.status
            ?.reason ||
          resource.status
            ?.phase ||
          null
        );

      case "namespace":
        return (
          resource.status
            ?.phase ||
          null
        );

      case "deployment":
        return (
          resource.status
            ?.unavailableReplicas >
          0
            ? "Unavailable"
            : "Available"
        );

      case "replicaset":
        return "Observed";

      case "node": {
        const ready =
          (
            resource.status
              ?.conditions ||
            []
          ).find(
            (condition) =>
              condition?.type ===
              "Ready"
          );

        return (
          ready?.status ===
          "True"
            ? "Ready"
            : "NotReady"
        );
      }

      case "service":
        return "Available";

      default:
        return null;
    }
  }

  // ==========================================================================
  // RESOURCE SYNC
  // ==========================================================================

  async syncResources({
    tenantId,
    organizationId,
    environmentId,
    integrationId,
    syncId = null,
  }) {
    const context =
      this._context({
        tenantId,
        organizationId,
        environmentId,
      });

    const scope =
      this._scope({
        organizationId,
        environmentId,
        integrationId,
      });

    const currentSyncId =
      this._syncId(
        "k8s-resource-sync",
        syncId
      );

    const resources =
      await KubernetesResource
        .find({
          ...scope,

          active:
            true,
        })
        .lean();

    let createdOrUpdated =
      0;

    /*
     * Phase A:
     *
     * Write every observed resource using the SAME sync ID.
     *
     * If any write throws, execution stops here and reconciliation
     * never runs.
     */
    for (
      const resource
      of resources
    ) {
      const inventoryKey =
        this._inventoryKey(
          integrationId,
          resource
        );

      await inventoryService
        .upsertResource(
          context,
          {
            inventoryKey,

            provider:
              "kubernetes",

            resourceType:
              this._resourceType(
                resource.kind
              ),

            resourceSubtype:
              resource.kind,

            externalId:
              resource.uid ||
              null,

            name:
              resource.name,

            namespace:
              resource.namespace ||
              null,

            integrationId,

            discoverySource:
              "connector",

            sourceModel:
              "KubernetesResource",

            sourceResourceId:
              resource._id,

            healthStatus:
              this._healthStatus(
                resource
              ),

            providerStatus:
              this._providerStatus(
                resource
              ),

            labels:
              resource.labels ||
              {},

            metadata: {
              ...(
                resource.metadata ||
                {}
              ),

              kubernetesKind:
                resource.kind,

              kubernetesUid:
                resource.uid ||
                null,
            },

            spec:
              resource.spec ||
              {},

            status:
              resource.status ||
              {},
          },
          {
            syncId:
              currentSyncId,
          }
        );

      createdOrUpdated++;
    }

    /*
     * Phase B:
     *
     * Only reached after every resource has been written.
     *
     * Even a legitimate empty discovery will now mark previously
     * active connector resources missing, which is correct because
     * the empty result represents a successfully completed run.
     */
    const reconciliation =
      await inventoryService
        .reconcileCompletedSync(
          context,
          {
            integrationId,

            provider:
              "kubernetes",

            syncId:
              currentSyncId,
          }
        );

    return {
      provider:
        "kubernetes",

      syncId:
        currentSyncId,

      discovered:
        resources.length,

      canonical:
        createdOrUpdated,

      missing:
        reconciliation.modified,
    };
  }

  // ==========================================================================
  // RELATIONSHIP NORMALIZATION
  // ==========================================================================

  _canonicalRelationshipType(
    relationType
  ) {
    const map = {
      service_selects_pod:
        "selects",

      deployment_owns_replicaset:
        "contains",

      replicaset_owns_pod:
        "contains",

      deployment_owns_pod:
        "contains",

      pod_runs_on_node:
        "runs_on",
    };

    return (
      map[
        relationType
      ] ||
      "related_to"
    );
  }

  _discoveryMethod(
    relation
  ) {
    const method =
      relation.evidence
        ?.method;

    if (
      method ===
      "ownerReference"
    ) {
      return (
        "kubernetes_owner_reference"
      );
    }

    if (
      method ===
        "service_selector" ||
      method ===
        "label_selector_fallback"
    ) {
      return (
        "kubernetes_selector"
      );
    }

    return "connector";
  }

  // ==========================================================================
  // RELATIONSHIP SYNC
  // ==========================================================================

  async syncRelationships({
    tenantId,
    organizationId,
    environmentId,
    integrationId,
    syncId = null,
  }) {
    const context =
      this._context({
        tenantId,
        organizationId,
        environmentId,
      });

    const scope =
      this._scope({
        organizationId,
        environmentId,
        integrationId,
      });

    const currentSyncId =
      this._syncId(
        "k8s-relation-sync",
        syncId
      );

    const relations =
      await KubernetesResourceRelation
        .find({
          ...scope,

          active:
            true,
        })
        .lean();

    const canonicalResources =
      await InfrastructureResource
        .find({
          organizationId,
          environmentId,

          provider:
            "kubernetes",

          integrationId,

          lifecycleStatus:
            "active",

          sourceModel:
            "KubernetesResource",
        })
        .lean();

    const bySourceId =
      new Map(
        canonicalResources.map(
          (resource) => [
            String(
              resource
                .sourceResourceId
            ),

            resource,
          ]
        )
      );

    let synced =
      0;

    /*
     * Phase A:
     *
     * Observe every provider relationship under this sync ID.
     */
    for (
      const relation
      of relations
    ) {
      const source =
        bySourceId.get(
          String(
            relation
              .sourceResourceId
          )
        );

      const target =
        bySourceId.get(
          String(
            relation
              .targetResourceId
          )
        );

      /*
       * A relation referencing a resource that was not
       * successfully canonicalized is ignored.
       *
       * Importantly, if this happens unexpectedly the relation
       * will not receive currentSyncId and will be reconciled out.
       */
      if (
        !source ||
        !target
      ) {
        continue;
      }

      const key = {
        organizationId,
        environmentId,

        sourceType:
          "resource",

        sourceId:
          source._id,

        targetType:
          "resource",

        targetId:
          target._id,

        relationshipType:
          this._canonicalRelationshipType(
            relation
              .relationType
          ),
      };

      const existing =
        await ResourceRelationship
          .findOne(
            key
          );

      const now =
        new Date();

      const wasInactive =
        existing &&
        !existing.active;

      const observationCount =
        existing
          ? (
              existing
                .observationCount ||
              0
            ) + 1
          : 1;

      const setData = {
        tenantId:
          context.tenantId,

        integrationId,

        confidence:
          relation
            .confidence ??
          1,

        discoveryMethod:
          this._discoveryMethod(
            relation
          ),

        sourceRelationshipModel:
          "KubernetesResourceRelation",

        sourceRelationshipId:
          relation._id,

        evidence: {
          ...(
            relation
              .evidence ||
            {}
          ),

          kubernetesRelationType:
            relation
              .relationType,
        },

        propagatesFailure:
          true,

        active:
          true,

        inactiveSince:
          null,

        observationCount,

        lastSeenAt:
          now,

        lastSeenSyncId:
          currentSyncId,
      };

      if (wasInactive) {
        setData.recoveredAt =
          now;
      }

      await ResourceRelationship
        .findOneAndUpdate(
          key,
          {
            $set:
              setData,

            $setOnInsert: {
              firstSeenAt:
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

      synced++;
    }

    /*
     * Phase B:
     *
     * Only after every observed edge has been successfully written
     * do we deactivate edges not seen in this completed sync.
     */
    const now =
      new Date();

    const staleResult =
      await ResourceRelationship
        .updateMany(
          {
            organizationId,
            environmentId,

            integrationId,

            sourceRelationshipModel:
              "KubernetesResourceRelation",

            active:
              true,

            $or: [
              {
                lastSeenSyncId: {
                  $ne:
                    currentSyncId,
                },
              },

              {
                lastSeenSyncId:
                  null,
              },
            ],
          },
          {
            $set: {
              active:
                false,

              inactiveSince:
                now,
            },
          }
        );

    return {
      provider:
        "kubernetes",

      syncId:
        currentSyncId,

      discovered:
        relations.length,

      canonical:
        synced,

      stale:
        staleResult
          .modifiedCount ??
        staleResult
          .nModified ??
        0,
    };
  }

  // ==========================================================================
  // COMPLETE CANONICAL SYNC
  // ==========================================================================

  async syncCanonicalInventory({
    tenantId,
    organizationId,
    environmentId,
    integrationId,
    resourceSyncId = null,
    relationshipSyncId = null,
  }) {
    const resources =
      await this
        .syncResources({
          tenantId,
          organizationId,
          environmentId,
          integrationId,

          syncId:
            resourceSyncId,
        });

    const relationships =
      await this
        .syncRelationships({
          tenantId,
          organizationId,
          environmentId,
          integrationId,

          syncId:
            relationshipSyncId,
        });

    return {
      resources,
      relationships,
    };
  }
}

module.exports =
  new KubernetesInventoryAdapter();

module.exports
  .KubernetesInventoryAdapter =
  KubernetesInventoryAdapter;