"use strict";

/**
 * AIRA Agent Reasoning Budgets
 *
 * Phase 12.12
 *
 * Central source of truth for bounded agent execution.
 *
 * Budgets are fail-closed safety boundaries, not performance hints.
 */

const DEFAULT_BUDGETS =
  Object.freeze({
    // ------------------------------------------------------------------------
    // Per workflow / incident run
    // ------------------------------------------------------------------------

    maxStepsPerIncident:
      50,

    maxToolCallsPerIncident:
      40,

    maxModelCallsPerIncident:
      20,

    maxRetriesPerIncident:
      20,

    maxInputTokensPerIncident:
      60_000,

    maxOutputTokensPerIncident:
      16_000,

    maxEstimatedCostPerIncident:
      5,

    maxConcurrentRuns:
      10,

    orchestratorTimeoutMs:
      120_000,

    // ------------------------------------------------------------------------
    // Per agent
    // ------------------------------------------------------------------------

    agentTimeoutMs:
      15_000,

    maxAgentRetries:
      2,

    maxModelCallsPerAgent:
      3,

    // ------------------------------------------------------------------------
    // Evidence / context
    // ------------------------------------------------------------------------

    maxEvidenceItems:
      50,

    maxEvidenceItemBytes:
      4096,

    maxLogLines:
      100,

    maxLogLineChars:
      512,

    maxContextChars:
      8000,

    // ------------------------------------------------------------------------
    // Model
    // ------------------------------------------------------------------------

    primaryModel:
      process.env
        .AIRA_PRIMARY_MODEL ||
      "gpt-4o-mini",

    fallbackModel:
      process.env
        .AIRA_FALLBACK_MODEL ||
      "gpt-3.5-turbo",

    temperature:
      0.1,

    maxResponseTokens:
      1024,

    providerTimeoutMs:
      10_000,

    providerMaxRetries:
      2,

    // ------------------------------------------------------------------------
    // Cache
    // ------------------------------------------------------------------------

    cacheTtlSeconds:
      300,

    cacheEnabled:
      true,
  });

function _numberEnv(
  key,
  fallback,
  {
    min = 0,
  } = {}
) {
  const raw =
    process.env[
      `AIRA_BUDGET_${key}`
    ];

  if (
    raw ===
    undefined
  ) {
    return fallback;
  }

  const parsed =
    Number(
      raw
    );

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <
      min
  ) {
    console.warn(
      `[agentBudgets] Invalid AIRA_BUDGET_${key}; using default ${fallback}`
    );

    return fallback;
  }

  return parsed;
}

function _booleanEnv(
  key,
  fallback
) {
  const raw =
    process.env[
      `AIRA_BUDGET_${key}`
    ];

  if (
    raw ===
    undefined
  ) {
    return fallback;
  }

  return String(
    raw
  )
    .trim()
    .toLowerCase() ===
    "true";
}

