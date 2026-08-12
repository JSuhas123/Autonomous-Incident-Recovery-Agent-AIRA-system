"use strict";

/**
 * Legacy tenant isolation middleware.
 *
 * This middleware primarily protects machine-authenticated
 * routes that still use:
 *
 *   /tenants/:tenantId/...
 *
 * Enterprise ownership is moving toward:
 *
 *   Organization._id  -> canonical ownership boundary
 *   tenantId          -> legacy/external tenant identifier
 *
 * authMiddleware MUST run before this middleware.
 */

function tenantIsolationMiddleware(
  req,
  res,
  next
) {
  try {
    /*
     * Machine authentication currently creates both:
     *
     * req.tenant -> legacy tenant context
     * req.auth   -> canonical authentication context
     */
    if (!req.tenant || !req.auth) {
      return res
        .status(401)
        .json({
          error:
            "Not authenticated",

          code:
            "NOT_AUTHENTICATED",
        });
    }

    const tenantIdFromAuth =
      req.tenant.id;

    const tenantIdFromCanonicalAuth =
      req.auth.tenantId;

    const organizationId =
      req.auth.organizationId;

    const tenantIdFromUrl =
      req.params.tenantId ||
      null;

    /*
     * ----------------------------------------------------------------
     * INTERNAL AUTH CONTEXT CONSISTENCY
     * ----------------------------------------------------------------
     *
     * req.tenant and req.auth are produced by the same
     * authentication boundary and must always agree.
     */
    if (
      !tenantIdFromAuth ||
      !tenantIdFromCanonicalAuth ||
      tenantIdFromAuth !==
        tenantIdFromCanonicalAuth
    ) {
      console.error(
        "[tenant-isolation] Authentication context mismatch",
        {
          legacyTenantId:
            tenantIdFromAuth ||
            null,

          canonicalTenantId:
            tenantIdFromCanonicalAuth ||
            null,

          organizationId:
            organizationId
              ? organizationId.toString()
              : null,
        }
      );

      return res
        .status(403)
        .json({
          error:
            "Tenant context invalid",

          code:
            "TENANT_CONTEXT_MISMATCH",
        });
    }

    /*
     * Canonical enterprise ownership must now exist.
     *
     * A machine tenant without an Organization mapping
     * is not allowed to perform tenant-scoped operations.
     */
    if (!organizationId) {
      console.error(
        `[tenant-isolation] Missing organization mapping | tenant=${tenantIdFromAuth}`
      );

      return res
        .status(403)
        .json({
          error:
            "Organization context unavailable",

          code:
            "ORGANIZATION_CONTEXT_MISSING",
        });
    }

    /*
     * ----------------------------------------------------------------
     * URL TENANT BINDING
     * ----------------------------------------------------------------
     *
     * The URL may identify the tenant, but it must never
     * be allowed to override the authenticated tenant.
     */
    if (
      tenantIdFromUrl &&
      tenantIdFromUrl !==
        tenantIdFromAuth
    ) {
      console.warn(
        `[tenant-isolation] Cross-tenant URL attempt | auth=${tenantIdFromAuth} | requested=${tenantIdFromUrl}`
      );

      /*
       * Return 404 externally to avoid revealing whether
       * the requested tenant exists.
       */
      return res
        .status(404)
        .json({
          error:
            "Resource not found",

          code:
            "RESOURCE_NOT_FOUND",
        });
    }

    /*
     * ----------------------------------------------------------------
     * BODY OWNERSHIP PROTECTION
     * ----------------------------------------------------------------
     *
     * Clients must never be allowed to switch ownership
     * by supplying tenantId or organizationId in the body.
     */

    if (
      req.body &&
      req.body.tenantId &&
      req.body.tenantId !==
        tenantIdFromAuth
    ) {
      console.warn(
        `[tenant-isolation] Cross-tenant body attempt | auth=${tenantIdFromAuth}`
      );

      return res
        .status(404)
        .json({
          error:
            "Resource not found",

          code:
            "RESOURCE_NOT_FOUND",
        });
    }

    if (
      req.body &&
      req.body.organizationId &&
      req.body.organizationId.toString() !==
        organizationId.toString()
    ) {
      console.warn(
        `[tenant-isolation] Cross-organization body attempt | tenant=${tenantIdFromAuth}`
      );

      return res
        .status(404)
        .json({
          error:
            "Resource not found",

          code:
            "RESOURCE_NOT_FOUND",
        });
    }

    /*
     * ----------------------------------------------------------------
     * LEGACY QUERY HELPER
     * ----------------------------------------------------------------
     *
     * Existing tenantId-owned models can continue using:
     *
     *   Model.find(req.withTenantId({ ... }))
     */
    req.withTenantId =
      (query = {}) => ({
        ...query,

        /*
         * Ownership always wins over caller input.
         */
        tenantId:
          tenantIdFromAuth,
      });

    /*
     * ----------------------------------------------------------------
     * CANONICAL ORGANIZATION QUERY HELPER
     * ----------------------------------------------------------------
     *
     * Newer models should prefer organization ownership.
     */
    req.withOrganizationId =
      (query = {}) => ({
        ...query,

        organizationId:
          organizationId,
      });

    /*
     * Temporary migration helper for models carrying both
     * organizationId and tenantId during Phase 1.
     */
    req.withTenantOwnership =
      (query = {}) => ({
        ...query,

        organizationId:
          organizationId,

        tenantId:
          tenantIdFromAuth,
      });

    /*
     * ----------------------------------------------------------------
     * SAFE LEGACY UPDATE HELPER
     * ----------------------------------------------------------------
     */
    req.withTenantUpdate =
      (update = {}) => {
        const safeUpdate = {
          ...update,
        };

        /*
         * Prevent caller-controlled ownership mutation.
         */
        delete safeUpdate.tenantId;
        delete safeUpdate.organizationId;

        return {
          $set: {
            ...safeUpdate,

            tenantId:
              tenantIdFromAuth,

            organizationId:
              organizationId,
          },
        };
      };

    /*
 * ----------------------------------------------------------------
 * CANONICAL REQUEST CONTEXT
 * ----------------------------------------------------------------
 *
 * Phase 1 routes expect req.context to always exist after
 * tenant isolation.
 *
 * Authentication proves tenant + organization ownership.
 * Environment middleware may already have attached the active
 * environment; if so, preserve it.
 */

if (req.context) {
  if (
    req.context.tenantId &&
    req.context.tenantId !==
      tenantIdFromAuth
  ) {
    return res
      .status(403)
      .json({
        error:
          "Tenant context invalid",

        code:
          "REQUEST_CONTEXT_MISMATCH",
      });
  }

  if (
    req.context.organizationId &&
    req.context.organizationId.toString() !==
      organizationId.toString()
  ) {
    return res
      .status(403)
      .json({
        error:
          "Organization context invalid",

        code:
          "REQUEST_CONTEXT_MISMATCH",
      });
  }

  /*
   * Ensure canonical fields are populated even if an earlier
   * middleware only partially constructed req.context.
   */
  req.context = {
    ...req.context,

    tenantId:
      tenantIdFromAuth,

    organizationId:
      organizationId.toString(),

    userId:
      req.auth?.userId ||
      req.context.userId ||
      null,
  };
} else {
  /*
   * Build the base canonical context.
   *
   * Environment-specific middleware may enrich this later with:
   *
   *   environmentId
   *   environment
   */
  req.context = {
    tenantId:
      tenantIdFromAuth,

    organizationId:
      organizationId.toString(),

    userId:
      req.auth?.userId ||
      null,

    environmentId:
      req.auth?.environmentId ||
      req.environmentId ||
      req.environment?._id?.toString?.() ||
      req.environment?.id ||
      null,

    environment:
      req.environment ||
      null,
  };
}

/*
 * Keep req.auth synchronized when environment middleware has
 * already resolved an active environment.
 */
if (
  req.context.environmentId &&
  !req.auth.environmentId
) {
  req.auth.environmentId =
    req.context.environmentId;
}

    console.log(
      `[tenant-isolation] ✓ tenant=${tenantIdFromAuth} | org=${organizationId} | ${req.method} ${req.path}`
    );

    return next();
  } catch (error) {
    console.error(
      "[tenant-isolation] Middleware error:",
      error.message
    );

    return res
      .status(500)
      .json({
        error:
          "Tenant isolation check failed",

        code:
          "ISOLATION_ERROR",
      });
  }
}

