"use strict";

/**
 * AIRA Regression / Reopen Engine
 *
 * Phase 10.9
 *
 * Handles recovery regression after verification.
 *
 * Responsibilities:
 *
 * - detect supported regression conditions
 * - transition incident into REGRESSED
 * - choose retry / rollback / escalation intent
 * - preserve same incident lifecycle when appropriate
 *
 * SAFETY:
 *
 * - does not execute rollback
 * - does not start recovery directly
 * - does not authorize execution
 */

const {
  INCIDENT_LIFECYCLE_STATE,
  STABILITY_RESULT,
  ESCALATION_REASON,
} =
  require(
    "./incidentLifecycleContracts"
  );

const incidentLifecycleStateMachine =
  require(
    "./incidentLifecycleStateMachine"
  );

const REGRESSION_ACTION =
  Object.freeze({
    REQUEST_RETRY:
      "REQUEST_RETRY",

    REQUEST_ROLLBACK:
      "REQUEST_ROLLBACK",

    ESCALATE:
      "ESCALATE",

    NO_ACTION:
      "NO_ACTION",
  });

class RegressionReopenEngine {
  constructor(
    options = {}
  ) {
    this.stateMachine =
      options.stateMachine ||
      incidentLifecycleStateMachine;
  }

  async evaluate(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const incident =
      await this.loadIncident(
        input,
        dependencies
      );

    const currentState =
      incident.lifecycleState ||
      incident.status;

    const regression =
      this.detectRegression(
        input
      );

    if (
      regression.detected !==
      true
    ) {
      return {
        regressionDetected:
          false,

        action:
          REGRESSION_ACTION
            .NO_ACTION,

        transition:
          null,

        reason:
          "No recovery regression detected.",

        executionAuthorized:
          false,
      };
    }

    // ========================================================================
    // INCIDENT MUST BE IN A STATE THAT MAY REGRESS
    // ========================================================================

    const regressibleStates =
      new Set([
        INCIDENT_LIFECYCLE_STATE
          .RECOVERED,

        INCIDENT_LIFECYCLE_STATE
          .STABILITY_OBSERVATION,

        INCIDENT_LIFECYCLE_STATE
          .RESOLVED,
      ]);

    if (
      !regressibleStates.has(
        currentState
      )
    ) {
      return {
        regressionDetected:
          true,

        action:
          REGRESSION_ACTION
            .ESCALATE,

        transition:
          null,

        reason:
          `Regression detected while incident is in unexpected state ${currentState}.`,

        escalationReason:
          ESCALATION_REASON
            .STABILITY_REGRESSION,

        executionAuthorized:
          false,
      };
    }

    const transition =
      this.stateMachine
        .transition({
          fromState:
            currentState,

          toState:
            INCIDENT_LIFECYCLE_STATE
              .REGRESSED,

          reason:
            regression.reason,

          actor:
            input.actor,

          source: {
            phase:
              10,

            component:
              "regressionReopenEngine",

            referenceId:
              input.verificationId ||
              null,
          },

          metadata: {
            stabilityResult:
              input.stabilityResult ||
              null,

            previousVerificationResult:
              input.previousVerificationResult ||
              null,

            currentVerificationResult:
              input.currentVerificationResult ||
              null,

            regressionSignals:
              regression.signals,
          },

          executionAuthorized:
            false,
        });

    const action =
      this.chooseAction(
        input
      );

    return {
      regressionDetected:
        true,

      action,

      transition,

      reason:
        regression.reason,

      signals:
        regression.signals,

      retryRequested:
        action ===
        REGRESSION_ACTION
          .REQUEST_RETRY,

      rollbackRequested:
        action ===
        REGRESSION_ACTION
          .REQUEST_ROLLBACK,

      escalationRequested:
        action ===
        REGRESSION_ACTION
          .ESCALATE,

      escalationReason:
        action ===
        REGRESSION_ACTION
          .ESCALATE
          ? ESCALATION_REASON
              .STABILITY_REGRESSION
          : null,

      executionAuthorized:
        false,

      evaluatedAt:
        new Date(),
    };
  }

