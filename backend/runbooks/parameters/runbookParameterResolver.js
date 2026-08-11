'use strict';

/**
 * Runbook Parameter Resolver — Phase D
 *
 * Deterministic resolution of Runbook execution parameters.
 * NOT an AI agent. NEVER guesses. NEVER evals.
 *
 * Resolution precedence (highest → lowest):
 *   1. explicitInputs         — caller-supplied values
 *   2. incidentEvidence       — structured evidence from the incident
 *   3. alertLabels            — Prometheus/alert-manager labels & annotations
 *   4. serviceRegistry        — registered service metadata
 *   5. infraContext           — infrastructure inventory
 *   6. runbookDefaults        — parameter.default values from the runbook
 *   7. humanInput             — approved human-supplied values
 *
 * Each resolved parameter carries provenance:
 *   { name, value, source, confidence, resolvedAt, sensitive }
 */

const PARAMETER_SOURCES = Object.freeze({
  EXPLICIT:        'explicit',
  INCIDENT:        'incident',
  ALERT:           'alert',
  SERVICE_REGISTRY:'service_registry',
  INFRA:           'infra',
  DEFAULT:         'default',
  HUMAN:           'human',
  UNRESOLVED:      'unresolved',
});

const PARAM_TYPE = Object.freeze({
  STRING:            'string',
  NUMBER:            'number',
  BOOLEAN:           'boolean',
  ENUM:              'enum',
  DURATION:          'duration',
  RESOURCE_REFERENCE:'resource-reference',
  SECRET_REFERENCE:  'secret-reference',
});

// ── Core resolver ─────────────────────────────────────────────────────────

class RunbookParameterResolver {
  /**
   * Resolve all parameters for a runbook execution.
   *
   * @param {object[]} parameterDefs  - Runbook.parameters[] from definition
   * @param {object}   sources        - { explicitInputs, incidentEvidence, alertLabels,
   *                                     serviceRegistry, infraContext, humanInput }
   * @returns {{ resolved: ResolvedParam[], errors: string[] }}
   *   resolved — one entry per parameter definition (may be unresolved if optional + no value)
   *   errors   — blocking errors (missing required, type coercion failure, etc.)
   */
  resolve(parameterDefs, sources = {}) {
    if (!Array.isArray(parameterDefs)) {
      return { resolved: [], errors: [] };
    }

    const {
      explicitInputs   = {},
      incidentEvidence = {},
      alertLabels      = {},
      serviceRegistry  = {},
      infraContext     = {},
      humanInput       = {},
    } = sources;

    const resolved = [];
    const errors   = [];

    for (const def of parameterDefs) {
      const result = this._resolveOne(def, {
        explicitInputs,
        incidentEvidence,
        alertLabels,
        serviceRegistry,
        infraContext,
        humanInput,
      });

      if (result.source === PARAMETER_SOURCES.UNRESOLVED) {
        if (def.required) {
          errors.push(`Required parameter "${def.name}" could not be resolved`);
        }
        // Still add to resolved array so callers can see what's missing
      }

      resolved.push(result);
    }

    return { resolved, errors };
  }

  /**
   * Validate already-resolved parameters against their definitions.
   * Use after resolution to enforce type constraints.
   *
   * @param {object[]} parameterDefs
   * @param {object[]} resolved - output of resolve()
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateResolvedParameters(parameterDefs, resolved) {
    const errors = [];
    const resolvedMap = new Map(resolved.map(r => [r.name, r]));

    for (const def of parameterDefs) {
      const r = resolvedMap.get(def.name);
      if (!r || r.source === PARAMETER_SOURCES.UNRESOLVED) {
        if (def.required) errors.push(`Required parameter "${def.name}" is not resolved`);
        continue;
      }

      const typeErrors = this._validateType(def, r.value);
      errors.push(...typeErrors.map(e => `Parameter "${def.name}": ${e}`));
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Return the names of required parameters that have no resolved value.
   */
  getMissingRequiredParameters(parameterDefs, resolved) {
    const resolvedNames = new Set(
      resolved.filter(r => r.source !== PARAMETER_SOURCES.UNRESOLVED).map(r => r.name),
    );
    return parameterDefs
      .filter(def => def.required && !resolvedNames.has(def.name))
      .map(def => def.name);
  }

  // ── Private: single-parameter resolution ─────────────────────────────────

