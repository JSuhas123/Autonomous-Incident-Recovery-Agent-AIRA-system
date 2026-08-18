'use strict';

/**
 * Agent Orchestrator — Incident Intelligence Orchestrator
 *
 * High-level compatibility workflow for production agent-intelligence
 * entry points.
 *
 * Phase 12.1:
 *
 * - This class is NOT the owner of all 15 agents.
 *
 * - Rich diagnostic specialist orchestration remains bounded inside
 *   DiagnosisLifecycleService / DiagnosisCoordinator.
 *
 * - Production singleton ownership lives exclusively in agents/v2/index.js.
 *
 * SAFETY INVARIANTS:
 *
 * - Agents do NOT call each other.
 * - Orchestrator controls the workflow.
 * - Execution handoff happens only through the existing safe
 *   IncidentPlaybookService boundary.
 * - Tenant boundaries remain preserved.
 * - Maximum orchestration steps are enforced.
 * - Every agent has a timeout.
 * - Agent failures fail closed into MANUAL_REQUIRED.
 * - Parameter ambiguity fails closed.
 * - No raw agent output reaches infrastructure mutation directly.
 * - Agents cannot bypass policy / approval / authorization.
 */

const {
  v4: uuidv4,
} =
  require(
    'uuid'
  );

const {
  ORCHESTRATION_STATE,
  AGENT_STATUS,
  AGENT_MANUAL_REASON,
  PLAYBOOK_RECOMMENDATION,
  createAgentContext,
} =
  require(
    '../contracts/agentContracts'
  );

  const {
  getAgentBudgets,
} =
  require(
    "../config/agentBudgets"
  );

const {
  BUDGET_ERROR_CODE,
  createBudgetRun,
  withBudgetRun,
  consumeStep,
  consumeToolCall,
  wrapToolDependencies,
  snapshotBudgetRun,
} =
  require(
    "./agentBudgetRuntime"
  );

  const {
  assertAgentPermissions,
} =
  require(
    "../config/agentPermissions"
  );

const {
  getConfidenceModel,
  CONFIDENCE_DIMENSION,
} =
  require(
    '../contracts/confidenceModel'
  );

const {
  EXECUTION_OUTCOME,
  MANUAL_REASON,
} =
  require(
    '../../../constants/executionOutcomes'
  );


class AgentOrchestrator {
  /**
   * @param {object} agents
   *
   * Current compatibility agents:
   *
   * correlationAgent
   * investigationAgent
   * diagnosisAgent
   * playbookSelectionAgent
   * parameterResolutionAgent
   * recoveryMonitoringAgent
   * explanationAgent
   * learningAgent
   *
   * Specialist diagnostic agents remain owned by DiagnosisCoordinator.
   *
   * @param {object} services
   * @param {object} config
   */
  constructor(
  agents = {},
  services = {},
  config = {}
) {
  this._agents =
    agents;

  this._services =
    services;

  this._config =
    config;

  this._budgets =
    getAgentBudgets();

  this._confidence =
    getConfidenceModel(
      config
        .confidenceOverrides
    );

  this._stepLimit =
    Number(
      config.maxSteps ||
      this._budgets
        .maxStepsPerIncident
    );

  this._agentTimeout =
    Math.min(
      Number(
        config.agentTimeoutMs ||
        this._budgets
          .agentTimeoutMs
      ),
      this._budgets
        .agentTimeoutMs
    );
}

  /**
   * Run the current production compatibility intelligence workflow.
   *
   * IMPORTANT:
   *
   * This method is NOT permission to bypass the existing diagnosis lifecycle,
   * policy engine, approval system, authorization engine, runbooks or
   * deterministic execution controls.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async run(
    input
  ) {
    const runId =
      uuidv4();

    const startedAt =
      new Date();


    const ctx =
      createAgentContext({
        incidentId:
          input.incidentId ||
          uuidv4(),

        correlationId:
          input.correlationId ||
          uuidv4(),

        tenantId:
          input.tenantId,

        incident:
          input.incident ||
          {},

        signals:
          input.signals ||
          [],

        alerts:
          input.alerts ||
          [],

        metrics:
          input.metrics ||
          {},

        logs:
          input.logs ||
          [],

        traces:
          input.traces ||
          [],

        events:
          input.events ||
          [],

        service:
          input.service ||
          {},

        dependencies:
          input.dependencies ||
          [],

        environment:
          input.environment ||
          null,

        provider:
          input.provider ||
          null,

        resource:
          input.resource ||
          {},

        timing: {
          startedAt:
            startedAt.toISOString(),
        },
      });

    const runRecord = {
      runId,

      incidentId:
        ctx.incidentId,

      correlationId:
        ctx.correlationId,

      tenantId:
        ctx.tenantId,

      state:
        ORCHESTRATION_STATE
          .RECEIVED,

      startedAt:
        startedAt.toISOString(),

      completedAt:
        null,

      agentTrace:
        [],

      manualRequired:
        false,

      manualReason:
        null,

      executionResult:
        null,

      explanationResult:
        null,

      learningResult:
        null,

      error:
        null,
    };

    createBudgetRun({
  runId:
    runRecord.runId,

  incidentId:
    runRecord.incidentId,

  overrides: {
    maxStepsPerIncident:
      this._stepLimit,

    agentTimeoutMs:
      this._agentTimeout,
  },
});

ctx.metadata = {
  ...(
    ctx.metadata ||
    {}
  ),

  budgetRunId:
    runRecord.runId,
};

    const advance =
  (
    state
  ) => {
    consumeStep(
      runRecord
        .runId,

      state
    );

    runRecord.state =
      state;
  };

    try {
      // ======================================================================
      // STAGE 1 — SIGNAL CORRELATION
      // ======================================================================

      advance(
        ORCHESTRATION_STATE
          .CORRELATING
      );

      const corrRecord =
        await this._runAgent(
          'correlationAgent',
          ctx,
          {}
        );

      runRecord
        .agentTrace
        .push(
          corrRecord
        );

      if (
        corrRecord.status ===
        AGENT_STATUS
          .MANUAL_REQUIRED
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          corrRecord
            .result
            ?.manualReason ||
            AGENT_MANUAL_REASON
              .AGENT_UNAVAILABLE
        );
      }

      if (
        corrRecord.status ===
        AGENT_STATUS
          .FAILED
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          AGENT_MANUAL_REASON
            .AGENT_UNAVAILABLE
        );
      }

      _mergeCorrelation(
        ctx,
        corrRecord.result
      );

      const corrConf =
        this._confidence
          .evaluate(
            CONFIDENCE_DIMENSION
              .CORRELATION,

            corrRecord.confidence ||
              0
          );

      if (
        corrConf.belowMin
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          AGENT_MANUAL_REASON
            .AGENT_CONFIDENCE_TOO_LOW
        );
      }

      // ======================================================================
      // STAGE 2 — INVESTIGATION
      // ======================================================================

      advance(
        ORCHESTRATION_STATE
          .INVESTIGATING
      );

      const invRecord =
        await this._runAgent(
          'investigationAgent',
          ctx,
          {}
        );

      runRecord
        .agentTrace
        .push(
          invRecord
        );

      if (
        _agentBlocksFlow(
          invRecord
        )
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          _agentReason(
            invRecord
          )
        );
      }

      ctx.evidence =
        invRecord
          .result
          ?.evidencePackage ||
        null;

      const evComp =
        invRecord
          .result
          ?.evidencePackage
          ?.completeness ||
        0;

      const evConf =
        this._confidence
          .evaluate(
            CONFIDENCE_DIMENSION
              .EVIDENCE_COMPLETENESS,

            evComp
          );

      if (
        evConf.belowMin
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          AGENT_MANUAL_REASON
            .AGENT_CONFIDENCE_TOO_LOW
        );
      }

      // ======================================================================
      // STAGE 3 — DIAGNOSIS
      // ======================================================================

      advance(
        ORCHESTRATION_STATE
          .DIAGNOSING
      );

      const diagRecord =
        await this._runAgent(
          'diagnosisAgent',
          ctx,
          {}
        );

      /*
       * IMPORTANT:
       *
       * The previous implementation pushed diagRecord twice.
       * That produced an incorrect decision trace.
       *
       * It must be recorded exactly once.
       */
      runRecord
        .agentTrace
        .push(
          diagRecord
        );

