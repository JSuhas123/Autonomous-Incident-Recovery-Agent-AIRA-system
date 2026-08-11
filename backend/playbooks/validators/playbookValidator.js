'use strict';

/**
 * Unified Playbook Validator
 *
 * Orchestrates structural → semantic → security validation.
 * Purpose-gated: severity thresholds increase from AUTHORING → ACTIVATION.
 */

const { validatePlaybookStructure }  = require('./playbookStructuralValidator');
const { validatePlaybookSemantics }  = require('./playbookSemanticValidator');
const { validatePlaybookSecurity }   = require('./playbookSecurityValidator');
const {
  PLAYBOOK_VALIDATION_PURPOSE,
  VALIDATION_PURPOSE_SEVERITY,
  PLAYBOOK_DIAGNOSTIC_CODES: C,
} = require('../../constants/playbook');

/**
 * @param {object} playbook - The raw playbook definition object
 * @param {object} [options]
 * @param {string} [options.purpose]            - PLAYBOOK_VALIDATION_PURPOSE value
 * @param {object} [options.runbookRegistry]    - RunbookRegistry instance (optional)
 * @param {object} [options.tenantContext]      - { tenantId, orgId, ... }
 * @returns {Promise<{ valid, diagnostics, summary }>}
 */
async function validatePlaybook(playbook, options = {}) {
  const purpose = options.purpose || PLAYBOOK_VALIDATION_PURPOSE.AUTHORING;
  const context = { purpose, runbookRegistry: options.runbookRegistry, tenantContext: options.tenantContext };

  // ── Phase 1: Structural ────────────────────────────────────────────────────
  const structResult = validatePlaybookStructure(playbook);
  const diag = [...structResult.diagnostics];

  // If structural validation has critical errors, stop early
  const criticalStructErrors = structResult.diagnostics.filter(d => d.severity === 'ERROR');
  if (criticalStructErrors.length > 0 && _shouldAbortEarly(criticalStructErrors)) {
    return _buildResult(diag, purpose);
  }

  // ── Phase 2: Semantic ──────────────────────────────────────────────────────
  const semResult = await validatePlaybookSemantics(playbook, context);
  diag.push(...semResult.diagnostics);

  // ── Phase 3: Security ──────────────────────────────────────────────────────
  const secResult = validatePlaybookSecurity(playbook, context);
  diag.push(...secResult.diagnostics);

  return _buildResult(diag, purpose);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Abort structural validation early if fundamental fields are missing
 * (playbookId, stages, kind) — semantic/security would produce noise.
 */
function _shouldAbortEarly(errors) {
  const earlyAbortCodes = new Set([
    C.PLAYBOOK_MISSING_ID,
    C.PLAYBOOK_INVALID_ID,
    C.PLAYBOOK_MISSING_STAGES,
    C.PLAYBOOK_EMPTY_STAGES,
    C.PLAYBOOK_INVALID_KIND,
  ]);
  return errors.some(e => earlyAbortCodes.has(e.code));
}

function _buildResult(diagnostics, purpose) {
  const errors   = diagnostics.filter(d => d.severity === 'ERROR');
  const warnings = diagnostics.filter(d => d.severity === 'WARNING');
  const infos    = diagnostics.filter(d => d.severity === 'INFO');

  // For ACTIVATION purpose: warnings about missing required runbooks are promoted to errors
  // (handled in validators themselves; no extra promotion needed here)

  const valid = errors.length === 0;

  const summary = {
    purpose,
    errorCount:   errors.length,
    warningCount: warnings.length,
    infoCount:    infos.length,
    codes: diagnostics.map(d => d.code),
    hasError: errors.length > 0,
  };

  return { valid, diagnostics, summary };
}

/**
 * Convenience: validate for authoring (lenient, no registry)
 */
async function validateForAuthoring(playbook) {
  return validatePlaybook(playbook, { purpose: PLAYBOOK_VALIDATION_PURPOSE.AUTHORING });
}

/**
 * Convenience: validate for activation (strict, requires registry)
 */
async function validateForActivation(playbook, runbookRegistry, tenantContext) {
  return validatePlaybook(playbook, {
    purpose: PLAYBOOK_VALIDATION_PURPOSE.ACTIVATION,
    runbookRegistry,
    tenantContext,
  });
}

module.exports = {
  validatePlaybook,
  validateForAuthoring,
  validateForActivation,
};
