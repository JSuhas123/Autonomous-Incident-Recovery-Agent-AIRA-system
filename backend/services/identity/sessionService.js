"use strict";

const crypto =
  require(
    "crypto"
  );

const UserSession =
  require(
    "../../models/UserSession"
  );

const {
  attachCsrfSecret,
} =
  require(
    "../identity/csrfHelper"
  );


const COOKIE_NAME_PROD =
  "__Host-aira_session";

const COOKIE_NAME_DEV =
  "aira_session_dev";


const IDLE_TIMEOUT_MS =
  parsePositiveInteger(
    process.env
      .SESSION_IDLE_TIMEOUT_MS,
    30 *
      60 *
      1000
  );


const ABSOLUTE_TIMEOUT_MS =
  parsePositiveInteger(
    process.env
      .SESSION_ABSOLUTE_TIMEOUT_MS,
    8 *
      60 *
      60 *
      1000
  );


const REMEMBER_ME_TIMEOUT_MS =
  parsePositiveInteger(
    process.env
      .SESSION_REMEMBER_ME_TIMEOUT_MS,
    30 *
      24 *
      60 *
      60 *
      1000
  );


const ACTIVITY_THROTTLE_MS =
  parsePositiveInteger(
    process.env
      .SESSION_ACTIVITY_THROTTLE_MS,
    60_000
  );


// ============================================================================
// HELPERS
// ============================================================================

function parsePositiveInteger(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <=
      0
  ) {
    return fallback;
  }


  return parsed;
}


function generateRawToken() {
  /*
   * 256 bits of entropy.
   *
   * Only the hash is persisted.
   */
  return crypto
    .randomBytes(
      32
    )
    .toString(
      "hex"
    );
}


