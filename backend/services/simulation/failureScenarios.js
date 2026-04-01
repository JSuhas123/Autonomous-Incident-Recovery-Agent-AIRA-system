/**
 * Phase 7: Simulation Failure Scenarios
 * 
 * Add scenarios where AIRA makes suboptimal decisions or fails
 * to test recovery and decision quality improvement
 */

const failureScenarios = {
  // Scenario 1: Incorrect Policy
  incorrectPolicy: {
    name: 'Incorrect Policy Decision',
    description: 'AIRA follows an incorrect policy leading to suboptimal action',
    trigger: { errorRate: 'high', service: 'payment' },
    incorrectAction: 'circuit-break',           // Wrong action
    correctAction: 'restart',                    // Actually needed
    impact: {
      delayedRecovery: 120000,                  // 2 minutes extra
      addedUserImpact: 5000,
      costIncrease: 25000
    },
    recovery: 'Manual override required; operator must execute correct action'
  },

  // Scenario 2: Cascading Failures
  cascadingFailure: {
    name: 'Cascading Service Failures',
    description: 'AIRA action causes ripple effect through dependent services',
    trigger: { pattern: 'high-load', cpu: '>80%' },
    action: 'scale-up',
    sideEffect: 'Causes database connection pool exhaustion',
    expectedOutcome: 'Partial recovery; secondary service fails',
    impact: {
      timeToResolve: 600000,                    // 10 minutes total
      totalAffectedUsers: 15000,
      totalDataLoss: 0,
      reputationalDamage: 'High'
    },
    lessons: [
      'Test action side-effects before auto-execution',
      'Implement dry-run for resource-intensive actions',
      'Add circuit breakers between dependent services'
    ]
  },

  // Scenario 3: Degraded Observability
  degradedObservability: {
    name: 'Decision Made with Incomplete Metrics',
    description: 'Observability pipeline fails; AIRA makes decision with incomplete data',
    trigger: { observabilityHealthScore: '<50%' },
    metricsAvailable: ['error_rate'],           // Only 20% of metrics
    metricsUnavailable: ['latency', 'availability', 'resources', 'business_metrics'],
    action: 'scale-down',                        // Wrong decision based on incomplete data
    actualRootCause: 'Resource exhaustion (unknown due to missing metrics)',
    outcome: {
      success: false,
      timeToResolve: 1200000,                   // 20 minutes (much longer)
      userImpactPercent: 65
    },
    recovery: 'Manually scale up after observability restored'
  },

  // Scenario 4: Self-Inflicted Harm
  selfInflictedHarm: {
    name: 'AIRA Action Causes the Same Problem',
    description: 'Action meant to fix issue actually causes it again',
    trigger: { pattern: 'memory-leak', service: 'cache-service' },
    action: 'restart',
    problem: 'Restart does not clear old connections; leak persists',
    outcome: {
      effectiveness: 0,                         // No improvement
      delayToNextAction: 180000,                // 3 min delay before retry
      totalTimeWasted: 360000                   // 6 minutes total
    },
    improvement: 'Add pre-action validation to detect identity of problem'
  },

  // Scenario 5: Race Condition
  raceCondition: {
    name: 'Concurrent Actions Create Race Condition',
    description: 'Multiple AIRA decisions execute simultaneously on same resource',
    trigger: [
      { pattern: 'high-error-rate', action: 'restart' },
      { pattern: 'high-latency', action: 'scale-up' }
    ],
    simultaneousActions: ['restart', 'scale-up'],
    outcome: {
      conflictingChanges: true,
      resultantState: 'Inconsistent',
      timeToConsistency: 300000,                // 5 minutes to stabilize
      userImpact: 'Degraded performance during stabilization'
    },
    solution: 'Implement mutual exclusion; queue actions with dependencies'
  },

  // Scenario 6: False Confidence
  falseConfidence: {
    name: 'High Confidence in Wrong Decision',
    description: 'AIRA is highly confident in decision that actually fails',
    trigger: { pattern: 'high-error-rate' },
    confidenceScore: 0.92,
    decision: 'scale-down',                      // Confident but wrong
    actualSuccess: false,
    reasons: [
      'Historical data heavily weighted similar incident',
      'That incident had different root cause',
      'Confidence system over-indexed on error rate pattern'
    ],
    improvement: 'Separate pattern classification; don\'t over-rely on single metric'
  },

  // Scenario 7: Insufficient Permissions
  insufficientPermissions: {
    name: 'Action Cannot Execute Due to Permissions',
    description: 'AIRA decides on action but lacks permissions to execute',
    action: 'restart-kubernetes-pod',
    requiredPermission: 'pods/restart in namespace production',
    actualPermission: 'Only has pods/get and pods/describe',
    outcome: {
      actionFailed: true,
      errorMessage: '403 Forbidden',
      timeWasted: 30000,                        // 30 seconds
      userImpactContinues: true
    },
    solution: 'Validate permissions before deciding on action'
  },

  // Scenario 8: Slow Action Execution
  slowActionExecution: {
    name: 'Action Executes But Too Slowly',
    description: 'Action is correct but takes too long to resolve issue',
    action: 'database-failover',
    estimatedDuration: 30000,                   // 30 seconds estimated
    actualDuration: 300000,                     // 5 minutes actual
    outcome: {
      userImpactDuration: 300000,
      escalation: true,
      manualInterventionNeeded: true
    },
    improvement: 'Pre-test actions in staging; calibrate duration estimates'
  }
};

