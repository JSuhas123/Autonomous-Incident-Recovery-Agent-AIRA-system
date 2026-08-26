"use strict";


function integrationOwnershipMiddleware(
  req,
  res,
  next
) {
  try {
    const organizationId =
      req.context
        ?.organizationId;

    const environmentId =
      req.context
        ?.environmentId;

    if (
      !organizationId
    ) {
      const error =
        new Error(
          "Organization context is required"
        );

      error.status =
        403;

      error.code =
        "INTEGRATION_ORGANIZATION_REQUIRED";

      error.executionAuthorized =
        false;

      throw error;
    }

    if (
      !environmentId
    ) {
      const error =
        new Error(
          "Environment context is required"
        );

      error.status =
        400;

      error.code =
        "INTEGRATION_ENVIRONMENT_REQUIRED";

      error.executionAuthorized =
        false;

      throw error;
    }

    req.integrationScope = {
      organizationId,

      environmentId,
    };

    return next();
  } catch (
    error
  ) {
    return next(
      error
    );
  }
}


module.exports =
  integrationOwnershipMiddleware;