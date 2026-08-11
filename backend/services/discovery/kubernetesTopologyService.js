"use strict";

const KubernetesResource =
  require("../../models/KubernetesResource");

const KubernetesResourceRelation =
  require("../../models/KubernetesResourceRelation");

class KubernetesTopologyService {
  /**
   * Return all direct neighbours of a Kubernetes resource.
   */
  async getResourceTopology({
    tenantId,
    integrationId,
    resourceId,
  }) {
    const resource =
      await KubernetesResource
        .findOne({
          _id:
            resourceId,

          tenantId,

          integrationId,

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
          tenantId,
          integrationId,
          active: true,

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
          relation.sourceResourceId
        )
      );

      relatedIds.add(
        String(
          relation.targetResourceId
        )
      );
    }

    relatedIds.delete(
      String(resource._id)
    );

    const relatedResources =
      await KubernetesResource
        .find({
          _id: {
            $in:
              Array.from(
                relatedIds
              ),
          },

          tenantId,

          integrationId,
        })
        .lean();

    return {
      resource,

      relations,

      relatedResources,
    };
  }

  /**
   * Find the deployment that likely owns a pod.
   */
  async findDeploymentForPod({
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
        .lean();

    if (!relation) {
      return null;
    }

    return KubernetesResource
      .findById(
        relation.sourceResourceId
      )
      .lean();
  }

  /**
   * Return pods selected by a Kubernetes service.
   */
  async getPodsForService({
    tenantId,
    integrationId,
    serviceId,
  }) {
    const relations =
      await KubernetesResourceRelation
        .find({
          tenantId,
          integrationId,

          sourceResourceId:
            serviceId,

          relationType:
            "service_selects_pod",

          active:
            true,
        })
        .lean();

    const podIds =
      relations.map(
        (relation) =>
          relation.targetResourceId
      );

    return KubernetesResource
      .find({
        _id: {
          $in:
            podIds,
        },

        kind:
          "pod",

        active:
          true,
      })
      .lean();
  }

  /**
   * Return node on which a pod is running.
   */
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
      .findById(
        relation.targetResourceId
      )
      .lean();
  }
}

module.exports =
  new KubernetesTopologyService();