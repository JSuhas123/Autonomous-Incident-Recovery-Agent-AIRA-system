"use strict";

const User = require("../models/User");
const Organization = require("../models/Organization");
const OrganizationMembership = require("../models/OrganizationMembership");

const {
  validateSession,
  extractRawToken,
} = require("../services/identity/sessionService");

async function sessionAuthMiddleware(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }

  let rawToken;

  try {
    rawToken = extractRawToken(req);
  } catch {
    return res.status(401).json({
      error: "Not authenticated",
      code: "NOT_AUTHENTICATED",
    });
  }

  if (!rawToken) {
    return res.status(401).json({
      error: "Not authenticated",
      code: "NOT_AUTHENTICATED",
    });
  }

  let sessionResult;

  try {
    sessionResult = await validateSession(rawToken);
  } catch {
    return res.status(401).json({
      error: "Not authenticated",
      code: "NOT_AUTHENTICATED",
    });
  }

  if (!sessionResult.valid) {
    const codeMap = {
      SESSION_REVOKED: "SESSION_REVOKED",
      SESSION_IDLE_EXPIRED: "SESSION_EXPIRED",
      SESSION_ABSOLUTE_EXPIRED: "SESSION_EXPIRED",
    };

    return res.status(401).json({
      error: "Not authenticated",
      code:
        codeMap[sessionResult.reason] ||
        "NOT_AUTHENTICATED",
    });
  }

  const { session } = sessionResult;

  let user;

  try {
    user = await User.findById(session.userId);
  } catch {
    return res.status(401).json({
      error: "Not authenticated",
      code: "NOT_AUTHENTICATED",
    });
  }

  if (!user) {
    return res.status(401).json({
      error: "Not authenticated",
      code: "NOT_AUTHENTICATED",
    });
  }

  if (
    user.status === "suspended" ||
    user.status === "disabled"
  ) {
    return res.status(403).json({
      error: "Account access denied",
      code: "ACCOUNT_INACTIVE",
    });
  }

  let membership = null;
  let organization = null;

  if (session.activeOrganizationId) {
    membership =
      await OrganizationMembership.findOne({
        userId: user._id,
        organizationId:
          session.activeOrganizationId,
        status: "active",
      });

    if (membership) {
      organization =
        await Organization.findOne({
          _id: membership.organizationId,
          status: "active",
        });
    }

    /*
     * Fail closed if the session references an organization
     * that the user can no longer access.
     *
     * This protects against:
     * - suspended memberships
     * - removed memberships
     * - suspended/archived organizations
     * - stale sessions
     */
    if (!membership || !organization) {
      return res.status(403).json({
        error: "Organization access denied",
        code: "ORGANIZATION_ACCESS_DENIED",
      });
    }
  }

  req.auth = {
    authenticationType: "user_session",

    userId: user._id,
    sessionId: session._id,

    organizationId:
      organization?._id || null,

    tenantId:
      organization?.tenantId || null,

    membershipId:
      membership?._id || null,

    role:
      membership?.role || null,

    assuranceLevel:
      session.assuranceLevel,

    /*
     * Internal references for downstream middleware/services.
     * These must never be serialized directly to clients.
     */
    _session: session,
    _user: user,
    _organization: organization,
    _membership: membership,
  };

  return next();
}

module.exports = {
  sessionAuthMiddleware,
};