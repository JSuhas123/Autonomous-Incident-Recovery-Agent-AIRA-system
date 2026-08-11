'use strict';

/**
 * AIRA Platform V1 — Domain Interface Contracts
 *
 * This file is the single source of truth for all exported V1 service interfaces.
 * Any breaking change to these exports REQUIRES a semver major bump and MUST update
 * this file along with the corresponding CHANGELOG entry.
 *
 * V1 FREEZE NOTICE: The contracts below are frozen as of V1. Future agents,
 * plugins, and integrations MUST depend on these interfaces — not on internal
 * module paths.
 */

// ── Constants ─────────────────────────────────────────────────────────────

const runbookConstants   = require('../constants/runbook');
const playbookConstants  = require('../constants/playbook');
const executionOutcomes  = require('../constants/executionOutcomes');

// ── Runbook Platform V1 ────────────────────────────────────────────────────

const { getRunbookRegistry, RunbookRegistry }     = require('../runbooks/registry/runbookRegistry');
const { getRunbookExecutionEngine }               = require('../runbooks/execution/runbookExecutionEngine');
const { getActionHandlerRegistry }                = require('../runbooks/actions/actionHandlerRegistry');
const { validateRunbook }                         = require('../runbooks/validators/runbookValidator');
const { computeRunbookChecksum }                  = require('../runbooks/versioning/runbookVersioning');

// ── Playbook Platform V1 ───────────────────────────────────────────────────

const { getPlaybookRegistry, PlaybookRegistry }   = require('../playbooks/registry/playbookRegistry');
const { getPlaybookExecutionService }             = require('../playbooks/execution/playbookExecutionService');
const { matchPlaybooks, resolveMatchOutcome }     = require('../playbooks/matching/playbookMatcher');
const { validatePlaybook }                        = require('../playbooks/validators/playbookValidator');
const { mapParameters }                           = require('../playbooks/parameters/playbookParameterMapper');
const { computePlaybookChecksum }                 = require('../playbooks/versioning/playbookVersioning');

// ── V1 Exports ────────────────────────────────────────────────────────────

module.exports = {
  // ── Constants ─────────────────────────────────────────────────────────

  /** Runbook lifecycle, step types, ID regex */
  RUNBOOK: runbookConstants,

  /** Playbook lifecycle, stage types, approval modes, execution status */
  PLAYBOOK: playbookConstants,

  /**
   * Execution outcome enums:
   *   EXECUTION_OUTCOME — AUTO_RESOLVED / WAITING_FOR_APPROVAL / MANUAL_REQUIRED
   *   MANUAL_REASON     — 27 reason codes
   *   APPROVAL_TRIGGER  — 6 approval trigger codes
   *   AUTO_RESOLVED_REASON — 4 resolution codes
   */
  EXECUTION_OUTCOMES: executionOutcomes,

  // ── Runbook Platform ──────────────────────────────────────────────────

  /**
   * RunbookRegistry — singleton lifecycle manager for Runbook definitions.
   *
   * V1 Contract:
   *   register(runbook)       → registers a runbook definition
   *   getById(id)             → returns all versions
   *   getVersion(id, semver)  → returns exact version
   *   activate(id, semver)    → transitions to ACTIVE lifecycle
   *   getRunbookForExecution(id, semver, tenantId) → frozen snapshot
   */
  getRunbookRegistry,
  RunbookRegistry,

  /**
   * RunbookExecutionEngine — singleton that executes a Runbook step-by-step.
   *
   * V1 Contract:
   *   execute(runbookId, semver, input, context) → RunbookExecution record
   *   The engine is the ONLY entry point for action execution.
   *   No caller (Playbook, Agent, API) may invoke ActionHandlerRegistry directly.
   */
  getRunbookExecutionEngine,

  /**
   * ActionHandlerRegistry — registers and resolves action handlers.
   *
   * V1 Contract:
   *   register(type, handler) → registers a handler function
   *   execute(type, params, context) → executes the action
   *   list() → returns all registered handler types
   *
   * WARNING: Must only be called by RunbookExecutionEngine, never directly.
   */
  getActionHandlerRegistry,

  /** validateRunbook(runbook, options) → { valid, diagnostics, summary } */
  validateRunbook,

  /** computeRunbookChecksum(runbook) → SHA-256 hex string */
  computeRunbookChecksum,

  // ── Playbook Platform ─────────────────────────────────────────────────

  /**
   * PlaybookRegistry — singleton lifecycle manager for Playbook definitions.
   *
   * V1 Contract:
   *   register(playbook, options)  → registers a playbook definition
   *   getById(id)                  → all versions
   *   getVersion(id, semver)       → exact version
   *   approve(id, semver)          → VALIDATED → APPROVED
   *   activate(id, semver, opts)   → APPROVED → ACTIVE (requires all runbooks ACTIVE)
   *   getExecutionDefinition(id, v)→ immutable frozen snapshot for execution
   *   isExecutable(entry)          → true only when lifecycle === ACTIVE
   *
   * INVARIANT: A Playbook MUST NEVER directly execute infrastructure.
   *            Execution MUST flow: Playbook → Runbook Registry → RunbookExecutionEngine → ActionHandler
   */
  getPlaybookRegistry,
  PlaybookRegistry,

  /**
   * PlaybookExecutionService — orchestrates multi-stage playbook execution.
   *
   * V1 Contract:
   *   execute(playbookId, semver, incident, context) → PlaybookExecution record
   *   The service delegates stage execution to RunbookExecutionEngine.
   *   Never calls ActionHandlerRegistry directly.
   */
  getPlaybookExecutionService,

  /**
   * matchPlaybooks(playbooks, incident, options) → MatchResult[]
   * resolveMatchOutcome(matchResults, incident)  → MatchOutcome
   *
   * V1 Contract:
   *   matchPlaybooks is deterministic, score-based, and side-effect-free.
   *   resolveMatchOutcome returns one of:
   *     { outcome: 'AUTO_RESOLVED', best, eligible }
   *     { outcome: 'WAITING_FOR_APPROVAL', reason, eligible }
   *     { outcome: 'MANUAL_REQUIRED', reason, escalationRecommendation }
   */
  matchPlaybooks,
  resolveMatchOutcome,

  /** validatePlaybook(playbook, options) → { valid, diagnostics, summary } */
  validatePlaybook,

  /**
   * mapParameters(parameterMappings, context, runbookParams)
   * → { mapped, missing, provenance, errors }
   *
   * Safe ${root.path} resolution with prototype pollution protection.
   * Max path depth: 5 levels. Blocked segments: __proto__, constructor, prototype.
   */
  mapParameters,

  /** computePlaybookChecksum(playbook) → SHA-256 hex string */
  computePlaybookChecksum,
};