      if (
        _agentBlocksFlow(
          diagRecord
        )
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          _agentReason(
            diagRecord
          )
        );
      }

      ctx.diagnosis =
        diagRecord
          .result
          ?.diagnosisResult ||
        null;

      const diagConf =
        this._confidence
          .evaluate(
            CONFIDENCE_DIMENSION
              .DIAGNOSIS,

            ctx
              .diagnosis
              ?.diagnosisConfidence ||
              0
          );

      if (
        diagConf.belowMin
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          AGENT_MANUAL_REASON
            .AGENT_CONFIDENCE_TOO_LOW
        );
      }

      // ======================================================================
      // STAGE 4 — PLAYBOOK SELECTION
      // ======================================================================

      advance(
        ORCHESTRATION_STATE
          .SELECTING_PLAYBOOK
      );

      const pbRecord =
        await this._runAgent(
          'playbookSelectionAgent',
          ctx,
          {
            incidentPlaybookService:
              this
                ._services
                .incidentPlaybookService,
          }
        );

      runRecord
        .agentTrace
        .push(
          pbRecord
        );

      if (
        _agentBlocksFlow(
          pbRecord
        )
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          _agentReason(
            pbRecord
          )
        );
      }

      const pbRec =
        pbRecord
          .result
          ?.recommendation;

      ctx.playbookCandidates =
        pbRecord
          .result
          ?.candidateRankings ||
        [];

      ctx.selectedPlaybook =
        pbRecord
          .result
          ?.recommendedPlaybookId
          ? {
              playbookId:
                pbRecord
                  .result
                  .recommendedPlaybookId,

              semver:
                pbRecord
                  .result
                  .version,
            }
          : null;

      if (
        pbRec ===
          PLAYBOOK_RECOMMENDATION
            .MANUAL_REQUIRED ||
        !ctx.selectedPlaybook
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          MANUAL_REASON
            .NO_SAFE_PLAYBOOK
        );
      }

      if (
        pbRec ===
        PLAYBOOK_RECOMMENDATION
          .COLLECT_MORE_EVIDENCE
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          MANUAL_REASON
            .MISSING_EVIDENCE
        );
      }

      const pbConf =
        this._confidence
          .evaluate(
            CONFIDENCE_DIMENSION
              .PLAYBOOK_SELECTION,

            pbRecord.confidence ||
              0
          );

      if (
        pbConf.belowMin
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          AGENT_MANUAL_REASON
            .AGENT_CONFIDENCE_TOO_LOW
        );
      }

      // ======================================================================
      // STAGE 5 — PARAMETER RESOLUTION
      // ======================================================================

      advance(
        ORCHESTRATION_STATE
          .RESOLVING_PARAMETERS
      );

      const paramRecord =
        await this._runAgent(
          'parameterResolutionAgent',
          ctx,
          {}
        );

      runRecord
        .agentTrace
        .push(
          paramRecord
        );

      if (
        _agentBlocksFlow(
          paramRecord
        )
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          _agentReason(
            paramRecord
          )
        );
      }

      ctx.resolvedParameters =
        paramRecord
          .result
          ?.deterministicResolutionResult ||
        null;

      if (
        !paramRecord
          .result
          ?.readyForExecution
      ) {
        const unresolved =
          paramRecord
            .result
            ?.unresolved ||
          [];

        const ambiguous =
          paramRecord
            .result
            ?.ambiguous ||
          [];

        /*
         * SAFETY:
         *
         * Ambiguous infrastructure identity must NEVER be guessed.
         */
        if (
          ambiguous.length >
          0
        ) {
          return this._manualResult(
            runRecord,
            ctx,
            MANUAL_REASON
              .RESOURCE_AMBIGUOUS
          );
        }

        if (
          unresolved.length >
          0
        ) {
          return this._manualResult(
            runRecord,
            ctx,
            MANUAL_REASON
              .PARAMETER_UNRESOLVED
          );
        }

        return this._manualResult(
          runRecord,
          ctx,
          MANUAL_REASON
            .PARAMETER_UNRESOLVED
        );
      }

      const paramConf =
        this._confidence
          .evaluate(
            CONFIDENCE_DIMENSION
              .PARAMETER,

            paramRecord.confidence ||
              0
          );

      if (
        paramConf.belowMin
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          AGENT_MANUAL_REASON
            .AGENT_CONFIDENCE_TOO_LOW
        );
      }

      // ======================================================================
      // STAGE 6 — SAFE EXECUTION HANDOFF
      // ======================================================================

      advance(
        ORCHESTRATION_STATE
          .READY_FOR_EXECUTION
      );

      advance(
        ORCHESTRATION_STATE
          .EXECUTING
      );

      let executionResult =
        null;

      /*
       * AI does NOT execute infrastructure here.
       *
       * The handoff goes through IncidentPlaybookService, which remains behind
       * AIRA's existing playbook / policy / approval / authorization /
       * deterministic execution controls.
       */
      if (
  this
    ._services
    .incidentPlaybookService
) {
  try {
    /*
     * Phase 12.12:
     *
     * The deterministic execution handoff is itself an external tool/service
     * invocation and therefore consumes the incident tool-call budget.
     */
    consumeToolCall(
      runRecord.runId,
      "IncidentPlaybookService.executeForIncident"
    );

    executionResult =
      await this
        ._services
        .incidentPlaybookService
        .executeForIncident(
                ctx.incident,
                {
                  tenantId:
                    ctx.tenantId,

                  correlationId:
                    ctx.correlationId,

                  initiatedBy:
                    'agent-orchestrator',

                  dryRun:
                    this
                      ._config
                      .dryRun ||
                    false,

                  policyDecision:
                    ctx.policyDecision,
                }
              );

          ctx.playbookExecutionId =
            executionResult
              ?.execution
              ?.executionId ||
            null;

          ctx.policyDecision =
            executionResult
              ?.execution
              ?.policyDecision ||
            null;
        } catch (
  execErr
) {
  return this._manualResult(
    runRecord,
    ctx,

    execErr
      ?.code ===
      BUDGET_ERROR_CODE
      ? "AGENT_BUDGET_EXCEEDED"
      : MANUAL_REASON
          .EXECUTION_FAILED,

    execErr
  );
}
      }

      runRecord.executionResult =
        executionResult;

      ctx.verificationResults =
        executionResult
          ?.execution
          ?.verificationResults ||
        [];

      ctx.rollbackResults =
        executionResult
          ?.execution
          ?.rollbackResults ||
        [];

      if (
        executionResult
          ?.outcome ===
        EXECUTION_OUTCOME
          .WAITING_FOR_APPROVAL
      ) {
        runRecord.state =
          ORCHESTRATION_STATE
            .MANUAL_REQUIRED;

        runRecord.manualRequired =
          true;

        runRecord.manualReason =
          MANUAL_REASON
            .APPROVAL_REQUIRED;

        /*
         * Do not busy-loop.
         *
         * The workflow must wait for the existing approval lifecycle.
         */
        return this._finalize(
          runRecord,
          ctx
        );
      }

      if (
        executionResult
          ?.outcome ===
        EXECUTION_OUTCOME
          .MANUAL_REQUIRED
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          executionResult.reason ||
            MANUAL_REASON
              .NO_SAFE_PLAYBOOK
        );
      }

      // ======================================================================
      // STAGE 7 — RECOVERY OBSERVATION
      // ======================================================================

      advance(
        ORCHESTRATION_STATE
          .MONITORING_RECOVERY
      );

      const monRecord =
        await this._runAgent(
          'recoveryMonitoringAgent',
          ctx,
          {}
        );

      runRecord
        .agentTrace
        .push(
          monRecord
        );

      /*
       * Monitoring is observational.
       *
       * A monitoring-agent failure must not retroactively invent execution
       * success or mutate infrastructure.
       */

      // ======================================================================
      // STAGE 8 — EXPLANATION
      // ======================================================================

      advance(
  ORCHESTRATION_STATE
    .EXPLAINING
);

