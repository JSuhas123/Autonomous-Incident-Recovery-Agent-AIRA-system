"use strict";

/**
 * Phase 12.11 — Agent Permission Registry
 *
 * Agent permissions are deny-by-default.
 *
 * This registry describes classes of authority an intelligence agent may have.
 *
 * IMPORTANT:
 *
 * No Phase-12 intelligence agent may:
 * - mutate infrastructure
 * - authorize execution
 * - approve execution
 * - directly resolve/close incidents
 * - modify production policy
 * - publish production playbooks
 * - retrieve plaintext secrets
 */

const AGENT_PERMISSION_POLICY_VERSION =
  "12.11-v1";

const FORBIDDEN_AGENT_AUTHORITIES =
  Object.freeze([
    "infrastructureMutation",
    "executionAuthorization",
    "approvalAuthority",
    "incidentResolution",
    "policyMutation",
    "playbookPublication",
    "secretValueAccess",
  ]);

const AGENT_PERMISSION_REGISTRY =
  Object.freeze({
    SymptomAnalysisAgent:
      _entry(),

    CorrelationAgent:
      _entry(),

    TopologyAnalysisAgent:
      _entry(),

    ChangeAnalysisAgent:
      _entry(),

    HistoricalAnalysisAgent:
      _entry(),

    InvestigationAgent:
      _entry(),

    RootCauseHypothesisAgent:
      _entry(),

    DiagnosisAgent:
      _entry(),

    RiskImpactAgent:
      _entry(),

    PlaybookSelectionAgent:
      _entry(),

    ParameterResolutionAgent:
      _entry(),

    RecoveryMonitoringAgent:
      _entry(),

    VerificationCriticAgent:
      _entry(),

    LearningAgent:
      _entry({
        /*
         * Learning may create recommendations/proposals only.
         */
        learningProposal:
          true,
      }),

    ExplanationAgent:
      _entry(),
  });

function _entry(
  additions = {}
) {
  return Object.freeze({
    infrastructureMutation:
      false,

    executionAuthorization:
      false,

    approvalAuthority:
      false,

    incidentResolution:
      false,

    policyMutation:
      false,

    playbookPublication:
      false,

    secretValueAccess:
      false,

    ...additions,
  });
}

function getAgentPermissionPolicy(
  agentName
) {
  return (
    AGENT_PERMISSION_REGISTRY[
      agentName
    ] ||
    null
  );
}

/**
 * Validate an agent's declared capabilities against AIRA's central authority
 * boundary.
 */
function validateAgentPermissions(
  agent
) {
  if (
    !agent
  ) {
    return {
      valid:
        false,

      errors: [
        "agent is required",
      ],
    };
  }

  const name =
    agent.name ||
    agent._name ||
    null;

  if (
    !name
  ) {
    return {
      valid:
        false,

      errors: [
        "agent name is required",
      ],
    };
  }

  const policy =
    getAgentPermissionPolicy(
      name
    );

  if (
    !policy
  ) {
    return {
      valid:
        false,

      errors: [
        `No permission policy registered for agent "${name}"`,
      ],
    };
  }

  const capabilities =
    typeof agent
      .getCapabilities ===
      "function"
      ? agent
          .getCapabilities()
      : {};

  const errors =
    [];

  for (
    const authority
    of FORBIDDEN_AGENT_AUTHORITIES
  ) {
    if (
      capabilities[
        authority
      ] ===
      true
    ) {
      errors.push(
        `${name} requested forbidden authority "${authority}"`
      );
    }

    if (
      policy[
        authority
      ] ===
      false &&
      capabilities[
        authority
      ] ===
      true
    ) {
      errors.push(
        `${name} violates central permission policy for "${authority}"`
      );
    }
  }

  return {
    valid:
      errors.length ===
      0,

    errors,

    agent:
      name,

    policyVersion:
      AGENT_PERMISSION_POLICY_VERSION,

    policy,

    capabilities,
  };
}

function assertAgentPermissions(
  agent
) {
  const validation =
    validateAgentPermissions(
      agent
    );

  if (
    !validation.valid
  ) {
    const error =
      new Error(
        `Agent permission validation failed: ${validation.errors.join("; ")}`
      );

    error.code =
      "AGENT_PERMISSION_DENIED";

    error.agent =
      validation.agent ||
      agent
        ?.name ||
      null;

    error.permissionErrors =
      validation.errors;

    throw error;
  }

  return validation;
}

module.exports = {
  AGENT_PERMISSION_POLICY_VERSION,
  AGENT_PERMISSION_REGISTRY,
  FORBIDDEN_AGENT_AUTHORITIES,
  getAgentPermissionPolicy,
  validateAgentPermissions,
  assertAgentPermissions,
};