/**
 * Legacy utility for tenantId-owned models.
 */
function createTenantAwareQuery(
  tenantId,
  baseQuery = {}
) {
  if (!tenantId) {
    throw new Error(
      "tenantId is required"
    );
  }

  return {
    ...baseQuery,
    tenantId,
  };
}

/**
 * Canonical utility for organization-owned models.
 */
function createOrganizationAwareQuery(
  organizationId,
  baseQuery = {}
) {
  if (!organizationId) {
    throw new Error(
      "organizationId is required"
    );
  }

  return {
    ...baseQuery,
    organizationId,
  };
}

/**
 * Utility for models that temporarily carry both
 * organizationId and tenantId during migration.
 */
function createTenantOwnershipQuery(
  {
    organizationId,
    tenantId,
  },
  baseQuery = {}
) {
  if (!organizationId) {
    throw new Error(
      "organizationId is required"
    );
  }

  if (!tenantId) {
    throw new Error(
      "tenantId is required"
    );
  }

  return {
    ...baseQuery,
    organizationId,
    tenantId,
  };
}

/**
 * Legacy multi-tenant aggregation helper.
 *
 * Tenant filtering is always inserted as the first stage.
 */
function createTenantAwarePipeline(
  tenantId,
  stages = []
) {
  if (!tenantId) {
    throw new Error(
      "tenantId is required"
    );
  }

  return [
    {
      $match: {
        tenantId,
      },
    },

    ...stages,
  ];
}