/*
 * Phase 12.14:
 *
 * Explanation reads only the canonical DecisionTrace.
 * It must not synthesize a fresh story from arbitrary mutable context.
 */
ctx.decisionTrace =
  this._buildDecisionTrace(
    runRecord,
    ctx
  );

const explRecord =
  await this._runAgent(
          'explanationAgent',
          ctx,
          {}
        );

      runRecord
        .agentTrace
        .push(
          explRecord
        );

      runRecord.explanationResult =
        explRecord
          .result
          ?.explanation ||
        null;

      // ======================================================================
      // STAGE 9 — LEARNING
      // ======================================================================

      advance(
        ORCHESTRATION_STATE
          .LEARNING
      );

      const learnRecord =
        await this._runAgent(
          'learningAgent',
          ctx,
          {
            memoryService:
              this
                ._services
                .memoryService,
          }
        );

      runRecord
        .agentTrace
        .push(
          learnRecord
        );

      runRecord.learningResult =
        learnRecord
          .result
          ?.recommendations ||
        null;

      // ======================================================================
      // COMPLETE
      // ======================================================================

      runRecord.state =
        ORCHESTRATION_STATE
          .COMPLETED;

      return this._finalize(
        runRecord,
        ctx
      );
   } catch (
  err
) {
  /*
   * Phase 12.15 adversarial hardening:
   *
   * Exhausting an intelligence budget is not an infrastructure/runtime crash.
   * It is a deliberate safety stop and must fail closed into human handling.
   */
  if (
    err
      ?.code ===
    BUDGET_ERROR_CODE
  ) {
    return this._manualResult(
      runRecord,
      ctx,
      "AGENT_BUDGET_EXCEEDED",
      err
    );
  }

  runRecord.state =
    ORCHESTRATION_STATE
      .FAILED;

  runRecord.error =
    err.message;

  return this._finalize(
    runRecord,
    ctx
  );
}
  }

  /**
 * Continue the recovery workflow FROM an already completed canonical
 * DiagnosisCoordinator result.
 *
 * Phase 12.1 authoritative production path:
 *
 * DiagnosisLifecycleService
 *      ↓
 * DiagnosisCoordinator
 *      ↓
 * canonical diagnosis + safety gate
 *      ↓
 * continueFromDiagnosis()
 *      ↓
 * playbook selection / parameter resolution / deterministic execution
 *
 * This method deliberately does NOT run:
 *
 * - CorrelationAgent
 * - InvestigationAgent
 * - DiagnosisAgent
 *
 * because canonical incident formation and diagnosis have already happened.
 *
 * @param {object} input
 * @returns {Promise<object>}
 */

