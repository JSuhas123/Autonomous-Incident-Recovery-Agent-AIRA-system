"use strict";

const crypto =
  require("node:crypto");

const {
  userRepository,
  passwordCredentialRepository,
  passwordResetTokenRepository,
  userSessionRepository,
} =
  require(
    "../../persistence/repositories"
  );

const {
  hashPassword,
} =
  require(
    "./passwordService"
  );

const {
  record:
    auditRecord,
} =
  require(
    "./identityAuditService"
  );

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_OUTCOMES,
} =
  require(
    "../../constants/authEvents"
  );

const RESET_TOKEN_BYTES =
  32;

const DEFAULT_RESET_TTL_MINUTES =
  30;


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function normalizeEmail(
  email
) {
  return String(
    email || ""
  )
    .trim()
    .toLowerCase();
}


function tokenHash(
  rawToken
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      String(
        rawToken || ""
      ),
      "utf8"
    )
    .digest(
      "hex"
    );
}


function safeResetFailure(
  message =
    "The password reset link is invalid or has expired."
) {
  const error =
    new Error(
      message
    );

  error.status =
    400;

  error.code =
    "PASSWORD_RESET_INVALID";

  error.executionAuthorized =
    false;

  return error;
}


function resetTtlMinutes() {
  const parsed =
    Number.parseInt(
      process.env
        .PASSWORD_RESET_TTL_MINUTES ||
        String(
          DEFAULT_RESET_TTL_MINUTES
        ),
      10
    );

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed < 5 ||
    parsed > 120
  ) {
    return DEFAULT_RESET_TTL_MINUTES;
  }

  return parsed;
}


function frontendBaseUrl() {
  return String(
    process.env
      .FRONTEND_URL ||
      process.env
        .APP_URL ||
      "http://localhost:5173"
  ).replace(
    /\/$/,
    ""
  );
}


function isDevelopmentTokenExposureAllowed() {
  return (
    process.env
      .NODE_ENV !==
    "production"
  );
}


/*
 * ============================================================================
 * REVOKE OUTSTANDING RESET TOKENS
 * ============================================================================
 */

async function revokeOutstandingResetTokens(
  userId,
  reason =
    "superseded"
) {
  const tokens =
    await passwordResetTokenRepository
      .findMany({
        userId,
      });

  const now =
    new Date();

  let revokedCount =
    0;

  for (
    const token
    of tokens || []
  ) {
    if (
      token.usedAt ||
      token.revokedAt
    ) {
      continue;
    }

    if (
      token.expiresAt &&
      new Date(
        token.expiresAt
      ) <= now
    ) {
      continue;
    }

    await passwordResetTokenRepository
      .updateOne(
        {
          _id:
            token._id,
        },
        {
          $set: {
            revokedAt:
              now,
          },
        }
      );

    revokedCount +=
      1;
  }

  return {
    revokedCount,
    reason,
  };
}


/*
 * ============================================================================
 * REQUEST PASSWORD RESET
 * ============================================================================
 */

async function requestPasswordReset(
  {
    email,
  },
  {
    ip =
      null,

    userAgent =
      null,
  } = {}
) {
  const normalizedEmail =
    normalizeEmail(
      email
    );

  /*
   * Generate cryptographic work regardless of whether the account exists.
   *
   * This reduces timing differences between known and unknown accounts.
   */
  const rawToken =
    crypto
      .randomBytes(
        RESET_TOKEN_BYTES
      )
      .toString(
        "base64url"
      );

  const hashedToken =
    tokenHash(
      rawToken
    );

  const expiresAt =
    new Date(
      Date.now() +
        resetTtlMinutes() *
          60 *
          1000
    );

  const user =
    await userRepository
      .findOne({
        normalizedEmail,
      });

  let developmentResetUrl =
    null;

  /*
   * Outward response remains generic.
   */
  if (
    user &&
    user.status ===
      "active"
  ) {
    await revokeOutstandingResetTokens(
      user._id,
      "superseded_by_new_request"
    );

    await passwordResetTokenRepository
      .create({
        userId:
          user._id,

        tokenHash:
          hashedToken,

        expiresAt,

        usedAt:
          null,

        revokedAt:
          null,
      });

    /*
     * Password-reset request audit is best-effort because exposing
     * different HTTP behaviour for known and unknown accounts would
     * create an enumeration signal.
     *
     * The security-critical PASSWORD_CHANGED event below remains
     * part of the successful reset path.
     */
    await auditRecord(
      AUTH_EVENT_TYPES
        .PASSWORD_RESET_REQUESTED,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          user._id,

        organizationId:
          user
            .primaryOrganizationId ||
          null,

        metadata: {
          ip,

          userAgent:
            userAgent
              ? String(
                  userAgent
                ).slice(
                  0,
                  500
                )
              : null,

          expiresAt:
            expiresAt
              .toISOString(),
        },
      }
    ).catch(
      (
        error
      ) => {
        console.error(
          "[password-reset] Audit write failed for reset request:",
          error.message
        );
      }
    );

    /*
     * Development only.
     *
     * Production MUST never expose the raw bearer reset token.
     */
    if (
      isDevelopmentTokenExposureAllowed()
    ) {
      developmentResetUrl =
        `${frontendBaseUrl()}/reset-password?token=${encodeURIComponent(
          rawToken
        )}`;
    }
  }

  return {
    accepted:
      true,

    message:
      "If an eligible AIRA account exists for that email address, password reset instructions have been prepared.",

    developmentResetUrl,

    executionAuthorized:
      false,
  };
}


