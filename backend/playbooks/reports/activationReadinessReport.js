'use strict';

/**
 * AIRA Activation Readiness Report
 *
 * Read-only analyser that inspects the current state of:
 *   - ActionHandlerRegistry  — which action types/actions are implemented
 *   - RunbookRegistry        — runbook lifecycle, steps, handler coverage
 *   - PlaybookRegistry       — playbook lifecycle, referenced runbooks, stage validity
 *
 * Does NOT mutate any lifecycle state.
 * Does NOT throw on partial data — reports blockers instead.
 *
 * Usage:
 *   const { generateReadinessReport } = require('./activationReadinessReport');
 *   const report = await generateReadinessReport();
 */

const { getActionHandlerRegistry }            = require('../../runbooks/actions/actionHandlerRegistry');
const { getRunbookRegistry }                  = require('../../runbooks/registry/runbookRegistry');
const { getPlaybookRegistry }                 = require('../registry/playbookRegistry');
const { RUNBOOK_LIFECYCLE }                   = require('../../constants/runbook');
const { PLAYBOOK_LIFECYCLE }                  = require('../../constants/playbook');

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a full activation readiness report.
 *
 * @param {object} options
 * @param {object} [options.actionRegistry]   — override for tests
 * @param {object} [options.runbookRegistry]  — override for tests
 * @param {object} [options.playbookRegistry] — override for tests
 * @param {string} [options.tenantId]
 * @returns {Promise<ReadinessReport>}
 */
async function generateReadinessReport(options = {}) {
  const actionReg   = options.actionRegistry   || getActionHandlerRegistry();
  const runbookReg  = options.runbookRegistry  || getRunbookRegistry();
  const playbookReg = options.playbookRegistry || getPlaybookRegistry();
  const tenantId    = options.tenantId || null;

  const implementedHandlers = new Set(actionReg.keys());

  // ── Gather all runbooks ─────────────────────────────────────────────────
  const allRunbooks   = await _listAll(runbookReg, tenantId);
  const runbookReport = allRunbooks.map(rb => _analyseRunbook(rb, implementedHandlers));

  // Build map: runbookId → { lifecycle, versions, ready }
  const runbookReadyMap = _buildRunbookReadyMap(runbookReport);

  // ── Gather all playbooks ────────────────────────────────────────────────
  const allPlaybooks   = await _listAllPlaybooks(playbookReg, tenantId);
  const playbookReport = allPlaybooks.map(pb =>
    _analysePlaybook(pb, runbookReadyMap, implementedHandlers),
  );

  // ── Summary ─────────────────────────────────────────────────────────────
  const summary = _buildSummary(runbookReport, playbookReport, implementedHandlers);

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    summary,
    runbooks:  runbookReport,
    playbooks: playbookReport,
  };
}

// ── Runbook analysis ───────────────────────────────────────────────────────

function _analyseRunbook(rb, implementedHandlers) {
  const steps          = rb.steps || [];
  const requiredActions = steps.map(s => `${s.type}/${s.action}`);
  const implemented    = requiredActions.filter(k => implementedHandlers.has(k));
  const missing        = requiredActions.filter(k => !implementedHandlers.has(k));

  const hasVerification = !!(rb.verification?.checks?.length);
  const hasRollback     = !!(rb.rollbackConfig && rb.rollbackConfig.strategy !== 'NONE');
  const hasPolicy       = !!(rb.approvalConfig || rb.policy);

  const blockers = [];
  if (rb.lifecycle === RUNBOOK_LIFECYCLE.DRAFT) {
    blockers.push(`Lifecycle is DRAFT — must be promoted to ACTIVE via DRAFT→VALIDATED→APPROVED→ACTIVE`);
  }
  if (missing.length > 0) {
    blockers.push(`Missing action handlers: ${missing.join(', ')}`);
  }

  const ready = blockers.length === 0 && rb.lifecycle === RUNBOOK_LIFECYCLE.ACTIVE;

  return {
    runbookId:        rb.runbookId,
    semver:           rb.semver,
    name:             rb.name,
    lifecycle:        rb.lifecycle,
    stepCount:        steps.length,
    requiredActions:  [...new Set(requiredActions)],
    implementedActions: [...new Set(implemented)],
    missingActions:   [...new Set(missing)],
    verificationSupport: hasVerification,
    rollbackSupport:     hasRollback,
    policySupport:       hasPolicy,
    status:           ready ? 'ACTIVE_READY' : 'NOT_ACTIVE_READY',
    blockers,
  };
}