async continueFromDiagnosis(
  input = {}
) {
  const canonical =
    input.canonicalResult ||
    input.coordinatorResult ||
    null;

  if (
    !canonical
      ?.diagnosis ||
    !canonical
      ?.context
  ) {
    throw Object.assign(
      new Error(
        'Canonical diagnosis result is required before recovery planning'
      ),
      {
        code:
          'CANONICAL_DIAGNOSIS_REQUIRED',
      }
    );
  }

  const sourceContext =
    canonical.context;

  const tenantId =
    input.tenantId ||
    canonical.tenantId ||
    sourceContext.tenantId ||
    null;

  const organizationId =
    input.organizationId ||
    canonical.organizationId ||
    sourceContext.organizationId ||
    null;

  const environmentId =
    input.environmentId ||
    canonical.environmentId ||
    sourceContext.environmentId ||
    null;

  const incidentId =
    canonical.incidentId ||
    sourceContext.incidentId ||
    input.incidentId ||
    null;

  const correlationId =
    input.correlationId ||
    sourceContext.correlationId ||
    `incident:${incidentId}`;

  // ==========================================================================
  // SCOPE VALIDATION
  // ==========================================================================

  if (
    !tenantId ||
    !organizationId ||
    !environmentId ||
    !incidentId
  ) {
    throw Object.assign(
      new Error(
        'Canonical diagnosis is missing tenant/environment/incident scope'
      ),
      {
        code:
          'CANONICAL_DIAGNOSIS_SCOPE_REQUIRED',
      }
    );
  }

  /*
   * Never allow the caller to override scope established by the canonical
   * diagnosis.
   */
  if (
    canonical.organizationId &&
    String(
      canonical.organizationId
    ) !==
    String(
      organizationId
    )
  ) {
    throw Object.assign(
      new Error(
        'Canonical diagnosis organization scope mismatch'
      ),
      {
        code:
          'TENANT_BOUNDARY_VIOLATION',
      }
    );
  }

  if (
    canonical.environmentId &&
    String(
      canonical.environmentId
    ) !==
    String(
      environmentId
    )
  ) {
    throw Object.assign(
      new Error(
        'Canonical diagnosis environment scope mismatch'
      ),
      {
        code:
          'TENANT_BOUNDARY_VIOLATION',
      }
    );
  }

  if (
    canonical.tenantId &&
    String(
      canonical.tenantId
    ) !==
    String(
      tenantId
    )
  ) {
    throw Object.assign(
      new Error(
        'Canonical diagnosis tenant scope mismatch'
      ),
      {
        code:
          'TENANT_BOUNDARY_VIOLATION',
      }
    );
  }

  const startedAt =
    new Date();

  /*
   * Convert the canonical InvestigationContext into the compatibility
   * AgentContext required by later Phase-12 agents.
   *
   * Phase 12.2 will formally unify these contracts.
   */
  const ctx =
    createAgentContext({
      incidentId:
        String(
          incidentId
        ),

      correlationId:
        String(
          correlationId
        ),

      tenantId:
        String(
          tenantId
        ),

      organizationId:
        String(
          organizationId
        ),

      environmentId:
        String(
          environmentId
        ),

      incident:
        sourceContext
          .incident ||
        {},

      signals:
        sourceContext
          .signals ||
        [],

      alerts:
        sourceContext
          .alerts ||
        [],

      metrics:
        sourceContext
          .metrics ||
        {},

      logs:
        sourceContext
          .logs ||
        [],

      traces:
        sourceContext
          .traces ||
        [],

      events:
        sourceContext
          .incidentEvents ||
        [],

      service:
        sourceContext
          .service ||
        {},

      dependencies:
        sourceContext
          .dependencies ||
        [],

      environment:
        input.environment ||
        sourceContext
          .incident
          ?.environment ||
        null,

      provider:
        input.provider ||
        sourceContext
          .incident
          ?.provider ||
        null,

      resource:
        input.resource ||
        sourceContext
          .resource ||
        {},

      evidence:
        sourceContext
          .evidence ||
        null,

      diagnosis:
        canonical
          .diagnosis,

      timing: {
        ...(
          sourceContext
            .timing ||
          {}
        ),

        startedAt:
          startedAt
            .toISOString(),
      },
            resources:
        sourceContext
          .resources ||
        [],

      topology:
        sourceContext
          .topology ||
        {},

      blastRadius:
        sourceContext
          .blastRadius ||
        {},

      changes:
        sourceContext
          .changes ||
        [],

      historicalContext:
        sourceContext
          .historicalContext ||
        sourceContext
          .historicalIncidents ||
        [],

      symptoms:
        sourceContext
          .symptoms ||
        [],

      findings:
        sourceContext
          .findings ||
        [],

      contradictions:
        sourceContext
          .contradictions ||
        [],

      unknowns:
        sourceContext
          .unknowns ||
        [],

      riskAnalysis:
        sourceContext
          .riskAnalysis ||
        canonical
          .diagnosis
          ?.risk ||
        null,

      safetyGate:
        canonical
          .safetyGate ||
        sourceContext
          .safetyGate ||
        null,

      policies:
        sourceContext
          .policies ||
        null,

      entitlements:
        sourceContext
          .entitlements ||
        null,

      budgets:
        sourceContext
          .budgets ||
        {},
    });

    /*
   * Phase 12.2:
   *
   * riskAnalysis and safetyGate are now first-class canonical AgentContext
   * fields. Only the diagnosis-run reference remains continuation metadata.
   */
  ctx.riskAnalysis =
    sourceContext
      .riskAnalysis ||
    canonical
      .diagnosis
      ?.risk ||
    null;

  ctx.safetyGate =
    canonical
      .safetyGate ||
    sourceContext
      .safetyGate ||
    null;

  ctx.canonicalDiagnosisRunId =
    canonical
      .runId ||
    null;

  ctx.metadata = {
    ...(
      ctx.metadata ||
      {}
    ),

    sourceDiagnosisRunId:
      canonical
        .runId ||
      null,
  };

  const runRecord = {
    runId:
      uuidv4(),

    sourceDiagnosisRunId:
      canonical.runId ||
      null,

    incidentId:
      ctx.incidentId,

    correlationId:
      ctx.correlationId,

    tenantId:
      ctx.tenantId,

    organizationId:
      ctx.organizationId,

    environmentId:
      ctx.environmentId,

    state:
      ORCHESTRATION_STATE
        .RECEIVED,

    startedAt:
      startedAt
        .toISOString(),

    completedAt:
      null,

    /*
     * Keep the canonical diagnostic trace in the complete decision trace.
     *
     * We are NOT re-running these agents.
     */
    agentTrace:
      Array.isArray(
        canonical.agentTrace
      )
        ? [
            ...canonical.agentTrace,
          ]
        : [],

    manualRequired:
      false,

    manualReason:
      null,

    executionResult:
      null,

    explanationResult:
      null,

    learningResult:
      null,

    error:
      null,
  };

  createBudgetRun({
  runId:
    runRecord.runId,

  incidentId:
    runRecord.incidentId,

  overrides: {
    maxStepsPerIncident:
      this._stepLimit,

    agentTimeoutMs:
      this._agentTimeout,
  },
});

ctx.metadata = {
  ...(
    ctx.metadata ||
    {}
  ),

  budgetRunId:
    runRecord.runId,
};


  const advance =
  (
    state
  ) => {
    consumeStep(
      runRecord
        .runId,

      state
    );

    runRecord.state =
      state;
  };

  try {
    // ========================================================================
    // 1. DIAGNOSIS SAFETY GATE
    // ========================================================================

    const safetyGate =
      ctx.safetyGate;

    /*
     * This is the most important boundary in this method.
     *
     * Merely having a diagnosis is NOT permission to evaluate recovery.
     */
    if (
      !safetyGate ||
      safetyGate
        .decision !==
        'ALLOW_EVALUATION' ||
      safetyGate
        .canEvaluatePlaybook !==
        true
    ) {
      return this._manualResult(
        runRecord,
        ctx,
        MANUAL_REASON
          .INSUFFICIENT_CONFIDENCE
      );
    }

    // ========================================================================
    // 2. PLAYBOOK SELECTION
    // ========================================================================

    advance(
      ORCHESTRATION_STATE
        .SELECTING_PLAYBOOK
    );

    const pbRecord =
      await this._runAgent(
        'playbookSelectionAgent',
        ctx,
        {
          incidentPlaybookService:
            this
              ._services
              .incidentPlaybookService,
        }
      );

    runRecord
      .agentTrace
      .push(
        pbRecord
      );

    if (
      _agentBlocksFlow(
        pbRecord
      )
    ) {
      return this._manualResult(
        runRecord,
        ctx,
        _agentReason(
          pbRecord
        )
      );
    }

    const recommendation =
      pbRecord
        .result
        ?.recommendation;

    ctx.playbookCandidates =
      pbRecord
        .result
        ?.candidateRankings ||
      [];

    ctx.selectedPlaybook =
      pbRecord
        .result
        ?.recommendedPlaybookId
        ? {
            playbookId:
              pbRecord
                .result
                .recommendedPlaybookId,

            semver:
              pbRecord
                .result
                .version,
          }
        : null;

    if (
      recommendation ===
        PLAYBOOK_RECOMMENDATION
          .MANUAL_REQUIRED ||
      !ctx.selectedPlaybook
    ) {
      return this._manualResult(
        runRecord,
        ctx,
        MANUAL_REASON
          .NO_SAFE_PLAYBOOK
      );
    }

    if (
      recommendation ===
      PLAYBOOK_RECOMMENDATION
        .COLLECT_MORE_EVIDENCE
    ) {
      return this._manualResult(
        runRecord,
        ctx,
        MANUAL_REASON
          .MISSING_EVIDENCE
      );
    }

    const playbookConfidence =
      this._confidence
        .evaluate(
          CONFIDENCE_DIMENSION
            .PLAYBOOK_SELECTION,

          pbRecord.confidence ||
            0
        );

    if (
      playbookConfidence
        .belowMin
    ) {
      return this._manualResult(
        runRecord,
        ctx,
        AGENT_MANUAL_REASON
          .AGENT_CONFIDENCE_TOO_LOW
      );
    }

    // ========================================================================
    // 3. PARAMETER RESOLUTION
    // ========================================================================

    advance(
      ORCHESTRATION_STATE
        .RESOLVING_PARAMETERS
    );

    const paramRecord =
      await this._runAgent(
        'parameterResolutionAgent',
        ctx,
        {}
      );

    runRecord
      .agentTrace
      .push(
        paramRecord
      );

    if (
      _agentBlocksFlow(
        paramRecord
      )
    ) {
      return this._manualResult(
        runRecord,
        ctx,
        _agentReason(
          paramRecord
        )
      );
    }

    ctx.resolvedParameters =
      paramRecord
        .result
        ?.deterministicResolutionResult ||
      null;

    if (
      !paramRecord
        .result
        ?.readyForExecution
    ) {
      const unresolved =
        paramRecord
          .result
          ?.unresolved ||
        [];

      const ambiguous =
        paramRecord
          .result
          ?.ambiguous ||
        [];

      /*
       * Never guess infrastructure identity.
       */
      if (
        ambiguous.length >
        0
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          MANUAL_REASON
            .RESOURCE_AMBIGUOUS
        );
      }

      if (
        unresolved.length >
        0
      ) {
        return this._manualResult(
          runRecord,
          ctx,
          MANUAL_REASON
            .PARAMETER_UNRESOLVED
        );
      }

      return this._manualResult(
        runRecord,
        ctx,
        MANUAL_REASON
          .PARAMETER_UNRESOLVED
      );
    }

    const parameterConfidence =
      this._confidence
        .evaluate(
          CONFIDENCE_DIMENSION
            .PARAMETER,

          paramRecord.confidence ||
            0
        );

    if (
      parameterConfidence
        .belowMin
    ) {
      return this._manualResult(
        runRecord,
        ctx,
        AGENT_MANUAL_REASON
          .AGENT_CONFIDENCE_TOO_LOW
      );
    }

    // ========================================================================
    // 4. DETERMINISTIC EXECUTION HANDOFF
    // ========================================================================

    advance(
      ORCHESTRATION_STATE
        .READY_FOR_EXECUTION
    );

    advance(
      ORCHESTRATION_STATE
        .EXECUTING
    );

    if (
      !this
        ._services
        .incidentPlaybookService
    ) {
      return this._manualResult(
        runRecord,
        ctx,
        MANUAL_REASON
          .INTEGRATION_UNAVAILABLE
      );
    }

    let executionResult;

try {
  /*
   * This remains the existing safe deterministic execution boundary.
   *
   * The agent does NOT receive infrastructure mutation tools.
   */

  /*
   * Phase 12.12:
   * deterministic execution handoff consumes the workflow tool budget.
   */
  consumeToolCall(
    runRecord.runId,
    "IncidentPlaybookService.executeForIncident"
  );

  executionResult =
    await this
          ._services
          .incidentPlaybookService
          .executeForIncident(
            ctx.incident,
            {
              tenantId:
                ctx.tenantId,

              organizationId:
                ctx.organizationId,

              environmentId:
                ctx.environmentId,

              correlationId:
                ctx.correlationId,

              diagnosisRunId:
                ctx
                  .canonicalDiagnosisRunId,

              initiatedBy:
                'agent-orchestrator:canonical-diagnosis',

              dryRun:
                this
                  ._config
                  .dryRun ||
                false,

              policyDecision:
                ctx.policyDecision,
            }
          );
   } catch (
  executionError
) {
  return this._manualResult(
    runRecord,
    ctx,

    executionError
      ?.code ===
      BUDGET_ERROR_CODE
      ? "AGENT_BUDGET_EXCEEDED"
      : MANUAL_REASON
          .EXECUTION_FAILED,

    executionError
  );
}

    runRecord.executionResult =
      executionResult;

    ctx.playbookExecutionId =
      executionResult
        ?.execution
        ?.executionId ||
      null;

    ctx.policyDecision =
      executionResult
        ?.execution
        ?.policyDecision ||
      null;

    ctx.verificationResults =
      executionResult
        ?.execution
        ?.verificationResults ||
      [];

    ctx.rollbackResults =
      executionResult
        ?.execution
        ?.rollbackResults ||
      [];

    if (
      executionResult
        ?.outcome ===
      EXECUTION_OUTCOME
        .WAITING_FOR_APPROVAL
    ) {
      runRecord.state =
        ORCHESTRATION_STATE
          .MANUAL_REQUIRED;

      runRecord.manualRequired =
        true;

      runRecord.manualReason =
        MANUAL_REASON
          .APPROVAL_REQUIRED;

      return this._finalize(
        runRecord,
        ctx
      );
    }

    if (
      executionResult
        ?.outcome ===
      EXECUTION_OUTCOME
        .MANUAL_REQUIRED
    ) {
      return this._manualResult(
        runRecord,
        ctx,
        executionResult.reason ||
          MANUAL_REASON
            .NO_SAFE_PLAYBOOK
      );
    }

    // ========================================================================
    // 5. RECOVERY OBSERVATION
    // ========================================================================

    advance(
      ORCHESTRATION_STATE
        .MONITORING_RECOVERY
    );

    const monitoringRecord =
      await this._runAgent(
        'recoveryMonitoringAgent',
        ctx,
        {}
      );

    runRecord
      .agentTrace
      .push(
        monitoringRecord
      );

    /*
     * RecoveryMonitoringAgent is observational.
     *
     * Command success still does not equal verified recovery.
     */

    // ========================================================================
    // 6. EXPLANATION
    // ========================================================================

    advance(
      ORCHESTRATION_STATE
        .EXPLAINING
    );
ctx.decisionTrace =
  this._buildDecisionTrace(
    runRecord,
    ctx
  );
    const explanationRecord =
      await this._runAgent(
        'explanationAgent',
        ctx,
        {}
      );

    runRecord
      .agentTrace
      .push(
        explanationRecord
      );

    runRecord.explanationResult =
      explanationRecord
        .result
        ?.explanation ||
      null;

    // ========================================================================
    // 7. LEARNING
    // ========================================================================

    advance(
      ORCHESTRATION_STATE
        .LEARNING
    );

    const learningRecord =
      await this._runAgent(
        'learningAgent',
        ctx,
        {
          memoryService:
            this
              ._services
              .memoryService,
        }
      );

    runRecord
      .agentTrace
      .push(
        learningRecord
      );

    runRecord.learningResult =
      learningRecord
        .result
        ?.recommendations ||
      null;

    runRecord.state =
      ORCHESTRATION_STATE
        .COMPLETED;

    return this._finalize(
      runRecord,
      ctx
    );
  } catch (
  error
) {
  /*
   * Budget exhaustion is an intentional safe stop.
   */
  if (
    error
      ?.code ===
    BUDGET_ERROR_CODE
  ) {
    return this._manualResult(
      runRecord,
      ctx,
      "AGENT_BUDGET_EXCEEDED",
      error
    );
  }

  runRecord.state =
    ORCHESTRATION_STATE
      .FAILED;

  runRecord.error =
    error.message;

  return this._finalize(
    runRecord,
    ctx
  );
}
}
  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  async _runAgent(
  agentKey,
  ctx,
  deps
) {
  const agent =
    this
      ._agents[
        agentKey
      ];

  const now =
    () =>
      new Date()
        .toISOString();

  if (
    !agent
  ) {
    return {
      agent:
        agentKey,

      version:
        "N/A",

      status:
        AGENT_STATUS
          .MANUAL_REQUIRED,

      startedAt:
        now(),

      completedAt:
        now(),

      confidence:
        0,

      evidenceUsed:
        [],

      evidenceMissing:
        [],

      assumptions:
        [],

      warnings: [
        `Agent "${agentKey}" not registered`,
      ],

      nextRecommendedStage:
        "HUMAN_ESCALATION",

      modelMetadata: {
        provider:
          null,

        model:
          null,

        inputTokens:
          null,

        outputTokens:
          null,

        totalTokens:
          null,

        latencyMs:
          null,

        estimatedCost:
          null,
      },

      result: {
        manualReason:
          AGENT_MANUAL_REASON
            .AGENT_UNAVAILABLE,
      },

      fallbackUsed:
        false,

      error:
        null,
    };
  }

  try {
    assertAgentPermissions(
      agent
    );
  } catch (
    permissionError
  ) {
    return {
      agent:
        agent.name ||
        agentKey,

      version:
        agent.version ||
        "unknown",

      status:
        AGENT_STATUS
          .MANUAL_REQUIRED,

      startedAt:
        now(),

      completedAt:
        now(),

      confidence:
        0,

      evidenceUsed:
        [],

      evidenceMissing:
        [],

      assumptions:
        [],

      warnings: [
        permissionError
          .message,
      ],

      nextRecommendedStage:
        "HUMAN_ESCALATION",

      modelMetadata: {
        provider:
          null,

        model:
          null,

        inputTokens:
          null,

        outputTokens:
          null,

        totalTokens:
          null,

        latencyMs:
          null,

        estimatedCost:
          null,
      },

      result: {
        manualReason:
          "AGENT_PERMISSION_DENIED",
      },

      fallbackUsed:
        false,

      error:
        permissionError
          .message,
    };
  }

  const inputValidation =
    agent
      .validateInput(
        ctx
      );

  if (
    !inputValidation.valid
  ) {
    return {
      agent:
        agent.name,

      version:
        agent.version,

      status:
        AGENT_STATUS
          .FAILED,

      startedAt:
        now(),

      completedAt:
        now(),

      confidence:
        0,

      evidenceUsed:
        [],

      evidenceMissing:
        [],

      assumptions:
        [],

      result:
        null,

      warnings:
        [],

      error:
        `Input validation failed: ${inputValidation.errors.join("; ")}`,
    };
  }

  const budgetRunId =
    ctx
      ?.metadata
      ?.budgetRunId;

  const budgetedDependencies =
    budgetRunId
      ? wrapToolDependencies(
          budgetRunId,
          deps ||
          {}
        )
      : (
          deps ||
          {}
        );

  try {
    const execution =
      () =>
        _withTimeout(
          agent.execute(
            ctx,
            budgetedDependencies
          ),

          this
            ._agentTimeout,

          `Agent "${agent.name}" timed out`
        );

    const record =
      budgetRunId
        ? await withBudgetRun(
            budgetRunId,
            execution
          )
        : await execution();

    const outputValidation =
      agent
        .validateOutput(
          record
        );

    if (
      !outputValidation.valid
    ) {
      return {
        ...record,

        status:
          AGENT_STATUS
            .MANUAL_REQUIRED,

        result: {
          manualReason:
            AGENT_MANUAL_REASON
              .AGENT_OUTPUT_INVALID,
        },

        warnings: [
          ...(
            record.warnings ||
            []
          ),

          ...outputValidation
            .errors,
        ],
      };
    }

    return record;
  } catch (
    error
  ) {
    const budgetExceeded =
      error.code ===
      BUDGET_ERROR_CODE;

    const timedOut =
      error.message
        ?.includes(
          "timed out"
        );

    return {
      agent:
        agent.name,

      version:
        agent.version,

      status:
        AGENT_STATUS
          .MANUAL_REQUIRED,

      startedAt:
        now(),

      completedAt:
        now(),

      confidence:
        0,

      evidenceUsed:
        [],

      evidenceMissing:
        [],

      assumptions:
        [],

      nextRecommendedStage:
        "HUMAN_ESCALATION",

      modelMetadata: {
        provider:
          null,

        model:
          null,

        inputTokens:
          null,

        outputTokens:
          null,

        totalTokens:
          null,

        latencyMs:
          null,

        estimatedCost:
          null,
      },

      result: {
        manualReason:
          budgetExceeded
            ? "AGENT_BUDGET_EXCEEDED"
            : (
                timedOut
                  ? AGENT_MANUAL_REASON
                      .AGENT_TIMEOUT
                  : AGENT_MANUAL_REASON
                      .AGENT_UNAVAILABLE
              ),
      },

      warnings:
        budgetExceeded
          ? [
              error.message,
            ]
          : [],

      fallbackUsed:
        false,

      error:
        error.message,
    };
  }
}

