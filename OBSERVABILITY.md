# Observability Infrastructure Guide

**Version**: 2.2 | **Last Updated**: March 31, 2026 | **Status**: ✅ Complete & Validated

## Overview

The AIRA system includes a comprehensive observability pipeline that enables complete tracing of incidents from detection through resolution. This unified guide covers quick start, implementation, and validation.

### What's Observed?
- **Structured Logs** - JSON logs with correlation IDs flowing through the system
- **Prometheus Metrics** - 20+ metrics for decision/action/policy performance  
- **Audit Trail** - Immutable event records with tamper detection
- **End-to-End Traces** - Navigate from incident → logs → metrics → audit

---

## Architecture: Observability Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCIDENT OCCURS                              │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼──────────────────────┐
        ▼             ▼                      ▼
    ┌────────┐  ┌──────────┐          ┌──────────┐
    │ Logs   │  │ Metrics  │          │ Audit    │
    │        │  │          │          │ Trail    │
    │ Struct │  │/metrics  │          │MongoDB   │
    │ JSON   │  │Prometheus│          │Immutable │
    └────────┘  └──────────┘          └──────────┘
        │             │                     │
        └─────────────┼─────────────────────┘
                      │
                      ▼
    ┌──────────────────────────────────────┐
    │  ALERTING & OBSERVABILITY TOOLS      │
    │  - Datadog/Prometheus scrape         │
    │  - Error rate triggers               │
    │  - Escalation rate triggers          │
    │  - Kill switch status                │
    └──────────────────────────────────────┘
```

---

## Quick Start (5 minutes)

### 1. Start the Server

```bash
cd backend
npm install
npm start
```

Server runs on `http://localhost:5000`

### 2. Check Observability Health

```bash
npm run check:observability
```

Expected Output:
```
✅ [PASS] Metrics Endpoint: Format
✅ [PASS] Metrics Endpoint: Core Metrics
✅ [PASS] Health Endpoint: Response
✅ [PASS] Audit Trail: Model
```

### 3. Validate Full Pipeline

```bash
npm run validate:observability
```

Expected Output:
```
✓ LOGGING: 6 passed, 0 failed (100%)
✓ METRICS: 8 passed, 0 failed (100%)
✓ AUDIT TRAIL: 4 passed, 0 failed (100%)
```

---

## Implementation Details

### Phase 1: Structured Logging ✅

**Components**:
- `StructuredLogger` class - Context-aware logging with automatic field injection
- `LoggingService` - Winston configuration with file rotation
- JSON format with correlation IDs for distributed tracing

**Features**:
- ✅ Automatic correlation ID injection
- ✅ Tenant isolation per log entry
- ✅ Sensitive data filtering
- ✅ Async context stack for distributed tracing
- ✅ File rotation (5MB per file, 10 file limit)

**Log Files**:
- `backend/logs/combined.log` - All logs
- `backend/logs/error.log` - Error-level logs only

### Phase 2: Prometheus Metrics ✅

**Metrics Exposed** (20+):
- **Decision Pipeline**: decision_latency_ms, decision_confidence, queue_depth_total, dlq_size_total
- **Actions**: action_executions_total, action_latency_ms, action_success_rate
- **Policy**: policy_evaluations_total, policy_latency_ms, policy_violations_total
- **Idempotency**: idempotency_hits_total, idempotency_misses_total
- **Circuit Breaker**: circuit_breaker_state, circuit_breaker_trips_total
- **Memory**: memory_patterns_count, decision_traces_count, audit_events_count
- **Errors**: errors_total, retries_total, timeouts_total
- **Node.js**: process_cpu_seconds_total, nodejs_heap_size_bytes

**Access**:
```bash
# Get Prometheus metrics (Prometheus format)
curl http://localhost:5000/metrics

# Example output:
# HELP decision_latency_ms Decision pipeline latency
# TYPE decision_latency_ms histogram
# decision_latency_ms_bucket{le="50"} 15
# decision_latency_ms_bucket{le="100"} 28
# decision_latency_ms_bucket{le="500"} 32
```

### Phase 3: Audit Trail ✅

**Storage**: MongoDB with immutable append-only collection  
**Retention**: TTL-based (default 90 days)  
**Fields**:
- timestamp, correlationId, tenantId, userId
- action, resource, changesBefore, changesAfter
- ipAddress, userAgent, outcome, reason

**Retrieval**:
```bash
# Query MongoDB directly
mongosh
> use decision_engine
> db.auditevents.findOne()
{ _id: ObjectId(...), timestamp: ISODate(...), correlationId: "...", ... }
```

