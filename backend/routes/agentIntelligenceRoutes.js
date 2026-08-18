'use strict';

/**
 * Agent Intelligence API Routes
 *
 * Endpoints for the Phase 12 canonical incident-intelligence workflow. *
 * SECURITY:
 * - All routes respect existing auth / tenant / RBAC middleware.
 * - No caller can directly invoke arbitrary agent tools.
 * - No arbitrary playbook execution is exposed through this API.
 * - Tenant isolation is enforced on every incident query.
 * - Production diagnosis always uses DiagnosisLifecycleService /
 *   DiagnosisCoordinator.
 * - Post-diagnosis recovery planning uses the authoritative runtime
 *   orchestrator through continueFromDiagnosis(). */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const AgentIntelligenceRun = require('../models/AgentIntelligenceRun');
const { Incident } = require('../models/Incident');

const {
  getAgentOrchestratorInstance,
} = require('../agents/v2');

const diagnosisLifecycleService =
  require(
    '../services/diagnosis/diagnosisLifecycleService'
  );
// ─────────────────────────────────────────────────────────────────────────────
// POST /incidents/:incidentId/analyze
// ─────────────────────────────────────────────────────────────────────────────

async function analyzeIncident(
  req,
  res
) {
  try {
    const tenantId =
      req.auth
        ?.tenantId;

    const incidentId =
      req.params
        .incidentId;

    if (
      !tenantId
    ) {
      return res
        .status(
          401
        )
        .json({
          error:
            "Unauthorized",
        });
    }

    /*
     * Always resolve the canonical persisted incident.
     *
     * Caller-provided signals must never replace server-side canonical
     * investigation evidence.
     */
    const incident =
      await Incident
        .findOne({
          _id:
            incidentId,

          organizationId:
            tenantId,
        })
        .lean();

    if (
      !incident
    ) {
      return res
        .status(
          404
        )
        .json({
          error:
            "Incident not found",
        });
    }

    if (
      !incident
        .environmentId
    ) {
      return res
        .status(
          409
        )
        .json({
          error:
            "Incident is missing canonical environment scope",

          code:
            "INCIDENT_ENVIRONMENT_SCOPE_MISSING",

          manualRequired:
            true,
        });
    }

    const organizationId =
      String(
        incident
          .organizationId ||
        tenantId
      );

    const environmentId =
      String(
        incident
          .environmentId
      );

    const correlationId =
      req.body
        ?.correlationId ||
      incident
        .correlationGroupId ||
      incident
        .correlationId ||
      uuidv4();

    // ========================================================================
    // 1. CANONICAL DIAGNOSIS
    // ========================================================================

    /*
     * Explicit user-requested analysis intentionally calls runDiagnosis()
     * directly instead of debounce-aware lifecycle callbacks.
     *
     * POST /analyze and /retry-analysis mean the authorized caller explicitly
     * requested a new diagnosis revision.
     */
    const diagnosisResult =
      await diagnosisLifecycleService
        .runDiagnosis({
          organizationId,

          environmentId,

          incidentId:
            incident
              ._id
              .toString(),

          reason:
            req.path
              ?.includes(
                "retry-analysis"
              )
              ? "manual_retry_analysis"
              : "manual_analysis",
        });

    if (
      !diagnosisResult
        ?.canonicalResult
    ) {
      throw new Error(
        "Diagnosis lifecycle completed without canonical result"
      );
    }

    // ========================================================================
    // 2. RECOVERY PLANNING / ASSURANCE CONTINUATION
    // ========================================================================

    const orchestrator =
      getAgentOrchestratorInstance();

    const {
      runRecord,
    } =
      await orchestrator
        .continueFromDiagnosis({
          canonicalResult:
            diagnosisResult
              .canonicalResult,

          tenantId,

          organizationId,

          environmentId,

          correlationId,

          environment:
            incident
              .environment ||
            null,

          resource: {
            namespace:
              incident
                .evidence
                ?.namespace ||
              incident
                .signal
                ?.namespace ||
              null,

            pod:
              incident
                .evidence
                ?.pod ||
              incident
                .signal
                ?.pod ||
              null,

            deployment:
              incident
                .evidence
                ?.deployment ||
              incident
                .signal
                ?.deployment ||
              null,

            cluster:
              incident
                .evidence
                ?.cluster ||
              incident
                .signal
                ?.cluster ||
              null,
          },
        });

    if (
      !runRecord
    ) {
      throw new Error(
        "AgentOrchestrator continuation completed without returning a run record"
      );
    }

    // ========================================================================
    // 3. PERSIST RECOVERY/POST-DIAGNOSIS INTELLIGENCE TRACE
    // ========================================================================

    await AgentIntelligenceRun
      .create({
        runId:
          runRecord
            .runId,

        incidentId:
          runRecord
            .incidentId,

        correlationId:
          runRecord
            .correlationId,

        tenantId,

        organizationId,

        environmentId,

        state:
          runRecord
            .state,

        startedAt:
          runRecord
            .startedAt
            ? new Date(
                runRecord
                  .startedAt
              )
            : new Date(),

        completedAt:
          runRecord
            .completedAt
            ? new Date(
                runRecord
                  .completedAt
              )
            : null,

        manualRequired:
          Boolean(
            runRecord
              .manualRequired
          ),

        manualReason:
          runRecord
            .manualReason ||
          null,

        error:
          runRecord
            .error ||
          null,

        agentTrace:
          _safeTrace(
            runRecord
              .agentTrace
          ),

        // ====================================================================
        // PHASE 12.12 - 12.14
        // ====================================================================

        decisionTraceSchemaVersion:
          "12.14-v1",

        decisionTrace:
          runRecord
            .decisionTrace ||
          null,

        budgetUsage:
          runRecord
            .budgetUsage ||
          null,

        securityFindings:
          runRecord
            .securityFindings ||
          [],

        // ====================================================================
        // EXISTING EXECUTION / EXPLANATION SUMMARY
        // ====================================================================

        playbookExecutionId:
          runRecord
            .executionResult
            ?.execution
            ?.executionId ||
          runRecord
            .executionResult
            ?.executionId ||
          null,

        explanationTitle:
          runRecord
            .explanationResult
            ?.title ||
          null,

        finalOutcome:
          runRecord
            .executionResult
            ?.outcome ||
          (
            runRecord
              .manualRequired
              ? "MANUAL_REQUIRED"
              : null
          ),

        learningCount:
          Array.isArray(
            runRecord
              .learningResult
              ?.recommendations
          )
            ? runRecord
                .learningResult
                .recommendations
                .length
            : 0,
      });

    // ========================================================================
    // 4. RESPONSE
    // ========================================================================

    return res
      .status(
        202
      )
      .json({
        runId:
          runRecord
            .runId,

        diagnosisRunId:
          diagnosisResult
            .runId,

        diagnosisId:
          diagnosisResult
            .diagnosisId,

        diagnosisRevision:
          diagnosisResult
            .revision,

        diagnosisConfidence:
          diagnosisResult
            .confidence,

        diagnosisDecision:
          diagnosisResult
            .decision,

        safetyGateDecision:
          diagnosisResult
            .safetyGateDecision,

        canEvaluatePlaybook:
          diagnosisResult
            .canEvaluatePlaybook,

        incidentId:
          runRecord
            .incidentId,

        correlationId:
          runRecord
            .correlationId,

        state:
          runRecord
            .state,

        manualRequired:
          Boolean(
            runRecord
              .manualRequired
          ),

        manualReason:
          runRecord
            .manualReason ||
          null,

        outcome:
          runRecord
            .executionResult
            ?.outcome ||
          null,
      });
  } catch (
    err
  ) {
    console.error(
      "[agent-intelligence-routes] analyze error:",
      err
    );

    if (
      err.message
        ?.includes(
          "AgentOrchestrator has not been initialized"
        )
    ) {
      return res
        .status(
          503
        )
        .json({
          error:
            "Agent intelligence runtime unavailable",

          details:
            err.message,
        });
    }

    if (
      err.code ===
      "TENANT_BOUNDARY_VIOLATION"
    ) {
      return res
        .status(
          403
        )
        .json({
          error:
            "Tenant boundary violation",

          code:
            err.code,
        });
    }

    return res
      .status(
        500
      )
      .json({
        error:
          "Agent analysis failed",

        details:
          err.message,
      });
  }
}

