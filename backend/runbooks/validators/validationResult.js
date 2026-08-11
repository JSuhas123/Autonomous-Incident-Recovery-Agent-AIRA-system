'use strict';

/**
 * Validation result utilities.
 *
 * A ValidationResult has the shape:
 *   { valid: boolean, diagnostics: Diagnostic[] }
 *
 * A Diagnostic has the shape:
 *   { code: string, path: string, message: string, severity: 'ERROR'|'WARNING' }
 *
 * `valid` is true only when there are zero ERROR-severity diagnostics.
 * WARNING diagnostics do not affect validity.
 */

const SEVERITY = Object.freeze({ ERROR: 'ERROR', WARNING: 'WARNING' });

function makeDiagnostic(code, path, message, severity = SEVERITY.ERROR) {
  if (typeof code !== 'string' || !code) throw new Error('diagnostic code required');
  return Object.freeze({ code, path: path || '', message, severity });
}

function error(code, path, message) {
  return makeDiagnostic(code, path, message, SEVERITY.ERROR);
}

function warning(code, path, message) {
  return makeDiagnostic(code, path, message, SEVERITY.WARNING);
}

function buildResult(diagnostics) {
  const valid = diagnostics.every(d => d.severity !== SEVERITY.ERROR);
  return Object.freeze({ valid, diagnostics: Object.freeze(diagnostics) });
}

module.exports = { SEVERITY, error, warning, buildResult };
