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
  listServiceAccounts,
  createServiceAccount,
  updateServiceAccount,
  suspendServiceAccount,
  activateServiceAccount,
  revokeServiceAccount,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} =
  require(
    "../services/identity/serviceAccountService"
  );


const router =
  express.Router();


// ============================================================================
// PERMISSION COMPATIBILITY
//
// Until 14.5 freezes the expanded permission registry, use the most-specific
// machine-identity permission if present, otherwise fall back to
// ORGANIZATION_MANAGE.
//
// This avoids reverting to hard-coded role authorization.
// ============================================================================

// ============================================================================
// PHASE 14.5 — CANONICAL MACHINE IDENTITY PERMISSIONS
// ============================================================================

const SERVICE_ACCOUNT_READ =
  PERMISSIONS
    .SERVICE_ACCOUNT_READ;


const SERVICE_ACCOUNT_MANAGE =
  PERMISSIONS
    .SERVICE_ACCOUNT_MANAGE;


const API_KEY_READ =
  PERMISSIONS
    .API_KEY_READ;


const API_KEY_MANAGE =
  PERMISSIONS
    .API_KEY_MANAGE;
// ============================================================================
// HELPERS
// ============================================================================

function createError(
  message,
  status,
  code
) {
  const error =
    new Error(
      message
    );

  error.status =
    status;

  error.code =
    code;

  error.executionAuthorized =
    false;

  return error;
}


function validate(
  schema,
  body
) {
  const {
    error,
    value,
  } =
    schema.validate(
      body ||
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
    throw createError(
      error.details
        ?.[0]
        ?.message ||
        "Invalid request",
      422,
      "VALIDATION_ERROR"
    );
  }

  return value;
}


// ============================================================================
// SCHEMAS
// ============================================================================

const serviceAccountCreateSchema =
  Joi.object({
    name:
      Joi.string()
        .trim()
        .min(2)
        .max(120)
        .required(),

    description:
      Joi.string()
        .trim()
        .max(1000)
        .allow(
          "",
          null
        )
        .optional(),

    permissions:
      Joi.array()
        .items(
          Joi.string()
            .trim()
            .min(1)
            .max(200)
        )
        .unique()
        .default([]),

    environmentIds:
      Joi.array()
        .items(
          Joi.string()
            .trim()
            .min(1)
        )
        .unique()
        .default([]),

    expiresAt:
      Joi.date()
        .iso()
        .allow(
          null
        )
        .optional(),

    metadata:
      Joi.object()
        .unknown(
          true
        )
        .default({}),
  })
    .unknown(
      false
    );


const serviceAccountUpdateSchema =
  Joi.object({
    name:
      Joi.string()
        .trim()
        .min(2)
        .max(120),

    description:
      Joi.string()
        .trim()
        .max(1000)
        .allow(
          "",
          null
        ),

    permissions:
      Joi.array()
        .items(
          Joi.string()
            .trim()
            .min(1)
            .max(200)
        )
        .unique(),

    environmentIds:
      Joi.array()
        .items(
          Joi.string()
            .trim()
            .min(1)
        )
        .unique(),

    expiresAt:
      Joi.date()
        .iso()
        .allow(
          null
        ),
  })
    .min(1)
    .unknown(
      false
    );


const apiKeyCreateSchema =
  Joi.object({
    name:
      Joi.string()
        .trim()
        .min(2)
        .max(120)
        .required(),

    expiresAt:
      Joi.date()
        .iso()
        .allow(
          null
        )
        .optional(),

    metadata:
      Joi.object()
        .unknown(
          true
        )
        .default({}),
  })
    .unknown(
      false
    );


const revokeSchema =
  Joi.object({
    reason:
      Joi.string()
        .trim()
        .max(500)
        .allow(
          "",
          null
        )
        .optional(),
  })
    .unknown(
      false
    );


const rotateSchema =
  Joi.object({
    expiresAt:
      Joi.date()
        .iso()
        .allow(
          null
        )
        .optional(),
  })
    .unknown(
      false
    );


// ============================================================================
// SERVICE ACCOUNTS
// ============================================================================

