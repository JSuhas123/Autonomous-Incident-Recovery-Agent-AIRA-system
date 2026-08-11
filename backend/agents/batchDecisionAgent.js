/**
 * DEPRECATED — BatchDecisionAgent
 *
 * This class is NOT used in the active decision pipeline.
 * Batch incident processing is now handled by bounded concurrent calls
 * to the v2 AgentOrchestrator (backend/agents/v2/runtime/agentOrchestrator.js).
 *
 * Retained for reference only. Do not instantiate or add logic here.
 */

class BatchDecisionAgent {
  constructor(services) {
    // Services
    this.decisionTraceService = services.decisionTraceService;
    this.actionLogService = services.actionLogService;
    this.memoryService = services.memoryService;
    this.policyEngine = services.policyEngine;
    this.metricsService = services.metricsService;
    this.queue = services.queue;

    // State
    this.isRunning = false;
    this.metrics = {
      batchesProcessed: 0,
      decisionsGenerated: 0,
      cascadesDetected: 0,
      cachedDecisionsUsed: 0,
      escalationsTriggered: 0,
      avgDecisionLatency: 0,
    };
  }

  /**
   * Process batch of aggregated events
   * @param {Object} batch - Aggregated event batch
   * @returns {Promise} - Processed decisions
   */
  async processBatch(batch) {
    const batchStartTime = Date.now();

    try {
      const decisions = [];

      // STEP 1: Detect cascade pattern in batch
      const cascade = this.cascadeDetection.detectCascade(batch);

      if (cascade.isCascade) {
        this.metrics.cascadesDetected++;
        console.log(
          `[batch-decision-agent] 🔴 CASCADE DETECTED: ${cascade.rootCause} → ${cascade.propagationPath.join(' → ')}`
        );
      }

      // STEP 2: Aggregate events by issue type
      const issueGroups = this._groupByIssueType(batch.events, cascade);

      // STEP 3: Generate decisions for each issue group
      for (const issueGroup of issueGroups) {
        // Check cache first
        const cacheKey = this.decisionCache.generateIdempotencyKey(
          {
            rootCause: cascade.rootCause || issueGroup.service,
            severity: issueGroup.severity,
            patternType: issueGroup.issueType,
          },
          null
        );

        // Try to get from cache
        let cachedDecision = this.decisionCache.get(cacheKey);
        if (cachedDecision) {
          this.metrics.cachedDecisionsUsed++;
          console.log(`[batch-decision-agent] ✓ Using cached decision for ${issueGroup.service}`);

          decisions.push({
            ...cachedDecision,
            fromCache: true,
            cacheKey,
          });
          continue;
        }

        // STEP 4: Analyze issue group
        const analysis = await this._analyzeIssueGroup(issueGroup, cascade);

        // STEP 5: Generate decision with confidence scoring
        const decision = await this._makeDecision(analysis, cascade, issueGroup);

        // STEP 6: Score confidence and check escalation
        const confidenceScore = this.confidenceScorer.scoreDecision(decision, {
          patternMatch: analysis.patternMatch,
          infoClarity: cascade.isCascade ? 0.95 : 0.7,
          actionSuccess: analysis.actionHistorySuccess,
          stateClarity: 0.8,
        });

        decision.confidence = confidenceScore;
        decision.escalationRequired = confidenceScore.escalationRequired;
        decision.canProceed = this.confidenceScorer.canProceedWithAction(decision, confidenceScore);

        // STEP 7: Create decision trace with full reasoning
        const trace = await this._createDecisionTrace(decision, analysis, cascade, batch);

        // STEP 8: Evaluate against policies
        const policyEval = await this._evaluatePolicy(trace);
        decision.policyEvaluation = policyEval;
        trace.policyEvaluation = policyEval;

        // Block execution if policy denies
        if (policyEval.verdict === 'DENIED') {
          decision.canProceed = false;
          console.log(
            `[batch-decision-agent] ⚠️  Policy DENIED action: ${decision.action} (reason: ${policyEval.reason.join(', ')})`
          );
        }

        // STEP 9: Cache decision for future use
        this.decisionCache.set(cacheKey, {
          action: decision.action,
          reasoning: decision.reasoning,
          escalationRequired: decision.escalationRequired,
          confidence: confidenceScore.overallConfidence,
        });

        // STEP 10: If escalation required, create escalation notification
        if (decision.escalationRequired) {
          const escalation = this.confidenceScorer.buildEscalationNotification(
            decision,
            confidenceScore
          );
          decision.escalation = escalation;
          this.metrics.escalationsTriggered++;
        }

        decisions.push(decision);
        this.metrics.decisionsGenerated++;
      }

      // STEP 11: Publish decisions
      for (const decision of decisions) {
        await this._publishDecision(decision);
      }

      // Update metrics
      const batchLatency = Date.now() - batchStartTime;
      this.metrics.batchesProcessed++;
      this.metrics.avgDecisionLatency =
        (this.metrics.avgDecisionLatency * (this.metrics.batchesProcessed - 1) + batchLatency) /
        this.metrics.batchesProcessed;

      this.metricsService.recordBatchProcessing({
        batchSize: batch.size,
        decisionsGenerated: decisions.length,
        latency: batchLatency,
        cascadeDetected: cascade.isCascade,
      });

      return decisions;
    } catch (error) {
      console.error('[batch-decision-agent] Error processing batch:', error.message);
      throw error;
    }
  }

