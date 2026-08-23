"use strict";

const {
  isDatabaseIdentifier,
} =
  require(
    "../../utils/identifier"
  );

const {
  Service,
} = require(
  "../../persistence/operational/operationalModels"
);

const {
  InfrastructureResource,
} = require(
  "../../persistence/operational/inventoryModels"
);

const {
  ServiceDependency,
} = require(
  "../../persistence/operational/inventoryModels"
);

const {
  ResourceRelationship,
} = require(
  "../../persistence/operational/inventoryModels"
);

class IncidentImpactService {
  constructor() {
    this.defaultMaxDepth =
      Number(
        process.env
          .INCIDENT_BLAST_RADIUS_MAX_DEPTH
      ) ||
      4;

    this.maxNodes =
      Number(
        process.env
          .INCIDENT_BLAST_RADIUS_MAX_NODES
      ) ||
      250;
  }

  // ==========================================================================
  // MAIN
  // ==========================================================================

  async analyze(
    incident,
    {
      maxDepth =
        this.defaultMaxDepth,
    } = {}
  ) {
    this.assertContext(
      incident
    );

    const service =
      await Service
        .findOne({
          _id:
            incident.serviceId,

          organizationId:
            incident
              .organizationId,

          environmentId:
            incident
              .environmentId,

          status: {
            $ne:
              "archived",
          },
        })
        .lean();

    if (!service) {
      return {
        rootService:
          null,

        affectedServices:
          [],

        affectedResources:
          [],

        levels:
          [],

        summary: {
          affectedServiceCount:
            0,

          affectedResourceCount:
            0,

          userFacingImpact:
            false,

          maxCriticality:
            0,
        },
      };
    }

    const serviceBlastRadius =
      await this
        .walkServiceDependencies(
          incident,
          service,
          maxDepth
        );

    const resourceImpact =
      await this
        .findServiceResources(
          incident,
          service
        );

    const resourceBlastRadius =
      await this
        .walkResourceRelationships(
          incident,
          resourceImpact
        );

    const affectedServices =
      serviceBlastRadius
        .services;

    const affectedResources =
      this.uniqueById([
        ...resourceImpact,

        ...resourceBlastRadius,
      ]);

    const maxCriticality =
      Math.max(
        0,

        ...affectedServices
          .map(
            (entry) =>
              Number(
                entry.criticality
              ) ||
              0
          ),

        ...affectedResources
          .map(
            (resource) =>
              this
                .criticalityToNumber(
                  resource
                    .criticality
                )
          )
      );

    const userFacingImpact =
      affectedServices
        .some(
          (entry) =>
            entry.userFacing ===
            true
        );

    return {
      rootService: {
        id:
          service._id,

        name:
          service.name,

        slug:
          service.slug,

        type:
          service.type,

        status:
          service.status,
      },

      affectedServices,

      affectedResources:
        affectedResources.map(
          (resource) =>
            this
              .serializeResource(
                resource
              )
        ),

      levels:
        serviceBlastRadius
          .levels,

      summary: {
        affectedServiceCount:
          affectedServices
            .length,

        affectedResourceCount:
          affectedResources
            .length,

        userFacingImpact,

        maxCriticality,
      },
    };
  }

  // ==========================================================================
  // SERVICE BLAST RADIUS
  // ==========================================================================

