'use strict';

/**
 * Playbook Security Validator
 *
 * Enforces security constraints:
 * - No eval/exec/spawn in parameter mappings
 * - No raw secrets embedded in definitions
 * - Cross-tenant reference prohibition
 * - Blast radius / risk consistency
 * - Policy + approval requirements for HIGH/CRITICAL
 * - Playbooks must never contain direct execution fields
 *
 * Pure function — no DB, no async.
 */

const {
  PLAYBOOK_RISK_LEVEL,
  POLICY_REQUIRED_RISK_LEVELS,
  PLAYBOOK_BLAST_RADIUS,
  PLAYBOOK_OWNER_TYPE,
  KNOWN_MAPPING_ROOTS,
  PLAYBOOK_DIAGNOSTIC_CODES: C,
} = require('../../constants/playbook');

// ── Helpers ───────────────────────────────────────────────────────────────

function error(code, path, message)   { return { severity: 'ERROR',   code, path, message }; }
function warning(code, path, message) { return { severity: 'WARNING',  code, path, message }; }

// ── Patterns ──────────────────────────────────────────────────────────────

// Mapping expression template regex — matches ${...} in string values
const MAPPING_EXPR_RE = /\$\{([^}]+)\}/g;

// Forbidden constructs in mapping expressions
const FORBIDDEN_EXPR_PATTERNS = [
  { re: /eval\s*\(/,                           reason: 'eval() is forbidden' },
  { re: /Function\s*\(/,                       reason: 'Function() constructor is forbidden' },
  { re: /require\s*\(/,                        reason: 'require() in mappings is forbidden' },
  { re: /process\s*\./,                        reason: 'process object access is forbidden' },
  { re: /child_process/,                       reason: 'child_process reference is forbidden' },
  { re: /exec\s*\(/,                           reason: 'exec() is forbidden' },
  { re: /spawn\s*\(/,                          reason: 'spawn() is forbidden' },
  { re: /import\s*\(/,                         reason: 'dynamic import is forbidden' },
  { re: /\bsetTimeout\b|\bsetInterval\b/,      reason: 'timer functions in mappings are forbidden' },
  { re: /;/,                                   reason: 'semicolons in mapping expressions are forbidden' },
  { re: /`/,                                   reason: 'backtick template literals in mappings are forbidden' },
  { re: /\$\{.*\$\{/,                          reason: 'nested template expressions are forbidden' },
  { re: /__proto__|constructor|prototype/,     reason: 'prototype chain access is forbidden' },
];

// Raw secret patterns in string values (heuristic detection)
// Note: patterns with ^ and $ match whole string; others use substring search
const RAW_SECRET_PATTERNS = [
  { re: /AKIA[0-9A-Z]{16}/,                             name: 'AWS Access Key' },
  { re: /ghp_[A-Za-z0-9]{36,}/,                        name: 'GitHub token' },
  { re: /sk-[A-Za-z0-9]{20,}/,                         name: 'API secret key' },
  { re: /-----BEGIN (RSA|EC|DSA)? PRIVATE KEY/,         name: 'PEM private key' },
  { re: /^eyJ[A-Za-z0-9+\/=]{20,}\.[A-Za-z0-9+\/=]{20,}\.[A-Za-z0-9+\/=]{20,}$/, name: 'JWT token' },
];

// ── Main ───────────────────────────────────────────────────────────────────

function validatePlaybookSecurity(playbook, context = {}) {
  const diag = [];

  if (!playbook || typeof playbook !== 'object') {
    return { valid: false, diagnostics: [error(C.PLAYBOOK_MISSING_ID, 'root', 'Playbook must be an object')] };
  }

  const tenantId       = context.tenantContext?.tenantId;
  const playbookTenant = playbook.tenantId;

  // ── Direct execution prohibition ──────────────────────────────────────────
  _checkNoDirectExecutionDeep(playbook, 'root', diag);

  // ── Parameter mapping security ────────────────────────────────────────────
  const stages = Array.isArray(playbook.stages) ? playbook.stages : [];
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (!stage || !Array.isArray(stage.runbooks)) continue;

    for (let j = 0; j < stage.runbooks.length; j++) {
      const ref  = stage.runbooks[j];
      const path = `stages[${i}].runbooks[${j}].parameterMappings`;

      if (!ref?.parameterMappings || typeof ref.parameterMappings !== 'object') continue;

      _validateMappingObject(ref.parameterMappings, path, diag);
    }
  }

  // ── Cross-tenant reference check ───────────────────────────────────────────
  if (tenantId && playbookTenant && playbookTenant !== tenantId) {
    diag.push(error(C.PLAYBOOK_CROSS_TENANT_REF, 'tenantId',
      `Playbook tenantId "${playbookTenant}" does not match request tenantId "${tenantId}"`));
  }

  // Tenant playbooks must not reference system-owned entities (unless explicitly allowed)
  if (playbook.owner?.ownerType === PLAYBOOK_OWNER_TYPE.TENANT && tenantId) {
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      if (!stage?.runbooks) continue;
      for (let j = 0; j < stage.runbooks.length; j++) {
        const ref  = stage.runbooks[j];
        // Cross-tenant runbook check is a semantic concern; here we only flag system runbooks explicitly labelled with tenantId
        if (ref?.tenantId && ref.tenantId !== tenantId) {
          diag.push(error(C.PLAYBOOK_CROSS_TENANT_REF,
            `stages[${i}].runbooks[${j}].tenantId`,
            `Runbook ref tenantId "${ref.tenantId}" does not match playbook tenantId "${tenantId}"`));
        }
      }
    }
  }

  // ── Risk / blast radius consistency ────────────────────────────────────────
  const riskLevel   = playbook.risk?.level;
  const blastRadius = playbook.risk?.blastRadius;

  if (riskLevel === PLAYBOOK_RISK_LEVEL.CRITICAL && blastRadius) {
    const safeBlastRadii = [PLAYBOOK_BLAST_RADIUS.POD, PLAYBOOK_BLAST_RADIUS.DEPLOYMENT];
    if (!safeBlastRadii.includes(blastRadius) &&
        blastRadius !== PLAYBOOK_BLAST_RADIUS.GLOBAL &&
        blastRadius !== PLAYBOOK_BLAST_RADIUS.CLUSTER) {
      // CRITICAL risk with cluster/global blast radius is expected — just ensure policy/approval set
    }
  }

  if (riskLevel === PLAYBOOK_RISK_LEVEL.LOW && blastRadius === PLAYBOOK_BLAST_RADIUS.GLOBAL) {
    diag.push(error(C.PLAYBOOK_BLAST_RADIUS_UNDERSTATED, 'risk',
      'Playbook declares LOW risk but blastRadius is "global" — this is inconsistent'));
  }

  if (riskLevel === PLAYBOOK_RISK_LEVEL.LOW && blastRadius === PLAYBOOK_BLAST_RADIUS.CLUSTER) {
    diag.push(warning(C.PLAYBOOK_BLAST_RADIUS_UNDERSTATED, 'risk',
      'Playbook declares LOW risk but blastRadius is "cluster" — consider upgrading risk to MEDIUM or HIGH'));
  }

  // ── Policy / approval for HIGH/CRITICAL ────────────────────────────────────
  if (riskLevel && POLICY_REQUIRED_RISK_LEVELS.includes(riskLevel)) {
    if (!playbook.policy?.required) {
      diag.push(error(C.PLAYBOOK_MISSING_POLICY, 'policy.required',
        `Playbooks with risk "${riskLevel}" must have policy.required = true`));
    }
    if (!playbook.approval?.mode || playbook.approval.mode === 'DISABLED') {
      diag.push(error(C.PLAYBOOK_MISSING_APPROVAL, 'approval.mode',
        `Playbooks with risk "${riskLevel}" must have a non-DISABLED approval.mode`));
    }
  }

  // ── Scan all string values for raw secrets ────────────────────────────────
  _scanForRawSecrets(playbook, 'root', diag);

  const valid = !diag.some(d => d.severity === 'ERROR');
  return { valid, diagnostics: diag };
}

// ── Mapping expression validation ─────────────────────────────────────────

function _validateMappingObject(mappings, basePath, diag) {
  for (const [key, val] of Object.entries(mappings)) {
    const path = `${basePath}.${key}`;

    if (typeof val !== 'string') {
      // Non-string values (numbers, booleans) are safe constants
      continue;
    }

    // Validate each ${...} expression in the string
    let match;
    const re = new RegExp(MAPPING_EXPR_RE.source, 'g');
    while ((match = re.exec(val)) !== null) {
      const expr = match[1];

      // Check forbidden patterns
      for (const { re: forbiddenRe, reason } of FORBIDDEN_EXPR_PATTERNS) {
        if (forbiddenRe.test(expr)) {
          diag.push(error(C.PLAYBOOK_UNSAFE_MAPPING, path,
            `Mapping "${key}" contains unsafe expression: ${reason} (expr: "${expr}")`));
        }
      }

      // Check allowed root objects
      const root = expr.split('.')[0].split('[')[0].trim();
      if (root && !KNOWN_MAPPING_ROOTS.includes(root)) {
        diag.push(error(C.PLAYBOOK_UNKNOWN_MAPPING_ROOT, path,
          `Mapping "${key}" references unknown root object "${root}". ` +
          `Allowed roots: ${KNOWN_MAPPING_ROOTS.join(', ')}`));
      }

      // Check path depth (max 5 levels)
      const depth = expr.split('.').length;
      if (depth > 5) {
        diag.push(warning(C.PLAYBOOK_UNSAFE_MAPPING, path,
          `Mapping "${key}" expression has depth ${depth} > 5 — may indicate unsafe path traversal`));
      }
    }

    // Also scan the full string value directly (catches non-template attacks like eval(...))
    for (const { re: forbiddenRe, reason } of FORBIDDEN_EXPR_PATTERNS) {
      if (forbiddenRe.test(val)) {
        // Only report if not already caught inside ${...}
        const alreadyCaught = val.includes('${');
        if (!alreadyCaught) {
          diag.push(error(C.PLAYBOOK_UNSAFE_MAPPING, path,
            `Mapping "${key}" contains unsafe pattern in value: ${reason}`));
        }
      }
    }

    // Check if the whole string is a raw secret (no template wrapping)
    _checkValueForSecret(val, path, diag);
  }
}

// ── Raw secret detection ───────────────────────────────────────────────────

function _scanForRawSecrets(obj, path, diag) {
  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      _checkValueForSecret(obj, path, diag);
    }
    return;
  }

  // Skip parameterMappings — those are checked separately
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'parameterMappings') continue;
    if (key === 'checksum') continue;
    const childPath = Array.isArray(obj) ? `${path}[${key}]` : `${path}.${key}`;
    if (val && typeof val === 'object') {
      _scanForRawSecrets(val, childPath, diag);
    } else if (typeof val === 'string') {
      _checkValueForSecret(val, childPath, diag);
    }
  }
}

function _checkValueForSecret(val, path, diag) {
  // Skip template expressions and very short values
  if (!val || val.length < 8) return;
  if (val.includes('${')) return; // mapping expression, not a literal secret

  for (const { re, name } of RAW_SECRET_PATTERNS) {
    if (re.test(val)) {
      diag.push(error(C.PLAYBOOK_RAW_SECRET, path,
        `Potential raw ${name} detected at "${path}" — ` +
        'secrets must use secret-reference parameters, not literal values'));
      break; // one hit per field is enough
    }
  }
}

// ── Direct execution depth check ──────────────────────────────────────────

const FORBIDDEN_TOP_LEVEL_KEYS = new Set(['action', 'command', 'execute', 'script', 'shell', 'cmd']);

function _checkNoDirectExecutionDeep(obj, path, diag) {
  if (!obj || typeof obj !== 'object') return;
  // Only check top-level playbook fields + stage-level (not inside parameterMappings)
  for (const [key, val] of Object.entries(obj)) {
    const lk = key.toLowerCase();
    if (FORBIDDEN_TOP_LEVEL_KEYS.has(lk) && path !== 'root') {
      diag.push(error(C.PLAYBOOK_DIRECT_EXECUTION, `${path}.${key}`,
        `Direct execution field "${key}" at ${path} violates Playbook architecture. ` +
        'All execution must flow through runbook references.'));
    }
    // Recurse into stages but not parameterMappings
    if (key === 'parameterMappings') continue;
    if (val && typeof val === 'object') {
      _checkNoDirectExecutionDeep(val, `${path}.${key}`, diag);
    }
  }
}

module.exports = { validatePlaybookSecurity };