---

## Validation Guidelines

### Test Coverage

The observability pipeline is validated through 18+ integration tests:

**Logging Tests**:
- ✅ Correlation ID propagation through incident lifecycle
- ✅ Structured JSON log format validation
- ✅ Sensitive data filtering
- ✅ Error log capture

**Metrics Tests**:
- ✅ Prometheus format validation
- ✅ Core metrics present and labeled
- ✅ Metric values reasonable
- ✅ Histogram buckets correct

**Audit Tests**:
- ✅ Event recording on decision/action
- ✅ Immutability constraints
- ✅ TTL cleanup working
- ✅ Correlation ID tracking

### Run Validation Tests

```bash
npm run test:observability

# Expected: 18 tests, all passing ✅
```

---

## Common Operations

### View Recent Logs

```bash
# Last 100 lines of combined log
tail -n 100 backend/logs/combined.log | jq .

# Error logs only
tail backend/logs/error.log
```

### Query Audit Trail

```bash
# Recent decisions for tenant
mongosh
> db.auditevents.find({
    tenantId: "tenant-1",
    action: "DECISION_MADE"
  }).sort({timestamp: -1}).limit(10)

# Count events by action
> db.auditevents.aggregate([
    {$group: {_id: "$action", count: {$sum: 1}}}
  ])
```

### Prometheus Integration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'aira'
    static_configs:
      - targets: ['localhost:5000']
    metrics_path: '/metrics'
```

---

## Troubleshooting

### Missing Logs
- Check `backend/logs/` directory exists
- Verify NODE_ENV=development in .env
- Ensure `loggingService.js` is initialized in server startup

### Metrics Not Showing
- Confirm `/metrics` endpoint returns valid Prometheus format
- Check `metricsService` is registered in infrastructure services
- Verify `npm run check:observability` passes

### Audit Events Not Recording
- Verify MongoDB connection active: `npm run db:health`
- Check TTL indexes created: `mongosh > db.getMongo().getDB('decision_engine').getCollectionNames()`
- Ensure `auditService` initialized in decision pipeline

---

## Integration Points

**Where observability is triggered**:
1. **Request Entry**: Correlation ID generated in middleware
2. **Analysis**: Signals logged with context and metrics recorded
3. **Decision**: Policy evaluation metrics, decision trace audit event
4. **Action**: Action execution metrics, audit trail completion
5. **Response**: Full trace logged, metrics finalized

---

## Next Steps

For production deployments, integrate with:
- **Datadog**: Ship logs/metrics via Datadog agent
- **Prometheus + Grafana**: Pull metrics, create dashboards
- **ELK Stack**: Centralize logs, build alerting rules
- **Alertmanager**: Route audit events to incident management
✓ AUDIT:   5 passed, 0 failed (100%)
✓ E2E:     4 passed, 0 failed (100%)
✓ ALERTS:  5 passed, 0 failed (100%)
```

### 4. Run Full Test Suite

```bash
npm run test:observability
```

This runs 78 comprehensive tests covering:
- Structured logging with correlation IDs
- Prometheus metrics validation
- Audit trail integrity
- End-to-end tracing
- Alert rule validation

---

## Testing Specific Phases

### Test Logging Pipeline (1.5 hours)
```bash
npm run test:observability:logging
```

**Validates**:
- Correlation ID propagates through incident lifecycle
- All logs include tenantId, component, timestamp
- Sensitive data is filtered
- Log files rotate properly

**Pass Criteria**:
- ✅ Every log includes `correlationId`
- ✅ Logs are valid JSON
- ✅ File `backend/logs/combined.log` exists
- ✅ Error logs separate to `backend/logs/error.log`

### Test Metrics Endpoint (2 hours)
```bash
npm run test:observability:metrics
```

**Validates**:
- `/metrics` endpoint returns 200 status
- All 20+ Prometheus metrics present
- Metrics have correct labels (tenantId, actionType, etc.)
- Counters are monotonic, gauges reflect state
- Histograms have proper bucket distribution

**Pass Criteria**:
- ✅ `curl http://localhost:5000/metrics` returns 200
- ✅ Response includes decision_latency_ms, action_executions_total, etc.
- ✅ Each metric has proper labels

### Test Audit Trail (2 hours)
```bash
npm run test:observability:audit
```

**Validates**:
- Decisions recorded to AuditEvent collection
- Events have valid HMAC-SHA256 signatures
- Chain-of-custody maintained (previousEventHash)
- Tampered events detected
- TTL index configured for cleanup
- Efficient queries by tenant/time/correlation

