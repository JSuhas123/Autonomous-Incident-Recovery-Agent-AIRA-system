"use strict";

const express = require("express");
const Joi = require("joi");

const { register, login, safeUser, safeOrg, safeMembership } = require("../services/identity/authService");
const {
  revokeSession,
  revokeAllUserSessions,
  setSessionCookie,
  clearSessionCookie,
} = require("../services/identity/sessionService");
const { sessionAuthMiddleware } = require("../middleware/sessionAuthMiddleware");
const { csrfProtection, getCsrfTokenForSession } = require("../middleware/csrfMiddleware");
const { record: auditRecord } = require("../services/identity/identityAuditService");
const { AUTH_EVENT_TYPES, AUTH_EVENT_OUTCOMES } = require("../constants/authEvents");

const router = express.Router();

const registerSchema = Joi.object({
  fullName: Joi.string().min(1).max(100).trim().required(),
  email: Joi.string().email({ tlds: { allow: false } }).max(254).required(),
  password: Joi.string().min(12).max(1024).required(),
  organizationName: Joi.string().min(1).max(100).trim().required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).max(254).required(),
  password: Joi.string().max(1024).required(),
  rememberMe: Joi.boolean().default(false),
});

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: error.details.map((d) => ({ field: d.path.join("."), message: d.message })),
      });
    }
    req.validatedBody = value;
    next();
  };
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? fwd.split(",")[0].trim() : null) || req.ip || null;
}

// POST /api/v1/auth/register
router.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const result = await register(req.validatedBody, {
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || null,
    });
    setSessionCookie(res, result.rawToken, false);
    return res.status(201).json({
      user: result.user,
      organization: result.organization,
      membership: result.membership,
      csrfToken: result.csrfToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login
router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const result = await login(req.validatedBody, {
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || null,
    });
    setSessionCookie(res, result.rawToken, result.session.rememberMe);
    return res.json({
      user: result.user,
      organization: result.organization,
      membership: result.membership,
      csrfToken: result.csrfToken,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/session
router.get("/session", sessionAuthMiddleware, async (req, res, next) => {
  try {
    const session = req.auth._session;
    const user = req.auth._user;
    const organization = req.auth._organization;
    const membership = req.auth._membership;

    const csrfToken = await getCsrfTokenForSession(session._id);

    return res.json({
      authenticated: true,
      user: safeUser(user),
      organization: organization ? safeOrg(organization) : null,
      membership: membership ? safeMembership(membership) : null,
      session: {
        id: session._id,
        assuranceLevel: session.assuranceLevel,
        lastActivityAt: session.lastActivityAt,
        idleExpiresAt: session.idleExpiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        rememberMe: session.rememberMe,
      },
      csrfToken,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/csrf — return CSRF token for current session (GET is CSRF-safe)
router.get("/csrf", sessionAuthMiddleware, async (req, res, next) => {
  try {
    const csrfToken = await getCsrfTokenForSession(req.auth.sessionId);
    if (!csrfToken) return res.status(404).json({ error: "No CSRF state", code: "CSRF_NO_STATE" });
    return res.json({ csrfToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
router.post("/logout", sessionAuthMiddleware, csrfProtection, async (req, res, next) => {
  try {
    const { sessionId, userId, organizationId } = req.auth;
    await revokeSession(sessionId, "logout");
    clearSessionCookie(res);
    await auditRecord(AUTH_EVENT_TYPES.LOGOUT, AUTH_EVENT_OUTCOMES.SUCCESS, { userId, organizationId, sessionId });
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout-all
router.post("/logout-all", sessionAuthMiddleware, csrfProtection, async (req, res, next) => {
  try {
    const { sessionId, userId, organizationId } = req.auth;
    const keepCurrent = req.query.keepCurrent === "true";
    await revokeAllUserSessions(userId, keepCurrent ? sessionId : null);
    clearSessionCookie(res);
    await auditRecord(AUTH_EVENT_TYPES.SESSION_REVOKED, AUTH_EVENT_OUTCOMES.SUCCESS, {
      userId,
      organizationId,
      sessionId,
      metadata: { scope: "all_sessions", keepCurrent },
    });
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
