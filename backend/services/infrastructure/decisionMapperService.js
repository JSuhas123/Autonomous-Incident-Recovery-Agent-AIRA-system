/**
 * Decision Mapping Service
 * 
 * Maps decisions to concrete executable actions
 * Implements tiered logic: High → Direct | Medium → Safe Fallback | Low → Escalate
 * 
 * Ensures NO signal is silently dropped
 */

class DecisionMapperService {
  constructor() {
    // Map decision outcomes to executable actions
    this.actionMap = {
      // Service Crash scenarios
      'RESTART_SERVICE': {
        tier: 'execute',
        actionType: 'RESTART_SERVICE',
        fallback: 'ESCALATE_TO_OPS',
        dryRunRequired: false,
        reversible: true,
        estimatedRecoveryMs: 30000,
        description: 'Restart crashed service instance(s)'
      },
      
      // Database issues
      'SCALE_DATABASE': {
        tier: 'execute',
        actionType: 'SCALE_DATABASE',
        fallback: 'ESCALATE_TO_DBA',
        dryRunRequired: true,
        reversible: true,
        estimatedRecoveryMs: 60000,
        description: 'Scale database read replicas or connection pool'
      },
      
      'CACHE_INVALIDATION': {
        tier: 'execute',
        actionType: 'CACHE_INVALIDATION',
        fallback: 'RESTART_SERVICE',
        dryRunRequired: false,
        reversible: true,
        estimatedRecoveryMs: 5000,
        description: 'Clear cache and rebuild if needed'
      },
      
      'INCREASE_MONITORING': {
        tier: 'execute',
        actionType: 'INCREASE_MONITORING',
        fallback: null,
        dryRunRequired: false,
        reversible: true,
        estimatedRecoveryMs: 0,
        description: 'Increase observability sampling rate'
      },
      
      // Cascade/Isolation scenarios
      'ISOLATE_SERVICE': {
        tier: 'execute',
        actionType: 'ISOLATE_SERVICE',
        fallback: 'ESCALATE_TO_OPS',
        dryRunRequired: true,
        reversible: true,
        estimatedRecoveryMs: 45000,
        description: 'Circuit breaker isolation to prevent cascade'
      },
      
      'SHED_LOAD': {
        tier: 'execute',
        actionType: 'SHED_LOAD',
        fallback: 'ESCALATE_TO_OPS',
        dryRunRequired: false,
        reversible: true,
        estimatedRecoveryMs: 10000,
        description: 'Throttle incoming requests to reduce load'
      },
      
      // Escalation scenarios
      'ESCALATE_TO_DBA': {
        tier: 'escalate',
        actionType: 'ESCALATE_TO_DBA',
        fallback: 'ESCALATE_TO_OPS',
        dryRunRequired: false,
        reversible: true,
        estimatedRecoveryMs: 0,
        description: 'Alert database team'
      },
      
      'ESCALATE_TO_OPS': {
        tier: 'escalate',
        actionType: 'ESCALATE_TO_OPS',
        fallback: null,
        dryRunRequired: false,
        reversible: true,
        estimatedRecoveryMs: 0,
        description: 'Alert operations team'
      },
      
      'ESCALATE_TO_INCIDENT_COMMANDER': {
        tier: 'escalate',
        actionType: 'ESCALATE_TO_INCIDENT_COMMANDER',
        fallback: 'ESCALATE_TO_OPS',
        dryRunRequired: false,
        reversible: true,
        estimatedRecoveryMs: 0,
        description: 'Page incident commander for major incident'
      },
      
      // Safe defaults
      'MONITOR': {
        tier: 'observe',
        actionType: 'MONITOR',
        fallback: null,
        dryRunRequired: false,
        reversible: true,
        estimatedRecoveryMs: 0,
        description: 'Continue monitoring without intervention'
      },
      
      'ALERT': {
        tier: 'observe',
        actionType: 'ALERT',
        fallback: null,
        dryRunRequired: false,
        reversible: true,
        estimatedRecoveryMs: 0,
        description: 'Alert humans to review'
      }
    };

    // Confidence-based tier selection
    this.tierSelection = {
      HIGH: { minScore: 0.8, tier: 'execute' },      // Direct action
      MEDIUM: { minScore: 0.65, tier: 'safe_fallback' }, // Safe action  
      LOW: { minScore: 0.5, tier: 'escalate' },      // Human review
      UNKNOWN: { minScore: 0, tier: 'observe' }      // Just monitor
    };

    // Signal pattern → Action mapping
    this.patternActionMap = {
      'SERVICE_CRASH': ['RESTART_SERVICE', 'ESCALATE_TO_OPS'],
      'DATABASE_LATENCY': ['SCALE_DATABASE', 'CACHE_INVALIDATION', 'ESCALATE_TO_DBA'],
      'HIGH_ERROR_RATE': ['RESTART_SERVICE', 'ESCALATE_TO_OPS'],
      'MEMORY_PRESSURE': ['RESTART_SERVICE', 'SHED_LOAD', 'ESCALATE_TO_OPS'],
      'NETWORK_PARTITION': ['ISOLATE_SERVICE', 'ESCALATE_TO_OPS'],
      'CASCADE_FAILURE': ['ISOLATE_SERVICE', 'SHED_LOAD', 'ESCALATE_TO_INCIDENT_COMMANDER'],
      'QUEUE_BACKLOG': ['INCREASE_MONITORING', 'SHED_LOAD'],
      'UNKNOWN': ['ALERT', 'ESCALATE_TO_OPS']
    };

    // Confidence level calculation
    this.confidenceLevelMap = {
      0.8: 'HIGH',
      0.65: 'MEDIUM', 
      0.5: 'LOW',
      0: 'UNKNOWN'
    };
  }