// ── Playbook analysis ──────────────────────────────────────────────────────

function _analysePlaybook(pb, runbookReadyMap, implementedHandlers) {
  const stages = pb.stages || [];

  // Collect all runbook references
  const runbookRefs = [];
  for (const stage of stages) {
    for (const ref of (stage.runbooks || [])) {
      runbookRefs.push({ stageId: stage.id || stage.stageId, runbookId: ref.runbookId, required: ref.required !== false });
    }
  }

  const uniqueRunbookIds    = [...new Set(runbookRefs.map(r => r.runbookId))];
  const runbookStatuses     = uniqueRunbookIds.map(id => ({
    runbookId: id,
    ...( runbookReadyMap.get(id) || { found: false, lifecycle: 'NOT_FOUND', ready: false }),
  }));

  const missingRunbooks  = runbookStatuses.filter(r => !r.found);
  const draftRunbooks    = runbookStatuses.filter(r => r.found && r.lifecycle !== RUNBOOK_LIFECYCLE.ACTIVE);
  const missingHandlers  = runbookStatuses
    .filter(r => r.found)
    .flatMap(r => r.missingActions || []);

  const hasVerification = stages.some(s => s.type === 'VERIFICATION');
  const hasRollback     = stages.some(s => s.type === 'ROLLBACK') ||
                          !!(pb.rollback?.strategy && pb.rollback.strategy !== 'NONE');
  const hasEscalation   = stages.some(s => s.type === 'ESCALATION') || !!(pb.escalation);

  const blockers = [];

  if (pb.lifecycle === PLAYBOOK_LIFECYCLE.DRAFT) {
    blockers.push(`Lifecycle is DRAFT`);
  } else if (pb.lifecycle === PLAYBOOK_LIFECYCLE.VALIDATED) {
    blockers.push(`Lifecycle is VALIDATED — needs APPROVED → ACTIVE`);
  } else if (pb.lifecycle === PLAYBOOK_LIFECYCLE.APPROVED) {
    blockers.push(`Lifecycle is APPROVED — needs activation (all runbooks must be ACTIVE)`);
  } else if ([PLAYBOOK_LIFECYCLE.DEPRECATED, PLAYBOOK_LIFECYCLE.DISABLED].includes(pb.lifecycle)) {
    blockers.push(`Lifecycle is ${pb.lifecycle} — not executable`);
  }

  if (missingRunbooks.length > 0) {
    blockers.push(`Missing runbooks: ${missingRunbooks.map(r => r.runbookId).join(', ')}`);
  }

  if (draftRunbooks.length > 0) {
    blockers.push(
      `Referenced runbooks not ACTIVE: ${draftRunbooks.map(r => `${r.runbookId}@${r.lifecycle}`).join(', ')}`,
    );
  }

  if (missingHandlers.length > 0) {
    const unique = [...new Set(missingHandlers)];
    blockers.push(`Referenced runbooks have missing handlers: ${unique.join(', ')}`);
  }

  if (!hasVerification) {
    blockers.push(`No VERIFICATION stage defined`);
  }

  const ready = blockers.length === 0 && pb.lifecycle === PLAYBOOK_LIFECYCLE.ACTIVE;

  return {
    playbookId:            pb.playbookId,
    semver:                pb.semver,
    name:                  pb.name,
    lifecycle:             pb.lifecycle,
    category:              pb.category || _inferCategory(pb.playbookId),
    stageCount:            stages.length,
    referencedRunbooks:    uniqueRunbookIds,
    runbookStatuses,
    missingRunbooks:       missingRunbooks.map(r => r.runbookId),
    missingHandlers:       [...new Set(missingHandlers)],
    parameterMappingValid: _checkParameterMappings(pb),
    verificationSupport:   hasVerification,
    rollbackSupport:       hasRollback,
    escalationSupport:     hasEscalation,
    riskLevel:             pb.risk?.level || 'UNKNOWN',
    approvalMode:          pb.approval?.mode || 'UNKNOWN',
    status:                ready ? 'ACTIVE_READY' : 'NOT_ACTIVE_READY',
    blockers,
  };
}

