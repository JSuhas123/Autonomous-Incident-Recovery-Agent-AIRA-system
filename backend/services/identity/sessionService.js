"use strict";

const crypto = require("crypto");
const UserSession = require("../../models/UserSession");
const { attachCsrfSecret } = require("../identity/csrfHelper");

const COOKIE_NAME_PROD = "__Host-aira_session";
const COOKIE_NAME_DEV = "aira_session_dev";

const IDLE_TIMEOUT_MS = parseInt(process.env.SESSION_IDLE_TIMEOUT_MS || String(30 * 60 * 1000), 10);
const ABSOLUTE_TIMEOUT_MS = parseInt(process.env.SESSION_ABSOLUTE_TIMEOUT_MS || String(8 * 60 * 60 * 1000), 10);
const REMEMBER_ME_TIMEOUT_MS = parseInt(process.env.SESSION_REMEMBER_ME_TIMEOUT_MS || String(30 * 24 * 60 * 60 * 1000), 10);
const ACTIVITY_THROTTLE_MS = parseInt(process.env.SESSION_ACTIVITY_THROTTLE_MS || "60000", 10);

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function hashIp(ip) {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || "aira-ip-salt";
  return crypto.createHash("sha256").update(ip + salt).digest("hex");
}

function hashUserAgent(ua) {
  if (!ua) return null;
  return crypto.createHash("sha256").update(ua).digest("hex");
}

function getCookieName() {
  return process.env.NODE_ENV === "production" ? COOKIE_NAME_PROD : COOKIE_NAME_DEV;
}

/**
 * Cookie configuration:
 *
 * Production (cross-site: Vercel â†’ Railway):
 *   Name: __Host-aira_session  (requires Secure + Path=/ + no Domain)
 *   Secure: true
 *   SameSite: None  (required for cross-site delivery)
 *   HttpOnly: true, Path: /
 *
 * Development (same-site localhost):
 *   Name: aira_session_dev
 *   Secure: false
 *   SameSite: Lax
 *   HttpOnly: true, Path: /
 */
function buildCookieOptions(maxAgeMs) {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: maxAgeMs,
    // __Host- prefix requires no Domain attribute â€” do NOT set domain here
  };
}

async function createSession({
  userId,
  organizationId = null,
  rememberMe = false,
  ip = null,
  userAgent = null,
  authMethod = "password",
  assuranceLevel = "aal1",
}) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const now = Date.now();
  const absoluteMs = rememberMe ? REMEMBER_ME_TIMEOUT_MS : ABSOLUTE_TIMEOUT_MS;

  const session = await UserSession.create({
    userId,
    activeOrganizationId: organizationId || null,
    tokenHash,
    status: "active",
    lastActivityAt: new Date(now),
    idleExpiresAt: new Date(now + IDLE_TIMEOUT_MS),
    absoluteExpiresAt: new Date(now + absoluteMs),
    authenticationMethods: [authMethod],
    assuranceLevel,
    rememberMe,
    ipHash: hashIp(ip),
    userAgentHash: hashUserAgent(userAgent),
  });

  // Generate and store CSRF secret, return the derived browser-visible token
  const csrfToken = await attachCsrfSecret(session);

  return { session, rawToken, csrfToken };
}

async function validateSession(rawToken) {
  const tokenHash = hashToken(rawToken);
  const session = await UserSession.findOne({ tokenHash }).select("+tokenHash");

  if (!session) return { valid: false, reason: "SESSION_NOT_FOUND" };
  if (session.status !== "active") return { valid: false, reason: "SESSION_REVOKED", session };

  const now = new Date();
  if (now > session.absoluteExpiresAt) {
    await UserSession.updateOne({ _id: session._id }, { status: "expired" });
    return { valid: false, reason: "SESSION_ABSOLUTE_EXPIRED" };
  }
  if (now > session.idleExpiresAt) {
    await UserSession.updateOne({ _id: session._id }, { status: "expired" });
    return { valid: false, reason: "SESSION_IDLE_EXPIRED" };
  }

  if (now - session.lastActivityAt > ACTIVITY_THROTTLE_MS) {
    const newIdle = new Date(now.getTime() + IDLE_TIMEOUT_MS);
    await UserSession.updateOne({ _id: session._id }, { lastActivityAt: now, idleExpiresAt: newIdle });
    session.lastActivityAt = now;
    session.idleExpiresAt = newIdle;
  }

  return { valid: true, session };
}

async function revokeSession(sessionId, reason = "logout") {
  await UserSession.updateOne(
    { _id: sessionId, status: "active" },
    { status: "revoked", revokedAt: new Date(), revocationReason: reason }
  );
}

async function revokeAllUserSessions(userId, exceptSessionId = null) {
  const filter = { userId, status: "active" };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  await UserSession.updateMany(filter, {
    status: "revoked",
    revokedAt: new Date(),
    revocationReason: "logout_all",
  });
}

function setSessionCookie(res, rawToken, rememberMe = false) {
  const maxAgeMs = rememberMe ? REMEMBER_ME_TIMEOUT_MS : ABSOLUTE_TIMEOUT_MS;
  res.cookie(getCookieName(), rawToken, buildCookieOptions(maxAgeMs));
}

function clearSessionCookie(res) {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie(getCookieName(), {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  });
}

function extractRawToken(req) {
  return req.cookies?.[getCookieName()] || null;
}

module.exports = {
  createSession,
  validateSession,
  revokeSession,
  revokeAllUserSessions,
  setSessionCookie,
  clearSessionCookie,
  extractRawToken,
  getCookieName,
  hashToken,
  hashIp,
  hashUserAgent,
};

