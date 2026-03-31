/**
 * PRODUCTION INCIDENT LEARNING SERVICE
 * 
 * Unlike the current pattern counting system, this actually learns from outcomes:
 * 
 * INPUT: Incident + Action + Outcome (did it fix the problem?)
 * PROCESSING: Calculate effectiveness, update confidence, learn patterns
 * OUTPUT: Better decisions next time
 * 
 * This implements the "Learn" phase of:
 * Monitor → Detect → Analyze → Decide → Act → [LEARN]
 * 
 * Learning model:
 * - For each incident pattern + action combination, track:
 *   - Effectiveness score (did it fix the incident?)
 *   - Recovery time (how long until service healthy again?)
 *   - Cost (what did the action cost?)
 *   - Side effects (did it cause new problems?)
 * - Use effectiveness history to boost/reduce confidence in future decisions
 * - Build a "playbook" of known-good solutions
 */

const crypto = require('crypto');

class IncidentLearningService {
  constructor(memoryService, decisionTraceService) {
    this.memory = memoryService;
    this.decisionTraceService = decisionTraceService;
    
    this.EFFECTIVENESS_THRESHOLDS = {
      EXCELLENT: 0.9, // 90%+ incidents resolved
      GOOD: 0.7,      // 70% resolved
      FAIR: 0.5,      // 50% resolved
      POOR: 0.2,      // 20% or less resolved
    };

    this.CONFIDENCE_ADJUSTMENTS = {
      EXCELLENT: +0.15,  // +15% confidence next time
      GOOD: +0.05,       // +5% confidence
      FAIR: 0,           // No change
      POOR: -0.10,       // -10% confidence (less likely to use)
    };
  }

  /**
   * Record outcome of an incident after time to resolution
   * 
   * Called after incident is resolved or marked as failed
   */
  async recordIncidentOutcome(tenantId, incidentId, decisionId, outcome) {
    try {
      console.log(`[learning] Recording outcome for incident ${incidentId.substring(0, 8)}`);

      // GET: Decision that was executed
      const decision = await this.decisionTraceService.getDecisionTrace(tenantId, decisionId);
      if (!decision) {
        throw new Error(`Decision ${decisionId} not found`);
      }

      // EXTRACT: What action was taken?
      const action = decision.recommendedAction;
      const severity = decision.inputs.severity;
      const pattern = decision.inputs.incidentMemory?.pattern;

      // EXTRACT: Did the action work?
      const {
        resolved = false,
        recoveryTimeMs = 0,
        hasSideEffects = false,
        cost = 0,
      } = outcome;

      // CALCULATE: Effectiveness score
      const effectivenessScore = this._calculateEffectiveness({
        resolved,
        recoveryTimeMs,
        hasSideEffects,
      });

      console.log(
        `[learning] Incident ${action} on ${pattern || 'unknown'}: ` +
        `effectiveness=${effectivenessScore.toFixed(2)}, ` +
        `recovery=${recoveryTimeMs}ms, ` +
        `cost=$${cost}`
      );

      // UPDATE: Action effectiveness history
      await this._updateActionEffectiveness(
        tenantId,
        action,
        pattern,
        severity,
        {
          effectiveness: effectivenessScore,
          recoveryTimeMs,
          hasSideEffects,
          cost,
          timestamp: new Date(),
        }
      );

      // LEARN: Adjust confidence for future decisions
      const confidenceAdjustment = this._getConfidenceAdjustment(effectivenessScore);
      if (confidenceAdjustment !== 0) {
        await this._updateActionConfidence(
          tenantId,
          action,
          pattern,
          confidenceAdjustment
        );

        console.log(
          `[learning] ✓ Updated confidence for ${action} on ${pattern}: ${(confidenceAdjustment * 100).toFixed(1)}%`
        );
      }

      // RECORD: In audit trail
      decision.learningOutcome = {
        recordedAt: new Date(),
        effectiveness: effectivenessScore,
        recoveryTimeMs,
        hasSideEffects,
        cost,
      };

      await decision.save();

      // SUGGEST: If effectiveness is poor, suggest alternatives
      if (effectivenessScore < this.EFFECTIVENESS_THRESHOLDS.FAIR) {
        const alternatives = await this._suggestAlternativeActions(
          tenantId,
          pattern,
          severity
        );

        if (alternatives.length > 0) {
          console.log(`[learning] ⚠️  Action ${action} is ineffective for ${pattern}`);
          console.log('[learning] Suggested alternatives:');
          alternatives.forEach(alt => {
            console.log(`   - ${alt.action} (${(alt.effectiveness * 100).toFixed(0)}% effective)`);
          });
        }
      }

      return {
        recorded: true,
        effectiveness: effectivenessScore,
        adjustment: confidenceAdjustment,
      };
    } catch (error) {
      console.error('[learning] Failed to record outcome:', error.message);
      throw error;
    }
  }

