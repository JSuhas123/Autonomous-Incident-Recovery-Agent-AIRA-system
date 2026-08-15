"use strict";

const express =
  require(
    "express"
  );

const lifecycleController =
  require(
    "../controllers/lifecycleController"
  );

const router =
  express.Router();

router.post(
  "/incidents/:incidentId/lifecycle/process",
  lifecycleController
    .requestLifecycleProcessing
    .bind(
      lifecycleController
    )
);

router.get(
  "/incidents/:incidentId/lifecycle",
  lifecycleController
    .getCurrentLifecycle
    .bind(
      lifecycleController
    )
);

router.get(
  "/incidents/:incidentId/lifecycle/history",
  lifecycleController
    .getLifecycleHistory
    .bind(
      lifecycleController
    )
);

router.get(
  "/incidents/:incidentId/lifecycle/stability",
  lifecycleController
    .getStabilityStatus
    .bind(
      lifecycleController
    )
);

router.get(
  "/incidents/:incidentId/lifecycle/control-status",
  lifecycleController
    .getControlStatus
    .bind(
      lifecycleController
    )
);

module.exports =
  router;