'use strict';

/**
 * AIRA Observability Diagnostic Target Registry
 *
 * Stores explicitly registered observability targets.
 *
 * A target may represent:
 * - Prometheus
 * - Alertmanager
 * - OpenTelemetry Collector
 * - Grafana-compatible backend
 * - log pipeline
 * - trace backend
 * - metrics backend
 *
 * SAFETY:
 * - registry contains adapters, not credentials
 * - no implicit network access
 * - unknown targets fail closed
 */

const targets =
  new Map();


function registerObservabilityDiagnosticTarget(
  targetId,
  target
) {
  if (
    typeof targetId !==
      'string' ||
    !targetId.trim()
  ) {
    throw new TypeError(
      'targetId is required'
    );
  }

  if (
    !target ||
    typeof target !==
      'object'
  ) {
    throw new TypeError(
      'observability target must be an object'
    );
  }

  targets.set(
    targetId.trim(),
    target
  );

  return target;
}


function getObservabilityDiagnosticTarget(
  targetId
) {
  if (
    typeof targetId !==
      'string' ||
    !targetId.trim()
  ) {
    throw new TypeError(
      'targetId is required'
    );
  }

  const target =
    targets.get(
      targetId.trim()
    );

  if (
    !target
  ) {
    throw new Error(
      `Unknown observability diagnostic target: ${targetId}`
    );
  }

  return target;
}


function hasObservabilityDiagnosticTarget(
  targetId
) {
  return targets.has(
    targetId
  );
}


function unregisterObservabilityDiagnosticTarget(
  targetId
) {
  return targets.delete(
    targetId
  );
}


function clearObservabilityDiagnosticTargets() {
  targets.clear();
}


function listObservabilityDiagnosticTargets() {
  return [
    ...targets.keys(),
  ];
}


module.exports = {
  registerObservabilityDiagnosticTarget,
  getObservabilityDiagnosticTarget,
  hasObservabilityDiagnosticTarget,
  unregisterObservabilityDiagnosticTarget,
  clearObservabilityDiagnosticTargets,
  listObservabilityDiagnosticTargets,
};