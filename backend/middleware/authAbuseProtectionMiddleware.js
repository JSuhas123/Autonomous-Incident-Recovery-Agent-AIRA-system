"use strict";

const crypto =
  require(
    "node:crypto"
  );

const {
  getRateLimitService,
} =
  require(
    "./rateLimitingMiddleware"
  );

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
    "unknown"
  );
}

function stableHash(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      String(
        value || ""
      )
    )
    .digest(
      "hex"
    );
}

function identityValue(
  req
) {
  const email =
    req.body?.email
      ? String(
          req.body.email
        )
          .trim()
          .toLowerCase()
      : "";

  const token =
    req.body?.token
      ? String(
          req.body.token
        )
      : "";

  if (email) {
    return `email:${stableHash(
      email
    )}`;
  }

  if (token) {
    return `token:${stableHash(
      token
    )}`;
  }

  return "anonymous";
}

/*
 * Uses the existing RateLimitingService.
 *
 * The first check limits a source IP.
 * The second check limits the account/token identity when present.
 *
 * Neither key contains raw email addresses or bearer tokens.
 */
function authAbuseProtection(
  {
    scope,
    limit,
  }
) {
  if (!scope) {
    throw new Error(
      "Authentication rate-limit scope is required"
    );
  }

  if (
    !Number.isFinite(
      Number(limit)
    ) ||
    Number(limit) <=
      0
  ) {
    throw new Error(
      "Authentication rate-limit limit must be positive"
    );
  }

  return async function authAbuseProtectionMiddleware(
    req,
    res,
    next
  ) {
    try {
      const service =
        getRateLimitService();

      const ipKey =
        `auth:${scope}:ip:${stableHash(
          clientIp(req)
        )}`;

      const identityKey =
        `auth:${scope}:identity:${identityValue(
          req
        )}`;

      const ipResult =
        await service
          .checkLimit(
            ipKey,
            "api",
            Number(limit)
          );

      if (
        !ipResult.allowed
      ) {
        return reject(
          res,
          ipResult
        );
      }

      const identityResult =
        await service
          .checkLimit(
            identityKey,
            "api",
            Number(limit)
          );

      if (
        !identityResult.allowed
      ) {
        return reject(
          res,
          identityResult
        );
      }

      req.authRateLimit = {
        scope,

        degraded:
          Boolean(
            ipResult.degraded ||
            identityResult.degraded
          ),
      };

      return next();
    } catch (
      error
    ) {
      console.error(
        "[auth-rate-limit] Admission control failure:",
        error.message
      );

      /*
       * This follows the existing AIRA admission-control posture:
       * unexpected admission-control failure does not silently
       * disable protection.
       */
      return res
        .status(503)
        .json({
          error:
            "Authentication admission control unavailable",

          code:
            "AUTH_ADMISSION_CONTROL_UNAVAILABLE",

          retryable:
            true,

          executionAuthorized:
            false,
        });
    }
  };
}

function reject(
  res,
  result
) {
  const retryAfterSeconds =
    Math.max(
      1,
      Math.ceil(
        (
          result.retryAfterMs ||
          result.resetAfterMs ||
          60_000
        ) /
          1000
      )
    );

  res.set(
    "Retry-After",
    String(
      retryAfterSeconds
    )
  );

  return res
    .status(429)
    .json({
      error:
        "Too many authentication requests",

      code:
        "RATE_LIMIT_EXCEEDED",

      retryAfterMs:
        result.retryAfterMs ||
        result.resetAfterMs ||
        60_000,

      executionAuthorized:
        false,
    });
}

module.exports = {
  authAbuseProtection,
};