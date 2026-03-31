/**
 * Incident Generator
 * Creates realistic incident streams for long-term simulation
 * Simulates:
 * - Recurring patterns that can be learned
 * - New unseen patterns that test adaptability
 * - Varying severity and types
 * - Temporal clustering (some incidents more likely at certain times)
 */

class IncidentGenerator {
  constructor(config = {}) {
    this.config = {
      totalIncidents: config.totalIncidents || 1000,
      successRate: config.successRate || 0.7,
      patternTypes: config.patternTypes || [
        'database_connection_timeout',
        'cache_invalidation_cascading',
        'api_rate_limit',
        'service_degradation',
        'cascading_failure',
      ],
      severities: ['low', 'medium', 'high'],
      ...config,
    };

    this.incidents = [];
    this.patternCounts = {};
    this.incidentCounter = 0;
    this.nextNewPatternAt = Math.floor(this.config.totalIncidents * 0.6); // Introduce new pattern at 60%
    this.newPatternIntroduced = false;
  }

  /**
   * Generate realistic incident stream
   * Includes recurring patterns (for learning) and novel patterns (for adaptation)
   */
  generateIncidentStream() {
    const incidents = [];

    // Phase 1: Recurring patterns (0-60%)
    const phase1Count = Math.floor(this.config.totalIncidents * 0.6);
    const basePatterns = this.config.patternTypes.slice(0, 3); // Use first 3 patterns

    for (let i = 0; i < phase1Count; i++) {
      const pattern = basePatterns[i % basePatterns.length];
      const incident = this._generateIncident(i, pattern, true);
      incidents.push(incident);
      this.patternCounts[pattern] = (this.patternCounts[pattern] || 0) + 1;
    }

    // Phase 2: Introduce new pattern (60-70%)
    const phase2Count = Math.floor(this.config.totalIncidents * 0.1);
    const newPattern = this.config.patternTypes[3] || 'novel_cascading_failure';
    for (let i = 0; i < phase2Count; i++) {
      const incident = this._generateIncident(phase1Count + i, newPattern, true);
      incidents.push(incident);
      this.patternCounts[newPattern] = (this.patternCounts[newPattern] || 0) + 1;
    }
    this.newPatternIntroduced = true;

    // Phase 3: Mixed patterns with drift (70-100%)
    const phase3Count = this.config.totalIncidents - phase1Count - phase2Count;
    const allPatterns = this.config.patternTypes;
    for (let i = 0; i < phase3Count; i++) {
      const pattern = allPatterns[i % allPatterns.length];
      const incident = this._generateIncident(phase1Count + phase2Count + i, pattern, false);
      incidents.push(incident);
      this.patternCounts[pattern] = (this.patternCounts[pattern] || 0) + 1;
    }

    this.incidents = incidents;
    return incidents;
  }

  /**
   * Generate a single incident with realistic parameters
   * @param {number} index - Incident sequence number
   * @param {string} patternType - Type of incident pattern
   * @param {boolean} isRecurring - Whether this is a known recurring pattern
   */
  _generateIncident(index, patternType, isRecurring) {
    const timestamp = new Date(Date.now() + index * 60000); // 1 incident per minute in simulation time

    // Determine if this decision will succeed (based on config success rate)
    // Recurring patterns more likely to succeed once learned
    let successProbability = this.config.successRate;
    if (isRecurring) {
      // Later incidents of same pattern more likely to succeed (learning effect)
      const occurrenceNumber = (this.patternCounts[patternType] || 0) + 1;
      successProbability = Math.min(0.95, this.config.successRate + (occurrenceNumber * 0.02));
    }

    const willSucceed = Math.random() < successProbability;

    // Pattern matching - recurring patterns have higher match scores
    const basePatternMatch = isRecurring ? 0.65 + Math.random() * 0.25 : 0.3 + Math.random() * 0.3;

    // Historical success - improves for recurring patterns
    const occurrences = this.patternCounts[patternType] || 1;
    const historicalSuccess = Math.min(0.9, 0.5 + (occurrences * 0.05) + (willSucceed ? 0.1 : 0));

    // Signal strength varies
    const signalStrength = 0.4 + Math.random() * 0.5;

    // Recency - more recent incidents more relevant
    const recency = 0.5 + (index / this.config.totalIncidents) * 0.4;

    // Policy alignment - consistent for same pattern type
    const policyAlignment = this._getPolicyAlignment(patternType);

    const severity = this._determineSeverity(patternType, willSucceed);

    const incident = {
      id: `INCIDENT-${String(index).padStart(6, '0')}`,
      sequenceNumber: index,
      timestamp,
      patternType,
      isRecurring,
      isNewPattern: !isRecurring && this.newPatternIntroduced,
      severity,
      serviceId: `service-${Math.floor(Math.random() * 5) + 1}`,
      
      // Synthetic analysis results (what the analysis agent would produce)
      analysisResult: {
        issueType: patternType,
        severity,
        occurrenceCount: (this.patternCounts[patternType] || 0) + 1,
        signalQuality: signalStrength,
        patternConfidence: basePatternMatch,
        correlatedServices: [
          `service-${Math.floor(Math.random() * 5) + 1}`,
          `service-${Math.floor(Math.random() * 5) + 1}`,
        ],
      },

      // Confidence factors (what confidence service would calculate)
      confidenceFactors: {
        pattern_match: basePatternMatch,
        historical_success: historicalSuccess,
        signal_strength: signalStrength,
        recency,
        policy_alignment: policyAlignment,
      },

      // Ground truth outcome
      outcome: {
        success: willSucceed,
        timeToRecoveryMs: willSucceed 
          ? Math.floor(5000 + Math.random() * 15000)
          : Math.floor(30000 + Math.random() * 60000),
        sideEffects: this._generateSideEffects(willSucceed, severity),
      },

      // Metadata for analysis
      metadata: {
        learningPhase: index < Math.floor(this.config.totalIncidents * 0.6)
          ? 'pattern_learning'
          : index < Math.floor(this.config.totalIncidents * 0.7)
            ? 'adaptation'
            : 'drift_resilience',
        expectedDifficulty: isRecurring ? 'low' : 'medium',
      },
    };

    return incident;
  }

