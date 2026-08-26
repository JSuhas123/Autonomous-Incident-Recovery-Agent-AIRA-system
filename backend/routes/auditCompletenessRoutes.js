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

const {
  getAuditRequirements,

  verifyAuditCompleteness,

  listCertifications,

  createAuditExport,
} =
  require(
    "../services/identity/auditCompletenessService"
  );


const router =
  express.Router();


router.get(
  "/requirements",

  requirePermission(
    PERMISSIONS
      .AUDIT_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        requirements:
          await getAuditRequirements(),
      });
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


router.post(
  "/verify",

  requirePermission(
    PERMISSIONS
      .AUDIT_VERIFY
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await verifyAuditCompleteness({
          organizationId:
            req.context
              .organizationId,

          actorUserId:
            req.context
              .userId,
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
  "/certifications",

  requirePermission(
    PERMISSIONS
      .AUDIT_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json({
        certifications:
          await listCertifications({
            organizationId:
              req.context
                .organizationId,
          }),
      });
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
  "/export",

  requirePermission(
    PERMISSIONS
      .AUDIT_EXPORT
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await createAuditExport({
          organizationId:
            req.context
              .organizationId,

          actorUserId:
            req.context
              .userId,
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


module.exports =
  router;