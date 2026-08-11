'use strict';

/**
 * Playbook Parameter Mapper
 *
 * Resolves parameterMappings using safe path expressions: ${root.path.to.value}
 *
 * Security rules enforced:
 *   - Only template expressions ${...} or constant scalar values
 *   - Only allowed root objects: incident, signal, context, evidence, service, constants, stage_output
 *   - Max path depth: 5 levels
 *   - Blocked path segments: __proto__, constructor, prototype
 *   - NO eval, NO Function(), NO require(), NO process.*
 *   - NO semicolons, NO backticks, NO nested ${ }
 *
 * Returns:
 *   { mapped: { paramName → resolvedValue }, missing: string[], provenance: MappingEntry[] }
 */

const { KNOWN_MAPPING_ROOTS, PLAYBOOK_DIAGNOSTIC_CODES: C } = require('../../constants/playbook');

// ── Blocked path segments ──────────────────────────────────────────────────

const BLOCKED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

// ── Max path depth ─────────────────────────────────────────────────────────

const MAX_PATH_DEPTH = 5;

// ── Expression regex ──────────────────────────────────────────────────────

const EXPR_RE = /^\$\{([^}]+)\}$/;
const CONTAINS_EXPR_RE = /\$\{([^}]+)\}/g;

// ── Main mapper ────────────────────────────────────────────────────────────

/**
 * @param {object} parameterMappings - e.g. { pod: '${incident.resource.pod}', ns: '${incident.resource.namespace}' }
 * @param {object} context           - available resolution context
 *   { incident, signal, context, evidence, service, constants, stage_output }
 * @param {object[]} runbookParams   - runbook parameter definitions (to know which are required/sensitive)
 * @returns {{ mapped, missing, provenance, errors }}
 */
function mapParameters(parameterMappings, context = {}, runbookParams = []) {
  const mapped      = {};
  const missing     = [];
  const provenance  = [];
  const errors      = [];

  if (!parameterMappings || typeof parameterMappings !== 'object') {
    return { mapped, missing, provenance, errors };
  }

  const paramDefs = _indexParamDefs(runbookParams);

  for (const [key, expr] of Object.entries(parameterMappings)) {
    const result = _resolveExpression(key, expr, context);

    if (result.error) {
      errors.push({ key, expr, error: result.error, code: result.code });

      // If this parameter is required, add to missing
      const def = paramDefs[key];
      if (!def || def.required !== false) {
        missing.push(key);
      }
      continue;
    }

    if (result.value === undefined || result.value === null || result.value === '') {
      const def = paramDefs[key];
      if (!def || def.required !== false) {
        missing.push(key);
        provenance.push({
          key,
          rawExpr:  expr,
          value:    null,
          source:   result.source,
          resolved: false,
          missing:  true,
          sensitive: def?.sensitive || false,
        });
        continue;
      }
    }

    const def = paramDefs[key];
    const sensitive = def?.sensitive || def?.type === 'secret-reference' || false;

    mapped[key] = result.value;
    provenance.push({
      key,
      rawExpr:  expr,
      value:    sensitive ? '[REDACTED]' : result.value,
      source:   result.source,
      resolved: true,
      missing:  false,
      sensitive,
    });
  }

  return { mapped, missing, provenance, errors };
}

// ── Expression resolver ────────────────────────────────────────────────────

function _resolveExpression(key, expr, context) {
  // Non-string → constant value (boolean, number)
  if (typeof expr !== 'string') {
    return { value: expr, source: 'constant' };
  }

  // Security check — validate before resolving
  const secErr = _validateExpressionSecurity(expr);
  if (secErr) {
    return { value: null, source: null, error: secErr, code: C.PLAYBOOK_UNSAFE_MAPPING };
  }

  // Pure template expression: ${...}
  const exprMatch = EXPR_RE.exec(expr);
  if (exprMatch) {
    const path   = exprMatch[1].trim();
    const result = _resolvePath(path, context);
    return result;
  }

  // String with embedded expression(s): "prefix-${incident.x}-suffix"
  if (expr.includes('${')) {
    return _resolveInterpolated(expr, context);
  }

  // Literal string constant
  return { value: expr, source: 'literal' };
}