  async walkServiceDependencies(
    incident,
    rootService,
    maxDepth
  ) {
    const scope = {
      organizationId:
        incident
          .organizationId,

      environmentId:
        incident
          .environmentId,

      active:
        true,
    };

    const visited =
      new Set([
        String(
          rootService._id
        ),
      ]);

    let frontier = [
      {
        serviceId:
          rootService._id,

        depth:
          0,
      },
    ];

    const affected =
      [];

    const levels =
      [];

    for (
      let depth = 1;
      depth <= maxDepth &&
      frontier.length > 0;
      depth++
    ) {
      const ids =
        frontier.map(
          (entry) =>
            entry.serviceId
        );

      /*
       * If service A depends on B, then a failure in B may affect A.
       *
       * Therefore blast radius follows:
       *
       * targetServiceId -> sourceServiceId
       */
      const edges =
        await ServiceDependency
          .find({
            ...scope,

            targetServiceId: {
              $in:
                ids,
            },
          })
          .lean();

      const nextIds =
        [];

      const levelNodes =
        [];

      for (
        const edge
        of edges
      ) {
        const sourceId =
          String(
            edge
              .sourceServiceId
          );

        if (
          visited.has(
            sourceId
          )
        ) {
          continue;
        }

        visited.add(
          sourceId
        );

        nextIds.push(
          edge
            .sourceServiceId
        );

        levelNodes.push({
          serviceId:
            edge
              .sourceServiceId,

          dependencyId:
            edge._id,

          dependencyType:
            edge
              .dependencyType,

          criticality:
            edge
              .criticality,

          userFacing:
            edge
              .userFacing,

          confidence:
            edge
              .confidence,

          depth,
        });

        if (
          visited.size >=
          this.maxNodes
        ) {
          break;
        }
      }

      if (
        levelNodes.length ===
        0
      ) {
        break;
      }

      const services =
        await Service
          .find({
            _id: {
              $in:
                levelNodes
                  .map(
                    (entry) =>
                      entry
                        .serviceId
                  ),
            },

            organizationId:
              incident
                .organizationId,

            environmentId:
              incident
                .environmentId,

            status: {
              $ne:
                "archived",
            },
          })
          .lean();

      const byId =
        new Map(
          services.map(
            (service) => [
              String(
                service._id
              ),

              service,
            ]
          )
        );

      const enriched =
        levelNodes
          .map(
            (entry) => {
              const service =
                byId.get(
                  String(
                    entry
                      .serviceId
                  )
                );

              if (!service) {
                return null;
              }

              return {
                id:
                  service._id,

                name:
                  service.name,

                slug:
                  service.slug,

                type:
                  service.type,

                status:
                  service.status,

                depth:
                  entry.depth,

                dependencyType:
                  entry
                    .dependencyType,

                criticality:
                  entry
                    .criticality,

                userFacing:
                  entry
                    .userFacing,

                confidence:
                  entry
                    .confidence,
              };
            }
          )
          .filter(
            Boolean
          );

      affected.push(
        ...enriched
      );

      levels.push({
        depth,

        services:
          enriched,
      });

      frontier =
        nextIds.map(
          (serviceId) => ({
            serviceId,

            depth,
          })
        );

      if (
        visited.size >=
        this.maxNodes
      ) {
        break;
      }
    }

    return {
      services:
        affected,

      levels,
    };
  }

  // ==========================================================================
  // SERVICE -> INFRASTRUCTURE RESOURCE
  // ==========================================================================

  async findServiceResources(
    incident,
    service
  ) {
    const relations =
      await ResourceRelationship
        .find({
          organizationId:
            incident
              .organizationId,

          environmentId:
            incident
              .environmentId,

          active:
            true,

          $or: [
            {
              sourceType:
                "service",

              sourceId:
                service._id,

              targetType:
                "resource",
            },

            {
              targetType:
                "service",

              targetId:
                service._id,

              sourceType:
                "resource",
            },
          ],
        })
        .lean();

    const resourceIds =
      new Set();

    for (
      const relation
      of relations
    ) {
      if (
        relation.sourceType ===
        "resource"
      ) {
        resourceIds.add(
          String(
            relation
              .sourceId
          )
        );
      }

      if (
        relation.targetType ===
        "resource"
      ) {
        resourceIds.add(
          String(
            relation
              .targetId
          )
        );
      }
    }

    if (
      resourceIds.size ===
      0
    ) {
      return [];
    }

    return InfrastructureResource
      .find({
        _id: {
          $in:
            Array.from(
              resourceIds
            ),
        },

        organizationId:
          incident
            .organizationId,

        environmentId:
          incident
            .environmentId,

        lifecycleStatus: {
          $ne:
            "archived",
        },
      })
      .lean();
  }

  // ==========================================================================
  // RESOURCE GRAPH
  // ==========================================================================

