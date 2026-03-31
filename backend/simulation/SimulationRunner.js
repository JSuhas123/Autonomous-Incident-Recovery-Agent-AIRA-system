/**
 * Simulation Runner
 * Orchestrates the simulation by:
 * 1. Processing incidents through decision engine
 * 2. Calculating confidence with current weights
 * 3. Recording outcomes and feeding back to optimizer
 * 4. Tracking weight evolution
 * 5. Computing metrics at each checkpoint
 */

class SimulationRunner {
  constructor(confidenceService, weightOptimizer, config = {}) {
    this.confidenceService = confidenceService;
    this.weightOptimizer = weightOptimizer;

    this.config = {
      checkpointInterval: config.checkpointInterval || 10, // Record weights every N decisions
      maxWeightChangeAllowed: config.maxWeightChangeAllowed || 0.05,
      ...config,
    };

    // Tracking arrays
    this.decisionHistory = [];
    this.weightSnapshots = [];
    this.accuracyHistory = [];
    this.confidenceCalibrationData = [];
    this.eventLog = [];

    this.totalProcessed = 0;
    this.startTime = null;
  }

  /**
   * Run complete simulation on incident stream
   * Returns simulation results and metrics
   */
  async runSimulation(incidents) {
    this.startTime = Date.now();
    this.decisionHistory = [];
    this.weightSnapshots = [];
    this.accuracyHistory = [];
    this.confidenceCalibrationData = [];
    this.eventLog = [];
    this.totalProcessed = 0;

    console.log(`\n🎬 Starting simulation with ${incidents.length} incidents...`);

    for (let i = 0; i < incidents.length; i++) {
      const incident = incidents[i];
      await this._processIncident(incident, i);

      // Log progress
      if ((i + 1) % Math.max(100, Math.floor(incidents.length / 10)) === 0) {
        const progress = ((i + 1) / incidents.length * 100).toFixed(1);
        console.log(`  ⏳ ${progress}% complete (${i + 1}/${incidents.length})`);
      }
    }

    const elapsedMs = Date.now() - this.startTime;
    console.log(`✅ Simulation complete in ${(elapsedMs / 1000).toFixed(2)}s\n`);

    return {
      totalProcessed: this.totalProcessed,
      decisionHistory: this.decisionHistory,
      weightSnapshots: this.weightSnapshots,
      accuracyHistory: this.accuracyHistory,
      confidenceCalibrationData: this.confidenceCalibrationData,
      eventLog: this.eventLog,
      executionTimeMs: elapsedMs,
    };
  }

  /**
   * Process a single incident through the decision engine
   */
  async _processIncident(incident, sequenceNumber) {
    try {
      // STEP 1: Calculate confidence with current weights
      const confidenceResult = this._calculateConfidence(incident);

      // STEP 2: Make decision based on confidence
      const decision = this._makeDecision(incident, confidenceResult);

      // STEP 3: Determine outcome (from ground truth)
      const actualOutcome = incident.outcome;

      // STEP 4: Record decision for analysis
      const decisionRecord = {
        sequenceNumber,
        timestamp: incident.timestamp,
        incidentId: incident.id,
        patternType: incident.patternType,
        
        confidence: confidenceResult.score,
        confidenceLevel: confidenceResult.level,
        factors: confidenceResult.factors,
        weights: { ...this.confidenceService.weights },

        decision: decision,
        
        outcome: actualOutcome,
        wasCorrect: this._evaluateDecision(decision, actualOutcome),
        
        metadata: incident.metadata,
      };

      this.decisionHistory.push(decisionRecord);

      // STEP 5: Feed outcome to weight optimizer
      this.weightOptimizer.recordOutcome(decisionRecord, {
        success: actualOutcome.success,
      });

      // STEP 6: Periodically check for weight optimization
      if ((sequenceNumber + 1) % this.config.checkpointInterval === 0) {
        await this._attemptWeightOptimization(sequenceNumber + 1);
      }

      // STEP 7: Track calibration data (confidence vs outcome)
      this.confidenceCalibrationData.push({
        sequenceNumber,
        confidence: confidenceResult.score,
        outcome: actualOutcome.success ? 1 : 0,
        timeToRecoveryMs: actualOutcome.timeToRecoveryMs,
      });

      this.totalProcessed++;
    } catch (error) {
      console.error(`Error processing incident ${incident.id}:`, error.message);
      this.eventLog.push({
        type: 'error',
        sequenceNumber,
        message: error.message,
      });
    }
  }

  /**
   * Calculate confidence with current weights
   * Simulates what ConfidenceService would do
   */
  _calculateConfidence(incident) {
    const factors = incident.confidenceFactors;
    const weights = this.confidenceService.weights;

    // Replicate weighted calculation
    const score = 
      factors.pattern_match * weights.pattern_match +
      factors.historical_success * weights.historical_success +
      factors.signal_strength * weights.signal_strength +
      factors.recency * weights.recency +
      factors.policy_alignment * weights.policy_alignment;

    const clampedScore = Math.max(0, Math.min(1, score));

    return {
      score: clampedScore,
      level: this._getConfidenceLevel(clampedScore),
      factors: {
        pattern_match: {
          value: factors.pattern_match,
          weight: weights.pattern_match,
          contribution: factors.pattern_match * weights.pattern_match,
        },
        historical_success: {
          value: factors.historical_success,
          weight: weights.historical_success,
          contribution: factors.historical_success * weights.historical_success,
        },
        signal_strength: {
          value: factors.signal_strength,
          weight: weights.signal_strength,
          contribution: factors.signal_strength * weights.signal_strength,
        },
        recency: {
          value: factors.recency,
          weight: weights.recency,
          contribution: factors.recency * weights.recency,
        },
        policy_alignment: {
          value: factors.policy_alignment,
          weight: weights.policy_alignment,
          contribution: factors.policy_alignment * weights.policy_alignment,
        },
      },
    };
  }

