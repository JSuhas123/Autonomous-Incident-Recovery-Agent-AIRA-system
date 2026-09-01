"use strict";

/**
 * AIRA Diagnosis Coordinator
 *
 * Phase 6
 *
 * Coordinates the complete diagnosis pipeline:
 *
 * Investigation
 *      ↓
 * Symptom Analysis
 *      ↓
 * Topology Analysis
 *      ↓
 * Change Analysis
 *      ↓
 * Historical Analysis
 *      ↓
 * Root Cause Hypotheses
 *      ↓
 * Risk Analysis
 *      ↓
 * Verification / Critic
 *      ↓
 * Deterministic Confidence Engine
 *      ↓
 * Diagnosis Safety Gate
 *      ↓
 * Canonical Diagnosis
 *
 * SAFETY:
 *
 * - Does NOT execute playbooks.
 * - Does NOT execute runbooks.
 * - Does NOT mutate infrastructure.
 * - Does NOT authorize execution.
 * - Only DiagnosisSafetyGate may allow downstream playbook evaluation.
 */

const crypto =
  require(
    "node:crypto"
  );

const investigationContextService =
  require(
    "./investigationContextService"
  );

const confidenceEngine =
  require(
    "./confidenceEngine"
  );

const diagnosisSafetyGate =
  require(
    "./diagnosisSafetyGate"
  );

const {
  InvestigationAgent,
} =
  require(
    "../../agents/v2/agents/investigationAgent"
  );

const {
  SymptomAnalysisAgent,
} =
  require(
    "../../agents/v2/agents/symptomAnalysisAgent"
  );

const {
  TopologyAnalysisAgent,
} =
  require(
    "../../agents/v2/agents/topologyAnalysisAgent"
  );

  const {
  assertAgentPermissions,
} =
  require(
    "../../agents/v2/config/agentPermissions"
  );

  const {
  createBudgetRun,
  withBudgetRun,
  wrapToolDependencies,
} =
  require(
    "../../agents/v2/runtime/agentBudgetRuntime"
  );

const {
  ChangeAnalysisAgent,
} =
  require(
    "../../agents/v2/agents/changeAnalysisAgent"
  );

const {
  HistoricalAnalysisAgent,
} =
  require(
    "../../agents/v2/agents/historicalAnalysisAgent"
  );

const {
  RootCauseHypothesisAgent,
} =
  require(
    "../../agents/v2/agents/rootCauseHypothesisAgent"
  );

const {
  RiskImpactAgent,
} =
  require(
    "../../agents/v2/agents/riskImpactAgent"
  );

const {
  VerificationCriticAgent,
} =
  require(
    "../../agents/v2/agents/verificationCriticAgent"
  );

const {
  AGENT_STATUS,
  DIAGNOSIS_OUTCOME,
  DIAGNOSIS_NEXT_STEP,
  createDiagnosisResult,
  createRecommendedNextStep,
} =
  require(
    "../../agents/v2/contracts/agentContracts"
  );

const COORDINATOR_VERSION =
  "phase6-v1";

