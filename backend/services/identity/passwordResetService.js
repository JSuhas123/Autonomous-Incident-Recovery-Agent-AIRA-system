"use strict";

const crypto =
  require("node:crypto");

const {
  userRepository,

  passwordCredentialRepository,

  passwordResetTokenRepository,

  userSessionRepository,
} = require(
  "../../persistence/repositories"
);

const {
  hashPassword,
} = require(
  "./passwordService"
);

const {
  record:
    auditRecord,
} = require(
  "./identityAuditService"
);

const {
  AUTH_EVENT_TYPES,

  AUTH_EVENT_OUTCOMES,
} = require(
  "../../constants/authEvents"
);

const RESET_TOKEN_BYTES =
  32;

const DEFAULT_RESET_TTL_MINUTES =
  30;

/*
 * --------------------------------------------------------------------------
 * HELPERS
 * --------------------------------------------------------------------------
 */

function normalizeEmail(
  email
) {
  return String(
    email ||
    ""
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
        rawToken ||
        ""
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
    parsed <
      5 ||
    parsed >
      120
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
 * --------------------------------------------------------------------------
 * REVOKE OUTSTANDING RESET TOKENS
 * --------------------------------------------------------------------------
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
    of tokens ||
      []
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
      ) <=
        now
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
 * --------------------------------------------------------------------------
 * REQUEST PASSWORD RESET
 * --------------------------------------------------------------------------
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
   * Always perform cryptographic token generation.
   *
   * This helps keep unknown-user requests closer to the
   * valid-user execution path.
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
   * Public response remains generic.
   *
   * Only eligible active users receive a persisted reset
   * credential.
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
      () => {}
    );

    /*
     * Development only.
     *
     * AIRA currently has only a stubbed infrastructure email
     * service, not a real outbound delivery provider.
     *
     * Therefore local development receives the reset URL so
     * the complete reset flow can be tested.
     *
     * Production NEVER exposes the raw reset token in the API.
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
 * --------------------------------------------------------------------------
 * RESET PASSWORD
 * --------------------------------------------------------------------------
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
      token ||
      ""
    ).trim();

  if (
    !rawToken
  ) {
    throw safeResetFailure();
  }

  const hashedToken =
    tokenHash(
      rawToken
    );

  /*
   * Reset tokens are stored only as SHA-256 hashes.
   *
   * The raw bearer credential exists only in the reset link.
   */
  const resetRecord =
    await passwordResetTokenRepository
      .findOne(
        {
          tokenHash:
            hashedToken,
        },

        {
          includeTokenHash:
            true,
        }
      );

  if (
    !resetRecord
  ) {
    throw safeResetFailure();
  }

  const now =
    new Date();

  if (
    resetRecord
      .usedAt ||

    resetRecord
      .revokedAt ||

    !resetRecord
      .expiresAt ||

    new Date(
      resetRecord
        .expiresAt
    ) <=
      now
  ) {
    throw safeResetFailure();
  }

  const user =
    await userRepository
      .findById(
        resetRecord
          .userId
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
   * Reuse AIRA's canonical Argon2id password service.
   *
   * No alternate password hashing implementation is created.
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
   * One-time token consumption.
   */
  await passwordResetTokenRepository
    .updateOne(
      {
        _id:
          resetRecord._id,
      },

      {
        $set: {
          usedAt:
            now,
        },
      }
    );

  /*
   * Revoke all sibling password reset tokens.
   */
  const siblingTokens =
    await passwordResetTokenRepository
      .findMany({
        userId:
          user._id,
      });

  for (
    const sibling
    of siblingTokens ||
      []
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
   * Security requirement:
   *
   * A password reset invalidates all active browser sessions.
   *
   * The user must authenticate again using the new password.
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
  ).catch(
    () => {}
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