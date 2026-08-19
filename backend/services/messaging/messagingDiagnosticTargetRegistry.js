'use strict';

/**
 * AIRA Messaging Diagnostic Target Registry
 *
 * Stores explicitly registered messaging/broker diagnostic adapters.
 *
 * Supported target types may include:
 * - RabbitMQ
 * - Kafka
 * - generic queue/broker adapters
 *
 * SAFETY:
 * - no implicit broker access
 * - no embedded credentials
 * - no mutation
 * - unknown targets fail closed
 */

const targets =
  new Map();


function registerMessagingDiagnosticTarget(
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
      'messaging target must be an object'
    );
  }

  targets.set(
    targetId.trim(),
    target
  );

  return target;
}


function getMessagingDiagnosticTarget(
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
      `Unknown messaging diagnostic target: ${targetId}`
    );
  }

  return target;
}


function hasMessagingDiagnosticTarget(
  targetId
) {
  return targets.has(
    targetId
  );
}


function unregisterMessagingDiagnosticTarget(
  targetId
) {
  return targets.delete(
    targetId
  );
}


function clearMessagingDiagnosticTargets() {
  targets.clear();
}


module.exports = {
  registerMessagingDiagnosticTarget,
  getMessagingDiagnosticTarget,
  hasMessagingDiagnosticTarget,
  unregisterMessagingDiagnosticTarget,
  clearMessagingDiagnosticTargets,
};