// ── Summary builder ───────────────────────────────────────────────────────

function _buildSummary(runbookReport, playbookReport, implementedHandlers) {
  return {
    runbooks: {
      total:        runbookReport.length,
      activeReady:  runbookReport.filter(r => r.status === 'ACTIVE_READY').length,
      notReady:     runbookReport.filter(r => r.status === 'NOT_ACTIVE_READY').length,
      byLifecycle:  _countBy(runbookReport, 'lifecycle'),
    },
    playbooks: {
      total:        playbookReport.length,
      activeReady:  playbookReport.filter(p => p.status === 'ACTIVE_READY').length,
      notReady:     playbookReport.filter(p => p.status === 'NOT_ACTIVE_READY').length,
      byLifecycle:  _countBy(playbookReport, 'lifecycle'),
      byCategory:   _countBy(playbookReport, 'category'),
    },
    handlers: {
      total:       implementedHandlers.size,
      implemented: [...implementedHandlers],
    },
    overallReady: playbookReport.every(p => p.status === 'ACTIVE_READY') &&
                  runbookReport.every(r => r.status === 'ACTIVE_READY'),
    productionBlockers: [
      ...runbookReport.filter(r => r.status === 'NOT_ACTIVE_READY').flatMap(r =>
        r.blockers.map(b => `[RB] ${r.runbookId}: ${b}`)
      ),
      ...playbookReport.filter(p => p.status === 'NOT_ACTIVE_READY').flatMap(p =>
        p.blockers.slice(0, 2).map(b => `[PB] ${p.playbookId}: ${b}`)
      ),
    ].slice(0, 50), // cap at 50 for readability
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function _listAll(runbookReg, tenantId) {
  try {
    // RunbookRegistry.list() — different API signature than Playbook
    if (typeof runbookReg.list === 'function') {
      return await runbookReg.list({ tenantId }) || [];
    }
    return [];
  } catch {
    return [];
  }
}

async function _listAllPlaybooks(playbookReg, tenantId) {
  try {
    // List all lifecycles by omitting lifecycle filter
    const lifecycles = ['DRAFT', 'VALIDATED', 'APPROVED', 'ACTIVE', 'DEPRECATED', 'DISABLED'];
    const results = await Promise.all(
      lifecycles.map(lc =>
        playbookReg.list({ tenantId, lifecycle: lc }).catch(() => []),
      ),
    );
    return results.flat();
  } catch {
    return [];
  }
}

function _buildRunbookReadyMap(runbookReport) {
  const map = new Map();
  for (const rb of runbookReport) {
    const existing = map.get(rb.runbookId);
    // Keep latest semver (simple string compare sufficient for semver x.y.z)
    if (!existing || rb.semver > existing.semver) {
      map.set(rb.runbookId, {
        found:          true,
        semver:         rb.semver,
        lifecycle:      rb.lifecycle,
        missingActions: rb.missingActions,
        ready:          rb.status === 'ACTIVE_READY',
      });
    }
  }
  return map;
}

function _checkParameterMappings(pb) {
  // Lightweight check: ensure no obviously broken ${} references exist
  const text = JSON.stringify(pb.stages || []);
  const refs = text.match(/\$\{[^}]+\}/g) || [];
  const broken = refs.filter(r => {
    const path = r.slice(2, -1).trim();
    // Allow well-formed paths: word.word.word (optionally nested)
    return !/^[\w]+(?:\.[\w]+)*$/.test(path);
  });
  return broken.length === 0;
}

function _inferCategory(playbookId) {
  if (!playbookId) return 'unknown';
  const id = playbookId.toUpperCase();
  if (id.includes('K8S')) return 'kubernetes';
  if (id.includes('CONTAINER')) return 'containers';
  if (id.includes('DB')) return 'databases';
  if (id.includes('NET')) return 'networking';
  if (id.includes('OBS')) return 'observability';
  if (id.includes('API') || id.includes('RATELIMIT')) return 'incident-management';
  if (id.includes('CACHE') || id.includes('MQ')) return 'infrastructure';
  return 'general';
}

function _countBy(arr, field) {
  return arr.reduce((acc, item) => {
    const key = item[field] || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

module.exports = { generateReadinessReport };