// Scenario execution with metrics
class SimulationScenarioRunner {
  constructor() {
    this.scenarios = failureScenarios;
  }

  /**
   * Run a scenario and collect metrics
   */
  runScenario(scenarioName, decisionData) {
    const scenario = this.scenarios[scenarioName];
    if (!scenario) {
      throw new Error(`Scenario ${scenarioName} not found`);
    }

    const result = {
      scenario: scenarioName,
      description: scenario.description,
      decision: decisionData,
      expectedOutcome: scenario.outcome || scenario.expectedOutcome,
      actualOutcome: null,
      metrics: {
        timeToResolve: 0,
        userImpactPercent: 0,
        effectiveness: 0,
        costImpact: 0
      },
      lessons: scenario.lessons || []
    };

    return result;
  }

  /**
   * Get all scenarios
   */
  getAllScenarios() {
    return Object.keys(this.scenarios).map(key => ({
      id: key,
      ...this.scenarios[key]
    }));
  }

  /**
   * Test AIRA's handling of a scenario
   */
  testScenarioHandling(aiiraDecision, scenarioName) {
    const scenario = this.scenarios[scenarioName];
    if (!scenario) {
      return { success: false, error: 'Scenario not found' };
    }

    // Check if AIRA's decision is appropriate for this scenario
    const didDetectProblem = this.checkProblemDetection(aiiraDecision, scenario);
    const didChooseCorrectAction = this.checkActionCorrectness(
      aiiraDecision.action,
      scenario.correctAction || scenario.action
    );
    const hadReasonableConfidence = aiiraDecision.confidence > 0.5;

    const overallSuccess = didDetectProblem && didChooseCorrectAction && hadReasonableConfidence;

    return {
      success: overallSuccess,
      scenarioHandled: {
        problemDetected: didDetectProblem,
        correctActionChosen: didChooseCorrectAction,
        reasonableConfidence: hadReasonableConfidence
      },
      improvements: this.suggestImprovements(scenario, aiiraDecision)
    };
  }

  checkProblemDetection(decision, scenario) {
    // Simple check: did AIRA identify the pattern mentioned in scenario?
    return decision.pattern === scenario.trigger.pattern || 
           decision.pattern === scenario.pattern;
  }

  checkActionCorrectness(decidedAction, expectedAction) {
    return decidedAction === expectedAction;
  }

  suggestImprovements(scenario, decision) {
    const suggestions = [];

    if (scenario.lessons) {
      suggestions.push(...scenario.lessons);
    }

    if (decision.confidence > 0.8) {
      suggestions.push('Consider reducing confidence when data is incomplete');
    }

    if (scenario.metricsUnavailable && scenario.metricsUnavailable.length > 0) {
      suggestions.push(
        `Metrics unavailable: ${scenario.metricsUnavailable.join(', ')}. ` +
        'Wait for observability recovery before actioning.'
      );
    }

    return suggestions;
  }
}

module.exports = {
  failureScenarios,
  SimulationScenarioRunner
};
