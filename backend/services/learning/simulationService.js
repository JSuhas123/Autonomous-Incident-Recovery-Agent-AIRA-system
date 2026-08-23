"use strict";

const {
  SimulationResult,
} = require(
  "../../persistence/operational/legacyModels"
);
const crypto = require('crypto');
/**
 * Simulation Service
 *
 * Runs the decision pipeline without executing infrastructure actions.
 *
 * Canonical simulation ownership:
 *
 * tenantId
 * + organizationId
 * + environmentId
 *
 * A simulation from one environment must never be compared against or
 * retrieved from another environment.
 */

class SimulationService {
  /**
   * Run simulation of a signal.
   *
   * Preferred signature:
   *
   * simulateSignal(
   *   {
   *     tenantId,
   *     organizationId,
   *     environmentId
   *   },
   *   signalData,
   *   actionRiskService
   * )
   *
   * Legacy compatibility:
   *
   * simulateSignal(
   *   tenantId,
   *   signalData,
   *   actionRiskService
   * )
   */
  async simulateSignal(
    scopeInput,
    signalData,
    actionRiskService
  ) {
    try {
      const scope =
        this._normalizeScope(
          scopeInput,
          signalData
        );

      this._assertScope(scope);

      const simulationId =
        `sim-${crypto.randomUUID()}`;

      const correlationId =
        `corr-${crypto.randomUUID()}`;

      /**
       * IMPORTANT:
       *
       * The original file referenced `decision` here without defining it.
       *
       * For compatibility, this service now expects the caller to provide
       * the already-computed decision through signalData.decision.
       */
      const decision =
        signalData?.decision;

      if (!decision) {
        const error =
          new Error(
            'Simulation requires signalData.decision'
          );

        error.code =
          'SIMULATION_DECISION_REQUIRED';

        error.status =
          400;

        throw error;
      }

      const safetyChecks =
        await this._runSafetyChecks(
          decision,
          actionRiskService,
          scope
        );

      const wouldExecute =
        safetyChecks.allChecksPassed;

      const simulationTrace = {
        simulationId,

        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        correlationId,

        timestamp:
          new Date(),

        inputs:
          signalData,

        reasoning:
          decision.reasoning,

        recommendedAction:
          decision.recommendedAction,

        confidence:
          decision.confidence,

        policyCheck:
          decision.policyCheck,

        safetyChecks,

        simulation:
          true,

        wouldExecute,

        executionNote:
          this._buildExecutionNote(
            safetyChecks
          ),
      };

      const simulationResult =
        new SimulationResult({
          simulationId,

          tenantId:
            scope.tenantId,

          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          correlationId,

          input: {
            signals:
              signalData.signals,

            severity:
              signalData.severity,
          },

          decisionTrace:
            simulationTrace,

          simulation:
            true,

          wouldExecute,

          executionNote:
            simulationTrace.executionNote,
        });

      await simulationResult.save();

      return simulationTrace;
    } catch (error) {
      console.error(
        '[SimulationService] Simulation failed:',
        error
      );

      throw error;
    }
  }

  /**
   * Run safety checks without executing.
   */
  async _runSafetyChecks(
    decision,
    actionRiskService,
    scope
  ) {
    try {
      const riskScore =
        await actionRiskService.assessRisk(
          decision.recommendedAction,
          decision.confidence,
          decision.inputs?.severity,
          {
            tenantId:
              scope.tenantId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,
          }
        );

      return {
        policyPassed:
          decision.policyCheck?.passed ||
          false,

        riskAssessment: {
          score:
            riskScore,

          acceptable:
            riskScore <=
            5.0,
        },

        allChecksPassed:
          (
            decision.policyCheck?.passed ||
            false
          ) &&
          riskScore <=
            5.0,
      };
    } catch (error) {
      console.error(
        '[SimulationService] Safety check failed:',
        error
      );

      return {
        policyPassed:
          false,

        riskAssessment: {
          score:
            10,

          acceptable:
            false,
        },

        allChecksPassed:
          false,
      };
    }
  }

  /**
   * Build human-readable execution note.
   */
  _buildExecutionNote(
    safetyChecks
  ) {
    const reasons =
      [];

    if (
      !safetyChecks.policyPassed
    ) {
      reasons.push(
        'Policy evaluation failed - action disallowed'
      );
    }

    if (
      !safetyChecks
        .riskAssessment
        .acceptable
    ) {
      reasons.push(
        `Risk score too high: ${safetyChecks.riskAssessment.score}/5.0`
      );
    }

    if (
      reasons.length ===
      0
    ) {
      return (
        'All checks passed - would execute'
      );
    }

    return (
      `Would NOT execute: ${reasons.join('; ')}`
    );
  }

  /**
   * Get simulation history.
   *
   * Preferred:
   *
   * getSimulationHistory(scope, limit)
   */
  async getSimulationHistory(
    scopeInput,
    limit = 100
  ) {
    try {
      const scope =
        this._normalizeScope(
          scopeInput
        );

      this._assertScope(scope);

      const query = {
        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,
      };

      const simulations =
        await SimulationResult
          .find(query)
          .sort({
            timestamp:
              -1,
          })
          .limit(limit)
          .lean();

      return simulations;
    } catch (error) {
      console.error(
        '[SimulationService] Failed to fetch history:',
        error
      );

      throw error;
    }
  }