  /**
   * Determine incident severity
   * Failed incidents tend to be higher severity, new patterns unpredictable
   */
  _determineSeverity(patternType, willSucceed) {
    if (patternType === 'cascading_failure' || patternType === 'novel_cascading_failure') {
      return 'high';
    }
    
    if (!willSucceed) {
      return Math.random() < 0.6 ? 'high' : 'medium';
    }

    return ['low', 'medium', 'high'][Math.floor(Math.random() * 3)];
  }

  /**
   * Policy alignment varies by pattern type
   * Some patterns naturally align better with policy
   */
  _getPolicyAlignment(patternType) {
    const alignmentMap = {
      'database_connection_timeout': 0.75,
      'cache_invalidation_cascading': 0.65,
      'api_rate_limit': 0.8,
      'service_degradation': 0.7,
      'cascading_failure': 0.5,
      'novel_cascading_failure': 0.45,
    };
    
    const baseAlignment = alignmentMap[patternType] || 0.6;
    return Math.max(0.2, Math.min(1.0, baseAlignment + (Math.random() - 0.5) * 0.2));
  }

  /**
   * Generate side effects
   * Successful resolutions have fewer/milder side effects
   */
  _generateSideEffects(success, severity) {
    if (success) {
      if (Math.random() > 0.3) return []; // 70% no side effects
      
      return [{
        type: 'brief_service_slowdown',
        severity: 'low',
        duration: 1000,
      }];
    }

    // Failed incidents have more severe side effects
    const sideEffects = [];
    
    if (severity === 'high') {
      sideEffects.push({
        type: 'cascading_failure',
        severity: 'high',
        duration: Math.floor(60000 + Math.random() * 120000),
      });
    }

    if (Math.random() > 0.4) {
      sideEffects.push({
        type: 'resource_spike',
        severity: severity === 'high' ? 'high' : 'medium',
        duration: Math.floor(30000 + Math.random() * 90000),
      });
    }

    return sideEffects;
  }

  /**
   * Get incident batch by sequence number
   */
  getIncidentBatch(startIndex, batchSize) {
    return this.incidents.slice(startIndex, startIndex + batchSize);
  }

  /**
   * Get statistics about generated incidents
   */
  getStatistics() {
    const totalByPattern = {};
    const successByPattern = {};

    this.incidents.forEach(incident => {
      const pattern = incident.patternType;
      totalByPattern[pattern] = (totalByPattern[pattern] || 0) + 1;
      if (incident.outcome.success) {
        successByPattern[pattern] = (successByPattern[pattern] || 0) + 1;
      }
    });

    const patternStats = Object.entries(totalByPattern).map(([pattern, count]) => ({
      pattern,
      total: count,
      successful: successByPattern[pattern] || 0,
      successRate: ((successByPattern[pattern] || 0) / count * 100).toFixed(2) + '%',
    }));

    return {
      totalIncidents: this.incidents.length,
      overallSuccessRate: (this.incidents.filter(i => i.outcome.success).length / this.incidents.length * 100).toFixed(2) + '%',
      patternStatistics: patternStats,
      phaseInfo: {
        learningPhase: `0-${Math.floor(this.config.totalIncidents * 0.6)}`,
        adaptationPhase: `${Math.floor(this.config.totalIncidents * 0.6)}-${Math.floor(this.config.totalIncidents * 0.7)}`,
        driftResiliencePhase: `${Math.floor(this.config.totalIncidents * 0.7)}-${this.config.totalIncidents}`,
      },
    };
  }
}

module.exports = IncidentGenerator;
