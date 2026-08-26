"use strict";

const {
  normalizePermissions,
} =
  require(
    "../../constants/permissions"
  );

const {
  getPermissionsForRole,
} =
  require(
    "../../constants/rolePermissions"
  );


const PRINCIPAL_TYPES =
  Object.freeze({
    USER:
      "USER",

    SERVICE_ACCOUNT:
      "SERVICE_ACCOUNT",
  });


const AUTHENTICATION_TYPES =
  Object.freeze({
    SESSION:
      "SESSION",

    API_KEY:
      "API_KEY",
  });


function normalizeId(
  value
) {
  if (
    value == null
  ) {
    return null;
  }

  return String(
    value
      ?.toString?.() ??
    value
  );
}


function normalizeStringArray(
  values
) {
  if (
    !Array.isArray(
      values
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      values
        .map(
          (value) =>
            String(
              value ||
              ""
            ).trim()
        )
        .filter(
          Boolean
        )
    ),
  ];
}


function resolveEffectivePermissions({
  role =
    null,
  explicitPermissions =
    [],
}) {
  const rolePermissions =
    role
      ? getPermissionsForRole(
          role
        )
      : [];

  const normalizedExplicit =
    normalizePermissions(
      explicitPermissions
    );

  return normalizePermissions([
    ...rolePermissions,
    ...normalizedExplicit,
  ]);
}


function createUserPrincipal({
  userId,
  organizationId,
  role,
  permissions =
    [],
  environmentIds =
    [],
  sessionId =
    null,
  email =
    null,
}) {
  if (
    !userId ||
    !organizationId
  ) {
    throw Object.assign(
      new Error(
        "User principal requires userId and organizationId"
      ),
      {
        status:
          401,

        code:
          "USER_PRINCIPAL_INVALID",

        executionAuthorized:
          false,
      }
    );
  }

  return Object.freeze({
    actorType:
      PRINCIPAL_TYPES
        .USER,

    actorId:
      normalizeId(
        userId
      ),

    userId:
      normalizeId(
        userId
      ),

    serviceAccountId:
      null,

    organizationId:
      normalizeId(
        organizationId
      ),

    role:
      role ||
      null,

    permissions:
      resolveEffectivePermissions({
        role,

        explicitPermissions:
          permissions,
      }),

    environmentIds:
      normalizeStringArray(
        environmentIds
      ),

    authenticationType:
      AUTHENTICATION_TYPES
        .SESSION,

    authenticationId:
      normalizeId(
        sessionId
      ),

    email:
      email ||
      null,
  });
}


function createServiceAccountPrincipal({
  serviceAccountId,
  organizationId,
  permissions =
    [],
  environmentIds =
    [],
  apiKeyId =
    null,
  name =
    null,
}) {
  if (
    !serviceAccountId ||
    !organizationId
  ) {
    throw Object.assign(
      new Error(
        "Service account principal requires serviceAccountId and organizationId"
      ),
      {
        status:
          401,

        code:
          "SERVICE_ACCOUNT_PRINCIPAL_INVALID",

        executionAuthorized:
          false,
      }
    );
  }

  return Object.freeze({
    actorType:
      PRINCIPAL_TYPES
        .SERVICE_ACCOUNT,

    actorId:
      normalizeId(
        serviceAccountId
      ),

    userId:
      null,

    serviceAccountId:
      normalizeId(
        serviceAccountId
      ),

    organizationId:
      normalizeId(
        organizationId
      ),

    role:
      null,

    permissions:
      normalizePermissions(
        permissions
      ),

    environmentIds:
      normalizeStringArray(
        environmentIds
      ),

    authenticationType:
      AUTHENTICATION_TYPES
        .API_KEY,

    authenticationId:
      normalizeId(
        apiKeyId
      ),

    name:
      name ||
      null,
  });
}


function principalFromRequest(
  req
) {
  if (
    req.principal
  ) {
    return req.principal;
  }

  const actorType =
    req.actor
      ?.actorType ||
    req.context
      ?.actorType ||
    null;

  if (
    actorType ===
    PRINCIPAL_TYPES
      .SERVICE_ACCOUNT
  ) {
    return createServiceAccountPrincipal({
      serviceAccountId:
        req.actor
          ?.serviceAccountId ||
        req.context
          ?.serviceAccountId,

      organizationId:
        req.actor
          ?.organizationId ||
        req.context
          ?.organizationId,

      permissions:
        req.actor
          ?.permissions ||
        req.context
          ?.permissions ||
        [],

      environmentIds:
        req.actor
          ?.environmentIds ||
        req.context
          ?.environmentIds ||
        [],

      apiKeyId:
        req.actor
          ?.apiKeyId ||
        req.context
          ?.apiKeyId,

      name:
        req.actor
          ?.name ||
        null,
    });
  }
return createUserPrincipal({
  userId:
    req.context
      ?.userId ||

    req.auth
      ?.userId ||

    req.user
      ?._id ||

    req.user
      ?.id,

  organizationId:
    req.context
      ?.organizationId ||

    req.auth
      ?.organizationId,

  role:
    req.context
      ?.role ||

    req.auth
      ?.role ||

    req.membership
      ?.role ||

    null,

  permissions:
    req.context
      ?.permissions ||

    req.auth
      ?.permissions ||

    req.membership
      ?.permissions ||

    [],

  environmentIds:
    req.context
      ?.environmentIds ||

    [],

  sessionId:
    req.context
      ?.sessionId ||

    req.auth
      ?.sessionId ||

    req.session
      ?._id ||

    null,

  email:
    req.user
      ?.email ||

    req.auth
      ?._user
      ?.email ||

    null,
});
}


module.exports = {
  PRINCIPAL_TYPES,
  AUTHENTICATION_TYPES,

  resolveEffectivePermissions,

  createUserPrincipal,
  createServiceAccountPrincipal,

  principalFromRequest,
};