'use strict';

/**
 * Agent Intelligence Factory
 *
 * Phase 12.1 establishes one production runtime owner while keeping the
 * 15-agent system split into bounded logical stages.
 *
 * IMPORTANT:
 * - buildAgentOrchestrator() builds the compatibility workflow used by current
 *   manual/machine intelligence entry points.
 * - DiagnosisLifecycleService / DiagnosisCoordinator remain responsible for
 *   the richer diagnostic specialist graph.
 * - Production code must initialize exactly one AgentOrchestrator through
 *   initializeAgentOrchestrator() during startup and retrieve it through
 *   getAgentOrchestratorInstance().
 * - No agent receives direct infrastructure-mutation authority here.
 */

const { AgentOrchestrator } = require('./runtime/agentOrchestrator');

const {
  SafeReasoningProvider,
  MockReasoningProvider,
  configureReasoningProvider,
  getReasoningProvider,
} = require('./runtime/reasoningProvider');

const {
  getAgentBudgets,
} = require('./config/agentBudgets');

const {
  SymptomAnalysisAgent,
} = require('./agents/symptomAnalysisAgent');

const {
  CorrelationAgent,
} = require('./agents/correlationAgent');

const {
  TopologyAnalysisAgent,
} = require('./agents/topologyAnalysisAgent');

const {
  ChangeAnalysisAgent,
} = require('./agents/changeAnalysisAgent');

const {
  HistoricalAnalysisAgent,
} = require('./agents/historicalAnalysisAgent');

const {
  InvestigationAgent,
  reduceEvidencePackage,
} = require('./agents/investigationAgent');

const {
  RootCauseHypothesisAgent,
} = require('./agents/rootCauseHypothesisAgent');

const {
  DiagnosisAgent,
} = require('./agents/diagnosisAgent');

const {
  RiskImpactAgent,
} = require('./agents/riskImpactAgent');

const {
  PlaybookSelectionAgent,
} = require('./agents/playbookSelectionAgent');

const {
  ParameterResolutionAgent,
} = require('./agents/parameterResolutionAgent');

const {
  RecoveryMonitoringAgent,
} = require('./agents/recoveryMonitoringAgent');

const {
  VerificationCriticAgent,
} = require('./agents/verificationCriticAgent');

const {
  LearningAgent,
} = require('./agents/learningAgent');

const {
  ExplanationAgent,
} = require('./agents/explanationAgent');

/**
 * Frozen logical ownership map for all 15 Phase-12 agents.
 *
 * An agent may appear in more than one logical stage when the same persisted
 * result is consumed in multiple stages. That does not mean it should be run
 * twice automatically.
 */
const AGENT_ARCHITECTURE =
  Object.freeze({
    signalAndIncidentFormation:
      Object.freeze([
        'CorrelationAgent',
      ]),

    evidenceAndDiagnosis:
      Object.freeze([
        'InvestigationAgent',
        'SymptomAnalysisAgent',
        'TopologyAnalysisAgent',
        'ChangeAnalysisAgent',
        'HistoricalAnalysisAgent',
        'RootCauseHypothesisAgent',
        'DiagnosisAgent',
        'RiskImpactAgent',
        'VerificationCriticAgent',
      ]),

    recoveryPlanning:
      Object.freeze([
        'RiskImpactAgent',
        'PlaybookSelectionAgent',
        'ParameterResolutionAgent',
      ]),

    recoveryAssurance:
      Object.freeze([
        'RecoveryMonitoringAgent',
        'VerificationCriticAgent',
      ]),

    postOutcome:
      Object.freeze([
        'LearningAgent',
        'ExplanationAgent',
      ]),

    /*
     * These are deliberately NOT agents.
     *
     * They remain deterministic safety-control boundaries.
     */
    deterministicSafetyControl:
      Object.freeze([
        'POLICY',
        'APPROVAL',
        'AUTHORIZATION',
        'PLAYBOOK_RUNBOOK',
        'EXECUTION',
      ]),
  });

