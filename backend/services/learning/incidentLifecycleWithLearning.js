/**
 * INCIDENT LIFECYCLE WITH LEARNING
 * 
 * The complete incident loop:
 * 1. Incident detected
 * 2. Decision made
 * 3. Action executed
 * 4. Recovery monitored
 * 5. Outcome recorded [NEW]
 * 6. Learning updates confidence [NEW]
 * 7. System makes better decisions next time [NEW]
 */

const EventEmitter = require('events');

class IncidentLifecycleWithLearning {
  constructor(decisionService, actionService, learningService) {
    this.decision = decisionService;
    this.action = actionService;
    this.learning = learningService;
    this.incidents = new Map(); // Track in-flight incidents

    this.emitter = new EventEmitter();
  }

  /**
   * Register an incident and execution decision
   */
  registerIncident(tenantId, incident, decision) {
    const key = `${tenantId}:${incident.id}`;

    this.incidents.set(key, {
      incident,
      decision,
      executedAt: new Date(),
      status: 'in-progress',
      recoveryStartTime: null,
      recoveryEndTime: null,
      actionsTaken: [],
      sideEffects: [],
    });

    console.log(`[lifecycle] ✓ Registered incident ${incident.id.substring(0, 8)}`);
    this.emitter.emit('incident:registered', { tenantId, incident });
  }

  /**
   * Record action execution
   */
  recordActionExecution(tenantId, incidentId, action) {
    const key = `${tenantId}:${incidentId}`;
    const tracking = this.incidents.get(key);

    if (!tracking) {
      console.warn(`[lifecycle] No incident tracking for ${incidentId}`);
      return;
    }

    tracking.actionsTaken.push({
      action,
      executedAt: new Date(),
      status: 'executing',
    });

    this.emitter.emit('action:executed', { tenantId, incidentId, action });
  }

  /**
   * "Incident is recovering" - service returning to healthy state
   */
  recordRecoveryStart(tenantId, incidentId, metrics) {
    const key = `${tenantId}:${incidentId}`;
    const tracking = this.incidents.get(key);

    if (!tracking) return;

    tracking.recoveryStartTime = new Date();
    console.log(`[lifecycle] 📈 Recovery started for ${incidentId.substring(0, 8)}`);
    this.emitter.emit('recovery:started', { tenantId, incidentId, metrics });
  }

  /**
   * "Incident is fully resolved" - service healthy, metrics normal
   */
  async recordIncidentResolved(tenantId, incidentId, metrics) {
    const key = `${tenantId}:${incidentId}`;
    const tracking = this.incidents.get(key);

    if (!tracking) {
      console.warn(`[lifecycle] No tracking for incident ${incidentId}`);
      return;
    }

    tracking.recoveryEndTime = new Date();
    tracking.status = 'resolved';

    // Allow passing recoveryTimeMs in metrics for testing/simulation
    let recoveryTimeMs = tracking.recoveryEndTime - tracking.recoveryStartTime;
    if (metrics && metrics.recoveryTimeMs !== undefined) {
      recoveryTimeMs = metrics.recoveryTimeMs;
    }

    console.log(
      `[lifecycle] ✅ Incident ${incidentId.substring(0, 8)} resolved in ${recoveryTimeMs}ms`
    );

    // LEARNING: Record this success
    try {
      const outcome = {
        resolved: true,
        recoveryTimeMs,
        hasSideEffects: tracking.sideEffects.length > 0,
        cost: this._estimateCost(tracking),
        metrics,
      };

      await this.learning.recordIncidentOutcome(
        tenantId,
        incidentId,
        tracking.decision.id,
        outcome
      );

      console.log(`[lifecycle] 📚 Learning recorded for incident ${incidentId.substring(0, 8)}`);
    } catch (error) {
      console.error('[lifecycle] Failed to record learning:', error.message);
    }

    // CLEANUP: Remove from tracking
    this.incidents.delete(key);

    this.emitter.emit('incident:resolved', {
      tenantId,
      incidentId,
      recoveryTimeMs,
      actionsTaken: tracking.actionsTaken.length,
    });
  }