class DiagnosisCoordinator {
  constructor(
    options = {}
  ) {
    this._options =
      options;

    this.investigationAgent =
      options.investigationAgent ||
      new InvestigationAgent(
        options
          .investigationAgentConfig
      );

    this.symptomAgent =
      options.symptomAgent ||
      new SymptomAnalysisAgent(
        options
          .symptomAgentConfig
      );

    this.topologyAgent =
      options.topologyAgent ||
      new TopologyAnalysisAgent(
        options
          .topologyAgentConfig
      );

    this.changeAgent =
      options.changeAgent ||
      new ChangeAnalysisAgent(
        options
          .changeAgentConfig
      );

    this.historicalAgent =
      options.historicalAgent ||
      new HistoricalAnalysisAgent(
        options
          .historicalAgentConfig
      );

    this.rootCauseAgent =
      options.rootCauseAgent ||
      new RootCauseHypothesisAgent(
        options
          .rootCauseAgentConfig
      );

    this.riskAgent =
      options.riskAgent ||
      new RiskImpactAgent(
        options
          .riskAgentConfig
      );

    this.verificationAgent =
      options.verificationAgent ||
      new VerificationCriticAgent(
        options
          .verificationAgentConfig
      );

    this.confidenceEngine =
      options.confidenceEngine ||
      confidenceEngine;

    this.safetyGate =
      options.safetyGate ||
      diagnosisSafetyGate;

    this.contextService =
      options.contextService ||
      investigationContextService;
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async diagnose(
    scope,
    incidentId,
    dependencies = {}
  ) {
    const startedAt =
      new Date();

    const runId =
      this.createRunId(
        incidentId
      );

    createBudgetRun({
  runId,

  incidentId,
});

    const agentTrace =
      [];

    let context;

    try {
      // ======================================================================
      // 1. BUILD CANONICAL INVESTIGATION CONTEXT
      // ======================================================================

      context =
        await this.contextService
          .build(
            scope,
            incidentId,
            dependencies
              .contextOptions ||
            {}
          );

      context.runId =
        runId;

      context.findings =
        context.findings ||
        [];

      context.contradictions =
        context.contradictions ||
        [];

      context.unknowns =
        context.unknowns ||
        [];

      context.symptoms =
        context.symptoms ||
        [];

      // ======================================================================
      // 2. INVESTIGATION / EVIDENCE COLLECTION
      // ======================================================================

      const investigation =
        await this.runAgent({
          name:
            "InvestigationAgent",

          agent:
            this.investigationAgent,

          context,

          dependencies,

          critical:
            true,

          trace:
            agentTrace,
        });

      if (
        investigation
          ?.result
          ?.evidencePackage
      ) {
        context.evidence =
          investigation
            .result
            .evidencePackage;
      }

      this.mergeFindings(
        context,
        investigation
      );

      this.mergeUnknowns(
        context,
        investigation
      );

      this.mergeContradictions(
        context,
        investigation
      );

      // ======================================================================
      // 3. SYMPTOM ANALYSIS
      // ======================================================================

      const symptomAnalysis =
        await this.runAgent({
          name:
            "SymptomAnalysisAgent",

          agent:
            this.symptomAgent,

          context,

          dependencies,

          critical:
            false,

          trace:
            agentTrace,
        });

      context.symptomAnalysis =
        symptomAnalysis
          ?.result ||
        null;

      if (
        Array.isArray(
          symptomAnalysis
            ?.result
            ?.symptoms
        )
      ) {
        context.symptoms =
          symptomAnalysis
            .result
            .symptoms;
      }

      this.mergeFindings(
        context,
        symptomAnalysis
      );

      this.mergeUnknowns(
        context,
        symptomAnalysis
      );

      this.mergeContradictions(
        context,
        symptomAnalysis
      );

      // ======================================================================
      // 4. TOPOLOGY ANALYSIS
      // ======================================================================

      const topologyAnalysis =
        await this.runAgent({
          name:
            "TopologyAnalysisAgent",

          agent:
            this.topologyAgent,

          context,

          dependencies,

          critical:
            false,

          trace:
            agentTrace,
        });

      context.topologyAnalysis =
        topologyAnalysis
          ?.result ||
        null;

      this.mergeFindings(
        context,
        topologyAnalysis
      );

      this.mergeUnknowns(
        context,
        topologyAnalysis
      );

      this.mergeContradictions(
        context,
        topologyAnalysis
      );

      // ======================================================================
      // 5. CHANGE ANALYSIS
      // ======================================================================

      const changeAnalysis =
        await this.runAgent({
          name:
            "ChangeAnalysisAgent",

          agent:
            this.changeAgent,

          context,

          dependencies,

          critical:
            false,

          trace:
            agentTrace,
        });

      context.changeAnalysis =
        changeAnalysis
          ?.result ||
        null;

      this.mergeFindings(
        context,
        changeAnalysis
      );

      this.mergeUnknowns(
        context,
        changeAnalysis
      );

      this.mergeContradictions(
        context,
        changeAnalysis
      );

      // ======================================================================
      // 6. HISTORICAL ANALYSIS
      // ======================================================================

      const historicalAnalysis =
        await this.runAgent({
          name:
            "HistoricalAnalysisAgent",

          agent:
            this.historicalAgent,

          context,

          dependencies,

          critical:
            false,

          trace:
            agentTrace,
        });

      context.historicalAnalysis =
        historicalAnalysis
          ?.result ||
        null;

      this.mergeFindings(
        context,
        historicalAnalysis
      );

      this.mergeUnknowns(
        context,
        historicalAnalysis
      );

      this.mergeContradictions(
        context,
        historicalAnalysis
      );

      // ======================================================================
      // 7. ROOT CAUSE HYPOTHESES
      // ======================================================================

      const rootCauseAnalysis =
        await this.runAgent({
          name:
            "RootCauseHypothesisAgent",

          agent:
            this.rootCauseAgent,

          context,

          dependencies,

          critical:
            true,

          trace:
            agentTrace,
        });

      context.rootCauseAnalysis =
        rootCauseAnalysis
          ?.result ||
        {
          hypotheses:
            [],

          primaryHypothesis:
            null,

          outcome:
            DIAGNOSIS_OUTCOME
              .INSUFFICIENT_EVIDENCE,

          diagnosisConfidence:
            0,

          findings:
            [],

          contradictions:
            [],

          unknowns:
            [],
        };

      context.hypotheses =
        context
          .rootCauseAnalysis
          .hypotheses ||
        [];

      this.mergeFindings(
        context,
        rootCauseAnalysis
      );

      this.mergeUnknowns(
        context,
        rootCauseAnalysis
      );

      this.mergeContradictions(
        context,
        rootCauseAnalysis
      );

      // ======================================================================
      // 8. RISK / IMPACT ANALYSIS
      // ======================================================================

      const riskAnalysis =
        await this.runAgent({
          name:
            "RiskImpactAgent",

          agent:
            this.riskAgent,

          context,

          dependencies,

          critical:
            false,

          trace:
            agentTrace,
        });

      context.riskAnalysis =
        riskAnalysis
          ?.result ||
        null;

      this.mergeFindings(
        context,
        riskAnalysis
      );

      this.mergeUnknowns(
        context,
        riskAnalysis
      );

      this.mergeContradictions(
        context,
        riskAnalysis
      );

      // ======================================================================
      // 9. VERIFICATION / CRITIC
      // ======================================================================

      const verification =
        await this.runAgent({
          name:
            "VerificationCriticAgent",

          agent:
            this.verificationAgent,

          context,

          dependencies,

          critical:
            true,

          trace:
            agentTrace,
        });

      context.verification =
        verification
          ?.result ||
        {
          verificationStatus:
            "INCONCLUSIVE",

          verificationConfidence:
            0,

          acceptedHypothesisId:
            null,

          hypothesisReviews:
            [],

          findings:
            [],

          contradictions:
            [],

          unknowns:
            [],
        };

      this.mergeFindings(
        context,
        verification
      );

      this.mergeUnknowns(
        context,
        verification
      );

      this.mergeContradictions(
        context,
        verification
      );

      // ======================================================================
      // 10. AGENT HEALTH
      // ======================================================================

      const agentFailures =
        agentTrace
          .filter(
            (
              record
            ) =>
              record.status ===
              AGENT_STATUS
                .FAILED
          )
          .length;

      const agentPartials =
        agentTrace
          .filter(
            (
              record
            ) =>
              record.status ===
              AGENT_STATUS
                .PARTIAL
          )
          .length;

      // ======================================================================
      // 11. DETERMINISTIC CONFIDENCE ENGINE
      // ======================================================================

      const falsePositiveSuspected =
        this.detectFalsePositive(
          context
        );

      const confidence =
        this.confidenceEngine
          .evaluate({
            evidence:
              context.evidence,

            symptomAnalysis:
              context
                .symptomAnalysis,

            topologyAnalysis:
              context
                .topologyAnalysis,

            changeAnalysis:
              context
                .changeAnalysis,

            historicalAnalysis:
              context
                .historicalAnalysis,

            rootCauseAnalysis:
              context
                .rootCauseAnalysis,

            verification:
              context
                .verification,

            contradictions:
              context
                .contradictions,

            falsePositiveSuspected,

            agentFailures,

            agentPartials,

            /*
             * Passed for observability only.
             *
             * ConfidenceEngine must NOT convert operational
             * risk into diagnosis confidence.
             */
            riskAnalysis:
              context
                .riskAnalysis,
          });

      context.confidence =
        confidence;

      // ======================================================================
      // 12. DIAGNOSIS SAFETY GATE
      // ======================================================================

      /*
       * This is the FINAL diagnostic safety boundary.
       *
       * Confidence alone does NOT permit playbook evaluation.
       *
       * Verification alone does NOT permit playbook evaluation.
       *
       * Only:
       *
       * safetyGate.decision === "ALLOW_EVALUATION"
       *
       * may result in EVALUATE_PLAYBOOK.
       */

      const safetyGate =
        this.safetyGate
          .evaluate({
            diagnosis: {
              ...context
                .rootCauseAnalysis,

              symptoms:
                context.symptoms ||
                [],

              contradictions:
                context
                  .contradictions ||
                [],

              falsePositiveSuspected,
            },

            confidence,

            verification:
              context.verification ||
              {},

            agentTrace,

            incident:
              context.incident,

            context,
          });

      context.safetyGate =
        safetyGate;

      // ======================================================================
      // 13. CANONICAL DIAGNOSIS
      // ======================================================================

      const canonicalDiagnosis =
        this.buildDiagnosisResult({
          context,

          confidence,

          safetyGate,

          agentTrace,

          startedAt,

          falsePositiveSuspected,
        });

      const completedAt =
        new Date();

      // ======================================================================
      // 14. FINAL COORDINATOR RESULT
      // ======================================================================

      return {
        runId,

        coordinatorVersion:
          COORDINATOR_VERSION,

        incidentId:
          String(
            context.incidentId ||
            incidentId
          ),

        organizationId:
          context.organizationId
            ? String(
                context
                  .organizationId
              )
            : null,

        environmentId:
          context.environmentId
            ? String(
                context
                  .environmentId
              )
            : null,

        diagnosis:
          canonicalDiagnosis,

        context,

        agentTrace,

        confidence,

        safetyGate,

        startedAt,

        completedAt,

        durationMs:
          Math.max(
            0,
            completedAt -
            startedAt
          ),

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      error.runId =
        runId;

      error.agentTrace =
        agentTrace;

      throw error;
    }
  }

  // ==========================================================================
  // AGENT RUNNER
  // ==========================================================================

  async runAgent({
  name,
  agent,
  context,
  dependencies,
  critical,
  trace,
}) {
  const agentStartedAt =
    new Date();

  let record;

  /*
 * Phase 12.11:
 * all diagnosis agents pass the same central permission boundary.
 */
assertAgentPermissions(
  agent
);

  try {
    const budgetedDependencies =
  wrapToolDependencies(
    context.runId,
    dependencies ||
    {}
  );

record =
  await withBudgetRun(
    context.runId,

    () =>
      agent.execute(
        context,
        budgetedDependencies
      )
  );
  } catch (
    error
  ) {
    record = {
      schemaVersion:
        "12.3-v1",

      agent:
        name,

      version:
        agent.version ||
        agent
          ._version ||
        "unknown",

      status:
        AGENT_STATUS
          .FAILED,

      result:
        null,

      startedAt:
        agentStartedAt
          .toISOString(),

      completedAt:
        new Date()
          .toISOString(),

      durationMs:
        Math.max(
          0,
          Date.now() -
          agentStartedAt
            .getTime()
        ),

      confidence:
        0,

      evidenceUsed:
        [],

      evidenceMissing:
        [],

      assumptions:
        [],

      warnings:
        [],

      nextRecommendedStage:
        null,

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

      provider:
        null,

      model:
        null,

      tokenEstimate:
        null,

      fallbackUsed:
        false,

      error:
        error
          ?.message ||
        "Agent execution failed",

      metadata: {
        errorCode:
          error
            ?.code ||
          "AGENT_EXECUTION_FAILED",
      },
    };
  }

  const normalizedStatus =
    record
      ?.status ||
    AGENT_STATUS
      .FAILED;

  /*
   * Phase 12.3:
   *
   * Preserve the complete canonical AgentResult envelope in the decision
   * trace instead of projecting away typed result data.
   */
  trace.push({
    schemaVersion:
      record
        ?.schemaVersion ||
      "12.3-v1",

    agent:
      record
        ?.agent ||
      name,

    version:
      record
        ?.version ||
      agent.version ||
      agent
        ._version ||
      null,

    status:
      normalizedStatus,

    startedAt:
      record
        ?.startedAt ||
      agentStartedAt
        .toISOString(),

    completedAt:
      record
        ?.completedAt ||
      new Date()
        .toISOString(),

    durationMs:
      record
        ?.durationMs ??
      null,

    confidence:
      record
        ?.confidence ??
      record
        ?.result
        ?.confidence ??
      null,

    result:
      record
        ?.result ??
      null,

    evidenceUsed:
      Array.isArray(
        record
          ?.evidenceUsed
      )
        ? record
            .evidenceUsed
        : [],

    evidenceMissing:
      Array.isArray(
        record
          ?.evidenceMissing
      )
        ? record
            .evidenceMissing
        : [],

    assumptions:
      Array.isArray(
        record
          ?.assumptions
      )
        ? record
            .assumptions
        : [],

    warnings:
      Array.isArray(
        record
          ?.warnings
      )
        ? record
            .warnings
        : [],

    nextRecommendedStage:
      record
        ?.nextRecommendedStage ||
      null,

    modelMetadata:
      record
        ?.modelMetadata ||
      {
        provider:
          record
            ?.provider ||
          null,

        model:
          record
            ?.model ||
          null,

        inputTokens:
          null,

        outputTokens:
          null,

        totalTokens:
          record
            ?.tokenEstimate ??
          null,

        latencyMs:
          null,

        estimatedCost:
          null,
      },

    /*
     * Compatibility aliases.
     */
    provider:
      record
        ?.provider ||
      record
        ?.modelMetadata
        ?.provider ||
      null,

    model:
      record
        ?.model ||
      record
        ?.modelMetadata
        ?.model ||
      null,

    tokenEstimate:
      record
        ?.tokenEstimate ??
      record
        ?.modelMetadata
        ?.totalTokens ??
      null,

    fallbackUsed:
      Boolean(
        record
          ?.fallbackUsed
      ),

    error:
      record
        ?.error ||
      null,

    metadata:
      (
        record
          ?.metadata &&
        typeof record
          .metadata ===
          "object"
      )
        ? record
            .metadata
        : {},
  });

  /*
   * Critical agents that fail remain fail-closed.
   */
  if (
    normalizedStatus ===
      AGENT_STATUS
        .FAILED &&
    critical
  ) {
    throw Object.assign(
      new Error(
        `${name} failed during diagnosis`
      ),
      {
        code:
          "DIAGNOSIS_CRITICAL_AGENT_FAILED",

        agent:
          name,

        agentRecord:
          record,
      }
    );
  }

  return record;
}

  // ==========================================================================
  // BUILD CANONICAL DIAGNOSIS
  // ==========================================================================

 buildDiagnosisResult({
  context,
  confidence,
  safetyGate,
  agentTrace,
  startedAt,
  falsePositiveSuspected,
}) {
  const rootCause =
    context
      .rootCauseAnalysis ||
    {};

  const verification =
    context
      .verification ||
    {};

  const hypotheses =
    Array.isArray(
      rootCause
        .hypotheses
    )
      ? rootCause
          .hypotheses
      : [];

  const primaryHypothesis =
    this.resolvePrimaryHypothesis(
      rootCause,
      verification
    );

  const primaryHypothesisId =
    typeof primaryHypothesis ===
      "string"
      ? primaryHypothesis
      : primaryHypothesis
          ?.id ||
        null;

  const primaryHypothesisObject =
    hypotheses.find(
      (
        hypothesis
      ) =>
        String(
          hypothesis?.id ||
          ""
        ) ===
        String(
          primaryHypothesisId ||
          ""
        )
    ) ||
    (
      typeof primaryHypothesis ===
        "object"
        ? primaryHypothesis
        : null
    );

  const alternateHypothesisIds =
    hypotheses
      .map(
        (
          hypothesis
        ) =>
          hypothesis?.id
      )
      .filter(
        (
          id
        ) =>
          Boolean(
            id
          ) &&
          String(
            id
          ) !==
            String(
              primaryHypothesisId
            )
      );

  const ambiguity =
    rootCause
      .ambiguity ||
    {
      ambiguous:
        rootCause
          .outcome ===
        DIAGNOSIS_OUTCOME
          .MULTIPLE_PLAUSIBLE_CAUSES,

      confidenceGap:
        null,

      plausibleHypothesisIds:
        rootCause
          .plausibleHypothesisIds ||
        [],

      topHypothesisId:
        primaryHypothesisId,

      secondHypothesisId:
        alternateHypothesisIds[0] ||
        null,
    };

  const supportingEvidenceIds =
    uniqueStrings(
      primaryHypothesisObject
        ?.validEvidenceSupporting ||
      primaryHypothesisObject
        ?.evidenceSupporting ||
      []
    );

  const contradictingEvidenceIds =
    uniqueStrings(
      primaryHypothesisObject
        ?.validEvidenceAgainst ||
      primaryHypothesisObject
        ?.evidenceAgainst ||
      []
    );

  const assumptions =
    uniqueStrings(
      primaryHypothesisObject
        ?.assumptions ||
      []
    );

  /*
   * Machine-readable identity comes ONLY from diagnosis output.
   *
   * No Reliability Lab experiment key, expected failure mode or evaluator
   * ground truth is consulted here.
   */
  const recommendedIncidentType =
    this.resolveRecommendedIncidentType({
      primaryHypothesis:
        primaryHypothesisObject,

      rootCause,

      verification,
    });

  const outcome =
    this.resolveOutcome({
      rootCause,

      verification,

      confidence,

      safetyGate,

      falsePositiveSuspected,
    });

  const recommendedNextStep =
    this.resolveNextStep({
      verification,

      rootCause,

      context,

      safetyGate,
    });

  const summary =
    this.buildSummary({
      primaryHypothesis,

      outcome,

      confidence,

      verification,

      safetyGate,
    });

  const canonicalRisk =
    context
      .riskAnalysis
      ?.riskAssessment ||
    context
      .riskAnalysis ||
    null;

  return createDiagnosisResult({
    hypotheses,

    primaryHypothesis,

    primaryHypothesisId,

    alternateHypothesisIds,

    plausibleHypothesisIds:
      rootCause
        .plausibleHypothesisIds ||
      ambiguity
        .plausibleHypothesisIds ||
      [],

    ambiguity,

    diagnosisConfidence:
      confidence
        ?.confidence ??
      0,

    evidenceCompleteness:
      context
        .evidence
        ?.completeness ||
      0,

    supportingEvidenceIds,

    contradictingEvidenceIds,

    assumptions,

    unresolvedQuestions:
      uniqueStrings([
        ...(
          rootCause
            .unresolvedQuestions ||
          []
        ),

        ...(
          context
            .unknowns ||
          []
        ),
      ]),

    recommendedIncidentType,

    symptoms:
      context.symptoms ||
      [],

    contradictions:
      context
        .contradictions ||
      [],

    risk:
      canonicalRisk,

    verificationStatus:
      verification
        .verificationStatus ||
      null,

    acceptedHypothesisId:
      verification
        .acceptedHypothesisId ||
      null,

    outcome,

    summary,

    unknowns:
      context
        .unknowns ||
      [],

    recommendedNextStep,

    falsePositiveSuspected:
      Boolean(
        falsePositiveSuspected
      ),

    analyzedAt:
      new Date(),

    metadata: {
      runId:
        context.runId,

      coordinatorVersion:
        COORDINATOR_VERSION,

      agentCount:
        agentTrace.length,

      analysisStartedAt:
        startedAt,

      confidenceBand:
        confidence
          ?.band ||
        null,

      confidenceDecision:
        confidence
          ?.decision ||
        null,

      verificationStatus:
        verification
          ?.verificationStatus ||
        null,

      safetyGateDecision:
        safetyGate
          ?.decision ||
        null,

      canEvaluatePlaybook:
        Boolean(
          safetyGate
            ?.canEvaluatePlaybook
        ),

      requiresHuman:
        Boolean(
          safetyGate
            ?.requiresHuman
        ),

      machineReadableDiagnosis:
        recommendedIncidentType ||
        null,
    },
  });
}

resolveRecommendedIncidentType({
  primaryHypothesis,
  rootCause,
  verification,
}) {
  /*
   * Fail closed.
   *
   * Only structured diagnosis-produced identities are accepted.
   * Natural-language rootCause/title strings are deliberately excluded.
   */
  const candidates = [
    primaryHypothesis
      ?.failureModeKey,

    primaryHypothesis
      ?.recommendedIncidentType,

    primaryHypothesis
      ?.incidentType,

    rootCause
      ?.failureModeKey,

    rootCause
      ?.recommendedIncidentType,

    verification
      ?.failureModeKey,

    verification
      ?.recommendedIncidentType,
  ];

  for (
    const candidate
    of candidates
  ) {
    if (
      typeof candidate !==
        "string"
    ) {
      continue;
    }

    const normalized =
      candidate
        .trim();

    if (
      !normalized ||
      normalized
        .toLowerCase() ===
        "unknown"
    ) {
      continue;
    }

    return normalized;
  }

  return null;
}
  // ==========================================================================
  // PRIMARY HYPOTHESIS
  // ==========================================================================

  resolvePrimaryHypothesis(
    rootCause,
    verification
  ) {
    const hypotheses =
      Array.isArray(
        rootCause
          ?.hypotheses
      )
        ? rootCause
            .hypotheses
        : [];

    if (
      hypotheses.length ===
      0
    ) {
      return null;
    }

    const acceptedHypothesisId =
      verification
        ?.acceptedHypothesisId;

    if (
      acceptedHypothesisId
    ) {
      const accepted =
        hypotheses.find(
          (
            hypothesis
          ) =>
            String(
              hypothesis.id ||
              hypothesis
                .hypothesisId ||
              ""
            ) ===
            String(
              acceptedHypothesisId
            )
        );

      if (
        accepted
      ) {
        return accepted;
      }
    }

    if (
      rootCause
        ?.primaryHypothesis
    ) {
      return rootCause
        .primaryHypothesis;
    }

    return hypotheses[0];
  }

  // ==========================================================================
  // FINAL DIAGNOSIS OUTCOME
  // ==========================================================================

  resolveOutcome({
  rootCause,
  verification,
  confidence,
  safetyGate,
}) {
  const rootCauseOutcome =
    rootCause
      ?.outcome ||
    DIAGNOSIS_OUTCOME
      .UNKNOWN;

  const primaryHypothesis =
    rootCause
      ?.primaryHypothesis ||
    (
      Array.isArray(
        rootCause
          ?.hypotheses
      )
        ? rootCause
            .hypotheses[0]
        : null
    );

  const hasMachineDiagnosisIdentity =
    Boolean(
      primaryHypothesis
        ?.failureModeKey ||
      rootCause
        ?.recommendedIncidentType
    );

  // ------------------------------------------------------------------------
  // HARD REJECTION
  // ------------------------------------------------------------------------

  /*
   * Rejected evidence/verification genuinely invalidates the diagnosis.
   */
  if (
    verification
      ?.verificationStatus ===
    "REJECTED"
  ) {
    return DIAGNOSIS_OUTCOME
      .CONTRADICTORY_EVIDENCE;
  }

  if (
    safetyGate
      ?.decision ===
    "REJECT_DIAGNOSIS"
  ) {
    return DIAGNOSIS_OUTCOME
      .CONTRADICTORY_EVIDENCE;
  }

  // ------------------------------------------------------------------------
  // EXPLICIT FALSE POSITIVE
  // ------------------------------------------------------------------------

  if (
    rootCauseOutcome ===
    DIAGNOSIS_OUTCOME
      .FALSE_POSITIVE_SUSPECTED
  ) {
    return DIAGNOSIS_OUTCOME
      .FALSE_POSITIVE_SUSPECTED;
  }

  // ------------------------------------------------------------------------
  // DIAGNOSIS IDENTITY VS RECOVERY ELIGIBILITY
  // ------------------------------------------------------------------------

  /*
   * IMPORTANT:
   *
   * Diagnosis outcome answers:
   *
   *     "What does AIRA believe happened?"
   *
   * SafetyGate / Confidence decision answers:
   *
   *     "May AIRA proceed toward recovery evaluation?"
   *
   * Those must not be conflated.
   *
   * If deterministic evidence has already produced a machine-readable
   * diagnosis identity and RootCauseHypothesisAgent classified the cause,
   * a HOLD_FOR_MORE_EVIDENCE / COLLECT_MORE_EVIDENCE decision must continue
   * to block recovery eligibility, but must not erase the diagnosis itself.
   *
   * executionAuthorized remains false.
   */

  const rootCauseIdentified =
    [
      DIAGNOSIS_OUTCOME
        .ROOT_CAUSE_IDENTIFIED,

      DIAGNOSIS_OUTCOME
        .PROBABLE_CAUSE_IDENTIFIED,

      DIAGNOSIS_OUTCOME
        .MULTIPLE_PLAUSIBLE_CAUSES,
    ].includes(
      rootCauseOutcome
    );

  if (
    rootCauseIdentified &&
    hasMachineDiagnosisIdentity
  ) {
    return rootCauseOutcome;
  }

  // ------------------------------------------------------------------------
  // INSUFFICIENT EVIDENCE
  // ------------------------------------------------------------------------

  if (
    safetyGate
      ?.decision ===
    "HOLD_FOR_MORE_EVIDENCE"
  ) {
    return DIAGNOSIS_OUTCOME
      .INSUFFICIENT_EVIDENCE;
  }

  if (
    confidence
      ?.decision ===
    "COLLECT_MORE_EVIDENCE"
  ) {
    return DIAGNOSIS_OUTCOME
      .INSUFFICIENT_EVIDENCE;
  }

  return rootCauseOutcome;
}

  // ==========================================================================
  // SAFE NEXT STEP
  // ==========================================================================

  resolveNextStep({
    verification,
    rootCause,
    context,
    safetyGate,
  }) {
    /*
     * CRITICAL SAFETY INVARIANT
     *
     * Only:
     *
     *     safetyGate.decision === "ALLOW_EVALUATION"
     *
     * may return:
     *
     *     EVALUATE_PLAYBOOK
     *
     * Confidence, LLM output, verification or historical evidence
     * cannot independently bypass this boundary.
     */

    if (
      safetyGate
        ?.decision ===
      "ALLOW_EVALUATION"
    ) {
      const primary =
        this.resolvePrimaryHypothesis(
          rootCause,
          verification
        );

      return createRecommendedNextStep({
        type:
          DIAGNOSIS_NEXT_STEP
            .EVALUATE_PLAYBOOK,

        target:
          primary
            ?.category ||
          primary
            ?.rootCause ||
          null,

        reason:
          "Diagnosis passed evidence, critic, deterministic confidence, and diagnosis safety-gate checks.",
      });
    }

    if (
      safetyGate
        ?.decision ===
      "HOLD_FOR_MORE_EVIDENCE"
    ) {
      return createRecommendedNextStep({
        type:
          DIAGNOSIS_NEXT_STEP
            .COLLECT_MORE_EVIDENCE,

        reason:
          "Diagnosis safety gate requires stronger evidence before recovery evaluation.",

        evidenceRequired:
          context
            .evidence
            ?.missingEvidence ||
          [],
      });
    }

    if (
      safetyGate
        ?.decision ===
        "MANUAL_REVIEW" ||
      safetyGate
        ?.decision ===
        "REJECT_DIAGNOSIS"
    ) {
      return createRecommendedNextStep({
        type:
          DIAGNOSIS_NEXT_STEP
            .MANUAL_INVESTIGATION,

        reason:
          safetyGate
            ?.decision ===
            "REJECT_DIAGNOSIS"
            ? "Diagnosis failed verification or diagnostic safety checks and requires operator investigation."
            : "Diagnosis safety gate requires operator review before recovery evaluation.",
      });
    }

    if (
      safetyGate
        ?.decision ===
      "MONITOR_ONLY"
    ) {
      return createRecommendedNextStep({
        type:
          DIAGNOSIS_NEXT_STEP
            .MONITOR,

        reason:
          "Incident appears recovered or currently does not require recovery evaluation.",
      });
    }

    return createRecommendedNextStep({
      type:
        DIAGNOSIS_NEXT_STEP
          .MONITOR,

      reason:
        "Diagnosis is not currently eligible for recovery evaluation.",
    });
  }

  // ==========================================================================
  // FALSE POSITIVE DETECTION
  // ==========================================================================

  detectFalsePositive(
    context
  ) {
    const rootCause =
      context
        ?.rootCauseAnalysis ||
      {};

    const verification =
      context
        ?.verification ||
      {};

    const incident =
      context
        ?.incident ||
      {};

    const evidence =
      context
        ?.evidence ||
      {};

    // ------------------------------------------------------------------------
    // EXPLICIT FALSE POSITIVE
    // ------------------------------------------------------------------------

    if (
      rootCause
        .outcome ===
      DIAGNOSIS_OUTCOME
        .FALSE_POSITIVE_SUSPECTED
    ) {
      return true;
    }

    // ------------------------------------------------------------------------
    // RESOLVED/CLOSED != FALSE POSITIVE
    // ------------------------------------------------------------------------

    if (
      [
        "resolved",
        "closed",
      ].includes(
        String(
          incident.status ||
          ""
        )
          .trim()
          .toLowerCase()
      )
    ) {
      return false;
    }

    // ------------------------------------------------------------------------
    // UNKNOWN / MISSING TELEMETRY
    // ------------------------------------------------------------------------

    /*
     * Missing telemetry means insufficient evidence.
     *
     * It does NOT prove that the original incident was false.
     */

    const hypotheses =
      Array.isArray(
        rootCause.hypotheses
      )
        ? rootCause.hypotheses
        : [];

    const evidenceCompleteness =
      Number(
        evidence.completeness ||
        0
      );

    if (
      hypotheses.length ===
        0 &&
      evidenceCompleteness <
        0.25
    ) {
      return false;
    }

    // ------------------------------------------------------------------------
    // CRITIC REJECTION ALONE != FALSE POSITIVE
    // ------------------------------------------------------------------------

    if (
      verification
        .verificationStatus ===
      "REJECTED"
    ) {
      return (
        rootCause
          .outcome ===
        DIAGNOSIS_OUTCOME
          .FALSE_POSITIVE_SUSPECTED
      );
    }

    return false;
  }

    // ==========================================================================
  // MACHINE-READABLE DIAGNOSIS IDENTITY
  // ==========================================================================

  resolveRecommendedIncidentType({
    context,
    rootCause,
    verification,
    primaryHypothesis,
  }) {
    /*
     * Never infer diagnosis identity from Reliability Lab metadata,
     * experiment keys, evaluator expectations, or execution context.
     *
     * Identity must come only from canonical diagnosis/evidence output.
     */

    const candidates = [
      primaryHypothesis
        ?.failureModeKey,

      primaryHypothesis
        ?.incidentType,

      primaryHypothesis
        ?.recommendedIncidentType,

      rootCause
        ?.failureModeKey,

      rootCause
        ?.recommendedIncidentType,

      verification
        ?.failureModeKey,

      verification
        ?.recommendedIncidentType,

      context
        ?.deterministicDiagnosis
        ?.primary
        ?.failureModeKey,

      context
        ?.deterministicDiagnosis
        ?.primary
        ?.code,
    ];


    for (
      const candidate
      of candidates
    ) {
      if (
        typeof candidate !==
          "string"
      ) {
        continue;
      }


      const normalized =
        candidate
          .trim();


      if (
        !normalized ||
        normalized.toLowerCase() ===
          "unknown"
      ) {
        continue;
      }


      return normalized;
    }


    return null;
  }
  
  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  buildSummary({
    primaryHypothesis,
    outcome,
    confidence,
    verification,
    safetyGate,
  }) {
    const confidenceValue =
      confidence
        ?.confidence ??
      0;

    const verificationStatus =
      verification
        ?.verificationStatus ||
      "INCONCLUSIVE";

    const gateDecision =
      safetyGate
        ?.decision ||
      "UNKNOWN";

    if (
      !primaryHypothesis
    ) {
      return (
        "AIRA could not establish a defensible root cause from the currently available evidence. " +
        `Diagnosis outcome=${outcome}; ` +
        `confidence=${confidenceValue}; ` +
        `verification=${verificationStatus}; ` +
        `safetyGate=${gateDecision}.`
      );
    }

    return (
      `${primaryHypothesis.rootCause}. ` +
      `Diagnosis outcome=${outcome}; ` +
      `confidence=${confidenceValue}; ` +
      `verification=${verificationStatus}; ` +
      `safetyGate=${gateDecision}.`
    );
  }

  // ==========================================================================
  // MERGE FINDINGS
  // ==========================================================================

  mergeFindings(
    context,
    record
  ) {
    const findings =
      record
        ?.result
        ?.findings;

    if (
      !Array.isArray(
        findings
      )
    ) {
      return;
    }

    context.findings =
      deduplicateObjects([
        ...(
          context.findings ||
          []
        ),

        ...findings,
      ]);
  }

  // ==========================================================================
  // MERGE UNKNOWNS
  // ==========================================================================

  mergeUnknowns(
    context,
    record
  ) {
    const unknowns =
      record
        ?.result
        ?.unknowns;

    if (
      !Array.isArray(
        unknowns
      )
    ) {
      return;
    }

    context.unknowns =
      uniqueStrings([
        ...(
          context.unknowns ||
          []
        ),

        ...unknowns,
      ]);
  }

  // ==========================================================================
  // MERGE CONTRADICTIONS
  // ==========================================================================

  mergeContradictions(
    context,
    record
  ) {
    const contradictions =
      record
        ?.result
        ?.contradictions;

    if (
      !Array.isArray(
        contradictions
      )
    ) {
      return;
    }

    context.contradictions =
      deduplicateObjects([
        ...(
          context
            .contradictions ||
          []
        ),

        ...contradictions,
      ]);
  }

  // ==========================================================================
  // RUN ID
  // ==========================================================================

  createRunId(
    incidentId
  ) {
    return (
      "diag_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          `${incidentId}:${Date.now()}:${crypto.randomUUID()}`
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          24
        )
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function uniqueStrings(
  values
) {
  const result =
    [];

  const seen =
    new Set();

  for (
    const value
    of Array.isArray(
      values
    )
      ? values
      : []
  ) {
    if (
      value ===
        null ||
      value ===
        undefined
    ) {
      continue;
    }

    let normalized;

    if (
      typeof value ===
      "string"
    ) {
      normalized =
        value;
    } else {
      normalized =
        value.description ||
        value.summary ||
        safeStringify(
          value
        );
    }

    if (
      !normalized
    ) {
      continue;
    }

    const key =
      String(
        normalized
      );

    if (
      seen.has(
        key
      )
    ) {
      continue;
    }

    seen.add(
      key
    );

    result.push(
      normalized
    );
  }

  return result;
}

function deduplicateObjects(
  values
) {
  const map =
    new Map();

  for (
    const value
    of Array.isArray(
      values
    )
      ? values
      : []
  ) {
    if (
      !value
    ) {
      continue;
    }

    const key =
      value.id ||
      value.findingId ||
      value.contradictionId ||
      safeStringify(
        value
      );

    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        value
      );
    }
  }

  return [
    ...map.values(),
  ];
}

function safeStringify(
  value
) {
  try {
    return JSON.stringify(
      value
    );
  } catch {
    return String(
      value
    );
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new DiagnosisCoordinator();

module.exports
  .DiagnosisCoordinator =
  DiagnosisCoordinator;

module.exports
  .COORDINATOR_VERSION =
  COORDINATOR_VERSION;