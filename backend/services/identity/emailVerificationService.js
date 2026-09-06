"use strict";

const crypto =
  require(
    "node:crypto"
  );

const {
  userRepository,
  emailVerificationTokenRepository,
} =
  require(
    "../../persistence/repositories"
  );

const {
  record:
    auditRecord,
} =
  require(
    "./identityAuditService"
  );

const {
  hashIp,
  hashUserAgent,
} =
  require(
    "./sessionService"
  );

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_OUTCOMES,
} =
  require(
    "../../constants/authEvents"
  );

const TOKEN_BYTES =
  32;

const DEFAULT_TTL_MINUTES =
  60;

function normalizeEmail(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}

function hashToken(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      String(
        value || ""
      ),
      "utf8"
    )
    .digest(
      "hex"
    );
}

function verificationTtlMinutes() {
  const parsed =
    Number.parseInt(
      process.env
        .EMAIL_VERIFICATION_TTL_MINUTES ||
        String(
          DEFAULT_TTL_MINUTES
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
      1440
  ) {
    return DEFAULT_TTL_MINUTES;
  }

  return parsed;
}

function frontendBaseUrl() {
  return String(
    process.env
      .FRONTEND_URL ||
      process.env
        .APP_URL ||
      "http://localhost:3000"
  ).replace(
    /\/$/,
    ""
  );
}

function genericResponse() {
  return {
    accepted:
      true,

    message:
      "If the account is eligible for email verification, verification instructions have been prepared.",

    developmentVerificationUrl:
      null,

    executionAuthorized:
      false,
  };
}

function verificationFailure() {
  return Object.assign(
    new Error(
      "The email verification link is invalid, expired, revoked, or already used."
    ),
    {
      status:
        400,

      code:
        "EMAIL_VERIFICATION_INVALID",

      executionAuthorized:
        false,
    }
  );
}

async function revokeOutstandingTokens(
  userId
) {
  const records =
    await emailVerificationTokenRepository
      .findMany({
        userId,
      });

  const now =
    new Date();

  let revokedCount =
    0;

  for (
    const record
    of records || []
  ) {
    if (
      record.usedAt ||
      record.revokedAt
    ) {
      continue;
    }

    await emailVerificationTokenRepository
      .updateOne(
        {
          _id:
            record._id,
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

  return revokedCount;
}

async function requestEmailVerification(
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
  const response =
    genericResponse();

  const normalizedEmail =
    normalizeEmail(
      email
    );

  /*
   * Generate cryptographic work before the user lookup so
   * unknown-account requests follow a more similar execution path.
   */
  const rawToken =
    crypto
      .randomBytes(
        TOKEN_BYTES
      )
      .toString(
        "base64url"
      );

  const tokenHash =
    hashToken(
      rawToken
    );

  const user =
    await userRepository
      .findOne({
        normalizedEmail,
      });

  if (
    !user ||
    user.status !==
      "active" ||
    user.emailVerifiedAt
  ) {
    return response;
  }

  await revokeOutstandingTokens(
    user._id
  );

  const expiresAt =
    new Date(
      Date.now() +
        verificationTtlMinutes() *
          60 *
          1000
    );

  await emailVerificationTokenRepository
    .create({
      userId:
        user._id,

      tokenHash,

      expiresAt,

      usedAt:
        null,

      revokedAt:
        null,
    });

  await auditRecord(
    AUTH_EVENT_TYPES
      .VERIFICATION_CHALLENGE_CREATED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        user._id,

      organizationId:
        user
          .primaryOrganizationId ||
        null,

      ipHash:
        hashIp(ip),

      userAgentHash:
        hashUserAgent(
          userAgent
        ),

      metadata: {
        kind:
          "email_verification",

        expiresAt:
          expiresAt
            .toISOString(),
      },
    }
  );

  if (
    process.env
      .NODE_ENV !==
    "production"
  ) {
    response
      .developmentVerificationUrl =
      `${frontendBaseUrl()}/verify-email?token=${encodeURIComponent(
        rawToken
      )}`;
  }

  return response;
}

async function verifyEmail(
  {
    token,
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
    throw verificationFailure();
  }

  const tokenHash =
    hashToken(
      rawToken
    );

  /*
   * Atomic token claim.
   *
   * Two concurrent requests using the same token cannot both win.
   */
  const verificationRecord =
    await emailVerificationTokenRepository
      .consumeActiveToken(
        tokenHash,
        new Date()
      );

  if (
    !verificationRecord
  ) {
    throw verificationFailure();
  }

  const user =
    await userRepository
      .findById(
        verificationRecord
          .userId
      );

  if (
    !user ||
    user.status !==
      "active"
  ) {
    throw verificationFailure();
  }

  const verifiedAt =
    user.emailVerifiedAt
      ? new Date(
          user.emailVerifiedAt
        )
      : new Date();

  if (
    !user.emailVerifiedAt
  ) {
    await userRepository
      .updateOne(
        {
          _id:
            user._id,
        },

        {
          $set: {
            emailVerifiedAt:
              verifiedAt,
          },
        }
      );
  }

  /*
   * Revoke any sibling challenges.
   */
  await revokeOutstandingTokens(
    user._id
  );

  await auditRecord(
    AUTH_EVENT_TYPES
      .EMAIL_VERIFIED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId:
        user._id,

      organizationId:
        user
          .primaryOrganizationId ||
        null,

      ipHash:
        hashIp(ip),

      userAgentHash:
        hashUserAgent(
          userAgent
        ),

      metadata: {
        verifiedAt:
          verifiedAt
            .toISOString(),
      },
    }
  );

  return {
    verified:
      true,

    emailVerifiedAt:
      verifiedAt
        .toISOString(),

    message:
      "Your email address has been verified.",

    executionAuthorized:
      false,
  };
}

module.exports = {
  requestEmailVerification,
  verifyEmail,
  revokeOutstandingTokens,
};