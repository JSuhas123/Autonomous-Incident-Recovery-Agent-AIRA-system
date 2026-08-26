"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14 — POLICY MANAGEMENT ROUTES
 * ============================================================================
 *
 * Policy management is a highly privileged control-plane surface.
 *
 * A policy can influence:
 *
 * - whether recovery is permitted
 * - whether approval is required
 * - execution safety constraints
 * - rollback behavior
 * - autonomous recovery behavior
 *
 * Therefore:
 *
 * READ / simulation operations
 *      → policy.read
 *
 * POLICY MUTATION operations
 *      → policy.manage
 *
 * SECURITY RULES
 * ============================================================================
 *
 * 1. tenantId is NEVER trusted from request body/query.
 * 2. createdBy is NEVER trusted from request body.
 * 3. actor is NEVER trusted from request body.
 * 4. authenticated scope comes from req.context.
 * 5. authenticated human identity comes from req.context.userId.
 *
 * Phase 13 operational execution authorization remains separate from this
 * SaaS RBAC layer.
 */

const express =
  require(
    "express"
  );

const Joi =
  require(
    "joi"
  );

const {
  validatePolicy,
  checkActionAllowed,
} =
  require(
    "../services/core/policy/policyValidator"
  );

const dryRunService =
  require(
    "../services/core/policy/dryRunService"
  );

const policyRollbackService =
  require(
    "../services/core/policy/policyRollbackService"
  );

const {
  PERMISSIONS,
} =
  require(
    "../constants/permissions"
  );

const {
  requirePermission,
} =
  require(
    "../middleware/authorizationMiddleware"
  );

const router =
  express.Router();

/**
 * ============================================================================
 * VALIDATION SCHEMAS
 * ============================================================================
 */

const validatePolicySchema =
  Joi.object({
    policy:
      Joi.object()
        .required(),
  })
    .unknown(false);

const dryRunSchema =
  Joi.object({
    action:
      Joi.string()
        .trim()
        .required(),

    conditions:
      Joi.object()
        .required(),

    incidentData:
      Joi.object()
        .default({}),

    policy:
      Joi.object()
        .optional(),
  })
    .unknown(false);

const dryRunCompareSchema =
  Joi.object({
    scenarios:
      Joi.array()
        .items(
          Joi.object({
            action:
              Joi.string()
                .trim()
                .required(),

            conditions:
              Joi.object()
                .required(),

            incidentData:
              Joi.object()
                .default({}),
          })
            .unknown(false)
        )
        .min(1)
        .max(50)
        .required(),

    policy:
      Joi.object()
        .optional(),
  })
    .unknown(false);

const createVersionSchema =
  Joi.object({
    policyId:
      Joi.string()
        .trim()
        .min(1)
        .max(200)
        .required(),

    content:
      Joi.object()
        .required(),
  })
    .unknown(false);

const activateVersionSchema =
  Joi.object({
    policyId:
      Joi.string()
        .trim()
        .required(),

    version:
      Joi.string()
        .trim()
        .required(),
  })
    .unknown(false);

const rollbackSchema =
  Joi.object({
    policyId:
      Joi.string()
        .trim()
        .required(),

    targetVersion:
      Joi.string()
        .trim()
        .required(),

    reason:
      Joi.string()
        .trim()
        .max(1000)
        .allow("")
        .default(
          "Manual rollback"
        ),
  })
    .unknown(false);

const recordOutcomeSchema =
  Joi.object({
    policyId:
      Joi.string()
        .trim()
        .required(),

    success:
      Joi.boolean()
        .required(),

    resolutionTimeMs:
      Joi.number()
        .integer()
        .min(0)
        .default(0),

    action:
      Joi.string()
        .trim()
        .allow(
          "",
          null
        )
        .default(null),
  })
    .unknown(false);

const checkAllowedSchema =
  Joi.object({
    action:
      Joi.string()
        .trim()
        .required(),

    conditions:
      Joi.object()
        .required(),

    policy:
      Joi.object()
        .required(),
  })
    .unknown(false);

/**
 * ============================================================================
 * VALIDATION MIDDLEWARE
 * ============================================================================
 */

function validateBody(
  schema
) {
  return function policyBodyValidation(
    req,
    res,
    next
  ) {
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
            false,
        }
      );

    if (
      error
    ) {
      return res
        .status(
          400
        )
        .json({
          error:
            "Invalid request body",

          code:
            "VALIDATION_ERROR",

          details:
            error
              .details
              .map(
                (
                  detail
                ) => ({
                  field:
                    detail
                      .path
                      .join(
                        "."),

                  message:
                    detail
                      .message,
                })
              ),
        });
    }

    req.validatedBody =
      value;

    return next();
  };
}

