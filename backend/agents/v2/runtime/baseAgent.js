'use strict';

/**
 * Agent Base Class
 *
 * All 8 agents extend this. Enforces contract compliance.
 *
 * SAFETY INVARIANT:
 * - execute() must return an AgentExecutionRecord
 * - No agent may call infrastructure mutation APIs directly
 * - Confidence must be surfaced — not hidden
 */

const {
  AGENT_STATUS,
  AGENT_MANUAL_REASON,
  createAgentExecutionRecord,
} = require('../contracts/agentContracts');

class BaseAgent {
  /**
   * @param {string} name     - Agent identifier
   * @param {string} version  - Semver
   */
  constructor(name, version) {
    this._name    = name;
    this._version = version;
  }

  get name()    { return this._name; }
  get version() { return this._version; }

  /**
   * Validate input context before execution.
   * Override to add agent-specific validation.
   *
   * @param {object} context - AgentContext
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateInput(context) {
    const errors = [];
    if (!context)              errors.push('context is required');
    if (!context?.incidentId)  errors.push('context.incidentId is required');
    if (!context?.tenantId)    errors.push('context.tenantId is required');
    return { valid: errors.length === 0, errors };
  }

  /**
   * Execute agent logic.
   *
   * @param {object} context      - AgentContext (treat as immutable)
   * @param {object} dependencies - Injected services
   * @returns {Promise<AgentExecutionRecord>}
   */
  async execute(context, dependencies = {}) {
    throw new Error(`${this._name}.execute() must be implemented`);
  }

  /**
   * Validate agent output.
   * Override to add agent-specific output validation.
   *
   * @param {object} result - Output from execute()
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateOutput(result) {
    const errors = [];
    if (!result)         errors.push('result is required');
    if (!result?.status) errors.push('result.status is required');
    return { valid: errors.length === 0, errors };
  }

  /**
   * Describe agent capabilities for orchestrator.
   */
  getCapabilities() {
    return {
      name:    this._name,
      version: this._version,
      reads:   [],
      writes:  [],
      requiresLLM: false,
    };
  }

  // ── Protected helpers ───────────────────────────────────────────────────

  /**
   * Build a SUCCESS execution record.
   */
  _success(startedAt, result, opts = {}) {
    return createAgentExecutionRecord({
      agent: this._name,
      version: this._version,
      status: AGENT_STATUS.SUCCESS,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      confidence: opts.confidence ?? null,
      evidenceUsed: opts.evidenceUsed || [],
      result,
      warnings: opts.warnings || [],
      model: opts.model || null,
      provider: opts.provider || null,
      fallbackUsed: opts.fallbackUsed || false,
    });
  }

  /**
   * Build a FAILED execution record.
   */
  _fail(startedAt, error, opts = {}) {
    return createAgentExecutionRecord({
      agent: this._name,
      version: this._version,
      status: AGENT_STATUS.FAILED,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      confidence: 0,
      evidenceUsed: opts.evidenceUsed || [],
      result: null,
      warnings: opts.warnings || [],
      error: error?.message || String(error),
    });
  }

  /**
   * Build a MANUAL_REQUIRED execution record.
   */
  _manual(startedAt, reason, opts = {}) {
    return createAgentExecutionRecord({
      agent: this._name,
      version: this._version,
      status: AGENT_STATUS.MANUAL_REQUIRED,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      confidence: opts.confidence ?? 0,
      evidenceUsed: opts.evidenceUsed || [],
      result: { manualReason: reason },
      warnings: opts.warnings || [],
      error: null,
    });
  }
}

module.exports = { BaseAgent };
