"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14 — RUNBOOK CONTROL-PLANE ROUTES
 * ============================================================================
 *
 * Mounted at:
 *
 * /api/v1/tenants/:tenantId/runbooks
 *
 * Permissions:
 *
 * READ
 *   playbook.read
 *
 * IMPORT / REGISTER
 *   playbook.create
 *
 * VALIDATE / VERSION
 *   playbook.update
 *
 * APPROVE / ACTIVATE / DISABLE / DEPRECATE
 *   playbook.publish
 *
 * EXECUTE
 *   playbook.read + execution.execute
 *
 * Runbooks currently share the Playbook permission domain because both are
 * recovery knowledge objects.
 *
 * We deliberately do NOT create duplicate permissions like runbook.read and
 * runbook.publish unless product requirements later justify separate control.
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
  RunbookExecution,
} =
  require(
    "../persistence/operational/legacyModels"
  );

const {
  getRunbookRegistry,
  RegistryError,
} =
  require(
    "../runbooks/registry/runbookRegistry"
  );

const {
  getRunbookExecutionEngine,
} =
  require(
    "../runbooks/execution/runbookExecutionEngine"
  );

const {
  getActionHandlerRegistry,
} =
  require(
    "../runbooks/actions/actionHandlerRegistry"
  );

const {
  VALIDATION_PURPOSE,
} =
  require(
    "../runbooks/validators/runbookValidator"
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

function registry() {
  return getRunbookRegistry();
}

function engine() {
  return getRunbookExecutionEngine();
}

/**
 * ============================================================================
 * TRUSTED CONTEXT
 * ============================================================================
 */

function getRunbookContext(
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
        "Complete authenticated runbook context is required"
      );

    error.status =
      403;

    error.code =
      "RUNBOOK_CONTEXT_REQUIRED";

    error.executionAuthorized =
      false;

    throw error;
  }

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
      "RUNBOOK_TENANT_MISMATCH";

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
      "RUNBOOK_ACTOR_REQUIRED";

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
 * REGISTRY ERROR HANDLER
 * ============================================================================
 */