  async walkResourceRelationships(
    incident,
    startingResources
  ) {
    if (
      startingResources.length ===
      0
    ) {
      return [];
    }

    const visited =
      new Set(
        startingResources
          .map(
            (resource) =>
              String(
                resource._id
              )
          )
      );

    let frontier =
      startingResources
        .map(
          (resource) =>
            resource._id
        );

    const results =
      [];

    for (
      let depth = 1;
      depth <=
        this.defaultMaxDepth &&
      frontier.length > 0;
      depth++
    ) {
      const relations =
        await ResourceRelationship
          .find({
            organizationId:
              incident
                .organizationId,

            environmentId:
              incident
                .environmentId,

            active:
              true,

            $or: [
              {
                sourceType:
                  "resource",

                sourceId: {
                  $in:
                    frontier,
                },
              },

              {
                targetType:
                  "resource",

                targetId: {
                  $in:
                    frontier,
                },
              },
            ],
          })
          .lean();

      const next =
        new Set();

      for (
        const relation
        of relations
      ) {
        if (
          relation.sourceType ===
          "resource"
        ) {
          const id =
            String(
              relation
                .sourceId
            );

          if (
            !visited.has(
              id
            )
          ) {
            next.add(
              id
            );
          }
        }

        if (
          relation.targetType ===
          "resource"
        ) {
          const id =
            String(
              relation
                .targetId
            );

          if (
            !visited.has(
              id
            )
          ) {
            next.add(
              id
            );
          }
        }
      }

      if (
        next.size ===
        0
      ) {
        break;
      }

      const nextIds =
        Array.from(
          next
        );

      const resources =
        await InfrastructureResource
          .find({
            _id: {
              $in:
                nextIds,
            },

            organizationId:
              incident
                .organizationId,

            environmentId:
              incident
                .environmentId,

            lifecycleStatus: {
              $ne:
                "archived",
            },
          })
          .lean();

      for (
        const resource
        of resources
      ) {
        visited.add(
          String(
            resource._id
          )
        );

        results.push(
          resource
        );
      }

      frontier =
        resources
          .map(
            (resource) =>
              resource._id
          );

      if (
        visited.size >=
        this.maxNodes
      ) {
        break;
      }
    }

    return results;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  assertContext(
    incident
  ) {
    if (
      !incident ||
      !incident
        .organizationId ||
      !incident
        .environmentId ||
      !incident
        .serviceId
    ) {
      throw Object.assign(
        new Error(
          "Complete incident impact context is required"
        ),
        {
          code:
            "INCIDENT_IMPACT_CONTEXT_REQUIRED",
        }
      );
    }

    if (
      !isDatabaseIdentifier(
          incident
            .organizationId
        ) ||
      !isDatabaseIdentifier(
          incident
            .environmentId
        ) ||
      !isDatabaseIdentifier(
          incident
            .serviceId
        )
    ) {
      throw Object.assign(
        new Error(
          "Incident impact context contains invalid identifiers"
        ),
        {
          code:
            "INCIDENT_IMPACT_CONTEXT_INVALID",
        }
      );
    }
  }

  criticalityToNumber(
    value
  ) {
    switch (
      value
    ) {
      case "critical":
        return 10;

      case "high":
        return 8;

      case "medium":
        return 5;

      case "low":
        return 2;

      default:
        return 0;
    }
  }

  serializeResource(
    resource
  ) {
    return {
      id:
        resource._id,

      name:
        resource.name,

      provider:
        resource.provider,

      resourceType:
        resource.resourceType,

      resourceSubtype:
        resource
          .resourceSubtype,

      namespace:
        resource.namespace,

      cluster:
        resource.cluster,

      region:
        resource.region,

      criticality:
        resource.criticality,

      healthStatus:
        resource.healthStatus,

      lifecycleStatus:
        resource
          .lifecycleStatus,
    };
  }

  uniqueById(
    resources
  ) {
    const map =
      new Map();

    for (
      const resource
      of resources
    ) {
      if (
        !resource?._id
      ) {
        continue;
      }

      map.set(
        String(
          resource._id
        ),
        resource
      );
    }

    return [
      ...map.values(),
    ];
  }
}

module.exports =
  new IncidentImpactService();

module.exports
  .IncidentImpactService =
  IncidentImpactService;