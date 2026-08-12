"use strict";

const express = require("express");
const Joi = require("joi");

const {
  register,
  login,
  safeUser,
  safeOrg,
  safeMembership,
} = require("../services/identity/authService");

const {
  revokeSession,
  revokeAllUserSessions,
  setSessionCookie,
  clearSessionCookie,
} = require("../services/identity/sessionService");

const {
  sessionAuthMiddleware,
} = require("../middleware/sessionAuthMiddleware");

const {
  requestContextMiddleware,
} = require("../middleware/requestContextMiddleware");

const {
  environmentContextMiddleware,
} = require("../middleware/environmentContextMiddleware");

const {
  csrfProtection,
  getCsrfTokenForSession,
} = require("../middleware/csrfMiddleware");

const {
  record: auditRecord,
} = require("../services/identity/identityAuditService");

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_OUTCOMES,
} = require("../constants/authEvents");

const EnvironmentService = require(
  "../services/core/environmentService"
);

const router = express.Router();

/**
 * ------------------------------------------------------------------
 * VALIDATION SCHEMAS
 * ------------------------------------------------------------------
 */

const registerSchema = Joi.object({
  fullName: Joi.string()
    .min(1)
    .max(100)
    .trim()
    .required(),

  email: Joi.string()
    .email({
      tlds: {
        allow: false,
      },
    })
    .max(254)
    .required(),

  password: Joi.string()
    .min(12)
    .max(1024)
    .required(),

  organizationName: Joi.string()
    .min(1)
    .max(100)
    .trim()
    .required(),
});

const loginSchema = Joi.object({
  email: Joi.string()
    .email({
      tlds: {
        allow: false,
      },
    })
    .max(254)
    .required(),

  password: Joi.string()
    .max(1024)
    .required(),

  rememberMe: Joi.boolean()
    .default(false),
});

/**
 * ------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------
 */

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

    req.validatedBody = value;

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

/**
 * ------------------------------------------------------------------
 * REGISTER
 * ------------------------------------------------------------------
 *
 * POST /api/v1/auth/register
 *
 * Existing registration behavior remains unchanged.
 *
 * organizationBootstrapService is invoked from authService,
 * so newly created organizations receive their default
 * environment and Developer subscription there.
 */

