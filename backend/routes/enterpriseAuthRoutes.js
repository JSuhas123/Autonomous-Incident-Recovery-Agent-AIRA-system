"use strict";

const express =
  require(
    "express"
  );


const {
  discoverEnterpriseLogin,
} =
  require(
    "../services/identity/enterpriseIdentityService"
  );


const {
  createOidcLogin,
} =
  require(
    "../services/identity/enterpriseOidcService"
  );


const router =
  express.Router();


function safeError(
  res,
  error
) {
  const status =
    Number.isInteger(
      error?.status
    )
      ? error.status
      : 500;


  return res
    .status(
      status
    )
    .json({
      success:
        false,

      error: {
        code:
          error?.code ||
          "ENTERPRISE_AUTH_FAILED",

        message:
          status >= 500
            ? "Unable to start enterprise authentication"
            : error?.message ||
              "Unable to start enterprise authentication",
      },

      executionAuthorized:
        false,
    });
}


// ============================================================================
// DISCOVER AUTHENTICATION POLICY BY VERIFIED EMAIL DOMAIN
// ============================================================================

router.get(
  "/discover",

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await discoverEnterpriseLogin(
          req.query
            ?.email
        )
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
// PUBLIC OIDC LOGIN START
// ============================================================================
//
// SECURITY:
//
// Email does not establish identity.
//
// It is only used to:
//   1. resolve a VERIFIED organization domain,
//   2. locate that organization's ACTIVE provider,
//   3. create the provider authorization redirect.
//
// Actual identity is established by the OIDC callback/token validation path.
//
// No AIRA permissions or execution authority are granted here.
// ============================================================================

router.post(
  "/oidc/start",

  async (
    req,
    res
  ) => {
    try {
      const email =
        String(
          req.body
            ?.email ||
          ""
        )
          .trim()
          .toLowerCase();


      const redirectUri =
        String(
          req.body
            ?.redirectUri ||
          ""
        )
          .trim();


      if (
        !email
      ) {
        return res
          .status(
            400
          )
          .json({
            success:
              false,

            error: {
              code:
                "ENTERPRISE_EMAIL_REQUIRED",

              message:
                "Work email is required",
            },

            executionAuthorized:
              false,
          });
      }


      if (
        !redirectUri
      ) {
        return res
          .status(
            400
          )
          .json({
            success:
              false,

            error: {
              code:
                "ENTERPRISE_REDIRECT_URI_REQUIRED",

              message:
                "OIDC redirect URI is required",
            },

            executionAuthorized:
              false,
          });
      }


      const discovery =
        await discoverEnterpriseLogin(
          email
        );


      if (
        !discovery
          ?.enterprise
      ) {
        return res
          .status(
            404
          )
          .json({
            success:
              false,

            error: {
              code:
                "ENTERPRISE_IDENTITY_NOT_CONFIGURED",

              message:
                "No enterprise identity provider is configured for this verified domain",
            },

            executionAuthorized:
              false,
          });
      }


      if (
        discovery
          .providerType !==
        "oidc"
      ) {
        return res
          .status(
            409
          )
          .json({
            success:
              false,

            error: {
              code:
                "ENTERPRISE_PROVIDER_NOT_OIDC",

              message:
                "The configured enterprise identity provider is not OIDC",
            },

            providerType:
              discovery
                .providerType,

            executionAuthorized:
              false,
          });
      }


      const login =
        await createOidcLogin({
          organizationId:
            discovery
              .organizationId,

          providerId:
            discovery
              .providerId,

          redirectUri,
        });


      return res
        .status(
          200
        )
        .json({
          success:
            true,

          enterprise:
            true,

          provider: {
            id:
              discovery
                .providerId,

            name:
              discovery
                .providerName,

            type:
              discovery
                .providerType,
          },

          login,

          executionAuthorized:
            false,
        });
    } catch (
      error
    ) {
      return safeError(
        res,
        error
      );
    }
  }
);


module.exports =
  router;