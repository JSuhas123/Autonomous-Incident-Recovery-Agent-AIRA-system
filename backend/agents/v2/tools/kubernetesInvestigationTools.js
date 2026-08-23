"use strict";

const {
  KubernetesResource,
  KubernetesResourceRelation,
} =
  require(
    "../../../persistence/operational/operationalModels"
  );

/**
 * Kubernetes Investigation Tools
 *
 * READ-ONLY tools exposed to the V2 intelligence platform.
 *
 * IMPORTANT:
 * These tools NEVER mutate Kubernetes.
 *
 * They read from AIRA's discovered/persisted Kubernetes inventory
 * rather than granting an LLM direct access to the Kubernetes API.
 */



class KubernetesInvestigationTools {
  async findPod({
    tenantId,
    integrationId,
    namespace,
    name,
  }) {
    if (!tenantId || !name) {
      return null;
    }

    return KubernetesResource
      .findOne({
        tenantId,

        ...(integrationId
          ? { integrationId }
          : {}),

        kind:
          "pod",

        name,

        ...(namespace
          ? { namespace }
          : {}),

        active:
          true,
      })
      .lean();
  }

  async findDeployment({
    tenantId,
    integrationId,
    namespace,
    name,
  }) {
    if (!tenantId || !name) {
      return null;
    }

    return KubernetesResource
      .findOne({
        tenantId,

        ...(integrationId
          ? { integrationId }
          : {}),

        kind:
          "deployment",

        name,

        ...(namespace
          ? { namespace }
          : {}),

        active:
          true,
      })
      .lean();
  }

  async findReplicaSet({
    tenantId,
    integrationId,
    namespace,
    name,
  }) {
    if (!tenantId || !name) {
      return null;
    }

    return KubernetesResource
      .findOne({
        tenantId,

        ...(integrationId
          ? { integrationId }
          : {}),

        kind:
          "replicaset",

        name,

        ...(namespace
          ? { namespace }
          : {}),

        active:
          true,
      })
      .lean();
  }

  async findService({
    tenantId,
    integrationId,
    namespace,
    name,
  }) {
    if (!tenantId || !name) {
      return null;
    }

    return KubernetesResource
      .findOne({
        tenantId,

        ...(integrationId
          ? { integrationId }
          : {}),

        kind:
          "service",

        name,

        ...(namespace
          ? { namespace }
          : {}),

        active:
          true,
      })
      .lean();
  }

  async findNode({
    tenantId,
    integrationId,
    name,
  }) {
    if (!tenantId || !name) {
      return null;
    }

    return KubernetesResource
      .findOne({
        tenantId,

        ...(integrationId
          ? { integrationId }
          : {}),

        kind:
          "node",

        name,

        active:
          true,
      })
      .lean();
  }

  /**
   * Build incident-focused evidence for one pod.
   */
  async getPodEvidence({
    tenantId,
    integrationId,
    namespace,
    podName,
  }) {
    const pod =
      await this.findPod({
        tenantId,
        integrationId,
        namespace,
        name:
          podName,
      });

    if (!pod) {
      return {
        found:
          false,

        pod:
          null,

        failureSignals:
          [],

        deployment:
          null,

        replicaSet:
          null,

        node:
          null,

        services:
          [],

        siblingPods:
          [],
      };
    }

    const [
      replicaSet,
      node,
      services,
    ] =
      await Promise.all([
        this.getReplicaSetForPod({
          tenantId,
          integrationId:
            pod.integrationId,

          podId:
            pod._id,
        }),

        this.getNodeForPod({
          tenantId,
          integrationId:
            pod.integrationId,

          podId:
            pod._id,
        }),

        this.getServicesForPod({
          tenantId,
          integrationId:
            pod.integrationId,

          podId:
            pod._id,
        }),
      ]);

    let deployment = null;

    if (replicaSet) {
      deployment =
        await this
          .getDeploymentForReplicaSet({
            tenantId,

            integrationId:
              pod.integrationId,

            replicaSetId:
              replicaSet._id,
          });
    }

    /**
     * Fallback for older/inferred inventory relationships.
     */
    if (!deployment) {
      deployment =
        await this
          .getFallbackDeploymentForPod({
            tenantId,

            integrationId:
              pod.integrationId,

            podId:
              pod._id,
          });
    }

    const siblingPods =
      deployment
        ? await this
            .getPodsForDeployment({
              tenantId,

              integrationId:
                pod.integrationId,

              deploymentId:
                deployment._id,
            })
        : [];

    return {
      found:
        true,

      pod:
        this._safeResource(
          pod
        ),

      failureSignals:
        pod.status
          ?.failureSignals ||
        [],

      replicaSet:
        this._safeResource(
          replicaSet
        ),

      deployment:
        this._safeResource(
          deployment
        ),

      node:
        this._safeResource(
          node
        ),

      services:
        services.map(
          (service) =>
            this._safeResource(
              service
            )
        ),

      siblingPods:
        siblingPods.map(
          (sibling) =>
            this._safeResource(
              sibling
            )
        ),

      siblingHealth:
        this._summarisePodHealth(
          siblingPods
        ),
    };
  }