function hashToken(
  rawToken
) {
  if (
    typeof rawToken !==
      "string" ||
    !rawToken
  ) {
    throw Object.assign(
      new Error(
        "Session token is required"
      ),
      {
        code:
          "SESSION_TOKEN_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  return crypto
    .createHash(
      "sha256"
    )
    .update(
      rawToken
    )
    .digest(
      "hex"
    );
}


/*
 * IP / user-agent values are privacy-sensitive identifiers.
 *
 * Use keyed HMAC instead of a plain hash.
 */
function getFingerprintKey() {
  const configured =
    process.env
      .SESSION_FINGERPRINT_KEY ||
    process.env
      .IP_HASH_SALT;


  if (
    configured
  ) {
    return String(
      configured
    );
  }


  if (
    process.env.NODE_ENV ===
      "test"
  ) {
    return "aira-session-test-fingerprint-key";
  }


  if (
    process.env.NODE_ENV !==
      "production"
  ) {
    /*
     * Development-only fallback.
     *
     * Production NEVER uses this value.
     */
    return "aira-development-session-fingerprint-key";
  }


  throw Object.assign(
    new Error(
      "SESSION_FINGERPRINT_KEY is required in production"
    ),
    {
      code:
        "SESSION_FINGERPRINT_KEY_MISSING",

      executionAuthorized:
        false,
    }
  );
}


function fingerprint(
  value
) {
  if (
    !value
  ) {
    return null;
  }


  return crypto
    .createHmac(
      "sha256",
      getFingerprintKey()
    )
    .update(
      String(
        value
      )
    )
    .digest(
      "hex"
    );
}


function hashIp(
  ip
) {
  return fingerprint(
    ip
  );
}


function hashUserAgent(
  userAgent
) {
  return fingerprint(
    userAgent
  );
}


function getCookieName() {
  return process.env
    .NODE_ENV ===
    "production"
      ? COOKIE_NAME_PROD
      : COOKIE_NAME_DEV;
}


// ============================================================================
// COOKIE POLICY
// ============================================================================

function buildCookieOptions(
  maxAgeMs
) {
  const isProduction =
    process.env
      .NODE_ENV ===
    "production";


  return {
    httpOnly:
      true,

    secure:
      isProduction,

    /*
     * Production frontend/backend are cross-site in the
     * current deployment architecture.
     */
    sameSite:
      isProduction
        ? "none"
        : "lax",

    path:
      "/",

    maxAge:
      maxAgeMs,
  };
}


// ============================================================================
// SESSION CREATION
// ============================================================================

async function createSession({
  userId,
  organizationId =
    null,
  rememberMe =
    false,
  ip =
    null,
  userAgent =
    null,
  authMethod =
    "password",
  assuranceLevel =
    "aal1",
}) {
  if (
    !userId
  ) {
    throw Object.assign(
      new Error(
        "Session userId is required"
      ),
      {
        code:
          "SESSION_USER_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  const rawToken =
    generateRawToken();


  const tokenHash =
    hashToken(
      rawToken
    );


  const now =
    Date.now();


  const absoluteMs =
    rememberMe
      ? REMEMBER_ME_TIMEOUT_MS
      : ABSOLUTE_TIMEOUT_MS;


  /*
   * Only the token HASH is persisted.
   *
   * rawToken exists only long enough to be returned to the
   * caller and placed into the HttpOnly cookie.
   */
  const session =
    await UserSession
      .create({
        userId,

        activeOrganizationId:
          organizationId ||
          null,

        tokenHash,

        status:
          "active",

        lastActivityAt:
          new Date(
            now
          ),

        idleExpiresAt:
          new Date(
            now +
            IDLE_TIMEOUT_MS
          ),

        absoluteExpiresAt:
          new Date(
            now +
            absoluteMs
          ),

        authenticationMethods: [
          authMethod,
        ],

        assuranceLevel,

        rememberMe:
          Boolean(
            rememberMe
          ),

        ipHash:
          hashIp(
            ip
          ),

        userAgentHash:
          hashUserAgent(
            userAgent
          ),
      });


  const csrfToken =
    await attachCsrfSecret(
      session
    );


  return {
    session,

    rawToken,

    csrfToken,

    executionAuthorized:
      false,
  };
}


// ============================================================================
// SESSION VALIDATION
// ============================================================================

async function validateSession(
  rawToken
) {
  let tokenHash;


  try {
    tokenHash =
      hashToken(
        rawToken
      );
  } catch {
    return {
      valid:
        false,

      reason:
        "SESSION_NOT_FOUND",

      executionAuthorized:
        false,
    };
  }


  const session =
    await UserSession
      .findOne({
        tokenHash,
      })
      .select(
        "+tokenHash"
      );


  if (
    !session
  ) {
    return {
      valid:
        false,

      reason:
        "SESSION_NOT_FOUND",

      executionAuthorized:
        false,
    };
  }


  if (
    session.status !==
      "active"
  ) {
    return {
      valid:
        false,

      reason:
        "SESSION_REVOKED",

      session,

      executionAuthorized:
        false,
    };
  }


  const now =
    new Date();


  if (
    now >
    session
      .absoluteExpiresAt
  ) {
    await UserSession
      .updateOne(
        {
          _id:
            session._id,

          status:
            "active",
        },
        {
          $set: {
            status:
              "expired",
          },
        }
      );


    return {
      valid:
        false,

      reason:
        "SESSION_ABSOLUTE_EXPIRED",

      executionAuthorized:
        false,
    };
  }


  if (
    now >
    session
      .idleExpiresAt
  ) {
    await UserSession
      .updateOne(
        {
          _id:
            session._id,

          status:
            "active",
        },
        {
          $set: {
            status:
              "expired",
          },
        }
      );


    return {
      valid:
        false,

      reason:
        "SESSION_IDLE_EXPIRED",

      executionAuthorized:
        false,
    };
  }


  const lastActivityAt =
    session
      .lastActivityAt instanceof
      Date
        ? session
            .lastActivityAt
        : new Date(
            session
              .lastActivityAt
          );


  if (
    now.getTime() -
      lastActivityAt
        .getTime() >
    ACTIVITY_THROTTLE_MS
  ) {
    const newIdle =
      new Date(
        now.getTime() +
        IDLE_TIMEOUT_MS
      );


    /*
     * Update only an active session.
     *
     * This reduces the chance of activity refresh racing with
     * session revocation.
     */
    await UserSession
      .updateOne(
        {
          _id:
            session._id,

          status:
            "active",
        },
        {
          $set: {
            lastActivityAt:
              now,

            idleExpiresAt:
              newIdle,
          },
        }
      );


    session.lastActivityAt =
      now;

    session.idleExpiresAt =
      newIdle;
  }


  return {
    valid:
      true,

    session,

    executionAuthorized:
      false,
  };
}


// ============================================================================
// REVOCATION
// ============================================================================

async function revokeSession(
  sessionId,
  reason =
    "logout"
) {
  if (
    !sessionId
  ) {
    return {
      revoked:
        false,

      executionAuthorized:
        false,
    };
  }


  const result =
    await UserSession
      .updateOne(
        {
          _id:
            sessionId,

          status:
            "active",
        },
        {
          $set: {
            status:
              "revoked",

            revokedAt:
              new Date(),

            revocationReason:
              String(
                reason ||
                "logout"
              )
                .slice(
                  0,
                  200
                ),
          },
        }
      );


  return {
    revoked:
      Boolean(
        result
          ?.modifiedCount
      ),

    executionAuthorized:
      false,
  };
}


async function revokeAllUserSessions(
  userId,
  exceptSessionId =
    null
) {
  const filter = {
    userId,

    status:
      "active",
  };


  if (
    exceptSessionId
  ) {
    filter._id = {
      $ne:
        exceptSessionId,
    };
  }


  const result =
    await UserSession
      .updateMany(
        filter,
        {
          $set: {
            status:
              "revoked",

            revokedAt:
              new Date(),

            revocationReason:
              "logout_all",
          },
        }
      );


  return {
    revokedCount:
      result
        ?.modifiedCount ||
      0,

    executionAuthorized:
      false,
  };
}


// ============================================================================
// COOKIE OPERATIONS
// ============================================================================

function setSessionCookie(
  res,
  rawToken,
  rememberMe =
    false
) {
  if (
    !rawToken
  ) {
    throw Object.assign(
      new Error(
        "Session token is required"
      ),
      {
        code:
          "SESSION_TOKEN_REQUIRED",

        executionAuthorized:
          false,
      }
    );
  }


  const maxAgeMs =
    rememberMe
      ? REMEMBER_ME_TIMEOUT_MS
      : ABSOLUTE_TIMEOUT_MS;


  res.cookie(
    getCookieName(),
    rawToken,
    buildCookieOptions(
      maxAgeMs
    )
  );
}


function clearSessionCookie(
  res
) {
  const isProduction =
    process.env
      .NODE_ENV ===
    "production";


  res.clearCookie(
    getCookieName(),
    {
      httpOnly:
        true,

      secure:
        isProduction,

      sameSite:
        isProduction
          ? "none"
          : "lax",

      path:
        "/",
    }
  );
}


function extractRawToken(
  req
) {
  const value =
    req.cookies
      ?.[
        getCookieName()
      ];


  return typeof value ===
    "string" &&
    value
      ? value
      : null;
}


// ============================================================================
// EXPORTS
// ============================================================================

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

  buildCookieOptions,
};