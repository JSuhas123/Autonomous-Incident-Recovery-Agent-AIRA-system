'use strict';

/**
 * Playbook Semantic Validator
 *
 * Validates coherence, completeness, and registry-level correctness.
 * Accepts optional injected runbookRegistry for ACTIVE/APPROVAL validation.
 * Pure function, async only when registry is provided.
 */

const {
  PLAYBOOK_LIFECYCLE,
  PLAYBOOK_STAGE_TYPE,
  STAGE_TYPE_NATURAL_ORDER,
  POLICY_REQUIRED_RISK_LEVELS,
  PLAYBOOK_VALIDATION_PURPOSE,
  PLAYBOOK_DIAGNOSTIC_CODES: C,
  PLAYBOOK_ROLLBACK_STRATEGY,
} = require('../../constants/playbook');

// Semver range — only support exact ("1.0.0"), ">=X.Y.Z", "~X.Y.Z", or null/latest
const SEMVER_CONSTRAINT_RE = /^(>=|~|=)?(\d+)\.(\d+)\.(\d+)(-[\w.]+)?$/;

// ── Helpers ────────────────────────────────────────────────────────────────

function error(code, path, message)   { return { severity: 'ERROR',   code, path, message }; }
function warning(code, path, message) { return { severity: 'WARNING',  code, path, message }; }
function info(code, path, message)    { return { severity: 'INFO',     code, path, message }; }

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * @param {object} playbook
 * @param {object} context - { purpose, runbookRegistry, tenantContext }
 * @returns {{ valid, diagnostics }}
 */
