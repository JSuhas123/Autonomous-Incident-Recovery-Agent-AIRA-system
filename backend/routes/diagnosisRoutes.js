"use strict";

const express =
  require(
    "express"
  );

const diagnosisController =
  require(
    "../controllers/diagnosisController"
  );

const router =
  express.Router();

/*
 * IMPORTANT:
 *
 * Your normal authentication / organization / environment middleware
 * should wrap this router in server.js or be added here using your
 * existing middleware.
 *
 * Do not create a second auth mechanism just for diagnosis.
 */

// ---------------------------------------------------------------------------
// CURRENT
// ---------------------------------------------------------------------------

router.get(
  "/incidents/:incidentId/diagnosis",
  diagnosisController
    .getCurrentDiagnosis
    .bind(
      diagnosisController
    )
);

// ---------------------------------------------------------------------------
// HISTORY
// ---------------------------------------------------------------------------

router.get(
  "/incidents/:incidentId/diagnosis/history",
  diagnosisController
    .getDiagnosisHistory
    .bind(
      diagnosisController
    )
);

// ---------------------------------------------------------------------------
// SPECIFIC REVISION
// ---------------------------------------------------------------------------

router.get(
  "/incidents/:incidentId/diagnosis/:diagnosisId",
  diagnosisController
    .getDiagnosisById
    .bind(
      diagnosisController
    )
);

// ---------------------------------------------------------------------------
// AGENT RUN / TRACE
// ---------------------------------------------------------------------------

router.get(
  "/incidents/:incidentId/diagnosis/:diagnosisId/run",
  diagnosisController
    .getDiagnosisRun
    .bind(
      diagnosisController
    )
);

// ---------------------------------------------------------------------------
// MANUAL RE-DIAGNOSIS
// ---------------------------------------------------------------------------

router.post(
  "/incidents/:incidentId/diagnosis",
  diagnosisController
    .requestDiagnosis
    .bind(
      diagnosisController
    )
);

module.exports =
  router;