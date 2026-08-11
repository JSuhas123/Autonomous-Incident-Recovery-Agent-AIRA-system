"use strict";

/**
 * AIRA Execution Outcome Constants
 * Single source of truth for all outcome enums and reason codes.
 *
 * Three top-level outcomes:
 *   AUTO_RESOLVED        — AIRA completed resolution without human intervention.
 *   WAITING_FOR_APPROVAL — AIRA has a safe plan but requires human authorization.
 *   MANUAL_REQUIRED      — AIRA cannot safely resolve this automatically.
 *
 * APPROVAL_REQUIRED vs MANUAL_REQUIRED distinction:
 *   APPROVAL_REQUIRED: AIRA knows exactly what to do and is ready to act.
 *                      A human must authorize execution (policy gate).
 *                      Once approved, AIRA resumes automatically.
 *
 *   MANUAL_REQUIRED:   AIRA either has no safe plan, or the plan cannot
 *                      be safely executed without direct human involvement.
 *                      Human must take action themselves.
 */

const EXECUTION_OUTCOME = Object.freeze({
  AUTO_RESOLVED: "AUTO_RESOLVED",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  MANUAL_REQUIRED: "MANUAL_REQUIRED",
});

/**
 * Reason codes for MANUAL_REQUIRED outcomes.
 * Each code identifies why AIRA escalated to manual handling.
 */
const MANUAL_REASON = Object.freeze({
  // ── No Safe Plan ─────────────────────────────────────────────────────────
  NO_SAFE_PLAYBOOK: "NO_SAFE_PLAYBOOK",
  // No eligible ACTIVE playbook matched the incident.

  NO_ACTIVE_PLAYBOOK: "NO_ACTIVE_PLAYBOOK",
  // Matching playbooks exist but none are in ACTIVE lifecycle state.

  // ── Infrastructure Gaps ──────────────────────────────────────────────────
  RUNBOOK_NOT_EXECUTABLE: "RUNBOOK_NOT_EXECUTABLE",
  // Referenced runbook is not ACTIVE or has no executable steps.

  MISSING_ACTION_HANDLER: "MISSING_ACTION_HANDLER",
  // At least one runbook step references a handler not registered in
  // ActionHandlerRegistry.

  // ── Data / Evidence ───────────────────────────────────────────────────────
  MISSING_EVIDENCE: "MISSING_EVIDENCE",
  // Required evidence fields are absent from the incident context.

  PARAMETER_UNRESOLVED: "PARAMETER_UNRESOLVED",
  // One or more required parameters could not be resolved from context.

  RESOURCE_AMBIGUOUS: "RESOURCE_AMBIGUOUS",
  // The incident targets multiple resources and AIRA cannot determine
  // which one to act on safely.

  // ── Pre-condition / Confidence ────────────────────────────────────────────
  PRECONDITION_FAILED: "PRECONDITION_FAILED",
  // A required pre-condition (e.g. health check) was not satisfied.

  INSUFFICIENT_CONFIDENCE: "INSUFFICIENT_CONFIDENCE",
  // Confidence score is below the configured threshold for autonomous action.

  // ── Approval / Policy ────────────────────────────────────────────────────
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  // Playbook policy requires human approval; execution is paused.
  // Distinct from MANUAL_REQUIRED: once approved, AIRA resumes automatically.

  APPROVAL_REJECTED: "APPROVAL_REJECTED",
  // A pending approval was explicitly rejected by an approver.

  POLICY_DENIED: "POLICY_DENIED",
  // Execution was blocked by organizational policy (e.g. maintenance window,
  // environment restrictions).

  SUGGEST_ONLY: "SUGGEST_ONLY",
  // Playbook is configured for suggestion-only mode; no autonomous action.

  // ── Safety Controls ───────────────────────────────────────────────────────
  KILL_SWITCH_ACTIVE: "KILL_SWITCH_ACTIVE",
  // A global or feature-level kill switch is engaged.

  BLAST_RADIUS_EXCEEDED: "BLAST_RADIUS_EXCEEDED",
  // The action's blast radius exceeds the configured safety threshold.

  HIGH_RISK_ACTION: "HIGH_RISK_ACTION",
  // Risk level is HIGH or CRITICAL and autonomous execution is not permitted.

  DESTRUCTIVE_ACTION: "DESTRUCTIVE_ACTION",
  // The action is classified as destructive (e.g. delete, drain, terminate).

  NON_REVERSIBLE_ACTION: "NON_REVERSIBLE_ACTION",
  // The action cannot be rolled back; requires explicit human authorization.

  SECURITY_VIOLATION: "SECURITY_VIOLATION",
  // Security validator detected a policy or parameter mapping violation.

  TENANT_BOUNDARY_VIOLATION: "TENANT_BOUNDARY_VIOLATION",
  // Attempted cross-tenant resource access was blocked.

  // ── Execution Failure ─────────────────────────────────────────────────────
  EXECUTION_FAILED: "EXECUTION_FAILED",
  // Execution started but encountered an unrecoverable error.

  RETRY_EXHAUSTED: "RETRY_EXHAUSTED",
  // All retry attempts were consumed without success.

  VERIFICATION_FAILED: "VERIFICATION_FAILED",
  // Post-execution verification did not confirm successful remediation.

  ROLLBACK_UNAVAILABLE: "ROLLBACK_UNAVAILABLE",
  // Rollback was needed but no rollback strategy is defined.

  ROLLBACK_FAILED: "ROLLBACK_FAILED",
  // Rollback was attempted but failed.

  // ── Infrastructure Connectivity ──────────────────────────────────────────
  INTEGRATION_UNAVAILABLE: "INTEGRATION_UNAVAILABLE",
  // Required external integration (API, service) is not reachable.

  INFRASTRUCTURE_UNREACHABLE: "INFRASTRUCTURE_UNREACHABLE",
  // Target infrastructure is unreachable (network partition, cluster down).
});

