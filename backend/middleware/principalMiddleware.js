"use strict";

const {
  principalFromRequest,
} =
  require(
    "../services/identity/principalService"
  );


function principalMiddleware(
  req,
  res,
  next
) {
  try {
    const principal =
      principalFromRequest(
        req
      );

    req.principal =
      principal;

    req.context = {
      ...(req.context ||
        {}),

      actorType:
        principal
          .actorType,

      actorId:
        principal
          .actorId,

      organizationId:
        principal
          .organizationId,

      permissions:
        principal
          .permissions,

      environmentIds:
        principal
          .environmentIds,

      authenticationType:
        principal
          .authenticationType,
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
  principalMiddleware;