// ── Path resolver ─────────────────────────────────────────────────────────

function _resolvePath(path, context) {
  const segments = path.split('.');

  // Root check
  const root = segments[0];
  if (!KNOWN_MAPPING_ROOTS.includes(root)) {
    return {
      value: null,
      source: null,
      error: `Unknown mapping root "${root}". Allowed: ${KNOWN_MAPPING_ROOTS.join(', ')}`,
      code:  C.PLAYBOOK_UNKNOWN_MAPPING_ROOT,
    };
  }

  // Depth check
  if (segments.length > MAX_PATH_DEPTH) {
    return {
      value: null,
      source: null,
      error: `Path "${path}" exceeds maximum depth of ${MAX_PATH_DEPTH}`,
      code:  C.PLAYBOOK_UNSAFE_MAPPING,
    };
  }

  // Blocked segments
  for (const seg of segments) {
    if (BLOCKED_SEGMENTS.has(seg)) {
      return {
        value: null,
        source: null,
        error: `Path "${path}" contains blocked segment "${seg}"`,
        code:  C.PLAYBOOK_UNSAFE_MAPPING,
      };
    }
  }

  // Resolve
  const rootObj = context[root];
  const value   = segments.slice(1).reduce((cur, key) => {
    if (cur == null) return undefined;
    if (typeof cur !== 'object') return undefined;
    return cur[key];
  }, rootObj);

  return { value, source: root };
}

// ── Interpolated string resolver ──────────────────────────────────────────

function _resolveInterpolated(template, context) {
  let result = template;
  let resolved = true;

  const re = new RegExp(CONTAINS_EXPR_RE.source, 'g');
  let match;

  while ((match = re.exec(template)) !== null) {
    const path     = match[1].trim();
    const pathResult = _resolvePath(path, context);

    if (pathResult.error) {
      return pathResult;
    }

    const val = pathResult.value;
    if (val == null) {
      resolved = false;
      result = result.replace(match[0], '');
    } else {
      result = result.replace(match[0], String(val));
    }
  }

  return {
    value:  resolved ? result : (result || null),
    source: 'interpolated',
  };
}

// ── Security validation ───────────────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  { re: /eval\s*\(/,                        reason: 'eval() is forbidden' },
  { re: /Function\s*\(/,                    reason: 'Function() is forbidden' },
  { re: /require\s*\(/,                     reason: 'require() is forbidden' },
  { re: /process\./,                        reason: 'process object access is forbidden' },
  { re: /child_process/,                    reason: 'child_process is forbidden' },
  { re: /\bexec\s*\(/,                      reason: 'exec() is forbidden' },
  { re: /\bspawn\s*\(/,                     reason: 'spawn() is forbidden' },
  { re: /;/,                               reason: 'semicolons are forbidden in mapping expressions' },
  { re: /`/,                               reason: 'backtick template literals are forbidden' },
  { re: /\$\{[^}]*\$\{/,                   reason: 'nested template expressions are forbidden' },
  { re: /__proto__|constructor|prototype/,  reason: 'prototype access is forbidden' },
  { re: /import\s*\(/,                      reason: 'dynamic import is forbidden' },
];

function _validateExpressionSecurity(expr) {
  for (const { re, reason } of FORBIDDEN_PATTERNS) {
    if (re.test(expr)) return reason;
  }
  return null;
}

// ── Param def index ───────────────────────────────────────────────────────

function _indexParamDefs(params) {
  const index = {};
  if (!Array.isArray(params)) return index;
  for (const p of params) {
    if (p?.name) index[p.name] = p;
  }
  return index;
}

module.exports = { mapParameters };