/*
 * ============================================================================
 * RESET PASSWORD
 * ============================================================================
 */

async function resetPassword(
  {
    token,
    password,
  },
  {
    ip =
      null,

    userAgent =
      null,
  } = {}
) {
  const rawToken =
    String(
      token || ""
    ).trim();

  if (!rawToken) {
    throw safeResetFailure();
  }

  const hashedToken =
    tokenHash(
      rawToken
    );

  const now =
    new Date();

  /*
   * ========================================================================
   * PHASE 25.2H — ATOMIC ONE-TIME CONSUMPTION
   * ========================================================================
   *
   * Old sequence:
   *
   *   SELECT token
   *   check used_at
   *   change password
   *   UPDATE used_at
   *
   * Two concurrent requests could both pass the SELECT/check.
   *
   * New sequence:
   *
   *   UPDATE ...
   *   WHERE token_hash = ?
   *     AND used_at IS NULL
   *     AND revoked_at IS NULL
   *     AND expires_at > NOW()
   *   RETURNING ...
   *
   * PostgreSQL therefore allows exactly one winner.
   * ========================================================================
   */

  const resetRecord =
    await passwordResetTokenRepository
      .consumeActiveToken(
        hashedToken,
        now
      );

  if (
    !resetRecord
  ) {
    throw safeResetFailure();
  }

  const user =
    await userRepository
      .findById(
        resetRecord.userId
      );

  if (
    !user ||
    user.status !==
      "active"
  ) {
    throw safeResetFailure();
  }

  const credential =
    await passwordCredentialRepository
      .findOne(
        {
          userId:
            user._id,
        },
        {
          includePasswordHash:
            true,
        }
      );

  if (
    !credential
  ) {
    throw safeResetFailure();
  }

  /*
   * Reuse canonical Argon2id implementation.
   */
  const newPasswordHash =
    await hashPassword(
      password
    );

  await passwordCredentialRepository
    .updateOne(
      {
        _id:
          credential._id,
      },
      {
        $set: {
          passwordHash:
            newPasswordHash,

          algorithm:
            "argon2id",

          hashVersion:
            Math.max(
              Number(
                credential
                  .hashVersion ||
                1
              ),
              1
            ),

          passwordChangedAt:
            now,

          failedAttempts:
            0,

          lockedUntil:
            null,

          lastFailedAt:
            null,
        },
      }
    );

  /*
   * Token is ALREADY consumed atomically.
   *
   * Do not perform another usedAt mutation here.
   */

  /*
   * Revoke sibling reset tokens.
   */
  const siblingTokens =
    await passwordResetTokenRepository
      .findMany({
        userId:
          user._id,
      });

  for (
    const sibling
    of siblingTokens || []
  ) {
    if (
      String(
        sibling._id
      ) ===
        String(
          resetRecord._id
        ) ||
      sibling.usedAt ||
      sibling.revokedAt
    ) {
      continue;
    }

    await passwordResetTokenRepository
      .updateOne(
        {
          _id:
            sibling._id,
        },
        {
          $set: {
            revokedAt:
              now,
          },
        }
      );
  }

  /*
   * Password reset revokes ALL active sessions.
   *
   * Reset != login.
   */
  await userSessionRepository
    .updateMany(
      {
        userId:
          user._id,

        status:
          "active",
      },
      {
        $set: {
          status:
            "revoked",

          revokedAt:
            now,

          revocationReason:
            "password_reset",
        },
      }
    );

  /*
   * Security-critical evidence.
   *
   * Successful password mutation must have an audit record.
   */
  await auditRecord(
    AUTH_EVENT_TYPES
      .PASSWORD_CHANGED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        user._id,

      organizationId:
        user
          .primaryOrganizationId ||
        null,

      metadata: {
        reason:
          "password_reset",

        ip,

        userAgent:
          userAgent
            ? String(
                userAgent
              ).slice(
                0,
                500
              )
            : null,
      },
    }
  );

  return {
    reset:
      true,

    message:
      "Password changed successfully. Existing sessions were revoked; sign in again with the new password.",

    executionAuthorized:
      false,
  };
}


module.exports = {
  requestPasswordReset,
  resetPassword,
};