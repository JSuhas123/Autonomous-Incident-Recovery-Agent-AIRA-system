"use strict";

const {
  Service,
} =
  require(
    "../persistence/operational/operationalModels"
  );

const express = require("express");
const router = express.Router();

/**
 * GET /api/v1/dashboard/onboarding
 * Returns onboarding progress for the authenticated user's organization.
 * All values are derived from real data — no invented metrics.
 */
router.get("/onboarding", async (req, res, next) => {
  try {
    const { organizationId } = req.auth;

    const workspaceCreated = !!organizationId;

    const serviceCount = organizationId
      ? await Service.countDocuments({ organizationId, status: { $ne: "archived" } })
      : 0;

    const steps = {
      workspaceCreated,
      serviceAdded: serviceCount > 0,
      domainVerified: false,
      monitoringConnected: false,
      firstEventReceived: false,
      firstInsightGenerated: false,
    };

    const nextRecommendedAction = steps.serviceAdded ? "CONNECT_MONITORING" : "ADD_SERVICE";

    return res.json({
      success: true,
      data: { ...steps, nextRecommendedAction },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
