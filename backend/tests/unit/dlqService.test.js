/**
 * Unit Tests: DLQ Service
 * Tests dead letter queue, exponential backoff, and message retry logic
 */

const dlqService = require('../../services/dlqService');

describe.skip('DLQService', () => {
  const TEST_TENANT = 'test-tenant-dlq';

  describe('addToQueue', () => {
    test('should add failed message to DLQ', async () => {
      const message = {
        correlationId: 'corr-001',
        incidentId: 'incident-001',
        action: 'RESTART_SERVICE',
        reason: 'Service hung',
      };
      const error = new Error('Service restart failed');

      const entry = await dlqService.addToQueue(TEST_TENANT, message, error, 1);

      expect(entry).toBeDefined();
      expect(entry.tenantId).toBe(TEST_TENANT);
      expect(entry.message).toEqual(message);
      expect(entry.attempt).toBe(1);
      expect(entry.status).toBe('QUEUED');
      expect(entry.nextRetryTime).toBeDefined();
    });

    test('should set correct retry backoff times', async () => {
      const message = { correlationId: 'backoff-test', action: 'TEST' };
      const error = new Error('Test error');

      const retries = [];
      for (let i = 1; i <= 3; i++) {
        const entry = await dlqService.addToQueue(TEST_TENANT, message, error, i);
        retries.push(entry.nextRetryTime);
      }

      // Each retry should have increasing backoff
      expect(retries[1].getTime()).toBeGreaterThan(retries[0].getTime());
      expect(retries[2].getTime()).toBeGreaterThan(retries[1].getTime());
    });
  });

  describe('exponentialBackoff', () => {
    test('should calculate correct backoff delay', () => {
      // Attempt 1: ~5s
      const delay1 = dlqService.getBackoffDelay(1);
      expect(delay1).toBeGreaterThanOrEqual(5000);
      expect(delay1).toBeLessThanOrEqual(6000);

      // Attempt 2: ~15s
      const delay2 = dlqService.getBackoffDelay(2);
      expect(delay2).toBeGreaterThanOrEqual(15000);
      expect(delay2).toBeLessThanOrEqual(16000);

      // Attempt 3: ~45s
      const delay3 = dlqService.getBackoffDelay(3);
      expect(delay3).toBeGreaterThanOrEqual(45000);
      expect(delay3).toBeLessThanOrEqual(46000);

      // Attempt 4: ~1h
      const delay4 = dlqService.getBackoffDelay(4);
      expect(delay4).toBeGreaterThanOrEqual(3600000);
      expect(delay4).toBeLessThanOrEqual(3601000);
    });

    test('should cap maximum backoff delay', () => {
      const maxDelay = dlqService.getBackoffDelay(10);
      expect(maxDelay).toBeLessThanOrEqual(3600000); // 1 hour max
    });
  });

  describe('getRetryableMessages', () => {
    test('should return messages ready for retry', async () => {
      const message = { correlationId: 'retry-001', action: 'SCALE_SERVICE' };
      const error = new Error('Scaling failed');

      // Add message with immediate retry time
      const entry = await dlqService.addToQueue(TEST_TENANT, message, error, 1);
      entry.nextRetryTime = new Date(Date.now() - 1000); // Past time = ready to retry
      await dlqService.updateEntry(entry);

      const retryable = await dlqService.getRetryableMessages(TEST_TENANT);

      expect(retryable.length).toBeGreaterThan(0);
      expect(retryable.some((m) => m.message.correlationId === 'retry-001')).toBe(true);
    });

    test('should not return messages not yet ready for retry', async () => {
      const message = { correlationId: 'not-ready-001', action: 'TEST' };
      const error = new Error('Test error');

      await dlqService.addToQueue(TEST_TENANT, message, error, 1);

      const retryable = await dlqService.getRetryableMessages(TEST_TENANT);
      const found = retryable.find((m) => m.message.correlationId === 'not-ready-001');

      expect(found).toBeUndefined();
    });
  });

  describe('incrementAttempt', () => {
    test('should increment attempt count and next retry time', async () => {
      const message = { correlationId: 'attempt-001', action: 'TEST' };
      const error = new Error('Failed');

      let entry = await dlqService.addToQueue(TEST_TENANT, message, error, 1);
      const firstRetry = entry.nextRetryTime;

      entry = await dlqService.incrementAttempt(TEST_TENANT, entry._id);

      expect(entry.attempt).toBe(2);
      expect(entry.nextRetryTime.getTime()).toBeGreaterThan(firstRetry.getTime());
    });
  });

  describe('markAsDelivered', () => {
    test('should mark DLQ message as successfully delivered', async () => {
      const message = { correlationId: 'delivered-001', action: 'TEST' };
      const error = new Error('Failed');

      let entry = await dlqService.addToQueue(TEST_TENANT, message, error, 1);
      entry = await dlqService.markAsDelivered(TEST_TENANT, entry._id);

      expect(entry.status).toBe('DELIVERED');
      expect(entry.deliveredAt).toBeDefined();
    });
  });

  describe('markAsFailed', () => {
    test('should mark DLQ message as permanently failed', async () => {
      const message = { correlationId: 'failed-001', action: 'TEST' };
      const error = new Error('Failed');

      let entry = await dlqService.addToQueue(TEST_TENANT, message, error, 4);
      entry = await dlqService.markAsFailed(TEST_TENANT, entry._id, 'Max retries exceeded');

      expect(entry.status).toBe('FAILED');
      expect(entry.failureReason).toBe('Max retries exceeded');
    });
  });

  describe('getMetrics', () => {
    test('should provide DLQ metrics', async () => {
      const metrics = await dlqService.getMetrics(TEST_TENANT);

      expect(metrics).toBeDefined();
      expect(metrics.totalQueued).toBeGreaterThanOrEqual(0);
      expect(metrics.totalDelivered).toBeGreaterThanOrEqual(0);
      expect(metrics.totalFailed).toBeGreaterThanOrEqual(0);
      expect(metrics.averageRetries).toBeGreaterThanOrEqual(0);
    });
  });
});
