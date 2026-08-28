"use strict";

class RollbackDefinitionEngine {
  evaluate({
    playbook = null,
    runbooks = [],
  } = {}) {
    const playbookRollback =
      normalizeRollback(
        playbook?.rollback
      );

    const runbookRollbacks =
      runbooks.map(
        (runbook) => ({
          runbookId:
            runbook.runbookId ||
            runbook.id ||
            null,

          rollback:
            normalizeRollback(
              runbook.rollbackConfig ||
              runbook.rollback
            ),
        })
      );

    const unavailable =
      runbookRollbacks.filter(
        (entry) =>
          !entry.rollback.available
      );

    const explicit =
      runbookRollbacks.filter(
        (entry) =>
          entry.rollback.available
      );

    return {
      playbookRollback,

      runbookRollbacks,

      rollbackAvailable:
        playbookRollback.available ||
        explicit.length > 0,

      fullyRollbackable:
        runbookRollbacks.length === 0
          ? playbookRollback.available
          : unavailable.length === 0,

      unavailableRunbooks:
        unavailable.map(
          (entry) =>
            entry.runbookId
        ),

      /**
       * Rollback knowledge never authorizes execution.
       */
      executionAuthorized:
        false,
    };
  }
}

function normalizeRollback(
  rollback
) {
  if (!rollback) {
    return {
      available:
        false,

      strategy:
        "NONE",

      steps: [],

      reason:
        "ROLLBACK_NOT_DEFINED",

      executionAuthorized:
        false,
    };
  }

  const strategy =
    rollback.strategy ||
    rollback.type ||
    rollback.mode ||
    "NONE";

  const explicitlyUnavailable =
    rollback.available === false ||
    strategy === "NONE";

  const steps =
    rollback.steps ||
    rollback.explicitSteps ||
    [];

  return {
    available:
      !explicitlyUnavailable,

    strategy,

    steps:
      Array.isArray(steps)
        ? steps
        : [],

    reason:
      explicitlyUnavailable
        ? (
            rollback.reason ||
            "ROLLBACK_UNAVAILABLE"
          )
        : null,

    executionAuthorized:
      false,
  };
}

module.exports =
  RollbackDefinitionEngine;