  /**
   * Map confidence to confidence level
   */
  _getConfidenceLevel(score) {
    if (score >= 0.8) return 'VERY_HIGH';
    if (score >= 0.6) return 'HIGH';
    if (score >= 0.4) return 'MEDIUM';
    if (score >= 0.2) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * Make decision based on confidence and incident severity
   * Simple decision logic: high confidence + high severity = restart
   */
  _makeDecision(incident, confidenceResult) {
    const severity = incident.analysisResult.severity;
    const confidence = confidenceResult.score;

    let action = 'log';
    let reason = '';

    if (severity === 'high' && confidence >= 0.7) {
      action = 'restart';
      reason = 'High severity + high confidence → restart';
    } else if (severity === 'high') {
      action = 'alert';
      reason = 'High severity but low confidence → escalate to alert';
    } else if (severity === 'medium' && confidence >= 0.6) {
      action = 'retry';
      reason = 'Medium severity + good confidence → retry';
    } else if (severity === 'low' || confidence < 0.4) {
      action = 'log';
      reason = 'Low severity or low confidence → just log';
    }

    return {
      action,
      reason,
      confidenceUtilized: confidence,
    };
  }

  /**
   * Evaluate if decision was correct based on outcome
   * High confidence + success = correct, Low confidence + failure = correct
   */
  _evaluateDecision(decision, outcome) {
    const confidence = decision.confidenceUtilized;
    
    if (outcome.success) {
      // Successful outcome - correct if we had reasonable confidence
      return confidence >= 0.4;
    } else {
      // Failed outcome - correct if we had low confidence
      return confidence < 0.6;
    }
  }

  /**
   * Attempt weight optimization at checkpoint
   */
  async _attemptWeightOptimization(checkpointNumber) {
    const currentWeights = { ...this.confidenceService.weights };
    const optimizationResult = this.weightOptimizer.applyOptimizedWeights(
      currentWeights,
      this.confidenceService
    );

    if (optimizationResult.applied) {
      // Record weight change
      const snapshot = {
        checkpointNumber,
        decisionCount: this.totalProcessed,
        timestamp: new Date(),
        previousWeights: optimizationResult.previousWeights,
        newWeights: optimizationResult.newWeights,
        deltas: optimizationResult.changeRecord.deltas,
        factorAccuracies: optimizationResult.changeRecord.factorAccuracies,
        reasoning: optimizationResult.changeRecord.reasoning,
      };

      this.weightSnapshots.push(snapshot);

      this.eventLog.push({
        type: 'weight_update',
        checkpointNumber,
        decisionCount: this.totalProcessed,
        message: optimizationResult.changeRecord.reasoning,
        changes: optimizationResult.changeRecord.deltas,
      });

      // Update service weights
      this.confidenceService.weights = optimizationResult.newWeights;

      console.log(`  📊 Weights updated at checkpoint ${checkpointNumber}:`, 
        optimizationResult.changeRecord.reasoning);
    }
  }

  /**
   * Compute accuracy metrics at current point
   */
  computeAccuracyMetrics(upToIndex = null) {
    const history = upToIndex 
      ? this.decisionHistory.slice(0, upToIndex)
      : this.decisionHistory;

    if (history.length === 0) return null;

    const correct = history.filter(d => d.wasCorrect).length;
    const accuracy = correct / history.length;

    const avgConfidence = history.reduce((sum, d) => sum + d.confidence, 0) / history.length;
    
    // Separate accuracy by confidence level
    const highConfidenceDecisions = history.filter(d => d.confidence >= 0.7);
    const lowConfidenceDecisions = history.filter(d => d.confidence < 0.4);

    return {
      totalDecisions: history.length,
      correctDecisions: correct,
      accuracy: accuracy.toFixed(4),
      accuracyPercent: (accuracy * 100).toFixed(2),
      avgConfidence: avgConfidence.toFixed(4),
      highConfidenceAccuracy: highConfidenceDecisions.length > 0
        ? (highConfidenceDecisions.filter(d => d.wasCorrect).length / highConfidenceDecisions.length).toFixed(4)
        : 'N/A',
      lowConfidenceAccuracy: lowConfidenceDecisions.length > 0
        ? (lowConfidenceDecisions.filter(d => d.wasCorrect).length / lowConfidenceDecisions.length).toFixed(4)
        : 'N/A',
    };
  }

  /**
   * Get results summary
   */
  getSummary() {
    return {
      totalDecisionsProcessed: this.totalProcessed,
      finalAccuracy: this.computeAccuracyMetrics(),
      weightUpdatesApplied: this.weightSnapshots.length,
      latestWeights: this.confidenceService.weights,
      simulationDurationMs: Date.now() - this.startTime,
    };
  }
}

module.exports = SimulationRunner;
