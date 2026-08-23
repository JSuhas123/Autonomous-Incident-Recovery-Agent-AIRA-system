"use strict";

const {
  isDatabaseIdentifier,
} =
  require(
    "../../utils/identifier"
  );

const {
  Service,
} =
  require(
    "../../persistence/operational/operationalModels"
  );

const {
  InfrastructureResource,
  ServiceDependency,
  ResourceRelationship,
} =
  require(
    "../../persistence/operational/inventoryModels"
  );

class TopologyService {
  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  _scope(context) {
    if (
      !context ||
      !context.organizationId ||
      !context.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Complete topology context is required"
        ),
        {
          code:
            "TOPOLOGY_CONTEXT_REQUIRED",
        }
      );
    }

    return {
      organizationId:
        context.organizationId,

      environmentId:
        context.environmentId,
    };
  }

  _validNodeType(
    nodeType
  ) {
    return [
      "service",
      "resource",
    ].includes(
      nodeType
    );
  }

  _validObjectId(
    value
  ) {
    return Boolean(
      value &&
      isDatabaseIdentifier(
          value
        )
    );
  }

  // ==========================================================================
  // COMPLETE ENVIRONMENT TOPOLOGY
  // ==========================================================================

  async getEnvironmentTopology(
    context
  ) {
    const scope =
      this._scope(
        context
      );

    const [
      services,
      resources,
      serviceDependencies,
      resourceRelationships,
    ] =
      await Promise.all([
        Service
          .find({
            ...scope,

            status: {
              $ne:
                "archived",
            },
          })
          .sort({
            name:
              1,
          })
          .lean(),

        InfrastructureResource
          .find({
            ...scope,

            lifecycleStatus:
              "active",
          })
          .sort({
            resourceType:
              1,

            name:
              1,
          })
          .lean(),

        ServiceDependency
          .find({
            ...scope,

            active:
              true,
          })
          .lean(),

        ResourceRelationship
          .find({
            ...scope,

            active:
              true,
          })
          .lean(),
      ]);

    /*
     * Protect topology output from historical edges whose
     * endpoint has since been archived/deleted.
     */
    const serviceIds =
      new Set(
        services.map(
          (service) =>
            String(
              service._id
            )
        )
      );

    const resourceIds =
      new Set(
        resources.map(
          (resource) =>
            String(
              resource._id
            )
        )
      );

    const nodeExists = (
      type,
      id
    ) => {
      if (
        type ===
        "service"
      ) {
        return serviceIds.has(
          String(id)
        );
      }

      if (
        type ===
        "resource"
      ) {
        return resourceIds.has(
          String(id)
        );
      }

      return false;
    };

    const validServiceDependencies =
      serviceDependencies
        .filter(
          (dependency) =>
            nodeExists(
              "service",
              dependency
                .sourceServiceId
            ) &&
            nodeExists(
              "service",
              dependency
                .targetServiceId
            )
        );

    const validResourceRelationships =
      resourceRelationships
        .filter(
          (relationship) =>
            nodeExists(
              relationship
                .sourceType,
              relationship
                .sourceId
            ) &&
            nodeExists(
              relationship
                .targetType,
              relationship
                .targetId
            )
        );

    const nodes = [
      ...services.map(
        (service) => ({
          id:
            service._id,

          nodeType:
            "service",

          name:
            service.name,

          subtype:
            service.type,

          status:
            service.status,

          monitoringStatus:
            service
              .monitoringStatus,

          criticality:
            null,
        })
      ),

      ...resources.map(
        (resource) => ({
          id:
            resource._id,

          nodeType:
            "resource",

          name:
            resource.name,

          provider:
            resource.provider,

          resourceType:
            resource.resourceType,

          subtype:
            resource.resourceSubtype,

          status:
            resource.healthStatus,

          providerStatus:
            resource
              .providerStatus,

          criticality:
            resource.criticality,

          namespace:
            resource.namespace,

          integrationId:
            resource.integrationId,
        })
      ),
    ];

    const edges = [
      ...validServiceDependencies
        .map(
          (dependency) => ({
            id:
              dependency._id,

            edgeSource:
              "service_dependency",

            sourceType:
              "service",

            sourceId:
              dependency
                .sourceServiceId,

            targetType:
              "service",

            targetId:
              dependency
                .targetServiceId,

            relationshipType:
              "depends_on",

            dependencyType:
              dependency
                .dependencyType,

            confidence:
              dependency
                .confidence,

            criticality:
              dependency
                .criticality,

            userFacing:
              dependency
                .userFacing,

            propagatesFailure:
              true,
          })
        ),

      ...validResourceRelationships
        .map(
          (relationship) => ({
            id:
              relationship._id,

            edgeSource:
              "resource_relationship",

            sourceType:
              relationship
                .sourceType,

            sourceId:
              relationship
                .sourceId,

            targetType:
              relationship
                .targetType,

            targetId:
              relationship
                .targetId,

            relationshipType:
              relationship
                .relationshipType,

            confidence:
              relationship
                .confidence,

            criticality:
              relationship
                .criticality,

            userFacing:
              relationship
                .userFacing,

            propagatesFailure:
              relationship
                .propagatesFailure,

            discoveryMethod:
              relationship
                .discoveryMethod,
          })
        ),
    ];

    return {
      nodes,
      edges,

      summary: {
        services:
          services.length,

        resources:
          resources.length,

        relationships:
          edges.length,

        serviceDependencies:
          validServiceDependencies
            .length,

        resourceRelationships:
          validResourceRelationships
            .length,

        unhealthyResources:
          resources.filter(
            (resource) =>
              [
                "degraded",
                "unhealthy",
              ].includes(
                resource
                  .healthStatus
              )
          ).length,

        criticalResources:
          resources.filter(
            (resource) =>
              resource
                .criticality ===
              "critical"
          ).length,
      },
    };
  }

  // ==========================================================================
  // SINGLE NODE TOPOLOGY
  // ==========================================================================

  async getNodeTopology(
    context,
    {
      nodeType,
      nodeId,
    }
  ) {
    const scope =
      this._scope(
        context
      );

    if (
      !this._validNodeType(
        nodeType
      ) ||
      !this._validObjectId(
        nodeId
      )
    ) {
      return null;
    }

    let root =
      null;

    if (
      nodeType ===
      "service"
    ) {
      root =
        await Service
          .findOne({
            _id:
              nodeId,

            ...scope,

            status: {
              $ne:
                "archived",
            },
          })
          .lean();
    }

    if (
      nodeType ===
      "resource"
    ) {
      root =
        await InfrastructureResource
          .findOne({
            _id:
              nodeId,

            ...scope,

            lifecycleStatus: {
              $ne:
                "archived",
            },
          })
          .lean();
    }

    if (!root) {
      return null;
    }

    const edges = [];

    // ------------------------------------------------------------------------
    // SERVICE -> SERVICE GRAPH
    // ------------------------------------------------------------------------

    if (
      nodeType ===
      "service"
    ) {
      const serviceEdges =
        await ServiceDependency
          .find({
            ...scope,

            active:
              true,

            $or: [
              {
                sourceServiceId:
                  nodeId,
              },

              {
                targetServiceId:
                  nodeId,
              },
            ],
          })
          .lean();

      edges.push(
        ...serviceEdges.map(
          (edge) => ({
            id:
              edge._id,

            edgeSource:
              "service_dependency",

            sourceType:
              "service",

            sourceId:
              edge
                .sourceServiceId,

            targetType:
              "service",

            targetId:
              edge
                .targetServiceId,

            relationshipType:
              "depends_on",

            dependencyType:
              edge
                .dependencyType,

            confidence:
              edge.confidence,

            criticality:
              edge.criticality,

            userFacing:
              edge.userFacing,

            propagatesFailure:
              true,
          })
        )
      );
    }

    // ------------------------------------------------------------------------
    // SERVICE/RESOURCE -> GENERIC RESOURCE GRAPH
    // ------------------------------------------------------------------------

    const resourceEdges =
      await ResourceRelationship
        .find({
          ...scope,

          active:
            true,

          $or: [
            {
              sourceType:
                nodeType,

              sourceId:
                nodeId,
            },

            {
              targetType:
                nodeType,

              targetId:
                nodeId,
            },
          ],
        })
        .lean();

    edges.push(
      ...resourceEdges.map(
        (edge) => ({
          id:
            edge._id,

          edgeSource:
            "resource_relationship",

          sourceType:
            edge.sourceType,

          sourceId:
            edge.sourceId,

          targetType:
            edge.targetType,

          targetId:
            edge.targetId,

          relationshipType:
            edge
              .relationshipType,

          confidence:
            edge.confidence,

          criticality:
            edge.criticality,

          userFacing:
            edge.userFacing,

          propagatesFailure:
            edge
              .propagatesFailure,

          discoveryMethod:
            edge
              .discoveryMethod,
        })
      )
    );

    return {
      root: {
        type:
          nodeType,

        data:
          root,
      },

      edges,

      summary: {
        directRelationships:
          edges.length,

        inbound:
          edges.filter(
            (edge) =>
              edge.targetType ===
                nodeType &&
              String(
                edge.targetId
              ) ===
                String(
                  nodeId
                )
          ).length,

        outbound:
          edges.filter(
            (edge) =>
              edge.sourceType ===
                nodeType &&
              String(
                edge.sourceId
              ) ===
                String(
                  nodeId
                )
          ).length,
      },
    };
  }
}

module.exports =
  new TopologyService();

module.exports.TopologyService =
  TopologyService;