  _resolveOne(def, sources) {
    const name      = def.name;
    const isSensitive = def.type === PARAM_TYPE.SECRET_REFERENCE;

    const candidates = [
      { source: PARAMETER_SOURCES.EXPLICIT,        map: sources.explicitInputs,    confidence: 1.0 },
      { source: PARAMETER_SOURCES.INCIDENT,         map: sources.incidentEvidence,  confidence: 0.9 },
      { source: PARAMETER_SOURCES.ALERT,            map: sources.alertLabels,       confidence: 0.85 },
      { source: PARAMETER_SOURCES.SERVICE_REGISTRY, map: sources.serviceRegistry,   confidence: 0.8 },
      { source: PARAMETER_SOURCES.INFRA,            map: sources.infraContext,       confidence: 0.75 },
      { source: PARAMETER_SOURCES.DEFAULT,          map: this._buildDefaultsMap([def]), confidence: 0.5 },
      { source: PARAMETER_SOURCES.HUMAN,            map: sources.humanInput,        confidence: 1.0 },
    ];

    for (const { source, map, confidence } of candidates) {
      const rawValue = map[name];
      if (rawValue == null && source !== PARAMETER_SOURCES.DEFAULT) continue;
      if (rawValue == null) continue;

      const coerceResult = this._coerce(def, rawValue);
      if (!coerceResult.success) continue;  // type coercion failed → try next source

      return {
        name,
        value:      coerceResult.value,
        source,
        confidence,
        resolvedAt: new Date().toISOString(),
        sensitive:  isSensitive,
      };
    }

    return {
      name,
      value:      undefined,
      source:     PARAMETER_SOURCES.UNRESOLVED,
      confidence: 0,
      resolvedAt: new Date().toISOString(),
      sensitive:  isSensitive,
    };
  }

  _buildDefaultsMap(defs) {
    const map = {};
    for (const def of defs) {
      if (def.default !== undefined) map[def.name] = def.default;
    }
    return map;
  }

  // ── Private: type coercion ─────────────────────────────────────────────

  _coerce(def, rawValue) {
    const type = def.type || PARAM_TYPE.STRING;

    // Secret references pass through opaque — never coerce, never log
    if (type === PARAM_TYPE.SECRET_REFERENCE) {
      if (typeof rawValue !== 'string') {
        return { success: false, error: 'secret-reference must be a string' };
      }
      return { success: true, value: rawValue };
    }

    // Resource references validate format
    if (type === PARAM_TYPE.RESOURCE_REFERENCE) {
      if (typeof rawValue !== 'string' || rawValue.trim() === '') {
        return { success: false, error: 'resource-reference must be a non-empty string' };
      }
      // Reject wildcard patterns — must be an exact resource name
      if (rawValue.includes('*') || rawValue.includes('?')) {
        return { success: false, error: 'resource-reference must not contain wildcards' };
      }
      return { success: true, value: rawValue.trim() };
    }

    switch (type) {
      case PARAM_TYPE.STRING:
        return { success: true, value: String(rawValue) };

      case PARAM_TYPE.NUMBER: {
        const n = Number(rawValue);
        if (!Number.isFinite(n)) return { success: false, error: `Cannot convert "${rawValue}" to number` };
        if (def.min != null && n < def.min) return { success: false, error: `Value ${n} is below minimum ${def.min}` };
        if (def.max != null && n > def.max) return { success: false, error: `Value ${n} exceeds maximum ${def.max}` };
        return { success: true, value: n };
      }

      case PARAM_TYPE.BOOLEAN: {
        if (typeof rawValue === 'boolean') return { success: true, value: rawValue };
        if (rawValue === 'true'  || rawValue === 1)  return { success: true, value: true };
        if (rawValue === 'false' || rawValue === 0)  return { success: true, value: false };
        return { success: false, error: `Cannot convert "${rawValue}" to boolean` };
      }

      case PARAM_TYPE.ENUM: {
        const allowed = def.allowedValues || [];
        if (allowed.length > 0 && !allowed.includes(rawValue)) {
          return { success: false, error: `Value "${rawValue}" not in allowed values: ${allowed.join(', ')}` };
        }
        return { success: true, value: rawValue };
      }

      case PARAM_TYPE.DURATION: {
        // Accept number (seconds) or string like "5m", "30s", "1h"
        if (typeof rawValue === 'number') return { success: true, value: rawValue };
        const parsed = _parseDuration(rawValue);
        if (parsed == null) return { success: false, error: `Cannot parse duration: "${rawValue}"` };
        return { success: true, value: parsed };
      }

      default:
        return { success: true, value: rawValue };
    }
  }

  _validateType(def, value) {
    const errors = [];
    const type = def.type || PARAM_TYPE.STRING;

    if (type === PARAM_TYPE.NUMBER) {
      if (!Number.isFinite(Number(value))) errors.push(`must be a finite number`);
      if (def.min != null && value < def.min) errors.push(`must be >= ${def.min}`);
      if (def.max != null && value > def.max) errors.push(`must be <= ${def.max}`);
    }

    if (type === PARAM_TYPE.ENUM && def.allowedValues?.length > 0) {
      if (!def.allowedValues.includes(value)) {
        errors.push(`must be one of: ${def.allowedValues.join(', ')}`);
      }
    }

    if (type === PARAM_TYPE.SECRET_REFERENCE && typeof value !== 'string') {
      errors.push('secret-reference must be a non-empty string');
    }

    return errors;
  }
}

// ── Duration parser ────────────────────────────────────────────────────────

function _parseDuration(str) {
  if (typeof str !== 'string') return null;
  const m = str.match(/^(\d+(?:\.\d+)?)\s*([smhd])$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (multipliers[unit] || 1);
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _resolver = null;

function getRunbookParameterResolver() {
  if (!_resolver) _resolver = new RunbookParameterResolver();
  return _resolver;
}

module.exports = {
  RunbookParameterResolver,
  getRunbookParameterResolver,
  PARAMETER_SOURCES,
  PARAM_TYPE,
};
