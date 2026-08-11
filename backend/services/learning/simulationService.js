const crypto = require("crypto");
const SimulationResult = require("../../models/SimulationResult");

/**
 * Simulation Service
 * Runs full decision pipeline without executing actions
 * Useful for testing, training, and what-if analysis
 */

class SimulationService {
  /**
   * Run simulation of a signal
   * Executes full pipeline: analysis → decision → policy → safety
   * Does NOT execute actions
   */
  async simulateSignal(tenantId, signalData, analysisAgent, decisionAgent, actionRiskService) {
    try {
      const simulationId = `sim-${crypto.randomUUID()}`;
      const correlationId = `corr-${crypto.randomUUID()}`;

      // Support both legacy (analyzeSignal) and current (analyzeIssue) API.
      const analysis = typeof analysisAgent.analyzeSignal === 'function'
        ? await analysisAgent.analyzeSignal(signalData)
        : await analysisAgent.analyzeIssue(signalData.logs || [], signalData.metrics || {}, tenantId);

      // Support both legacy (makeDecision) and current (decideAction) API.
      const decision = typeof decisionAgent.makeDecision === 'function'
        ? await decisionAgent.makeDecision(analysis, correlationId, tenantId)
        : await decisionAgent.decideAction(analysis, { state: 'simulation', tenantId });

      // Run safety checks (but don't execute)
      const safetyChecks = await this._runSafetyChecks(
        decision,
        actionRiskService,
        tenantId
      );

      const wouldExecute = safetyChecks.allChecksPassed;

      // Build full trace (same as real decision)
      const simulationTrace = {
        simulationId,
        tenantId,
        correlationId,
        timestamp: new Date(),
        inputs: signalData,
        reasoning: decision.reasoning,
        recommendedAction: decision.recommendedAction,
        confidence: decision.confidence,
        policyCheck: decision.policyCheck,
        safetyChecks,
        simulation: true,
        wouldExecute,
        executionNote: this._buildExecutionNote(safetyChecks),
      };

      // Store simulation result
      const simulationResult = new SimulationResult({
        simulationId,
        tenantId,
        correlationId,
        input: {
          signals: signalData.signals,
          severity: signalData.severity,
        },
        decisionTrace: simulationTrace,
        simulation: true,
        wouldExecute,
        executionNote: simulationTrace.executionNote,
      });

      await simulationResult.save();

      return simulationTrace;
    } catch (error) {
      console.error("[SimulationService] Simulation failed:", error);
      throw error;
    }
  }

  /**
   * Run safety checks without executing
   */
  async _runSafetyChecks(decision, actionRiskService, tenantId) {
    try {
      const riskScore = await actionRiskService.assessRisk(
        decision.recommendedAction,
        decision.confidence,
        decision.inputs?.severity
      );

      return {
        policyPassed: decision.policyCheck?.passed || false,
        riskAssessment: {
          score: riskScore,
          acceptable: riskScore <= 5.0,
        },
        allChecksPassed:
          (decision.policyCheck?.passed || false) && riskScore <= 5.0,
      };
    } catch (error) {
      console.error("[SimulationService] Safety check failed:", error);
      return {
        policyPassed: false,
        riskAssessment: { score: 10, acceptable: false },
        allChecksPassed: false,
      };
    }
  }

  /**
   * Build human-readable execution note
   */
  _buildExecutionNote(safetyChecks) {
    const reasons = [];

    if (!safetyChecks.policyPassed) {
      reasons.push("Policy evaluation failed - action disallowed");
    }
    if (!safetyChecks.riskAssessment.acceptable) {
      reasons.push(`Risk score too high: ${safetyChecks.riskAssessment.score}/5.0`);
    }

    if (reasons.length === 0) {
      return "All checks passed - would execute";
    }
    return `Would NOT execute: ${reasons.join("; ")}`;
  }

  /**
   * Get simulation history
   */
  async getSimulationHistory(tenantId, limit = 100) {
    try {
      const simulations = await SimulationResult.find({ tenantId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return simulations;
    } catch (error) {
      console.error("[SimulationService] Failed to fetch history:", error);
      throw error;
    }
  }

  /**
   * Compare simulation with actual decision
   */
  async compareWithActualDecision(simulationId, actualDecisionId, decisionTraceService) {
    try {
      const simulation = await SimulationResult.findOne({ simulationId }).lean();
      if (!simulation) {
        throw new Error(`Simulation ${simulationId} not found`);
      }

      const actualDecision = await decisionTraceService.getTrace(actualDecisionId);
      if (!actualDecision) {
        throw new Error(`Decision ${actualDecisionId} not found`);
      }

      // Find differences
      const differences = this._findDifferences(
        simulation.decisionTrace,
        actualDecision
      );

      return {
        simulation,
        actualDecision,
        differences,
        wereDecisionsEqual:
          simulation.decisionTrace.recommendedAction ===
          actualDecision.recommendedAction,
        confidenceDelta:
          actualDecision.confidence - simulation.decisionTrace.confidence,
      };
    } catch (error) {
      console.error("[SimulationService] Comparison failed:", error);
      throw error;
    }
  }

  /**
   * Find significant differences between two traces
   */
  _findDifferences(simTrace, actualTrace) {
    const diffs = [];

    if (simTrace.recommendedAction !== actualTrace.recommendedAction) {
      diffs.push(
        `Action: ${simTrace.recommendedAction} → ${actualTrace.recommendedAction}`
      );
    }

    const confDelta = Math.abs(
      simTrace.confidence - actualTrace.confidence
    );
    if (confDelta > 0.05) {
      diffs.push(
        `Confidence: ${(simTrace.confidence * 100).toFixed(0)}% → ${(
          actualTrace.confidence * 100
        ).toFixed(0)}%`
      );
    }

    return diffs;
  }
}

module.exports = new SimulationService();
