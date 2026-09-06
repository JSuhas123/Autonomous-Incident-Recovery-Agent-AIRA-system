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
  requestEmailVerification,
  verifyEmail,
} =
  require(
    "../services/identity/emailVerificationService"
  );

const {
  changePassword,
  listUserSessions,
  revokeOwnedSession,
  listSecurityEvents,
} =
  require(
    "../services/identity/accountSecurityService"
  );

const {
  sessionAuthMiddleware,
} =
  require(
    "../middleware/sessionAuthMiddleware"
  );

const {
  csrfProtection,
} =
  require(
    "../middleware/csrfMiddleware"
  );

const router =
  express.Router();

const verificationEmailSchema =
  Joi.object({
    email:
      Joi.string()
        .email({
          tlds: {
            allow:
              false,
          },
        })
        .max(254)
        .required(),
  });

const verificationTokenSchema =
  Joi.object({
    token:
      Joi.string()
        .min(20)
        .max(2048)
        .required(),
  });

const changePasswordSchema =
  Joi.object({
    currentPassword:
      Joi.string()
        .max(1024)
        .required(),

    newPassword:
      Joi.string()
        .min(12)
        .max(1024)
        .required(),
  });

const sessionIdSchema =
  Joi.object({
    sessionId:
      Joi.string()
        .min(1)
        .max(200)
        .required(),
  });

function validateBody(
  schema
) {
  return (
    req,
    res,
    next
  ) => {
    const {
      value,
      error,
    } =
      schema.validate(
        req.body,
        {
          abortEarly:
            false,

          stripUnknown:
            true,
        }
      );

    if (error) {
      return res
        .status(400)
        .json({
          error:
            "Validation failed",

          code:
            "VALIDATION_ERROR",

          details:
            error.details.map(
              (detail) => ({
                field:
                  detail.path.join(
                    "."
                  ),

                message:
                  detail.message,
              })
            ),

          executionAuthorized:
            false,
        });
    }

    req.validatedBody =
      value;

    return next();
  };
}

function validateParams(
  schema
) {
  return (
    req,
    res,
    next
  ) => {
    const {
      value,
      error,
    } =
      schema.validate(
        req.params,
        {
          abortEarly:
            false,

          stripUnknown:
            true,
        }
      );

    if (error) {
      return res
        .status(400)
        .json({
          error:
            "Validation failed",

          code:
            "VALIDATION_ERROR",

          executionAuthorized:
            false,
        });
    }

    req.validatedParams =
      value;

    return next();
  };
}

function clientIp(
  req
) {
  const forwarded =
    req.headers[
      "x-forwarded-for"
    ];

  return (
    (
      forwarded
        ? String(
            forwarded
          )
            .split(",")[0]
            .trim()
        : null
    ) ||
    req.ip ||
    null
  );
}

/*
 * ========================================================================
 * EMAIL VERIFICATION
 * ========================================================================
 *
 * Public endpoints.
 *
 * No session is created by either operation.
 */

router.post(
  "/email-verification/request",

  validateBody(
    verificationEmailSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await requestEmailVerification(
          req.validatedBody,
          {
            ip:
              clientIp(req),

            userAgent:
              req.headers[
                "user-agent"
              ] ||
              null,
          }
        );

      return res
        .status(202)
        .json({
          ...result,

          ...(process.env.NODE_ENV ===
          "production"
            ? {
                developmentVerificationUrl:
                  undefined,
              }
            : {}),
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
  "/email-verification/resend",

  validateBody(
    verificationEmailSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await requestEmailVerification(
          req.validatedBody,
          {
            ip:
              clientIp(req),

            userAgent:
              req.headers[
                "user-agent"
              ] ||
              null,
          }
        );

      return res
        .status(202)
        .json({
          ...result,

          ...(process.env.NODE_ENV ===
          "production"
            ? {
                developmentVerificationUrl:
                  undefined,
              }
            : {}),
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
  "/email-verification/verify",

  validateBody(
    verificationTokenSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await verifyEmail(
          req.validatedBody,
          {
            ip:
              clientIp(req),

            userAgent:
              req.headers[
                "user-agent"
              ] ||
              null,
          }
        );

      return res.json(
        result
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

/*
 * ========================================================================
 * AUTHENTICATED ACCOUNT SECURITY
 * ========================================================================
 */

router.post(
  "/change-password",

  sessionAuthMiddleware,
  csrfProtection,

  validateBody(
    changePasswordSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await changePassword({
          userId:
            req.auth.userId,

          sessionId:
            req.auth.sessionId,

          organizationId:
            req.auth
              .organizationId,

          currentPassword:
            req.validatedBody
              .currentPassword,

          newPassword:
            req.validatedBody
              .newPassword,

          ip:
            clientIp(req),

          userAgent:
            req.headers[
              "user-agent"
            ] ||
            null,
        });

      return res.json(
        result
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
  "/sessions",

  sessionAuthMiddleware,

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await listUserSessions(
          req.auth.userId,
          req.auth.sessionId
        );

      return res.json(
        result
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

router.delete(
  "/sessions/:sessionId",

  sessionAuthMiddleware,
  csrfProtection,

  validateParams(
    sessionIdSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await revokeOwnedSession({
          userId:
            req.auth.userId,

          currentSessionId:
            req.auth.sessionId,

          targetSessionId:
            req.validatedParams
              .sessionId,

          organizationId:
            req.auth
              .organizationId,
        });

      return res.json(
        result
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
  "/security-events",

  sessionAuthMiddleware,

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await listSecurityEvents(
          req.auth.userId
        );

      return res.json(
        result
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