/**
 * Tenant Isolation Middleware
 * Enforces multi-tenant data isolation by:
 * 1. Verifying tenantId matches between URL and request body
 * 2. Attaching tenantId to request context
 * 3. Providing utilities for safe database queries
 */

function tenantIsolationMiddleware(req, res, next) {
  try {
    // tenantId should already be attached by authMiddleware
    if (!req.tenant) {
      return res.status(401).json({
        error: "Not authenticated",
        code: "NOT_AUTHENTICATED",
      });
    }

    const tenantIdFromAuth = req.tenant.id;
    const tenantIdFromUrl = req.params.tenantId;

    // Verify tenantId matches
    if (tenantIdFromUrl && tenantIdFromUrl !== tenantIdFromAuth) {
      console.warn(
        `[tenant-isolation] Tenant ID mismatch: URL=${tenantIdFromUrl} vs Auth=${tenantIdFromAuth}`
      );
      return res.status(403).json({
        error: "Access denied: tenant ID mismatch",
        code: "TENANT_MISMATCH",
      });
    }

    // Verify tenantId in request body doesn't differ
    if (req.body && req.body.tenantId && req.body.tenantId !== tenantIdFromAuth) {
      console.warn(
        `[tenant-isolation] Tenant ID mismatch in body: Body=${req.body.tenantId} vs Auth=${tenantIdFromAuth}`
      );
      return res.status(403).json({
        error: "Access denied: tenant ID in body does not match auth",
        code: "TENANT_MISMATCH",
      });
    }

    // Create safe database query helper
    req.withTenantId = (query = {}) => {
      return {
        ...query,
        tenantId: tenantIdFromAuth,
      };
    };

    // Create safe update helper
    req.withTenantUpdate = (update = {}) => {
      return {
        $set: {
          ...update,
          // Ensure tenantId cannot be overwritten
          tenantId: tenantIdFromAuth,
        },
      };
    };

    console.log(
      `[tenant-isolation] ✓ Verified tenant=${tenantIdFromAuth} | ${req.method} ${req.path}`
    );

    next();
  } catch (error) {
    console.error("[tenant-isolation] Middleware error:", error.message);
    res.status(500).json({
      error: "Tenant isolation check failed",
      code: "ISOLATION_ERROR",
    });
  }
}

/**
 * Utility function to safely query tenants
 * Ensures all queries include tenantId filter
 */
function createTenantAwareQuery(tenantId, baseQuery = {}) {
  return {
    ...baseQuery,
    tenantId,
  };
}

/**
 * Utility function for multi-tenant aggregation pipelines (advanced)
 * Filters at the first stage to prevent data leakage
 */
function createTenantAwarePipeline(tenantId, stages = []) {
  return [
    // First stage MUST filter by tenantId
    {
      $match: {
        tenantId,
      },
    },
    // Then apply any additional stages
    ...stages,
  ];
}

/**
 * Middleware to prevent bulk operations across tenants
 */
function preventCrossTenantOperations(req, res, next) {
  try {
    // Block multi-document delete if not explicitly scoped
    if (req.method === "DELETE" && !req.params.id && !req.query.singleTenant) {
      return res.status(400).json({
        error: "Bulk delete not allowed. Use ?singleTenant=true to confirm single-tenant scope",
        code: "BULK_DELETE_BLOCKED",
      });
    }

    next();
  } catch (error) {
    console.error("[prevent-cross-tenant] Middleware error:", error.message);
    res.status(500).json({
      error: "Cross-tenant prevention check failed",
      code: "PREVENTION_ERROR",
    });
  }
}

/**
 * Audit middleware to log all data access
 */
async function auditDataAccessMiddleware(req, res, next) {
  try {
    const startTime = Date.now();

    // Capture original send function
    const originalSend = res.send;

    // Wrap send to log response
    res.send = function (data) {
      const duration = Date.now() - startTime;

      console.log(
        `[audit-access] ${req.method} ${req.path} | status=${res.statusCode} | duration=${duration}ms | tenant=${req.tenant?.id}`
      );

      // Call original send
      return originalSend.call(this, data);
    };

    next();
  } catch (error) {
    console.error("[audit-access] Middleware error:", error.message);
    next();
  }
}

module.exports = {
  tenantIsolationMiddleware,
  preventCrossTenantOperations,
  auditDataAccessMiddleware,
  createTenantAwareQuery,
  createTenantAwarePipeline,
};