async function validatePlaybookSemantics(playbook, context = {}) {
  const diag     = [];
  const purpose  = context.purpose || PLAYBOOK_VALIDATION_PURPOSE.AUTHORING;
  const registry = context.runbookRegistry || null;

  // Abort on obviously broken input (structural validator should have caught these)
  if (!playbook || typeof playbook !== 'object') {
    return { valid: false, diagnostics: [error(C.PLAYBOOK_MISSING_ID, 'root', 'Playbook must be an object')] };
  }

  const isProduction = [
    PLAYBOOK_VALIDATION_PURPOSE.APPROVAL,
    PLAYBOOK_VALIDATION_PURPOSE.ACTIVATION,
  ].includes(purpose);

  const isActivation = purpose === PLAYBOOK_VALIDATION_PURPOSE.ACTIVATION;

  // ── Stage ordering ────────────────────────────────────────────────────────

  const stages = Array.isArray(playbook.stages) ? playbook.stages : [];
  const stageById = {};
  stages.forEach(s => { if (s?.id) stageById[s.id] = s; });

  if (stages.length > 0) {
    const orders = stages.map(s => Number(s.order)).filter(n => Number.isInteger(n) && n > 0);
    const minOrder = Math.min(...orders);
    if (minOrder !== 1) {
      diag.push(warning(C.PLAYBOOK_STAGE_ORDER_GAP, 'stages',
        `Stage ordering should start at 1 (found minimum order: ${minOrder})`));
    }

    // Warn if RECOVERY appears before INVESTIGATION
    const investigationOrders = stages
      .filter(s => s.type === PLAYBOOK_STAGE_TYPE.INVESTIGATION)
      .map(s => s.order);
    const recoveryOrders = stages
      .filter(s => s.type === PLAYBOOK_STAGE_TYPE.RECOVERY)
      .map(s => s.order);

    if (investigationOrders.length > 0 && recoveryOrders.length > 0) {
      const maxInv = Math.max(...investigationOrders);
      const minRec = Math.min(...recoveryOrders);
      if (minRec < maxInv) {
        diag.push(warning(C.PLAYBOOK_INVALID_STAGE, 'stages',
          'RECOVERY stage appears before INVESTIGATION stage — verify intent'));
      }
    }
  }

  // ── For APPROVAL/ACTIVATION: require at least one RECOVERY/MITIGATION stage ─

  if (isProduction) {
    const hasRecovery = stages.some(s =>
      s.type === PLAYBOOK_STAGE_TYPE.RECOVERY || s.type === PLAYBOOK_STAGE_TYPE.MITIGATION);
    if (!hasRecovery) {
      diag.push(warning(C.PLAYBOOK_MISSING_RECOVERY_STAGE, 'stages',
        'Playbook has no RECOVERY or MITIGATION stage — is this intentional?'));
    }
  }

  // ── Runbook references ────────────────────────────────────────────────────

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (!stage || !Array.isArray(stage.runbooks)) continue;

    for (let j = 0; j < stage.runbooks.length; j++) {
      const ref  = stage.runbooks[j];
      const path = `stages[${i}].runbooks[${j}]`;

      if (!ref?.runbookId) continue;

      // Validate version constraint format
      if (ref.versionConstraint != null && ref.versionConstraint !== '') {
        if (!SEMVER_CONSTRAINT_RE.test(String(ref.versionConstraint))) {
          diag.push(error(C.PLAYBOOK_UNRESOLVABLE_VERSION, `${path}.versionConstraint`,
            `versionConstraint "${ref.versionConstraint}" is not a valid semver constraint`));
        }
      }

      // Registry-based checks (only when registry is available)
      if (registry) {
        await _checkRunbookRef(ref, path, isActivation, registry, context.tenantContext, diag);
      }
    }
  }

  // ── Rollback stage references ──────────────────────────────────────────────

  if (playbook.rollback?.strategy === PLAYBOOK_ROLLBACK_STRATEGY.STAGE_ROLLBACK) {
    const rollbackStageIds = playbook.rollback.stages || [];
    for (const sid of rollbackStageIds) {
      if (!stageById[sid]) {
        diag.push(error(C.PLAYBOOK_ROLLBACK_STAGE_NOT_FOUND, 'rollback.stages',
          `Rollback references stage "${sid}" which does not exist`));
      }
    }
  }

  // ── Escalation ──────────────────────────────────────────────────────────────

  if (playbook.escalation) {
    const maxAttempts = Number(playbook.escalation.maxRecoveryAttempts);
    if (playbook.escalation.maxRecoveryAttempts != null && (!Number.isFinite(maxAttempts) || maxAttempts < 1)) {
      diag.push(error(C.PLAYBOOK_ESCALATION_INVALID, 'escalation.maxRecoveryAttempts',
        'escalation.maxRecoveryAttempts must be a positive number'));
    }
  }

  // ── Policy / approval requirements for HIGH/CRITICAL risk ──────────────────

  if (isProduction && playbook.risk?.level) {
    const level = playbook.risk.level;
    if (POLICY_REQUIRED_RISK_LEVELS.includes(level)) {
      if (!playbook.policy?.required) {
        diag.push(error(C.PLAYBOOK_MISSING_POLICY, 'policy.required',
          `risk.level "${level}" requires policy.required = true`));
      }
      if (!playbook.approval?.mode || playbook.approval.mode === 'DISABLED') {
        diag.push(error(C.PLAYBOOK_MISSING_APPROVAL, 'approval.mode',
          `risk.level "${level}" requires approval.mode to be configured`));
      }
    }
  }

  // ── Trigger structure ──────────────────────────────────────────────────────

  const triggers = playbook.triggers;
  if (triggers) {
    for (const key of ['all', 'any', 'none']) {
      if (triggers[key] != null && !Array.isArray(triggers[key])) {
        diag.push(error(C.PLAYBOOK_INVALID_STAGE, `triggers.${key}`,
          `triggers.${key} must be an array`));
      }
    }
  }

  // ── Required evidence ──────────────────────────────────────────────────────

  if (isActivation && Array.isArray(playbook.requiredEvidence)) {
    for (const field of playbook.requiredEvidence) {
      if (typeof field !== 'string' || field.trim() === '') {
        diag.push(error(C.PLAYBOOK_INVALID_EVIDENCE, 'requiredEvidence',
          `requiredEvidence must contain non-empty strings, got: "${field}"`));
      }
    }
  }

  const valid = !diag.some(d => d.severity === 'ERROR');
  return { valid, diagnostics: diag };
}