_buildDecisionTrace(
  runRecord,
  ctx
) {
  const agentResult =
    (
      agentName
    ) =>
      [
        ...(
          runRecord
            .agentTrace ||
          []
        ),
      ]
        .reverse()
        .find(
          (
            record
          ) =>
            record.agent ===
            agentName
        )
        ?.result ||
      null;

  /*
   * Pull typed outputs from the canonical AgentResult trace.
   */
  const playbookRecommendation =
    agentResult(
      "PlaybookSelectionAgent"
    );

  const parameterResolution =
    agentResult(
      "ParameterResolutionAgent"
    );

  const recoveryMonitoringResult =
    agentResult(
      "RecoveryMonitoringAgent"
    );

  const explanationResult =
    agentResult(
      "ExplanationAgent"
    );

  const learningResult =
    agentResult(
      "LearningAgent"
    );

  /*
   * Take one budget snapshot.
   *
   * snapshotBudgetRun() includes elapsed time, so calling it repeatedly could
   * produce slightly different snapshots inside the same DecisionTrace.
   */
  const budgetSnapshot =
    snapshotBudgetRun(
      runRecord.runId
    );

  // ==========================================================================
  // EVIDENCE REFERENCES
  // ==========================================================================

  const evidenceRefs =
    ctx
      .evidence
      ?.evidenceRefs ||
    (
      ctx
        .evidence
        ?.items ||
      []
    )
      .map(
        (
          item
        ) =>
          item
            ?.canonicalRef ||
          (
            item
              ?.id
              ? `evidence:${item.id}`
              : null
          )
      )
      .filter(
        Boolean
      );

  // ==========================================================================
  // FINAL OUTCOME
  // ==========================================================================

  const finalOutcome =
    runRecord
      .executionResult
      ?.outcome ||
    (
      runRecord
        .manualRequired
        ? "MANUAL_REQUIRED"
        : runRecord
            .state
    );

  // ==========================================================================
  // CANONICAL DECISION TRACE
  // ==========================================================================

  return {
    schemaVersion:
      "12.14-v1",

    traceId:
      `decision-trace:${runRecord.runId}`,

    runId:
      runRecord.runId,

    sourceDiagnosisRunId:
      runRecord
        .sourceDiagnosisRunId ||
      ctx
        .canonicalDiagnosisRunId ||
      null,

    createdAt:
      new Date()
        .toISOString(),

    // ========================================================================
    // OWNERSHIP / SCOPE
    // ========================================================================

    tenant: {
      tenantId:
        ctx
          .tenantId ||
        null,

      organizationId:
        ctx
          .organizationId ||
        runRecord
          .organizationId ||
        null,

      environmentId:
        ctx
          .environmentId ||
        runRecord
          .environmentId ||
        null,
    },

    // ========================================================================
    // INCIDENT
    // ========================================================================

    incident: {
      incidentId:
        ctx
          .incidentId ||
        runRecord
          .incidentId,

      correlationId:
        ctx
          .correlationId ||
        runRecord
          .correlationId,

      severity:
        ctx
          .incident
          ?.severity ||
        null,

      status:
        ctx
          .incident
          ?.status ||
        null,

      type:
        ctx
          .incident
          ?.type ||
        ctx
          .incident
          ?.incidentType ||
        null,

      serviceId:
        ctx
          .incident
          ?.serviceId ||
        ctx
          .service
          ?.id ||
        null,
    },

    // ========================================================================
    // EVIDENCE
    // ========================================================================

    evidence: {
      refs:
        evidenceRefs,

      completeness:
        ctx
          .evidence
          ?.completeness ??
        null,

      missing:
        ctx
          .evidence
          ?.missingEvidence ||
        [],

      stale:
        ctx
          .evidence
          ?.staleEvidence ||
        [],

      conflicts:
        ctx
          .evidence
          ?.conflicts ||
        [],

      integritySummary:
        ctx
          .evidence
          ?.integritySummary ||
        null,

      trustSummary:
        ctx
          .evidence
          ?.trustSummary ||
        null,
    },

    // ========================================================================
    // ROOT-CAUSE REASONING
    // ========================================================================

    hypotheses:
      ctx
        .diagnosis
        ?.hypotheses ||
      ctx
        .rootCauseAnalysis
        ?.hypotheses ||
      [],

    diagnosis:
      ctx
        .diagnosis ||
      null,

    risk:
      ctx
        .riskAnalysis
        ?.riskAssessment ||
      ctx
        .riskAnalysis ||
      ctx
        .diagnosis
        ?.risk ||
      null,

    safetyGate:
      ctx
        .safetyGate ||
      null,

    // ========================================================================
    // PLAYBOOK / PARAMETER DECISIONS
    // ========================================================================

    playbookRecommendation,

    parameterResolution,

    // ========================================================================
    // POLICY / APPROVAL
    // ========================================================================

    policyDecision:
      ctx
        .policyDecision ||
      runRecord
        .executionResult
        ?.execution
        ?.policyDecision ||
      null,

    approvalState:
      ctx
        .approvalState ||
      (
        runRecord
          .executionResult
          ?.outcome ===
        EXECUTION_OUTCOME
          .WAITING_FOR_APPROVAL
          ? "WAITING_FOR_APPROVAL"
          : null
      ),

    // ========================================================================
    // EXECUTION
    // ========================================================================

    execution: {
      executionId:
        ctx
          .playbookExecutionId ||
        runRecord
          .executionResult
          ?.execution
          ?.executionId ||
        null,

      outcome:
        runRecord
          .executionResult
          ?.outcome ||
        null,

      policyDecision:
        runRecord
          .executionResult
          ?.execution
          ?.policyDecision ||
        ctx
          .policyDecision ||
        null,

      verificationResults:
        ctx
          .verificationResults ||
        runRecord
          .executionResult
          ?.execution
          ?.verificationResults ||
        [],

      rollbackResults:
        ctx
          .rollbackResults ||
        runRecord
          .executionResult
          ?.execution
          ?.rollbackResults ||
        [],
    },

    // ========================================================================
    // RECOVERY
    // ========================================================================

    recoveryObservation:
      recoveryMonitoringResult
        ?.observation ||
      null,

    // ========================================================================
    // EXPLANATION
    // ========================================================================

    explanation:
      explanationResult
        ?.explanation ||
      runRecord
        .explanationResult ||
      null,

    // ========================================================================
    // LEARNING
    // ========================================================================

    learning:
      learningResult
        ?.recommendations ||
      runRecord
        .learningResult ||
      null,

    // ========================================================================
    // COMPLETE AGENT TRACE
    // ========================================================================

    agentTrace:
      runRecord
        .agentTrace ||
      [],

    // ========================================================================
    // PHASE 12.12 — BUDGET AUDIT
    // ========================================================================

    budgetUsage:
      budgetSnapshot,

    // ========================================================================
    // PHASE 12.13 — SECURITY AUDIT
    // ========================================================================

    securityFindings:
      budgetSnapshot
        ?.securityFindings ||
      runRecord
        .securityFindings ||
      [],

    // ========================================================================
    // FINAL WORKFLOW STATE
    // ========================================================================

    manualRequired:
      Boolean(
        runRecord
          .manualRequired
      ),

    manualReason:
      runRecord
        .manualReason ||
      null,

    finalState:
      runRecord
        .state,

    finalOutcome,

    executionAuthorized:
      false,
  };
}

  _manualResult(
    runRecord,
    ctx,
    reason,
    err = null
  ) {
    runRecord.state =
      ORCHESTRATION_STATE
        .MANUAL_REQUIRED;

    runRecord.manualRequired =
      true;

    runRecord.manualReason =
      reason;

    if (
      err
    ) {
      runRecord.error =
        err.message;
    }

    return this._finalize(
      runRecord,
      ctx
    );
  }

