"use strict";

const express =
  require(
    "express"
  );

const executionController =
  require(
    "../controllers/executionController"
  );

const router =
  express.Router();

// ============================================================================
// REQUEST CONTROLLED EXECUTION
// ============================================================================

router.post(
  "/incidents/:incidentId/executions",
  executionController
    .requestExecution
    .bind(
      executionController
    )
);

// ============================================================================
// INCIDENT EXECUTION HISTORY
// ============================================================================

router.get(
  "/incidents/:incidentId/executions",
  executionController
    .getIncidentExecutionHistory
    .bind(
      executionController
    )
);

// ============================================================================
// AUTHORIZATION
// ============================================================================

router.get(
  "/execution-authorizations/:authorizationId",
  executionController
    .getAuthorization
    .bind(
      executionController
    )
);

// ============================================================================
// EXECUTION REQUEST
// ============================================================================

router.get(
  "/executions/:executionRequestId",
  executionController
    .getExecutionRequest
    .bind(
      executionController
    )
);

// ============================================================================
// CANCELLATION
// ============================================================================

router.post(
  "/executions/:executionRequestId/cancel",
  executionController
    .cancelExecution
    .bind(
      executionController
    )
);

// ============================================================================
// ROLLBACK STATUS
// ============================================================================

router.get(
  "/executions/:executionRequestId/rollback",
  executionController
    .getRollbackStatus
    .bind(
      executionController
    )
);

module.exports =
  router;