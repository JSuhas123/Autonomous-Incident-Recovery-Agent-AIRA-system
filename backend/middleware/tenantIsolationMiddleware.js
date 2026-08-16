"use strict";

/**
 * ============================================================================
 * AIRA PHASE 11.7
 * TENANT / ORGANIZATION ISOLATION HARDENING
 * ============================================================================
 *
 * Canonical ownership boundary:
 *
 *   Organization._id
 *
 * Legacy/external identifier:
 *
 *   tenantId
 *
 * Authentication middleware MUST run before this middleware.
 *
 * Safety guarantees:
 *
 * - authenticated ownership always wins over caller input
 * - URL cannot switch tenant
 * - body cannot switch tenant / organization / environment
 * - query cannot switch tenant / organization / environment
 * - headers cannot switch tenant / organization
 * - canonical request context cannot disagree with authentication
 * - missing ownership fails closed
 * - database helpers always inject ownership
 * - ownership fields cannot be mutated
 * - this middleware never grants execution authority
 */


// ============================================================================
// CONSTANTS
// ============================================================================

const TENANT_HEADERS =
  Object.freeze([
    "x-tenant-id",
    "x-aira-tenant-id",
  ]);


const ORGANIZATION_HEADERS =
  Object.freeze([
    "x-organization-id",
    "x-aira-organization-id",
  ]);


const ENVIRONMENT_HEADERS =
  Object.freeze([
    "x-environment-id",
    "x-aira-environment-id",
  ]);


// ============================================================================
// HELPERS
// ============================================================================

function normalizeId(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  return String(
    value
  );
}


function firstHeader(
  req,
  names
) {
  for (
    const name
    of names
  ) {
    const value =
      req.headers
        ?.[name];

    if (
      value !==
        undefined &&
      value !==
        null &&
      value !==
        ""
    ) {
      return normalizeId(
        value
      );
    }
  }

  return null;
}


function resourceNotFound(
  res
) {
  /*
   * Deliberately return 404 for cross-tenant substitutions.
   *
   * Do not reveal whether the foreign resource exists.
   */
  return res
    .status(
      404
    )
    .json({
      error:
        "Resource not found",

      code:
        "RESOURCE_NOT_FOUND",

      executionAuthorized:
        false,
    });
}


function contextMismatch(
  res,
  code =
    "REQUEST_CONTEXT_MISMATCH"
) {
  return res
    .status(
      403
    )
    .json({
      error:
        "Request ownership context invalid",

      code,

      executionAuthorized:
        false,
    });
}


// ============================================================================
// MAIN TENANT ISOLATION MIDDLEWARE
// ============================================================================