function handleRegistryError(
  err,
  res
) {
  if (
    err instanceof
    RegistryError
  ) {
    const httpStatus =
      {
        NOT_FOUND:
          404,

        DUPLICATE_VERSION:
          409,

        IMPORT_VALIDATION_FAILED:
          422,

        ACTIVATION_VALIDATION_FAILED:
          422,

        VALIDATION_FAILED:
          422,

        INVALID_TRANSITION:
          409,

        TRANSITION_CONFLICT:
          409,

        POLICY_DENIED:
          403,

        NOT_EXECUTABLE:
          409,

        TENANT_REQUIRED:
          400,

        INVALID_VERSION:
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

        diagnostics:
          err.detail
            ?.diagnostics,
      });
  }

  throw err;
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
      getRunbookContext(
        req
      );

      const report =
        getActionHandlerRegistry()
          .report();

      return res.json({
        capabilities:
          report,

        count:
          report.length,
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
 * LIST
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
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const {
        lifecycle,
        ownerType,
      } =
        req.query;

      const runbooks =
        await registry()
          .list(
            {
              lifecycle,
              ownerType,
            },

            context
              .tenantId
          );

      return res.json({
        tenantId:
          context
            .tenantId,

        count:
          runbooks.length,

        runbooks,
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
 * EXECUTION RECORD
 * ============================================================================
 *
 * Phase 13 operational-document reads require organization + environment.
 */

router.get(
  "/executions/:executionId",

  requirePermission(
    PERMISSIONS
      .EXECUTION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const {
        executionId,
      } =
        req.params;

      const execution =
        await RunbookExecution
          .findOne({
            executionId,

            tenantId:
              context
                .tenantId,

            organizationId:
              context
                .organizationId,

            environmentId:
              context
                .environmentId,
          })
          .lean();

      if (
        !execution
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Execution not found",

            code:
              "RUNBOOK_EXECUTION_NOT_FOUND",

            executionId,
          });
      }

      return res.json({
        execution,
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
 * RUNBOOK EXECUTION HISTORY
 * ============================================================================
 */

router.get(
  "/:runbookId/executions",

  requirePermission(
    PERMISSIONS
      .EXECUTION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const {
        runbookId,
      } =
        req.params;

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

      const filter = {
        tenantId:
          context
            .tenantId,

        organizationId:
          context
            .organizationId,

        environmentId:
          context
            .environmentId,

        runbookId,
      };

      if (
        req.query
          .status
      ) {
        filter.status =
          req.query
            .status;
      }

      const executions =
        await RunbookExecution
          .find(
            filter
          )
          .sort({
            createdAt:
              -1,
          })
          .limit(
            limit
          )
          .lean();

      return res.json({
        tenantId:
          context
            .tenantId,

        organizationId:
          context
            .organizationId,

        environmentId:
          context
            .environmentId,

        runbookId,

        count:
          executions.length,

        executions,
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
 * GET SPECIFIC VERSION
 * ============================================================================
 */

router.get(
  "/:runbookId/:semver",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const {
        runbookId,
        semver,
      } =
        req.params;

      try {
        const runbook =
          await registry()
            .getVersion(
              runbookId,
              semver,
              context
                .tenantId
            );

        return res.json({
          runbook,
        });
      } catch (
        error
      ) {
        return handleRegistryError(
          error,
          res
        );
      }
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
 * GET ALL VERSIONS
 * ============================================================================
 */

router.get(
  "/:runbookId",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const {
        runbookId,
      } =
        req.params;

      try {
        const versions =
          await registry()
            .getById(
              runbookId,
              context
                .tenantId
            );

        return res.json({
          runbookId,

          versions,
        });
      } catch (
        error
      ) {
        return handleRegistryError(
          error,
          res
        );
      }
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
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      const {
        definition,
      } =
        req.body ||
        {};

      if (
        !definition
      ) {
        return res
          .status(
            400
          )
          .json({
            error:
              "definition is required",

            code:
              "RUNBOOK_DEFINITION_REQUIRED",
          });
      }

      try {
        const {
          runbook,
          validation,
        } =
          await registry()
            .importDefinition(
              definition,
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

                initiatedBy:
                  actor,
              }
            );

        return res
          .status(
            201
          )
          .json({
            success:
              true,

            runbook,

            validation: {
              diagnostics:
                validation
                  .diagnostics,
            },
          });
      } catch (
        error
      ) {
        return handleRegistryError(
          error,
          res
        );
      }
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
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      /**
       * Ownership is canonical from authenticated context.
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

      try {
        const runbook =
          await registry()
            .register(
              definition,
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

                initiatedBy:
                  actor,
              }
            );

        return res
          .status(
            201
          )
          .json({
            success:
              true,

            runbook,
          });
      } catch (
        error
      ) {
        return handleRegistryError(
          error,
          res
        );
      }
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
 * VALIDATE
 * ============================================================================
 */

router.post(
  "/:runbookId/:semver/validate",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_UPDATE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const {
        runbookId,
        semver,
      } =
        req.params;

      const purpose =
        req.query
          .purpose ||
        VALIDATION_PURPOSE
          .AUTHORING;

      try {
        const result =
          await registry()
            .validate(
              runbookId,
              semver,
              context
                .tenantId,
              purpose
            );

        return res.json({
          valid:
            result.valid,

          diagnostics:
            result
              .diagnostics,
        });
      } catch (
        error
      ) {
        return handleRegistryError(
          error,
          res
        );
      }
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
 * APPROVE
 * ============================================================================
 */

router.post(
  "/:runbookId/:semver/approve",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_PUBLISH
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      const {
        runbookId,
        semver,
      } =
        req.params;

      try {
        const runbook =
          await registry()
            .approve(
              runbookId,
              semver,
              context
                .tenantId,
              {
                initiatedBy:
                  actor,
              }
            );

        return res.json({
          success:
            true,

          runbook,
        });
      } catch (
        error
      ) {
        return handleRegistryError(
          error,
          res
        );
      }
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
 * ACTIVATE
 * ============================================================================
 */

router.post(
  "/:runbookId/:semver/activate",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_PUBLISH
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      const {
        runbookId,
        semver,
      } =
        req.params;

      try {
        const runbook =
          await registry()
            .activate(
              runbookId,
              semver,
              context
                .tenantId,
              {
                initiatedBy:
                  actor,
              }
            );

        return res.json({
          success:
            true,

          runbook,
        });
      } catch (
        error
      ) {
        return handleRegistryError(
          error,
          res
        );
      }
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
 * DISABLE
 * ============================================================================
 */

router.post(
  "/:runbookId/:semver/disable",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_PUBLISH
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      const {
        runbookId,
        semver,
      } =
        req.params;

      try {
        const runbook =
          await registry()
            .disable(
              runbookId,
              semver,
              context
                .tenantId,
              {
                initiatedBy:
                  actor,

                reason:
                  req.body
                    ?.reason ||
                  null,
              }
            );

        return res.json({
          success:
            true,

          runbook,
        });
      } catch (
        error
      ) {
        return handleRegistryError(
          error,
          res
        );
      }
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
 * DEPRECATE
 * ============================================================================
 */

router.post(
  "/:runbookId/:semver/deprecate",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_PUBLISH
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      const {
        runbookId,
        semver,
      } =
        req.params;

      try {
        const runbook =
          await registry()
            .deprecate(
              runbookId,
              semver,
              context
                .tenantId,
              {
                initiatedBy:
                  actor,

                reason:
                  req.body
                    ?.reason ||
                  null,
              }
            );

        return res.json({
          success:
            true,

          runbook,
        });
      } catch (
        error
      ) {
        return handleRegistryError(
          error,
          res
        );
      }
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
 * CREATE VERSION
 * ============================================================================
 */

router.post(
  "/:runbookId/:semver/version",

  requirePermission(
    PERMISSIONS
      .PLAYBOOK_UPDATE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      const {
        runbookId,
        semver,
      } =
        req.params;

      const {
        newSemver,
        changes,
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

      try {
        const runbook =
          await registry()
            .createVersion(
              runbookId,
              semver,
              newSemver,
              changes ||
                {},
              context
                .tenantId,
              {
                initiatedBy:
                  actor,
              }
            );

        return res
          .status(
            201
          )
          .json({
            success:
              true,

            runbook,
          });
      } catch (
        error
      ) {
        return handleRegistryError(
          error,
          res
        );
      }
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
 * EXECUTE
 * ============================================================================
 *
 * Requires:
 *
 * playbook.read
 * +
 * execution.execute
 */

router.post(
  "/:runbookId/:semver/execute",

  requireAllPermissions([
    PERMISSIONS
      .PLAYBOOK_READ,

    PERMISSIONS
      .EXECUTION_EXECUTE,
  ]),

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        getRunbookContext(
          req
        );

      const actor =
        getActorId(
          req
        );

      const {
        runbookId,
        semver,
      } =
        req.params;

      let runbookDef;

      try {
        runbookDef =
          await registry()
            .getExecutionDefinition(
              runbookId,
              semver,
              context
                .tenantId
            );
      } catch (
        error
      ) {
        return handleRegistryError(
          error,
          res
        );
      }

      const input =
        req.body ||
        {};

      const execution =
        await engine()
          .execute(
            runbookDef,
            {
              ...input,

              /**
               * Never allow body values to override canonical ownership.
               */
              tenantId:
                context
                  .tenantId,

              organizationId:
                context
                  .organizationId,

              environmentId:
                context
                  .environmentId,

              initiatedBy:
                actor,

              initiatorType:
                "user",
            }
          );

      const httpStatus =
        execution.status ===
        "WAITING_FOR_APPROVAL"
          ? 202
          : 200;

      return res
        .status(
          httpStatus
        )
        .json({
          success:
            true,

          execution,
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