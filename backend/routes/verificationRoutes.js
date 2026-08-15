"use strict";

const express =
  require(
    "express"
  );

const verificationController =
  require(
    "../controllers/verificationController"
  );

const router =
  express.Router();

// ============================================================================
// REQUEST VERIFICATION
// ============================================================================

router.post(
  "/executions/:executionRequestId/verification",
  verificationController
    .requestVerification
    .bind(
      verificationController
    )
);

// ============================================================================
// CURRENT INCIDENT VERIFICATION
// ============================================================================

router.get(
  "/incidents/:incidentId/verification",
  verificationController
    .getCurrentVerification
    .bind(
      verificationController
    )
);

// ============================================================================
// INCIDENT VERIFICATION HISTORY
// ============================================================================

router.get(
  "/incidents/:incidentId/verifications",
  verificationController
    .getVerificationHistory
    .bind(
      verificationController
    )
);

// ============================================================================
// VERIFICATION RUN HISTORY
// ============================================================================

router.get(
  "/incidents/:incidentId/verification-runs",
  verificationController
    .getVerificationRuns
    .bind(
      verificationController
    )
);

// ============================================================================
// INCIDENT CLOSURE ELIGIBILITY
// ============================================================================

router.get(
  "/incidents/:incidentId/closure-eligibility",
  verificationController
    .getClosureEligibility
    .bind(
      verificationController
    )
);

// ============================================================================
// VERIFICATION BY ID
// ============================================================================

router.get(
  "/verifications/:verificationId",
  verificationController
    .getVerification
    .bind(
      verificationController
    )
);

// ============================================================================
// EVIDENCE
// ============================================================================

router.get(
  "/verifications/:verificationId/evidence",
  verificationController
    .getVerificationEvidence
    .bind(
      verificationController
    )
);

module.exports =
  router;