router.post(
  '/:incidentId/analyze',
  analyzeIncident
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /incidents/:incidentId/intelligence
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/:incidentId/intelligence',
  async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const incidentId = req.params.incidentId;

      if (!tenantId) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      const run =
        await AgentIntelligenceRun.findOne({
          tenantId,
          incidentId,
        })
          .sort({ createdAt: -1 })
          .lean();

      if (!run) {
        return res.status(404).json({
          error:
            'No intelligence run found for this incident',
        });
      }

      return res.json(
        _serialiseRun(run)
      );
    } catch (err) {
      console.error(
        '[agent-intelligence-routes] intelligence retrieval error:',
        err
      );

      return res.status(500).json({
        error:
          'Failed to retrieve intelligence',
        details: err.message,
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /incidents/:incidentId/evidence
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/:incidentId/evidence',
  async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const incidentId = req.params.incidentId;

      if (!tenantId) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      const run =
        await AgentIntelligenceRun.findOne({
          tenantId,
          incidentId,
        })
          .sort({ createdAt: -1 })
          .lean();

      if (!run) {
        return res.status(404).json({
          error:
            'No intelligence run found',
        });
      }

      const investigationRecord =
        (run.agentTrace || []).find(
          (record) =>
            record.agent ===
            'InvestigationAgent'
        );

      const evidence =
        investigationRecord?.result
          ?.evidencePackage ||
        investigationRecord?.result
          ?.evidence ||
        null;

      return res.json({
        incidentId,
        evidence,
      });
    } catch (err) {
      console.error(
        '[agent-intelligence-routes] evidence retrieval error:',
        err
      );

      return res.status(500).json({
        error:
          'Failed to retrieve evidence',
        details: err.message,
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /incidents/:incidentId/diagnosis
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/:incidentId/diagnosis',
  async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const incidentId = req.params.incidentId;

      if (!tenantId) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      const run =
        await AgentIntelligenceRun.findOne({
          tenantId,
          incidentId,
        })
          .sort({ createdAt: -1 })
          .lean();

      if (!run) {
        return res.status(404).json({
          error:
            'No intelligence run found',
        });
      }

      const diagnosisRecord =
        (run.agentTrace || []).find(
          (record) =>
            record.agent ===
            'DiagnosisAgent'
        );

      const diagnosis =
        diagnosisRecord?.result
          ?.diagnosisResult ||
        diagnosisRecord?.result
          ?.diagnosis ||
        null;

      return res.json({
        incidentId,
        diagnosis,
      });
    } catch (err) {
      console.error(
        '[agent-intelligence-routes] diagnosis retrieval error:',
        err
      );

      return res.status(500).json({
        error:
          'Failed to retrieve diagnosis',
        details: err.message,
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /incidents/:incidentId/agent-trace
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/:incidentId/agent-trace',
  async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const incidentId = req.params.incidentId;

      if (!tenantId) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      const run =
        await AgentIntelligenceRun.findOne({
          tenantId,
          incidentId,
        })
          .sort({ createdAt: -1 })
          .lean();

      if (!run) {
        return res.status(404).json({
          error:
            'No intelligence run found',
        });
      }

      return res.json({
        incidentId,

        runId:
          run.runId,

        correlationId:
          run.correlationId,

        state:
          run.state,

        manualRequired:
          run.manualRequired,

        manualReason:
          run.manualReason,

        agentTrace:
          _safeTrace(
            run.agentTrace || []
          ),
      });
    } catch (err) {
      console.error(
        '[agent-intelligence-routes] agent trace retrieval error:',
        err
      );

      return res.status(500).json({
        error:
          'Failed to retrieve agent trace',
        details: err.message,
      });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /incidents/:incidentId/retry-analysis
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  '/:incidentId/retry-analysis',
  analyzeIncident
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function _safeIncidentInput(doc) {
  return {
    id:
      doc._id?.toString() ||
      doc.id ||
      null,

    type:
      doc.incidentType ||
      doc.type ||
      'unknown',

    severity:
      doc.severity ||
      'unknown',

    title:
      doc.title ||
      null,

    description:
      doc.description ||
      null,

    serviceId:
      doc.serviceId ||
      null,

    environment:
      doc.environment ||
      null,

    evidence:
      _stripSensitive(
        doc.evidence || {}
      ),

    signal:
      _stripSensitive(
        doc.signal || {}
      ),

    tags:
      Array.isArray(doc.tags)
        ? doc.tags
        : [],
  };
}

function _safeTrace(trace) {
  if (!Array.isArray(trace)) {
    return [];
  }

  return trace.map((record) => ({
    agent:
      record.agent ||
      null,

    version:
      record.version ||
      null,

    status:
      record.status ||
      null,

    startedAt:
      record.startedAt ||
      null,

    completedAt:
      record.completedAt ||
      null,

    durationMs:
      typeof record.durationMs === 'number'
        ? record.durationMs
        : null,

    confidence:
      typeof record.confidence === 'number'
        ? record.confidence
        : null,

    warnings:
      Array.isArray(record.warnings)
        ? record.warnings
        : [],

    result:
      record.result
        ? _stripSensitive(
            record.result
          )
        : null,

    fallbackUsed:
      Boolean(record.fallbackUsed),

    error:
      record.error
        ? _stripSensitiveError(
            record.error
          )
        : null,
  }));
}

function _serialiseRun(run) {
  return {
    runId:
      run.runId,

    incidentId:
      run.incidentId,

    correlationId:
      run.correlationId,

    state:
      run.state,

    startedAt:
      run.startedAt,

    completedAt:
      run.completedAt,

    manualRequired:
      Boolean(
        run.manualRequired
      ),

    manualReason:
      run.manualReason ||
      null,

    finalOutcome:
      run.finalOutcome ||
      null,

    explanationTitle:
      run.explanationTitle ||
      null,

    learningCount:
      run.learningCount || 0,

    agentCount:
      Array.isArray(
        run.agentTrace
      )
        ? run.agentTrace.length
        : 0,
  };
}

const SECRET_KEYS =
  /password|secret|token|api[_-]?key|private[_-]?key|credential|authorization|auth[_-]?header|certificate|cert/i;

function _stripSensitive(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(
      _stripSensitive
    );
  }

  if (
    typeof value !== 'object'
  ) {
    return value;
  }

  const out = {};

  for (
    const [key, nestedValue]
    of Object.entries(value)
  ) {
    if (
      SECRET_KEYS.test(key)
    ) {
      out[key] =
        '[REDACTED]';
      continue;
    }

    out[key] =
      _stripSensitive(
        nestedValue
      );
  }

  return out;
}

function _stripSensitiveError(error) {
  if (
    typeof error === 'string'
  ) {
    return error;
  }

  if (
    error instanceof Error
  ) {
    return {
      name:
        error.name,

      message:
        error.message,
    };
  }

  return _stripSensitive(
    error
  );
}

module.exports = router;