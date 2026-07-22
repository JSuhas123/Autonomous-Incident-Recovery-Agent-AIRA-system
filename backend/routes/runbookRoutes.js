/**
 * Runbook Routes (Phase 2 Sprint 3)
 * REST API for runbook management and execution
 */

const express = require("express");
const router = express.Router();
const Runbook = require("../models/Runbook");
const { runbookExecutionService } = require("../services/execution");

/**
 * GET /api/tenants/:tenantId/runbooks
 * List all runbooks for a tenant
 * Query params: incidentType, enabled
 */
router.get("/", async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { incidentType, enabled } = req.query;

    const filter = { tenantId };
    if (incidentType) filter.incidentType = incidentType;
    if (enabled !== undefined) filter.enabled = enabled === "true";

    const runbooks = await Runbook.find(filter).lean();

    res.json({
      tenantId,
      runbookCount: runbooks.length,
      runbooks,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tenants/:tenantId/runbooks/:runbookId
 * Get a specific runbook
 */
router.get("/:runbookId", async (req, res, next) => {
  try {
    const { tenantId, runbookId } = req.params;

    const runbook = await Runbook.findOne({
      _id: runbookId,
      tenantId,
    });

    if (!runbook) {
      return res.status(404).json({
        error: "Runbook not found",
        runbookId,
      });
    }

    res.json({
      tenantId,
      runbook,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tenants/:tenantId/runbooks
 * Create a new runbook
 * Body: { name, incidentType, steps, rollback, successCriteria, enabled }
 */
router.post("/", async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { name, incidentType, steps, rollback, successCriteria, enabled } = req.body;

    if (!name || !incidentType || !steps) {
      return res.status(400).json({
        error: "Missing required fields: name, incidentType, steps",
      });
    }

    const runbook = new Runbook({
      tenantId,
      name,
      incidentType,
      steps,
      rollback: rollback || [],
      successCriteria: successCriteria || [],
      enabled: enabled !== false,
      version: 1,
    });

    await runbook.save();

    res.status(201).json({
      success: true,
      message: "Runbook created",
      runbook,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/tenants/:tenantId/runbooks/:runbookId
 * Update a runbook
 * Body: { name?, steps?, rollback?, enabled?, ... }
 */
router.put("/:runbookId", async (req, res, next) => {
  try {
    const { tenantId, runbookId } = req.params;
    const updates = req.body;

    const runbook = await Runbook.findOneAndUpdate(
      { _id: runbookId, tenantId },
      { ...updates, version: (updates.version || 0) + 1 },
      { new: true }
    );

    if (!runbook) {
      return res.status(404).json({
        error: "Runbook not found",
        runbookId,
      });
    }

    res.json({
      success: true,
      message: "Runbook updated",
      runbook,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/tenants/:tenantId/runbooks/:runbookId
 * Delete a runbook
 */
router.delete("/:runbookId", async (req, res, next) => {
  try {
    const { tenantId, runbookId } = req.params;

    const result = await Runbook.deleteOne({
      _id: runbookId,
      tenantId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: "Runbook not found",
        runbookId,
      });
    }

    res.json({
      success: true,
      message: "Runbook deleted",
      runbookId,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tenants/:tenantId/runbooks/:runbookId/execute
 * Execute a runbook for an incident
 * Body: { correlationId, incidentContext }
 */
router.post("/:runbookId/execute", async (req, res, next) => {
  try {
    const { tenantId, runbookId } = req.params;
    const { correlationId, incidentContext } = req.body;

    if (!correlationId) {
      return res.status(400).json({
        error: "correlationId is required",
      });
    }

    const runbook = await Runbook.findOne({
      _id: runbookId,
      tenantId,
    });

    if (!runbook) {
      return res.status(404).json({
        error: "Runbook not found",
        runbookId,
      });
    }

    const execution = await runbookExecutionService.executeRunbook(
      tenantId,
      correlationId,
      runbook,
      incidentContext || {}
    );

    res.json({
      success: true,
      message: "Runbook execution started",
      executionId: execution._id,
      status: execution.status,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tenants/:tenantId/runbooks/:runbookId/executions
 * Get execution history for a runbook
 * Query params: limit
 */
router.get("/:runbookId/executions", async (req, res, next) => {
  try {
    const { tenantId, runbookId } = req.params;
    const { limit = 10 } = req.query;

    const executions = await runbookExecutionService.getExecutionHistory(
      tenantId,
      runbookId,
      parseInt(limit)
    );

    res.json({
      tenantId,
      runbookId,
      executionCount: executions.length,
      executions,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