/**
 * Build the current compatibility orchestrator used by production manual and
 * machine-intelligence entry points.
 *
 * This is deliberately NOT a giant 15-agent orchestrator.
 *
 * Rich diagnostic specialist orchestration remains bounded in
 * DiagnosisCoordinator.
 *
 * @param {object} services
 * @param {object} config
 * @returns {AgentOrchestrator}
 */
function buildAgentOrchestrator(
  services = {},
  config = {}
) {
  const budgets =
    getAgentBudgets();

  const reasoningProvider =
    getReasoningProvider();

  const agentConfig = {
    reasoningProvider,
  };

  const agents = {
    correlationAgent:
      new CorrelationAgent(
        agentConfig
      ),

    investigationAgent:
      new InvestigationAgent(
        agentConfig
      ),

    diagnosisAgent:
      new DiagnosisAgent(
        agentConfig
      ),

    playbookSelectionAgent:
      new PlaybookSelectionAgent(
        agentConfig
      ),

    parameterResolutionAgent:
      new ParameterResolutionAgent(
        agentConfig
      ),

    recoveryMonitoringAgent:
      new RecoveryMonitoringAgent(
        agentConfig
      ),

    explanationAgent:
      new ExplanationAgent(
        agentConfig
      ),

    learningAgent:
      new LearningAgent(
        agentConfig
      ),
  };

  return new AgentOrchestrator(
    agents,
    services,
    {
      agentTimeoutMs:
        budgets.agentTimeoutMs,

      orchestratorTimeoutMs:
        budgets.orchestratorTimeoutMs,

      ...config,
    }
  );
}

// ============================================================================
// AUTHORITATIVE PRODUCTION RUNTIME OWNERSHIP
// ============================================================================

/*
 * There must be exactly one production singleton owner.
 *
 * AgentOrchestrator.js exports the runtime class only.
 *
 * Production routes/services must never create independent runtimes.
 */

let runtimeOrchestrator =
  null;

/**
 * Initialize the single production AgentOrchestrator.
 *
 * Repeated calls return the same instance.
 *
 * @param {object} services
 * @param {object} config
 * @returns {AgentOrchestrator}
 */
function initializeAgentOrchestrator(
  services = {},
  config = {}
) {
  if (
    runtimeOrchestrator
  ) {
    return runtimeOrchestrator;
  }

  runtimeOrchestrator =
    buildAgentOrchestrator(
      services,
      config
    );

  return runtimeOrchestrator;
}

/**
 * Retrieve the already initialized production AgentOrchestrator.
 *
 * Fail closed when startup did not initialize the runtime.
 *
 * @returns {AgentOrchestrator}
 */
function getAgentOrchestratorInstance() {
  if (
    !runtimeOrchestrator
  ) {
    throw new Error(
      'AgentOrchestrator has not been initialized. ' +
      'Call initializeAgentOrchestrator() during application startup.'
    );
  }

  return runtimeOrchestrator;
}

/**
 * TEST ONLY.
 *
 * Production code must never call this.
 */
function resetAgentOrchestratorInstance() {
  runtimeOrchestrator =
    null;
}

module.exports = {
  AGENT_ARCHITECTURE,

  buildAgentOrchestrator,
  initializeAgentOrchestrator,
  getAgentOrchestratorInstance,
  resetAgentOrchestratorInstance,

  configureReasoningProvider,
  getReasoningProvider,

  SafeReasoningProvider,
  MockReasoningProvider,

  // --------------------------------------------------------------------------
  // All 15 Phase-12 agents
  // --------------------------------------------------------------------------

  SymptomAnalysisAgent,
  CorrelationAgent,
  TopologyAnalysisAgent,
  ChangeAnalysisAgent,
  HistoricalAnalysisAgent,
  InvestigationAgent,
  RootCauseHypothesisAgent,
  DiagnosisAgent,
  RiskImpactAgent,
  PlaybookSelectionAgent,
  ParameterResolutionAgent,
  RecoveryMonitoringAgent,
  VerificationCriticAgent,
  LearningAgent,
  ExplanationAgent,

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  reduceEvidencePackage,
  getAgentBudgets,
};