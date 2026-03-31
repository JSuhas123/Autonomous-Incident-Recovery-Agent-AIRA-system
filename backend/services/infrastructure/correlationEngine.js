/**
 * Incident Correlation Engine
 * Builds and maintains a graph of service dependencies and signal correlations
 * 
 * Graph Structure:
 * - Nodes: services, external dependencies, signal types
 * - Edges: dependencies (calls), correlations (signals that appear together)
 * - Weight: correlation strength based on historical co-occurrence
 * 
 * Detects:
 * - Multi-signal patterns (which signals appear together?)
 * - Cascade paths (if service A fails, which services fail next?)
 * - Root cause candidates (which service likely triggered the cascade?)
 */

class IncidentCorrelationEngine {
  constructor() {
    // Graph of services and dependencies
    this.serviceGraph = new Map(); // Map<serviceId, ServiceNode>
    
    // Signal correlation matrix
    this.signalCorrelation = new Map(); // Map<signalPair, frequency>
    
    // Incident patterns discovered
    this.discoveredPatterns = [];
    
    // Configuration
    this.correlationThreshold = 0.6; // 60% co-occurrence = correlated
    this.minPatternFrequency = 3; // Need 3+ occurrences to be a pattern
  }

  /**
   * Graph Node representation
   */
  static createServiceNode(serviceId, name, criticality = "medium") {
    return {
      id: serviceId,
      name,
      criticality, // low, medium, high, critical
      dependencies: [], // [{ targetId, type: 'sync'|'async', latency }]
      signals: [], // [{ type, severity, frequency }]
      failureHistory: [],
      lastSeen: new Date(),
    };
  }

  /**
   * Add or update a service in the graph
   */
  addService(serviceId, name, criticality = "medium") {
    if (!this.serviceGraph.has(serviceId)) {
      this.serviceGraph.set(
        serviceId,
        IncidentCorrelationEngine.createServiceNode(serviceId, name, criticality)
      );
    }
    return this.serviceGraph.get(serviceId);
  }

  /**
   * Add a dependency edge between services
   */
  addDependency(fromServiceId, toServiceId, type = "sync", latencyMs = 0) {
    const fromService = this.addService(fromServiceId, fromServiceId);
    const toService = this.addService(toServiceId, toServiceId);

    // Check if dependency already exists
    const existing = fromService.dependencies.find((d) => d.targetId === toServiceId);
    if (!existing) {
      fromService.dependencies.push({
        targetId: toServiceId,
        type,
        latency: latencyMs,
        failureCount: 0,
      });
    }
  }

  /**
   * Record a signal occurrence and track correlations
   */
  recordSignal(tenantId, signal, serviceId, context = {}) {
    const signalKey = `${signal.type}:${signal.severity}`;
    
    // Add service if not exists
    this.addService(serviceId, serviceId);
    const service = this.serviceGraph.get(serviceId);

    // Add signal to service
    const existingSignal = service.signals.find((s) => s.type === signal.type);
    if (existingSignal) {
      existingSignal.frequency++;
      existingSignal.lastSeen = new Date();
    } else {
      service.signals.push({
        type: signal.type,
        severity: signal.severity,
        frequency: 1,
        lastSeen: new Date(),
        context,
      });
    }

    // Track in failure history
    service.failureHistory.push({
      timestamp: new Date(),
      signal: signal.type,
      severity: signal.severity,
      context,
    });
  }

  /**
   * Record multi-signal incident
   * Call this when multiple signals detected in same timeframe
   */
  recordMultiSignalIncident(tenantId, signals, affectedServices, context = {}) {
    // Record each signal
    signals.forEach((signal) => {
      if (signal.serviceId) {
        this.recordSignal(tenantId, signal, signal.serviceId, context);
      }
    });

    // Update signal correlations
    this._updateSignalCorrelations(signals);

    // Detect patterns
    this._detectPatterns(signals, affectedServices);

    return {
      incidentId: `corr-${Date.now()}`,
      signals: signals.length,
      affectedServices: affectedServices.length,
      patternsDetected: this.discoveredPatterns.length,
    };
  }

  /**
   * Update co-occurrence rates in signal correlation matrix
   */
  _updateSignalCorrelations(signals) {
    for (let i = 0; i < signals.length; i++) {
      for (let j = i + 1; j < signals.length; j++) {
        const signalA = signals[i].type;
        const signalB = signals[j].type;
        const key = [signalA, signalB].sort().join("|");

        const current = this.signalCorrelation.get(key) || { count: 0, total: 0 };
        current.count++;
        current.total++;
        this.signalCorrelation.set(key, current);
      }
    }
  }

  /**
   * Detect repeating patterns in signal combinations
   */
  _detectPatterns(signals, affectedServices) {
    const patternKey = signals
      .map((s) => s.type)
      .sort()
      .join("+");

    const existing = this.discoveredPatterns.find((p) => p.key === patternKey);

    if (existing) {
      existing.frequency++;
      existing.lastSeen = new Date();
      existing.affectedServices = Array.from(
        new Set([...existing.affectedServices, ...affectedServices])
      );
    } else {
      this.discoveredPatterns.push({
        key: patternKey,
        signals: signals.map((s) => s.type),
        frequency: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        affectedServices: affectedServices,
        confidence: this._calculatePatternConfidence(signals),
      });
    }
  }

  /**
   * Calculate confidence of a pattern based on signal strengths
   */
  _calculatePatternConfidence(signals) {
    const severityWeights = {
      CRITICAL: 1.0,
      HIGH: 0.85,
      MEDIUM: 0.6,
      LOW: 0.3,
    };

    const avgSeverity =
      signals.reduce((sum, s) => sum + (severityWeights[s.severity] || 0.5), 0) / signals.length;

    return Math.min(1, avgSeverity * (signals.length / 5)); // More signals = higher confidence
  }