router.get(
  "/",

  requirePermission(
  SERVICE_ACCOUNT_READ
),

  async (
    req,
    res,
    next
  ) => {
    try {
      const accounts =
        await listServiceAccounts(
          req.context
            .organizationId
        );

      return res.json({
        count:
          accounts.length,

        serviceAccounts:
          accounts,
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


router.post(
  "/",

  requirePermission(
    SERVICE_ACCOUNT_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const body =
        validate(
          serviceAccountCreateSchema,
          req.body
        );

      const account =
        await createServiceAccount({
          organizationId:
            req.context
              .organizationId,

          actorUserId:
            req.context
              .userId,

          ...body,
        });

      return res
        .status(
          201
        )
        .json({
          serviceAccount:
            account,
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


router.patch(
  "/:serviceAccountId",

  requirePermission(
    SERVICE_ACCOUNT_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const body =
        validate(
          serviceAccountUpdateSchema,
          req.body
        );

      const account =
        await updateServiceAccount({
          organizationId:
            req.context
              .organizationId,

          serviceAccountId:
            req.params
              .serviceAccountId,

          actorUserId:
            req.context
              .userId,

          ...body,
        });

      return res.json({
        serviceAccount:
          account,
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


router.post(
  "/:serviceAccountId/suspend",

  requirePermission(
  SERVICE_ACCOUNT_MANAGE
),

  async (
    req,
    res,
    next
  ) => {
    try {
      const account =
        await suspendServiceAccount({
          organizationId:
            req.context
              .organizationId,

          serviceAccountId:
            req.params
              .serviceAccountId,

          actorUserId:
            req.context
              .userId,
        });

      return res.json({
        serviceAccount:
          account,
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


router.post(
  "/:serviceAccountId/activate",

  requirePermission(
    SERVICE_ACCOUNT_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const account =
        await activateServiceAccount({
          organizationId:
            req.context
              .organizationId,

          serviceAccountId:
            req.params
              .serviceAccountId,

          actorUserId:
            req.context
              .userId,
        });

      return res.json({
        serviceAccount:
          account,
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


router.post(
  "/:serviceAccountId/revoke",

  requirePermission(
    SERVICE_ACCOUNT_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const body =
        validate(
          revokeSchema,
          req.body
        );

      const account =
        await revokeServiceAccount({
          organizationId:
            req.context
              .organizationId,

          serviceAccountId:
            req.params
              .serviceAccountId,

          actorUserId:
            req.context
              .userId,

          reason:
            body.reason ||
            null,
        });

      return res.json({
        serviceAccount:
          account,
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


// ============================================================================
// API KEYS
// ============================================================================

router.get(
  "/:serviceAccountId/api-keys",

  requirePermission(
    API_KEY_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const keys =
        await listApiKeys({
          organizationId:
            req.context
              .organizationId,

          serviceAccountId:
            req.params
              .serviceAccountId,
        });

      return res.json({
        count:
          keys.length,

        apiKeys:
          keys,
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


router.post(
  "/:serviceAccountId/api-keys",

  requirePermission(
     API_KEY_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const body =
        validate(
          apiKeyCreateSchema,
          req.body
        );

      const result =
        await createApiKey({
          organizationId:
            req.context
              .organizationId,

          serviceAccountId:
            req.params
              .serviceAccountId,

          actorUserId:
            req.context
              .userId,

          ...body,
        });

      return res
        .status(
          201
        )
        .json({
          apiKey:
            result.apiKey,

          /**
           * DISPLAY ONCE.
           *
           * Frontend must never expect this from list/read routes.
           */
          secret:
            result.secret,
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


router.post(
  "/:serviceAccountId/api-keys/:apiKeyId/rotate",

  requirePermission(
    API_KEY_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const body =
        validate(
          rotateSchema,
          req.body
        );

      const result =
        await rotateApiKey({
          organizationId:
            req.context
              .organizationId,

          serviceAccountId:
            req.params
              .serviceAccountId,

          apiKeyId:
            req.params
              .apiKeyId,

          actorUserId:
            req.context
              .userId,

          expiresAt:
            body.expiresAt ??
            null,
        });

      return res.json({
        apiKey:
          result.apiKey,

        secret:
          result.secret,
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


router.post(
  "/:serviceAccountId/api-keys/:apiKeyId/revoke",

  requirePermission(
    API_KEY_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const body =
        validate(
          revokeSchema,
          req.body
        );

      const apiKey =
        await revokeApiKey({
          organizationId:
            req.context
              .organizationId,

          serviceAccountId:
            req.params
              .serviceAccountId,

          apiKeyId:
            req.params
              .apiKeyId,

          actorUserId:
            req.context
              .userId,

          reason:
            body.reason ||
            null,
        });

      return res.json({
        apiKey,
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