/**
 * Canonical organization aggregation helper.
 */
function createOrganizationAwarePipeline(
  organizationId,
  stages = []
) {
  if (!organizationId) {
    throw new Error(
      "organizationId is required"
    );
  }

  return [
    {
      $match: {
        organizationId,
      },
    },

    ...stages,
  ];
}

/**
 * Prevent obviously dangerous bulk operations.
 *
 * IMPORTANT:
 * This is only a secondary guard.
 * Actual services/repositories must still scope every
 * database operation by ownership.
 */
function preventCrossTenantOperations(
  req,
  res,
  next
) {
  try {
    if (
      req.method === "DELETE" &&
      !req.params.id &&
      req.query.singleTenant !==
        "true"
    ) {
      return res
        .status(400)
        .json({
          error:
            "Bulk delete not allowed. Use ?singleTenant=true to confirm single-tenant scope",

          code:
            "BULK_DELETE_BLOCKED",
        });
    }

    return next();
  } catch (error) {
    console.error(
      "[prevent-cross-tenant] Middleware error:",
      error.message
    );

    return res
      .status(500)
      .json({
        error:
          "Cross-tenant prevention check failed",

        code:
          "PREVENTION_ERROR",
      });
  }
}

/**
 * Lightweight data-access logging middleware.
 *
 * This is operational logging only.
 * Compliance-grade audit persistence is handled separately.
 */
function auditDataAccessMiddleware(
  req,
  res,
  next
) {
  try {
    const startTime =
      Date.now();

    /*
     * 'finish' avoids monkey-patching res.send and catches
     * responses generated through json(), send(), end(), etc.
     */
    res.on(
      "finish",
      () => {
        const duration =
          Date.now() -
          startTime;

        const tenantId =
          req.context
            ?.tenantId ||
          req.auth
            ?.tenantId ||
          req.tenant
            ?.id ||
          null;

        const organizationId =
          req.context
            ?.organizationId ||
          req.auth
            ?.organizationId
            ?.toString?.() ||
          null;

        const environmentId =
          req.context
            ?.environmentId ||
          null;

        console.log(
          [
            "[audit-access]",
            `${req.method} ${req.path}`,
            `status=${res.statusCode}`,
            `duration=${duration}ms`,
            `tenant=${tenantId || "-"}`,
            `org=${organizationId || "-"}`,
            `env=${environmentId || "-"}`,
          ].join(" | ")
        );
      }
    );

    return next();
  } catch (error) {
    console.error(
      "[audit-access] Middleware error:",
      error.message
    );

    /*
     * Audit instrumentation failure should not
     * unexpectedly block the request here.
     */
    return next();
  }
}

module.exports = {
  tenantIsolationMiddleware,

  preventCrossTenantOperations,

  auditDataAccessMiddleware,

  createTenantAwareQuery,

  createOrganizationAwareQuery,

  createTenantOwnershipQuery,

  createTenantAwarePipeline,

  createOrganizationAwarePipeline,
};