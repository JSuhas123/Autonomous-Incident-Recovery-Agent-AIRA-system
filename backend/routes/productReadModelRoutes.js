"use strict";


const express =
  require(
    "express"
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


const productReadModelService =
  require(
    "../services/product/productReadModelService"
  );


const productOverviewResilienceService =
  require(
    "../services/product/productOverviewResilienceService"
  );


const shadowModeReadModelService =
  require(
    "../services/product/shadowModeReadModelService"
  );


const productOnboardingService =
  require(
    "../services/product/productOnboardingService"
  );


const productPersonaReadModelService =
  require(
    "../services/product/productPersonaReadModelService"
  );


const router =
  express.Router();


function scopeFromRequest(
  req
) {
  const organizationId =
    req.context
      ?.organizationId;


  const environmentId =
    req.context
      ?.environmentId;


  if (
    !organizationId ||
    !environmentId
  ) {
    const error =
      new Error(
        "Authoritative organization and environment context are required"
      );


    error.status =
      400;


    error.code =
      "PRODUCT_SCOPE_REQUIRED";


    error.executionAuthorized =
      false;


    throw error;
  }


  return {
    organizationId,
    environmentId,
  };
}


function respond(
  res,
  data
) {
  return res.json({
    success:
      true,

    data,

    executionAuthorized:
      false,
  });
}


// ============================================================================
// CORE PRODUCT READ MODELS
// ============================================================================

router.get(
  "/overview",

  requirePermission(
    PERMISSIONS
      .INCIDENT_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return respond(
        res,

        await productOverviewResilienceService
          .getOverview(
            scopeFromRequest(
              req
            )
          )
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);


router.get(
  "/operations",

  requirePermission(
    PERMISSIONS
      .INCIDENT_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return respond(
        res,

        await productReadModelService
          .getOperations(
            scopeFromRequest(
              req
            )
          )
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);


router.get(
  "/incidents",

  requirePermission(
    PERMISSIONS
      .INCIDENT_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return respond(
        res,

        await productReadModelService
          .getIncidentList(
            scopeFromRequest(
              req
            )
          )
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);


router.get(
  "/shadow",

  requirePermission(
    PERMISSIONS
      .INCIDENT_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return respond(
        res,

        await shadowModeReadModelService
          .getShadowMode(
            scopeFromRequest(
              req
            )
          )
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);


router.get(
  "/onboarding",

  requirePermission(
    PERMISSIONS
      .ONBOARDING_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return respond(
        res,

        await productOnboardingService
          .getReadiness(
            scopeFromRequest(
              req
            )
          )
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);


// ============================================================================
// PHASE 25.11 — PERSONA INTELLIGENCE
// ============================================================================

router.get(
  "/reliability",

  requirePermission(
    PERMISSIONS
      .INCIDENT_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return respond(
        res,

        await productPersonaReadModelService
          .getReliability(
            scopeFromRequest(
              req
            )
          )
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);


router.get(
  "/executive",

  requirePermission(
    PERMISSIONS
      .INCIDENT_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return respond(
        res,

        await productPersonaReadModelService
          .getExecutive(
            scopeFromRequest(
              req
            )
          )
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);


router.get(
  "/governance",

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
      return respond(
        res,

        await productPersonaReadModelService
          .getGovernance(
            scopeFromRequest(
              req
            )
          )
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);


router.get(
  "/developer",

  requirePermission(
    PERMISSIONS
      .INCIDENT_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      return respond(
        res,

        await productPersonaReadModelService
          .getDeveloper(
            scopeFromRequest(
              req
            )
          )
      );
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