/**
 * Reason codes for WAITING_FOR_APPROVAL outcomes.
 * These are the specific approval trigger reasons.
 */
const APPROVAL_TRIGGER = Object.freeze({
  POLICY_REQUIRED: "POLICY_REQUIRED",
  // Organizational policy mandates approval for this action class.

  HIGH_RISK_PLAYBOOK: "HIGH_RISK_PLAYBOOK",
  // Playbook risk level is HIGH or CRITICAL.

  BLAST_RADIUS_THRESHOLD: "BLAST_RADIUS_THRESHOLD",
  // The action's blast radius exceeds the auto-approve threshold.

  CONDITIONAL_APPROVAL: "CONDITIONAL_APPROVAL",
  // Approval mode is CONDITIONAL and the evaluated condition was met.

  FIRST_EXECUTION: "FIRST_EXECUTION",
  // This is the first time this playbook is executing (trust establishment).

  MANUAL_APPROVAL_MODE: "MANUAL_APPROVAL_MODE",
  // Playbook approval.mode is explicitly MANUAL.
});

/**
 * Outcome reasons for AUTO_RESOLVED outcomes.
 * Describes how AIRA resolved the incident.
 */
const AUTO_RESOLVED_REASON = Object.freeze({
  PLAYBOOK_EXECUTED: "PLAYBOOK_EXECUTED",
  // A matching playbook executed successfully.

  SELF_HEALED: "SELF_HEALED",
  // The system recovered before AIRA could intervene (no action taken).

  VERIFICATION_PASSED: "VERIFICATION_PASSED",
  // All verification stages confirmed successful remediation.

  ROLLBACK_SUCCEEDED: "ROLLBACK_SUCCEEDED",
  // A failing execution was cleanly rolled back.
});

module.exports = {
  EXECUTION_OUTCOME,
  MANUAL_REASON,
  APPROVAL_TRIGGER,
  AUTO_RESOLVED_REASON,
};