  /**
   * "Incident could not be resolved" - decision/action failed
   */
  async recordIncidentFailed(tenantId, incidentId, reason) {
    const key = `${tenantId}:${incidentId}`;
    const tracking = this.incidents.get(key);

    if (!tracking) {
      console.warn(`[lifecycle] No tracking for incident ${incidentId}`);
      return;
    }

    tracking.status = 'failed';
    console.log(`[lifecycle] ❌ Incident ${incidentId.substring(0, 8)} resolution failed: ${reason}`);

    // LEARNING: Record this failure
    try {
      const outcome = {
        resolved: false,
        recoveryTimeMs: 0,
        hasSideEffects: tracking.sideEffects.length > 0,
        cost: this._estimateCost(tracking),
        failureReason: reason,
      };

      await this.learning.recordIncidentOutcome(
        tenantId,
        incidentId,
        tracking.decision.id,
        outcome
      );

      console.log(`[lifecycle] 📚 Learning recorded for incident ${incidentId.substring(0, 8)} (failure)`);
    } catch (error) {
      console.error('[lifecycle] Failed to record learning:', error.message);
    }

    // CLEANUP
    this.incidents.delete(key);

    this.emitter.emit('incident:failed', {
      tenantId,
      incidentId,
      reason,
      actionsTaken: tracking.actionsTaken.length,
    });
  }

  /**
   * Record side effects from action
   */
  recordSideEffect(tenantId, incidentId, effect) {
    const key = `${tenantId}:${incidentId}`;
    const tracking = this.incidents.get(key);

    if (!tracking) return;

    tracking.sideEffects.push({
      effect,
      recordedAt: new Date(),
    });

    console.warn(`[lifecycle] ⚠️  Side effect detected: ${effect}`);
    this.emitter.emit('side-effect:detected', { tenantId, incidentId, effect });
  }

  /**
   * Estimate cost of incident resolution
   * @private
   */
  _estimateCost(tracking) {
    let cost = 0;

    // Cost of recovery time (e.g., $0.01 per second lost)
    const recoveryTime = tracking.recoveryEndTime 
      ? tracking.recoveryEndTime - tracking.recoveryStartTime 
      : 0;
    cost += (recoveryTime / 1000) * 0.01;

    // Cost of actions taken
    tracking.actionsTaken.forEach(action => {
      const actionCosts = {
        restart: 0.5,
        retry: 0.0,
        scale: 5.0,
        isolate: 0.1,
        alert: 0.05,
      };
      cost += actionCosts[action.action] || 0.1;
    });

    return cost;
  }

  /**
   * Get tracking info for active incident
   */
  getIncidentTracking(tenantId, incidentId) {
    const key = `${tenantId}:${incidentId}`;
    const tracking = this.incidents.get(key);
    return tracking === undefined ? null : tracking;
  }

  /**
   * Get all active incidents
   */
  getActiveIncidents(tenantId) {
    const prefix = `${tenantId}:`;
    const active = [];

    for (const [key, value] of this.incidents.entries()) {
      if (key.startsWith(prefix)) {
        active.push(value);
      }
    }

    return active;
  }

  /**
   * Cleanup: Mark incident as failed if still in-progress after timeout
   */
  async cleanupStaleIncidents(tenantId, timeoutMs = 300000) {
    const prefix = `${tenantId}:`;
    const now = Date.now();
    const stale = [];

    for (const [key, value] of this.incidents.entries()) {
      if (key.startsWith(prefix) && value.status === 'in-progress') {
        const age = now - value.executedAt.getTime();
        if (age > timeoutMs) {
          stale.push({ key, value });
        }
      }
    }

    for (const { key, value } of stale) {
      const [tenantId, incidentId] = key.split(':');
      await this.recordIncidentFailed(
        tenantId,
        incidentId,
        `Timeout after ${timeoutMs}ms`
      );
    }

    if (stale.length > 0) {
      console.log(`[lifecycle] ⏱️  Cleaned up ${stale.length} stale incidents`);
    }

    return stale.length;
  }

  /**
   * Listen to lifecycle events
   */
  on(event, handler) {
    this.emitter.on(event, handler);
  }
}

module.exports = IncidentLifecycleWithLearning;
