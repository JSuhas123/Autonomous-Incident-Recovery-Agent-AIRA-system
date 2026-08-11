'use strict';

/**
 * Agent Reasoning Budgets
 *
 * Central configuration for all cost and safety limits across the v2 agent platform.
 * No agent may hardcode expensive defaults — they must read from here.
 *
 * All values can be overridden via environment variables.
 */

const DEFAULT_BUDGETS = Object.freeze({
  // ── Per-incident orchestration ────────────────────────────────────────────
  /** Max total model calls across all 8 agents for a single incident */
  maxModelCallsPerIncident: 20,
  /** Max concurrent agent runs per orchestrator instance */
  maxConcurrentRuns: 10,
  /** Total orchestrator wall-clock timeout (ms) */
  orchestratorTimeoutMs: 120_000,

  // ── Per-agent limits ─────────────────────────────────────────────────────
  /** Default single-agent execution timeout (ms) */
  agentTimeoutMs: 15_000,
  /** Max reasoning retries per agent before MANUAL_REQUIRED */
  maxAgentRetries: 2,
  /** Max model calls a single agent may make per incident */
  maxModelCallsPerAgent: 3,

  // ── Evidence / context size ───────────────────────────────────────────────
  /** Max evidence items passed to any agent */
  maxEvidenceItems: 50,
  /** Max bytes of a single evidence item's structured data */
  maxEvidenceItemBytes: 4_096,
  /** Max log lines extracted per evidence source */
  maxLogLines: 100,
  /** Max characters per log line before truncation */
  maxLogLineChars: 512,
  /** Max characters of structured context passed to model */
  maxContextChars: 8_000,

  // ── Model configuration ───────────────────────────────────────────────────
  /** Primary model identifier (provider-specific string) */
  primaryModel: process.env.AIRA_PRIMARY_MODEL || 'gpt-4o-mini',
  /** Fallback model used when primary is rate-limited / unavailable */
  fallbackModel: process.env.AIRA_FALLBACK_MODEL || 'gpt-3.5-turbo',
  /** Reasoning temperature (low = deterministic) */
  temperature: 0.1,
  /** Max tokens per model response */
  maxResponseTokens: 1_024,

  // ── Cache ─────────────────────────────────────────────────────────────────
  /** Seconds before a cached agent result is considered stale */
  cacheTtlSeconds: 300,
  /** Cache is per (tenantId + incidentId + agentName + evidenceFingerprint) */
  cacheEnabled: true,

  // ── Provider / fallback ───────────────────────────────────────────────────
  /** ms before a model call is considered timed out */
  providerTimeoutMs: 10_000,
  /** Max provider-level retries before falling back */
  providerMaxRetries: 2,
});

/**
 * Merge environment variable overrides onto defaults.
 * Each budget key can be overridden by AIRA_BUDGET_<KEY_UPPER_SNAKE>.
 */
function loadBudgets() {
  const env = (key, dflt) => {
    const v = process.env[`AIRA_BUDGET_${key}`];
    return v !== undefined ? (typeof dflt === 'number' ? Number(v) : v === 'true') : dflt;
  };

  return Object.freeze({
    maxModelCallsPerIncident:  env('MAX_MODEL_CALLS_PER_INCIDENT',   DEFAULT_BUDGETS.maxModelCallsPerIncident),
    maxConcurrentRuns:         env('MAX_CONCURRENT_RUNS',            DEFAULT_BUDGETS.maxConcurrentRuns),
    orchestratorTimeoutMs:     env('ORCHESTRATOR_TIMEOUT_MS',        DEFAULT_BUDGETS.orchestratorTimeoutMs),
    agentTimeoutMs:            env('AGENT_TIMEOUT_MS',               DEFAULT_BUDGETS.agentTimeoutMs),
    maxAgentRetries:           env('MAX_AGENT_RETRIES',              DEFAULT_BUDGETS.maxAgentRetries),
    maxModelCallsPerAgent:     env('MAX_MODEL_CALLS_PER_AGENT',      DEFAULT_BUDGETS.maxModelCallsPerAgent),
    maxEvidenceItems:          env('MAX_EVIDENCE_ITEMS',             DEFAULT_BUDGETS.maxEvidenceItems),
    maxEvidenceItemBytes:      env('MAX_EVIDENCE_ITEM_BYTES',        DEFAULT_BUDGETS.maxEvidenceItemBytes),
    maxLogLines:               env('MAX_LOG_LINES',                  DEFAULT_BUDGETS.maxLogLines),
    maxLogLineChars:           env('MAX_LOG_LINE_CHARS',             DEFAULT_BUDGETS.maxLogLineChars),
    maxContextChars:           env('MAX_CONTEXT_CHARS',              DEFAULT_BUDGETS.maxContextChars),
    primaryModel:              process.env.AIRA_PRIMARY_MODEL       || DEFAULT_BUDGETS.primaryModel,
    fallbackModel:             process.env.AIRA_FALLBACK_MODEL      || DEFAULT_BUDGETS.fallbackModel,
    temperature:               env('TEMPERATURE',                    DEFAULT_BUDGETS.temperature),
    maxResponseTokens:         env('MAX_RESPONSE_TOKENS',            DEFAULT_BUDGETS.maxResponseTokens),
    cacheTtlSeconds:           env('CACHE_TTL_SECONDS',              DEFAULT_BUDGETS.cacheTtlSeconds),
    cacheEnabled:              env('CACHE_ENABLED',                  DEFAULT_BUDGETS.cacheEnabled),
    providerTimeoutMs:         env('PROVIDER_TIMEOUT_MS',            DEFAULT_BUDGETS.providerTimeoutMs),
    providerMaxRetries:        env('PROVIDER_MAX_RETRIES',           DEFAULT_BUDGETS.providerMaxRetries),
  });
}

let _budgets = null;

/** Returns the singleton budget config (loaded once, then cached). */
function getAgentBudgets() {
  if (!_budgets) _budgets = loadBudgets();
  return _budgets;
}

/** Reset cached budgets (test helper). */
function resetAgentBudgets() {
  _budgets = null;
}

module.exports = { getAgentBudgets, resetAgentBudgets, DEFAULT_BUDGETS };