router.post(
  "/register",
  validate(registerSchema),
  async (req, res, next) => {
    try {
      const result =
        await register(
          req.validatedBody,
          {
            ip:
              clientIp(req),

            userAgent:
              req.headers[
                "user-agent"
              ] || null,
          }
        );

      setSessionCookie(
        res,
        result.rawToken,
        false
      );

      return res
        .status(201)
        .json({
          user:
            result.user,

          organization:
            result.organization,

          membership:
            result.membership,

          csrfToken:
            result.csrfToken,
        });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * LOGIN
 * ------------------------------------------------------------------
 *
 * POST /api/v1/auth/login
 */

router.post(
  "/login",
  validate(loginSchema),
  async (req, res, next) => {
    try {
      const result =
        await login(
          req.validatedBody,
          {
            ip:
              clientIp(req),

            userAgent:
              req.headers[
                "user-agent"
              ] || null,
          }
        );

      setSessionCookie(
        res,
        result.rawToken,
        result.session
          .rememberMe
      );

      return res.json({
        user:
          result.user,

        organization:
          result.organization,

        membership:
          result.membership,

        csrfToken:
          result.csrfToken,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * SESSION BOOTSTRAP
 * ------------------------------------------------------------------
 *
 * GET /api/v1/auth/session
 *
 * This is now the primary browser bootstrap endpoint.
 *
 * It returns:
 *
 * - authenticated user
 * - organization
 * - membership
 * - active/default environment
 * - session metadata
 * - CSRF token
 */

router.get(
  "/session",

  sessionAuthMiddleware,
  requestContextMiddleware,
  environmentContextMiddleware,

  async (req, res, next) => {
    try {
      const session =
        req.auth._session;

      const user =
        req.auth._user;

      const organization =
        req.auth._organization;

      const membership =
        req.auth._membership;

      const csrfToken =
        await getCsrfTokenForSession(
          session._id
        );

      return res.json({
        authenticated:
          true,

        user:
          safeUser(user),

        organization:
          organization
            ? safeOrg(
                organization
              )
            : null,

        membership:
          membership
            ? safeMembership(
                membership
              )
            : null,

        environment:
          EnvironmentService.safeEnvironment(
            req.context
              .environment
          ),

        session: {
          id:
            session._id,

          assuranceLevel:
            session
              .assuranceLevel,

          lastActivityAt:
            session
              .lastActivityAt,

          idleExpiresAt:
            session
              .idleExpiresAt,

          absoluteExpiresAt:
            session
              .absoluteExpiresAt,

          rememberMe:
            session.rememberMe,
        },

        csrfToken,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * CANONICAL REQUEST CONTEXT
 * ------------------------------------------------------------------
 *
 * GET /api/v1/auth/context
 *
 * Safe debugging/bootstrap endpoint showing what AIRA has
 * resolved for the current authenticated request.
 *
 * IMPORTANT:
 * Never serialize req.context directly because it contains
 * internal model references.
 */

router.get(
  "/context",

  sessionAuthMiddleware,
  requestContextMiddleware,
  environmentContextMiddleware,

  async (req, res, next) => {
    try {
      return res.json({
        authenticationType:
          req.context
            .authenticationType,

        userId:
          req.context.userId,

        organization: {
          id:
            req.context
              .organizationId,

          tenantId:
            req.context
              .tenantId,

          name:
            req.context
              .organization
              ?.name || null,

          slug:
            req.context
              .organization
              ?.slug || null,

          status:
            req.context
              .organization
              ?.status || null,
        },

        membership: {
          id:
            req.context
              .membershipId,

          role:
            req.context.role,

          status:
            req.context
              .membership
              ?.status || null,
        },

        environment:
          EnvironmentService.safeEnvironment(
            req.context
              .environment
          ),

        requestId:
          req.context
            .requestId,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * CSRF
 * ------------------------------------------------------------------
 *
 * GET /api/v1/auth/csrf
 *
 * GET is CSRF-safe.
 */

router.get(
  "/csrf",

  sessionAuthMiddleware,

  async (req, res, next) => {
    try {
      const csrfToken =
        await getCsrfTokenForSession(
          req.auth.sessionId
        );

      if (!csrfToken) {
        return res
          .status(404)
          .json({
            error:
              "No CSRF state",

            code:
              "CSRF_NO_STATE",
          });
      }

      return res.json({
        csrfToken,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * LOGOUT
 * ------------------------------------------------------------------
 *
 * POST /api/v1/auth/logout
 */

router.post(
  "/logout",

  sessionAuthMiddleware,
  csrfProtection,

  async (req, res, next) => {
    try {
      const {
        sessionId,
        userId,
        organizationId,
      } = req.auth;

      await revokeSession(
        sessionId,
        "logout"
      );

      clearSessionCookie(
        res
      );

      await auditRecord(
        AUTH_EVENT_TYPES.LOGOUT,
        AUTH_EVENT_OUTCOMES.SUCCESS,
        {
          userId,
          organizationId,
          sessionId,
        }
      );

      return res
        .status(204)
        .end();
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * ------------------------------------------------------------------
 * LOGOUT ALL
 * ------------------------------------------------------------------
 *
 * POST /api/v1/auth/logout-all
 */

router.post(
  "/logout-all",

  sessionAuthMiddleware,
  csrfProtection,

  async (req, res, next) => {
    try {
      const {
        sessionId,
        userId,
        organizationId,
      } = req.auth;

      const keepCurrent =
        req.query
          .keepCurrent ===
        "true";

      await revokeAllUserSessions(
        userId,
        keepCurrent
          ? sessionId
          : null
      );

      /*
       * Preserve the existing behavior:
       * the browser's current session cookie is cleared.
       *
       * If we later want keepCurrent=true to truly preserve
       * the current browser session, we'll change that
       * deliberately in the enterprise identity phase.
       */
      clearSessionCookie(
        res
      );

      await auditRecord(
        AUTH_EVENT_TYPES
          .SESSION_REVOKED,

        AUTH_EVENT_OUTCOMES
          .SUCCESS,

        {
          userId,
          organizationId,
          sessionId,

          metadata: {
            scope:
              "all_sessions",

            keepCurrent,
          },
        }
      );

      return res
        .status(204)
        .end();
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;