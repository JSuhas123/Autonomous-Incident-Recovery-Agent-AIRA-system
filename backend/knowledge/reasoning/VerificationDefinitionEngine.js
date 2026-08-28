"use strict";

class VerificationDefinitionEngine {
  evaluate({
    playbook = null,
    runbooks = [],
  } = {}) {
    const playbookVerification =
      normalizeVerification(
        playbook?.verification ||
        playbook?.outcome
          ?.verification
      );

    const runbookVerifications =
      runbooks.map(
        (runbook) => ({
          runbookId:
            runbook.runbookId ||
            runbook.id ||
            null,

          verification:
            normalizeVerification(
              runbook.verification
            ),
        })
      );

    const missing =
      runbookVerifications.filter(
        (entry) =>
          !entry.verification.defined
      );

    const defined =
      playbookVerification.defined ||
      runbookVerifications.some(
        (entry) =>
          entry.verification.defined
      );

    return {
      playbookVerification,

      runbookVerifications,

      verificationDefined:
        defined,

      missingRunbookVerification:
        missing.map(
          (entry) =>
            entry.runbookId
        ),

      /**
       * Command completion alone is not recovery verification.
       */
      commandSuccessIsVerification:
        false,

      executionAuthorized:
        false,
    };
  }
}

function normalizeVerification(
  verification
) {
  if (!verification) {
    return {
      defined:
        false,

      strategy:
        null,

      checks: [],

      executionAuthorized:
        false,
    };
  }

  const checks =
    verification.checks ||
    verification.steps ||
    verification.conditions ||
    [];

  return {
    defined:
      (
        Array.isArray(checks) &&
        checks.length > 0
      ) ||
      Boolean(
        verification.strategy
      ),

    strategy:
      verification.strategy ||
      "ALL",

    checks:
      Array.isArray(checks)
        ? checks
        : [],

    timeoutMs:
      verification.timeoutMs ??
      null,

    executionAuthorized:
      false,
  };
}

module.exports =
  VerificationDefinitionEngine;