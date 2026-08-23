"use strict";

const { isDatabaseIdentifier } =
  require("../../utils/identifier");

const {
  KubernetesResource,
  KubernetesResourceRelation,
} = require("../../persistence/operational/operationalModels");

class KubernetesTopologyService {
  _buildScope({
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
          "Complete Kubernetes topology context is required"
        ),
        {
          code:
            "K8S_TOPOLOGY_CONTEXT_REQUIRED",
        }
      );
    }

    return {
      organizationId,
      environmentId,
      integrationId,
    };
  }

  _validObjectId(value) {
    return Boolean(
      value &&
      isDatabaseIdentifier(value)
    );
  }

  /**
   * Return all direct neighbours of one Kubernetes resource.
   */
  async getResourceTopology({
    organizationId,
    environmentId,
    integrationId,
    resourceId,
  }) {
    const scope =
      this._buildScope({
        organizationId,
        environmentId,
        integrationId,
      });

    if (
      !this._validObjectId(
        resourceId
      )
    ) {
      return null;
    }

    const resource =
      await KubernetesResource
        .findOne({
          _id:
            resourceId,

          ...scope,

          active:
            true,
        })
        .lean();

    if (!resource) {
      return null;
    }

    const relations =
      await KubernetesResourceRelation
        .find({
          ...scope,

          active:
            true,

          $or: [
            {
              sourceResourceId:
                resource._id,
            },
            {
              targetResourceId:
                resource._id,
            },
          ],
        })
        .lean();

    const relatedIds =
      new Set();

    for (
      const relation
      of relations
    ) {
      relatedIds.add(
        String(
          relation
            .sourceResourceId
        )
      );

      relatedIds.add(
        String(
          relation
            .targetResourceId
        )
      );
    }

    relatedIds.delete(
      String(
        resource._id
      )
    );

    const relatedResources =
      relatedIds.size > 0
        ? await KubernetesResource
            .find({
              _id: {
                $in:
                  Array.from(
                    relatedIds
                  ),
              },

              ...scope,

              active:
                true,
            })
            .lean()
        : [];

    return {
      resource,
      relations,
      relatedResources,
    };
  }

  /**
   * Find the Deployment that owns a Pod.
   *
   * Note:
   * The relationship builder may also represent:
   *
   * Deployment -> ReplicaSet -> Pod
   *
   * so this method first checks direct fallback relationships.
   */
  async findDeploymentForPod({
    organizationId,
    environmentId,
    integrationId,
    podId,
  }) {
    const scope =
      this._buildScope({
        organizationId,
        environmentId,
        integrationId,
      });

    if (
      !this._validObjectId(
        podId
      )
    ) {
      return null;
    }

    const pod =
      await KubernetesResource
        .findOne({
          _id:
            podId,

          ...scope,

          kind:
            "pod",

          active:
            true,
        })
        .lean();

    if (!pod) {
      return null;
    }

    /**
     * Direct fallback relation.
     */
    const directRelation =
      await KubernetesResourceRelation
        .findOne({
          ...scope,

          targetResourceId:
            pod._id,

          relationType:
            "deployment_owns_pod",

          active:
            true,
        })
        .lean();

    if (directRelation) {
      return KubernetesResource
        .findOne({
          _id:
            directRelation
              .sourceResourceId,

          ...scope,

          kind:
            "deployment",

          active:
            true,
        })
        .lean();
    }

    /**
     * Authoritative path:
     *
     * Deployment -> ReplicaSet -> Pod
     */
    const replicaSetRelation =
      await KubernetesResourceRelation
        .findOne({
          ...scope,

          targetResourceId:
            pod._id,

          relationType:
            "replicaset_owns_pod",

          active:
            true,
        })
        .lean();

    if (!replicaSetRelation) {
      return null;
    }

    const deploymentRelation =
      await KubernetesResourceRelation
        .findOne({
          ...scope,

          targetResourceId:
            replicaSetRelation
              .sourceResourceId,

          relationType:
            "deployment_owns_replicaset",

          active:
            true,
        })
        .lean();

    if (!deploymentRelation) {
      return null;
    }

    return KubernetesResource
      .findOne({
        _id:
          deploymentRelation
            .sourceResourceId,

        ...scope,

        kind:
          "deployment",

        active:
          true,
      })
      .lean();
  }

  /**
   * Return Pods selected by a Kubernetes Service.
   */
  async getPodsForService({
    organizationId,
    environmentId,
    integrationId,
    serviceId,
  }) {
    const scope =
      this._buildScope({
        organizationId,
        environmentId,
        integrationId,
      });

    if (
      !this._validObjectId(
        serviceId
      )
    ) {
      return [];
    }

    const service =
      await KubernetesResource
        .findOne({
          _id:
            serviceId,

          ...scope,

          kind:
            "service",

          active:
            true,
        })
        .lean();

    if (!service) {
      return [];
    }

    const relations =
      await KubernetesResourceRelation
        .find({
          ...scope,

          sourceResourceId:
            service._id,

          relationType:
            "service_selects_pod",

          active:
            true,
        })
        .lean();

    if (
      relations.length ===
      0
    ) {
      return [];
    }

    const podIds =
      relations.map(
        (relation) =>
          relation
            .targetResourceId
      );

    return KubernetesResource
      .find({
        _id: {
          $in:
            podIds,
        },

        ...scope,

        kind:
          "pod",

        active:
          true,
      })
      .lean();
  }

  /**
   * Return the Node on which a Pod is running.
   */
  async getNodeForPod({
    organizationId,
    environmentId,
    integrationId,
    podId,
  }) {
    const scope =
      this._buildScope({
        organizationId,
        environmentId,
        integrationId,
      });

    if (
      !this._validObjectId(
        podId
      )
    ) {
      return null;
    }

    const pod =
      await KubernetesResource
        .findOne({
          _id:
            podId,

          ...scope,

          kind:
            "pod",

          active:
            true,
        })
        .lean();

    if (!pod) {
      return null;
    }

    const relation =
      await KubernetesResourceRelation
        .findOne({
          ...scope,

          sourceResourceId:
            pod._id,

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
          relation
            .targetResourceId,

        ...scope,

        kind:
          "node",

        active:
          true,
      })
      .lean();
  }
}

module.exports =
  new KubernetesTopologyService();