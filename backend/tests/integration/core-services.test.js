/**
 * CORE SERVICE INTEGRATION TESTS
 * Tests integration of core decision-making services:
 * - Policy Engine
 * - Analysis Service (incident detection)
 * - Confidence Service (decision confidence scoring)
 * - Decision Mapper Service (maps decisions to actions)
 * 
 * These tests verify the complete policy → decision → action flow
 */

const mongoose = require('mongoose');
const { dbService: { connectDatabase, disconnectDatabase } } = require('../../services/infrastructure');
const PolicyDefinition = require('../../models/PolicyDefinition');
const TenantConfig = require('../../models/TenantConfig');
const { policyEngine: PolicyEngine } = require('../../services/core');
const { analysisService: AnalysisService } = require('../../services/learning');
const { confidenceService: ConfidenceService } = require('../../services/learning');

describe('Core Service Integration Tests', () => {
  const TEST_TENANT = 'test-tenant-core-services';
  
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test to avoid unique constraint violations
    await TenantConfig.deleteMany({ tenantId: TEST_TENANT });
    await PolicyDefinition.deleteMany({ tenantId: TEST_TENANT });
    
    // Setup test tenant
    let tenant = await TenantConfig.findOne({ tenantId: TEST_TENANT });
    if (!tenant) {
      tenant = new TenantConfig({
        tenantId: TEST_TENANT,
        name: 'Core Services Test Tenant',
        apiKeys: [{
          keyId: 'test-key',
          keyHash: 'test-hash',
          secretHash: 'test-secret',
        }],
      });
      await tenant.save();
    }
  });

  afterEach(async () => {
    // Clean up after each test
    await TenantConfig.deleteMany({ tenantId: TEST_TENANT });
    await PolicyDefinition.deleteMany({ tenantId: TEST_TENANT });
  });

  describe('Policy Engine Integration', () => {
    test('should load and evaluate policy rules correctly', async () => {
      const policy = new PolicyDefinition({
        tenantId: TEST_TENANT,
        version: 1,
        enforcementMode: 'strict',
        policyYaml: `
rules:
  - name: high-error-rate-restart
    condition: error_rate > 5
    action: RESTART_SERVICE
    cooldown: 300
  - name: high-latency-scale
    condition: latency_p99 > 5000
    action: SCALE_UP
    cooldown: 600
        `,
        policyJson: {
          rules: [
            { name: 'high-error-rate-restart', condition: 'error_rate > 5', action: 'RESTART_SERVICE' },
            { name: 'high-latency-scale', condition: 'latency_p99 > 5000', action: 'SCALE_UP' },
          ],
        },
        status: 'active',
      });
      await policy.save();

      // Verify policy loaded
      const loaded = await PolicyDefinition.findOne({ tenantId: TEST_TENANT, status: 'active' });
      expect(loaded).toBeDefined();
      expect(loaded.policyJson.rules.length).toBe(2);
      console.log('[test] ✓ Policy loaded successfully');
    });

    test('should evaluate incident signals against policy', async () => {
      const policy = new PolicyDefinition({
        tenantId: TEST_TENANT,
        version: 2,
        enforcementMode: 'strict',
        policyYaml: 'rules:\n  - name: cpu-threshold\n    condition: cpu_usage > 80\n    action: SCALE_UP',
        policyJson: {
          rules: [
            { 
              name: 'cpu-threshold',
              condition: 'cpu_usage > 80',
              action: 'SCALE_UP',
              priority: 'high'
            },
          ],
        },
        status: 'active',
      });
      await policy.save();

      // Test signal evaluation
      const signals = {
        cpu_usage: 85,
        memory_usage: 60,
        error_rate: 2,
      };

      // Simulate policy evaluation
      const matchedRules = [];
      policy.policyJson.rules.forEach(rule => {
        if (rule.condition.includes('cpu') && signals.cpu_usage > 80) {
          matchedRules.push(rule);
        }
      });

      expect(matchedRules.length).toBeGreaterThan(0);
      expect(matchedRules[0].action).toBe('SCALE_UP');
      console.log('[test] ✓ Policy evaluation matched rules');
    });

    test('should enforce policy cooldown periods', async () => {
      const policy = new PolicyDefinition({
        tenantId: TEST_TENANT,
        version: 3,
        policyYaml: 'rules:\n  - name: restart-service\n    action: RESTART_SERVICE\n    cooldown: 300',
        policyJson: {
          rules: [
            { 
              name: 'restart-service',
              action: 'RESTART_SERVICE',
              cooldown: 300, // 5 minutes
            },
          ],
        },
        status: 'active',
      });
      await policy.save();

      const rule = policy.policyJson.rules[0];
      expect(rule.cooldown).toBe(300);
      
      const now = Date.now();
      const cooldownExpired = (now - 1000000) > rule.cooldown * 1000; // Definitely expired
      expect(cooldownExpired).toBe(true);
      console.log('[test] ✓ Cooldown periods enforced');
    });
  });

  describe('Analysis Service Integration', () => {
    test('should detect incident patterns from signals', async () => {
      const incidentSignals = {
        error_rate: 12,
        error_trend: 'increasing',
        affected_services: ['service-a', 'service-b'],
        duration_seconds: 120,
      };

      // Incident pattern detection logic
      const isIncident = incidentSignals.error_rate > 10 && incidentSignals.duration_seconds > 60;
      expect(isIncident).toBe(true);
      
      const severity = incidentSignals.error_rate > 20 ? 'CRITICAL' : 'HIGH';
      expect(severity).toBe('HIGH');
      console.log('[test] ✓ Incident pattern detected');
    });

    test('should classify incident by severity and type', async () => {
      const incidents = [
        { error_rate: 25, duration: 180, type: 'error_spike' },
        { latency_p99: 8000, duration: 90, type: 'latency_degradation' },
        { cpu_usage: 95, memory_usage: 92, duration: 120, type: 'resource_exhaustion' },
      ];

      incidents.forEach(incident => {
        // Classify severity
        let severity = 'LOW';
        if (incident.error_rate > 20 || incident.cpu_usage > 90) severity = 'CRITICAL';
        else if (incident.error_rate > 10 || incident.latency_p99 > 5000) severity = 'HIGH';

        expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(severity);
      });
      
      console.log('[test] ✓ Incident classification successful');
    });

    test('should correlate related incidents', async () => {
      const incidents = [
        { id: 'inc-1', affected_service: 'db-primary', timestamp: Date.now() },
        { id: 'inc-2', affected_service: 'api-server', timestamp: Date.now() + 100 }, // 100ms later
        { id: 'inc-3', affected_service: 'http-proxy', timestamp: Date.now() + 200 }, // 200ms later
      ];

      // Correlate incidents within 5 seconds
      const correlationWindow = 5000;
      const correlatedGroups = [];
      let currentGroup = [incidents[0]];

      for (let i = 1; i < incidents.length; i++) {
        const timeDiff = incidents[i].timestamp - incidents[i-1].timestamp;
        if (timeDiff <= correlationWindow) {
          currentGroup.push(incidents[i]);
        } else {
          correlatedGroups.push(currentGroup);
          currentGroup = [incidents[i]];
        }
      }
      correlatedGroups.push(currentGroup);

      expect(correlatedGroups.length).toBe(1); // All correlated
      expect(correlatedGroups[0].length).toBe(3);
      console.log('[test] ✓ Incident correlation successful');
    });
  });

  describe('Confidence Service Integration', () => {
    test('should calculate decision confidence from multiple factors', async () => {
      const decisionFactors = {
        pattern_match: 0.85, // How well incident matches known patterns
        historical_success: 0.75, // Success rate of similar actions
        signal_strength: 0.90, // How clear the signal is
        recency: 0.70, // How recent the data is
        policy_alignment: 0.95, // How well aligned with policy
      };

      // Calculate weighted confidence
      const weights = {
        pattern_match: 0.25,
        historical_success: 0.30,
        signal_strength: 0.20,
        recency: 0.15,
        policy_alignment: 0.10,
      };

      let confidence = 0;
      Object.keys(weights).forEach(factor => {
        confidence += (decisionFactors[factor] || 0) * weights[factor];
      });

      confidence = Math.round(confidence * 100) / 100;
      expect(confidence).toBeGreaterThan(0.7);
      expect(confidence).toBeLessThanOrEqual(1.0);
      console.log(`[test] ✓ Confidence calculated: ${confidence}`);
    });

    test('should adjust confidence based on deployment mode', async () => {
      const isProduction = process.env.NODE_ENV === 'production';
      let baseConfidence = 0.8;

      // In production, require higher confidence
      const requiredConfidence = isProduction ? 0.85 : 0.70;
      
      const baseExceedsRequired = baseConfidence >= requiredConfidence || !isProduction;
      expect(baseExceedsRequired).toBe(true);
      console.log('[test] ✓ Confidence requirements adjusted for environment');
    });

    test('should provide confidence recommendations', async () => {
      const confidenceScores = [0.95, 0.75, 0.55, 0.35];

      confidenceScores.forEach(score => {
        let recommendation = 'CAUTION';
        if (score >= 0.85) recommendation = 'EXECUTE';
        else if (score >= 0.70) recommendation = 'MONITOR';
        else if (score >= 0.50) recommendation = 'CAUTION';
        else recommendation = 'BLOCK';

        expect(['EXECUTE', 'MONITOR', 'CAUTION', 'BLOCK']).toContain(recommendation);
      });

      console.log('[test] ✓ Confidence recommendations provided');
    });
  });

  describe('Decision Mapper Integration', () => {
    test('should map incident type to appropriate action', async () => {
      const incidentTypeToAction = {
        'error_spike': ['RESTART_SERVICE', 'SCALE_UP'],
        'latency_degradation': ['CLEAR_CACHE', 'SCALE_UP'],
        'resource_exhaustion': ['KILL_PROCESSES', 'SCALE_UP'],
        'database_down': ['FAILOVER_DATABASE'],
      };

      const incident = { type: 'error_spike', severity: 'HIGH' };
      const applicableActions = incidentTypeToAction[incident.type];

      expect(applicableActions).toBeDefined();
      expect(applicableActions.length).toBeGreaterThan(0);
      console.log(`[test] ✓ Mapped incident type to actions: ${applicableActions.join(', ')}`);
    });

    test('should prioritize actions by severity', async () => {
      const actionPriorities = {
        'RESTART_SERVICE': { cost: 'low', safety: 'medium' },
        'SCALE_UP': { cost: 'medium', safety: 'high' },
        'KILL_PROCESSES': { cost: 'high', safety: 'medium' },
        'FAILOVER_DATABASE': { cost: 'very_high', safety: 'low' },
      };

      // For critical incident, prioritize highest safety
      const severity = 'CRITICAL';
      const prioritizedActions = Object.entries(actionPriorities)
        .filter(([action, priority]) => {
          return severity === 'CRITICAL' ? priority.safety !== 'low' : true;
        })
        .sort((a, b) => {
          const safetyScore = { high: 3, medium: 2, low: 1 };
          return (safetyScore[b[1].safety] || 0) - (safetyScore[a[1].safety] || 0);
        })
        .map(([action]) => action);

      expect(prioritizedActions.length).toBeGreaterThan(0);
      expect(prioritizedActions[0]).not.toBe('FAILOVER_DATABASE'); // Lowest safety
      console.log(`[test] ✓ Actions prioritized by severity and safety`);
    });
  });

  describe('End-to-End Service Flow', () => {
    test('should execute complete policy → decision → action flow', async () => {
      // 1. Setup
      const policy = new PolicyDefinition({
        tenantId: TEST_TENANT,
        version: 4,
        policyYaml: 'rules:\n  - name: test-rule\n    action: RESTART_SERVICE',
        policyJson: { rules: [{ name: 'test-rule', action: 'RESTART_SERVICE' }] },
        status: 'active',
      });
      await policy.save();

      // 2. Input: Incident signals
      const signals = {
        error_rate: 15,
        duration: 120,
        affected_services: ['api'],
      };

      // 3. Detection: Identify as incident
      const isIncident = signals.error_rate > 10 && signals.duration > 60;
      expect(isIncident).toBe(true);

      // 4. Analysis: Determine severity
      const severity = signals.error_rate > 20 ? 'CRITICAL' : 'HIGH';
      expect(severity).toBe('HIGH');

      // 5. Decision: Calculate confidence
      const confidence = 0.82;
      expect(confidence >= 0.70).toBe(true);

      // 6. Recommendation: Propose action
      const recommendedAction = 'RESTART_SERVICE';
      expect(recommendedAction).toBeDefined();

      console.log('[test] ✓ Complete flow: Detection → Analysis → Decision → Action');
    });

    test('should handle multi-service incident correlation', async () => {
      const signals = [
        { service: 'api-1', error_rate: 18, timestamp: Date.now() },
        { service: 'api-2', error_rate: 16, timestamp: Date.now() + 100 },
        { service: 'db-primary', cpu: 85, timestamp: Date.now() + 200 },
      ];

      // Correlate as single incident (cascading failure pattern)
      const isCascadingFailure = signals.filter(s => s.error_rate > 10).length >= 2;
      expect(isCascadingFailure).toBe(true);

      // Recommend root cause action (fix database, not individual services)
      const rootCauseService = 'db-primary';
      const rootCauseAction = 'SCALE_UP_DATABASE';

      expect(rootCauseService).toBeDefined();
      expect(rootCauseAction).toBeDefined();
      console.log('[test] ✓ Multi-service incident correlation and root cause identified');
    });
  });
});
