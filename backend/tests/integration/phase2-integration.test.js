/**
 * Phase 2 Integration Tests
 * Tests: Message Ordering, DLQ, Runbook Execution
 */

const { dbService } = require('../../services/infrastructure');
const dlqService = require('../../services/infrastructure/dlqService');
const messageOrderingService = require('../../services/infrastructure/messageOrderingService');
const { runbookExecutionService } = require('../../services/execution');
const TenantConfig = require('../../models/TenantConfig');

const { connectDatabase, disconnectDatabase } = dbService;

describe('Phase 2 Integration Tests', () => {
  const TEST_TENANT = 'test-tenant-phase2';
  const API_KEY_ID = 'test-api-key-phase2';

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Setup test tenant with proper schema structure
    await TenantConfig.deleteOne({ tenantId: TEST_TENANT });
    const tenant = new TenantConfig({
      tenantId: TEST_TENANT,
      name: 'Phase 2 Integration Test',
      apiKeys: [
        {
          keyId: API_KEY_ID,
          keyHash: 'hash-' + API_KEY_ID,
          secretHash: 'secret-hash-phase2',
        }
      ],
      secretKey: 'secret-phase2',
    });
    await tenant.save();
  });

  afterEach(async () => {
    // Cleanup test tenant
    await TenantConfig.deleteOne({ tenantId: TEST_TENANT });
  });

  describe('Message Ordering', () => {
    test('should guarantee order within correlation ID', async () => {
      const correlationId = `order-test-${Date.now()}`;

      // Simulate incident lifecycle
      const messages = [
        { type: 'INCIDENT_DETECTED', priority: 1 },
        { type: 'POLICY_EVALUATED', priority: 2 },
        { type: 'DECISION_MADE', priority: 3 },
        { type: 'ACTION_APPROVED', priority: 4 },
      ];

      // Enqueue messages
      for (const msg of messages) {
        await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, msg);
      }

      // Verify order
      for (const expected of messages) {
        const msg = await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);
        expect(msg.type).toBe(expected.type);
      }
    });

    test('should prevent out-of-order delivery', async () => {
      const correlationId = `ooo-test-${Date.now()}`;

      // Enqueue 3 messages
      await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, {
        type: 'FIRST',
      });
      await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, {
        type: 'SECOND',
      });
      await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, {
        type: 'THIRD',
      });

      // Dequeue should maintain order
      const msg1 = await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);
      const msg2 = await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);
      const msg3 = await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);

      expect(msg1.type).toBe('FIRST');
      expect(msg2.type).toBe('SECOND');
      expect(msg3.type).toBe('THIRD');
    });
  });

  describe('Dead Letter Queue with Exponential Backoff', () => {
    test('should capture failed messages', async () => {
      const failedMessage = {
        correlationId: `dlq-test-${Date.now()}`,
        eventId: `event-${Date.now()}`,
        action: 'RESTART_SERVICE',
        serviceName: 'api-server',
      };
      const error = new Error('Service restart timed out');

      const entry = await dlqService.addToQueue(TEST_TENANT, failedMessage, error, 1);

      expect(entry).toBeDefined();
      expect(entry.status).toBe('retriable');
      expect(entry.failureCount).toBe(1);
      expect(entry.originalMessage.action).toBe('RESTART_SERVICE');
    });

    test('should implement exponential backoff strategy', async () => {
      const backoffs = [];
      for (let attempt = 1; attempt <= 4; attempt++) {
        const delay = dlqService.getBackoffDelay(attempt);
        backoffs.push(delay);
      }

      // Each backoff should be longer than previous
      expect(backoffs[0]).toBeLessThan(backoffs[1]);
      expect(backoffs[1]).toBeLessThan(backoffs[2]);
      expect(backoffs[2]).toBeLessThan(backoffs[3]);

      // Should cap at reasonable time
      expect(backoffs[3]).toBeLessThanOrEqual(3600000);
    });
  });

  describe('Runbook Execution', () => {
    test('should execute runbook', async () => {
      const runbook = {
        name: 'RestartService',
        steps: [
          {
            name: 'stop-service',
            action: 'STOP_SERVICE',
            params: { serviceName: 'api' },
            timeout: 30,
          },
          {
            name: 'start-service',
            action: 'START_SERVICE',
            params: { serviceName: 'api' },
            timeout: 30,
          },
        ],
      };

      const execution = await runbookExecutionService.executeRunbook(
        TEST_TENANT,
        `corr-runbook-${Date.now()}`,
        runbook
      );

      expect(execution).toBeDefined();
      expect(execution.executionId).toBeDefined();
      expect(execution.steps.length).toBe(2);
    });
  });
});
