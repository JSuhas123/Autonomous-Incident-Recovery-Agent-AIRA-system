"use strict";

const express =
  require(
    "express"
  );

const controller =
  require(
    "../controllers/coverageController"
  );


const router =
  express.Router();


/**
 * ============================================================================
 * AIRA PHASE 19
 * KNOWLEDGE COVERAGE API
 * ============================================================================
 *
 * These routes describe recovery readiness.
 *
 * They do NOT authorize recovery execution.
 * ============================================================================
 */


router.get(
  "/summary",
  controller.summary
);


router.get(
  "/resources",
  controller.resources
);


router.get(
  "/failure-modes",
  controller.failureModes
);


router.get(
  "/domains",
  controller.domains
);


router.get(
  "/gaps",
  controller.gaps
);


router.get(
  "/history",
  controller.history
);


router.post(
  "/refresh",
  controller.refresh
);


module.exports =
  router;