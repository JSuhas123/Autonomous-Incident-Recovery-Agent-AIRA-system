"use strict";

const express =
  require(
    "express"
  );

const authCoreRoutes =
  require(
    "./authCoreRoutes"
  );

const passwordResetRoutes =
  require(
    "./passwordResetRoutes"
  );

const authLifecycleRoutes =
  require(
    "./authLifecycleRoutes"
  );

const {
  authAbuseProtection,
} =
  require(
    "../middleware/authAbuseProtectionMiddleware"
  );

const router =
  express.Router();

/*
 * ========================================================================
 * PHASE 25.2F — AUTHENTICATION ABUSE BOUNDARIES
 * ========================================================================
 *
 * These limits intentionally use the existing AIRA rate-limit engine.
 *
 * Values are per current RateLimitingService window.
 *
 * We can tune them using production evidence later.
 */

router.use(
  "/register",

  authAbuseProtection({
    scope:
      "register",

    limit:
      20,
  })
);

router.use(
  "/login",

  authAbuseProtection({
    scope:
      "login",

    limit:
      20,
  })
);

router.use(
  "/forgot-password",

  authAbuseProtection({
    scope:
      "forgot_password",

    limit:
      10,
  })
);

router.use(
  "/reset-password",

  authAbuseProtection({
    scope:
      "reset_password",

    limit:
      10,
  })
);

router.use(
  "/email-verification/request",

  authAbuseProtection({
    scope:
      "email_verification_request",

    limit:
      10,
  })
);

router.use(
  "/email-verification/resend",

  authAbuseProtection({
    scope:
      "email_verification_resend",

    limit:
      5,
  })
);

router.use(
  "/email-verification/verify",

  authAbuseProtection({
    scope:
      "email_verification_verify",

    limit:
      20,
  })
);

router.use(
  "/change-password",

  authAbuseProtection({
    scope:
      "change_password",

    limit:
      10,
  })
);

/*
 * ========================================================================
 * CANONICAL AUTH ROUTE SET
 * ========================================================================
 */

router.use(
  authCoreRoutes
);

router.use(
  passwordResetRoutes
);

router.use(
  authLifecycleRoutes
);

module.exports =
  router;