  /**
   * Group events by issue type
   * @private
   */
  _groupByIssueType(events, cascade) {
    const groups = new Map();

    for (const event of events) {
      const groupKey = `${event.service}:${event.signalType}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          service: event.service,
          signalType: event.signalType,
          issueType: this._determineIssueType(event),
          events: [],
          severity: 'low',
          eventCount: 0,
        });
      }

      const group = groups.get(groupKey);
      group.events.push(event);
      group.eventCount++;

      // Update severity
      if (event.severity === 'critical') {
        group.severity = 'critical';
      } else if (event.severity === 'warning' && group.severity !== 'critical') {
        group.severity = 'warning';
      }
    }

    return Array.from(groups.values());
  }

  /**
   * Determine issue type from event
   * @private
   */
  _determineIssueType(event) {
    if (event.signalType === 'latency' || event.signalType === 'responseTime') {
      return 'latency';
    }
    if (event.signalType === 'errorRate') {
      return 'stability';
    }
    if (event.signalType === 'throughput') {
      return 'throughput';
    }
    if (['cpu', 'memory'].includes(event.signalType)) {
      return 'resource';
    }
    return 'mixed';
  }

  /**
   * Analyze issue group with context
   * @private
   */
  async _analyzeIssueGroup(group, cascade) {
    // Query memory for similar patterns
    const memory = await this.memoryService.find({
      patternType: group.issueType,
      service: group.service,
    });

    const patternMatch = memory ? (memory.occurrences?.length || 0) / 10 : 0.3;
    const actionHistorySuccess = memory?.actions ? 
      Object.values(memory.actions).reduce((sum, a) => sum + (a.successRate || 0), 0) / 
      Object.keys(memory.actions).length : 0.5;

    return {
      group,
      severity: group.severity,
      eventCount: group.eventCount,
      patternMatch: Math.min(patternMatch, 1),
      actionHistorySuccess: Math.min(actionHistorySuccess, 1),
      isCascadeRoot: cascade.isCascade && cascade.rootCause === group.service,
      isCascadeDownstream: cascade.isCascade && cascade.propagationPath.includes(group.service),
      memory,
    };
  }

  /**
   * Make decision based on analysis
   * @private
   */
  async _makeDecision(analysis, cascade, group) {
    let action = 'log';
    let reason = 'Low-risk anomaly detected.';
    let escalationLevel = 'normal';

    // If part of cascade
    if (analysis.isCascadeRoot) {
      action = 'escalate_immediately';
      reason = `ROOT CAUSE IDENTIFIED: Database failure triggering cascade. Immediate escalation required.`;
      escalationLevel = 'critical';
    } else if (analysis.isCascadeDownstream && cascade.severity === 'critical') {
      action = 'scale_replicas';
      reason = `Service failing due to upstream cascade. Scaling replicas to handle load.`;
      escalationLevel = 'escalated';
    } else if (group.severity === 'critical') {
      // High severity, non-cascade
      action = 'restart';
      reason = `Critical severity detected on ${group.service}. Service restart required.`;
      escalationLevel = 'escalated';
    } else if (group.severity === 'warning') {
      // Medium severity
      action = 'retry_with_backoff';
      reason = `Warning-level anomaly detected. Retrying with exponential backoff.`;
      escalationLevel = 'normal';
    }

    return {
      action,
      reason,
      escalationLevel,
      service: group.service,
      severity: group.severity,
      rootCause: cascade.rootCause,
      isCascade: cascade.isCascade,
      cascadePath: cascade.propagationPath,
      patternType: group.issueType,
    };
  }

  /**
   * Create decision trace for audit
   * @private
   */
  async _createDecisionTrace(decision, analysis, cascade, batch) {
    return {
      decisionId: `decision-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      batchId: batch.batchId,
      inputs: {
        events: batch.events.length,
        aggregated: batch.aggregated,
        service: decision.service,
        severity: decision.severity,
      },
      analysis: {
        patternMatch: analysis.patternMatch,
        actionHistorySuccess: analysis.actionHistorySuccess,
        isCascadeRoot: analysis.isCascadeRoot,
      },
      cascade: cascade.isCascade ? {
        detected: true,
        rootCause: cascade.rootCause,
        confidence: cascade.confidence,
        affectedServices: cascade.affectedServices,
      } : null,
      reasoning: {
        hypothesis: decision.reason,
        evidenceFor: [
          `Severity: ${decision.severity}`,
          `Events: ${batch.events.length}`,
          `Pattern match confidence: ${(analysis.patternMatch * 100).toFixed(0)}%`,
        ],
        evidenceAgainst: [],
      },
      decision: {
        action: decision.action,
        escalationLevel: decision.escalationLevel,
        confidence: decision.confidence?.overallConfidence || 0.7,
      },
    };
  }

  /**
   * Evaluate decision against policies
   * @private
   */
  async _evaluatePolicy(trace) {
    try {
      const policyResult = await this.policyEngine.evaluatePolicy(trace, {
        tenantId: 'default',
      });

      return policyResult || {
        verdict: 'APPROVED',
        reason: [],
      };
    } catch (error) {
      console.error('[batch-decision-agent] Policy evaluation error:', error.message);
      return {
        verdict: 'DENIED',
        reason: [`Policy evaluation failed: ${error.message}`],
      };
    }
  }

  /**
   * Publish decision to queue
   * @private
   */
  async _publishDecision(decision) {
    try {
      await this.queue.publishEvent('decision.made', {
        decisionId: decision.id || `decision-${Date.now()}`,
        action: decision.action,
        service: decision.service,
        escalationRequired: decision.escalationRequired,
        confidence: decision.confidence?.overallConfidence,
        canProceed: decision.canProceed?.allowed,
        escalation: decision.escalation,
      });
    } catch (error) {
      console.error('[batch-decision-agent] Failed to publish decision:', error.message);
    }
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cache: this.decisionCache.getHealth(),
      cascade: this.cascadeDetection.getMetrics(),
      confidence: this.confidenceScorer.getMetrics(),
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    this.isRunning = false;
    this.decisionCache.shutdown();
  }
}

module.exports = BatchDecisionAgent;