  async getReplicaSetForPod({
    tenantId,
    integrationId,
    podId,
  }) {
    const relation =
      await KubernetesResourceRelation
        .findOne({
          tenantId,
          integrationId,

          targetResourceId:
            podId,

          relationType:
            "replicaset_owns_pod",

          active:
            true,
        })
        .lean();

    if (!relation) {
      return null;
    }

    return KubernetesResource
      .findOne({
        _id:
          relation.sourceResourceId,

        tenantId,
        integrationId,

        kind:
          "replicaset",

        active:
          true,
      })
      .lean();
  }

  async getDeploymentForReplicaSet({
    tenantId,
    integrationId,
    replicaSetId,
  }) {
    const relation =
      await KubernetesResourceRelation
        .findOne({
          tenantId,
          integrationId,

          targetResourceId:
            replicaSetId,

          relationType:
            "deployment_owns_replicaset",

          active:
            true,
        })
        .lean();

    if (!relation) {
      return null;
    }

    return KubernetesResource
      .findOne({
        _id:
          relation.sourceResourceId,

        tenantId,
        integrationId,

        kind:
          "deployment",

        active:
          true,
      })
      .lean();
  }

  async getFallbackDeploymentForPod({
    tenantId,
    integrationId,
    podId,
  }) {
    const relation =
      await KubernetesResourceRelation
        .findOne({
          tenantId,
          integrationId,

          targetResourceId:
            podId,

          relationType:
            "deployment_owns_pod",

          active:
            true,
        })
        .sort({
          confidence:
            -1,
        })
        .lean();

    if (!relation) {
      return null;
    }

    return KubernetesResource
      .findOne({
        _id:
          relation.sourceResourceId,

        tenantId,
        integrationId,

        kind:
          "deployment",

        active:
          true,
      })
      .lean();
  }

  async getNodeForPod({
    tenantId,
    integrationId,
    podId,
  }) {
    const relation =
      await KubernetesResourceRelation
        .findOne({
          tenantId,
          integrationId,

          sourceResourceId:
            podId,

          relationType:
            "pod_runs_on_node",

          active:
            true,
        })
        .lean();

    if (!relation) {
      return null;
    }

    return KubernetesResource
      .findOne({
        _id:
          relation.targetResourceId,

        tenantId,
        integrationId,

        kind:
          "node",

        active:
          true,
      })
      .lean();
  }

  async getServicesForPod({
    tenantId,
    integrationId,
    podId,
  }) {
    const relations =
      await KubernetesResourceRelation
        .find({
          tenantId,
          integrationId,

          targetResourceId:
            podId,

          relationType:
            "service_selects_pod",

          active:
            true,
        })
        .lean();

    if (!relations.length) {
      return [];
    }

    return KubernetesResource
      .find({
        _id: {
          $in:
            relations.map(
              (relation) =>
                relation
                  .sourceResourceId
            ),
        },

        tenantId,
        integrationId,

        kind:
          "service",

        active:
          true,
      })
      .lean();
  }

