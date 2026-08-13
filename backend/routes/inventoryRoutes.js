"use strict";

const express =
  require("express");

const Joi =
  require("joi");

const router =
  express.Router();

const inventoryService =
  require(
    "../services/inventory/inventoryService"
  );

const resourceRelationshipService =
  require(
    "../services/inventory/resourceRelationshipService"
  );

const serviceDependencyService =
  require(
    "../services/inventory/serviceDependencyService"
  );

const topologyService =
  require(
    "../services/inventory/topologyService"
  );

// ============================================================================
// VALIDATION
// ============================================================================

const relationshipSchema =
  Joi.object({
    sourceType:
      Joi.string()
        .valid(
          "service",
          "resource"
        )
        .required(),

    sourceId:
      Joi.string()
        .required(),

    targetType:
      Joi.string()
        .valid(
          "service",
          "resource"
        )
        .required(),

    targetId:
      Joi.string()
        .required(),

    relationshipType:
      Joi.string()
        .valid(
          "depends_on",
          "runs_on",
          "uses",
          "connects_to",
          "backed_by",
          "exposed_by",
          "owned_by",
          "contains",
          "routes_to",
          "selects",
          "scheduled_on",
          "replicates_to",
          "member_of",
          "related_to"
        )
        .required(),

    confidence:
      Joi.number()
        .min(0)
        .max(1)
        .default(1),

    criticality:
      Joi.number()
        .integer()
        .min(1)
        .max(10)
        .default(5),

    userFacing:
      Joi.boolean()
        .default(false),

    evidence:
      Joi.object()
        .unknown(true)
        .default({}),
  });

const dependencySchema =
  Joi.object({
    sourceServiceId:
      Joi.string()
        .required(),

    targetServiceId:
      Joi.string()
        .required(),

    dependencyType:
      Joi.string()
        .valid(
          "critical",
          "degraded",
          "optional"
        )
        .default(
          "critical"
        ),

    criticality:
      Joi.number()
        .integer()
        .min(1)
        .max(10)
        .default(5),

    userFacing:
      Joi.boolean()
        .default(false),

    latencyMs:
      Joi.number()
        .min(0)
        .default(0),

    failureRate:
      Joi.number()
        .min(0)
        .max(1)
        .default(0),

    confidence:
      Joi.number()
        .min(0)
        .max(1)
        .default(1),

    discoveryMethod:
      Joi.string()
        .valid(
          "manual",
          "configuration",
          "telemetry",
          "connector",
          "inferred"
        )
        .default(
          "manual"
        ),

    evidence:
      Joi.object()
        .unknown(true)
        .default({}),
  });

function validateBody(
  schema
) {
  return (
    req,
    res,
    next
  ) => {
    const {
      error,
      value,
    } =
      schema.validate(
        req.body ||
        {},
        {
          abortEarly:
            false,

          stripUnknown:
            true,
        }
      );

    if (error) {
      return res
        .status(400)
        .json({
          error:
            "Validation failed",

          code:
            "VALIDATION_ERROR",

          details:
            error.details.map(
              (detail) => ({
                field:
                  detail.path.join(
                    "."
                  ),

                message:
                  detail.message,
              })
            ),
        });
    }

    req.validatedBody =
      value;

    return next();
  };
}

// ============================================================================
// GET /api/v1/inventory
// ============================================================================

