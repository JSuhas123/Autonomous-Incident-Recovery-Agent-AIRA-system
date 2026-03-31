/**
 * Unit Tests: Message Ordering Service
 * Tests correlation ID based message sequencing and ordering guarantees
 */

const messageOrderingService = require('../../services/messageOrderingService');

describe.skip('MessageOrderingService', () => {
  const TEST_TENANT = 'test-tenant-ordering';

  describe('enqueueMessage', () => {
    test('should enqueue message with correlation ID', async () => {
      const correlationId = 'corr-order-001';
      const message = {
        type: 'INCIDENT_DETECTED',
        data: { incidentId: 'inc-001' },
      };

      const queued = await messageOrderingService.enqueueMessage(
        TEST_TENANT,
        correlationId,
        message
      );

      expect(queued).toBe(true);
    });

    test('should assign sequence number to messages', async () => {
      const correlationId = 'corr-order-002';
      const messages = [
        { type: 'INCIDENT_DETECTED', data: { incidentId: 'inc-002' } },
        { type: 'POLICY_EVALUATED', data: { decision: 'APPROVE' } },
        { type: 'ACTION_EXECUTED', data: { action: 'RESTART' } },
      ];

      const sequences = [];
      for (const msg of messages) {
        const entry = await messageOrderingService.enqueueMessage(
          TEST_TENANT,
          correlationId,
          msg
        );
        sequences.push(entry.sequenceNumber);
      }

      // Sequence numbers should be incrementing
      expect(sequences[0]).toBeLessThan(sequences[1]);
      expect(sequences[1]).toBeLessThan(sequences[2]);
    });
  });

  describe('dequeueInOrder', () => {
    test('should dequeue messages in FIFO order', async () => {
      const correlationId = 'corr-order-003';
      const expected = ['FIRST', 'SECOND', 'THIRD'];

      // Enqueue messages
      for (const type of expected) {
        await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, {
          type,
          data: {},
        });
      }

      // Dequeue in order
      const dequeued = [];
      for (let i = 0; i < expected.length; i++) {
        const msg = await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);
        dequeued.push(msg?.type);
      }

      expect(dequeued).toEqual(expected);
    });

    test('should maintain order across multiple correlations', async () => {
      const corr1 = 'corr-multi-1';
      const corr2 = 'corr-multi-2';

      // Interleaved enqueue
      await messageOrderingService.enqueueMessage(TEST_TENANT, corr1, { type: 'A1', data: {} });
      await messageOrderingService.enqueueMessage(TEST_TENANT, corr2, { type: 'B1', data: {} });
      await messageOrderingService.enqueueMessage(TEST_TENANT, corr1, { type: 'A2', data: {} });
      await messageOrderingService.enqueueMessage(TEST_TENANT, corr2, { type: 'B2', data: {} });

      // Dequeue and verify order
      const msg1_1 = await messageOrderingService.dequeueMessage(TEST_TENANT, corr1);
      const msg2_1 = await messageOrderingService.dequeueMessage(TEST_TENANT, corr2);

      expect(msg1_1.type).toBe('A1');
      expect(msg2_1.type).toBe('B1');

      const msg1_2 = await messageOrderingService.dequeueMessage(TEST_TENANT, corr1);
      const msg2_2 = await messageOrderingService.dequeueMessage(TEST_TENANT, corr2);

      expect(msg1_2.type).toBe('A2');
      expect(msg2_2.type).toBe('B2');
    });
  });

  describe('getQueueLength', () => {
    test('should return correct queue length', async () => {
      const correlationId = 'corr-length-001';

      let length = await messageOrderingService.getQueueLength(TEST_TENANT, correlationId);
      expect(length).toBe(0);

      // Enqueue 5 messages
      for (let i = 0; i < 5; i++) {
        await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, {
          type: `MSG_${i}`,
          data: {},
        });
      }

      length = await messageOrderingService.getQueueLength(TEST_TENANT, correlationId);
      expect(length).toBe(5);

      // Dequeue 2 messages
      await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);
      await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);

      length = await messageOrderingService.getQueueLength(TEST_TENANT, correlationId);
      expect(length).toBe(3);
    });
  });

  describe('clearQueue', () => {
    test('should clear all messages for correlation ID', async () => {
      const correlationId = 'corr-clear-001';

      // Enqueue 10 messages
      for (let i = 0; i < 10; i++) {
        await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, {
          type: `MSG_${i}`,
          data: {},
        });
      }

      let length = await messageOrderingService.getQueueLength(TEST_TENANT, correlationId);
      expect(length).toBe(10);

      // Clear queue
      await messageOrderingService.clearQueue(TEST_TENANT, correlationId);

      length = await messageOrderingService.getQueueLength(TEST_TENANT, correlationId);
      expect(length).toBe(0);
    });
  });

  describe('guaranteeOrderingForCorrelation', () => {
    test('should guarantee single message being processed per correlation ID', async () => {
      const correlationId = 'corr-guarantee-001';

      // Enqueue messages
      const messages = [
        { type: 'INCIDENT', data: { id: 'inc-1' } },
        { type: 'ANALYZE', data: { decision: 'A' } },
        { type: 'EXECUTE', data: { action: 'X' } },
      ];

      for (const msg of messages) {
        await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, msg);
      }

      // Dequeue first message
      const firstMsg = await messageOrderingService.dequeueMessage(TEST_TENANT, correlationId);
      expect(firstMsg.type).toBe('INCIDENT');

      // Verify only one message in processing
      const queueLength = await messageOrderingService.getQueueLength(TEST_TENANT, correlationId);
      expect(queueLength).toBe(2); // 2 remaining after dequeue
    });
  });

  describe('getProcessingStatus', () => {
    test('should return queue status for correlation ID', async () => {
      const correlationId = 'corr-status-001';

      await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, {
        type: 'MSG1',
        data: {},
      });
      await messageOrderingService.enqueueMessage(TEST_TENANT, correlationId, {
        type: 'MSG2',
        data: {},
      });

      const status = await messageOrderingService.getProcessingStatus(
        TEST_TENANT,
        correlationId
      );

      expect(status).toBeDefined();
      expect(status.queueLength).toBe(2);
      expect(status.correlationId).toBe(correlationId);
    });
  });
});
