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

const {
  listProviders,
  getProvider,
  createProvider,
  updateProvider,
  activateProvider,
  disableProvider,

  listDomains,
  createDomain,
  verifyDomain,
  revokeDomain,

  getAuthenticationPolicy,
  updateAuthenticationPolicy,
} =
  require(
    "../services/identity/enterpriseIdentityService"
  );

const {
  discoverOidcProvider,
  createOidcLogin,
} =
  require(
    "../services/identity/enterpriseOidcService"
  );

const {
  getSamlConfiguration,
} =
  require(
    "../services/identity/enterpriseSamlService"
  );


const router =
  express.Router();


function organizationId(
  req
) {
  return req.context
    .organizationId;
}


function actorUserId(
  req
) {
  return req.context
    .userId;
}


// ============================================================================
// PROVIDERS
// ============================================================================

router.get(
  "/providers",

  requirePermission(
    PERMISSIONS
      .IDENTITY_PROVIDER_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        providers:
          await listProviders(
            organizationId(
              req
            )
          ),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.get(
  "/providers/:providerId",

  requirePermission(
    PERMISSIONS
      .IDENTITY_PROVIDER_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        provider:
          await getProvider({
            organizationId:
              organizationId(
                req
              ),

            providerId:
              req.params
                .providerId,
          }),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.post(
  "/providers",

  requirePermission(
    PERMISSIONS
      .IDENTITY_PROVIDER_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const provider =
        await createProvider({
          organizationId:
            organizationId(
              req
            ),

          actorUserId:
            actorUserId(
              req
            ),

          ...req.body,
        });

      res
        .status(
          201
        )
        .json({
          provider,
        });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.patch(
  "/providers/:providerId",

  requirePermission(
    PERMISSIONS
      .IDENTITY_PROVIDER_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        provider:
          await updateProvider({
            organizationId:
              organizationId(
                req
              ),

            providerId:
              req.params
                .providerId,

            actorUserId:
              actorUserId(
                req
              ),

            updates:
              req.body ||
              {},
          }),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.post(
  "/providers/:providerId/activate",

  requirePermission(
    PERMISSIONS
      .IDENTITY_PROVIDER_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        provider:
          await activateProvider({
            organizationId:
              organizationId(
                req
              ),

            providerId:
              req.params
                .providerId,

            actorUserId:
              actorUserId(
                req
              ),
          }),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.post(
  "/providers/:providerId/disable",

  requirePermission(
    PERMISSIONS
      .IDENTITY_PROVIDER_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        provider:
          await disableProvider({
            organizationId:
              organizationId(
                req
              ),

            providerId:
              req.params
                .providerId,

            actorUserId:
              actorUserId(
                req
              ),
          }),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


// ============================================================================
// OIDC
// ============================================================================

router.post(
  "/providers/:providerId/oidc/discover",

  requirePermission(
    PERMISSIONS
      .IDENTITY_PROVIDER_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await discoverOidcProvider({
          organizationId:
            organizationId(
              req
            ),

          providerId:
            req.params
              .providerId,
        })
      );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.post(
  "/providers/:providerId/oidc/login",

  requirePermission(
    PERMISSIONS
      .IDENTITY_PROVIDER_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await createOidcLogin({
          organizationId:
            organizationId(
              req
            ),

          providerId:
            req.params
              .providerId,

          redirectUri:
            req.body
              ?.redirectUri,
        })
      );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


// ============================================================================
// SAML
// ============================================================================

router.get(
  "/providers/:providerId/saml/configuration",

  requirePermission(
    PERMISSIONS
      .IDENTITY_PROVIDER_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const baseUrl =
        process.env
          .PUBLIC_API_URL ||
        `${req.protocol}://${req.get(
          "host"
        )}`;

      res.json(
        await getSamlConfiguration({
          organizationId:
            organizationId(
              req
            ),

          providerId:
            req.params
              .providerId,

          baseUrl,
        })
      );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


// ============================================================================
// DOMAINS
// ============================================================================

router.get(
  "/domains",

  requirePermission(
    PERMISSIONS
      .DOMAIN_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        domains:
          await listDomains(
            organizationId(
              req
            )
          ),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.post(
  "/domains",

  requirePermission(
    PERMISSIONS
      .DOMAIN_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res
        .status(
          201
        )
        .json(
          await createDomain({
            organizationId:
              organizationId(
                req
              ),

            actorUserId:
              actorUserId(
                req
              ),

            domain:
              req.body
                ?.domain,
          })
        );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.post(
  "/domains/:domainId/verify",

  requirePermission(
    PERMISSIONS
      .DOMAIN_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        domain:
          await verifyDomain({
            organizationId:
              organizationId(
                req
              ),

            domainId:
              req.params
                .domainId,

            actorUserId:
              actorUserId(
                req
              ),
          }),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.post(
  "/domains/:domainId/revoke",

  requirePermission(
    PERMISSIONS
      .DOMAIN_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        domain:
          await revokeDomain({
            organizationId:
              organizationId(
                req
              ),

            domainId:
              req.params
                .domainId,
          }),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


// ============================================================================
// SSO POLICY
// ============================================================================

router.get(
  "/policy",

  requirePermission(
    PERMISSIONS
      .SSO_POLICY_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        policy:
          await getAuthenticationPolicy(
            organizationId(
              req
            )
          ),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.patch(
  "/policy",

  requirePermission(
    PERMISSIONS
      .SSO_POLICY_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        policy:
          await updateAuthenticationPolicy({
            organizationId:
              organizationId(
                req
              ),

            actorUserId:
              actorUserId(
                req
              ),

            ...req.body,
          }),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


module.exports =
  router;