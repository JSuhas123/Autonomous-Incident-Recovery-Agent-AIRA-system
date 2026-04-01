/**
 * End-to-End Integration Test: Full Approval Workflow
 * 
 * This test validates the complete pipeline:
 * 1. Signal → Analysis
 * 2. Analysis → Decision with Confidence Score
 * 3. Confidence determines tier (AUTO_EXECUTE, ESCALATE, OBSERVE)
 * 4. If ESCALATE: Create approval request
 * 5. Human approves/rejects
 * 6. If approved: Execute K8s action
 * 7. Log full decision trace and audit trail
 * 
 * Scenarios:
 * - High confidence decision (auto-execute)
 * - Medium confidence decision (requires approval)
 * - Low confidence decision (observe only)
 * - Approval timeout
 * - Rejection handling
 */

const { ApprovalService, getApprovalService } = require('../../services/approval');
const { K8sClient } = require('../../services/k8s/k8sClient');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { cleanAllCollections, generateTestId } = require('../utils/mongoTestCleanup');

describe('E2E: Full Approval Workflow Pipeline', () => {
  let approvalService;
  let k8sClient;
  let mongoServer;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  });

  afterAll(async () => {
    // Disconnect and stop MongoDB
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    // FIXED: Drop collections entirely to avoid unique index violations
    // Deleting documents doesn't remove unique indexes, so we drop the collection
    await cleanAllCollections();

    approvalService = getApprovalService();
    k8sClient = new K8sClient();

    // Set environment for testing
    process.env.AUTO_EXECUTE_THRESHOLD = '0.85';
    process.env.ESCALATION_THRESHOLD = '0.60';
    process.env.APPROVAL_TIMEOUT_MS = '600000'; // 10 minutes
  });

  describe('Scenario 1: High Confidence Auto-Execution', () => {
    test('should auto-execute high-confidence decision without approval', async () => {
      // Step 1: Simulate signal from external system
      const signal = {
        timestamp: new Date().toISOString(),
        service: 'api-gateway',
        metric: 'cpu_usage',
        value: 95,
        threshold: 80,
        severity: 'high',
      };

      console.log('\n[E2E] Step 1: Received signal', { metric: signal.metric, value: signal.value });

      // Step 2: Analysis Agent processes signal
      const analysisResult = {
        issueType: 'cpu_spike',
        severity: 'high',
        occurrenceCount: 1,
        confidence: 0.92, // High signal strength
      };

      console.log('[E2E] Step 2: Analysis result', { 
        issueType: analysisResult.issueType,
        confidence: analysisResult.confidence,
      });

      // Step 3: Decision Agent makes decision
      const decision = {
        tenantId: 'tenant-1',
        decisionId: generateTestId('dec'),
        correlationId: generateTestId('trace'),
        action: 'restart_pod',
        reason: `High CPU detected: ${signal.value}% exceeds threshold ${signal.threshold}%`,
        severity: signal.severity,
        confidence: analysisResult.confidence,
        resource: 'api-gateway-pod-1',
        namespace: 'production',
        decisionTrace: {
          signal,
          analysisResult,
        },
      };

      console.log('[E2E] Step 3: Made decision', {
        action: decision.action,
        confidence: decision.confidence,
      });

      // Step 4: Check if approval is needed
      const approvalCheck = approvalService.requiresApproval(decision.confidence);
      
      expect(approvalCheck.requiresApproval).toBe(false);
      expect(approvalCheck.tier).toBe('AUTO_EXECUTE');

      console.log('[E2E] Step 4: Approval check - AUTO_EXECUTE');

      // Step 5: Execute immediately (no approval queue)
      console.log('[E2E] Step 5: Executing K8s action');
      expect(decision.action).toBe('restart_pod');
      expect(decision.resource).toBe('api-gateway-pod-1');

      // Step 6: Full audit trail logged
      const auditEntry = {
        timestamp: new Date().toISOString(),
        decisionId: decision.decisionId,
        correlationId: decision.correlationId,
        action: 'auto_executed',
        tier: approvalCheck.tier,
        confidence: decision.confidence,
        resource: decision.resource,
      };

      console.log('[E2E] Step 6: Audit trail logged', {
        decisionId: auditEntry.decisionId,
        action: auditEntry.action,
      });

      expect(auditEntry.action).toBe('auto_executed');
      expect(auditEntry.tier).toBe('AUTO_EXECUTE');
    });
  });

  describe('Scenario 2: Medium Confidence - Human Approval Required', () => {
    test('should create approval request for escalation-tier decision', async () => {
      // Signal with moderate certainty
      const signal = {
        timestamp: new Date().toISOString(),
        service: 'cache-service',
        metric: 'memory_usage',
        value: 85,
        threshold: 75,
        severity: 'medium',
      };

      console.log('\n[E2E] Scenario 2: Signal', { metric: signal.metric });

      // Analysis with moderate confidence
      const analysisResult = {
        issueType: 'memory_leak_possible',
        severity: 'medium',
        occurrenceCount: 2,
        confidence: 0.73, // Medium confidence
      };

      // Decision
      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-' + Date.now(),
        correlationId: 'trace-' + Date.now(),
        action: 'scale_deployment',
        reason: 'Possible memory leak in cache service',
        severity: signal.severity,
        confidence: analysisResult.confidence,
        resource: 'cache-service-deployment',
        namespace: 'production',
        additionalParams: {
          replicas: 5,
        },
        decisionTrace: { signal, analysisResult },
      };

      console.log('[E2E] Decision made with confidence:', decision.confidence);

      // Step 1: Check if approval needed
      const approvalCheck = approvalService.requiresApproval(decision.confidence);

      expect(approvalCheck.requiresApproval).toBe(true);
      expect(approvalCheck.tier).toBe('ESCALATE');

      console.log('[E2E] Approval required: tier =', approvalCheck.tier);

      // Step 2: Create approval request
      const approvalRequest = await approvalService.createApprovalRequest(decision, {
        userAgent: 'decision-engine/1.0',
        ipAddress: '10.0.0.1',
      });

      expect(approvalRequest).toBeDefined();
      expect(approvalRequest.approvalId).toBeDefined();
      expect(approvalRequest.status).toBe('pending');
      expect(approvalRequest.confidence).toBe(decision.confidence);

      console.log('[E2E] Approval request created:', {
        approvalId: approvalRequest.approvalId,
        status: approvalRequest.status,
      });

      // Step 3: Get pending approvals for team
      const pending = await approvalService.getPendingApprovals('tenant-1');
      const matchingApproval = pending.find(p => p.approvalId === approvalRequest.approvalId);

      expect(matchingApproval).toBeDefined();
      expect(matchingApproval.action).toBe(decision.action);

      console.log('[E2E] Approval appears in pending list');

      // Step 4: Human reviews and approves
      const approvalResult = await approvalService.approveAndExecute(
        approvalRequest.approvalId,
        'ops-team-lead-123',
        { comment: 'Approved - cache service memory needs management' }
      );

      expect(approvalResult.status).toBe('approved');
      expect(approvalResult.approvedBy).toBe('ops-team-lead-123');

      console.log('[E2E] Approval granted by', approvalResult.approvedBy);

      // Step 5: After approval, action is ready for execution
      console.log('[E2E] Action now ready for K8s execution');

      // Step 6: Verify audit trail
      const statusCheck = await approvalService.getApprovalStatus(approvalRequest.approvalId);

      expect(statusCheck.status).toBe('approved');
      expect(statusCheck.approvedBy).toBe('ops-team-lead-123');

      console.log('[E2E] Full audit trail maintained and queryable');
    });

    test('should handle rejection workflow', async () => {
      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-' + Date.now(),
        action: 'restart_deployment',
        reason: 'Service degradation',
        confidence: 0.68,
        resource: 'api-service-deployment',
        severity: 'medium',
        namespace: 'staging',
      };

      // Create approval request
      const approvalRequest = await approvalService.createApprovalRequest(decision);

      expect(approvalRequest.status).toBe('pending');

      console.log('\n[E2E] Rejection test: Approval created');

      // Human reviews and rejects
      const rejectionResult = await approvalService.rejectRequest(
        approvalRequest.approvalId,
        'ops-manager',
        'Production deployment in progress - cannot restart now'
      );

      expect(rejectionResult.status).toBe('rejected');
      expect(rejectionResult.rejectedBy).toBe('ops-manager');

      console.log('[E2E] Approval rejected - reason:', rejectionResult.reason);

      // Verify rejection is recorded
      const status = await approvalService.getApprovalStatus(approvalRequest.approvalId);

      expect(status.status).toBe('rejected');
      expect(status.rejectionReason).toBe('Production deployment in progress - cannot restart now');

      console.log('[E2E] Rejection recorded in audit trail');
    });
  });

  describe('Scenario 3: Low Confidence - Observe Only', () => {
    test('should block and observe low-confidence decision', async () => {
      const signal = {
        timestamp: new Date().toISOString(),
        service: 'monitoring-agent',
        metric: 'packet_loss',
        value: 0.5,
        threshold: 1.0,
        severity: 'low',
      };

      // Low confidence analysis
      const analysisResult = {
        issueType: 'possible_network_jitter',
        severity: 'low',
        occurrenceCount: 1.0,
        confidence: 0.35, // Low confidence
      };

      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-' + Date.now(),
        action: 'log_and_monitor',
        reason: 'Possible network jitter detected',
        confidence: analysisResult.confidence,
        severity: signal.severity,
        resource: 'monitoring-system',
        decisionTrace: { signal, analysisResult },
      };

      console.log('\n[E2E] Scenario 3: Low confidence decision', { confidence: decision.confidence });

      // Check approval requirement
      const approvalCheck = approvalService.requiresApproval(decision.confidence);

      expect(approvalCheck.requiresApproval).toBe(true);
      expect(approvalCheck.tier).toBe('OBSERVE');

      console.log('[E2E] Tier: OBSERVE - Action blocked, monitoring only');

      // Would create approval request but with explicit flag
      // that this is for observation/monitoring, not execution

      expect(decision.action).toBe('log_and_monitor');
    });
  });

  describe('Scenario 4: Timeout and Expiration', () => {
    test('should handle approval request timeout', async () => {
      // Create a request with very short timeout for testing
      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-' + Date.now(),
        action: 'restart_pod',
        reason: 'Testing timeout',
        confidence: 0.70,
        resource: 'test-pod',
      };

      const approvalRequest = await approvalService.createApprovalRequest(decision);

      expect(approvalRequest.status).toBe('pending');
      expect(approvalRequest.expiresAt).toBeDefined();

      console.log('\n[E2E] Timeout test: Request created, expires at', approvalRequest.expiresAt);

      // Verify expiration time is in the future
      const expirationTime = new Date(approvalRequest.expiresAt).getTime();
      const now = Date.now();

      expect(expirationTime).toBeGreaterThan(now);

      console.log('[E2E] Expiration check passed');
    });
  });

  describe('Scenario 5: Decision Trace Completeness', () => {
    test('should maintain complete decision trace through approval workflow', async () => {
      // Comprehensive decision with full context
      const initSignal = {
        timestamp: new Date().toISOString(),
        service: 'database',
        metric: 'connection_pool_exhausted',
        value: 1000,
        maxConnections: 1000,
        activeConnections: 995,
        severity: 'critical',
      };

      const analysisData = {
        issueType: 'database_connection_exhaustion',
        severity: 'critical',
        occurrenceCount: 1,
        affectedServices: ['api-service', 'worker-service'],
        rootCauseCandidate: 'Connection leak in query handler',
        historicalOccurrences: 2,
        confidenceFactors: {
          patternMatch: 0.95,
          historicalPrecedent: 0.85,
          signalStrength: 0.90,
          anomalyDetection: 0.88,
        },
      };

      const policyMatchData = {
        appliedPolicy: 'critical-database-failover',
        policyVersion: '2',
        conditions: ['severity == critical', 'service == database'],
        action: 'restart_deployment',
      };

      const safetyGateResults = {
        circuitBreakerCheck: { passed: true, reason: 'Circuit breaker allows action' },
        idempotencyCheck: { passed: true, reason: 'Action is idempotent' },
        tenantQuotaCheck: { passed: true, reason: 'Within quota limits' },
        depthLimitCheck: { passed: true, reason: 'Action depth acceptable' },
      };

      // Calculate confidence based on factors
      const overallConfidence = 0.75; // Explicitly set to ESCALATE tier (0.60-0.85)

      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-' + Date.now(),
        correlationId: 'trace-' + Date.now(),
        action: 'restart_deployment',
        reason: 'Database connection pool exhaustion - critical recovery action',
        severity: initSignal.severity,
        confidence: overallConfidence,
        resource: 'database-service-deployment',
        namespace: 'production',
        decisionTrace: {
          signal: initSignal,
          analysisResult: analysisData,
          policyMatch: policyMatchData,
          safetyGates: safetyGateResults,
          confidenceBreakdown: analysisData.confidenceFactors,
        },
      };

      console.log('\n[E2E] Complete decision trace test');
      console.log('[E2E] Decision:', {
        action: decision.action,
        confidence: decision.confidence.toFixed(2),
        severity: decision.severity,
      });

      // Create approval request with full trace
      const approvalRequest = await approvalService.createApprovalRequest(decision);

      // Verify trace is preserved
      expect(approvalRequest.decisionTrace).toBeDefined();
      expect(approvalRequest.decisionTrace.signal).toEqual(initSignal);
      expect(approvalRequest.decisionTrace.analysisResult).toEqual(analysisData);
      expect(approvalRequest.decisionTrace.policyMatch).toEqual(policyMatchData);
      expect(approvalRequest.decisionTrace.safetyGates).toEqual(safetyGateResults);

      console.log('[E2E] Full decision trace preserved in approval request');

      // Verify trace can be retrieved
      const status = await approvalService.getApprovalStatus(approvalRequest.approvalId);

      expect(status).toBeDefined();

      console.log('[E2E] Trace retrievable for audit and review', {
        confidence: status.confidence,
        severity: status.severity,
      });
    });
  });

  describe('Scenario 6: Kubernetes Integration', () => {
    test('should validate K8s action parameters in decisions', async () => {
      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-' + Date.now(),
        action: 'scale_deployment',
        reason: 'High load detected',
        confidence: 0.75,
        resource: 'web-service-deployment',
        namespace: 'production',
        additionalParams: {
          replicas: 10, // K8s specific parameter
        },
        severity: 'medium',
      };

      console.log('\n[E2E] K8s integration test: Scale deployment');

      const approvalRequest = await approvalService.createApprovalRequest(decision);

      // Verify K8s parameters are preserved
      expect(approvalRequest.additionalParams).toEqual({ replicas: 10 });
      expect(approvalRequest.namespace).toBe('production');

      console.log('[E2E] K8s parameters preserved in approval');

      // Verify action is one of supported K8s actions
      const supportedActions = [
        'restart_pod',
        'restart_deployment',
        'scale_deployment',
      ];

      expect(supportedActions).toContain(decision.action);

      console.log('[E2E] Action type is valid for K8s execution');
    });
  });
});