function tenantIsolationMiddleware(
  req,
  res,
  next
) {
  try {
    // ========================================================================
    // AUTHENTICATION REQUIREMENT
    // ========================================================================

    if (
      !req.auth
    ) {
      return res
        .status(
          401
        )
        .json({
          error:
            "Not authenticated",

          code:
            "NOT_AUTHENTICATED",

          executionAuthorized:
            false,
        });
    }


    /*
     * Machine-authenticated routes historically also expose req.tenant.
     *
     * Browser/session requests may not.
     */
    const legacyTenantId =
      normalizeId(
        req.tenant
          ?.id
      );


    const authenticatedTenantId =
      normalizeId(
        req.auth
          ?.tenantId
      );


    const authenticatedOrganizationId =
      normalizeId(
        req.auth
          ?.organizationId
      );


    // ========================================================================
    // FAIL CLOSED ON MISSING OWNERSHIP
    // ========================================================================

    if (
      !authenticatedTenantId
    ) {
      console.error(
        "[tenant-isolation] Missing authenticated tenant context"
      );

      return contextMismatch(
        res,
        "TENANT_CONTEXT_MISSING"
      );
    }


    if (
      !authenticatedOrganizationId
    ) {
      console.error(
        `[tenant-isolation] Missing organization mapping | tenant=${authenticatedTenantId}`
      );

      return contextMismatch(
        res,
        "ORGANIZATION_CONTEXT_MISSING"
      );
    }


    // ========================================================================
    // INTERNAL AUTH CONSISTENCY
    // ========================================================================

    if (
      legacyTenantId &&
      legacyTenantId !==
        authenticatedTenantId
    ) {
      console.error(
        "[tenant-isolation] Legacy/canonical authentication mismatch",
        {
          legacyTenantId,

          authenticatedTenantId,

          authenticatedOrganizationId,
        }
      );

      return contextMismatch(
        res,
        "TENANT_CONTEXT_MISMATCH"
      );
    }


    /*
     * If the authentication layer attached the actual organization
     * document, it must agree with the canonical auth values.
     */
    const authOrganization =
      req.auth
        ?._organization;


    if (
      authOrganization
    ) {
      const organizationTenantId =
        normalizeId(
          authOrganization
            .tenantId
        );


      const organizationId =
        normalizeId(
          authOrganization
            ._id
        );


      if (
        organizationTenantId &&
        organizationTenantId !==
          authenticatedTenantId
      ) {
        console.error(
          "[tenant-isolation] Organization tenant mismatch",
          {
            organizationTenantId,

            authenticatedTenantId,
          }
        );

        return contextMismatch(
          res,
          "ORGANIZATION_CONTEXT_MISMATCH"
        );
      }


      if (
        organizationId &&
        organizationId !==
          authenticatedOrganizationId
      ) {
        console.error(
          "[tenant-isolation] Organization identity mismatch",
          {
            organizationId,

            authenticatedOrganizationId,
          }
        );

        return contextMismatch(
          res,
          "ORGANIZATION_CONTEXT_MISMATCH"
        );
      }
    }


    // ========================================================================
    // URL OWNERSHIP BINDING
    // ========================================================================

    const urlTenantId =
      normalizeId(
        req.params
          ?.tenantId
      );


    const urlOrganizationId =
      normalizeId(
        req.params
          ?.organizationId ||
        req.params
          ?.orgId
      );


    if (
      urlTenantId &&
      urlTenantId !==
        authenticatedTenantId
    ) {
      console.warn(
        `[tenant-isolation] Cross-tenant URL attempt | auth=${authenticatedTenantId} | requested=${urlTenantId}`
      );

      return resourceNotFound(
        res
      );
    }


    if (
      urlOrganizationId &&
      urlOrganizationId !==
        authenticatedOrganizationId
    ) {
      console.warn(
        `[tenant-isolation] Cross-organization URL attempt | auth=${authenticatedOrganizationId} | requested=${urlOrganizationId}`
      );

      return resourceNotFound(
        res
      );
    }


    // ========================================================================
    // QUERY OWNERSHIP BINDING
    // ========================================================================

    const queryTenantId =
      normalizeId(
        req.query
          ?.tenantId
      );


    const queryOrganizationId =
      normalizeId(
        req.query
          ?.organizationId ||
        req.query
          ?.orgId
      );


    if (
      queryTenantId &&
      queryTenantId !==
        authenticatedTenantId
    ) {
      console.warn(
        `[tenant-isolation] Cross-tenant query attempt | auth=${authenticatedTenantId} | requested=${queryTenantId}`
      );

      return resourceNotFound(
        res
      );
    }


    if (
      queryOrganizationId &&
      queryOrganizationId !==
        authenticatedOrganizationId
    ) {
      console.warn(
        `[tenant-isolation] Cross-organization query attempt | auth=${authenticatedOrganizationId} | requested=${queryOrganizationId}`
      );

      return resourceNotFound(
        res
      );
    }


    // ========================================================================
    // HEADER OWNERSHIP BINDING
    // ========================================================================

    const headerTenantId =
      firstHeader(
        req,
        TENANT_HEADERS
      );


    const headerOrganizationId =
      firstHeader(
        req,
        ORGANIZATION_HEADERS
      );


    if (
      headerTenantId &&
      headerTenantId !==
        authenticatedTenantId
    ) {
      console.warn(
        `[tenant-isolation] Cross-tenant header attempt | auth=${authenticatedTenantId} | requested=${headerTenantId}`
      );

      return resourceNotFound(
        res
      );
    }


    if (
      headerOrganizationId &&
      headerOrganizationId !==
        authenticatedOrganizationId
    ) {
      console.warn(
        `[tenant-isolation] Cross-organization header attempt | auth=${authenticatedOrganizationId} | requested=${headerOrganizationId}`
      );

      return resourceNotFound(
        res
      );
    }


    // ========================================================================
    // BODY OWNERSHIP BINDING
    // ========================================================================

    const bodyTenantId =
      normalizeId(
        req.body
          ?.tenantId
      );


    const bodyOrganizationId =
      normalizeId(
        req.body
          ?.organizationId ||
        req.body
          ?.orgId
      );


    if (
      bodyTenantId &&
      bodyTenantId !==
        authenticatedTenantId
    ) {
      console.warn(
        `[tenant-isolation] Cross-tenant body attempt | auth=${authenticatedTenantId}`
      );

      return resourceNotFound(
        res
      );
    }


    if (
      bodyOrganizationId &&
      bodyOrganizationId !==
        authenticatedOrganizationId
    ) {
      console.warn(
        `[tenant-isolation] Cross-organization body attempt | auth=${authenticatedOrganizationId}`
      );

      return resourceNotFound(
        res
      );
    }


    // ========================================================================
    // CANONICAL REQUEST CONTEXT CONSISTENCY
    // ========================================================================

    if (
      req.context
    ) {
      const contextTenantId =
        normalizeId(
          req.context
            .tenantId
        );


      const contextOrganizationId =
        normalizeId(
          req.context
            .organizationId
        );


      if (
        contextTenantId &&
        contextTenantId !==
          authenticatedTenantId
      ) {
        return contextMismatch(
          res
        );
      }


      if (
        contextOrganizationId &&
        contextOrganizationId !==
          authenticatedOrganizationId
      ) {
        return contextMismatch(
          res
        );
      }
    }


    // ========================================================================
    // ENVIRONMENT CONTEXT CONSISTENCY
    // ========================================================================

    /*
     * environmentContextMiddleware performs the canonical DB-level check:
     *
     * Environment.findOne({
     *   _id: requestedEnvironmentId,
     *   organizationId
     * })
     *
     * Here we only prevent conflicting representations from being silently
     * accepted once an environment has already been resolved.
     */

    const canonicalEnvironmentId =
      normalizeId(
        req.context
          ?.environmentId ||
        req.auth
          ?.environmentId ||
        req.environment
          ?._id ||
        req.environment
          ?.id
      );


    const bodyEnvironmentId =
      normalizeId(
        req.body
          ?.environmentId
      );


    const queryEnvironmentId =
      normalizeId(
        req.query
          ?.environmentId
      );


    const headerEnvironmentId =
      firstHeader(
        req,
        ENVIRONMENT_HEADERS
      );


    if (
      canonicalEnvironmentId
    ) {
      for (
        const requestedEnvironmentId
        of [
          bodyEnvironmentId,
          queryEnvironmentId,
          headerEnvironmentId,
        ]
      ) {
        if (
          requestedEnvironmentId &&
          requestedEnvironmentId !==
            canonicalEnvironmentId
        ) {
          console.warn(
            `[tenant-isolation] Conflicting environment context | canonical=${canonicalEnvironmentId} | requested=${requestedEnvironmentId}`
          );

          return resourceNotFound(
            res
          );
        }
      }
    }


    // ========================================================================
    // OWNERSHIP-SCOPED QUERY HELPERS
    // ========================================================================

    /*
     * Legacy tenant-owned model query.
     *
     * Caller ownership is overwritten.
     */
    req.withTenantId =
      (
        query =
          {}
      ) => ({
        ...query,

        tenantId:
          authenticatedTenantId,
      });


    /*
     * Canonical organization-owned model query.
     */
    req.withOrganizationId =
      (
        query =
          {}
      ) => ({
        ...query,

        organizationId:
          req.auth
            .organizationId,
      });


    /*
     * Migration-era dual ownership query.
     */
    req.withTenantOwnership =
      (
        query =
          {}
      ) => ({
        ...query,

        organizationId:
          req.auth
            .organizationId,

        tenantId:
          authenticatedTenantId,
      });


    /*
     * Environment-scoped query.
     *
     * Environment ownership is meaningful only together with organization
     * ownership.
     */
    req.withEnvironmentOwnership =
      (
        query =
          {}
      ) => {
        const environmentId =
          normalizeId(
            req.context
              ?.environmentId
          );


        if (
          !environmentId
        ) {
          throw Object.assign(
            new Error(
              "environmentId is required for environment-scoped query"
            ),
            {
              code:
                "ENVIRONMENT_CONTEXT_REQUIRED",

              executionAuthorized:
                false,
            }
          );
        }


        return {
          ...query,

          organizationId:
            req.auth
              .organizationId,

          environmentId:
            req.context
              .environmentId,
        };
      };


    // ========================================================================
    // SAFE UPDATE HELPER
    // ========================================================================

    req.withTenantUpdate =
      (
        update =
          {}
      ) => {
        const source =
          update.$set &&
          typeof update.$set ===
            "object"
            ? update.$set
            : update;


        const safeUpdate = {
          ...source,
        };


        /*
         * Ownership cannot be modified by request data.
         */
        delete safeUpdate
          .tenantId;

        delete safeUpdate
          .organizationId;

        delete safeUpdate
          .orgId;

        delete safeUpdate
          .environmentId;


        return {
          $set: {
            ...safeUpdate,

            tenantId:
              authenticatedTenantId,

            organizationId:
              req.auth
                .organizationId,
          },
        };
      };


    // ========================================================================
    // CANONICAL REQUEST CONTEXT
    // ========================================================================

    req.context = {
      ...(
        req.context ||
        {}
      ),

      authenticationType:
        req.context
          ?.authenticationType ||
        req.auth
          ?.authenticationType ||
        null,

      tenantId:
        authenticatedTenantId,

      organizationId:
        authenticatedOrganizationId,

      userId:
        normalizeId(
          req.auth
            ?.userId ||
          req.context
            ?.userId
        ),

      membershipId:
        normalizeId(
          req.auth
            ?.membershipId ||
          req.context
            ?.membershipId
        ),

      role:
        req.auth
          ?.role ||
        req.context
          ?.role ||
        null,

      scopes:
        Array.isArray(
          req.auth
            ?.scopes
        )
          ? [
              ...req.auth
                .scopes,
            ]
          : (
              Array.isArray(
                req.context
                  ?.scopes
              )
                ? [
                    ...req.context
                      .scopes,
                  ]
                : []
            ),

      environmentId:
        canonicalEnvironmentId ||
        null,

      environment:
        req.context
          ?.environment ||
        req.environment ||
        null,

      /*
       * Isolation/context layers never grant execution permission.
       */
      executionAuthorized:
        false,
    };


    /*
     * Keep canonical authentication context synchronized.
     *
     * Never derive ownership from caller-controlled values.
     */
    req.auth.tenantId =
      authenticatedTenantId;

    req.auth.organizationId =
      req.auth
        .organizationId;


    if (
      canonicalEnvironmentId
    ) {
      req.auth.environmentId =
        canonicalEnvironmentId;
    }


    console.log(
      `[tenant-isolation] ✓ tenant=${authenticatedTenantId} | org=${authenticatedOrganizationId} | ${req.method} ${req.path}`
    );


    return next();
  } catch (
    error
  ) {
    console.error(
      "[tenant-isolation] Middleware error:",
      error.message
    );


    return res
      .status(
        500
      )
      .json({
        error:
          "Tenant isolation check failed",

        code:
          "ISOLATION_ERROR",

        executionAuthorized:
          false,
      });
  }
}