  /**
   * Find root cause candidates
   * Analysis: which service failure could trigger the cascade?
   */
  findRootCauseCandidates(affectedServices) {
    const candidates = [];

    affectedServices.forEach((serviceId) => {
      const service = this.serviceGraph.get(serviceId);
      if (!service) return;

      // Heuristic 1: Service with most failures
      const failureScore = service.failureHistory.length;

      // Heuristic 2: Service that has dependencies on other affected services
      const affectsOthers = service.dependencies.filter((d) =>
        affectedServices.includes(d.targetId)
      ).length;

      // Heuristic 3: Service criticality (more critical = more likely root cause)
      const criticalityScore = {
        critical: 1.0,
        high: 0.8,
        medium: 0.5,
        low: 0.2,
      }[service.criticality] || 0.5;

      // Combined score
      const score =
        failureScore * 0.4 + affectsOthers * 0.4 + criticalityScore * 100 * 0.2;

      candidates.push({
        serviceId,
        serviceName: service.name,
        failureFrequency: failureScore,
        affectsOtherServices: affectsOthers,
        criticality: service.criticality,
        score: score.toFixed(2),
        confidence: this._getRootCauseConfidence(service),
      });
    });

    return candidates.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
  }

  /**
   * Calculate confidence in root cause identification
   */
  _getRootCauseConfidence(service) {
    if (!service.failureHistory.length) {
      return 0;
    }

    // If same signal repeats frequently from this service, high confidence
    const recentFailures = service.failureHistory.slice(-10);
    const uniqueSignals = new Set(recentFailures.map((f) => f.signal)).size;
    const repetitionScore = 1 - uniqueSignals / recentFailures.length;

    return Math.min(1, repetitionScore * 0.8 + 0.2); // Minimum 20%
  }

  /**
   * Predict cascade impact
   * If this service fails, what else will fail?
   */
  predictCascadeImpact(serviceId) {
    const visited = new Set();
    const impact = [];

    const dfs = (currentId, depth = 0) => {
      if (visited.has(currentId) || depth > 5) {
        return; // Prevent infinite loops and deep traversals
      }

      visited.add(currentId);
      const currentService = this.serviceGraph.get(currentId);

      if (!currentService) {
        return;
      }

      // Find services dependent on current
      for (const [serviceId, service] of this.serviceGraph.entries()) {
        const dependency = service.dependencies.find(
          (d) => d.targetId === currentId
        );

        if (dependency) {
          impact.push({
            affectedServiceId: serviceId,
            affectedServiceName: service.name,
            depthFromRoot: depth + 1,
            dependencyType: dependency.type,
            estimatedLatency: dependency.latency,
            criticality: service.criticality,
          });

          dfs(serviceId, depth + 1);
        }
      }
    };

    dfs(serviceId);

    return {
      rootService: serviceId,
      potentiallyAffected: impact.length,
      affectedServices: impact.sort((a, b) => a.depthFromRoot - b.depthFromRoot),
      cascadeDepth: Math.max(...impact.map((a) => a.depthFromRoot), 0),
    };
  }

  /**
   * Get discovered patterns for analysis
   */
  getDiscoveredPatterns(minFrequency = this.minPatternFrequency) {
    return this.discoveredPatterns
      .filter((p) => p.frequency >= minFrequency)
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Get signal correlation matrix
   */
  getSignalCorrelations(minCorrelation = this.correlationThreshold) {
    const correlations = [];

    for (const [pair, data] of this.signalCorrelation.entries()) {
      const correlationScore = data.total > 0 ? data.count / data.total : 0;

      if (correlationScore >= minCorrelation) {
        const [signalA, signalB] = pair.split("|");
        correlations.push({
          signals: [signalA, signalB],
          coOccurrenceRate: correlationScore.toFixed(3),
          times: data.count,
        });
      }
    }

    return correlations.sort((a, b) => parseFloat(b.coOccurrenceRate) - parseFloat(a.coOccurrenceRate));
  }

  /**
   * Get the full service dependency graph
   */
  getServiceGraph() {
    const nodes = Array.from(this.serviceGraph.values()).map((service) => ({
      id: service.id,
      name: service.name,
      criticality: service.criticality,
      signalCount: service.signals.length,
      failureCount: service.failureHistory.length,
    }));

    const edges = [];
    for (const [serviceId, service] of this.serviceGraph.entries()) {
      service.dependencies.forEach((dep) => {
        edges.push({
          source: serviceId,
          target: dep.targetId,
          type: dep.type,
          latency: dep.latency,
        });
      });
    }

    return {
      nodes,
      edges,
      serviceCount: nodes.length,
      dependencyCount: edges.length,
    };
  }

  /**
   * Get correlation metrics for monitoring
   */
  getMetrics() {
    return {
      servicesTracked: this.serviceGraph.size,
      patternsDiscovered: this.discoveredPatterns.length,
      highConfidencePatterns: this.discoveredPatterns.filter(
        (p) => p.confidence >= 0.7
      ).length,
      signalCorrelationPairs: this.signalCorrelation.size,
      totalIncidentsRecorded: Array.from(this.serviceGraph.values()).reduce(
        (sum, s) => sum + s.failureHistory.length,
        0
      ),
    };
  }

  /**
   * Reset engine for testing
   */
  reset() {
    this.serviceGraph.clear();
    this.signalCorrelation.clear();
    this.discoveredPatterns = [];
  }
}

module.exports = IncidentCorrelationEngine;