_finalize(
  runRecord,
  ctx
) {
  const completedAt =
    new Date();

  runRecord.completedAt =
    completedAt
      .toISOString();

  const startedAt =
    ctx
      ?.timing
      ?.startedAt ||
    runRecord
      ?.startedAt ||
    runRecord
      .completedAt;

  runRecord.timing = {
    startedAt,

    completedAt:
      runRecord
        .completedAt,

    durationMs:
      Math.max(
        0,

        completedAt
          .getTime() -
        new Date(
          startedAt
        )
          .getTime()
      ),
  };

  // ==========================================================================
  // PHASE 12.12 — FINAL BUDGET SNAPSHOT
  // ==========================================================================

  const budgetSnapshot =
    snapshotBudgetRun(
      runRecord.runId
    );

  runRecord.budgetUsage =
    budgetSnapshot;

  runRecord.securityFindings =
    budgetSnapshot
      ?.securityFindings ||
    [];

  // ==========================================================================
  // PHASE 12.14 — FINAL CANONICAL DECISION TRACE
  // ==========================================================================

  /*
   * Build the trace only after final run state, timing, budget usage and
   * security findings are known.
   *
   * This ensures the persisted trace represents the final state of the
   * orchestration run rather than an earlier intermediate snapshot.
   */
  runRecord.decisionTrace =
    this._buildDecisionTrace(
      runRecord,
      ctx
    );

  // ==========================================================================
  // COPY FINAL TRACE BACK INTO CONTEXT
  // ==========================================================================

  ctx.decisionTrace =
    runRecord
      .decisionTrace;

  /*
   * Keep final budget/security state available to downstream consumers that
   * receive AgentContext.
   */
  ctx.metadata = {
    ...(
      ctx.metadata ||
      {}
    ),

    budgetRunId:
      runRecord.runId,

    finalizedAt:
      runRecord
        .completedAt,

    decisionTraceSchemaVersion:
      runRecord
        .decisionTrace
        ?.schemaVersion ||
      "12.14-v1",
  };

  // ==========================================================================
  // RETURN FINAL ORCHESTRATION RESULT
  // ==========================================================================

  return {
    runRecord,

    context:
      ctx,
  };
}
}

