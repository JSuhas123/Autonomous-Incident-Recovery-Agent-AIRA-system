'use strict';

/**
 * Authoritative Runbook Validation Pipeline
 *
 * Orchestrates the three validation layers in order:
 *   Structural → Semantic → Security
 *
 * Contract:
 *   validateRunbook(runbook, context = {}) → PipelineResult
 *
 * PipelineResult shape:
 *   {
 *     valid:       boolean,
 *     diagnostics: readonly Diagnostic[],
 *     stages: {
 *       structural: { valid, diagnostics },
 *       semantic:   { valid, diagnostics, skipped? },
 *       security:   { valid, diagnostics, skipped? },
 *     }
 *   }
 *
 * Short-circuit rules:
 *   - Structural ERROR  → semantic and security are skipped
 *   - Semantic ERROR    → security is skipped
 *   - Structural WARNING alone does NOT prevent semantic from running
 *   - Semantic WARNING alone does NOT prevent security from running
 *
 * Validation context (all optional — dependency injection for later stages):
 *   actionRegistry, preconditionRegistry, verificationRegistry,
 *   serviceResolver, tenantContext, securityLimits, endpointAllowlist,
 *   secretReferenceSchemes, maxBlastRadius,
 *   targetLifecycle, currentLifecycle,
 *   purpose  — one of VALIDATION_PURPOSE values
 *
 * Structural validation is deliberately independent of all runtime registries.
 *
 * Diagnostic ordering: structural first, semantic second, security third.
 * Diagnostics are never mutated from what individual validators return.
 * Deduplication key: `${code}::${path}::${message}` (exact-match only).
 *
 * From this point forward, all consumers (YAML loader, REST API, Registry
 * activation, CI pipeline) MUST call validateRunbook() rather than invoking
 * individual layer validators directly.
 */

const { validateRunbookStructure } = require('./runbookStructuralValidator');
const { validateRunbookSemantics }  = require('./runbookSemanticValidator');
const { validateRunbookSecurity }   = require('./runbookSecurityValidator');
const { SEVERITY }                  = require('./validationResult');
const { RUNBOOK_LIFECYCLE }         = require('../../constants/runbook');

// ── Validation purpose (mode) ────────────────────────────────────────────────

/**
 * VALIDATION_PURPOSE is a lightweight hint that controls which lifecycle
 * strictness is applied.  It does NOT create separate validator implementations;
 * it simply drives targetLifecycle when the caller has not set one explicitly.
 *
 * AUTHORING  – saving a DRAFT; warnings are acceptable.
 * IMPORT     – importing an external definition; treated as DRAFT until promoted.
 * APPROVAL   – checking readiness for the APPROVED lifecycle.
 * ACTIVATION – checking readiness for the ACTIVE lifecycle.
 */
const VALIDATION_PURPOSE = Object.freeze({
  AUTHORING:  'AUTHORING',
  IMPORT:     'IMPORT',
  APPROVAL:   'APPROVAL',
  ACTIVATION: 'ACTIVATION',
});

// Maps each purpose to the lifecycle used for strictness decisions
const PURPOSE_LIFECYCLE = Object.freeze({
  [VALIDATION_PURPOSE.AUTHORING]:  RUNBOOK_LIFECYCLE.DRAFT,
  [VALIDATION_PURPOSE.IMPORT]:     RUNBOOK_LIFECYCLE.DRAFT,
  [VALIDATION_PURPOSE.APPROVAL]:   RUNBOOK_LIFECYCLE.APPROVED,
  [VALIDATION_PURPOSE.ACTIVATION]: RUNBOOK_LIFECYCLE.ACTIVE,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasBlockingErrors(result) {
  return result.diagnostics.some(d => d.severity === SEVERITY.ERROR);
}

/**
 * Deduplicate diagnostics by an exact key so genuinely distinct diagnostics
 * that share only a code are preserved; only exact (code+path+message) clones
 * are removed.
 */
function deduplicateDiagnostics(diagnostics) {
  const seen = new Set();
  return diagnostics.filter(d => {
    const key = `${d.code}::${d.path}::${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeSkipped() {
  return Object.freeze({ valid: false, diagnostics: Object.freeze([]), skipped: true });
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Validate a runbook through the full three-layer pipeline.
 *
 * @param {object} runbook  – plain object (from YAML parse, REST payload, DB read, etc.)
 * @param {object} context  – optional capability injection (see module header)
 * @returns {Readonly<PipelineResult>}
 */
function validateRunbook(runbook, context = {}) {
  // Resolve targetLifecycle: explicit context wins; purpose is the fallback.
  const targetLifecycle = context.targetLifecycle ||
    (context.purpose ? PURPOSE_LIFECYCLE[context.purpose] : undefined);

  const enriched = Object.assign({}, context, targetLifecycle ? { targetLifecycle } : {});

  // ── Stage 1: Structural ──────────────────────────────────────────────────
  const structural = validateRunbookStructure(runbook);

  // Short-circuit: blocking structural errors make semantic interpretation unsafe
  if (hasBlockingErrors(structural)) {
    const all = Object.freeze(deduplicateDiagnostics([...structural.diagnostics]));
    return Object.freeze({
      valid: false,
      diagnostics: all,
      stages: Object.freeze({ structural, semantic: makeSkipped(), security: makeSkipped() }),
    });
  }

  // ── Stage 2: Semantic ────────────────────────────────────────────────────
  const semantic = validateRunbookSemantics(runbook, enriched);

  // Short-circuit: blocking semantic errors make security interpretation unreliable
  if (hasBlockingErrors(semantic)) {
    const all = Object.freeze(deduplicateDiagnostics([
      ...structural.diagnostics,
      ...semantic.diagnostics,
    ]));
    return Object.freeze({
      valid: false,
      diagnostics: all,
      stages: Object.freeze({ structural, semantic, security: makeSkipped() }),
    });
  }

  // ── Stage 3: Security ────────────────────────────────────────────────────
  const security = validateRunbookSecurity(runbook, enriched);

  const all = Object.freeze(deduplicateDiagnostics([
    ...structural.diagnostics,
    ...semantic.diagnostics,
    ...security.diagnostics,
  ]));

  return Object.freeze({
    valid: structural.valid && semantic.valid && security.valid,
    diagnostics: all,
    stages: Object.freeze({ structural, semantic, security }),
  });
}

module.exports = { validateRunbook, VALIDATION_PURPOSE };
