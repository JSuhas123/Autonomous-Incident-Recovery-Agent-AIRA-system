"use strict";

/**
 * AIRA External Network Diagnostic Target Registry
 *
 * Phase 13.12
 *
 * Provides controlled external diagnostic targets used by
 * deterministic networking Runbook actions.
 *
 * IMPORTANT:
 *
 * This registry does NOT execute arbitrary shell commands.
 * Targets must expose explicitly approved diagnostic methods.
 */

const targets =
  new Map();


function _normalizeTargetId(
  targetId
) {
  const normalized =
    String(
      targetId ||
      ""
    )
      .trim();

  if (
    !normalized
  ) {
    throw new Error(
      "targetId is required."
    );
  }

  return normalized;
}


function registerNetworkDiagnosticTarget(
  targetId,
  target
) {
  const id =
    _normalizeTargetId(
      targetId
    );

  if (
    !target ||
    typeof target !==
      "object"
  ) {
    throw new Error(
      "Network diagnostic target must be an object."
    );
  }

  targets.set(
    id,
    target
  );

  return {
    targetId:
      id,

    registered:
      true,
  };
}


function unregisterNetworkDiagnosticTarget(
  targetId
) {
  const id =
    _normalizeTargetId(
      targetId
    );

  return targets.delete(
    id
  );
}


function getNetworkDiagnosticTarget(
  targetId
) {
  const id =
    _normalizeTargetId(
      targetId
    );

  const target =
    targets.get(
      id
    );

  if (
    !target
  ) {
    throw new Error(
      `Network diagnostic target is not registered: ${id}`
    );
  }

  return target;
}


function hasNetworkDiagnosticTarget(
  targetId
) {
  const id =
    _normalizeTargetId(
      targetId
    );

  return targets.has(
    id
  );
}


function clearNetworkDiagnosticTargets() {
  targets.clear();
}


module.exports = {
  registerNetworkDiagnosticTarget,
  unregisterNetworkDiagnosticTarget,
  getNetworkDiagnosticTarget,
  hasNetworkDiagnosticTarget,
  clearNetworkDiagnosticTargets,
};