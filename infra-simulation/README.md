# Phase 1: AIRA Infrastructure Simulation

## 🎯 Overview

This directory contains a **realistic microservices infrastructure simulation** with failure injection capabilities. It allows AIRA to be tested against real-world scenarios including:

- **Service crashes**
- **Latency injection** (high response times)
- **Memory leaks**
- **Database connection pool exhaustion**
- **Cascading failures** (across multiple services)

## 📋 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     AIRA INFRASTRUCTURE SIMULATION              │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│   API Service    │◄─── Entry point for all requests
│  (Gateway)       │     - Orchestrates payment processing
│  ◄─────────────► │     - Handles user data retrieval
│  Port: 3001      │     - Manages cascading operations
└────────┬─────────┘
         │
    ┌────┴────────────────────────────────────┐
    │                                         │
    ▼                                         ▼
┌─────────────────┐                  ┌──────────────────┐
│ Payment Service │                  │   Cache Service  │
│ (Transactional) │                  │ (LRU w/ TTL)     │
│ Port: 3002      │                  │ Port: 3004       │
└────────┬────────┘                  └────────▲─────────┘
         │                                    │
         │         ┌──────────────────────────┘
         │         │
         ▼         ▼
    ┌─────────────────────┐
    │   Database Service  │
    │  (Connection Pool)  │
    │  Port: 3003         │
    └─────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     OBSERVABILITY STACK                         │
├──────────────────┬──────────────────┬──────────────────┐
│  Prometheus      │   Grafana        │   Service Metrics│
│  (9090)          │   (3000)         │   (/metrics)    │
│                  │                  │                  │
│ Scrapes metrics  │ Visualizes data  │ Prometheus text  │
│ from all services│ and kpis         │ format output    │
└──────────────────┴──────────────────┴──────────────────┘
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# In Windows PowerShell
cd infra-simulation

# Note: Services run in Node.js containers via Docker
# Ensure Docker Desktop is running
docker --version
```

### 2. Start Infrastructure

```bash
# Start all services with docker-compose
docker-compose -f docker-compose.yml up -d

# Verify services are running
docker ps

# Check health of all services
curl http://localhost:3001/api/status
```

### 3. Access Services

| Service | URL | Purpose |
|---------|-----|---------|
| API Gateway | `http://localhost:3001` | Entry point |
| Payment Service | `http://localhost:3002` | Payment processing |
| Database Service | `http://localhost:3003` | Data queries |
| Cache Service | `http://localhost:3004` | Caching |
| Prometheus | `http://localhost:9090` | Metrics collection |
| Grafana | `http://localhost:3000` | Visualization (admin/admin) |

### 4. Health Checks

```bash
# Check API service
curl http://localhost:3001/health

# Check all services
curl http://localhost:3001/api/status

# View metrics (Prometheus format)
curl http://localhost:3001/metrics

# View metrics (JSON format)
curl http://localhost:3001/metrics/json
```

## 🔧 Failure Injection

### Simulate Service Crashes

```bash
# Set payment service to crash mode (100% failure rate)
curl -X POST http://localhost:3002/admin/failure \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "crash",
    "rate": 100,
    "duration": 10000
  }'
```

### Simulate High Latency

```bash
# Set database to respond slowly (5-20 second delays)
curl -X POST http://localhost:3003/admin/failure \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "latency",
    "rate": 50,
    "duration": 30000
  }'
```

### Simulate Memory Leaks

```bash
# Set cache service to leak memory (50MB per request)
curl -X POST http://localhost:3004/admin/failure \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "memory-leak",
    "rate": 30,
    "duration": 60000
  }'
```

### Simulate Database Exhaustion

```bash
# Set DB to exhaust connections
curl -X POST http://localhost:3003/admin/failure \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "db-exhaustion",
    "rate": 100,
    "duration": 20000
  }'
```

## 📊 Testing Scenarios

### Scenario 1: Single Service Failure

```bash
# 1. Inject crash into payment service
curl -X POST http://localhost:3002/admin/failure \
  -H "Content-Type: application/json" \
  -d '{"mode": "crash", "rate": 100}'

# 2. Try to process a payment (should fail)
curl -X POST http://localhost:3001/api/payment \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "userId": "user-1"}'

# 3. Check system status
curl http://localhost:3001/api/status

# 4. AIRA should detect this and alert
# 5. View metrics to see failure rate spike
curl http://localhost:3002/metrics
```

### Scenario 2: Cascading Failures

```bash
# 1. Induce latency in database
curl -X POST http://localhost:3003/admin/failure \
  -H "Content-Type: application/json" \
  -d '{"mode": "latency", "rate": 100}'

# 2. Try to create an order (hits multiple services)
curl -X POST http://localhost:3001/api/order \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-1",
    "items": [
      {"id": "item-1", "price": 20},
      {"id": "item-2", "price": 30}
    ]
  }'

# 3. Watch the cascading delay and failures
# 4. AIRA should recommend circuit breaking or service restart
```

### Scenario 3: Resource Exhaustion

```bash
# 1. Exhaust database connections
curl -X POST http://localhost:3003/admin/failure \
  -H "Content-Type: application/json" \
  -d '{"mode": "db-exhaustion", "rate": 100}'

# 2. Send multiple concurrent requests
for i in {1..10}; do
  curl http://localhost:3001/api/user/user-1 &
done
wait

# 3. Check database pool status
curl http://localhost:3003/pool/status

# 4. AIRA should recommend:
#    - Circuit breaking
#    - Queue draining
#    - Service restart
```

