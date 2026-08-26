"use strict";

const {
  authenticateApiKey,
} =
  require(
    "../services/identity/serviceAccountService"
  );

const {
  createServiceAccountPrincipal,
} =
  require(
    "../services/identity/principalService"
  );


// ============================================================================
// ERROR
// ============================================================================

function unauthorized(
  message,
  code
) {
  const error =
    new Error(
      message
    );

  error.status =
    401;

  error.code =
    code;

  error.executionAuthorized =
    false;

  return error;
}


// ============================================================================
// API KEY EXTRACTION
// ============================================================================

function extractApiKey(
  req
) {
  const authorization =
    String(
      req.headers
        ?.authorization ||
      ""
    ).trim();

  if (
    authorization
      .toLowerCase()
      .startsWith(
        "bearer "
      )
  ) {
    const value =
      authorization
        .slice(
          7
        )
        .trim();

    if (
      value.startsWith(
        "aira_live_"
      )
    ) {
      return value;
    }
  }

  const directHeader =
    String(
      req.headers
        ?.
        ["x-aira-api-key"] ||
      ""
    ).trim();

  if (
    directHeader
  ) {
    return directHeader;
  }

  return null;
}


// ============================================================================
// AUTHENTICATION
// ============================================================================

async function serviceAccountAuthMiddleware(
  req,
  res,
  next
) {
  try {
    const apiKey =
      extractApiKey(
        req
      );

    if (
      !apiKey
    ) {
      throw unauthorized(
        "API key required",
        "API_KEY_REQUIRED"
      );
    }

    const actor =
      await authenticateApiKey(
        apiKey
      );

    if (
      !actor ||
      actor.actorType !==
        "SERVICE_ACCOUNT"
    ) {
      throw unauthorized(
        "Machine identity authentication failed",
        "SERVICE_ACCOUNT_AUTHENTICATION_INVALID"
      );
    }

    if (
      !actor.organizationId ||
      !actor.serviceAccountId ||
      !actor.apiKeyId
    ) {
      throw unauthorized(
        "Machine identity context is incomplete",
        "SERVICE_ACCOUNT_CONTEXT_INVALID"
      );
    }


    // ========================================================================
    // CANONICAL ACTOR
    //
    // req.actor answers:
    //
    //   WHO is acting?
    // ========================================================================

    req.actor = {
      actorType:
        "SERVICE_ACCOUNT",

      organizationId:
        actor
          .organizationId,

      serviceAccountId:
        actor
          .serviceAccountId,

      serviceAccountInternalId:
        actor
          .serviceAccountInternalId,

      apiKeyId:
        actor
          .apiKeyId,

      name:
        actor
          .name ||
        null,

      permissions:
        Array.isArray(
          actor.permissions
        )
          ? [
              ...actor
                .permissions,
            ]
          : [],

      environmentIds:
        Array.isArray(
          actor.environmentIds
        )
          ? [
              ...actor
                .environmentIds,
            ]
          : [],
    };


    // ========================================================================
    // CANONICAL REQUEST CONTEXT
    //
    // req.context answers:
    //
    //   WHERE is the request operating?
    //   WITH WHAT authority?
    //
    // IMPORTANT:
    //
    // userId MUST remain null.
    //
    // Service accounts are machine identities and must never masquerade as
    // human users.
    // ========================================================================

    req.context = {
      ...(req.context ||
        {}),

      actorType:
        "SERVICE_ACCOUNT",

      actorId:
        actor
          .serviceAccountId,

      organizationId:
        actor
          .organizationId,

      userId:
        null,

      serviceAccountId:
        actor
          .serviceAccountId,

      apiKeyId:
        actor
          .apiKeyId,

      permissions:
        Array.isArray(
          actor.permissions
        )
          ? [
              ...actor
                .permissions,
            ]
          : [],

      environmentIds:
        Array.isArray(
          actor.environmentIds
        )
          ? [
              ...actor
                .environmentIds,
            ]
          : [],

      authenticationType:
        "API_KEY",
    };


    // ========================================================================
    // CANONICAL PRINCIPAL
    //
    // req.principal is the ONLY normalized object the authorization layer
    // should eventually need.
    // ========================================================================

    req.principal =
      createServiceAccountPrincipal({
        serviceAccountId:
          actor
            .serviceAccountId,

        organizationId:
          actor
            .organizationId,

        permissions:
          actor
            .permissions,

        environmentIds:
          actor
            .environmentIds,

        apiKeyId:
          actor
            .apiKeyId,

        name:
          actor
            .name,
      });


    return next();
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports =
  serviceAccountAuthMiddleware;


module.exports
  .extractApiKey =
  extractApiKey;