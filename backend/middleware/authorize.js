"use strict";

const {
  isKnownPermission,
} =
  require(
    "../constants/permissions"
  );

const {
  assertAuthorized,
} =
  require(
    "../services/identity/centralAuthorizationService"
  );


function requireAuthorization(
  permission,
  options =
    {}
) {
  if (
    !isKnownPermission(
      permission
    )
  ) {
    throw new Error(
      `Unknown authorization permission: ${permission}`
    );
  }

  const {
    requireEnvironment =
      false,

    resolveOrganizationId =
      null,

    resolveEnvironmentId =
      null,
  } = options;


  return function authorizationMiddleware(
    req,
    res,
    next
  ) {
    try {
      const principal =
        req.principal;

      const organizationId =
        typeof resolveOrganizationId ===
          "function"
          ? resolveOrganizationId(
              req
            )
          : req.context
              ?.organizationId ||
            principal
              ?.organizationId ||
            null;

      const environmentId =
        typeof resolveEnvironmentId ===
          "function"
          ? resolveEnvironmentId(
              req
            )
          : req.context
              ?.environmentId ||
            req.params
              ?.environmentId ||
            null;


      const decision =
        assertAuthorized({
          principal,

          permission,

          organizationId,

          environmentId,

          requireEnvironment,
        });


      req.authorization =
        decision;


      return next();
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  };
}


module.exports = {
  requireAuthorization,
};