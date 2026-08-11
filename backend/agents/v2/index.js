'use strict';

/**
 * Agent Intelligence Factory
 *
 * Assembles the complete 8-agent platform with all dependencies.
 * Returns a ready-to-use AgentOrchestrator.
 */

const { AgentOrchestrator } = require('./runtime/agentOrchestrator');
const { SafeReasoningProvider, MockReasoningProvider, configureReasoningProvider, getReasoningProvider } = require('./runtime/reasoningProvider');
const { getAgentBudgets } = require('./config/agentBudgets');

const { CorrelationAgent }          = require('./agents/correlationAgent');
const { InvestigationAgent, reduceEvidencePackage } = require('./agents/investigationAgent');
const { DiagnosisAgent }            = require('./agents/diagnosisAgent');
const { PlaybookSelectionAgent }    = require('./agents/playbookSelectionAgent');
const { ParameterResolutionAgent }  = require('./agents/parameterResolutionAgent');
const { RecoveryMonitoringAgent }   = require('./agents/recoveryMonitoringAgent');
const { ExplanationAgent }          = require('./agents/explanationAgent');
const { LearningAgent }             = require('./agents/learningAgent');

/**
 * Build the 8-agent orchestrator.
 *
 * @param {object} services - V1 frozen services (incidentPlaybookService, memoryService, etc.)
 * @param {object} config   - { dryRun, agentTimeoutMs, maxSteps, confidenceOverrides }
 * @returns {AgentOrchestrator}
 */
function buildAgentOrchestrator(services = {}, config = {}) {
  const budgets = getAgentBudgets();
  const reasoningProvider = getReasoningProvider();
  const agentConfig = { reasoningProvider };

  const agents = {
    correlationAgent:         new CorrelationAgent(agentConfig),
    investigationAgent:       new InvestigationAgent(agentConfig),
    diagnosisAgent:           new DiagnosisAgent(agentConfig),
    playbookSelectionAgent:   new PlaybookSelectionAgent(agentConfig),
    parameterResolutionAgent: new ParameterResolutionAgent(agentConfig),
    recoveryMonitoringAgent:  new RecoveryMonitoringAgent(agentConfig),
    explanationAgent:         new ExplanationAgent(agentConfig),
    learningAgent:            new LearningAgent(agentConfig),
  };

  return new AgentOrchestrator(agents, services, {
    agentTimeoutMs:    budgets.agentTimeoutMs,
    orchestratorTimeoutMs: budgets.orchestratorTimeoutMs,
    ...config,       // caller overrides last
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Authoritative Runtime Orchestrator
// ─────────────────────────────────────────────────────────────────────────────
//
// buildAgentOrchestrator() remains available for isolated unit/integration tests.
//
// Production code MUST use initializeAgentOrchestrator() once at startup and
// getAgentOrchestratorInstance() afterwards.
//
// This prevents routes/services from silently creating independent agent
// pipelines with different configuration or dependencies.

let runtimeOrchestrator = null;

/**
 * Initialise the single production AgentOrchestrator instance.
 *
 * Safe to call multiple times; only the first call creates the runtime.
 *
 * @param {object} services
 * @param {object} config
 * @returns {AgentOrchestrator}
 */
function initializeAgentOrchestrator(services = {}, config = {}) {
  if (runtimeOrchestrator) {
    return runtimeOrchestrator;
  }

  runtimeOrchestrator = buildAgentOrchestrator(services, config);

  return runtimeOrchestrator;
}

/**
 * Return the already-initialised production orchestrator.
 *
 * Production callers should NOT construct their own orchestrator.
 */
function getAgentOrchestratorInstance() {
  if (!runtimeOrchestrator) {
    throw new Error(
      'AgentOrchestrator has not been initialized. ' +
      'Call initializeAgentOrchestrator() during application startup.'
    );
  }

  return runtimeOrchestrator;
}

/**
 * Test-only helper.
 */
function resetAgentOrchestratorInstance() {
  runtimeOrchestrator = null;
}

module.exports = {
  buildAgentOrchestrator,
  initializeAgentOrchestrator,
  getAgentOrchestratorInstance,
  resetAgentOrchestratorInstance,
  configureReasoningProvider,
  getReasoningProvider,
  SafeReasoningProvider,
  MockReasoningProvider,
  // Re-export agents for direct use / testing
  CorrelationAgent,
  InvestigationAgent,
  DiagnosisAgent,
  PlaybookSelectionAgent,
  ParameterResolutionAgent,
  RecoveryMonitoringAgent,
  ExplanationAgent,
  LearningAgent,
  // Utilities
  reduceEvidencePackage,
  getAgentBudgets,
};