  /**
   * Map any decision to an executable action
   * Returns primary action + fallback + metadata
   */
  mapDecisionToAction(decision, confidenceScore, patternType = 'UNKNOWN') {
    const confidenceLevel = this._getConfidenceLevel(confidenceScore);
    const actionTier = this._getTierForConfidence(confidenceScore);
    
    // Step 1: Get candidate actions based on pattern
    const candidates = this.patternActionMap[patternType] || this.patternActionMap['UNKNOWN'];
    
    // Step 2: Filter by tier appropriateness
    const bestAction = this._selectBestAction(candidates, actionTier, confidenceScore);
    
    // Step 3: Get action metadata
    const actionMeta = this.actionMap[bestAction];
    if (!actionMeta) {
      // Fallback to safe default
      return {
        action: 'ALERT',
        tier: 'observe',
        confidenceLevel,
        fallback: 'ESCALATE_TO_OPS',
        reason: `Unknown action ${bestAction}; using safe default`,
        metadata: this.actionMap['ALERT']
      };
    }

    // Step 4: Prepare final decision map
    return {
      action: bestAction,
      tier: actionMeta.tier,
      confidenceLevel,
      confidence: confidenceScore,
      patternType,
      fallback: actionMeta.fallback,
      metadata: {
        ...actionMeta,
        dryRunRequired: actionMeta.dryRunRequired && actionTier === 'safe_fallback',
      },
      reasoning: {
        confidence_level: confidenceLevel,
        tier_selection: actionTier,
        pattern_matched: patternType,
        candidate_actions: candidates.slice(0, 3),
      }
    };
  }

  /**
   * Get fallback action if primary fails
   */
  getFallbackAction(primaryAction) {
    const meta = this.actionMap[primaryAction];
    if (!meta?.fallback) {
      return 'ESCALATE_TO_OPS'; // Ultimate fallback
    }
    return meta.fallback;
  }

  /**
   * Confidence level based on score
   */
  _getConfidenceLevel(score) {
    if (score >= 0.8) return 'HIGH';
    if (score >= 0.65) return 'MEDIUM';
    if (score >= 0.5) return 'LOW';
    return 'UNKNOWN';
  }

  /**
   * Determine action tier for confidence level
   * Implements tiered decision logic
   */
  _getTierForConfidence(confidenceScore) {
    if (confidenceScore >= 0.8) {
      return 'execute'; // High confidence → direct automated action
    }
    if (confidenceScore >= 0.65) {
      return 'safe_fallback'; // Medium confidence → safe actions (no restarts)
    }
    if (confidenceScore >= 0.5) {
      return 'escalate'; // Low confidence → escalate to humans
    }
    return 'observe'; // Unknown → just monitor
  }

  /**
   * Select best action for tier
   * Prefers execute-safe actions, then escalation
   */
  _selectBestAction(candidates, tier, confidenceScore) {
    if (!candidates?.length) {
      return 'ALERT';
    }

    if (tier === 'execute') {
      return this._selectExecuteAction(candidates);
    }
    if (tier === 'safe_fallback') {
      return this._selectSafeFallbackAction(candidates);
    }
    if (tier === 'escalate') {
      return this._selectEscalateAction(candidates);
    }
    return 'ALERT';
  }

  /**
   * Select execute tier action
   */
  _selectExecuteAction(candidates) {
    for (const action of candidates) {
      if (this.actionMap[action]?.tier === 'execute') {
        return action;
      }
    }
    return 'ALERT';
  }

  /**
   * Select safe fallback action
   */
  _selectSafeFallbackAction(candidates) {
    for (const action of candidates) {
      if (this.actionMap[action]?.tier === 'execute' &&
          action !== 'RESTART_SERVICE') {
        return action;
      }
    }
    for (const action of candidates) {
      if (this.actionMap[action]?.tier === 'escalate') {
        return action;
      }
    }
    return 'ALERT';
  }

  /**
   * Select escalate tier action
   */
  _selectEscalateAction(candidates) {
    for (const action of candidates) {
      if (this.actionMap[action]?.tier === 'escalate') {
        return action;
      }
    }
    return 'ALERT';
  }

  /**
   * Get all possible actions for a pattern
   * Used for testing and validation
   */
  getActionsForPattern(patternType) {
    return this.patternActionMap[patternType] || [];
  }

  /**
   * Validate action is executable
   */
  isExecutableAction(action) {
    return this.actionMap.hasOwnProperty(action);
  }

  /**
   * Get action metadata
   */
  getActionMetadata(action) {
    return this.actionMap[action] || null;
  }
}

module.exports = new DecisionMapperService();
