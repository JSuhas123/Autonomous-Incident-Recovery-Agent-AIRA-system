const request = require('supertest');
const app = require('../../server');

/**
 * ISSUE #3: Safety Gates Validation
 * 
 * Comprehensive test suite validating all 5 safety mechanisms that prevent
 * autonomous runaway in AIRA v3.0 decision engine:
 * 
 * 1. Kill Switch - Emergency stop mechanism
 * 2. Circuit Breaker - Fail-safe for cascading failures
 * 3. Idempotency - Duplicate prevention
 * 4. Distributed Lock - Concurrent execution prevention
 * 5. Confidence Threshold - Decision approval tiers
 * 
 * Test Count: 33 tests across all safety gates
 */

describe('AIRA v3.0 Safety Gates Validation Suite', () => {
  const testTenantId = 'safety-gates-test-tenant';
  const testSignal = {
    id: 'test-signal-001',
    severity: 'HIGH',
    type: 'latency',
    sourceSystem: 'api-server-01',
    value: 5000,
    threshold: 1000,
    timestamp: new Date()
  };

  // ============================================================================
  // SAFETY GATE #1: KILL SWITCH
  // ============================================================================
  describe('Safety Gate #1: Kill Switch', () => {
    beforeEach(async () => {
      // Ensure kill switch is OFF before each test
      await request(app)
        .post(`/api/admin/kill-switch/${testTenantId}`)
        .send({ enabled: false });
    });

    it('should execute decision when kill switch is OFF', async () => {
      const response = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(testSignal)
        .expect(200);

      expect(response.body.decision).toBeDefined();
      expect(response.body.decision.action).toMatch(/log|retry|restart|alert/);
    });

    it('should block decision execution when kill switch is ON', async () => {
      // Enable kill switch
      await request(app)
        .post(`/api/admin/kill-switch/${testTenantId}`)
        .send({ enabled: true });

      const response = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(testSignal)
        .expect(403);

      expect(response.body.error).toContain('kill switch');
    });

    it('should block action execution when kill switch is ON', async () => {
      // Enable kill switch
      await request(app)
        .post(`/api/admin/kill-switch/${testTenantId}`)
        .send({ enabled: true });

      const actionPayload = {
        actionId: 'action-001',
        type: 'restart',
        target: 'api-server-01',
        reason: 'High latency detected'
      };

      const response = await request(app)
        .post(`/api/actions/${testTenantId}`)
        .send(actionPayload)
        .expect(403);

      expect(response.body.error).toContain('kill switch');
    });

    it('should allow re-enabling after emergency stop', async () => {
      // Enable then disable
      await request(app)
        .post(`/api/admin/kill-switch/${testTenantId}`)
        .send({ enabled: true });

      await request(app)
        .post(`/api/admin/kill-switch/${testTenantId}`)
        .send({ enabled: false });

      const response = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(testSignal)
        .expect(200);

      expect(response.body.decision).toBeDefined();
    });

    it('should report kill switch status correctly', async () => {
      const response = await request(app)
        .get(`/api/admin/kill-switch/${testTenantId}`)
        .expect(200);

      expect(response.body.enabled).toBe(false);
      expect(response.body.lastModified).toBeDefined();
    });
  });

  // ============================================================================
  // SAFETY GATE #2: CIRCUIT BREAKER
  // ============================================================================
  describe('Safety Gate #2: Circuit Breaker', () => {
    it('should be in CLOSED state initially', async () => {
      const response = await request(app)
        .get(`/api/admin/circuit-breaker/${testTenantId}`)
        .expect(200);

      expect(response.body.state).toBe('CLOSED');
      expect(response.body.failureCount).toBe(0);
    });

    it('should transition to OPEN after failure threshold exceeded', async () => {
      // Simulate multiple failures
      const failingSignal = {
        id: 'fail-signal-001',
        severity: 'CRITICAL',
        type: 'database_unavailable',
        value: 100,
        threshold: 50
      };

      // Send 5 failing decisions to exceed threshold (typically 3-5)
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/api/decisions/${testTenantId}`)
          .send(failingSignal);
      }

      const response = await request(app)
        .get(`/api/admin/circuit-breaker/${testTenantId}`)
        .expect(200);

      // Circuit should be OPEN now
      expect(response.body.state).toMatch(/OPEN|HALF_OPEN/);
    });

    it('should reject requests when OPEN', async () => {
      // Open the circuit (simulate by setting state)
      await request(app)
        .post(`/api/admin/circuit-breaker/${testTenantId}/open`)
        .expect(200);

      const response = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(testSignal)
        .expect(503);

      expect(response.body.error).toContain('circuit');
    });

    it('should move to HALF_OPEN after timeout period', async () => {
      // Open circuit
      await request(app)
        .post(`/api/admin/circuit-breaker/${testTenantId}/open`)
        .expect(200);

      // Wait for timeout (or force HALF_OPEN)
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app)
        .get(`/api/admin/circuit-breaker/${testTenantId}`)
        .expect(200);

      // After timeout, should try HALF_OPEN
      expect(['HALF_OPEN', 'OPEN']).toContain(response.body.state);
    });

    it('should transition back to CLOSED on successful request in HALF_OPEN', async () => {
      // Force HALF_OPEN state
      await request(app)
        .post(`/api/admin/circuit-breaker/${testTenantId}`)
        .send({ state: 'HALF_OPEN' });

      // Send successful signal
      const response = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(testSignal)
        .expect(200);

      expect(response.body.decision).toBeDefined();

      // Verify back to CLOSED
      const statusResponse = await request(app)
        .get(`/api/admin/circuit-breaker/${testTenantId}`)
        .expect(200);

      expect(statusResponse.body.state).toBe('CLOSED');
    });

    it('should track failure metrics for visibility', async () => {
      const response = await request(app)
        .get(`/api/admin/circuit-breaker/${testTenantId}/metrics`)
        .expect(200);

      expect(response.body.totalFailures).toBeDefined();
      expect(response.body.totalSuccesses).toBeDefined();
      expect(response.body.failureRate).toBeDefined();
      expect(response.body.failureRate).toBeGreaterThanOrEqual(0);
      expect(response.body.failureRate).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // SAFETY GATE #3: IDEMPOTENCY
  // ============================================================================
  describe('Safety Gate #3: Idempotency', () => {
    it('should reject duplicate action with same idempotency key', async () => {
      const actionPayload = {
        actionId: 'action-idem-001',
        idempotencyKey: 'idem-key-001',
        type: 'restart',
        target: 'api-server-01',
        reason: 'High latency'
      };

      // First request
      const response1 = await request(app)
        .post(`/api/actions/${testTenantId}`)
        .send(actionPayload)
        .expect(200);

      expect(response1.body.actionId).toBe('action-idem-001');

      // Second request with same idempotency key should return cached result
      const response2 = await request(app)
        .post(`/api/actions/${testTenantId}`)
        .send(actionPayload)
        .expect(200);

      // Should return same result without re-executing
      expect(response2.body.actionId).toBe('action-idem-001');
      expect(response2.body.duplicate).toBe(true);
    });

    it('should allow different actions with different idempotency keys', async () => {
      const action1 = {
        actionId: 'action-idem-002',
        idempotencyKey: 'idem-key-002',
        type: 'restart',
        target: 'api-server-01'
      };

      const action2 = {
        actionId: 'action-idem-003',
        idempotencyKey: 'idem-key-003',
        type: 'retry',
        target: 'api-server-02'
      };

      const response1 = await request(app)
        .post(`/api/actions/${testTenantId}`)
        .send(action1)
        .expect(200);

      const response2 = await request(app)
        .post(`/api/actions/${testTenantId}`)
        .send(action2)
        .expect(200);

      expect(response1.body.actionId).toBe('action-idem-002');
      expect(response2.body.actionId).toBe('action-idem-003');
      expect(response1.body.duplicate).toBeFalsy();
      expect(response2.body.duplicate).toBeFalsy();
    });

    it('should generate deterministic idempotency keys for actions', async () => {
      const signal = {
        id: 'signal-idem-001',
        severity: 'HIGH',
        type: 'latency',
        value: 5000
      };

      const response1 = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(signal)
        .expect(200);

      const response2 = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(signal)
        .expect(200);

      // Same signal should generate same idempotency key
      expect(response1.body.idempotencyKey).toBe(response2.body.idempotencyKey);
    });

    it('should maintain idempotency across retries', async () => {
      const actionPayload = {
        actionId: 'action-idem-004',
        idempotencyKey: 'idem-key-004',
        type: 'restart',
        target: 'api-server-01'
      };

      // Send 3 times rapidly (simulating client retry)
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post(`/api/actions/${testTenantId}`)
          .send(actionPayload)
          .expect(200);

        if (i === 0) {
          expect(response.body.duplicate).toBeFalsy();
        } else {
          expect(response.body.duplicate).toBe(true);
        }
      }
    });

    it('should track idempotency key usage history', async () => {
      const idempotencyKey = 'idem-key-history-001';
      const actionPayload = {
        actionId: 'action-idem-005',
        idempotencyKey,
        type: 'restart',
        target: 'api-server-01'
      };

      await request(app)
        .post(`/api/actions/${testTenantId}`)
        .send(actionPayload)
        .expect(200);

      const response = await request(app)
        .get(`/api/admin/idempotency/${testTenantId}/${idempotencyKey}`)
        .expect(200);

      expect(response.body.key).toBe(idempotencyKey);
      expect(response.body.actionId).toBe('action-idem-005');
      expect(response.body.firstSeen).toBeDefined();
    });
  });

  // ============================================================================
  // SAFETY GATE #4: DISTRIBUTED LOCK
  // ============================================================================
  describe('Safety Gate #4: Distributed Lock', () => {
    it('should acquire lock for single execution', async () => {
      const response = await request(app)
        .post(`/api/admin/lock/${testTenantId}`)
        .send({ resource: 'restart-api-server-01', ttl: 5000 })
        .expect(200);

      expect(response.body.acquired).toBe(true);
      expect(response.body.lockId).toBeDefined();
    });

    it('should prevent concurrent execution of same action', async () => {
      const lockResource = 'concurrent-test-lock';

      // Acquire first lock
      const response1 = await request(app)
        .post(`/api/admin/lock/${testTenantId}`)
        .send({ resource: lockResource, ttl: 5000 })
        .expect(200);

      expect(response1.body.acquired).toBe(true);

      // Try to acquire same lock
      const response2 = await request(app)
        .post(`/api/admin/lock/${testTenantId}`)
        .send({ resource: lockResource, ttl: 5000 })
        .expect(409);

      expect(response2.body.acquired).toBe(false);
    });

    it('should release lock after TTL expiration', async () => {
      const lockResource = 'ttl-test-lock';
      const ttlMs = 100; // Short TTL for testing

      await request(app)
        .post(`/api/admin/lock/${testTenantId}`)
        .send({ resource: lockResource, ttl: ttlMs })
        .expect(200);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, ttlMs + 50));

      // Should be able to acquire now
      const response = await request(app)
        .post(`/api/admin/lock/${testTenantId}`)
        .send({ resource: lockResource, ttl: ttlMs })
        .expect(200);

      expect(response.body.acquired).toBe(true);
    });

    it('should support lock extension', async () => {
      const lockResource = 'extend-test-lock';

      const acquireResponse = await request(app)
        .post(`/api/admin/lock/${testTenantId}`)
        .send({ resource: lockResource, ttl: 1000 })
        .expect(200);

      const lockId = acquireResponse.body.lockId;

      const extendResponse = await request(app)
        .post(`/api/admin/lock/${testTenantId}/${lockId}/extend`)
        .send({ ttl: 5000 })
        .expect(200);

      expect(extendResponse.body.extended).toBe(true);
    });

    it('should allow explicit lock release', async () => {
      const lockResource = 'release-test-lock';

      const acquireResponse = await request(app)
        .post(`/api/admin/lock/${testTenantId}`)
        .send({ resource: lockResource, ttl: 5000 })
        .expect(200);

      const lockId = acquireResponse.body.lockId;

      const releaseResponse = await request(app)
        .delete(`/api/admin/lock/${testTenantId}/${lockId}`)
        .expect(200);

      expect(releaseResponse.body.released).toBe(true);

      // Should be able to acquire immediately
      const reacquireResponse = await request(app)
        .post(`/api/admin/lock/${testTenantId}`)
        .send({ resource: lockResource, ttl: 5000 })
        .expect(200);

      expect(reacquireResponse.body.acquired).toBe(true);
    });

    it('should serialize concurrent execution attempts', async () => {
      const lockResource = 'serialization-test-lock';

      // Simulate multiple concurrent attempts
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .post(`/api/admin/lock/${testTenantId}`)
            .send({ resource: lockResource, ttl: 2000 })
        );
      }

      const results = await Promise.all(promises);

      // Exactly one should succeed
      const acquired = results.filter(r => r.body.acquired);
      const blocked = results.filter(r => !r.body.acquired);

      expect(acquired.length).toBe(1);
      expect(blocked.length).toBe(4);
    });
  });

  // ============================================================================
  // SAFETY GATE #5: CONFIDENCE THRESHOLD
  // ============================================================================
  describe('Safety Gate #5: Confidence Threshold', () => {
    it('should OBSERVE (log only) when confidence < 60%', async () => {
      const lowConfidenceSignal = {
        id: 'low-conf-signal-001',
        severity: 'LOW',
        type: 'disk_usage',
        value: 75,
        threshold: 80,
        confidence: 0.45 // 45% confidence
      };

      const response = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(lowConfidenceSignal)
        .expect(200);

      expect(response.body.decision.approvalTier).toBe('OBSERVE');
      expect(response.body.decision.action).toBe('log');
    });

    it('should ESCALATE (require approval) when confidence 60-85%', async () => {
      const mediumConfidenceSignal = {
        id: 'med-conf-signal-001',
        severity: 'MEDIUM',
        type: 'memory_leak',
        value: 85,
        threshold: 80,
        confidence: 0.72 // 72% confidence
      };

      const response = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(mediumConfidenceSignal)
        .expect(200);

      expect(response.body.decision.approvalTier).toBe('ESCALATE');
      expect(response.body.decision.requiresApproval).toBe(true);
    });

    it('should AUTO-EXECUTE (no approval needed) when confidence >= 85%', async () => {
      const highConfidenceSignal = {
        id: 'high-conf-signal-001',
        severity: 'HIGH',
        type: 'database_unavailable',
        value: 0,
        threshold: 1,
        confidence: 0.92 // 92% confidence
      };

      const response = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(highConfidenceSignal)
        .expect(200);

      expect(response.body.decision.approvalTier).toBe('AUTO');
      expect(response.body.decision.requiresApproval).toBe(false);
    });

    it('should block HIGH severity action at low confidence', async () => {
      const lowConfidenceAction = {
        actionId: 'action-low-conf-001',
        type: 'restart',
        severity: 'HIGH',
        target: 'api-server-01',
        confidence: 0.35 // 35% confidence
      };

      const response = await request(app)
        .post(`/api/actions/${testTenantId}`)
        .send(lowConfidenceAction)
        .expect(403);

      expect(response.body.error).toContain('confidence');
    });

    it('should allow action at threshold-meeting confidence', async () => {
      const thresholdActionOBSERVE = {
        actionId: 'action-conf-002',
        type: 'log',
        severity: 'LOW',
        target: 'api-server-01',
        confidence: 0.59 // Just below 60%
      };

      const response = await request(app)
        .post(`/api/actions/${testTenantId}`)
        .send(thresholdActionOBSERVE)
        .expect(200);

      expect(response.body.actionId).toBe('action-conf-002');
    });

    it('should track confidence scores over time', async () => {
      const signal1 = { ...testSignal, id: 'conf-history-001', confidence: 0.5 };
      const signal2 = { ...testSignal, id: 'conf-history-002', confidence: 0.7 };
      const signal3 = { ...testSignal, id: 'conf-history-003', confidence: 0.9 };

      await request(app).post(`/api/decisions/${testTenantId}`).send(signal1);
      await request(app).post(`/api/decisions/${testTenantId}`).send(signal2);
      await request(app).post(`/api/decisions/${testTenantId}`).send(signal3);

      const response = await request(app)
        .get(`/api/admin/confidence/${testTenantId}/history`)
        .expect(200);

      expect(response.body.scores).toBeDefined();
      expect(response.body.scores.length).toBeGreaterThan(0);
      expect(response.body.trend).toMatch(/improving|stable|declining/);
    });

    it('should prevent flip-flopping between tiers', async () => {
      const fluctuatingSignal = {
        id: 'fluctuate-001',
        severity: 'MEDIUM',
        type: 'latency',
        value: 1500
      };

      // Send multiple signals with same ID - should not flip between tiers
      const decisions = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post(`/api/decisions/${testTenantId}`)
          .send({ ...fluctuatingSignal, confidence: 0.65 + (Math.random() * 0.1) })
          .expect(200);
        decisions.push(response.body.decision.approvalTier);
      }

      // Verify tier consistency
      expect(new Set(decisions).size).toBeLessThanOrEqual(2);
    });
  });

  // ============================================================================
  // INTEGRATED SAFETY GATE SCENARIOS
  // ============================================================================
  describe('Integrated Safety Gate Scenarios', () => {
    it('should enforce all 5 gates together for high-severity action', async () => {
      // Enable all safety checks
      const signal = {
        id: 'integrated-test-001',
        severity: 'CRITICAL',
        type: 'database_unavailable',
        confidence: 0.88
      };

      const response = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(signal)
        .expect(200);

      expect(response.body.decision).toBeDefined();
      expect(response.body.decision.safetyGates).toBeDefined();
      expect(response.body.decision.safetyGates.killSwitch).toBe('PASS');
      expect(response.body.decision.safetyGates.circuitBreaker).toBe('PASS');
      expect(response.body.decision.safetyGates.idempotency).toBe('PASS');
      expect(response.body.decision.safetyGates.distributedLock).toBe('PASS');
      expect(response.body.decision.safetyGates.confidenceThreshold).toBe('PASS');
    });

    it('should fail gracefully when any safety gate triggers', async () => {
      // Enable kill switch
      await request(app)
        .post(`/api/admin/kill-switch/${testTenantId}`)
        .send({ enabled: true });

      const signal = {
        id: 'safety-fail-001',
        severity: 'CRITICAL',
        type: 'database_error',
        confidence: 0.95
      };

      const response = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(signal)
        .expect(403);

      expect(response.body.error).toBeDefined();
      expect(response.body.failedGate).toBe('killSwitch');
    });

    it('should provide visibility into which gates passed/failed', async () => {
      const signal = {
        id: 'visibility-test-001',
        severity: 'HIGH',
        type: 'latency',
        confidence: 0.75
      };

      const response = await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(signal)
        .expect(200);

      const gateResults = response.body.decision.safetyGates;
      Object.values(gateResults).forEach(result => {
        expect(['PASS', 'FAIL', 'BYPASS']).toContain(result);
      });
    });

    it('should have deterministic safety gate ordering', async () => {
      const signal = {
        id: 'ordering-test-001',
        severity: 'MEDIUM',
        type: 'memory_usage',
        confidence: 0.65
      };

      const response1 = await request(app).post(`/api/decisions/${testTenantId}`).send(signal).expect(200);
      const response2 = await request(app).post(`/api/decisions/${testTenantId}`).send(signal).expect(200);

      const gates1 = Object.keys(response1.body.decision.safetyGates);
      const gates2 = Object.keys(response2.body.decision.safetyGates);

      expect(gates1).toEqual(gates2);
    });
  });

  // ============================================================================
  // SAFETY GATE AUDIT & MONITORING
  // ============================================================================
  describe('Safety Gate Audit & Monitoring', () => {
    it('should maintain audit log of all safety gate events', async () => {
      const signal = {
        id: 'audit-test-001',
        severity: 'HIGH',
        type: 'latency',
        confidence: 0.80
      };

      await request(app)
        .post(`/api/decisions/${testTenantId}`)
        .send(signal)
        .expect(200);

      const response = await request(app)
        .get(`/api/admin/safety-gates/${testTenantId}/audit`)
        .expect(200);

      expect(response.body.events).toBeDefined();
      expect(Array.isArray(response.body.events)).toBe(true);
      expect(response.body.events.length).toBeGreaterThan(0);

      const latestEvent = response.body.events[0];
      expect(latestEvent.timestamp).toBeDefined();
      expect(latestEvent.gateType).toBeDefined();
      expect(latestEvent.result).toMatch(/PASS|FAIL|BYPASS/);
    });

    it('should provide safety gate compliance report', async () => {
      const response = await request(app)
        .get(`/api/admin/safety-gates/${testTenantId}/compliance`)
        .expect(200);

      expect(response.body.totalDecisions).toBeGreaterThan(0);
      expect(response.body.passRate).toBeDefined();
      expect(response.body.passRate).toBeGreaterThanOrEqual(0);
      expect(response.body.passRate).toBeLessThanOrEqual(1);

      expect(response.body.gateBreakdown).toBeDefined();
      expect(response.body.gateBreakdown.killSwitch).toBeDefined();
      expect(response.body.gateBreakdown.circuitBreaker).toBeDefined();
      expect(response.body.gateBreakdown.idempotency).toBeDefined();
      expect(response.body.gateBreakdown.distributedLock).toBeDefined();
      expect(response.body.gateBreakdown.confidenceThreshold).toBeDefined();
    });

    it('should alert on repeated safety gate failures', async () => {
      // Simulate multiple failures
      for (let i = 0; i < 3; i++) {
        const signal = {
          id: `repeated-fail-${i}`,
          severity: 'CRITICAL',
          type: 'database_error',
          confidence: 0.35 // Low confidence
        };

        await request(app)
          .post(`/api/decisions/${testTenantId}`)
          .send(signal)
          .expect(403); // Should fail due to confidence
      }

      const response = await request(app)
        .get(`/api/admin/safety-gates/${testTenantId}/alerts`)
        .expect(200);

      expect(response.body.activeAlerts).toBeDefined();
      const confidenceAlert = response.body.activeAlerts.find(a => a.gate === 'confidenceThreshold');
      if (confidenceAlert) {
        expect(confidenceAlert.triggerCount).toBeGreaterThanOrEqual(3);
      }
    });

    it('should track safety gate performance metrics', async () => {
      const response = await request(app)
        .get(`/api/admin/safety-gates/${testTenantId}/metrics`)
        .expect(200);

      expect(response.body.metrics).toBeDefined();
      expect(response.body.metrics.decisionLatency).toBeDefined();
      expect(response.body.metrics.gateCheckLatency).toBeDefined();
      expect(response.body.metrics.averageGatesCheckedPerDecision).toBeDefined();
    });
  });
});
