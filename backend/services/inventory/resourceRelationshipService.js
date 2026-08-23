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
  ResourceRelationship,
} =
  require(
    "../../persistence/operational/inventoryModels"
  );

class ResourceRelationshipService {
  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  _scope(context) {
    if (
      !context ||
      !context.organizationId ||
      !context.environmentId ||
      !context.tenantId
    ) {
      throw Object.assign(
        new Error(
          "Complete relationship context is required"
        ),
        {
          code:
            "RELATIONSHIP_CONTEXT_REQUIRED",
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

  _validObjectId(value) {
    return Boolean(
      value &&
      isDatabaseIdentifier(
          value
        )
    );
  }

  _validNodeType(type) {
    return [
      "service",
      "resource",
    ].includes(type);
  }

  // ==========================================================================
  // NODE LOOKUP
  // ==========================================================================

  async _nodeExists(
    scope,
    type,
    id
  ) {
    if (
      !this._validNodeType(
        type
      ) ||
      !this._validObjectId(
        id
      )
    ) {
      return false;
    }

    if (
      type ===
      "service"
    ) {
      return Boolean(
        await Service
          .exists({
            _id:
              id,

            ...scope,

            status: {
              $ne:
                "archived",
            },
          })
      );
    }

    return Boolean(
      await InfrastructureResource
        .exists({
          _id:
            id,

          ...scope,

          lifecycleStatus: {
            $ne:
              "archived",
          },
        })
    );
  }

  async _requireNode(
    scope,
    type,
    id
  ) {
    if (
      !this._validNodeType(
        type
      ) ||
      !this._validObjectId(
        id
      )
    ) {
      return null;
    }

    if (
      type ===
      "service"
    ) {
      const service =
        await Service
          .findOne({
            _id:
              id,

            ...scope,

            status: {
              $ne:
                "archived",
            },
          })
          .lean();

      return service
        ? {
            type:
              "service",

            data:
              service,
          }
        : null;
    }

    const resource =
      await InfrastructureResource
        .findOne({
          _id:
            id,

          ...scope,

          lifecycleStatus: {
            $ne:
              "archived",
          },
        })
        .lean();

    return resource
      ? {
          type:
            "resource",

          data:
            resource,
        }
      : null;
  }

  // ==========================================================================
  // CREATE / UPDATE RELATIONSHIP
  // ==========================================================================

  async upsertRelationship(
    context,
    relationship
  ) {
    const scope =
      this._scope(
        context
      );

    const {
      sourceType,
      sourceId,
      targetType,
      targetId,
      relationshipType,
    } =
      relationship;

    if (
      !this._validNodeType(
        sourceType
      ) ||
      !this._validNodeType(
        targetType
      )
    ) {
      throw Object.assign(
        new Error(
          "Invalid relationship node type"
        ),
        {
          code:
            "INVALID_RELATIONSHIP_NODE_TYPE",
        }
      );
    }

    if (
      !this._validObjectId(
        sourceId
      ) ||
      !this._validObjectId(
        targetId
      )
    ) {
      throw Object.assign(
        new Error(
          "Invalid relationship node identifier"
        ),
        {
          code:
            "INVALID_RELATIONSHIP_NODE_ID",
        }
      );
    }

    if (
      sourceType ===
        targetType &&
      String(
        sourceId
      ) ===
        String(
          targetId
        )
    ) {
      throw Object.assign(
        new Error(
          "A relationship cannot reference itself"
        ),
        {
          code:
            "SELF_RELATIONSHIP_NOT_ALLOWED",
        }
      );
    }

    const [
      sourceExists,
      targetExists,
    ] =
      await Promise.all([
        this._nodeExists(
          scope,
          sourceType,
          sourceId
        ),

        this._nodeExists(
          scope,
          targetType,
          targetId
        ),
      ]);

    if (
      !sourceExists ||
      !targetExists
    ) {
      throw Object.assign(
        new Error(
          "Relationship endpoint not found in current environment"
        ),
        {
          code:
            "RELATIONSHIP_NODE_NOT_FOUND",
        }
      );
    }

    const now =
      new Date();

    const existing =
      await ResourceRelationship
        .findOne({
          ...scope,

          sourceType,
          sourceId,

          targetType,
          targetId,

          relationshipType,
        });

    const wasInactive =
      Boolean(
        existing &&
        !existing.active
      );

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
        String(
          context.tenantId
        ),

      confidence:
        relationship
          .confidence ??
        1,

      discoveryMethod:
        relationship
          .discoveryMethod ||
        "manual",

      integrationId:
        relationship
          .integrationId ||
        null,

      sourceRelationshipModel:
        relationship
          .sourceRelationshipModel ||
        null,

      sourceRelationshipId:
        relationship
          .sourceRelationshipId ||
        null,

      evidence:
        relationship
          .evidence ||
        {},

      criticality:
        relationship
          .criticality ??
        5,

      userFacing:
        Boolean(
          relationship
            .userFacing
        ),

      propagatesFailure:
        relationship
          .propagatesFailure ??
        true,

      observationCount,

      active:
        true,

      inactiveSince:
        null,

      lastSeenAt:
        now,
    };

    if (wasInactive) {
      setData.recoveredAt =
        now;
    }

    return ResourceRelationship
      .findOneAndUpdate(
        {
          ...scope,

          sourceType,
          sourceId,

          targetType,
          targetId,

          relationshipType,
        },
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
  }

  // ==========================================================================
  // REMOVE / DEACTIVATE
  // ==========================================================================

  async removeRelationship(
    context,
    relationshipId
  ) {
    const scope =
      this._scope(
        context
      );

    if (
      !this._validObjectId(
        relationshipId
      )
    ) {
      return null;
    }

    return ResourceRelationship
      .findOneAndUpdate(
        {
          _id:
            relationshipId,

          ...scope,

          active:
            true,
        },
        {
          $set: {
            active:
              false,

            inactiveSince:
              new Date(),
          },
        },
        {
          new:
            true,

          runValidators:
            true,
        }
      );
  }

  // ==========================================================================
  // DIRECT NEIGHBOURS
  // ==========================================================================

  async getNeighbours(
    context,
    {
      nodeType,
      nodeId,
      direction =
        "both",
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

    if (
      ![
        "inbound",
        "outbound",
        "both",
      ].includes(
        direction
      )
    ) {
      throw Object.assign(
        new Error(
          "Invalid relationship direction"
        ),
        {
          code:
            "INVALID_RELATIONSHIP_DIRECTION",
        }
      );
    }

    const root =
      await this._requireNode(
        scope,
        nodeType,
        nodeId
      );

    if (!root) {
      return null;
    }

    const clauses = [];

    if (
      direction ===
        "outbound" ||
      direction ===
        "both"
    ) {
      clauses.push({
        sourceType:
          nodeType,

        sourceId:
          nodeId,
      });
    }

    if (
      direction ===
        "inbound" ||
      direction ===
        "both"
    ) {
      clauses.push({
        targetType:
          nodeType,

        targetId:
          nodeId,
      });
    }

    const relationships =
      await ResourceRelationship
        .find({
          ...scope,

          active:
            true,

          $or:
            clauses,
        })
        .sort({
          criticality:
            -1,

          createdAt:
            1,
        })
        .lean();

    const serviceIds =
      new Set();

    const resourceIds =
      new Set();

    for (
      const relation
      of relationships
    ) {
      if (
        relation.sourceType ===
        "service"
      ) {
        serviceIds.add(
          String(
            relation.sourceId
          )
        );
      } else {
        resourceIds.add(
          String(
            relation.sourceId
          )
        );
      }

      if (
        relation.targetType ===
        "service"
      ) {
        serviceIds.add(
          String(
            relation.targetId
          )
        );
      } else {
        resourceIds.add(
          String(
            relation.targetId
          )
        );
      }
    }

    serviceIds.delete(
      nodeType ===
        "service"
        ? String(
            nodeId
          )
        : ""
    );

    resourceIds.delete(
      nodeType ===
        "resource"
        ? String(
            nodeId
          )
        : ""
    );

    const [
      services,
      resources,
    ] =
      await Promise.all([
        serviceIds.size
          ? Service
              .find({
                _id: {
                  $in:
                    Array.from(
                      serviceIds
                    ),
                },

                ...scope,

                status: {
                  $ne:
                    "archived",
                },
              })
              .lean()
          : [],

        resourceIds.size
          ? InfrastructureResource
              .find({
                _id: {
                  $in:
                    Array.from(
                      resourceIds
                    ),
                },

                ...scope,

                lifecycleStatus: {
                  $ne:
                    "archived",
                },
              })
              .lean()
          : [],
      ]);

    return {
      root,

      direction,

      relationships,

      nodes: [
        ...services.map(
          (service) => ({
            type:
              "service",

            data:
              service,
          })
        ),

        ...resources.map(
          (resource) => ({
            type:
              "resource",

            data:
              resource,
          })
        ),
      ],

      summary: {
        relationships:
          relationships.length,

        services:
          services.length,

        resources:
          resources.length,
      },
    };
  }

  // ==========================================================================
  // BLAST RADIUS
  // ==========================================================================
  //
  // Failure propagation semantics:
  //
  // source -> target
  //
  // Example:
  //
  // payment-api DEPENDS_ON redis
  //
  // source = payment-api
  // target = redis
  //
  // If redis fails, payment-api may be affected.
  //
  // Therefore blast radius follows target -> source
  // by traversing INBOUND relationships.
  // ==========================================================================

  async getBlastRadius(
    context,
    {
      nodeType,
      nodeId,
      maxDepth = 4,
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

    const root =
      await this._requireNode(
        scope,
        nodeType,
        nodeId
      );

    if (!root) {
      return null;
    }

    const safeDepth =
      Math.min(
        10,
        Math.max(
          1,
          Number(
            maxDepth
          ) || 4
        )
      );

    const visited =
      new Set([
        `${nodeType}:${String(
          nodeId
        )}`,
      ]);

    const levels = [];

    let frontier = [
      {
        nodeType,

        nodeId:
          String(
            nodeId
          ),
      },
    ];

    let highestCriticality =
      0;

    let userFacingImpact =
      false;

    for (
      let depth = 1;
      depth <=
        safeDepth &&
      frontier.length > 0;
      depth++
    ) {
      const next = [];

      const currentLevel = [];

      for (
        const node
        of frontier
      ) {
        const relationships =
          await ResourceRelationship
            .find({
              ...scope,

              active:
                true,

              propagatesFailure:
                true,

              targetType:
                node.nodeType,

              targetId:
                node.nodeId,
            })
            .sort({
              criticality:
                -1,
            })
            .lean();

        for (
          const relation
          of relationships
        ) {
          const affected = {
            nodeType:
              relation
                .sourceType,

            nodeId:
              String(
                relation
                  .sourceId
              ),

            via:
              relation
                .relationshipType,

            confidence:
              relation
                .confidence,

            criticality:
              relation
                .criticality,

            userFacing:
              relation
                .userFacing,

            discoveryMethod:
              relation
                .discoveryMethod,
          };

          const key =
            `${affected.nodeType}:${affected.nodeId}`;

          if (
            visited.has(
              key
            )
          ) {
            continue;
          }

          visited.add(
            key
          );

          highestCriticality =
            Math.max(
              highestCriticality,
              affected
                .criticality ||
                0
            );

          if (
            affected
              .userFacing
          ) {
            userFacingImpact =
              true;
          }

          currentLevel.push(
            affected
          );

          next.push(
            affected
          );
        }
      }

      if (
        currentLevel.length >
        0
      ) {
        levels.push({
          depth,

          nodes:
            currentLevel,
        });
      }

      frontier =
        next;
    }

    return {
      root,

      maxDepth:
        safeDepth,

      levels,

      affectedCount:
        visited.size - 1,

      highestCriticality,

      userFacingImpact,

      truncated:
        frontier.length >
        0,
    };
  }
}

module.exports =
  new ResourceRelationshipService();

module.exports
  .ResourceRelationshipService =
  ResourceRelationshipService;