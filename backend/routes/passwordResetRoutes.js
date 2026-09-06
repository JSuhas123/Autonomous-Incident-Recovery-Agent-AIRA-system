"use strict";

const express = require("express");
const Joi = require("joi");

const {
  requestPasswordReset,
  resetPassword,
} = require("../services/identity/passwordResetService");

const router = express.Router();

/*
 * --------------------------------------------------------------------------
 * VALIDATION
 * --------------------------------------------------------------------------
 */

const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email({
      tlds: {
        allow: false,
      },
    })
    .max(254)
    .required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string()
    .min(20)
    .max(2048)
    .required(),

  password: Joi.string()
    .min(12)
    .max(1024)
    .required(),
});

function validate(schema) {
  return (req, res, next) => {
    const {
      error,
      value,
    } = schema.validate(
      req.body,
      {
        abortEarly: false,
        stripUnknown: true,
      }
    );

    if (error) {
      return res.status(400).json({
        error:
          "Validation failed",

        code:
          "VALIDATION_ERROR",

        details:
          error.details.map(
            (detail) => ({
              field:
                detail.path.join("."),

              message:
                detail.message,
            })
          ),
      });
    }

    req.validatedBody =
      value;

    return next();
  };
}

function clientIp(req) {
  const forwardedFor =
    req.headers[
      "x-forwarded-for"
    ];

  return (
    (
      forwardedFor
        ? forwardedFor
            .split(",")[0]
            .trim()
        : null
    ) ||
    req.ip ||
    null
  );
}

/*
 * --------------------------------------------------------------------------
 * FORGOT PASSWORD
 * --------------------------------------------------------------------------
 *
 * POST /api/v1/auth/forgot-password
 *
 * Important:
 *
 * The outward response remains generic regardless of whether
 * the submitted email exists.
 *
 * This reduces account-enumeration risk.
 *
 * In non-production development only, AIRA exposes the generated
 * local reset URL because the current repository does not yet
 * contain a real outbound email provider.
 */

router.post(
  "/forgot-password",

  validate(
    forgotPasswordSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await requestPasswordReset(
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
          accepted:
            true,

          message:
            result.message,

          ...(
            process.env
              .NODE_ENV !==
            "production"
              ? {
                  developmentResetUrl:
                    result
                      .developmentResetUrl ||
                    null,
                }
              : {}
          ),

          executionAuthorized:
            false,
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

/*
 * --------------------------------------------------------------------------
 * RESET PASSWORD
 * --------------------------------------------------------------------------
 *
 * POST /api/v1/auth/reset-password
 *
 * Successful reset:
 *
 * - validates one-time reset token
 * - verifies expiry
 * - hashes the new password with Argon2id
 * - marks reset token used
 * - revokes sibling reset tokens
 * - revokes existing browser sessions
 * - writes identity audit evidence
 *
 * It DOES NOT authenticate the browser automatically.
 */

router.post(
  "/reset-password",

  validate(
    resetPasswordSchema
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await resetPassword(
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
        .status(200)
        .json(
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