  /**
   * Get action effectiveness history
   * Shows how well an action has worked in the past
   */
  async getActionEffectiveness(tenantId, action, pattern = null) {
    try {
      const key = `action:effectiveness:${action}:${pattern || 'all'}`;
      const data = await this.memory.find(tenantId, key);

      if (!data || !data.stats || data.stats.outcomes.length === 0) {
        return {
          action,
          pattern,
          effectiveness: 0.5, // Neutral/unknown
          sampleSize: 0,
          recommendations: [],
        };
      }

      const outcomes = data.stats.outcomes;
      const effectiveness =
        outcomes.reduce((sum, o) => sum + o.effectiveness, 0) / outcomes.length;

      const avgRecoveryTime =
        outcomes.reduce((sum, o) => sum + o.recoveryTimeMs, 0) / outcomes.length;

      const sideEffectRate =
        outcomes.filter(o => o.hasSideEffects).length / outcomes.length;

      return {
        action,
        pattern,
        effectiveness,
        sampleSize: outcomes.length,
        avgRecoveryTimeMs: avgRecoveryTime,
        sideEffectRate,
        recommendations: this._generateRecommendations(
          action,
          effectiveness,
          sideEffectRate
        ),
      };
    } catch (error) {
      console.warn('[learning] Could not get effectiveness:', error.message);
      return { action, pattern, effectiveness: 0.5, sampleSize: 0 };
    }
  }

  /**
   * Calculate effectiveness score (0-1)
   * @private
   */
  _calculateEffectiveness({ resolved, recoveryTimeMs, hasSideEffects }) {
    // Base score: did it resolve the incident?
    let score = resolved ? 1.0 : 0.0;

    // Adjust for speed: faster recovery is better
    if (recoveryTimeMs > 0) {
      // Deduct points for slow recovery (>5 minutes)
      const recoveryPenalty = Math.min(0.3, recoveryTimeMs / 300000); // Max 30% penalty
      score -= recoveryPenalty;
    }

    // Adjust for side effects: if action caused new problems, reduce score
    if (hasSideEffects) {
      score -= 0.2;
    }

    return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
  }

  /**
   * Get confidence adjustment based on effectiveness
   * @private
   */
  _getConfidenceAdjustment(effectiveness) {
    if (effectiveness >= this.EFFECTIVENESS_THRESHOLDS.EXCELLENT) {
      return this.CONFIDENCE_ADJUSTMENTS.EXCELLENT;
    } else if (effectiveness >= this.EFFECTIVENESS_THRESHOLDS.GOOD) {
      return this.CONFIDENCE_ADJUSTMENTS.GOOD;
    } else if (effectiveness >= this.EFFECTIVENESS_THRESHOLDS.FAIR) {
      return this.CONFIDENCE_ADJUSTMENTS.FAIR;
    } else {
      return this.CONFIDENCE_ADJUSTMENTS.POOR;
    }
  }

  /**
   * Update action effectiveness history in memory
   * @private
   */
  async _updateActionEffectiveness(tenantId, action, pattern, severity, outcome) {
    try {
      const key = `action:effectiveness:${action}:${pattern || 'all'}`;

      const current = (await this.memory.find(tenantId, key)) || {
        action,
        pattern,
        severity,
        stats: {
          outcomes: [],
          totalAttempts: 0,
          successCount: 0,
        },
      };

      current.stats.outcomes.push(outcome);
      current.stats.totalAttempts++;
      if (!outcome.hasSideEffects) {
        current.stats.successCount++;
      }

      await this.memory.save(tenantId, key, current);
    } catch (error) {
      console.warn('[learning] Failed to update effectiveness:', error.message);
    }
  }

