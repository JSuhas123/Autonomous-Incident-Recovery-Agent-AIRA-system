"use strict";

const express =
  require(
    "express"
  );

const recoveryDecisionController =
  require(
    "../controllers/recoveryDecisionController"
  );

const router =
  express.Router();

// ---------------------------------------------------------------------------
// CURRENT
// ---------------------------------------------------------------------------

router.get(
  "/incidents/:incidentId/recovery-decision",
  recoveryDecisionController
    .getCurrentDecision
    .bind(
      recoveryDecisionController
    )
);

// ---------------------------------------------------------------------------
// HISTORY
// ---------------------------------------------------------------------------

router.get(
  "/incidents/:incidentId/recovery-decision/history",
  recoveryDecisionController
    .getDecisionHistory
    .bind(
      recoveryDecisionController
    )
);

// ---------------------------------------------------------------------------
// SPECIFIC DECISION
// ---------------------------------------------------------------------------

router.get(
  "/incidents/:incidentId/recovery-decision/:decisionId",
  recoveryDecisionController
    .getDecisionById
    .bind(
      recoveryDecisionController
    )
);

// ---------------------------------------------------------------------------
// DECISION RUN
// ---------------------------------------------------------------------------

router.get(
  "/incidents/:incidentId/recovery-decision/:decisionId/run",
  recoveryDecisionController
    .getDecisionRun
    .bind(
      recoveryDecisionController
    )
);

// ---------------------------------------------------------------------------
// MANUAL RE-EVALUATION
// ---------------------------------------------------------------------------

router.post(
  "/incidents/:incidentId/recovery-decision",
  recoveryDecisionController
    .requestReevaluation
    .bind(
      recoveryDecisionController
    )
);

module.exports =
  router;