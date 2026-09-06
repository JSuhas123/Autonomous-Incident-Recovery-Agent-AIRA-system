"use strict";

const {
  userRepository,
  passwordCredentialRepository,
  userSessionRepository,
  authenticationAuditEventRepository,
} =
  require(
    "../../persistence/repositories"
  );

const {
  verifyPassword,
  hashPassword,
} =
  require(
    "./passwordService"
  );

const {
  revokeSession,
  hashIp,
  hashUserAgent,
} =
  require(
    "./sessionService"
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

function badCurrentPassword() {
  return Object.assign(
    new Error(
      "Current password is incorrect."
    ),
    {
      status:
        400,

      code:
        "CURRENT_PASSWORD_INVALID",

      executionAuthorized:
        false,
    }
  );
}

function sessionNotFound() {
  return Object.assign(
    new Error(
      "Session not found."
    ),
    {
      status:
        404,

      code:
        "SESSION_NOT_FOUND",

      executionAuthorized:
        false,
    }
  );
}

function currentSessionProtected() {
  return Object.assign(
    new Error(
      "The current session cannot be revoked using this endpoint. Use logout instead."
    ),
    {
      status:
        409,

      code:
        "CURRENT_SESSION_PROTECTED",

      executionAuthorized:
        false,
    }
  );
}

async function changePassword(
  {
    userId,
    sessionId,
    organizationId =
      null,

    currentPassword,
    newPassword,

    ip =
      null,

    userAgent =
      null,
  }
) {
  const user =
    await userRepository
      .findById(
        userId
      );

  if (
    !user ||
    user.status !==
      "active"
  ) {
    throw Object.assign(
      new Error(
        "Account access denied."
      ),
      {
        status:
          403,

        code:
          "ACCOUNT_INACTIVE",

        executionAuthorized:
          false,
      }
    );
  }

  const credential =
    await passwordCredentialRepository
      .findOne(
        {
          userId,
        },

        {
          includePasswordHash:
            true,
        }
      );

  if (
    !credential ||
    !credential.passwordHash
  ) {
    throw badCurrentPassword();
  }

  const currentMatches =
    await verifyPassword(
      credential.passwordHash,
      currentPassword
    );

  if (
    !currentMatches
  ) {
    await auditRecord(
      AUTH_EVENT_TYPES
        .LOGIN_FAILED,

      AUTH_EVENT_OUTCOMES
        .DENIED,

      {
        userId,
        organizationId,
        sessionId,

        reasonCode:
          "CURRENT_PASSWORD_INVALID",

        ipHash:
          hashIp(ip),

        userAgentHash:
          hashUserAgent(
            userAgent
          ),

        metadata: {
          operation:
            "change_password",
        },
      }
    );

    throw badCurrentPassword();
  }

  const samePassword =
    await verifyPassword(
      credential.passwordHash,
      newPassword
    );

  if (
    samePassword
  ) {
    throw Object.assign(
      new Error(
        "Choose a password different from the current password."
      ),
      {
        status:
          400,

        code:
          "PASSWORD_REUSE_NOT_ALLOWED",

        executionAuthorized:
          false,
      }
    );
  }

  const newPasswordHash =
    await hashPassword(
      newPassword
    );

  const now =
    new Date();

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
   * Keep only the session that actually authorized this
   * password change.
   *
   * Stolen or forgotten sessions are revoked.
   */
  const result =
    await userSessionRepository
      .updateMany(
        {
          userId,

          status:
            "active",

          _id: {
            $ne:
              sessionId,
          },
        },

        {
          $set: {
            status:
              "revoked",

            revokedAt:
              now,

            revocationReason:
              "password_changed",
          },
        }
      );

  await auditRecord(
    AUTH_EVENT_TYPES
      .PASSWORD_CHANGED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId,
      organizationId,
      sessionId,

      ipHash:
        hashIp(ip),

      userAgentHash:
        hashUserAgent(
          userAgent
        ),

      metadata: {
        reason:
          "authenticated_password_change",

        otherSessionsRevoked:
          result
            ?.modifiedCount ||
          0,
      },
    }
  );

  return {
    changed:
      true,

    sessionsRevoked:
      result
        ?.modifiedCount ||
      0,

    message:
      "Password changed successfully. Other active sessions were revoked.",

    executionAuthorized:
      false,
  };
}

