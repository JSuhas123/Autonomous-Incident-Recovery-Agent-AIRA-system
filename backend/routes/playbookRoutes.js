"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14 — PLAYBOOK CONTROL-PLANE ROUTES
 * ============================================================================
 *
 * Mounted at:
 *
 * /api/v1/tenants/:tenantId/playbooks
 *
 * Authentication/context is provided by browserTenantAuth:
 *
 * sessionAuthMiddleware
 *      ↓
 * requireOrgAccess()
 *      ↓
 * requestContextMiddleware
 *      ↓
 * environmentContextMiddleware
 *      ↓
 * rate limiting
 *
 * PHASE 14 PERMISSIONS
 * ============================================================================
 *
 * Read/catalog/match:
 *   playbook.read
 *
 * Import/register:
 *   playbook.create
 *
 * Validate/new version:
 *   playbook.update
 *
 * Approve/activate/disable/deprecate:
 *   playbook.publish
 *
 * Execute:
 *   playbook.read + execution.execute
 *
 * SECURITY
 * ============================================================================
 *
 * - tenantId must match authenticated tenant context
 * - actor identity comes from req.context.userId
 * - approvedBy/disabledBy/deprecatedBy are never trusted from body
 * - execution permission only permits requesting execution
 * - Phase 13 execution policy/safety remains authoritative
 */

const express =
  require(
    "express"
  );

const router =
  express.Router({
    mergeParams:
      true,
  });

const {
  getPlaybookRegistry,
  PlaybookRegistryError,
  REGISTRY_ERROR_CODES,
} =
  require(
    "../playbooks/registry/playbookRegistry"
  );

const {
  getPlaybookExecutionService,
} =
  require(
    "../playbooks/execution/playbookExecutionService"
  );

const {
  matchPlaybooks,
} =
  require(
    "../playbooks/matching/playbookMatcher"
  );

const {
  PLAYBOOK_VALIDATION_PURPOSE,
  PLAYBOOK_LIFECYCLE,
} =
  require(
    "../constants/playbook"
  );

const {
  PERMISSIONS,
} =
  require(
    "../constants/permissions"
  );

const {
  requirePermission,
  requireAllPermissions,
} =
  require(
    "../middleware/authorizationMiddleware"
  );

const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+$/;

const PLAYBOOK_ID_PATTERN =
  /^PB-[A-Z0-9]+(-[A-Z0-9]+)+$/;

const MAX_RESULTS =
  200;

const MAX_LIST =
  1000;

function reg() {
  return getPlaybookRegistry();
}

function svc() {
  return getPlaybookExecutionService();
}

/**
 * ============================================================================
 * TRUSTED CONTEXT
 * ============================================================================
 */

