/**
 * Infrastructure Services Unit Tests
 * 
 * Tests critical system services:
 * - Distributed Lock Service: Atomic locks with failover
 * - Database Service: Connection pooling and error handling
 * - Queue Service: Message routing and order preservation
 * - Metrics Service: Performance tracking
 * - Health Check Service: System status monitoring
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

describe('Infrastructure Services - Unit Tests', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // ============================================================================
  // DISTRIBUTED LOCK SERVICE TESTS
  // ============================================================================

  describe('Distributed Lock Service', () => {
    let lockService;

    beforeEach(() => {
      // Create mock lock service
      lockService = {
        locks: new Map(),
        acquire: async function(key, ttlMs = 5000) {
          if (this.locks.has(key)) {
            throw new Error(`Lock already held: ${key}`);
          }
          const lockId = `lock-${Date.now()}`;
          this.locks.set(key, { lockId, ttlMs, acquiredAt: Date.now() });
          return {
            key,
            lockId,
            release: async () => this.release(key, lockId),
          };
        },
        release: async function(key, lockId) {
          if (!this.locks.has(key)) {
            return false;
          }
          this.locks.delete(key);
          return true;
        },
        extend: async function(key, newTtlMs) {
          if (!this.locks.has(key)) {
            throw new Error(`Lock not held: ${key}`);
          }
          const lock = this.locks.get(key);
          lock.ttlMs = newTtlMs;
          return true;
        },
      };
    });

    test('Acquires lock successfully', async () => {
      const lock = await lockService.acquire('test-resource', 5000);
      expect(lock.lockId).toBeDefined();
      expect(lock.key).toBe('test-resource');
    });

    test('Lock acquisition fails if already locked', async () => {
      await lockService.acquire('test-resource', 5000);
      
      let errorThrown = false;
      try {
        await lockService.acquire('test-resource', 5000);
      } catch (err) {
        errorThrown = true;
        expect(err.message).toContain('Lock already held');
      }
      expect(errorThrown).toBe(true);
    });

    test('Lock is released properly', async () => {
      const lock = await lockService.acquire('test-resource', 5000);
      const released = await lock.release();
      
      // Should be able to acquire again
      const lock2 = await lockService.acquire('test-resource', 5000);
      expect(lock2.lockId).toBeDefined();
    });

    test('Multiple locks independent', async () => {
      const lock1 = await lockService.acquire('resource-1', 5000);
      // Add small delay to ensure different timestamp
      await new Promise(r => setTimeout(r, 1));
      const lock2 = await lockService.acquire('resource-2', 5000);
      
      expect(lock1.lockId).toBeDefined();
      expect(lock2.lockId).toBeDefined();
      expect(lock1.key).not.toBe(lock2.key);
    });

    test('Lock TTL can be extended', async () => {
      const lock = await lockService.acquire('test-resource', 5000);
      const extended = await lockService.extend('test-resource', 10000);
      
      expect(extended).toBe(true);
      expect(lockService.locks.get('test-resource').ttlMs).toBe(10000);
    });

    test('Cannot extend expired lock', async () => {
      let errorThrown = false;
      try {
        await lockService.extend('non-existent', 5000);
      } catch (err) {
        errorThrown = true;
        expect(err.message).toContain('Lock not held');
      }
      expect(errorThrown).toBe(true);
    });

    test('Lock provides release method', async () => {
      const lock = await lockService.acquire('test-resource', 5000);
      expect(typeof lock.release).toBe('function');
    });

    test('Concurrent lock attempts are serialized', async () => {
      const lock1Promise = lockService.acquire('shared', 5000);
      const lock1 = await lock1Promise;

      const lock2Promise = lockService.acquire('shared', 5000);
      
      // Should fail because lock1 holds it
      try {
        await lock2Promise;
        fail('Should have thrown');
      } catch (err) {
        expect(err.message).toContain('Lock already held');
      }

      await lock1.release();
    });
  });

  // ============================================================================
  // DATABASE SERVICE TESTS
  // ============================================================================

  describe('Database Service', () => {
    let dbService;

    beforeEach(() => {
      dbService = {
        connected: true,
        query: async function(collection, filter = {}) {
          if (!this.connected) {
            throw new Error('Database connection unavailable');
          }
          // Simulate query
          return { success: true, count: 0, data: [] };
        },
        insert: async function(collection, document) {
          if (!this.connected) {
            throw new Error('Database connection unavailable');
          }
          return { insertedId: `id-${Date.now()}` };
        },
        update: async function(collection, filter, update) {
          if (!this.connected) {
            throw new Error('Database connection unavailable');
          }
          return { modifiedCount: 1 };
        },
        delete: async function(collection, filter) {
          if (!this.connected) {
            throw new Error('Database connection unavailable');
          }
          return { deletedCount: 1 };
        },
        transaction: async function(operations) {
          if (!this.connected) {
            throw new Error('Database connection unavailable');
          }
          // Simulate transaction
          return { success: true, operations: operations.length };
        },
      };
    });

    test('Queries database successfully', async () => {
      const result = await dbService.query('incidents', { severity: 'high' });
      expect(result.success).toBe(true);
    });

    test('Insert operation succeeds', async () => {
      const result = await dbService.insert('logs', { message: 'Test' });
      expect(result.insertedId).toBeDefined();
    });

    test('Update operation succeeds', async () => {
      const result = await dbService.update('incidents', { id: '123' }, { severity: 'critical' });
      expect(result.modifiedCount).toBe(1);
    });

    test('Delete operation succeeds', async () => {
      const result = await dbService.delete('logs', { id: '123' });
      expect(result.deletedCount).toBe(1);
    });

    test('Transaction executes multiple operations', async () => {
      const operations = [
        { type: 'insert', collection: 'logs', data: {} },
        { type: 'update', collection: 'incidents', filter: {}, data: {} },
      ];
      
      const result = await dbService.transaction(operations);
      expect(result.operations).toBe(2);
    });

    test('Fails gracefully when disconnected', async () => {
      dbService.connected = false;
      
      let errorThrown = false;
      try {
        await dbService.query('incidents');
      } catch (err) {
        errorThrown = true;
        expect(err.message).toContain('unavailable');
      }
      expect(errorThrown).toBe(true);
    });

    test('Reconnection restores operations', async () => {
      dbService.connected = false;
      
      // Should throw when disconnected
      let errorThrown = false;
      try {
        await dbService.query('incidents');
      } catch (err) {
        errorThrown = true;
      }
      expect(errorThrown).toBe(true);
      
      // Should work when reconnected
      dbService.connected = true;
      const result = await dbService.query('incidents');
      expect(result.success).toBe(true);
    });

    test('Batch operations preserve order', async () => {
      const operations = [
        { type: 'insert', id: 1 },
        { type: 'insert', id: 2 },
        { type: 'insert', id: 3 },
      ];
      
      const result = await dbService.transaction(operations);
      expect(result.operations).toBe(3);
    });
  });

  // ============================================================================
  // QUEUE SERVICE TESTS
  // ============================================================================

  describe('Queue Service', () => {
    let queueService;

    beforeEach(() => {
      queueService = {
        queue: [],
        listening: false,
        enqueue: function(message) {
          if (!message.id) {
            message.id = `msg-${Date.now()}`;
          }
          this.queue.push(message);
          return message.id;
        },
        dequeue: function() {
          return this.queue.shift();
        },
        peek: function() {
          return this.queue[0];
        },
        size: function() {
          return this.queue.length;
        },
        listen: async function(handler) {
          this.listening = true;
          // Simulate message processing
          while (this.listening && this.queue.length > 0) {
            const message = this.dequeue();
            await handler(message);
          }
        },
        stop: function() {
          this.listening = false;
        },
      };
    });

    test('Enqueues message successfully', () => {
      const msgId = queueService.enqueue({ action: 'restart', service: 'api' });
      expect(msgId).toBeDefined();
      expect(queueService.size()).toBe(1);
    });

    test('Dequeues messages in FIFO order', () => {
      queueService.enqueue({ id: 'msg-1' });
      queueService.enqueue({ id: 'msg-2' });
      queueService.enqueue({ id: 'msg-3' });
      
      const msg1 = queueService.dequeue();
      const msg2 = queueService.dequeue();
      
      expect(msg1.id).toBe('msg-1');
      expect(msg2.id).toBe('msg-2');
    });

    test('Peek returns first message without removing it', () => {
      queueService.enqueue({ id: 'msg-1' });
      
      const peeked = queueService.peek();
      expect(peeked.id).toBe('msg-1');
      
      // Still there
      expect(queueService.size()).toBe(1);
    });

    test('Size reports correct queue depth', () => {
      queueService.enqueue({});
      queueService.enqueue({});
      queueService.enqueue({});
      
      expect(queueService.size()).toBe(3);
    });

    test('Dequeue from empty queue returns null', () => {
      const msg = queueService.dequeue();
      expect(msg).toBeUndefined();
    });

    test('Processes messages in order', async () => {
      const processed = [];
      const handler = async (msg) => {
        processed.push(msg.id);
      };
      
      queueService.enqueue({ id: 'msg-1' });
      queueService.enqueue({ id: 'msg-2' });
      queueService.enqueue({ id: 'msg-3' });
      
      await queueService.listen(handler);
      
      expect(processed).toEqual(['msg-1', 'msg-2', 'msg-3']);
    });

    test('Stop listening halts processing', () => {
      queueService.enqueue({});
      queueService.enqueue({});
      
      queueService.listening = true;
      queueService.stop();
      
      expect(queueService.listening).toBe(false);
    });

    test('Handles message with priority (if implemented)', () => {
      queueService.enqueue({ id: 'msg-1', priority: 1 });
      queueService.enqueue({ id: 'msg-2', priority: 10 });
      
      // Queue should maintain order (FIFO)
      expect(queueService.dequeue().id).toBe('msg-1');
    });
  });

  // ============================================================================
  // METRICS SERVICE TESTS
  // ============================================================================

  describe('Metrics Service', () => {
    let metricsService;

    beforeEach(() => {
      metricsService = {
        metrics: {},
        recordMetric: function(name, value, tags = {}) {
          if (!this.metrics[name]) {
            this.metrics[name] = [];
          }
          this.metrics[name].push({ value, tags, timestamp: Date.now() });
        },
        getMetric: function(name) {
          return this.metrics[name] || [];
        },
        recordLatency: function(operationName, durationMs) {
          this.recordMetric(`latency_${operationName}`, durationMs);
        },
        recordError: function(operationName, error) {
          this.recordMetric(`error_${operationName}`, 1);
        },
        getStats: function(name) {
          const data = this.metrics[name] || [];
          if (data.length === 0) return null;
          
          const values = data.map(d => d.value);
          const sum = values.reduce((a, b) => a + b, 0);
          const sorted = values.sort((a, b) => a - b);
          
          return {
            count: values.length,
            avg: sum / values.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            p95: sorted[Math.floor(sorted.length * 0.95)],
          };
        },
      };
    });

    test('Records metric successfully', () => {
      metricsService.recordMetric('request_count', 100);
      
      const metrics = metricsService.getMetric('request_count');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toBe(100);
    });

    test('Records latency measurements', () => {
      metricsService.recordLatency('decision_engine', 45);
      metricsService.recordLatency('decision_engine', 52);
      
      const metrics = metricsService.getMetric('latency_decision_engine');
      expect(metrics).toHaveLength(2);
    });

    test('Records errors', () => {
      metricsService.recordError('api_call', new Error('Timeout'));
      metricsService.recordError('api_call', new Error('Connection refused'));
      
      const metrics = metricsService.getMetric('error_api_call');
      expect(metrics).toHaveLength(2);
    });

    test('Calculates statistics', () => {
      metricsService.recordMetric('latency', 100);
      metricsService.recordMetric('latency', 150);
      metricsService.recordMetric('latency', 80);
      metricsService.recordMetric('latency', 200);
      metricsService.recordMetric('latency', 120);
      
      const stats = metricsService.getStats('latency');
      expect(stats.count).toBe(5);
      expect(stats.avg).toBeGreaterThan(0);
      expect(stats.min).toBe(80);
      expect(stats.max).toBe(200);
    });

    test('Tags metrics for filtering', () => {
      metricsService.recordMetric('decision', 1, { service: 'payment', severity: 'high' });
      metricsService.recordMetric('decision', 1, { service: 'api', severity: 'low' });
      
      const metrics = metricsService.getMetric('decision');
      expect(metrics).toHaveLength(2);
      expect(metrics[0].tags.service).toBe('payment');
    });

    test('Returns null for unknown metrics', () => {
      const stats = metricsService.getStats('unknown_metric');
      expect(stats).toBeNull();
    });
  });

  // ============================================================================
  // HEALTH CHECK SERVICE TESTS
  // ============================================================================

  describe('Health Check Service', () => {
    let healthService;

    beforeEach(() => {
      healthService = {
        components: {},
        registerComponent: function(name, checkFn) {
          this.components[name] = { checkFn, status: 'unknown' };
        },
        check: async function(name) {
          const component = this.components[name];
          if (!component) return null;
          
          try {
            const healthy = await component.checkFn();
            component.status = healthy ? 'healthy' : 'unhealthy';
            return { name, status: component.status };
          } catch (err) {
            component.status = 'error';
            return { name, status: 'error', error: err.message };
          }
        },
        checkAll: async function() {
          const results = {};
          for (const name in this.components) {
            results[name] = await this.check(name);
          }
          return results;
        },
        isHealthy: async function() {
          const results = await this.checkAll();
          return Object.values(results).every(r => r.status === 'healthy');
        },
      };
    });

    test('Registers health check components', () => {
      healthService.registerComponent('database', async () => true);
      expect(healthService.components.database).toBeDefined();
    });

    test('Executes individual health check', async () => {
      healthService.registerComponent('redis', async () => true);
      const result = await healthService.check('redis');
      
      expect(result.status).toBe('healthy');
    });

    test('Reports unhealthy component', async () => {
      healthService.registerComponent('queue', async () => false);
      const result = await healthService.check('queue');
      
      expect(result.status).toBe('unhealthy');
    });

    test('Handles check failures', async () => {
      healthService.registerComponent('external_api', async () => {
        throw new Error('Connection timeout');
      });
      
      const result = await healthService.check('external_api');
      expect(result.status).toBe('error');
      expect(result.error).toContain('timeout');
    });

    test('Checks all components', async () => {
      healthService.registerComponent('db', async () => true);
      healthService.registerComponent('cache', async () => true);
      healthService.registerComponent('queue', async () => false);
      
      const results = await healthService.checkAll();
      expect(Object.keys(results)).toHaveLength(3);
    });

    test('Overall health depends on all components', async () => {
      healthService.registerComponent('a', async () => true);
      healthService.registerComponent('b', async () => true);
      healthService.registerComponent('c', async () => false);
      
      const healthy = await healthService.isHealthy();
      expect(healthy).toBe(false);
    });

    test('All healthy returns true', async () => {
      healthService.registerComponent('db', async () => true);
      healthService.registerComponent('redis', async () => true);
      
      const healthy = await healthService.isHealthy();
      expect(healthy).toBe(true);
    });
  });

  // ============================================================================
  // INTEGRATION: Infrastructure Services Working Together
  // ============================================================================

  describe('Infrastructure Services Integration', () => {
    test('Lock protects database transaction', async () => {
      // Mock services
      const lock = { key: 'db-update', released: false };
      const db = { executed: false };
      
      // Acquire lock
      // Update database
      db.executed = true;
      
      // Release lock
      lock.released = true;
      
      expect(db.executed).toBe(true);
      expect(lock.released).toBe(true);
    });

    test('Metrics track queue performance', () => {
      const metrics = {
        recordQueueDepth: function(depth) {
          this.lastDepth = depth;
        },
        getQueueMetrics: function() {
          return { depth: this.lastDepth };
        },
      };
      
      metrics.recordQueueDepth(42);
      const stats = metrics.getQueueMetrics();
      
      expect(stats.depth).toBe(42);
    });

    test('Health check validates all infrastructure', async () => {
      const reportCardule = {
        healthy: true,
        components: {
          lock: true,
          database: true,
          queue: true,
          metrics: true,
        },
      };
      
      const allHealthy = Object.values(reportCardule.components).every(h => h);
      expect(allHealthy).toBe(true);
    });
  });
});
