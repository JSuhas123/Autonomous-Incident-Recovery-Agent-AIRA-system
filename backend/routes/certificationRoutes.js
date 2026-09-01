"use strict";


const express =
  require(
    "express"
  );


const {
  PERMISSIONS,
} =
  require(
    "../constants/permissions"
  );


const {
  requirePermission,
} =
  require(
    "../middleware/authorizationMiddleware"
  );


const PostgresCertificationReadModelRepository =
  require(
    "../persistence/postgres/PostgresCertificationReadModelRepository"
  );


const {
  CertificationReadModelService,
} =
  require(
    "../services/certification/certificationReadModelService"
  );


const router =
  express.Router();


const service =
  new CertificationReadModelService({
    repository:
      new PostgresCertificationReadModelRepository(),
  });


function scope(
  req
) {
  return {
    organizationId:
      req.context
        .organizationId,

    environmentId:
      req.context
        .environmentId,
  };
}


router.get(
  "/",

  requirePermission(
    PERMISSIONS
      .AUTONOMY_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await service.list(
          scope(
            req
          )
        )
      );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.get(
  "/:capabilityKey/history",

  requirePermission(
    PERMISSIONS
      .AUTONOMY_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await service.history({
          ...scope(
            req
          ),

          capabilityKey:
            req.params
              .capabilityKey,
        })
      );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.get(
  "/:capabilityKey/evidence",

  requirePermission(
    PERMISSIONS
      .AUTONOMY_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await service.evidence({
          ...scope(
            req
          ),

          capabilityKey:
            req.params
              .capabilityKey,
        })
      );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.get(
  "/:capabilityKey",

  requirePermission(
    PERMISSIONS
      .AUTONOMY_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const capability =
        await service.get({
          ...scope(
            req
          ),

          capabilityKey:
            req.params
              .capabilityKey,
        });


      if (
        !capability
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "CERTIFICATION_CAPABILITY_NOT_FOUND",

            executionAuthorized:
              false,
          });
      }


      return res.json({
        capability,
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);


module.exports =
  router;