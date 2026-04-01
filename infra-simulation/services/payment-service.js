/**
 * Payment Service
 * Handles payment processing with failure injection
 */

const express = require('express');
const FailureInjector = require('./failure-injector');
const MetricsHandler = require('./metrics-handler');

const app = express();
const PORT = process.env.PORT || 3002;
const SERVICE_NAME = 'payment-service';

app.use(express.json());

const failureInjector = new FailureInjector(SERVICE_NAME);
const metrics = new MetricsHandler(SERVICE_NAME);

// Middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  failureInjector.injectFailure(req, res, () => {
    const originalSend = res.send;
    res.send = function (data) {
      const duration = Date.now() - startTime;
      metrics.recordRequest(res.statusCode, duration, res.statusCode < 400);
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
    uptime: process.uptime(),
  });
});

// Metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
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

// Process payment
app.post('/process', (req, res) => {
  try {
    const { amount, userId } = req.body;
    
    if (!amount || !userId) {
      return res.status(400).json({ error: 'amount and userId required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'amount must be positive' });
    }

    // Simulate payment processing delay
    const processingTime = Math.random() * 200 + 50;
    
    // Simulate occasional validation errors (5% of requests)
    if (Math.random() < 0.05) {
      return res.status(400).json({
        error: 'Payment validation failed',
        reason: 'Insufficient funds or invalid card',
      });
    }

    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    res.json({
      success: true,
      transactionId,
      amount,
      userId,
      timestamp: new Date().toISOString(),
      processingTimeMs: processingTime,
    });
  } catch (error) {
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Verify payment
app.get('/verify/:transactionId', (req, res) => {
  try {
    const { transactionId } = req.params;
    
    res.json({
      transactionId,
      status: 'confirmed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Refund payment
app.post('/refund', (req, res) => {
  try {
    const { transactionId, amount } = req.body;
    
    if (!transactionId || !amount) {
      return res.status(400).json({ error: 'transactionId and amount required' });
    }

    res.json({
      success: true,
      refundId: `RF-${Date.now()}`,
      originalTransaction: transactionId,
      refundedAmount: amount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Refund failed' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
