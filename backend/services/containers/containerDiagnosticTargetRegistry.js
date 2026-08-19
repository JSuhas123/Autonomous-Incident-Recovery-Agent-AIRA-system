'use strict';

/**
 * AIRA Container Diagnostic Target Registry
 *
 * Registered adapters may represent:
 * - Docker
 * - containerd
 * - CRI-compatible runtimes
 * - Kubernetes-hosted containers
 *
 * SAFETY:
 * - no implicit runtime access
 * - no embedded credentials
 * - unknown targets fail closed
 */

const targets =
  new Map();


function registerContainerDiagnosticTarget(
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
      'container diagnostic target must be an object'
    );
  }

  targets.set(
    targetId.trim(),
    target
  );

  return target;
}


function getContainerDiagnosticTarget(
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
      `Unknown container diagnostic target: ${targetId}`
    );
  }

  return target;
}


function hasContainerDiagnosticTarget(
  targetId
) {
  return targets.has(
    targetId
  );
}


function unregisterContainerDiagnosticTarget(
  targetId
) {
  return targets.delete(
    targetId
  );
}


function clearContainerDiagnosticTargets() {
  targets.clear();
}


module.exports = {
  registerContainerDiagnosticTarget,
  getContainerDiagnosticTarget,
  hasContainerDiagnosticTarget,
  unregisterContainerDiagnosticTarget,
  clearContainerDiagnosticTargets,
};