const IncidentMemory = require("../../models/IncidentMemory");

/**
 * Memory Service
 * Tracks incident patterns and historical outcomes
 * Influences future decisions based on past successes
 */

class MemoryService {
  /**
   * Find or create pattern memory
   */
  async find(tenantId, patternId, patternType = null) {
    try {
      let memory = await IncidentMemory.findOne({
        tenantId,
        patternId,
      });

      if (!memory && patternType) {
        memory = new IncidentMemory({
          tenantId,
          patternId,
          patternType,
          patternName: `Pattern: ${patternId}`,
          stats: {
            totalOccurrences: 0,
            actions: {},
          },
        });
        await memory.save();
      }

      return memory;
    } catch (error) {
      console.error("[memory] Error finding pattern:", error);
      return null;
    }
  }

  /**
   * Record successful action for pattern
   */
  async recordSuccess(tenantId, patternId, action, recoveryTimeMs = 0) {
    try {
      let memory = await this.find(tenantId, patternId);

      if (!memory) {
        memory = new IncidentMemory({
          tenantId,
          patternId,
          patternType: "high-error-rate",
          patternName: `Pattern: ${patternId}`,
          stats: { totalOccurrences: 0, actions: {} },
        });
      }

      // Initialize action stats if needed
      if (!memory.stats.actions[action]) {
        memory.stats.actions[action] = {
          successes: 0,
          failures: 0,
          totalAttempts: 0,
          successRate: 0,
          avgRecoveryTimeMs: 0,
          lastUsed: null,
        };
      }

      // Update action stats
      const stats = memory.stats.actions[action];
      stats.successes++;
      stats.totalAttempts++;
      stats.lastUsed = new Date();

      // Update average recovery time
      if (recoveryTimeMs > 0) {
        const prevTotal =
          stats.avgRecoveryTimeMs * (stats.successes - 1);
        stats.avgRecoveryTimeMs = (prevTotal + recoveryTimeMs) / stats.successes;
      }

      // Recompute success rate
      stats.successRate = stats.totalAttempts > 0
        ? stats.successes / stats.totalAttempts
        : 0;

      // Update overall stats
      memory.stats.lastOccurrence = new Date();
      memory.stats.totalOccurrences++;

      // Update recommended action if this action has high success rate
      if (stats.successRate >= 0.8 && stats.totalAttempts >= 3) {
        memory.recommendedAction = {
          action,
          successRate: stats.successRate,
          reasoning: `High success rate (${(stats.successRate * 100).toFixed(0)}%) over ${stats.totalAttempts} attempts`,
          confidence: Math.min(stats.totalAttempts / 10, 1.0),
        };
      }

      memory.updatedAt = new Date();
      await memory.save();

      console.log(
        `[memory] Recorded success: ${patternId} + ${action} (recovery: ${recoveryTimeMs}ms)`
      );

      return memory;
    } catch (error) {
      console.error("[memory] Error recording success:", error);
      throw error;
    }
  }

  /**
   * Record failed action for pattern
   */
  async recordFailure(tenantId, patternId, action, reason = null) {
    try {
      let memory = await this.find(tenantId, patternId);

      if (!memory) {
        memory = new IncidentMemory({
          tenantId,
          patternId,
          patternType: "learned-pattern",
          patternName: `Pattern: ${patternId}`,
          stats: { totalOccurrences: 0, actions: {} },
        });
      }

      // Initialize action stats if needed
      if (!memory.stats.actions[action]) {
        memory.stats.actions[action] = {
          successes: 0,
          failures: 0,
          totalAttempts: 0,
          successRate: 0,
          avgRecoveryTimeMs: 0,
          lastUsed: null,
        };
      }

      // Update action stats
      const stats = memory.stats.actions[action];
      stats.failures++;
      stats.totalAttempts++;
      stats.lastUsed = new Date();

      // Recompute success rate
      stats.successRate = stats.totalAttempts > 0
        ? stats.successes / stats.totalAttempts
        : 0;

      // Update overall stats
      memory.stats.lastOccurrence = new Date();
      memory.stats.totalOccurrences++;

      memory.updatedAt = new Date();
      await memory.save();

      console.log(
        `[memory] Recorded failure: ${patternId} + ${action} (reason: ${reason})`
      );

      return memory;
    } catch (error) {
      console.error("[memory] Error recording failure:", error);
      throw error;
    }
  }