// ============================================================================
// QUERY HELPERS
// ============================================================================

function createTenantAwareQuery(
  tenantId,
  baseQuery =
    {}
) {
  if (
    !tenantId
  ) {
    throw Object.assign(
      new Error(
        "tenantId is required"
      ),
      {
        code:
          "TENANT_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  return {
    ...baseQuery,

    tenantId:
      normalizeId(
        tenantId
      ),
  };
}


function createOrganizationAwareQuery(
  organizationId,
  baseQuery =
    {}
) {
  if (
    !organizationId
  ) {
    throw Object.assign(
      new Error(
        "organizationId is required"
      ),
      {
        code:
          "ORGANIZATION_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  return {
    ...baseQuery,

    organizationId,
  };
}


function createTenantOwnershipQuery(
  {
    organizationId,
    tenantId,
  },
  baseQuery =
    {}
) {
  if (
    !organizationId
  ) {
    throw Object.assign(
      new Error(
        "organizationId is required"
      ),
      {
        code:
          "ORGANIZATION_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  if (
    !tenantId
  ) {
    throw Object.assign(
      new Error(
        "tenantId is required"
      ),
      {
        code:
          "TENANT_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  return {
    ...baseQuery,

    organizationId,

    tenantId:
      normalizeId(
        tenantId
      ),
  };
}


function createEnvironmentOwnershipQuery(
  {
    organizationId,
    environmentId,
  },
  baseQuery =
    {}
) {
  if (
    !organizationId
  ) {
    throw Object.assign(
      new Error(
        "organizationId is required"
      ),
      {
        code:
          "ORGANIZATION_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  if (
    !environmentId
  ) {
    throw Object.assign(
      new Error(
        "environmentId is required"
      ),
      {
        code:
          "ENVIRONMENT_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  return {
    ...baseQuery,

    organizationId,

    environmentId,
  };
}


// ============================================================================
// AGGREGATION HELPERS
// ============================================================================

function createTenantAwarePipeline(
  tenantId,
  stages =
    []
) {
  if (
    !tenantId
  ) {
    throw Object.assign(
      new Error(
        "tenantId is required"
      ),
      {
        code:
          "TENANT_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  return [
    {
      $match: {
        tenantId:
          normalizeId(
            tenantId
          ),
      },
    },

    ...stages,
  ];
}


function createOrganizationAwarePipeline(
  organizationId,
  stages =
    []
) {
  if (
    !organizationId
  ) {
    throw Object.assign(
      new Error(
        "organizationId is required"
      ),
      {
        code:
          "ORGANIZATION_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
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


function createEnvironmentAwarePipeline(
  {
    organizationId,
    environmentId,
  },
  stages =
    []
) {
  if (
    !organizationId
  ) {
    throw Object.assign(
      new Error(
        "organizationId is required"
      ),
      {
        code:
          "ORGANIZATION_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  if (
    !environmentId
  ) {
    throw Object.assign(
      new Error(
        "environmentId is required"
      ),
      {
        code:
          "ENVIRONMENT_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  return [
    {
      $match: {
        organizationId,

        environmentId,
      },
    },

    ...stages,
  ];
}


// ============================================================================
// BULK OPERATION SAFETY
// ============================================================================

function preventCrossTenantOperations(
  req,
  res,
  next
) {
  try {
    if (
      !req.context
        ?.organizationId ||
      !req.context
        ?.tenantId
    ) {
      return res
        .status(
          403
        )
        .json({
          error:
            "Tenant ownership context required",

          code:
            "TENANT_SCOPE_REQUIRED",

          executionAuthorized:
            false,
        });
    }


    /*
     * Phase 11.7:
     *
     * `?singleTenant=true` is NOT proof of ownership.
     *
     * Bulk destructive operations require explicit route/service logic
     * that uses canonical ownership filters.
     */
    if (
      req.method ===
        "DELETE" &&
      !req.params
        ?.id
    ) {
      return res
        .status(
          400
        )
        .json({
          error:
            "Bulk delete requires an explicitly scoped service operation",

          code:
            "BULK_DELETE_BLOCKED",

          executionAuthorized:
            false,
        });
    }


    return next();
  } catch (
    error
  ) {
    console.error(
      "[prevent-cross-tenant] Middleware error:",
      error.message
    );


    return res
      .status(
        500
      )
      .json({
        error:
          "Cross-tenant prevention check failed",

        code:
          "PREVENTION_ERROR",

        executionAuthorized:
          false,
      });
  }
}


// ============================================================================
// DATA ACCESS LOGGING
// ============================================================================

function auditDataAccessMiddleware(
  req,
  res,
  next
) {
  try {
    const startTime =
      Date.now();


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
          normalizeId(
            req.context
              ?.organizationId ||
            req.auth
              ?.organizationId
          );


        const environmentId =
          normalizeId(
            req.context
              ?.environmentId
          );


        console.log(
          [
            "[audit-access]",

            `${req.method} ${req.path}`,

            `status=${res.statusCode}`,

            `duration=${duration}ms`,

            `tenant=${tenantId || "-"}`,

            `org=${organizationId || "-"}`,

            `env=${environmentId || "-"}`,
          ].join(
            " | "
          )
        );
      }
    );


    return next();
  } catch (
    error
  ) {
    console.error(
      "[audit-access] Middleware error:",
      error.message
    );


    /*
     * Logging failure alone should not change authorization.
     */
    return next();
  }
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  tenantIsolationMiddleware,

  preventCrossTenantOperations,

  auditDataAccessMiddleware,

  createTenantAwareQuery,

  createOrganizationAwareQuery,

  createTenantOwnershipQuery,

  createEnvironmentOwnershipQuery,

  createTenantAwarePipeline,

  createOrganizationAwarePipeline,

  createEnvironmentAwarePipeline,
};