**Pass Criteria**:
- ✅ Audit events recorded to MongoDB
- ✅ Signatures validate (no tampering)
- ✅ TTL index exists (expires after 2 years)
- ✅ Queries complete in <50ms on 100k+ events

### Test End-to-End Tracing (3 hours)
```bash
npm run test:observability:e2e
```

**Validates**:
- Single correlation ID traces full incident lifecycle
- All stages (detection, policy, action) recorded
- Logs, metrics, and audit trail synchronized
- Async operations maintain context
- No gaps in trace

**Pass Criteria**:
- ✅ Same correlationId in logs, metrics, and audit
- ✅ All 3+ stages present for each incident
- ✅ Timestamps are synchronized

### Test Alert Validation (1.5 hours)
```bash
npm run test:observability:alerts
```

**Validates**:
- Escalation rate alert (>20%) triggers correctly
- Error rate alert (>50%) triggers correctly
- Kill switch status reflected in metrics
- Alert rules are queryable

**Pass Criteria**:
- ✅ Alert rules defined for escalation, errors, kill switch
- ✅ Metrics recorded for alert conditions
- ✅ Rules ready for Datadog/Prometheus scrape

---

## Viewing Observability Data

### View Logs in Real-Time

```bash
tail -f backend/logs/combined.log | jq .
```

Output shows JSON logs:
```json
{
  "timestamp": "2026-03-31T10:15:23.456Z",
  "level": "INFO",
  "correlationId": "incident-123",
  "tenantId": "acme-corp",
  "component": "decision-agent",
  "message": "Making decision",
  "context": {
    "verdict": "EXECUTE_ACTION",
    "action": "RESTART_SERVICE",
    "confidence": 0.95
  }
}
```

### View Prometheus Metrics

```bash
curl http://localhost:5000/metrics | head -30
```

Output:
```
# HELP decision_latency_ms Decision processing latency in milliseconds
# TYPE decision_latency_ms histogram
decision_latency_ms_bucket{tenantId="acme-corp",severity="HIGH",status="success",le="50"} 0
decision_latency_ms_bucket{tenantId="acme-corp",severity="HIGH",status="success",le="100"} 5
decision_latency_ms_bucket{tenantId="acme-corp",severity="HIGH",status="success",le="250"} 12
decision_latency_ms_bucket{tenantId="acme-corp",severity="HIGH",status="success",le="500"} 18
```

### Query Audit Trail

```javascript
// In MongoDB shell
db.auditevents.find({ 
  tenantId: "acme-corp",
  correlationId: "incident-123"
}).sort({ timestamp: 1 })
```

Output shows complete incident trace:
```javascript
[
  {
    eventId: "event-1",
    eventType: "decision_made",
    payload: { verdict: "EXECUTE_ACTION", action: "RESTART_SERVICE" },
    signature: "...",
    previousEventHash: null,
    status: "verified"
  },
  {
    eventId: "event-2",
    eventType: "action_executed",
    payload: { status: "success", duration: 45000 },
    signature: "...",
    previousEventHash: "...",
    status: "verified"
  }
]
```

---

## Generate Sample Data

To populate observability data for testing/demonstration:

```bash
# Generate 20 realistic incidents
npm run generate:samples -- --count=20 --tenant=demo-tenant

# View generated samples
cat backend/logs/samples-*.log | jq .
```

This creates:
- 20 complete incident lifecycles
- 80+ structured log entries
- 20+ audit trail events
- Metrics recordings

---

## Integration with External Tools

### Datadog Integration

Configure Datadog agent to scrape metrics:

```yaml
# datadog.yaml
instances:
  - prometheus_url: http://localhost:5000/metrics
    namespace: incident_recovery
    metrics:
      - decision_latency_ms
      - action_executions_total
      - errors_total
      - circuit_breaker_state
```

### Prometheus Integration

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'incident-engine'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:5000']
    metrics_path: '/metrics'
```

### Grafana Dashboard

Create dashboard with:

```
- Decision Latency (avg, p95, p99)
- Action Success Rate
- Error Rate by Component
- Escalation Rate
- Queue Depth
- Circuit Breaker State
```

---

## Debugging Observability Issues

### Problem: No logs appearing

**Check**:
```bash
# Verify logs directory exists
ls -la backend/logs/

# Check file permissions
ls -l backend/logs/combined.log

# View recent logs
tail -20 backend/logs/combined.log
```

**Fix**:
```bash
# Create logs directory if missing
mkdir -p backend/logs