/**
 * ============================================================================
 * TRUSTED CONTROL-PLANE CONTEXT
 * ============================================================================
 */

function getPolicyContext(
  req
) {
  const context =
    req.context ||
    {};

  const tenantId =
    context.tenantId ||
    null;

  const organizationId =
    context.organizationId ||
    null;

  const environmentId =
    context.environmentId ||
    null;

  if (
    !tenantId
  ) {
    const error =
      new Error(
        "Authenticated tenant context is required"
      );

    error.status =
      403;

    error.code =
      "POLICY_TENANT_CONTEXT_REQUIRED";

    error.executionAuthorized =
      false;

    throw error;
  }

  if (
    !organizationId
  ) {
    const error =
      new Error(
        "Authenticated organization context is required"
      );

    error.status =
      403;

    error.code =
      "POLICY_ORGANIZATION_CONTEXT_REQUIRED";

    error.executionAuthorized =
      false;

    throw error;
  }

  if (
    !environmentId
  ) {
    const error =
      new Error(
        "Active environment context is required"
      );

    error.status =
      409;

    error.code =
      "POLICY_ENVIRONMENT_CONTEXT_REQUIRED";

    error.executionAuthorized =
      false;

    throw error;
  }

  return {
    tenantId:
      String(
        tenantId
      ),

    organizationId:
      String(
        organizationId
      ),

    environmentId:
      String(
        environmentId
      ),
  };
}

function getAuthenticatedActor(
  req
) {
  const userId =
    req.context
      ?.userId ||
    null;

  if (
    !userId
  ) {
    const error =
      new Error(
        "Authenticated user identity is required"
      );

    error.status =
      403;

    error.code =
      "POLICY_ACTOR_REQUIRED";

    error.executionAuthorized =
      false;

    throw error;
  }

  return String(
    userId
  );
}

/**
 * ============================================================================
 * POST /api/v1/policy/validate
 * ============================================================================
 *
 * Validate policy content.
 *
 * Permission:
 *
 * policy.read
 */

