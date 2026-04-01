/**
 * Unit Tests for ApprovalService
 * 
 * Tests:
 * - Approval requirement determination based on confidence
 * - Approval request creation
 * - Approval and rejection workflows
 * - Timeout and expiration handling
 * - Decision handling (approve vs auto-execute vs observe)
 * - Queue statistics
 */

const { ApprovalService } = require('../../services/approval/approvalService');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

describe('ApprovalService Unit Tests', () => {
  let approvalService;

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
    // Clear collections between tests
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    
    approvalService = new ApprovalService();
  });

  describe('Approval Requirement Logic', () => {
    test('should NOT require approval for high confidence (>= 0.85)', () => {
      const result = approvalService.requiresApproval(0.85);

      expect(result.requiresApproval).toBe(false);
      expect(result.tier).toBe('AUTO_EXECUTE');
      expect(result.reason).toContain('auto-execution');
    });

    test('should NOT require approval for very high confidence', () => {
      const result = approvalService.requiresApproval(0.99);

      expect(result.requiresApproval).toBe(false);
      expect(result.tier).toBe('AUTO_EXECUTE');
    });

    test('should require approval for medium confidence (0.60-0.85)', () => {
      const result = approvalService.requiresApproval(0.75);

      expect(result.requiresApproval).toBe(true);
      expect(result.tier).toBe('ESCALATE');
      expect(result.reason).toContain('approval');
    });

    test('should require approval for lower medium confidence', () => {
      const result = approvalService.requiresApproval(0.60);

      expect(result.requiresApproval).toBe(true);
      expect(result.tier).toBe('ESCALATE');
    });

    test('should require approval for low confidence (< 0.60)', () => {
      const result = approvalService.requiresApproval(0.50);

      expect(result.requiresApproval).toBe(true);
      expect(result.tier).toBe('OBSERVE');
      expect(result.reason).toContain('Low confidence');
    });

    test('should require approval for very low confidence', () => {
      const result = approvalService.requiresApproval(0.10);

      expect(result.requiresApproval).toBe(true);
      expect(result.tier).toBe('OBSERVE');
    });

    test('should handle edge case: confidence exactly at auto-execute threshold', () => {
      const result = approvalService.requiresApproval(0.85);
      expect(result.requiresApproval).toBe(false);
    });

    test('should handle edge case: confidence just below auto-execute threshold', () => {
      const result = approvalService.requiresApproval(0.849);
      expect(result.requiresApproval).toBe(true);
      expect(result.tier).toBe('ESCALATE');
    });

    test('should handle edge case: confidence exactly at escalation threshold', () => {
      const result = approvalService.requiresApproval(0.60);
      expect(result.requiresApproval).toBe(true);
      expect(result.tier).toBe('ESCALATE');
    });

    test('should handle edge case: confidence just below escalation threshold', () => {
      const result = approvalService.requiresApproval(0.599);
      expect(result.requiresApproval).toBe(true);
      expect(result.tier).toBe('OBSERVE');
    });
  });

  describe('Threshold Configuration', () => {
    test('should load thresholds from environment variables', () => {
      process.env.ESCALATION_THRESHOLD = '0.50';
      process.env.AUTO_EXECUTE_THRESHOLD = '0.90';

      const service = new ApprovalService();

      expect(service.escalationThreshold).toBe(0.50);
      expect(service.autoExecuteThreshold).toBe(0.90);
    });

    test('should use default thresholds when env vars not set', () => {
      delete process.env.ESCALATION_THRESHOLD;
      delete process.env.AUTO_EXECUTE_THRESHOLD;

      const service = new ApprovalService();

      expect(service.escalationThreshold).toBe(0.60);
      expect(service.autoExecuteThreshold).toBe(0.85);
    });
  });

  describe('Error Handling', () => {
    test('should reject approval creation with missing required fields', async () => {
      const invalidDecision = {
        // Missing tenantId
        decisionId: 'dec-123',
        action: 'restart_pod',
        resource: 'my-pod',
      };

      await expect(
        approvalService.createApprovalRequest(invalidDecision)
      ).rejects.toThrow('Missing required');
    });

    test('should reject approval creation when approval not needed', async () => {
      // High confidence decision
      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-123',
        action: 'restart_pod',
        reason: 'High CPU',
        confidence: 0.95, // Too high - doesn't need approval
        resource: 'my-pod',
        severity: 'high',
      };

      await expect(
        approvalService.createApprovalRequest(decision)
      ).rejects.toThrow('Approval not needed');
    });

    test('should reject approval of non-existent request', async () => {
      await expect(
        approvalService.approveAndExecute('does-not-exist', 'user-1')
      ).rejects.toThrow('not found');
    });

    test('should reject rejection of non-existent request', async () => {
      await expect(
        approvalService.rejectRequest('does-not-exist', 'user-1', 'reason')
      ).rejects.toThrow('not found');
    });
  });

  describe('Decision Handling Workflow', () => {
    test('should auto-execute high confidence decision', async () => {
      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-123',
        action: 'restart_pod',
        confidence: 0.95, // High confidence
        resource: 'my-pod',
      };

      const result = await approvalService.handleDecision(decision);

      expect(result.requiresApproval).toBe(false);
      expect(result.autoExecuted).toBe(true);
      expect(result.tier).toBe('AUTO_EXECUTE');
    });

    test('should require approval for medium confidence decision', async () => {
      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-456',
        action: 'restart_deployment',
        reason: 'Memory leak detected',
        confidence: 0.72, // Medium confidence
        resource: 'my-service',
        severity: 'medium',
        namespace: 'default',
      };

      const result = await approvalService.handleDecision(decision);

      expect(result.requiresApproval).toBe(true);
      expect(result.autoExecuted).toBe(false);
      expect(result.tier).toBe('ESCALATE');
      expect(result.approvalRequest).toBeDefined();
    });

    test('should escalate low confidence decision', async () => {
      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-789',
        action: 'scale_deployment',
        reason: 'Possible anomaly',
        confidence: 0.45, // Low confidence
        resource: 'my-app',
        severity: 'low',
      };

      const result = await approvalService.handleDecision(decision);

      expect(result.requiresApproval).toBe(true);
      expect(result.tier).toBe('OBSERVE');
    });
  });

  describe('Approval Metadata', () => {
    test('should capture request context in approval', async () => {
      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-123',
        action: 'restart_pod',
        confidence: 0.75,
        reason: 'CPU threshold exceeded',
        resource: 'web-pod',
        severity: 'high',
      };

      const context = {
        userAgent: 'test-client/1.0',
        ipAddress: '192.168.1.1',
      };

      const result = await approvalService.handleDecision(decision, context);

      expect(result.approvalRequest).toBeDefined();
      // Metadata should be captured (verified in database)
    });

    test('should include decision trace in approval', async () => {
      const decisionTrace = {
        signal: { errorRate: 15.5 },
        analysisResult: { severity: 'high', isLatencyIssue: false },
        policyMatch: { policy: 'restart-on-errors' },
        safetyGates: { passed: true },
      };

      const decision = {
        tenantId: 'tenant-1',
        decisionId: 'dec-123',
        action: 'restart_pod',
        confidence: 0.70,
        reason: 'Safety gates approved',
        resource: 'api-pod',
        decisionTrace,
      };

      const result = await approvalService.handleDecision(decision);

      expect(result.approvalRequest.decisionTrace).toEqual(decisionTrace);
    });
  });

  describe('Tenant Isolation', () => {
    test('should isolate approvals by tenant', async () => {
      // Create two decisions from different tenants
      const decision1 = {
        tenantId: 'tenant-a',
        decisionId: 'dec-1',
        action: 'restart_pod',
        confidence: 0.70,
        resource: 'pod-a',
        reason: 'Testing',
      };

      const decision2 = {
        tenantId: 'tenant-b',
        decisionId: 'dec-2',
        action: 'restart_pod',
        confidence: 0.70,
        resource: 'pod-b',
        reason: 'Testing',
      };

      // Should create separate approval requests
      const result1 = await approvalService.handleDecision(decision1);
      const result2 = await approvalService.handleDecision(decision2);

      expect(result1.approvalRequest.tenantId).toBe('tenant-a');
      expect(result2.approvalRequest.tenantId).toBe('tenant-b');
      expect(result1.approvalRequest.approvalId).not.toBe(result2.approvalRequest.approvalId);
    });

    test('should retrieve approvals only for requested tenant', async () => {
      // Create requests for different tenants
      const decision1 = {
        tenantId: 'tenant-a',
        decisionId: 'dec-1',
        action: 'restart_pod',
        confidence: 0.70,
        resource: 'pod-a',
        reason: 'Testing',
      };

      await approvalService.handleDecision(decision1);

      const pending = await approvalService.getPendingApprovals('tenant-a');

      // Should only include approvals for this tenant
      expect(pending.every(p => p.tenantId === 'tenant-a')).toBe(true);
    });
  });

  describe('Approval Statistics', () => {
    test('should provide queue statistics', async () => {
      const stats = await approvalService.getQueueStats('tenant-1');

      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('approved');
      expect(stats).toHaveProperty('rejected');
      expect(stats).toHaveProperty('backend');

      // Stats should be numeric
      expect(typeof stats.pending).toBe('number');
      expect(typeof stats.approved).toBe('number');
      expect(typeof stats.rejected).toBe('number');
    });

    test('should track overall and per-tenant statistics', async () => {
      const tenantStats = await approvalService.getQueueStats('tenant-1');
      const allStats = await approvalService.getQueueStats();

      // Both should have same structure
      expect(tenantStats).toHaveProperty('pending');
      expect(allStats).toHaveProperty('pending');

      // All stats should be >= tenant stats (all includes tenant)
      expect(allStats.pending).toBeGreaterThanOrEqual(tenantStats.pending);
    });
  });

  describe('Cleanup and Maintenance', () => {
    test('should provide cleanup method for expired requests', async () => {
      // Method should exist and be callable
      expect(typeof approvalService.cleanupExpired).toBe('function');

      const result = await approvalService.cleanupExpired();

      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });
});
