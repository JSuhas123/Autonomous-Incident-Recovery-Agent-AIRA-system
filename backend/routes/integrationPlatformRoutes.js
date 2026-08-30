"use strict";

const express =
  require(
    "express"
  );

const Joi =
  require(
    "joi"
  );

const {
  IntegrationControlPlaneService,
} =
  require(
    "../services/integrations/integrationControlPlaneService"
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


function createIntegrationPlatformRouter(
  options =
    {}
) {
  const router =
    express.Router();


  const service =
    options.service ||
    new IntegrationControlPlaneService(
      options
    );


  router.get(
    "/catalogue",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_READ
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        res.json(
          service.listCatalogue({
            category:
              nullableQuery(
                req.query
                  .category
              ),

            availabilityStatus:
              nullableQuery(
                req.query
                  .availabilityStatus
              ),

            runtimeStatus:
              nullableQuery(
                req.query
                  .runtimeStatus
              ),

            capability:
              nullableQuery(
                req.query
                  .capability
              ),
          })
        );
      }
    )
  );


  router.get(
    "/connections",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_READ
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        res.json(
          await service
            .listConnections({
              ...requestScope(
                req
              ),

              provider:
                nullableQuery(
                  req.query
                    .provider
                ),

              status:
                nullableQuery(
                  req.query
                    .status
                ),

              healthStatus:
                nullableQuery(
                  req.query
                    .healthStatus
                ),

              limit:
                parseInteger(
                  req.query
                    .limit,
                  100
                ),

              offset:
                parseInteger(
                  req.query
                    .offset,
                  0
                ),
            })
        );
      }
    )
  );


  router.post(
    "/connections",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_MANAGE
    ),

    validateBody(
      Joi.object({
        provider:
          Joi.string()
            .trim()
            .required(),

        name:
          Joi.string()
            .trim()
            .min(
              1
            )
            .max(
              200
            )
            .required(),

        externalAccountId:
          Joi.string()
            .allow(
              null,
              ""
            )
            .optional(),

        serviceIds:
          Joi.array()
            .items(
              Joi.string()
            )
            .default(
              []
            ),

        capabilities:
          Joi.array()
            .items(
              Joi.string()
            )
            .optional(),

        nonSecretConfig:
          Joi.object()
            .default(
              {}
            ),

        secret:
          Joi.string()
            .allow(
              null,
              ""
            )
            .optional(),

        metadata:
          Joi.object()
            .default(
              {}
            ),
      })
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        const connection =
          await service
            .createConnection({
              ...requestScope(
                req
              ),

              actorUserId:
                req.context
                  ?.userId ||
                null,

              ...req.body,
            });


        res
          .status(
            201
          )
          .json({
            connection,

            executionAuthorized:
              false,
          });
      }
    )
  );


  router.get(
    "/connections/:integrationId",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_READ
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        res.json({
          connection:
            await service
              .getConnection({
                ...requestScope(
                  req
                ),

                integrationId:
                  req.params
                    .integrationId,
              }),

          executionAuthorized:
            false,
        });
      }
    )
  );


  router.patch(
    "/connections/:integrationId",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_MANAGE
    ),

    validateBody(
      Joi.object({
        name:
          Joi.string()
            .trim()
            .min(
              1
            )
            .max(
              200
            ),

        externalAccountId:
          Joi.string()
            .allow(
              null,
              ""
            ),

        serviceIds:
          Joi.array()
            .items(
              Joi.string()
            ),

        capabilities:
          Joi.array()
            .items(
              Joi.string()
            ),

        nonSecretConfig:
          Joi.object(),

        status:
          Joi.string()
            .valid(
              "draft",
              "connected",
              "degraded",
              "disconnected",
              "disabled"
            ),

        metadata:
          Joi.object(),
      })
        .min(
          1
        )
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        res.json({
          connection:
            await service
              .updateConnection({
                ...requestScope(
                  req
                ),

                integrationId:
                  req.params
                    .integrationId,

                actorUserId:
                  req.context
                    ?.userId ||
                  null,

                patch:
                  req.body,
              }),

          executionAuthorized:
            false,
        });
      }
    )
  );


  router.delete(
    "/connections/:integrationId",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_MANAGE
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        res.json(
          await service
            .deleteConnection({
              ...requestScope(
                req
              ),

              integrationId:
                req.params
                  .integrationId,
            })
        );
      }
    )
  );


  router.post(
    "/connections/:integrationId/credential/rotate",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_CREDENTIALS_MANAGE ||
      PERMISSIONS
        .INTEGRATION_MANAGE
    ),

    validateBody(
      Joi.object({
        secret:
          Joi.string()
            .min(
              1
            )
            .required(),
      })
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        res.json({
          connection:
            await service
              .rotateCredential({
                ...requestScope(
                  req
                ),

                integrationId:
                  req.params
                    .integrationId,

                secret:
                  req.body.secret,
              }),

          executionAuthorized:
            false,
        });
      }
    )
  );


  router.post(
    "/connections/:integrationId/credential/revoke",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_CREDENTIALS_MANAGE ||
      PERMISSIONS
        .INTEGRATION_MANAGE
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        res.json(
          await service
            .revokeCredential({
              ...requestScope(
                req
              ),

              integrationId:
                req.params
                  .integrationId,
            })
        );
      }
    )
  );


  router.post(
    "/connections/:integrationId/health",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_TEST
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        res.json({
          health:
            await service
              .healthCheck({
                ...requestScope(
                  req
                ),

                integrationId:
                  req.params
                    .integrationId,
              }),

          executionAuthorized:
            false,
        });
      }
    )
  );


  router.get(
    "/connections/:integrationId/governance",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_GOVERNANCE_READ ||
      PERMISSIONS
        .INTEGRATION_READ
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        res.json(
          await service
            .getGovernanceRecord({
              ...requestScope(
                req
              ),

              integrationId:
                req.params
                  .integrationId,
            })
        );
      }
    )
  );


  router.put(
    "/connections/:integrationId/governance",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_GOVERNANCE_MANAGE ||
      PERMISSIONS
        .INTEGRATION_MANAGE
    ),

    validateBody(
      Joi.object({
        enabled:
          Joi.boolean(),

        allowIngestion:
          Joi.boolean(),

        allowQueries:
          Joi.boolean(),

        allowResourceDiscovery:
          Joi.boolean(),

        allowExecution:
          Joi.boolean(),

        credentialAccessMode:
          Joi.string()
            .valid(
              "managed_only",
              "disabled"
            ),

        credentialRotationRequired:
          Joi.boolean(),

        credentialRotationDays:
          Joi.number()
            .integer()
            .min(
              1
            )
            .max(
              3650
            ),

        allowedCapabilities:
          Joi.array()
            .items(
              Joi.string()
            ),

        deniedCapabilities:
          Joi.array()
            .items(
              Joi.string()
            ),

        rateLimits:
          Joi.object(),

        metadata:
          Joi.object(),
      })
        .min(
          1
        )
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        res.json(
          await service
            .updateGovernance({
              ...requestScope(
                req
              ),

              integrationId:
                req.params
                  .integrationId,

              actorUserId:
                req.context
                  ?.userId ||
                null,

              settings:
                req.body,
            })
        );
      }
    )
  );


  router.get(
    "/connections/:integrationId/audit",

    requirePermission(
      PERMISSIONS
        .INTEGRATION_READ
    ),

    asyncHandler(
      async (
        req,
        res
      ) => {
        res.json(
          await service
            .listInvocationAudit({
              ...requestScope(
                req
              ),

              integrationId:
                req.params
                  .integrationId,

              limit:
                parseInteger(
                  req.query
                    .limit,
                  100
                ),

              offset:
                parseInteger(
                  req.query
                    .offset,
                  0
                ),
            })
        );
      }
    )
  );


  return router;
}


function requestScope(
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
    throw Object.assign(
      new Error(
        "Organization and environment context are required"
      ),
      {
        status:
          400,

        code:
          "INTEGRATION_PLATFORM_SCOPE_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  return {
    organizationId,

    environmentId,
  };
}


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


    if (
      error
    ) {
      return res
        .status(
          400
        )
        .json({
          error:
            error.message,

          code:
            "INTEGRATION_PLATFORM_VALIDATION_FAILED",

          executionAuthorized:
            false,
        });
    }


    req.body =
      value;


    return next();
  };
}


function asyncHandler(
  handler
) {
  return (
    req,
    res,
    next
  ) =>
    Promise.resolve(
      handler(
        req,
        res
      )
    )
      .catch(
        next
      );
}


function nullableQuery(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ""
  ) {
    return null;
  }


  return String(
    value
  );
}


function parseInteger(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  return Number.isInteger(
    parsed
  )
    ? parsed
    : fallback;
}


const router =
  createIntegrationPlatformRouter();


module.exports =
  router;

module.exports
  .createIntegrationPlatformRouter =
  createIntegrationPlatformRouter;