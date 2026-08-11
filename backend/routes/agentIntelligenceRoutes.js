'use strict';

/**
 * Agent Intelligence API Routes
 *
 * Endpoints for the 8-agent intelligence platform.
 *
 * SECURITY:
 * - All routes respect existing auth/tenant/RBAC middleware
 * - No caller can run arbitrary agent tools
 * - No arbitrary Playbook IDs without validation
 * - Tenant isolation enforced at every query
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const AgentIntelligenceRun = require('../models/AgentIntelligenceRun');
const { Incident } = require('../models/Incident');
const { buildAgentOrchestrator } = require('../agents/v2');
const { getIncidentPlaybookService } = require('../services/incidents/incidentPlaybookService');
const { memoryService } = require('../services/learning');

// ── POST /incidents/:id/analyze ────────────────────────────────────────────

router.post('/:incidentId/analyze', async (req, res) => {
  try {
    const tenantId   = req.auth?.tenantId;
    const incidentId = req.params.incidentId;

    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const incident = await Incident.findOne({
      _id:            incidentId,
      organizationId: tenantId,
    }).lean();

    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const correlationId = req.body?.correlationId || uuidv4();

    // Build orchestrator with frozen V1 services
    const orchestrator = buildAgentOrchestrator(
      {
        incidentPlaybookService: getIncidentPlaybookService(),
        memoryService,
      },
      {
        dryRun:         req.body?.dryRun === true,
        agentTimeoutMs: 30_000,
      },
    );

    const { runRecord, context } = await orchestrator.run({
      incidentId:    incident._id.toString(),
      correlationId,
      tenantId,
      incident:      _safeIncidentInput(incident),
      signals:       req.body?.signals  || [],
      alerts:        req.body?.alerts   || [],
      service:       { id: incident.serviceId },
      resource:      { namespace: incident.evidence?.namespace, pod: incident.evidence?.pod },
      environment:   incident.environment,
    });

    // Persist run record
    const run = await AgentIntelligenceRun.create({
      runId:               runRecord.runId,
      incidentId:          runRecord.incidentId,
      correlationId:       runRecord.correlationId,
      tenantId,
      state:               runRecord.state,
      startedAt:           new Date(runRecord.startedAt),
      completedAt:         runRecord.completedAt ? new Date(runRecord.completedAt) : null,
      manualRequired:      runRecord.manualRequired,
      manualReason:        runRecord.manualReason,
      error:               runRecord.error,
      agentTrace:          _safeTrace(runRecord.agentTrace),
      playbookExecutionId: runRecord.executionResult?.execution?.executionId || null,
      explanationTitle:    runRecord.explanationResult?.title || null,
      finalOutcome:        runRecord.executionResult?.outcome || (runRecord.manualRequired ? 'MANUAL_REQUIRED' : null),
      learningCount:       (runRecord.learningResult?.recommendations || []).length,
    });

    return res.status(202).json({
      runId:         runRecord.runId,
      state:         runRecord.state,
      manualRequired:runRecord.manualRequired,
      manualReason:  runRecord.manualReason,
      outcome:       runRecord.executionResult?.outcome,
    });

  } catch (err) {
    console.error('[agent-routes] analyze error:', err.message);
    return res.status(500).json({ error: 'Agent analysis failed', details: err.message });
  }
});

// ── GET /incidents/:id/intelligence ───────────────────────────────────────

router.get('/:incidentId/intelligence', async (req, res) => {
  try {
    const tenantId   = req.auth?.tenantId;
    const incidentId = req.params.incidentId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const run = await AgentIntelligenceRun.findOne({ tenantId, incidentId })
      .sort({ createdAt: -1 }).lean();

    if (!run) return res.status(404).json({ error: 'No intelligence run found for this incident' });

    return res.json(_serialiseRun(run));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve intelligence', details: err.message });
  }
});

// ── GET /incidents/:id/evidence ────────────────────────────────────────────

router.get('/:incidentId/evidence', async (req, res) => {
  try {
    const tenantId   = req.auth?.tenantId;
    const incidentId = req.params.incidentId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const run = await AgentIntelligenceRun.findOne({ tenantId, incidentId })
      .sort({ createdAt: -1 }).lean();
    if (!run) return res.status(404).json({ error: 'No intelligence run found' });

    const invRecord = (run.agentTrace || []).find(r => r.agent === 'InvestigationAgent');
    const evidence  = invRecord?.result?.evidencePackage || null;

    return res.json({ incidentId, evidence });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve evidence', details: err.message });
  }
});

// ── GET /incidents/:id/diagnosis ───────────────────────────────────────────

router.get('/:incidentId/diagnosis', async (req, res) => {
  try {
    const tenantId   = req.auth?.tenantId;
    const incidentId = req.params.incidentId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const run = await AgentIntelligenceRun.findOne({ tenantId, incidentId })
      .sort({ createdAt: -1 }).lean();
    if (!run) return res.status(404).json({ error: 'No intelligence run found' });

    const diagRecord = (run.agentTrace || []).find(r => r.agent === 'DiagnosisAgent');
    return res.json({ incidentId, diagnosis: diagRecord?.result?.diagnosisResult || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve diagnosis', details: err.message });
  }
});

// ── GET /incidents/:id/agent-trace ─────────────────────────────────────────

router.get('/:incidentId/agent-trace', async (req, res) => {
  try {
    const tenantId   = req.auth?.tenantId;
    const incidentId = req.params.incidentId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const run = await AgentIntelligenceRun.findOne({ tenantId, incidentId })
      .sort({ createdAt: -1 }).lean();
    if (!run) return res.status(404).json({ error: 'No intelligence run found' });

    return res.json({
      incidentId,
      runId:      run.runId,
      state:      run.state,
      agentTrace: _safeTrace(run.agentTrace || []),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve agent trace', details: err.message });
  }
});

// ── POST /incidents/:id/retry-analysis ────────────────────────────────────

router.post('/:incidentId/retry-analysis', async (req, res) => {
  // Delegate to analyze — creates a new run
  req.url = `/${req.params.incidentId}/analyze`;
  return router.handle(req, res, () => {});
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function _safeIncidentInput(doc) {
  return {
    id:          doc._id?.toString(),
    type:        doc.incidentType || doc.type || 'unknown',
    severity:    doc.severity,
    title:       doc.title,
    description: doc.description,
    evidence:    doc.evidence || {},
    signal:      doc.signal   || {},
    tags:        doc.tags     || [],
  };
}

function _safeTrace(trace) {
  return (trace || []).map(r => ({
    agent:       r.agent,
    version:     r.version,
    status:      r.status,
    startedAt:   r.startedAt,
    completedAt: r.completedAt,
    durationMs:  r.durationMs,
    confidence:  r.confidence,
    warnings:    r.warnings || [],
    // result is mixed — strip any potential sensitive fields
    result:      r.result ? _stripSensitive(r.result) : null,
    fallbackUsed:r.fallbackUsed,
    error:       r.error,
  }));
}

function _serialiseRun(run) {
  return {
    runId:         run.runId,
    incidentId:    run.incidentId,
    correlationId: run.correlationId,
    state:         run.state,
    startedAt:     run.startedAt,
    completedAt:   run.completedAt,
    manualRequired:run.manualRequired,
    manualReason:  run.manualReason,
    finalOutcome:  run.finalOutcome,
    explanationTitle: run.explanationTitle,
    learningCount: run.learningCount,
    agentCount:    (run.agentTrace || []).length,
  };
}

const SECRET_KEYS = /password|secret|token|key|credential|auth|cert/i;

function _stripSensitive(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      out[k] = _stripSensitive(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

module.exports = router;