function getPlaybookContext(
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
    !tenantId ||
    !organizationId ||
    !environmentId
  ) {
    const error =
      new Error(
        "Complete authenticated playbook context is required"
      );

    error.status =
      403;

    error.code =
      "PLAYBOOK_CONTEXT_REQUIRED";

    error.executionAuthorized =
      false;

    throw error;
  }

  /**
   * Defense in depth.
   *
   * requireOrgAccess() should already enforce this.
   */
  if (
    String(
      req.params
        .tenantId
    ) !==
    String(
      tenantId
    )
  ) {
    const error =
      new Error(
        "Tenant context mismatch"
      );

    error.status =
      403;

    error.code =
      "PLAYBOOK_TENANT_MISMATCH";

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

function getActorId(
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
      "PLAYBOOK_ACTOR_REQUIRED";

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
 * VALIDATORS
 * ============================================================================
 */

function validateSemver(
  semver,
  res
) {
  if (
    !semver ||
    !SEMVER_PATTERN.test(
      semver
    )
  ) {
    res
      .status(
        400
      )
      .json({
        error:
          "Invalid semver format. Expected x.y.z",

        code:
          "INVALID_VERSION",
      });

    return false;
  }

  return true;
}

function validatePlaybookId(
  id,
  res
) {
  if (
    !id ||
    !PLAYBOOK_ID_PATTERN.test(
      id
    )
  ) {
    res
      .status(
        400
      )
      .json({
        error:
          "Invalid playbookId format. Expected PB-XXX-YYY",

        code:
          "INVALID_ID",
      });

    return false;
  }

  return true;
}

/**
 * ============================================================================
 * REGISTRY ERROR HANDLER
 * ============================================================================
 */

function handleRegistryError(
  err,
  res
) {
  if (
    err instanceof
    PlaybookRegistryError
  ) {
    const httpStatus =
      {
        [
          REGISTRY_ERROR_CODES
            .NOT_FOUND
        ]:
          404,

        [
          REGISTRY_ERROR_CODES
            .DUPLICATE_VERSION
        ]:
          409,

        [
          REGISTRY_ERROR_CODES
            .IMPORT_VALIDATION_FAILED
        ]:
          422,

        [
          REGISTRY_ERROR_CODES
            .ACTIVATION_VALIDATION_FAILED
        ]:
          422,

        [
          REGISTRY_ERROR_CODES
            .VALIDATION_FAILED
        ]:
          422,

        [
          REGISTRY_ERROR_CODES
            .INVALID_TRANSITION
        ]:
          409,

        [
          REGISTRY_ERROR_CODES
            .TRANSITION_CONFLICT
        ]:
          409,

        [
          REGISTRY_ERROR_CODES
            .POLICY_DENIED
        ]:
          403,

        [
          REGISTRY_ERROR_CODES
            .NOT_EXECUTABLE
        ]:
          409,

        [
          REGISTRY_ERROR_CODES
            .TENANT_REQUIRED
        ]:
          400,

        [
          REGISTRY_ERROR_CODES
            .INVALID_VERSION
        ]:
          400,
      }[
        err.code
      ] ||
      400;

    return res
      .status(
        httpStatus
      )
      .json({
        error:
          err.message,

        code:
          err.code,

        details:
          err.details ||
          undefined,
      });
  }

  console.error(
    "[playbook-routes]",
    err
  );

  return res
    .status(
      500
    )
    .json({
      error:
        "Internal server error",

      code:
        "PLAYBOOK_INTERNAL_ERROR",
    });
}

/**
 * ============================================================================
 * CAPABILITIES
 * ============================================================================
 */

router.get(
  "/capabilities",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_READ
  ),

  (
    req,
    res,
    next
  ) => {
    try {
      getPlaybookContext(
        req
      );

      return res.json({
        playbookPlatformVersion:
          "1.0.0",

        features: [
          "lifecycle-management",
          "deterministic-matching",
          "parameter-mapping",
          "runbook-orchestration",
          "audit-trail",
          "phase14-rbac",
        ],

        supportedStageTypes: [
          "INVESTIGATION",
          "DIAGNOSIS_SUPPORT",
          "MITIGATION",
          "RECOVERY",
          "VERIFICATION",
          "ROLLBACK",
          "ESCALATION",
          "NOTIFICATION",
        ],
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
 * LIST PLAYBOOKS
 * ============================================================================
 */

router.get(
  "/",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_READ
  ),

  async (
    req,
    res
  ) => {
    try {
      const {
        tenantId,
      } =
        getPlaybookContext(
          req
        );

      const {
        lifecycle,
        category,
      } =
        req.query;

      const validLifecycles =
        Object.values(
          PLAYBOOK_LIFECYCLE
        );

      if (
        lifecycle &&
        !validLifecycles.includes(
          lifecycle
        )
      ) {
        return res
          .status(
            400
          )
          .json({
            error:
              `Invalid lifecycle filter. Must be one of: ${validLifecycles.join(", ")}`,

            code:
              "INVALID_LIFECYCLE",
          });
      }

      const playbooks =
        await reg()
          .list({
            tenantId,
            lifecycle,
            category,
          });

      const capped =
        playbooks.slice(
          0,
          MAX_LIST
        );

      return res.json({
        playbooks:
          capped,

        count:
          capped.length,

        total:
          playbooks.length,
      });
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * MATCH PLAYBOOKS
 * ============================================================================
 *
 * Must appear before dynamic /:playbookId routes.
 */

router.post(
  "/match",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_READ
  ),

  async (
    req,
    res
  ) => {
    try {
      const {
        tenantId,
      } =
        getPlaybookContext(
          req
        );

      const {
        incident,
        minScore,
        maxResults,
      } =
        req.body ||
        {};

      if (
        !incident ||
        typeof incident !==
          "object"
      ) {
        return res
          .status(
            400
          )
          .json({
            error:
              "incident (object) is required",

            code:
              "MISSING_INCIDENT",
          });
      }

      const cappedMax =
        Math.min(
          Math.max(
            Number(
              maxResults
            ) ||
              10,
            1
          ),
          MAX_RESULTS
        );

      const playbooks =
        await reg()
          .list({
            tenantId,

            lifecycle:
              PLAYBOOK_LIFECYCLE
                .ACTIVE,
          });

      const matches =
        matchPlaybooks(
          playbooks,
          incident,
          {
            minScore,

            maxResults:
              cappedMax,
          }
        );

      return res.json({
        matches,

        count:
          matches.length,

        incident:
          incident.id ||
          null,
      });
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * IMPORT
 * ============================================================================
 */

router.post(
  "/import",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_CREATE
  ),

  async (
    req,
    res
  ) => {
    try {
      const context =
        getPlaybookContext(
          req
        );

      const definition =
        req.body;

      const entry =
        await reg()
          .importDefinition(
            definition,
            {
              tenantContext: {
                tenantId:
                  context
                    .tenantId,

                organizationId:
                  context
                    .organizationId,

                environmentId:
                  context
                    .environmentId,
              },
            }
          );

      return res
        .status(
          201
        )
        .json({
          message:
            "Playbook imported",

          playbook:
            entry,
        });
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * REGISTER
 * ============================================================================
 */

router.post(
  "/register",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_CREATE
  ),

  async (
    req,
    res
  ) => {
    try {
      const context =
        getPlaybookContext(
          req
        );

      /**
       * Never trust tenant ownership from body.
       */
      const definition = {
        ...req.body,

        tenantId:
          context
            .tenantId,

        organizationId:
          context
            .organizationId,

        environmentId:
          context
            .environmentId,
      };

      const entry =
        await reg()
          .register(
            definition,
            {
              purpose:
                PLAYBOOK_VALIDATION_PURPOSE
                  .IMPORT,

              tenantContext: {
                tenantId:
                  context
                    .tenantId,

                organizationId:
                  context
                    .organizationId,

                environmentId:
                  context
                    .environmentId,
              },
            }
          );

      return res
        .status(
          201
        )
        .json({
          message:
            "Playbook registered",

          playbook:
            entry,
        });
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * GET PLAYBOOK VERSIONS
 * ============================================================================
 */

router.get(
  "/:playbookId",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_READ
  ),

  async (
    req,
    res
  ) => {
    try {
      const {
        tenantId,
      } =
        getPlaybookContext(
          req
        );

      const {
        playbookId,
      } =
        req.params;

      if (
        !validatePlaybookId(
          playbookId,
          res
        )
      ) {
        return;
      }

      const versions =
        await reg()
          .getById(
            playbookId,
            tenantId
          );

      const latest =
        versions.reduce(
          (
            best,
            current
          ) =>
            !best ||
            current.semver >
              best.semver
              ? current
              : best,
          null
        );

      return res.json({
        playbookId,

        versions,

        latest,
      });
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * GET SPECIFIC VERSION
 * ============================================================================
 */

router.get(
  "/:playbookId/:semver",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_READ
  ),

  async (
    req,
    res
  ) => {
    try {
      const {
        tenantId,
      } =
        getPlaybookContext(
          req
        );

      const {
        playbookId,
        semver,
      } =
        req.params;

      if (
        !validatePlaybookId(
          playbookId,
          res
        ) ||
        !validateSemver(
          semver,
          res
        )
      ) {
        return;
      }

      const playbook =
        await reg()
          .getVersion(
            playbookId,
            semver,
            tenantId
          );

      return res.json(
        playbook
      );
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * VALIDATE VERSION
 * ============================================================================
 */

router.post(
  "/:id/:v/validate",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_UPDATE
  ),

  async (
    req,
    res
  ) => {
    try {
      const {
        tenantId,
      } =
        getPlaybookContext(
          req
        );

      const {
        id,
        v,
      } =
        req.params;

      if (
        !validatePlaybookId(
          id,
          res
        ) ||
        !validateSemver(
          v,
          res
        )
      ) {
        return;
      }

      const result =
        await reg()
          .validate(
            id,
            v,
            {
              tenantId,
            }
          );

      return res.json({
        message:
          "Playbook validated",

        lifecycle:
          result.lifecycle,

        checksum:
          result.checksum,
      });
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * APPROVE VERSION
 * ============================================================================
 */

router.post(
  "/:id/:v/approve",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_PUBLISH
  ),

  async (
    req,
    res
  ) => {
    try {
      const {
        tenantId,
      } =
        getPlaybookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      const {
        id,
        v,
      } =
        req.params;

      const result =
        await reg()
          .approve(
            id,
            v,
            {
              tenantId,

              approvedBy:
                actor,
            }
          );

      return res.json({
        message:
          "Playbook approved",

        lifecycle:
          result.lifecycle,
      });
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * ACTIVATE VERSION
 * ============================================================================
 */

router.post(
  "/:id/:v/activate",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_PUBLISH
  ),

  async (
    req,
    res
  ) => {
    try {
      const context =
        getPlaybookContext(
          req
        );

      const {
        id,
        v,
      } =
        req.params;

      const result =
        await reg()
          .activate(
            id,
            v,
            {
              tenantId:
                context
                  .tenantId,

              runbookRegistry:
                req.app
                  .locals
                  .runbookRegistry,

              tenantContext: {
                tenantId:
                  context
                    .tenantId,

                organizationId:
                  context
                    .organizationId,

                environmentId:
                  context
                    .environmentId,
              },
            }
          );

      return res.json({
        message:
          "Playbook activated",

        lifecycle:
          result.lifecycle,

        checksum:
          result.checksum,
      });
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * DISABLE VERSION
 * ============================================================================
 */

router.post(
  "/:id/:v/disable",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_PUBLISH
  ),

  async (
    req,
    res
  ) => {
    try {
      const {
        tenantId,
      } =
        getPlaybookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      const {
        id,
        v,
      } =
        req.params;

      const result =
        await reg()
          .disable(
            id,
            v,
            {
              tenantId,

              disabledBy:
                actor,

              reason:
                req.body
                  ?.reason ||
                null,
            }
          );

      return res.json({
        message:
          "Playbook disabled",

        lifecycle:
          result.lifecycle,
      });
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * DEPRECATE VERSION
 * ============================================================================
 */

router.post(
  "/:id/:v/deprecate",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_PUBLISH
  ),

  async (
    req,
    res
  ) => {
    try {
      const {
        tenantId,
      } =
        getPlaybookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      const {
        id,
        v,
      } =
        req.params;

      const result =
        await reg()
          .deprecate(
            id,
            v,
            {
              tenantId,

              deprecatedBy:
                actor,

              reason:
                req.body
                  ?.reason ||
                null,
            }
          );

      return res.json({
        message:
          "Playbook deprecated",

        lifecycle:
          result.lifecycle,
      });
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * CREATE NEW VERSION
 * ============================================================================
 */

router.post(
  "/:id/:v/version",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_UPDATE
  ),

  async (
    req,
    res
  ) => {
    try {
      const {
        tenantId,
      } =
        getPlaybookContext(
          req
        );

      const {
        id,
        v,
      } =
        req.params;

      const {
        newSemver,
        patches,
      } =
        req.body ||
        {};

      if (
        !newSemver
      ) {
        return res
          .status(
            400
          )
          .json({
            error:
              "newSemver is required",

            code:
              "NEW_VERSION_REQUIRED",
          });
      }

      if (
        !validateSemver(
          newSemver,
          res
        )
      ) {
        return;
      }

      const result =
        await reg()
          .createVersion(
            id,
            v,
            newSemver,
            patches ||
              {},
            {
              tenantId,
            }
          );

      return res
        .status(
          201
        )
        .json({
          message:
            "New version created",

          playbook:
            result,
        });
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

/**
 * ============================================================================
 * EXECUTE PLAYBOOK
 * ============================================================================
 *
 * Requires BOTH:
 *
 * playbook.read
 * execution.execute
 *
 * execution.execute allows the user to request execution.
 *
 * It does NOT bypass Phase 13:
 *
 * policy
 * approval
 * critic
 * safety
 * execution authorization
 */

router.post(
  "/:id/:v/execute",

  requireAllPermissions([
    PERMISSIONS
      .PLAYBOOK_READ,

    PERMISSIONS
      .EXECUTION_EXECUTE,
  ]),

  async (
    req,
    res
  ) => {
    try {
      const context =
        getPlaybookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      const {
        id,
        v,
      } =
        req.params;

      if (
        !validatePlaybookId(
          id,
          res
        ) ||
        !validateSemver(
          v,
          res
        )
      ) {
        return;
      }

      const {
        incidentContext,
        incidentId,
        correlationId,
        dryRun,
      } =
        req.body ||
        {};

      if (
        !incidentContext ||
        typeof incidentContext !==
          "object"
      ) {
        return res
          .status(
            400
          )
          .json({
            error:
              "incidentContext (object) is required",

            code:
              "MISSING_INCIDENT_CONTEXT",
          });
      }

      const result =
        await svc()
          .execute(
            id,
            v,
            incidentContext,
            {
              tenantId:
                context
                  .tenantId,

              organizationId:
                context
                  .organizationId,

              environmentId:
                context
                  .environmentId,

              incidentId,

              correlationId,

              dryRun:
                Boolean(
                  dryRun
                ),

              initiatedBy:
                actor,

              initiatorType:
                "user",
            }
          );

      const httpStatus =
        result.status ===
        "WAITING_FOR_APPROVAL"
          ? 202
          : 200;

      return res
        .status(
          httpStatus
        )
        .json(
          result
        );
    } catch (
      error
    ) {
      return handleRegistryError(
        error,
        res
      );
    }
  }
);

module.exports =
  router;