## 📈 Monitoring with Prometheus & Grafana

### Access Grafana

1. Navigate to http://localhost:3000
2. Login: `admin` / `admin`
3. Add dashboard with these queries:

```promql
# Request rate (requests per second)
rate(requests_total{service="api-service"}[1m])

# Error rate (errors per second)
rate(requests_failed_total[1m])

# Latency (p99)
histogram_quantile(0.99, request_duration_buckets)

# Service health (1 = healthy, 0 = unhealthy)
service_info
```

### Key Prometheus Queries

```promql
# Total requests by service
requests_total{service=~".*-service"}

# Failed requests by service
requests_failed_total{service=~".*-service"}

# High latency requests
requests_latency_high_total

# Error rates by type
errors_5xx_total + errors_503_total + errors_504_total

# Database pool utilization
(1 - (db_pool_available / 10)) * 100

# Memory usage
memory_usage_bytes

# Response time
response_time_ms
```

## 🧪 Using with AIRA

### When AIRA is running:

1. **Start AIRA server** (in backend directory):
   ```bash
   npm start
   ```

2. **Feed incidents to AIRA** from the failing infrastructure:
   ```bash
   # Example: Payment service is crashing
   curl -X POST http://localhost:5000/api/incidents \
     -H "Content-Type: application/json" \
     -d '{
       "timestamp": '$(date +%s)',
       "severity": "high",
       "service": "payment-service",
       "errorRate": 95,
       "latency": 5000,
       "message": "Payment service crashing with 100% error rate"
     }'
   ```

3. **AIRA Decision Output**:
   - Generates decision trace with reasoning
   - Proposes action (restart, circuit break, scale)
   - Shows confidence score
   - Can execute (if approval granted) or suggest only

## 🌳 File Structure

```
infra-simulation/
├── docker-compose.yml          # Orchestration config
├── prometheus.yml              # Prometheus scrape config
├── grafana-datasources.yml     # Grafana datasource config
├── README.md                   # This file
└── services/
    ├── failure-injector.js     # Fault injection framework
    ├── metrics-handler.js       # Prometheus metrics exporter
    ├── api-service.js           # API Gateway
    ├── payment-service.js       # Payment processing
    ├── db-service.js            # Database simulation
    └── cache-service.js         # Cache with LRU & TTL
```

## 🔍 Service Details

### API Service (Gateway)
- **Port**: 3001
- **Endpoints**:
  - `GET /health` - Health check
  - `GET /metrics` - Prometheus metrics
  - `POST /api/payment` - Process payment
  - `GET /api/user/:userId` - Get user data
  - `POST /api/order` - Create order (cascading)
  - `GET /api/status` - System status
  - `POST /admin/failure` - Inject failures

### Payment Service
- **Port**: 3002
- **Endpoints**:
  - `GET /health` - Health check
  - `POST /process` - Process payment
  - `GET /verify/:transactionId` - Verify payment
  - `POST /refund` - Refund payment
  - `POST /admin/failure` - Inject failures

### Database Service
- **Port**: 3003
- **Features**: Connection pooling, query simulation
- **Endpoints**:
  - `GET /health` - Health check
  - `GET /fetch` - Execute query
  - `POST /insert` - Insert data
  - `PUT /update` - Update data
  - `GET /pool/status` - Pool statistics
  - `POST /admin/failure` - Inject failures

### Cache Service
- **Port**: 3004
- **Features**: LRU cache with TTL, automatic expiration
- **Endpoints**:
  - `GET /health` - Health check
  - `GET /get` - Get cache value
  - `POST /set` - Set cache value
  - `DELETE /delete` - Delete cache entry
  - `POST /clear` - Clear cache
  - `GET /stats` - Cache statistics
  - `POST /admin/failure` - Inject failures

## 🛑 Stopping Services

```bash
# Stop all services
docker-compose -f docker-compose.yml down

# Stop and remove volumes (clean slate)
docker-compose -f docker-compose.yml down -v

# View logs
docker-compose -f docker-compose.yml logs -f api-service
```

## 🐛 Troubleshooting

### Services won't start
```bash
# Check Docker is running
docker ps

# View service logs
docker-compose logs api-service

# Rebuild images if needed
docker-compose build --no-cache
```

### Prometheus not collecting metrics
- Ensure services are healthy: `curl http://localhost:3001/api/status`
- Check Prometheus targets: http://localhost:9090/targets
- Metrics endpoint must be accessible

### Can't connect to services from AIRA
- Verify network: `docker network ls`
- Check service DNS: `docker-compose exec api-service ping payment-service`
- Confirm port mappings: `docker port api-service`

## 📚 Related Documentation

- See [../README.md](../README.md) - Main AIRA documentation
- See [../ARCHITECTURE.md](../ARCHITECTURE.md) - AIRA architecture
- See [../QUICK-START.md](../QUICK-START.md) - Quick start guide

## 🎯 Next Steps

After testing with Phase 1 infrastructure:

1. **Phase 2**: Add policy validation and dry-run mode
2. **Phase 3**: Track action effectiveness with before/after metrics
3. **Phase 4**: Implement adaptive confidence weights
4. **Phase 5**: Add Slack & webhook integrations
5. **Phase 6**: Create Kubernetes deployment manifests