function safeSession(
  session,
  currentSessionId
) {
  return {
    id:
      String(
        session._id
      ),

    current:
      String(
        session._id
      ) ===
      String(
        currentSessionId
      ),

    assuranceLevel:
      session
        .assuranceLevel ||
      "aal1",

    rememberMe:
      Boolean(
        session.rememberMe
      ),

    createdAt:
      session.createdAt ||
      null,

    lastActivityAt:
      session.lastActivityAt ||
      null,

    idleExpiresAt:
      session.idleExpiresAt ||
      null,

    absoluteExpiresAt:
      session.absoluteExpiresAt ||
      null,

    /*
     * The repository stores privacy-preserving hashes rather than
     * the original network/user-agent values.
     */
    ipAddressMasked:
      null,

    userAgentSummary:
      session.deviceLabel ||
      null,
  };
}

async function listUserSessions(
  userId,
  currentSessionId
) {
  const sessions =
    await userSessionRepository
      .findMany({
        userId,
        status:
          "active",
      });

  const values =
    (sessions || [])
      .map(
        (session) =>
          safeSession(
            session,
            currentSessionId
          )
      )
      .sort(
        (a, b) => {
          if (
            a.current &&
            !b.current
          ) {
            return -1;
          }

          if (
            !a.current &&
            b.current
          ) {
            return 1;
          }

          return 0;
        }
      );

  return {
    sessions:
      values,

    executionAuthorized:
      false,
  };
}

async function revokeOwnedSession(
  {
    userId,
    currentSessionId,
    targetSessionId,
    organizationId =
      null,
  }
) {
  const target =
    await userSessionRepository
      .findOne({
        _id:
          targetSessionId,

        userId,

        status:
          "active",
      });

  /*
   * Foreign-user session IDs deliberately look identical to
   * nonexistent session IDs.
   */
  if (!target) {
    throw sessionNotFound();
  }

  if (
    String(
      target._id
    ) ===
    String(
      currentSessionId
    )
  ) {
    throw currentSessionProtected();
  }

  const result =
    await revokeSession(
      target._id,
      "user_security_revocation"
    );

  await auditRecord(
    AUTH_EVENT_TYPES
      .SESSION_REVOKED,

    AUTH_EVENT_OUTCOMES
      .SUCCESS,

    {
      userId,
      organizationId,
      sessionId:
        currentSessionId,

      metadata: {
        targetSessionId:
          String(
            target._id
          ),

        scope:
          "single_owned_session",
      },
    }
  );

  return {
    revoked:
      result.revoked,

    sessionId:
      String(
        target._id
      ),

    executionAuthorized:
      false,
  };
}

function eventDescription(
  event
) {
  switch (
    event.eventType
  ) {
    case AUTH_EVENT_TYPES
      .LOGIN_SUCCEEDED:
      return "Successful account sign-in.";

    case AUTH_EVENT_TYPES
      .LOGIN_FAILED:
      return "Authentication attempt was rejected.";

    case AUTH_EVENT_TYPES
      .PASSWORD_CHANGED:
      return "Account password was changed.";

    case AUTH_EVENT_TYPES
      .EMAIL_VERIFIED:
      return "Email ownership verification completed.";

    case AUTH_EVENT_TYPES
      .SESSION_CREATED:
      return "A new authenticated session was created.";

    case AUTH_EVENT_TYPES
      .SESSION_REVOKED:
      return "An authenticated session was revoked.";

    case AUTH_EVENT_TYPES
      .LOGOUT:
      return "Account session signed out.";

    case AUTH_EVENT_TYPES
      .ACCOUNT_LOCKED:
      return "Account authentication was temporarily locked.";

    default:
      return null;
  }
}

async function listSecurityEvents(
  userId
) {
  /*
   * Current audit repository exposes the canonical append-only
   * chain as one ordered collection.
   *
   * Phase 25 keeps that repository contract intact and narrows the
   * user-visible read here.
   */
  const allEvents =
    await authenticationAuditEventRepository
      .findMany();

  const relevant =
    (allEvents || [])
      .filter(
        (event) =>
          String(
            event.userId ||
              ""
          ) ===
          String(
            userId
          )
      )
      .slice(
        -50
      )
      .reverse();

  return {
    events:
      relevant.map(
        (event) => ({
          id:
            String(
              event.eventId ||
              event._id
            ),

          type:
            event.eventType,

          outcome:
            event.outcome ||
            null,

          description:
            eventDescription(
              event
            ),

          occurredAt:
            (
              event.createdAt ||
              new Date()
            )
              .toISOString
              ? (
                  event.createdAt ||
                  new Date()
                ).toISOString()
              : String(
                  event.createdAt
                ),

          /*
           * Raw addresses are intentionally not stored.
           */
          ipAddressMasked:
            event.ipHash
              ? "privacy-protected"
              : null,
        })
      ),

    executionAuthorized:
      false,
  };
}

module.exports = {
  changePassword,
  listUserSessions,
  revokeOwnedSession,
  listSecurityEvents,
};