// ── Registry-backed runbook ref check ─────────────────────────────────────

async function _checkRunbookRef(ref, path, isActivation, registry, tenantContext, diag) {
  const tenantId = tenantContext?.tenantId;

  try {
    // Get all versions to check existence
    const versions = await registry.getById(ref.runbookId, tenantId);

    if (!versions || versions.length === 0) {
      diag.push(error(C.PLAYBOOK_RUNBOOK_NOT_FOUND, `${path}.runbookId`,
        `Runbook "${ref.runbookId}" not found in registry`));
      return;
    }

    // Resolve version constraint
    const resolvedVersion = _resolveVersionConstraint(ref.versionConstraint, versions.map(v => v.semver));
    if (!resolvedVersion) {
      diag.push(error(C.PLAYBOOK_UNRESOLVABLE_VERSION, `${path}.versionConstraint`,
        `Cannot resolve version constraint "${ref.versionConstraint}" for runbook "${ref.runbookId}"`));
      return;
    }

    const runbook = versions.find(v => v.semver === resolvedVersion);
    if (!runbook) {
      diag.push(error(C.PLAYBOOK_RUNBOOK_NOT_FOUND, `${path}.runbookId`,
        `Runbook ${ref.runbookId}@${resolvedVersion} not found`));
      return;
    }

    // ACTIVATION: required runbooks must be ACTIVE and executable
    if (isActivation && ref.required) {
      if (runbook.lifecycle !== 'ACTIVE') {
        diag.push(error(C.PLAYBOOK_RUNBOOK_NOT_ACTIVE, `${path}.runbookId`,
          `Required runbook "${ref.runbookId}@${resolvedVersion}" lifecycle is "${runbook.lifecycle}", not ACTIVE`));
      }
    }

  } catch (e) {
    if (e?.code === 'NOT_FOUND') {
      diag.push(error(C.PLAYBOOK_RUNBOOK_NOT_FOUND, `${path}.runbookId`,
        `Runbook "${ref.runbookId}" not found in registry`));
    } else {
      diag.push(warning(C.PLAYBOOK_RUNBOOK_NOT_FOUND, `${path}.runbookId`,
        `Registry lookup failed for "${ref.runbookId}": ${e.message}`));
    }
  }
}

// ── Version constraint resolver ───────────────────────────────────────────

function _resolveVersionConstraint(constraint, availableVersions) {
  if (!availableVersions || availableVersions.length === 0) return null;

  // null / undefined / empty → latest
  if (!constraint || constraint === '') {
    return _getLatestFrom(availableVersions);
  }

  const m = String(constraint).match(/^(>=|~|=)?(\d+\.\d+\.\d+.*)$/);
  if (!m) return null;

  const op      = m[1] || '=';
  const version = m[2];

  if (op === '=' || op === '') {
    return availableVersions.includes(version) ? version : null;
  }

  if (op === '>=') {
    const eligible = availableVersions.filter(v => _semverCompare(v, version) >= 0);
    return eligible.length > 0 ? _getLatestFrom(eligible) : null;
  }

  if (op === '~') {
    // Patch-level compatibility
    const [major, minor] = version.split('.');
    const eligible = availableVersions.filter(v => {
      const [vMaj, vMin] = v.split('.');
      return vMaj === major && vMin === minor && _semverCompare(v, version) >= 0;
    });
    return eligible.length > 0 ? _getLatestFrom(eligible) : null;
  }

  return null;
}

function _getLatestFrom(versions) {
  return versions.reduce((best, v) => _semverCompare(v, best) > 0 ? v : best);
}

function _semverCompare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  }
  return 0;
}

module.exports = {
  validatePlaybookSemantics,
  _resolveVersionConstraint,
};
