"use strict";

class RiskPolicyRequirementEngine {
  evaluate({
    failureMode = null,
    playbook = null,
    runbooks = [],
    policyDecision = null,
    approval = null,
  } = {}) {
    const risk =
      this._resolveRisk({
        failureMode,
        playbook,
        runbooks,
      });

    const policy =
      this._evaluatePolicy(
        policyDecision
      );

    const approvalResult =
      this._evaluateApproval({
        risk,
        playbook,
        approval,
      });

    const blocked =
      policy.blocked ||
      approvalResult.blocked;

    return {
      risk,

      policy,

      approval:
        approvalResult,

      requirementsSatisfied:
        !blocked,

      blocked,

      blockReasons: [
        ...policy.reasons,
        ...approvalResult.reasons,
      ],

      /**
       * Requirements being satisfied does not grant permission
       * to execute infrastructure.
       */
      executionAuthorized:
        false,
    };
  }

  _resolveRisk({
    failureMode,
    playbook,
    runbooks,
  }) {
    const candidates = [
      failureMode?.risk?.level,
      failureMode?.riskLevel,
      playbook?.risk?.level,
      playbook?.riskLevel,
      ...runbooks.map(
        (runbook) =>
          runbook?.risk?.level ||
          runbook?.riskLevel
      ),
    ].filter(Boolean);

    const levels = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };

    let selected =
      "LOW";

    for (const candidate of candidates) {
      const normalized =
        String(candidate)
          .toUpperCase();

      if (
        (levels[normalized] || 0) >
        levels[selected]
      ) {
        selected =
          normalized;
      }
    }

    return {
      level:
        selected,

      score:
        levels[selected],

      executionAuthorized:
        false,
    };
  }

  _evaluatePolicy(
    decision
  ) {
    if (!decision) {
      return {
        evaluated:
          false,

        allowed:
          false,

        blocked:
          true,

        reasons: [
          "POLICY_DECISION_MISSING",
        ],

        executionAuthorized:
          false,
      };
    }

    const explicitlyDenied =
      decision.allowed === false ||
      decision.denied === true ||
      decision.decision ===
        "DENY";

    if (explicitlyDenied) {
      return {
        evaluated:
          true,

        allowed:
          false,

        blocked:
          true,

        reasons: [
          decision.reason ||
          "POLICY_DENIED",
        ],

        executionAuthorized:
          false,
      };
    }

    const explicitlyAllowed =
      decision.allowed === true ||
      decision.decision ===
        "ALLOW";

    return {
      evaluated:
        true,

      allowed:
        explicitlyAllowed,

      blocked:
        !explicitlyAllowed,

      reasons:
        explicitlyAllowed
          ? []
          : [
              "POLICY_NOT_EXPLICITLY_ALLOWED",
            ],

      executionAuthorized:
        false,
    };
  }

  _evaluateApproval({
    risk,
    playbook,
    approval,
  }) {
    const mode =
      playbook?.approval?.mode ||
      playbook?.approvalMode ||
      "AUTOMATIC";

    const requiresApproval =
      mode === "MANUAL" ||
      mode === "CONDITIONAL" ||
      risk.level === "CRITICAL";

    if (!requiresApproval) {
      return {
        required:
          false,

        approved:
          true,

        blocked:
          false,

        reasons: [],

        executionAuthorized:
          false,
      };
    }

    const approved =
      approval?.approved === true ||
      approval?.status ===
        "APPROVED";

    return {
      required:
        true,

      approved,

      blocked:
        !approved,

      reasons:
        approved
          ? []
          : [
              "APPROVAL_REQUIRED",
            ],

      executionAuthorized:
        false,
    };
  }
}

module.exports =
  RiskPolicyRequirementEngine;