  /**
   * Update confidence score for future decisions
   * @private
   */
  async _updateActionConfidence(tenantId, action, pattern, adjustment) {
    try {
      const key = `action:confidence:${action}:${pattern || 'all'}`;

      const current = (await this.memory.find(tenantId, key)) || {
        action,
        pattern,
        baseConfidence: 0.7,
        adjustments: [],
      };

      current.adjustments.push({
        adjustment,
        timestamp: new Date(),
        reason: 'Learning from outcome',
      });

      // Recalculate effective confidence
      const totalAdjustment = current.adjustments.reduce((sum, a) => sum + a.adjustment, 0);
      current.effectiveConfidence = Math.max(0, Math.min(1, 0.7 + totalAdjustment));

      await this.memory.save(tenantId, key, current);
    } catch (error) {
      console.warn('[learning] Failed to update confidence:', error.message);
    }
  }

  /**
   * Suggest alternative actions if current action is ineffective
   * @private
   */
  async _suggestAlternativeActions(tenantId, pattern, severity) {
    try {
      const actions = ['restart', 'retry', 'scale', 'isolate', 'alert'];
      const alternatives = [];

      for (const alt of actions) {
        const data = await this.getActionEffectiveness(tenantId, alt, pattern);
        if (data.effectiveness > 0.6) {
          alternatives.push({
            action: alt,
            effectiveness: data.effectiveness,
          });
        }
      }

      return alternatives.sort((a, b) => b.effectiveness - a.effectiveness);
    } catch (error) {
      console.warn('[learning] Could not suggest alternatives:', error.message);
      return [];
    }
  }

  /**
   * Generate recommendations for action use
   * @private
   */
  _generateRecommendations(action, effectiveness, sideEffectRate) {
    const recommendations = [];

    if (effectiveness < 0.3) {
      recommendations.push({
        level: 'CRITICAL',
        message: `${action} is ineffective (${(effectiveness * 100).toFixed(0)}% success rate). Consider alternatives.`,
      });
    }

    if (sideEffectRate > 0.3) {
      recommendations.push({
        level: 'WARNING',
        message: `${action} causes side effects in ${(sideEffectRate * 100).toFixed(0)}% of cases.`,
      });
    }

    if (effectiveness > 0.8) {
      recommendations.push({
        level: 'INFO',
        message: `${action} has high success rate (${(effectiveness * 100).toFixed(0)}%). Consider using more often.`,
      });
    }

    return recommendations;
  }

  /**
   * Build "playbook" of best actions for each pattern
   */
  async buildPlaybook(tenantId) {
    try {
      // Get patterns from memory or use defaults
      let patterns = ['high-error-rate', 'high-latency', 'cascade-failure'];
      
      // Try to dynamically find patterns from recorded data
      if (this.memory && this.memory.getAllKeys) {
        const keys = await this.memory.getAllKeys(tenantId);
        const foundPatterns = new Set();
        keys.forEach(key => {
          const match = key.match(/action:effectiveness:[^:]+:(.+)/);
          if (match && match[1] !== 'all') {
            foundPatterns.add(match[1]);
          }
        });
        if (foundPatterns.size > 0) {
          patterns = Array.from(foundPatterns);
        }
      }

      const playbook = {};

      for (const pattern of patterns) {
        const actions = ['restart', 'retry', 'scale', 'isolate'];
        const patternActions = [];

        for (const action of actions) {
          const effectiveness = await this.getActionEffectiveness(tenantId, action, pattern);
          if (effectiveness.sampleSize > 0) {
            patternActions.push({
              action,
              effectiveness: effectiveness.effectiveness,
              sampleSize: effectiveness.sampleSize,
              avgRecoveryTimeMs: effectiveness.avgRecoveryTimeMs,
            });
          }
        }

        // Sort by effectiveness (descending), then by recovery time (ascending)
        playbook[pattern] = patternActions.sort((a, b) => {
          const effDiff = b.effectiveness - a.effectiveness;
          if (effDiff !== 0) return effDiff;
          return (a.avgRecoveryTimeMs || 0) - (b.avgRecoveryTimeMs || 0);
        });
      }

      return playbook;
    } catch (error) {
      console.warn('[learning] Could not build playbook:', error.message);
      return {};
    }
  }
}

module.exports = IncidentLearningService;
