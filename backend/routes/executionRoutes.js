"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14 — CONTROLLED EXECUTION ROUTES
 * ============================================================================
 *
 * These routes expose the Phase 13 provider-neutral execution system through
 * Phase 14 fine-grained authorization.
 *
 * The execution controller remains responsible for:
 *
 * - execution authorization engine
 * - critic review
 * - policy / operational safety
 * - persistence
 * - queue handoff
 *
 * This route layer is now responsible for:
 *
 * - SaaS principal permission enforcement
 *
 * IMPORTANT:
 *
 * RBAC permission does NOT mean infrastructure execution is automatically
 * authorized.
 *
 * Example:
 *
 * execution.execute
 *       ↓
 * caller may REQUEST execution
 *       ↓
 * Phase 13 authorization engine
 *       ↓
 * policy evaluation
 *       ↓
 * critic
 *       ↓
 * authorization persistence
 *       ↓
 * execution queue
 *
 * Therefore:
 *
 * SaaS RBAC authorization
 *
 * and
 *
 * operational execution authorization
 *
 * remain intentionally separate security boundaries.
 */

const express =
  require(
    "express"
  );

const executionController =
  require(
    "../controllers/executionController"
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

const router =
  express.Router();

/**
 * ============================================================================
 * REQUEST CONTROLLED EXECUTION
 * ============================================================================
 *
 * POST /api/incidents/:incidentId/executions
 *
 * Permission:
 *
 * execution.execute
 *
 * This permission allows the principal to REQUEST execution.
 *
 * It does NOT bypass:
 *
 * - recovery authorization
 * - policies
 * - approval requirements
 * - critic checks
 * - safety gates
 * - execution authorization persistence
 */

router.post(
  "/incidents/:incidentId/executions",

  requirePermission(
    PERMISSIONS
      .EXECUTION_EXECUTE
  ),

  executionController
    .requestExecution
    .bind(
      executionController
    )
);

/**
 * ============================================================================
 * INCIDENT EXECUTION HISTORY
 * ============================================================================
 *
 * GET /api/incidents/:incidentId/executions
 *
 * Permission:
 *
 * execution.read
 */

router.get(
  "/incidents/:incidentId/executions",

  requirePermission(
    PERMISSIONS
      .EXECUTION_READ
  ),

  executionController
    .getIncidentExecutionHistory
    .bind(
      executionController
    )
);

/**
 * ============================================================================
 * EXECUTION AUTHORIZATION
 * ============================================================================
 *
 * GET /api/execution-authorizations/:authorizationId
 *
 * Permission:
 *
 * execution.read
 */

router.get(
  "/execution-authorizations/:authorizationId",

  requirePermission(
    PERMISSIONS
      .EXECUTION_READ
  ),

  executionController
    .getAuthorization
    .bind(
      executionController
    )
);

/**
 * ============================================================================
 * EXECUTION REQUEST
 * ============================================================================
 *
 * GET /api/executions/:executionRequestId
 *
 * Permission:
 *
 * execution.read
 */

router.get(
  "/executions/:executionRequestId",

  requirePermission(
    PERMISSIONS
      .EXECUTION_READ
  ),

  executionController
    .getExecutionRequest
    .bind(
      executionController
    )
);

/**
 * ============================================================================
 * EXECUTION CANCELLATION
 * ============================================================================
 *
 * POST /api/executions/:executionRequestId/cancel
 *
 * Permission:
 *
 * execution.cancel
 *
 * Cancellation is intentionally separate from execution.execute.
 *
 * This allows future roles to support:
 *
 * execute but not cancel
 *
 * or:
 *
 * cancel emergency operations without being able to initiate new ones.
 */

router.post(
  "/executions/:executionRequestId/cancel",

  requirePermission(
    PERMISSIONS
      .EXECUTION_CANCEL
  ),

  executionController
    .cancelExecution
    .bind(
      executionController
    )
);

/**
 * ============================================================================
 * ROLLBACK STATUS
 * ============================================================================
 *
 * GET /api/executions/:executionRequestId/rollback
 *
 * Permission:
 *
 * execution.read
 *
 * This endpoint only reads rollback lifecycle/status.
 *
 * A future endpoint that actually initiates rollback must use an explicit
 * mutation permission and pass through execution authorization.
 */

router.get(
  "/executions/:executionRequestId/rollback",

  requirePermission(
    PERMISSIONS
      .EXECUTION_READ
  ),

  executionController
    .getRollbackStatus
    .bind(
      executionController
    )
);

module.exports =
  router;