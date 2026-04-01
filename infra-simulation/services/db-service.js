/**
 * Database Service
 * Simulates a database with connection pooling and query processing
 */

const express = require('express');
const FailureInjector = require('./failure-injector');
const MetricsHandler = require('./metrics-handler');

const app = express();
const PORT = process.env.PORT || 3003;
const SERVICE_NAME = 'db-service';

app.use(express.json());

const failureInjector = new FailureInjector(SERVICE_NAME);
const metrics = new MetricsHandler(SERVICE_NAME);

// Simulated in-memory database
const database = {
  users: {
    'user-1': { id: 'user-1', name: 'Alice', email: 'alice@example.com', status: 'active' },
    'user-2': { id: 'user-2', name: 'Bob', email: 'bob@example.com', status: 'active' },
    'user-3': { id: 'user-3', name: 'Charlie', email: 'charlie@example.com', status: 'inactive' },
  },
  orders: {},
};

// Connection pool simulation
const connectionPool = {
  available: parseInt(process.env.CONNECTION_POOL_SIZE || 10),
  active: 0,
  max: parseInt(process.env.CONNECTION_POOL_SIZE || 10),
  queue: [],
};

// Middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  failureInjector.injectFailure(req, res, () => {
    const originalSend = res.send;
    res.send = function (data) {
      const duration = Date.now() - startTime;
      metrics.recordRequest(res.statusCode, duration, res.statusCode < 400);
      
      // Update connection pool metrics
      metrics.setGauge('db_pool_available', connectionPool.available);
      metrics.setGauge('active_connections', connectionPool.active);
      metrics.setGauge('queue_depth', connectionPool.queue.length);
      
      return originalSend.call(this, data);
    };
    
    next();
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    poolStats: {
      available: connectionPool.available,
      active: connectionPool.active,
      queued: connectionPool.queue.length,
    },
  });
});

// Metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  metrics.setGauge('db_pool_available', connectionPool.available);
  res.send(metrics.toPrometheus());
});

app.get('/metrics/json', (req, res) => {
  res.json(metrics.getJSON());
});

// Failure injection control
app.post('/admin/failure', (req, res) => {
  const { mode, rate, duration } = req.body;
  
  if (!mode) {
    return res.status(400).json({ error: 'mode is required' });
  }
  
  failureInjector.setFailureMode(mode, rate, duration);
  
  res.json({
    message: 'Failure mode updated',
    service: SERVICE_NAME,
    failureMode: mode,
    failureRate: failureInjector.failureRate,
  });
});

// Execute query
app.get('/fetch', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Simulate connection pool exhaustion
    if (connectionPool.available <= 0) {
      return res.status(503).json({
        error: 'Connection pool exhausted',
        queuedRequests: connectionPool.queue.length,
      });
    }

    connectionPool.available--;
    connectionPool.active++;

    // Simulate query execution time
    const queryTime = Math.random() * 200 + 50;
    await new Promise(resolve => setTimeout(resolve, queryTime));

    const user = database.users[userId];

    connectionPool.available++;
    connectionPool.active--;

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: user,
      queryTimeMs: queryTime,
    });
  } catch (error) {
    res.status(500).json({ error: 'Query failed' });
  }
});

// Insert data
app.post('/insert', (req, res) => {
  try {
    const { table, data } = req.body;
    
    if (!table || !data) {
      return res.status(400).json({ error: 'table and data required' });
    }

    if (!database[table]) {
      database[table] = {};
    }

    const id = `${table}-${Date.now()}`;
    database[table][id] = { ...data, id };

    res.json({
      success: true,
      id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Insert failed' });
  }
});

// Update data
app.put('/update', (req, res) => {
  try {
    const { table, id, data } = req.body;
    
    if (!table || !id || !data) {
      return res.status(400).json({ error: 'table, id, and data required' });
    }

    if (!database[table] || !database[table][id]) {
      return res.status(404).json({ error: 'Record not found' });
    }

    database[table][id] = { ...database[table][id], ...data };

    res.json({
      success: true,
      updated: database[table][id],
    });
  } catch (error) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// Get pool status
app.get('/pool/status', (req, res) => {
  res.json({
    available: connectionPool.available,
    active: connectionPool.active,
    max: connectionPool.max,
    queued: connectionPool.queue.length,
    utilization: ((connectionPool.active / connectionPool.max) * 100).toFixed(1) + '%',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
