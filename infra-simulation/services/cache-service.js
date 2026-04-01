/**
 * Cache Service
 * In-memory caching with TTL and LRU eviction
 */

const express = require('express');
const FailureInjector = require('./failure-injector');
const MetricsHandler = require('./metrics-handler');

const app = express();
const PORT = process.env.PORT || 3004;
const SERVICE_NAME = 'cache-service';

app.use(express.json());

const failureInjector = new FailureInjector(SERVICE_NAME);
const metrics = new MetricsHandler(SERVICE_NAME);

// LRU Cache implementation
class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  set(key, value, ttl = 3600) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    if (this.cache.size >= this.maxSize) {
      // Evict LRU item
      const lruKey = this.accessOrder.shift();
      this.cache.delete(lruKey);
      this.evictions++;
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl * 1000),
      createdAt: Date.now(),
    });

    this.accessOrder.push(key);
  }

  get(key) {
    if (!this.cache.has(key)) {
      this.misses++;
      return null;
    }

    const item = this.cache.get(key);

    // Check expiration
    if (item.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update access order (move to end)
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);

    this.hits++;
    return item.value;
  }

  delete(key) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      return true;
    }
    return false;
  }

  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }

  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilization: ((this.cache.size / this.maxSize) * 100).toFixed(1) + '%',
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 
        ? ((this.hits / (this.hits + this.misses)) * 100).toFixed(1) + '%'
        : '0%',
      evictions: this.evictions,
    };
  }
}

const maxCacheSizeMB = parseInt(process.env.MAX_CACHE_SIZE_MB || 256);
const maxEntries = (maxCacheSizeMB * 1024 * 1024) / 1024; // Rough estimate: 1KB per entry

const cache = new LRUCache(Math.max(1000, maxEntries));

// Cleanup job: Remove expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  const toDelete = [];

  for (const [key, item] of cache.cache.entries()) {
    if (item.expiresAt < now) {
      toDelete.push(key);
    }
  }

  toDelete.forEach(key => cache.delete(key));
  
  if (toDelete.length > 0) {
    console.log(`[${SERVICE_NAME}] Cleaned up ${toDelete.length} expired entries`);
  }
}, 60000);

// Middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  failureInjector.injectFailure(req, res, () => {
    const originalSend = res.send;
    res.send = function (data) {
      const duration = Date.now() - startTime;
      metrics.recordRequest(res.statusCode, duration, res.statusCode < 400);
      
      // Update cache metrics
      const stats = cache.stats();
      metrics.setGauge('memory_usage_bytes', (cache.cache.size * 1024));
      metrics.setGauge('queue_depth', cache.cache.size);
      
      return originalSend.call(this, data);
    };
    
    next();
  });
});

// Health check
app.get('/health', (req, res) => {
  const stats = cache.stats();
  res.json({
    status: 'healthy',
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    cache: stats,
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

// Get value from cache
app.get('/get', (req, res) => {
  try {
    const { key } = req.query;
    
    if (!key) {
      return res.status(400).json({ error: 'key required' });
    }

    const value = cache.get(key);

    res.json({
      found: value !== null,
      key,
      value,
      cacheStats: cache.stats(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Get failed' });
  }
});

// Set value in cache
app.post('/set', (req, res) => {
  try {
    const { key, value, ttl } = req.body;
    
    if (!key || !value) {
      return res.status(400).json({ error: 'key and value required' });
    }

    cache.set(key, value, ttl || 3600);

    res.json({
      success: true,
      key,
      ttl: ttl || 3600,
      cacheStats: cache.stats(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Set failed' });
  }
});

// Delete from cache
app.delete('/delete', (req, res) => {
  try {
    const { key } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'key required' });
    }

    const deleted = cache.delete(key);

    res.json({
      success: deleted,
      key,
      cacheStats: cache.stats(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Clear cache
app.post('/clear', (req, res) => {
  cache.clear();
  res.json({
    success: true,
    message: 'Cache cleared',
    cacheStats: cache.stats(),
  });
});

// Cache statistics
app.get('/stats', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    cacheStats: cache.stats(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