// ============================================================================
// HELPERS
// ============================================================================

function _mergeCorrelation(
  ctx,
  corrResult
) {
  if (
    !corrResult
  ) {
    return;
  }

  if (
    corrResult
      .affectedServices
  ) {
    ctx
      .service
      .affectedServices =
      corrResult
        .affectedServices;
  }

  if (
    corrResult
      .affectedResources
  ) {
    ctx
      .resource
      .affected =
      corrResult
        .affectedResources;
  }

  if (
    corrResult
      .incidentGroup
  ) {
    ctx
      .incident
      ._correlationGroup =
      corrResult
        .incidentGroup;
  }
}

function _agentBlocksFlow(
  record
) {
  return (
    record.status ===
      AGENT_STATUS
        .FAILED ||
    record.status ===
      AGENT_STATUS
        .MANUAL_REQUIRED
  );
}

function _agentReason(
  record
) {
  return (
    record
      .result
      ?.manualReason ||
    (
      record.status ===
        AGENT_STATUS
          .FAILED
        ? AGENT_MANUAL_REASON
            .AGENT_UNAVAILABLE

        : AGENT_MANUAL_REASON
            .AGENT_CONFIDENCE_TOO_LOW
    )
  );
}

function _withTimeout(
  promise,
  ms,
  label
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const timer =
        setTimeout(
          () => {
            reject(
              new Error(
                label
              )
            );
          },

          ms
        );

      promise
        .then(
          (
            value
          ) => {
            clearTimeout(
              timer
            );

            resolve(
              value
            );
          },

          (
            error
          ) => {
            clearTimeout(
              timer
            );

            reject(
              error
            );
          }
        );
    }
  );
}

/*
 * IMPORTANT:
 *
 * Production singleton ownership intentionally lives in:
 *
 *   backend/agents/v2/index.js
 *
 * Do not create another singleton here.
 */

module.exports = {
  AgentOrchestrator,
};