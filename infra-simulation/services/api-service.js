/**
 * API Service (Gateway)
 * Entry point for the simulated microservices
 */

const express = require('express');
const axios = require('axios');
const FailureInjector = require('./failure-injector');
const MetricsHandler = require('./metrics-handler');

const app = express();
const PORT = process.env.PORT || 3001;
const SERVICE_NAME = 'api-service';

app.use(express.json());

// Initialize failure injector and metrics
const failureInjector = new FailureInjector(SERVICE_NAME);
const metrics = new MetricsHandler(SERVICE_NAME);

// Middleware to track metrics
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Inject failure
  failureInjector.injectFailure(req, res, () => {
    // Track original response
    const originalSend = res.send;
    res.send = function (data) {
      const duration = Date.now() - startTime;
      metrics.recordRequest(res.statusCode, duration, res.statusCode < 400);
      return originalSend.call(this, data);
    };
    
    next();
  });
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Metrics endpoint (Prometheus format)
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(metrics.toPrometheus());
});

// Metrics endpoint (JSON)
app.get('/metrics/json', (req, res) => {
  res.json(metrics.getJSON());
});

// Failure injection control endpoint
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

// Business endpoints

// Process payment
app.post('/api/payment', async (req, res) => {
  try {
    const { amount, userId } = req.body;
    
    if (!amount || !userId) {
      return res.status(400).json({ error: 'amount and userId required' });
    }

    const startTime = Date.now();
    
    try {
      // Call payment service
      const paymentResponse = await axios.post(
        `${process.env.PAYMENT_SERVICE_URL}/process`,
        { amount, userId },
        { timeout: 5000 }
      );

      const duration = Date.now() - startTime;
      metrics.recordRequest(200, duration, true);

      res.json({
        success: true,
        transactionId: paymentResponse.data.transactionId,
        amount,
        duration_ms: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.recordRequest(error.response?.status || 500, duration, false);

      return res.status(error.response?.status || 500).json({
        error: 'Payment service error',
        originalError: error.message,
      });
    }
  } catch (error) {
    metrics.recordRequest(500, 0, false);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user data (calls DB service and caches in cache service)
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const startTime = Date.now();

    // Try cache first
    try {
      const cachedResponse = await axios.get(
        `${process.env.CACHE_SERVICE_URL}/get`,
        { params: { key: `user:${userId}` }, timeout: 2000 }
      );

      if (cachedResponse.data.found) {
        const duration = Date.now() - startTime;
        metrics.recordRequest(200, duration, true);
        return res.json({
          source: 'cache',
          data: cachedResponse.data.value,
          duration_ms: duration,
        });
      }
    } catch (cacheError) {
      // Cache miss or error, continue to DB
    }

    // Get from DB
    const dbResponse = await axios.get(
      `${process.env.DB_SERVICE_URL}/fetch`,
      { params: { userId }, timeout: 5000 }
    );

    // Cache the result
    try {
      await axios.post(
        `${process.env.CACHE_SERVICE_URL}/set`,
        { key: `user:${userId}`, value: dbResponse.data, ttl: 3600 },
        { timeout: 2000 }
      );
    } catch (cacheSetError) {
      // Log but don't fail
      console.log('Failed to cache result:', cacheSetError.message);
    }

    const duration = Date.now() - startTime;
    metrics.recordRequest(200, duration, true);

    res.json({
      source: 'db',
      data: dbResponse.data,
      duration_ms: duration,
    });
  } catch (error) {
    metrics.recordRequest(error.response?.status || 500, 0, false);
    res.status(error.response?.status || 500).json({
      error: 'User data retrieval failed',
      originalError: error.message,
    });
  }
});

// Cascading call (hits multiple services)
app.post('/api/order', async (req, res) => {
  try {
    const { userId, items } = req.body;
    
    if (!userId || !items) {
      return res.status(400).json({ error: 'userId and items required' });
    }

    const startTime = Date.now();
    const callTraces = [];

    try {
      // Get user details
      callTraces.push({ service: 'db-service', event: 'fetching-user' });
      const userResponse = await axios.get(
        `${process.env.DB_SERVICE_URL}/fetch`,
        { params: { userId }, timeout: 5000 }
      );

      // Process payment
      callTraces.push({ service: 'payment-service', event: 'processing-payment' });
      const totalAmount = items.reduce((sum, item) => sum + item.price, 0);
      const paymentResponse = await axios.post(
        `${process.env.PAYMENT_SERVICE_URL}/process`,
        { amount: totalAmount, userId },
        { timeout: 5000 }
      );

      // Cache order
      callTraces.push({ service: 'cache-service', event: 'caching-order' });
      const orderId = `order-${Date.now()}`;
      await axios.post(
        `${process.env.CACHE_SERVICE_URL}/set`,
        {
          key: orderId,
          value: { userId, items, transactionId: paymentResponse.data.transactionId },
          ttl: 86400,
        },
        { timeout: 2000 }
      );

      const duration = Date.now() - startTime;
      metrics.recordRequest(200, duration, true);

      res.json({
        success: true,
        orderId,
        totalAmount,
        transactionId: paymentResponse.data.transactionId,
        duration_ms: duration,
        callTraces,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.recordRequest(error.response?.status || 500, duration, false);

      res.status(error.response?.status || 500).json({
        error: 'Order processing failed',
        failedAtService: callTraces[callTraces.length - 1]?.service,
        originalError: error.message,
        callTraces,
      });
    }
  } catch (error) {
    metrics.recordRequest(500, 0, false);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Status endpoint
app.get('/api/status', async (req, res) => {
  try {
    const services = {
      apiService: { status: 'healthy' },
    };

    // Check downstream services
    try {
      const paymentHealth = await axios.get(`${process.env.PAYMENT_SERVICE_URL}/health`, { timeout: 2000 });
      services.paymentService = paymentHealth.data;
    } catch {
      services.paymentService = { status: 'unhealthy' };
    }

    try {
      const dbHealth = await axios.get(`${process.env.DB_SERVICE_URL}/health`, { timeout: 2000 });
      services.dbService = dbHealth.data;
    } catch {
      services.dbService = { status: 'unhealthy' };
    }

    try {
      const cacheHealth = await axios.get(`${process.env.CACHE_SERVICE_URL}/health`, { timeout: 2000 });
      services.cacheService = cacheHealth.data;
    } catch {
      services.cacheService = { status: 'unhealthy' };
    }

    const overallHealthy = Object.values(services).every(s => s.status === 'healthy');

    res.json({
      timestamp: new Date().toISOString(),
      overallStatus: overallHealthy ? 'healthy' : 'degraded',
      services,
    });
  } catch (error) {
    res.status(500).json({ error: 'Status check failed' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Metrics: http://localhost:${PORT}/metrics`);
});
