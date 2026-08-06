"use strict";

// Accepts either a valid browser session cookie OR a machine HMAC Authorization header.
// Sets req.auth with authenticationType: "user_session" | "machine_hmac".

const { extractRawToken, validateSession } = require("../services/identity/sessionService");
const User = require("../models/User");
const Organization = require("../models/Organization");
const OrganizationMembership = require("../models/OrganizationMembership");
const authMiddleware = require("./authMiddleware");

async function trySessionAuth(req) {
  let rawToken;
  try { rawToken = extractRawToken(req); } catch { return false; }
  if (!rawToken) return false;

  let result;
  try { result = await validateSession(rawToken); } catch { return false; }
  if (!result.valid) return false;

  const { session } = result;
  const user = await User.findById(session.userId);
  if (!user || user.status === "suspended" || user.status === "disabled") return false;

  let membership = null;
  let organization = null;
  if (session.activeOrganizationId) {
    [membership, organization] = await Promise.all([
      OrganizationMembership.findOne({ userId: user._id, organizationId: session.activeOrganizationId }),
      Organization.findById(session.activeOrganizationId),
    ]);
  }

  req.auth = {
    authenticationType: "user_session",
    userId: user._id.toString(),
    sessionId: session._id.toString(),
    organizationId: session.activeOrganizationId?.toString() ?? null,
    tenantId: organization?.tenantId ?? null,
    membershipId: membership?._id?.toString() ?? null,
    role: membership?.role ?? null,
    _session: session,
    _user: user,
    _organization: organization,
    _membership: membership,
  };
  return true;
}

async function dualAuthMiddleware(req, res, next) {
  if (req.method === "OPTIONS") return next();

  // Try session cookie first (browser users)
  const sessionOk = await trySessionAuth(req);
  if (sessionOk) return next();

  // Fall back to HMAC machine auth
  return authMiddleware(req, res, next);
}

module.exports = dualAuthMiddleware;