# Set permissions
chmod 755 backend/logs
```

---

### Problem: Metrics endpoint returns 404

**Check**:
```bash
curl -i http://localhost:5000/metrics
```

**Fix**: Verify metricsService imported in server.js:
```javascript
const { metricsService } = require('./services/infrastructure');

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(metricsService.getMetrics());
});
```

---

### Problem: Audit events not being recorded

**Check**:
```bash
# Verify MongoDB connection
mongo <connection-string> --eval "db.auditevents.count()"

# Check for recent events
db.auditevents.find().sort({ timestamp: -1 }).limit(5)
```

**Fix**: Ensure AuditService.recordEvent called at decision/action points:
```javascript
const event = await AuditService.recordEvent(
  tenantId,
  'decision_made',
  { verdict: 'EXECUTE_ACTION' },
  { correlationId }
);
```

---

### Problem: Trace has gaps (missing logs/audit)

**Check**: All stages logged with same correlationId:
```bash
# Check logs have correlationId
grep "incident-123" backend/logs/combined.log | jq .correlationId

# Check audit events
db.auditevents.find({ correlationId: "incident-123" })
```

**Fix**: Ensure logging at all decision pipeline stages:
```javascript
// 1. Incident detection
structuredLogger.info('Incident detected', correlationId)

// 2. Policy evaluation  
structuredLogger.info('Evaluating policy', correlationId)

// 3. Action execution
structuredLogger.info('Executing action', correlationId)
```

---

## Performance Tuning

### Logging Performance
```javascript
// Reduce file I/O by increasing batch size
const loggingService = new LoggingService({
  batchSize: 1000,
  flushInterval: 5000,
});
```

### Metrics Performance
```javascript
// Scrape metrics less frequently if needed
// (Default: 15s interval)
// Consider scrape_interval in Prometheus config
```

### Audit Trail Performance
```javascript
// Index queries by tenant and timestamp
auditEventSchema.index({ tenantId: 1, timestamp: -1 });
// This makes queries O(log n) instead of O(n)
```

---

## Alert Rules Ready for Production

The system defines three alert rules ready to deploy:

### 1. High Escalation Rate
```yaml
alert: HighEscalationRate
expr: (escalation_count / total_actions) > 0.2
for: 5m
severity: MEDIUM
action: Investigate why > 20% of actions are escalated to human
```

### 2. High Error Rate
```yaml
alert: HighErrorRate
expr: (error_count / (error_count + success_count)) > 0.5
for: 5m
severity: HIGH
action: Investigate failure in decision/action pipeline
```

### 3. Kill Switch Active
```yaml
alert: KillSwitchActivated
expr: circuit_breaker_state > 0
for: 0m
severity: CRITICAL
action: Kill switch is active - manual intervention required
```

---

## Validation Checklist

Use this to verify observability is working:

- [ ] **Logging**
  - [ ] `backend/logs/combined.log` exists and has entries
  - [ ] `backend/logs/error.log` has error entries only
  - [ ] Logs are valid JSON
  - [ ] Each log includes `correlationId`, `tenantId`, `timestamp`

- [ ] **Metrics**
  - [ ] `curl http://localhost:5000/metrics` returns 200
  - [ ] Response includes 20+ metric definitions
  - [ ] Core metrics present: decision_latency_ms, action_executions_total, errors_total
  - [ ] Each metric has labels (tenantId, actionType, etc.)

- [ ] **Audit Trail**
  - [ ] `db.auditevents.count()` > 0
  - [ ] Events have valid signatures
  - [ ] TTL index configured
  - [ ] Queries by correlationId are fast (<50ms)

- [ ] **End-to-End Tracing**
  - [ ] Same correlationId in logs, metrics, audit
  - [ ] All pipeline stages logged for incident
  - [ ] No gaps or missing data
  - [ ] Timestamps synchronized

- [ ] **Alerts**
  - [ ] Alert rules defined
  - [ ] Can query alert metrics
  - [ ] Rules ready for Datadog/Prometheus

---

## Resources

- [OBSERVABILITY-VALIDATION-GUIDE.md](../OBSERVABILITY-VALIDATION-GUIDE.md) - Detailed validation guide
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [API.md](../API.md) - API endpoints including `/metrics` and `/health`

---

## Support

For issues or questions about observability:

1. **Check logs**: `tail -f backend/logs/combined.log | jq .`
2. **Validate pipeline**: `npm run validate:observability`
3. **Check health**: `npm run check:observability --verbose`
4. **Generate samples**: `npm run generate:samples`
5. **Review tests**: `npm run test:observability`

---

**Last Updated**: March 31, 2026  
**Status**: Production-Ready  
**Priority**: P1 (Debugging Aid)