router.post(
  "/validate",

  requirePermission(
    PERMISSIONS
      .POLICY_READ
  ),

  validateBody(
    validatePolicySchema
  ),

  (
    req,
    res,
    next
  ) => {
    try {
      getPolicyContext(
        req
      );

      const {
        policy,
      } =
        req.validatedBody;

      const result =
        validatePolicy(
          policy
        );

      return res.json({
        valid:
          result.valid,

        errors:
          result.errors,

        warnings:
          result.warnings,

        validatedPolicy:
          result.valid
            ? result.value
            : null,

        timestamp:
          new Date()
            .toISOString(),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /api/v1/policy/dry-run
 * ============================================================================
 *
 * Permission:
 *
 * policy.read
 */

router.post(
  "/dry-run",

  requirePermission(
    PERMISSIONS
      .POLICY_READ
  ),

  validateBody(
    dryRunSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      getPolicyContext(
        req
      );

      const {
        action,
        conditions,
        incidentData,
        policy,
      } =
        req.validatedBody;

      if (
        policy
      ) {
        const validation =
          validatePolicy(
            policy
          );

        if (
          !validation.valid
        ) {
          return res
            .status(
              400
            )
            .json({
              error:
                "Invalid policy",

              code:
                "INVALID_POLICY",

              details:
                validation.errors,
            });
        }
      }

      const policyToUse =
        policy ||
        {};

      const allowedCheck =
        checkActionAllowed(
          action,
          conditions,
          policyToUse
        );

      const simulation =
        await dryRunService
          .simulateAction(
            action,
            conditions,
            incidentData ||
              {},
            policyToUse
          );

      return res.json({
        simulationId:
          simulation
            .simulationId,

        action,

        policyAllows:
          allowedCheck
            .allowed,

        policyDenialReason:
          allowedCheck
            .reason,

        requiresApproval:
          allowedCheck
            .requiresApproval,

        analysis:
          simulation
            .analysis,

        recommendation:
          simulation
            .recommendation,

        timestamp:
          new Date()
            .toISOString(),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /api/v1/policy/dry-run/compare
 * ============================================================================
 *
 * Permission:
 *
 * policy.read
 */

router.post(
  "/dry-run/compare",

  requirePermission(
    PERMISSIONS
      .POLICY_READ
  ),

  validateBody(
    dryRunCompareSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      getPolicyContext(
        req
      );

      const {
        scenarios,
        policy,
      } =
        req.validatedBody;

      const comparisons =
        [];

      for (
        const scenario
        of scenarios
      ) {
        const simulation =
          await dryRunService
            .simulateAction(
              scenario
                .action,

              scenario
                .conditions,

              scenario
                .incidentData ||
                {},

              policy ||
                {}
            );

        comparisons.push({
          action:
            scenario
              .action,

          severity:
            scenario
              .conditions
              ?.severity,

          recommendation:
            simulation
              .recommendation
              .recommendation,

          successProbability:
            simulation
              .analysis
              .successProbability,

          estimatedDurationMs:
            simulation
              .analysis
              .estimatedDurationMs,

          blastRadius:
            simulation
              .analysis
              .blastRadius,

          safe:
            simulation
              .analysis
              .safetyAssessment
              .safe,

          riskLevel:
            simulation
              .analysis
              .safetyAssessment
              .riskLevel,
        });
      }

      comparisons.sort(
        (
          first,
          second
        ) =>
          second
            .successProbability -
          first
            .successProbability
      );

      return res.json({
        compareCount:
          comparisons
            .length,

        scenarios:
          comparisons,

        bestOption:
          comparisons[0] ||
          null,

        timestamp:
          new Date()
            .toISOString(),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * GET /api/v1/policy/dry-run/results
 * ============================================================================
 *
 * Permission:
 *
 * policy.read
 */

router.get(
  "/dry-run/results",

  requirePermission(
    PERMISSIONS
      .POLICY_READ
  ),

  (
    req,
    res,
    next
  ) => {
    try {
      getPolicyContext(
        req
      );

      const parsedLimit =
        Number.parseInt(
          req.query
            .limit,
          10
        );

      const limit =
        Number.isFinite(
          parsedLimit
        )
          ? Math.min(
              Math.max(
                parsedLimit,
                1
              ),
              100
            )
          : 10;

      const results =
        dryRunService
          .getRecentResults(
            limit
          );

      return res.json({
        results,

        count:
          results.length,

        timestamp:
          new Date()
            .toISOString(),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /api/v1/policy/create-version
 * ============================================================================
 *
 * Permission:
 *
 * policy.manage
 *
 * SECURITY:
 *
 * tenantId and createdBy are resolved from authenticated context.
 */

router.post(
  "/create-version",

  requirePermission(
    PERMISSIONS
      .POLICY_MANAGE
  ),

  validateBody(
    createVersionSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getPolicyContext(
          req
        );

      const createdBy =
        getAuthenticatedActor(
          req
        );

      const {
        policyId,
        content,
      } =
        req.validatedBody;

      const validation =
        validatePolicy(
          content
        );

      if (
        !validation.valid
      ) {
        return res
          .status(
            400
          )
          .json({
            error:
              "Invalid policy content",

            code:
              "INVALID_POLICY",

            details:
              validation.errors,
          });
      }

      const version =
        await policyRollbackService
          .createPolicyVersion(
            context
              .tenantId,

            policyId,

            validation
              .value,

            createdBy
          );

      return res
        .status(
          201
        )
        .json({
          success:
            true,

          policyId,

          version:
            version
              .version,

          status:
            version
              .status,

          createdAt:
            version
              .createdAt,
        });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /api/v1/policy/activate-version
 * ============================================================================
 *
 * Permission:
 *
 * policy.manage
 */

router.post(
  "/activate-version",

  requirePermission(
    PERMISSIONS
      .POLICY_MANAGE
  ),

  validateBody(
    activateVersionSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getPolicyContext(
          req
        );

      const {
        policyId,
        version,
      } =
        req.validatedBody;

      const activated =
        await policyRollbackService
          .activateVersion(
            context
              .tenantId,

            policyId,

            version
          );

      if (
        !activated
      ) {
        const error =
          new Error(
            "Policy version not found"
          );

        error.status =
          404;

        error.code =
          "POLICY_VERSION_NOT_FOUND";

        throw error;
      }

      return res.json({
        success:
          true,

        policyId,

        activatedVersion:
          activated
            .version,

        status:
          activated
            .status,

        activatedAt:
          activated
            .activatedAt,
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /api/v1/policy/rollback
 * ============================================================================
 *
 * Permission:
 *
 * policy.manage
 *
 * SECURITY:
 *
 * actor is derived from req.context.userId.
 */

router.post(
  "/rollback",

  requirePermission(
    PERMISSIONS
      .POLICY_MANAGE
  ),

  validateBody(
    rollbackSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getPolicyContext(
          req
        );

      const actor =
        getAuthenticatedActor(
          req
        );

      const {
        policyId,
        targetVersion,
        reason,
      } =
        req.validatedBody;

      const result =
        await policyRollbackService
          .rollback(
            context
              .tenantId,

            policyId,

            targetVersion,

            reason ||
              "Manual rollback",

            actor
          );

      return res.json({
        success:
          result
            .success,

        fromVersion:
          result
            .fromVersion,

        toVersion:
          result
            .toVersion,

        reason:
          result
            .reason,

        rollbackAt:
          new Date()
            .toISOString(),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /api/v1/policy/record-outcome
 * ============================================================================
 *
 * Permission:
 *
 * policy.manage
 *
 * This remains mutation-capable because it changes policy effectiveness
 * metrics.
 */

router.post(
  "/record-outcome",

  requirePermission(
    PERMISSIONS
      .POLICY_MANAGE
  ),

  validateBody(
    recordOutcomeSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getPolicyContext(
          req
        );

      const {
        policyId,
        success,
        resolutionTimeMs,
        action,
      } =
        req.validatedBody;

      await policyRollbackService
        .recordOutcome(
          context
            .tenantId,

          policyId,

          {
            success,

            resolutionTimeMs,

            action,
          }
        );

      return res.json({
        success:
          true,

        recorded:
          true,

        timestamp:
          new Date()
            .toISOString(),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * GET /api/v1/policy/version-history
 * ============================================================================
 *
 * Permission:
 *
 * policy.read
 *
 * Query:
 *
 * ?policyId=...
 *
 * tenantId is NEVER accepted from query.
 */

router.get(
  "/version-history",

  requirePermission(
    PERMISSIONS
      .POLICY_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getPolicyContext(
          req
        );

      const policyId =
        typeof req.query
          .policyId ===
          "string"
          ? req.query
              .policyId
              .trim()
          : "";

      if (
        !policyId
      ) {
        return res
          .status(
            400
          )
          .json({
            error:
              "policyId query parameter required",

            code:
              "POLICY_ID_REQUIRED",
          });
      }

      const history =
        await policyRollbackService
          .getVersionHistory(
            context
              .tenantId,

            policyId
          );

      return res.json({
        policyId,

        versions:
          history.map(
            (
              version
            ) => ({
              version:
                version
                  .version,

              status:
                version
                  .status,

              createdAt:
                version
                  .createdAt,

              activatedAt:
                version
                  .activatedAt,

              deactivatedAt:
                version
                  .deactivatedAt,

              effectivenessScore:
                version
                  .metrics
                  ?.effectivenessScore ??
                null,

              totalIncidents:
                version
                  .metrics
                  ?.totalIncidentsProcessed ??
                0,

              successRate:
                (
                  version
                    .metrics
                    ?.successfulActions ||
                  0
                ) /
                (
                  version
                    .metrics
                    ?.totalIncidentsProcessed ||
                  1
                ),
            })
          ),

        timestamp:
          new Date()
            .toISOString(),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * GET /api/v1/policy/rollback-history
 * ============================================================================
 *
 * Permission:
 *
 * policy.read
 */

router.get(
  "/rollback-history",

  requirePermission(
    PERMISSIONS
      .POLICY_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getPolicyContext(
          req
        );

      const policyId =
        typeof req.query
          .policyId ===
          "string"
          ? req.query
              .policyId
              .trim()
          : "";

      if (
        !policyId
      ) {
        return res
          .status(
            400
          )
          .json({
            error:
              "policyId query parameter required",

            code:
              "POLICY_ID_REQUIRED",
          });
      }

      const parsedLimit =
        Number.parseInt(
          req.query
            .limit,
          10
        );

      const limit =
        Number.isFinite(
          parsedLimit
        )
          ? Math.min(
              Math.max(
                parsedLimit,
                1
              ),
              100
            )
          : 20;

      const history =
        await policyRollbackService
          .getRollbackHistory(
            context
              .tenantId,

            policyId,

            limit
          );

      return res.json({
        policyId,

        rollbackEvents:
          history,

        count:
          history.length,

        timestamp:
          new Date()
            .toISOString(),
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

/**
 * ============================================================================
 * POST /api/v1/policy/check-allowed
 * ============================================================================
 *
 * Permission:
 *
 * policy.read
 *
 * This endpoint performs evaluation only. It does NOT authorize or execute an
 * infrastructure action.
 */

router.post(
  "/check-allowed",

  requirePermission(
    PERMISSIONS
      .POLICY_READ
  ),

  validateBody(
    checkAllowedSchema
  ),

  (
    req,
    res,
    next
  ) => {
    try {
      getPolicyContext(
        req
      );

      const {
        action,
        conditions,
        policy,
      } =
        req.validatedBody;

      const result =
        checkActionAllowed(
          action,
          conditions,
          policy
        );

      return res.json({
        action,

        allowed:
          result.allowed,

        reason:
          result.reason,

        rule:
          result.rule,

        requiresApproval:
          result
            .requiresApproval,

        approvers:
          result.approvers,
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

module.exports =
  router;