  async getPodsForDeployment({
    tenantId,
    integrationId,
    deploymentId,
  }) {
    /**
     * Preferred:
     * Deployment → ReplicaSet → Pods
     */
    const replicaSetRelations =
      await KubernetesResourceRelation
        .find({
          tenantId,
          integrationId,

          sourceResourceId:
            deploymentId,

          relationType:
            "deployment_owns_replicaset",

          active:
            true,
        })
        .lean();

    if (
      replicaSetRelations.length >
      0
    ) {
      const replicaSetIds =
        replicaSetRelations.map(
          (relation) =>
            relation
              .targetResourceId
        );

      const podRelations =
        await KubernetesResourceRelation
          .find({
            tenantId,
            integrationId,

            sourceResourceId: {
              $in:
                replicaSetIds,
            },

            relationType:
              "replicaset_owns_pod",

            active:
              true,
          })
          .lean();

      if (
        podRelations.length >
        0
      ) {
        return KubernetesResource
          .find({
            _id: {
              $in:
                podRelations.map(
                  (relation) =>
                    relation
                      .targetResourceId
                ),
            },

            tenantId,
            integrationId,

            kind:
              "pod",

            active:
              true,
          })
          .lean();
      }
    }

    /**
     * Fallback:
     * Deployment → Pod inferred relation.
     */
    const fallbackRelations =
      await KubernetesResourceRelation
        .find({
          tenantId,
          integrationId,

          sourceResourceId:
            deploymentId,

          relationType:
            "deployment_owns_pod",

          active:
            true,
        })
        .lean();

    if (
      !fallbackRelations.length
    ) {
      return [];
    }

    return KubernetesResource
      .find({
        _id: {
          $in:
            fallbackRelations.map(
              (relation) =>
                relation
                  .targetResourceId
            ),
        },

        tenantId,
        integrationId,

        kind:
          "pod",

        active:
          true,
      })
      .lean();
  }

  async listUnhealthyPods({
    tenantId,
    integrationId,
    namespace,
    limit = 50,
  }) {
    const pods =
      await KubernetesResource
        .find({
          tenantId,

          ...(integrationId
            ? {
                integrationId,
              }
            : {}),

          ...(namespace
            ? {
                namespace,
              }
            : {}),

          kind:
            "pod",

          active:
            true,

          $or: [
            {
              "status.phase": {
                $in: [
                  "Failed",
                  "Unknown",
                ],
              },
            },

            {
              "status.failureSignals.0": {
                $exists:
                  true,
              },
            },

            {
              "status.restartCount": {
                $gt:
                  0,
              },
            },
          ],
        })
        .limit(
          Math.min(
            Number(limit) || 50,
            100
          )
        )
        .lean();

    return pods.map(
      (pod) =>
        this._safeResource(
          pod
        )
    );
  }

  async listUnhealthyNodes({
    tenantId,
    integrationId,
    limit = 50,
  }) {
    const nodes =
      await KubernetesResource
        .find({
          tenantId,

          ...(integrationId
            ? {
                integrationId,
              }
            : {}),

          kind:
            "node",

          active:
            true,
        })
        .limit(
          Math.min(
            Number(limit) || 50,
            100
          )
        )
        .lean();

    return nodes
      .filter(
        (node) => {
          const ready =
            node.status
              ?.conditions
              ?.find(
                (condition) =>
                  condition.type ===
                  "Ready"
              );

          return (
            !ready ||
            ready.status !==
              "True"
          );
        }
      )
      .map(
        (node) =>
          this._safeResource(
            node
          )
      );
  }

  _summarisePodHealth(
    pods
  ) {
    const summary = {
      total:
        pods.length,

      running:
        0,

      failed:
        0,

      pending:
        0,

      unknown:
        0,

      restarting:
        0,

      unhealthy:
        0,
    };

    for (
      const pod
      of pods
    ) {
      switch (
        pod.status?.phase
      ) {
        case "Running":
          summary.running +=
            1;
          break;

        case "Failed":
          summary.failed +=
            1;
          break;

        case "Pending":
          summary.pending +=
            1;
          break;

        default:
          summary.unknown +=
            1;
      }

      if (
        (
          pod.status
            ?.restartCount ||
          0
        ) > 0
      ) {
        summary.restarting +=
          1;
      }

      if (
        pod.status
          ?.failureSignals
          ?.length > 0
      ) {
        summary.unhealthy +=
          1;
      }
    }

    return summary;
  }

  /**
   * Reduce DB documents before exposing them to an AI agent.
   *
   * Avoids leaking internal Mongo metadata and keeps evidence compact.
   */
  _safeResource(
    resource
  ) {
    if (!resource) {
      return null;
    }

    return {
      id:
        resource._id
          ?.toString(),

      kind:
        resource.kind,

      name:
        resource.name,

      namespace:
        resource.namespace,

      uid:
        resource.uid,

      labels:
        resource.labels ||
        {},

      status:
        resource.status ||
        {},

      spec:
        resource.spec ||
        {},

      lastSeenAt:
        resource.lastSeenAt,
    };
  }
}

module.exports =
  new KubernetesInvestigationTools();