router.get(
  "/",
  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await inventoryService
          .listResources(
            req.context,
            {
              provider:
                req.query
                  .provider,

              resourceType:
                req.query
                  .resourceType,

              resourceSubtype:
                req.query
                  .resourceSubtype,

              integrationId:
                req.query
                  .integrationId,

              namespace:
                req.query
                  .namespace,

              healthStatus:
                req.query
                  .healthStatus,

              search:
                req.query
                  .search,

              includeInactive:
                req.query
                  .includeInactive ===
                "true",

              page:
                req.query
                  .page,

              limit:
                req.query
                  .limit,
            }
          );

      return res.json(
        result
      );
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /summary
// ============================================================================

router.get(
  "/summary",
  async (
    req,
    res,
    next
  ) => {
    try {
      const summary =
        await inventoryService
          .getSummary(
            req.context
          );

      return res.json({
        summary,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /topology
// ============================================================================

router.get(
  "/topology",
  async (
    req,
    res,
    next
  ) => {
    try {
      const topology =
        await topologyService
          .getEnvironmentTopology(
            req.context
          );

      return res.json({
        topology,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /resources/:resourceId
// ============================================================================

router.get(
  "/resources/:resourceId",
  async (
    req,
    res,
    next
  ) => {
    try {
      const resource =
        await inventoryService
          .getResource(
            req.context,
            req.params
              .resourceId
          );

      if (!resource) {
        return res
          .status(404)
          .json({
            error:
              "Infrastructure resource not found",

            code:
              "RESOURCE_NOT_FOUND",
          });
      }

      return res.json({
        resource,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /nodes/:nodeType/:nodeId
// ============================================================================

router.get(
  "/nodes/:nodeType/:nodeId",
  async (
    req,
    res,
    next
  ) => {
    try {
      if (
        ![
          "service",
          "resource",
        ].includes(
          req.params
            .nodeType
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              "Invalid node type",

            code:
              "INVALID_NODE_TYPE",
          });
      }

      const topology =
        await topologyService
          .getNodeTopology(
            req.context,
            {
              nodeType:
                req.params
                  .nodeType,

              nodeId:
                req.params
                  .nodeId,
            }
          );

      if (!topology) {
        return res
          .status(404)
          .json({
            error:
              "Topology node not found",

            code:
              "TOPOLOGY_NODE_NOT_FOUND",
          });
      }

      return res.json({
        topology,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// POST /relationships
// ============================================================================

router.post(
  "/relationships",

  validateBody(
    relationshipSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const relationship =
        await resourceRelationshipService
          .upsertRelationship(
            req.context,
            req.validatedBody
          );

      return res
        .status(201)
        .json({
          relationship,
        });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /nodes/:nodeType/:nodeId/neighbours
// ============================================================================

router.get(
  "/nodes/:nodeType/:nodeId/neighbours",

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await resourceRelationshipService
          .getNeighbours(
            req.context,
            {
              nodeType:
                req.params
                  .nodeType,

              nodeId:
                req.params
                  .nodeId,

              direction:
                req.query
                  .direction ||
                "both",
            }
          );

      return res.json(
        result
      );
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /nodes/:nodeType/:nodeId/blast-radius
// ============================================================================

router.get(
  "/nodes/:nodeType/:nodeId/blast-radius",

  async (
    req,
    res,
    next
  ) => {
    try {
      const maxDepth =
        Math.min(
          10,
          Math.max(
            1,
            Number(
              req.query
                .depth
            ) || 4
          )
        );

      const blastRadius =
        await resourceRelationshipService
          .getBlastRadius(
            req.context,
            {
              nodeType:
                req.params
                  .nodeType,

              nodeId:
                req.params
                  .nodeId,

              maxDepth,
            }
          );

      return res.json({
        blastRadius,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// POST /dependencies
// ============================================================================

router.post(
  "/dependencies",

  validateBody(
    dependencySchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const dependency =
        await serviceDependencyService
          .upsertDependency(
            req.context,
            req.validatedBody
          );

      return res
        .status(201)
        .json({
          dependency,
        });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /services/:serviceId/dependencies
// ============================================================================

router.get(
  "/services/:serviceId/dependencies",

  async (
    req,
    res,
    next
  ) => {
    try {
      const dependencies =
        await serviceDependencyService
          .getDependencies(
            req.context,
            req.params
              .serviceId
          );

      return res.json({
        dependencies,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /services/:serviceId/dependents
// ============================================================================

router.get(
  "/services/:serviceId/dependents",

  async (
    req,
    res,
    next
  ) => {
    try {
      const dependents =
        await serviceDependencyService
          .getDependents(
            req.context,
            req.params
              .serviceId
          );

      return res.json({
        dependents,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET /service-graph
// ============================================================================

router.get(
  "/service-graph",

  async (
    req,
    res,
    next
  ) => {
    try {
      const graph =
        await serviceDependencyService
          .getServiceGraph(
            req.context
          );

      return res.json({
        graph,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

module.exports =
  router;