function loadBudgets() {
  return Object.freeze({
    maxStepsPerIncident:
      _numberEnv(
        "MAX_STEPS_PER_INCIDENT",
        DEFAULT_BUDGETS
          .maxStepsPerIncident,
        {
          min:
            1,
        }
      ),

    maxToolCallsPerIncident:
      _numberEnv(
        "MAX_TOOL_CALLS_PER_INCIDENT",
        DEFAULT_BUDGETS
          .maxToolCallsPerIncident,
        {
          min:
            1,
        }
      ),

    maxModelCallsPerIncident:
      _numberEnv(
        "MAX_MODEL_CALLS_PER_INCIDENT",
        DEFAULT_BUDGETS
          .maxModelCallsPerIncident,
        {
          min:
            1,
        }
      ),

    maxRetriesPerIncident:
      _numberEnv(
        "MAX_RETRIES_PER_INCIDENT",
        DEFAULT_BUDGETS
          .maxRetriesPerIncident
      ),

    maxInputTokensPerIncident:
      _numberEnv(
        "MAX_INPUT_TOKENS_PER_INCIDENT",
        DEFAULT_BUDGETS
          .maxInputTokensPerIncident,
        {
          min:
            1,
        }
      ),

    maxOutputTokensPerIncident:
      _numberEnv(
        "MAX_OUTPUT_TOKENS_PER_INCIDENT",
        DEFAULT_BUDGETS
          .maxOutputTokensPerIncident,
        {
          min:
            1,
        }
      ),

    maxEstimatedCostPerIncident:
      _numberEnv(
        "MAX_ESTIMATED_COST_PER_INCIDENT",
        DEFAULT_BUDGETS
          .maxEstimatedCostPerIncident
      ),

    maxConcurrentRuns:
      _numberEnv(
        "MAX_CONCURRENT_RUNS",
        DEFAULT_BUDGETS
          .maxConcurrentRuns,
        {
          min:
            1,
        }
      ),

    orchestratorTimeoutMs:
      _numberEnv(
        "ORCHESTRATOR_TIMEOUT_MS",
        DEFAULT_BUDGETS
          .orchestratorTimeoutMs,
        {
          min:
            1000,
        }
      ),

    agentTimeoutMs:
      _numberEnv(
        "AGENT_TIMEOUT_MS",
        DEFAULT_BUDGETS
          .agentTimeoutMs,
        {
          min:
            100,
        }
      ),

    maxAgentRetries:
      _numberEnv(
        "MAX_AGENT_RETRIES",
        DEFAULT_BUDGETS
          .maxAgentRetries
      ),

    maxModelCallsPerAgent:
      _numberEnv(
        "MAX_MODEL_CALLS_PER_AGENT",
        DEFAULT_BUDGETS
          .maxModelCallsPerAgent,
        {
          min:
            1,
        }
      ),

    maxEvidenceItems:
      _numberEnv(
        "MAX_EVIDENCE_ITEMS",
        DEFAULT_BUDGETS
          .maxEvidenceItems,
        {
          min:
            1,
        }
      ),

    maxEvidenceItemBytes:
      _numberEnv(
        "MAX_EVIDENCE_ITEM_BYTES",
        DEFAULT_BUDGETS
          .maxEvidenceItemBytes,
        {
          min:
            128,
        }
      ),

    maxLogLines:
      _numberEnv(
        "MAX_LOG_LINES",
        DEFAULT_BUDGETS
          .maxLogLines,
        {
          min:
            1,
        }
      ),

    maxLogLineChars:
      _numberEnv(
        "MAX_LOG_LINE_CHARS",
        DEFAULT_BUDGETS
          .maxLogLineChars,
        {
          min:
            32,
        }
      ),

    maxContextChars:
      _numberEnv(
        "MAX_CONTEXT_CHARS",
        DEFAULT_BUDGETS
          .maxContextChars,
        {
          min:
            256,
        }
      ),

    primaryModel:
      process.env
        .AIRA_PRIMARY_MODEL ||
      DEFAULT_BUDGETS
        .primaryModel,

    fallbackModel:
      process.env
        .AIRA_FALLBACK_MODEL ||
      DEFAULT_BUDGETS
        .fallbackModel,

    temperature:
      _numberEnv(
        "TEMPERATURE",
        DEFAULT_BUDGETS
          .temperature
      ),

    maxResponseTokens:
      _numberEnv(
        "MAX_RESPONSE_TOKENS",
        DEFAULT_BUDGETS
          .maxResponseTokens,
        {
          min:
            1,
        }
      ),

    providerTimeoutMs:
      _numberEnv(
        "PROVIDER_TIMEOUT_MS",
        DEFAULT_BUDGETS
          .providerTimeoutMs,
        {
          min:
            100,
        }
      ),

    providerMaxRetries:
      _numberEnv(
        "PROVIDER_MAX_RETRIES",
        DEFAULT_BUDGETS
          .providerMaxRetries
      ),

    cacheTtlSeconds:
      _numberEnv(
        "CACHE_TTL_SECONDS",
        DEFAULT_BUDGETS
          .cacheTtlSeconds
      ),

    cacheEnabled:
      _booleanEnv(
        "CACHE_ENABLED",
        DEFAULT_BUDGETS
          .cacheEnabled
      ),
  });
}

let _budgets =
  null;

function getAgentBudgets() {
  if (
    !_budgets
  ) {
    _budgets =
      loadBudgets();
  }

  return _budgets;
}

function resetAgentBudgets() {
  _budgets =
    null;
}

module.exports = {
  getAgentBudgets,
  resetAgentBudgets,
  DEFAULT_BUDGETS,
};