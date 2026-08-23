"use strict";

/**
 * Accepts either:
 *
 * 1. A valid browser session cookie
 * 2. A valid machine HMAC Authorization header
 *
 * Browser session authentication is attempted first.
 * If no valid browser session exists, authentication falls
 * back to the existing HMAC machine authentication middleware.
 *
 * Successful authentication populates req.auth.
 */

const {
  extractRawToken,
  validateSession,
} = require("../services/identity/sessionService");

const {
  userRepository,
  organizationMembershipRepository,
  organizationRepository,
} = require("../persistence/repositories");

const authMiddleware = require("./authMiddleware");

/**
 * Attempt browser session authentication.
 *
 * Returns:
 *   true  -> session authentication succeeded
 *   false -> session authentication unavailable/invalid
 *
 * This function does not send responses because the caller
 * may still fall back to machine authentication.
 */
async function trySessionAuth(req) {
  let rawToken;

  try {
    rawToken = extractRawToken(req);
  } catch {
    return false;
  }

  if (!rawToken) {
    return false;
  }

  let result;

  try {
    result = await validateSession(rawToken);
  } catch {
    return false;
  }

  if (!result.valid) {
    return false;
  }

  const { session } = result;

  let user;

  try {
    user = await userRepository.findById(session.userId);
  } catch {
    return false;
  }

  if (!user) {
    return false;
  }

  if (
    user.status === "suspended" ||
    user.status === "disabled"
  ) {
    return false;
  }

  let membership = null;
  let organization = null;

  /*
   * If the session has an active organization,
   * independently verify both:
   *
   * 1. The user's membership is still active.
   * 2. The organization itself is still active.
   */
  if (session.activeOrganizationId) {
    try {
      [membership, organization] =
        await Promise.all([
          organizationMembershipRepository.findOne({
            userId: user._id,
            organizationId:
              session.activeOrganizationId,
            status: "active",
          }),

          organizationRepository.findOne({
            _id: session.activeOrganizationId,
            status: "active",
          }),
        ]);
    } catch {
      return false;
    }

    /*
     * Fail closed.
     *
     * A previously valid session must not retain
     * organization access after:
     *
     * - membership suspension
     * - membership removal
     * - organization suspension
     * - organization deactivation
     */
    if (!membership || !organization) {
      return false;
    }
  }

  req.auth = {
    authenticationType: "user_session",

    userId: user._id.toString(),

    sessionId: session._id.toString(),

    organizationId:
      organization?._id?.toString() ?? null,

    tenantId:
      organization?.tenantId ?? null,

    membershipId:
      membership?._id?.toString() ?? null,

    role:
      membership?.role ?? null,

    assuranceLevel:
      session.assuranceLevel ?? null,

    /*
     * Internal references.
     *
     * These are available to downstream middleware
     * and services but must never be serialized
     * directly to API clients.
     */
    _session: session,
    _user: user,
    _organization: organization,
    _membership: membership,
  };

  return true;
}

async function dualAuthMiddleware(
  req,
  res,
  next
) {
  if (req.method === "OPTIONS") {
    return next();
  }

  try {
    /*
     * Browser authentication takes precedence.
     */
    const sessionAuthenticated =
      await trySessionAuth(req);

    if (sessionAuthenticated) {
      return next();
    }

    /*
     * No usable browser session.
     *
     * Fall back to the existing machine HMAC
     * authentication middleware.
     */
    return authMiddleware(
      req,
      res,
      next
    );
  } catch (error) {
    console.error(
      "[dual-auth] Authentication failed:",
      error.message
    );

    return res.status(401).json({
      error: "Not authenticated",
      code: "NOT_AUTHENTICATED",
    });
  }
}

module.exports = dualAuthMiddleware;