  detectRegression(
    input
  ) {
    const signals =
      [];

    if (
      input.stabilityResult
        ?.result ===
      STABILITY_RESULT
        .UNSTABLE
    ) {
      signals.push(
        "STABILITY_UNSTABLE"
      );
    }

    if (
      input.currentVerificationResult
        ?.decision ===
      "REGRESSED"
    ) {
      signals.push(
        "VERIFICATION_REGRESSED"
      );
    }

    if (
      input.currentVerificationResult
        ?.decision ===
      "NOT_RECOVERED" &&
      input.previousVerificationResult
        ?.decision ===
        "RECOVERED"
    ) {
      signals.push(
        "RECOVERED_TO_NOT_RECOVERED"
      );
    }

    const previousScore =
      toFiniteNumber(
        input.previousVerificationResult
          ?.overallScore
      );

    const currentScore =
      toFiniteNumber(
        input.currentVerificationResult
          ?.overallScore
      );

    if (
      previousScore !==
        null &&
      currentScore !==
        null &&
      currentScore <
        previousScore -
          0.2
    ) {
      signals.push(
        "MATERIAL_SCORE_DROP"
      );
    }

    if (
      input.regressionDetected ===
      true
    ) {
      signals.push(
        "EXTERNAL_REGRESSION_SIGNAL"
      );
    }

    return {
      detected:
        signals.length >
        0,

      signals,

      reason:
        signals.length >
          0
          ? `Recovery regression detected: ${signals.join(", ")}`
          : null,
    };
  }

  chooseAction(
    input
  ) {
    if (
      input.rollbackAvailable ===
        true &&
      input.preferRollback ===
        true
    ) {
      return REGRESSION_ACTION
        .REQUEST_ROLLBACK;
    }

    const currentAttempt =
      normalizeAttempt(
        input.currentAttempt,
        0
      );

    const maxAttempts =
      Math.max(
        1,
        normalizeAttempt(
          input.maxAttempts,
          1
        )
      );

    if (
      input.retryAllowed ===
        true &&
      currentAttempt <
        maxAttempts
    ) {
      return REGRESSION_ACTION
        .REQUEST_RETRY;
    }

    if (
      input.rollbackAvailable ===
      true
    ) {
      return REGRESSION_ACTION
        .REQUEST_ROLLBACK;
    }

    return REGRESSION_ACTION
      .ESCALATE;
  }

  async loadIncident(
    input,
    dependencies
  ) {
    if (
      typeof dependencies
        .getIncident ===
      "function"
    ) {
      const incident =
        await dependencies
          .getIncident({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,
          });

      if (
        !incident
      ) {
        throw Object.assign(
          new Error(
            "Incident not found"
          ),
          {
            code:
              "REGRESSION_INCIDENT_NOT_FOUND",
          }
        );
      }

      return incident;
    }

    if (
      input.incident
    ) {
      return input.incident;
    }

    throw Object.assign(
      new Error(
        "Regression evaluation requires incident provider"
      ),
      {
        code:
          "REGRESSION_INCIDENT_PROVIDER_REQUIRED",
      }
    );
  }

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object" ||
      Object.keys(
        input
      ).length ===
        0
    ) {
      throw Object.assign(
        new Error(
          "Regression evaluation input is required"
        ),
        {
          code:
            "REGRESSION_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId ||
      !input.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Regression evaluation requires organization, environment and incident scope"
        ),
        {
          code:
            "REGRESSION_SCOPE_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Regression engine cannot authorize execution"
        ),
        {
          code:
            "REGRESSION_UNSAFE_INPUT",
        }
      );
    }
  }
}

function normalizeAttempt(
  value,
  fallback
) {
  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return fallback;
  }

  return Math.max(
    0,
    Math.floor(
      numeric
    )
  );
}

function toFiniteNumber(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const numeric =
    Number(
      value
    );

  return Number.isFinite(
    numeric
  )
    ? numeric
    : null;
}

module.exports =
  new RegressionReopenEngine();

module.exports
  .RegressionReopenEngine =
  RegressionReopenEngine;

module.exports
  .REGRESSION_ACTION =
  REGRESSION_ACTION;