  /**
   * Compare simulation with actual decision.
   *
   * Preferred:
   *
   * compareWithActualDecision(
   *   simulationId,
   *   actualDecisionId,
   *   decisionTraceService,
   *   scope
   * )
   */
  async compareWithActualDecision(
    simulationId,
    actualDecisionId,
    decisionTraceService,
    scopeInput
  ) {
    try {
      const scope =
        this._normalizeScope(
          scopeInput
        );

      this._assertScope(scope);

      const simulation =
        await SimulationResult
          .findOne({
            simulationId,

            tenantId:
              scope.tenantId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,
          })
          .lean();

      if (!simulation) {
        const error =
          new Error(
            `Simulation ${simulationId} not found`
          );

        error.code =
          'SIMULATION_NOT_FOUND';

        error.status =
          404;

        throw error;
      }

      /**
       * CRITICAL FIX:
       *
       * Old:
       *
       * decisionTraceService.getTrace(actualDecisionId)
       *
       * New:
       *
       * decisionTraceService.getTrace(actualDecisionId, scope)
       *
       * This prevents a simulation in STAGING from comparing against a
       * DecisionTrace belonging to PROD.
       */
      const actualDecision =
        await decisionTraceService
          .getTrace(
            actualDecisionId,
            scope
          );

      if (!actualDecision) {
        const error =
          new Error(
            `Decision ${actualDecisionId} not found`
          );

        error.code =
          'DECISION_NOT_FOUND';

        error.status =
          404;

        throw error;
      }

      const differences =
        this._findDifferences(
          simulation.decisionTrace,
          actualDecision
        );

      const actualConfidence =
        actualDecision.inputs
          ?.confidence ??
        actualDecision.confidence ??
        0;

      const simulationConfidence =
        simulation.decisionTrace
          ?.confidence ??
        0;

      return {
        simulation,

        actualDecision,

        differences,

        wereDecisionsEqual:
          simulation.decisionTrace
            .recommendedAction ===
          actualDecision
            .recommendedAction,

        confidenceDelta:
          actualConfidence -
          simulationConfidence,
      };
    } catch (error) {
      console.error(
        '[SimulationService] Comparison failed:',
        error
      );

      throw error;
    }
  }

  /**
   * Find significant differences between two traces.
   */
  _findDifferences(
    simTrace,
    actualTrace
  ) {
    const differences =
      [];

    if (
      simTrace.recommendedAction !==
      actualTrace.recommendedAction
    ) {
      differences.push(
        `Action: ${simTrace.recommendedAction} â†’ ${actualTrace.recommendedAction}`
      );
    }

    const actualConfidence =
      actualTrace.inputs
        ?.confidence ??
      actualTrace.confidence ??
      0;

    const simulationConfidence =
      simTrace.confidence ??
      0;

    const confidenceDelta =
      Math.abs(
        simulationConfidence -
        actualConfidence
      );

    if (
      confidenceDelta >
      0.05
    ) {
      differences.push(
        `Confidence: ${(simulationConfidence * 100).toFixed(0)}% â†’ ${(actualConfidence * 100).toFixed(0)}%`
      );
    }

    return differences;
  }

  /**
   * Normalize canonical scope.
   *
   * Accepts either:
   *
   * {
   *   tenantId,
   *   organizationId,
   *   environmentId
   * }
   *
   * or legacy tenantId string.
   */
  _normalizeScope(
    input,
    fallback = {}
  ) {
    if (
      typeof input ===
      'string'
    ) {
      return {
        tenantId:
          input,

        organizationId:
          fallback.organizationId ||
          null,

        environmentId:
          fallback.environmentId ||
          null,
      };
    }

    return {
      tenantId:
        input?.tenantId ||
        fallback.tenantId ||
        null,

      organizationId:
        input?.organizationId ||
        input?.orgId ||
        fallback.organizationId ||
        fallback.orgId ||
        null,

      environmentId:
        input?.environmentId ||
        fallback.environmentId ||
        null,
    };
  }

  /**
   * Fail closed when simulation ownership is incomplete.
   */
  _assertScope(
    scope
  ) {
    if (!scope.tenantId) {
      const error =
        new Error(
          'tenantId is required for simulation operations'
        );

      error.code =
        'SIMULATION_TENANT_REQUIRED';

      error.status =
        400;

      throw error;
    }

    if (!scope.organizationId) {
      const error =
        new Error(
          'organizationId is required for simulation operations'
        );

      error.code =
        'SIMULATION_ORGANIZATION_REQUIRED';

      error.status =
        400;

      throw error;
    }

    if (!scope.environmentId) {
      const error =
        new Error(
          'environmentId is required for simulation operations'
        );

      error.code =
        'SIMULATION_ENVIRONMENT_REQUIRED';

      error.status =
        400;

      throw error;
    }
  }
}

module.exports =
  new SimulationService();