  /**
   * Get best action for pattern
   */
  async getBestAction(tenantId, patternId) {
    try {
      const memory = await this.find(tenantId, patternId);

      if (!memory || !memory.stats.actions) {
        return null;
      }

      // Find action with highest success rate
      let bestAction = null;
      let bestRate = 0;

      for (const [action, stats] of Object.entries(memory.stats.actions)) {
        if (stats.successRate > bestRate && stats.totalAttempts >= 2) {
          bestAction = action;
          bestRate = stats.successRate;
        }
      }

      if (bestAction) {
        const actionStats = memory.stats.actions[bestAction];
        return {
          action: bestAction,
          successRate: actionStats.successRate,
          totalAttempts: actionStats.totalAttempts,
          avgRecoveryTimeMs: actionStats.avgRecoveryTimeMs,
          reasoning: `Historical success rate: ${(actionStats.successRate * 100).toFixed(0)}% over ${actionStats.totalAttempts} attempts`,
        };
      }

      return null;
    } catch (error) {
      console.error("[memory] Error getting best action:", error);
      return null;
    }
  }

  /**
   * Get frequency analysis for pattern
   */
  async getFrequencyAnalysis(tenantId, patternId) {
    try {
      const memory = await this.find(tenantId, patternId);

      if (!memory || !memory.stats.lastOccurrence) {
        return {
          patternId,
          totalOccurrences: 0,
          frequency: "never",
        };
      }

      const occurrences = memory.stats.totalOccurrences;
      const lastOccurrence = new Date(memory.stats.lastOccurrence);
      const createdAt = new Date(memory.createdAt);
      const lifespanDays =
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

      let frequency = "rare";
      if (lifespanDays > 0) {
        const occurrencesPerDay = occurrences / lifespanDays;
        if (occurrencesPerDay >= 1) {
          frequency = `multiple per day (${occurrencesPerDay.toFixed(2)}/day)`;
        } else if (occurrencesPerDay >= 0.33) {
          frequency = `every 2-3 days`;
        } else if (occurrencesPerDay >= 0.14) {
          frequency = `once a week`;
        } else if (occurrencesPerDay >= 0.033) {
          frequency = `once a month`;
        } else {
          frequency = "rare";
        }
      }

      return {
        patternId,
        totalOccurrences: occurrences,
        frequency,
        lifespanDays: lifespanDays.toFixed(1),
        occurrencesPerDay:
          lifespanDays > 0
            ? (occurrences / lifespanDays).toFixed(3)
            : "N/A",
        lastOccurrence,
        firstOccurrence: createdAt,
      };
    } catch (error) {
      console.error("[memory] Error analyzing frequency:", error);
      return null;
    }
  }

  /**
   * Predict next occurrence
   */
  async predictNextOccurrence(tenantId, patternId) {
    try {
      const memory = await this.find(tenantId, patternId);

      if (!memory || memory.stats.totalOccurrences < 2) {
        return {
          patternId,
          predictable: false,
          reason: "Not enough data for prediction",
        };
      }

      const analysis = await this.getFrequencyAnalysis(tenantId, patternId);

      // Simple linear prediction based on frequency
      let predictedIntervalMs = 0;

      if (analysis.frequency.includes("multiple per day")) {
        predictedIntervalMs = (24 * 60 * 60 * 1000) / 2; // Every 12 hours
      } else if (analysis.frequency.includes("2-3 days")) {
        predictedIntervalMs = 2.5 * 24 * 60 * 60 * 1000;
      } else if (analysis.frequency.includes("once a week")) {
        predictedIntervalMs = 7 * 24 * 60 * 60 * 1000;
      } else {
        return {
          patternId,
          predictable: false,
          reason: "Pattern frequency too low for reliable prediction",
        };
      }

      const lastOccurrence = new Date(memory.stats.lastOccurrence);
      const predictedTime = new Date(lastOccurrence.getTime() + predictedIntervalMs);

      return {
        patternId,
        predictable: true,
        estimatedTime: predictedTime,
        confidence: Math.min(memory.stats.totalOccurrences / 10, 0.9),
        reasoning: `Based on frequency of ${analysis.frequency}`,
      };
    } catch (error) {
      console.error("[memory] Error predicting occurrence:", error);
      return { patternId, predictable: false, reason: "Prediction error" };
    }
  }

  /**
   * Get memory summary for all patterns
   */
  async getSummary(tenantId) {
    try {
      const memories = await IncidentMemory.find({
        tenantId,
        isActive: true,
      });

      return {
        totalPatterns: memories.length,
        patterns: memories.map((m) => ({
          patternId: m.patternId,
          totalOccurrences: m.stats.totalOccurrences,
          lastOccurrence: m.stats.lastOccurrence,
          recommendedAction: m.recommendedAction,
          actionStats: m.stats.actions,
        })),
      };
    } catch (error) {
      console.error("[memory] Error getting summary:", error);
      return { totalPatterns: 0, patterns: [] };
    }
  }
}

module.exports = new MemoryService();
