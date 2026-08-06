# AIRA Operations 
 
*Consolidated from: OPERATIONS.md, OBSERVABILITY.md, TROUBLESHOOTING.md, QUICK-REFERENCE.md* 
 
--- 
 
# OPERATIONS GUIDE

**Version**: 2.2  
**Last Updated**: March 30, 2026  
**Audience**: SRE, DevOps, On-Call Engineers, Incident Commanders

---

## TABLE OF CONTENTS

1. [System Overview](#system-overview)
2. [Health & Monitoring](#health--monitoring)
3. [Incident Types & Response](#incident-types--response)
4. [Common Issues & Remediation](#common-issues--remediation)
5. [Alert Thresholds](#alert-thresholds)
6. [Redis Failure Recovery](#redis-failure-recovery)
7. [Circuit Breaker Management](#circuit-breaker-management)
8. [Disaster Recovery](#disaster-recovery)
9. [Escalation Procedures](#escalation-procedures)

---

## SYSTEM OVERVIEW

### Architecture

The system is a **three-agent pipeline** that processes incident signals and makes safe remediation decisions:

```
Observability Input
    ↓
[Analysis Agent] → Pattern detection, anomaly scoring
    ↓
[Decision Agent] → Policy matching, confidence calculation
    ↓
[Action Agent] → Risk assessment, safety gates, execution
    ↓
Decision Trace + Action Output
```

**Technology Stack**:
- **Message Queue**: RabbitMQ with Dead Letter Queue (DLQ)
- **Database**: MongoDB with 15+ models for audit trails
- **Distributed Coordination**: Redis for multi-instance safety
- **Observability**: Structured JSON logging + Prometheus metrics
- **Policies**: YAML-based, versioned per tenant

### Critical Safety Properties

✅ **Policy Versioning**: Every decision stores exact policy version used (reproducible, auditable)  
✅ **Backpressure Enforcement**: Returns HTTP 503 when queue full (prevents silent message loss)  
✅ **SAFE_MODE Detection**: Multi-instance + Redis down = block action execution (prevents split-brain)  
✅ **Retry Circuit Breaker**: Stops retries at >80% failure rate (prevents poison pills)  
✅ **Idempotency Locks**: Distributed, atomic checks with 120-second TTL (prevents duplicate actions)  
✅ **Memory Cleanup**: Automatic purge of old incident data (prevents unbounded growth)

---

## HEALTH & MONITORING

### Health Check Endpoints

#### Basic Health (Fast)
```bash
curl http://localhost:5000/health

# Response:
# {
#   "status": "ok|degraded",
#   "timestamp": "2026-03-30T10:15:00.000Z",
#   "safeMode": false,
#   "redis": { "connected": true },
#   "warnings": []
# }
```

**Status Codes**:
- `200 OK` → System healthy
- `503 Service Unavailable` → System in SAFE_MODE (Redis down, multi-instance deployment)

#### Detailed Health (Diagnostics)
```bash
curl http://localhost:5000/health/detailed

# Response includes:
# - deploymentMode: "single|multi-instance"
# - redis: { connected: boolean, failureStartTime: ISO }
# - queue: "connected|disconnected"
# - memoryCleanup: "running|stopped"
# - canExecuteActions: boolean
# - warnings: [list of active issues]
```

### Metrics Endpoint (Prometheus Format)

```bash
curl http://localhost:5000/metrics

# Key metrics to monitor:
# - decision_pipeline_duration_ms (histogram)
# - decisions_by_action_total (counter: log, retry, restart, alert, isolate)
# - queue_dlq_size (gauge)
# - idempotency_lock_conflicts_total (counter)
# - retry_processor_messages_aged_out_total (counter)
```

### Recommended Prometheus Alerts

```yaml
# Alert when queue DLQ is growing
- alert: DLQBacklog
  expr: dlq_size_total > 100
  for: 5m
  action: Investigate queue stalls, check database connections

# Alert when SAFE_MODE is active
- alert: SafeModeActive
  expr: safe_mode == 1
  for: 1m
  action: Redis is down; multi-instance deployment blocked from executing actions

# Alert when retry circuit breaker trips
- alert: RetryCircuitBreakerOpen
  expr: retry_circuit_breaker_state == "open"
  for: 2m
  action: >80% of retries failing; poison pills in queue; check for cascading failures

# Alert when backpressure is active
- alert: BackpressureActive
  expr: backpressure_rejections_total > 50
  for: 5m
  action: Queue full; signal ingestion is being rejected; scale or investigate
```

---

## INCIDENT TYPES & RESPONSE

### Incident Type 1: Service Crash (High Severity)

**Signals**:
- Error rate > 50%
- Response time > 3000ms
- Service is unreachable

**System Decision**: `action: "restart"`  
**Why**: Service is dead, restart is safe remediation

**On-Call Response**:
1. Verify decision trace: `GET /api/v1/decisions/:decisionId`
2. Check why restart occurred: Look at decision trace's `rootCause`
3. Monitor service recovery: Polls `/health` endpoint
4. If restart fails 3x within 5 min: Escalate to incident commander

**Recovery Steps**:
```bash
# View failed actions
curl http://localhost:5000/api/v1/actions?status=failed&limit=10

# Check restart cooldown
curl http://localhost:5000/api/v1/system/cooldown-status

# If needed, manually execute action with elevated permission
curl -X POST http://localhost:5000/api/v1/actions/manual-override \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"actionType": "restart", "serviceId": "web-api", "reason": "manual_override"}'
```

### Incident Type 2: Database Latency (Medium Severity)

**Signals**:
- Response time > 1500ms
- Database query latency > 2000ms
- Cascading timeouts in service

**System Decision**: `action: "retry"` (with escalation if persistent)  
**Why**: Retry-first to let database recover without disruption

**On-Call Response**:
1. Check database metrics (separate monitoring)
2. Look for connection pool exhaustion
3. If latency persists > 10 min: Scale database (increase connections, upgrade instance)
4. Review decision trace: Did system escalate correctly?

**Escalation**:
If decision shows `escalationLevel: "escalated"` + 5+ retries:
```bash
# Escalate to DBA team
curl -X POST http://localhost:5000/api/v1/escalation \
  -H "Authorization: Bearer <OPS_TOKEN>" \
  -d '{"type": "database_latency", "escalationTarget": "dba-team"}'
```

### Incident Type 3: Network Partition / Cascade (Critical)

**Signals**:
- Multiple services degraded simultaneously
- Cascade detection pattern active
- Service dependencies failing

**System Decision**: `action: "isolate"` or `action: "alert"` (depends on scope)  
**Why**: Prevent cascading failures from spreading

**On-Call Response**:
1. **Immediately**: Get decision trace to understand which service to isolate
   ```bash
   curl http://localhost:5000/api/v1/decisions/:decisionId
   # Look for: affectedServices, cascadeDetected, recommendedIsolation
   ```

2. **Verify cascade**: Check service dependency graph
   ```bash
   curl http://localhost:5000/api/v1/incident/:incidentId/cascade-analysis
   ```

3. **If cascading**: Follow action (isolate service)
   ```bash
   curl http://localhost:5000/api/v1/actions/:actionId/execute \
     -H "Authorization: Bearer <CASCADE_RESPONSE_TOKEN>"
   ```

4. **Escalate**: Notify incident commander
   ```bash
   curl -X POST http://localhost:5000/api/v1/escalation \
     -d '{"type": "cascade_detected", "escalationTarget": "incident_commander"}'
   ```

### Incident Type 4: Failure Storm / Load Spike (Critical)

**Signals**:
- Signals arriving at >600/min
- Backpressure rejections > 50%
- Queue depth > 1000

**System Decision**: `action: "alert"` (auto-scaling not supported; escalate to ops)  
**Why**: System can't automatically scale; needs manual intervention

**On-Call Response**:
1. Check if this is legitimate traffic or abuse
   ```bash
   curl http://localhost:5000/api/v1/signal-sources | grep -E "source|rate"
   ```

2. If legitimate: Scale system
   - Add more instances of decision engine
   - Increase RabbitMQ prefetch (if not already maxed)
   - Possibly disable non-critical tenants

3. If abuse: Rate limit or block source
   ```bash
   curl -X POST http://localhost:5000/api/v1/admin/rate-limit \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -d '{"source": "prometheus-webhook", "rateLimit": "100/sec"}'
   ```

---

## COMMON ISSUES & REMEDIATION

### Issue 1: Redis Connection Down

**Symptoms**:
- `safe_mode: true` in health endpoint
- New actions are rejected (`403 Forbidden - SAFE_MODE active`)
- Decision traces show `riskLevel: "max_risk_blocked"`

**Root Cause**:
```
Multi-instance deployment + Redis down 
= Cannot coordinate across instances 
= Prevent split-brain (two instances executing same action)
```

**Remediation**:

1. **Check Redis health**:
   ```bash
   redis-cli ping
   # If no response: Redis is down
   ```

2. **Option A: Restart Redis**:
   ```bash
   docker restart redis
   # Give it 10 seconds to start
   sleep 10
   
   # Verify connection
   curl http://localhost:5000/health
   # Should show: redis.connected=true, safeMode=false
   ```

3. **Option B: If single-instance deployment**:
   - Can optionally continue in degraded mode
   - Actions will execute without distributed coordination
   - Risk: If two instances somehow start, duplicate actions possible
   - Only for non-critical environments

4. **Option C: If multi-instance + Redis unavailable for 1+ hour**:
   - Temporary switch to single-instance mode:
   ```bash
   export DEPLOYMENT_MODE="single-instance"
   restart all decision engine instances
   # Now safe to execute actions without Redis
   ```

5. **Monitor DLQ**: While Redis is unavailable
   ```bash
   # Check if any messages backed up
   curl http://localhost:5000/api/v1/queue/dlq
   # After Redis recovers, messages will be reprocessed
   ```

### Issue 2: Circuit Breaker Tripped (Retry Loop)

**Symptoms**:
- Decisions show `circuitBreakerOpen: true`
- Actions are rejected even for valid incidents
- Error: `Circuit breaker is open - refusing to retry`

**Root Cause**:
```
>80% of retry attempts failing in last 10 minutes
= Likely a permanent error (poison pill) clogging retry queue
```

**Remediation**:

1. **Diagnose**: Check what's being retried
   ```bash
   curl http://localhost:5000/api/v1/queue/retry-queue | head -5
   # Look at failed message types
   ```

2. **Move poison pill to DLQ**:
   ```bash
   # Circuit breaker auto-resets after 5 minutes of success
   # But to clear immediately, find and remove poison pill:
   
   curl -X POST http://localhost:5000/api/v1/admin/move-to-dlq \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -d '{"messageId": "<POISON_PILL_ID>"}'
   ```

3. **Reset circuit breaker**:
   ```bash
   # Only if authorized:
   curl -X POST http://localhost:5000/api/v1/admin/reset-circuit-breaker \
     -H "Authorization: Bearer <ADMIN_TOKEN>"
   
   # Wait 2 minutes and monitor:
   watch -n 5 "curl http://localhost:5000/metrics | grep circuit_breaker"
   ```

4. **Investigate root cause**:
   - Check database connectivity
   - Verify policy definitions are valid
   - Look at MongoDB error logs

### Issue 3: Queue Backed Up (DLQ Growing)

**Symptoms**:
- `dlq_size_total > 100` in metrics
- Health endpoint shows `warnings: ["DLQ backlog detected"]`
- New signals are being rejected

**Root Cause**:
```
Database write stalls OR corrupt messages OR processing parallelism too low
```

**Remediation**:

1. **Check DLQ contents**:
   ```bash
   curl http://localhost:5000/api/v1/queue/dlq?limit=10
   # Look for error patterns
   ```

2. **Identify stalled component**:
   ```bash
   # Check each agent's processing rate
   curl http://localhost:5000/metrics | grep -E "analysis_agent|decision_agent|action_agent"
   
   # Should see:
   # - messages_processed_total increasing
   # - duration_ms histogram with reasonable values
   ```

3. **If analysis agent stalled**:
   - Check for pattern detection algorithm issues
   - Look in logs: `grep "ANALYSIS_AGENT" app.log`
   - Restart analysis agent only:
   ```bash
   # In Kubernetes:
   kubectl rollout restart deployment/decision-engine-analysis
   ```

4. **If database overloaded**:
   - Check MongoDB connections:
   ```bash
   # In MongoDB:
   db.currentOp() | grep inprog
   # Kill long-running queries if needed:
   db.killOp(opid)
   ```
   - Increase prefetch in RabbitMQ consumers

5. **Drain DLQ back to main queue** (after fixing root cause):
   ```bash
   curl -X POST http://localhost:5000/api/v1/admin/requeue-from-dlq \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -d '{"count": 50}'
   # Re-queue 50 messages at a time to prevent re-overwhelming
   ```

### Issue 4: Backpressure Active (Rejections at 503)

**Symptoms**:
- `POST /api/v1/signals` returns `503 Service Unavailable`
- Response body: `{"error": "Queue full, backpressure active"}`
- Many signals arriving per second

**Root Cause**:
```
RabbitMQ queue depth > threshold
= System cannot keep up with inbound signal rate
```

**Remediation**:

1. **Check queue depth**:
   ```bash
   curl http://localhost:5000/metrics | grep queue_depth
   ```

2. **Identify source signal rate**:
   ```bash
   # Get signal sources and their rates
   curl http://localhost:5000/api/v1/signal-analytics | grep -E "source|rate"
   
   # Example: If Prometheus is sending 100 signals/sec:
   # Adjust Prometheus alert rules to be less noise
   ```

3. **Option A: Scale system**
   ```bash
   # Add more decision engine instances
   kubectl scale deployment decision-engine --replicas=5
   
   # Increase RabbitMQ prefetch (if not maxed)
   # In services/infrastructure/index.js:
   # Change: const prefetch = process.env.PREFETCH || 10;
   # To: const prefetch = process.env.PREFETCH || 20;
   ```

4. **Option B: Rate-limit noisy signals**
   ```bash
   # Reduce Prometheus alert frequency
   # Or disable low-priority alerts temporarily
   ```

### Issue 5: Memory Growing Unbounded

**Symptoms**:
- Process memory usage steadily increasing
- Eventually: `FATAL out of memory`
- Old incident records accumulating

**Root Cause**:
```
Memory cleanup job failed or not running
= IncidentMemory, ActionLog growing indefinitely
```

**Remediation**:

1. **Check if cleanup job is running**:
   ```bash
   curl http://localhost:5000/health/detailed
   # Look for: memoryCleanup: "running"
   ```

2. **If stopped, restart it**:
   ```bash
   curl -X POST http://localhost:5000/api/v1/admin/start-cleanup-job \
     -H "Authorization: Bearer <ADMIN_TOKEN>"
   ```

3. **Check cleanup logs**:
   ```bash
   grep "MEMORY_CLEANUP" app.log | tail -50
   # Should see messages like: "Cleaned 500 old incident records"
   ```

4. **If cleanup is running but memory still growing**:
   - Email + increase default memory limits in Docker / K8s
   - Consider archiving old decision traces to separate storage

5. **Manual cleanup** (emergency only):
   ```bash
   # Delete all incident data > 90 days old
   curl -X POST http://localhost:5000/api/v1/admin/purge-old-data \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -d '{"daysOld": 90}'
   ```

---

## ALERT THRESHOLDS

| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| `safe_mode` | = true | **CRITICAL** | Restart Redis or switch to single-instance |
| `dlq_size_total` | > 100 | HIGH | Investigate database/processing stalls |
| `backpressure_active` | = true | HIGH | Scale system or reduce signal rate |
| `circuit_breaker_state` | = "open" | MEDIUM | Check retry logs, remove poison pills |
| `memory_rss_bytes` | > 1GB | MEDIUM | Run cleanup job or increase memory |
| `decision_pipeline_duration_ms` | p99 > 5000 | MEDIUM | Check database latency |
| `queue_depth` | > 500 | LOW | Monitor; escalate if persists |

---

## DISASTER RECOVERY

### Scenario 1: Total System Failure (All Components Down)

**Recovery Steps**:

1. **Start Infrastructure** (in order):
   ```bash
   # 1. Database first
   docker-compose up -d mongodb
   sleep 10
   
   # 2. Message queue
   docker-compose up -d rabbitmq redis
   sleep 10
   
   # 3. Decision engine
   docker-compose up -d decision-engine
   
   # 4. Monitor startup
   watch -n 5 "curl http://localhost:5000/health/detailed"
   ```

2. **Verify Recovery**:
   ```bash
   # All components healthy?
   curl http://localhost:5000/health/detailed | jq '.components'
   
   # Decision traces still present?
   curl http://localhost:5000/api/v1/decisions?limit=1
   ```

3. **Reprocess Queued Signals**:
   - RabbitMQ will auto-requeue messages from queue (persistent by default)
   - DLQ messages won't auto-requeue; must manually requeue:
   ```bash
   curl -X POST http://localhost:5000/api/v1/admin/requeue-from-dlq \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -d '{"count": 100}'
   ```

### Scenario 2: Database Corruption

**Signs**:
- MongoDB refuses to start with errors about indexes or collections
- Queries timeout
- Random "document not found" errors

**Recovery Steps**:

1. **Backup existing data**:
   ```bash
   mongodump --uri="mongodb://localhost:27017/decision_engine" \
     -o /backup/decision_engine_$(date +%s)
   ```

2. **Drop corrupted database** (⚠️ PERMANENT):
   ```bash
   mongo decision_engine --eval "db.dropDatabase()"
   ```

3. **Restart MongoDB**:
   ```bash
   docker-compose restart mongodb
   ```

4. **Reinitialize schema** (decision engine will auto-create on startup):
   ```bash
   docker-compose restart decision-engine
   # Watch logs: "MongoDB schemas initialized"
   ```

5. **Restore from backup** (if needed):
   ```bash
   mongorestore /backup/decision_engine_<timestamp>
   ```

### Scenario 3: RabbitMQ Message Queue Corruption

**Signs**:
- RabbitMQ won't start
- "Corrupted message store" errors
- Queue data appears corrupted

**Recovery**:

```bash
# 1. Backup mnesia (RabbitMQ's internal store)
cp -r $(docker exec rabbitmq printenv RABBITMQ_MNESIA_DIR) \
  /backup/rabbitmq_$(date +%s)

# 2. Purge RabbitMQ
docker-compose down rabbitmq
docker volume rm <rabbitmq_volume_name>
docker-compose up -d rabbitmq

# 3. Recreate queue
curl -X POST http://localhost:5000/api/v1/admin/recreate-queue \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# 4. Messages in transit are lost; monitor system for gaps
```

---

## ESCALATION PROCEDURES

### Escalation Matrix

| Scenario | Initial Action | Escalate After | Escalate To |
|----------|---|---|---|
| Service Restart Failed (1x) | Monitor | 3x failures in 5 min | Incident Commander |
| Redis Down | Restart Redis | 5 min if still down | Infrastructure Team |
| Database Latency > 10s | Page DBA | 15 min | VP Engineering |
| Cascade Detected (System Response) | A Alert ops | System cannot isolate | Incident Commander |
| Backpressure >5 min | Scale system | Cannot scale | VP Engineering |
| Circuit Breaker Open | Investigate retry | Cannot recover | Service Ownership Team |

### Escalation Workflow

```bash
# 1. Page on-call engineer
curl -X POST http://localhost:5000/api/v1/escalation \
  -H "Authorization: Bearer <ESCALATION_TOKEN>" \
  -d '{
    "severity": "critical",
    "type": "cascade_failure",
    "escalationLevel": 1,
    "teams": ["incident_commander", "sre_oncall"]
  }'

# 2. Decision commander can override decisions if needed
curl -X POST http://localhost:5000/api/v1/decisions/:decisionId/override \
  -H "Authorization: Bearer <INCIDENT_COMMANDER_TOKEN>" \
  -d '{
    "newDecision": "isolate_service",
    "reason": "Incident commander override during cascade"
  }'

# 3. Post-action: Create incident record for retrospective
curl -X POST http://localhost:5000/api/v1/incidents \
  -H "Authorization: Bearer <INCIDENT_COMMANDER_TOKEN>" \
  -d '{
    "title": "Cascade failure - Service X → Y → Z",
    "startTime": "2026-03-30T14:25:00Z",
    "resolvedTime": "2026-03-30T14:47:00Z",
    "decisions": [":decisionId1", ":decisionId2"],
    "retrospectiveNeeded": true
  }'
```

---

## Contact & Escalation

**Decision Engine Team**: @decision-engine-team  
**On-Call Rotation**: See PagerDuty  
**SRE Escalation**: @sre-team  
**Infrastructure Issues**: Reach @infra-team  

For questions: See docs in [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), or [API.md](API.md)
 
--- 
 
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
 
--- 
 
# AIRA System - Troubleshooting Guide

**Version**: 1.0  
**Last Updated**: April 1, 2026  
**Audience**: Support Engineers, SREs, Operations Team

---

## Quick Troubleshooting Flowchart

```
System Issue Detected
│
├─ ❌ System Unresponsive?
│  └─ Go to: [System Unresponsiveness](#system-unresponsive-and-not-processing-incidents)
│
├─ ⚠️ High Incident Escalation Rate (>30%)?
│  └─ Go to: [Escalation Rate](#high-incident-escalation-rate-30)
│
├─ ⚠️ Performance Degradation?
│  └─ Go to: [Performance Issues](#performance-degradation-high-latency)
│
├─ ❌ Database Errors?
│  └─ Go to: [Database Issues](#database-unavailable-or-slow-queries)
│
├─ ❌ Message Queue Issues?
│  └─ Go to: [Queue Saturation](#message-queue-saturation-dlq-growth)
│
├─ 🧠 Learning System Making Wrong Decisions?
│  └─ Go to: [Learning System](#confidence-service-wrong-action-selection)
│
└─ 🔍 Can't Find Issue?
   └─ Go to: [Common Error Codes](#common-error-codes-and-solutions)
```

---

## CRITICAL ISSUES

### System Unresponsive & Not Processing Incidents

**Symptoms**:
- `/health` endpoint does not respond or timeout
- No decisions being made
- Queue depth keeps growing
- Agents not picking up messages

**Diagnosis**:
```bash
# 1. Check system health
curl -v http://localhost:5000/health
# Expected: 200 OK with status="ok"
# If: 503 Service Unavailable → System in SAFE_MODE (see below)

# 2. Check detailed health
curl http://localhost:5000/health/detailed
# Look for: safeMode, redis.connected, queue.connected, canExecuteActions

# 3. Check if Redis is accessible
redis-cli ping
# Expected: PONG

# 4. Check if MongoDB is accessible
mongo --eval "db.adminCommand('ping')" --quiet
# Expected: { "ok" : 1 }

# 5. Check RabbitMQ connectivity
rabbitmqctl status | grep -i "running"
```

**Root Causes & Fixes**:

| Symptom | Cause | Fix |
|---------|-------|-----|
| SAFE_MODE active (multi-instance) | Redis unavailable | [Redis Recovery](#redis-failure-recovery) |
| Queue not connected | RabbitMQ down | Restart RabbitMQ service |
| `/health` timeout | Memory leak or CPU maxed | [Memory Issues](#memory-leak-detection) |
| All agents idle | No messages in queue | Verify incident generation upstream |
| safeMode=false but can't execute | Redis cluster issue | Check Redis replication status |

**Emergency Response** (30-second action):
```bash
# 1. Check SAFE_MODE status
curl http://localhost:5000/health/detailed | jq '.safeMode'

# 2. If SAFE_MODE is TRUE, you CANNOT execute actions. Options:
#    a) Restore Redis immediately (best)
#    b) Switch to single-instance mode if multi-instance
#    c) Failover to backup instance

# 3. Force reconnection attempt
curl -X POST http://localhost:5000/admin/reconnect-services

# 4. Monitor queue depth
curl http://localhost:5000/metrics | grep queue_depth_messages
```

---

### High Incident Escalation Rate (>30%)

**Symptoms**:
- Alerts show escalation_rate_percent > 30%
- Many decisions require manual approval
- policy_confidence histogram skewed low
- Decision logs show low confidence scores

**Diagnosis**:
```bash
# 1. Check escalation rate metric
curl http://localhost:5000/metrics | grep escalation_total

# 2. Check confidence distribution
curl http://localhost:5000/metrics | grep decision_confidence | head -20

# 3. Check incident detection logs
tail -f logs/incidents.log | grep -i confidence

# 4. Check policy version in use
curl http://localhost:5000/admin/policy-status | jq '.policies'

# 5. Check if ANY rule is matching
mongo --eval "db.DecisionTrace.aggregate([
  { \$group: { _id: '\$reasoning.matchedRule', count: { \$sum: 1 } } }
]).pretty()"
```

**Common Causes & Fixes**:

| Cause | Evidence | Fix |
|-------|----------|-----|
| Policy rules too strict | No rule matches | Review and loosen policy conditions |
| Confidence thresholds too high | confidence < 0.5 | Lower klass_weights or escalation threshold |
| Incident patterns not recognized | Pattern ID = "unknown" | Check if incident is new pattern (train system) |
| Historical data missing | successRate = 0 | System needs more examples |
| Service dependencies incorrect | policy condition mismatch | Update service_dependencies.json |

**Fix Process** (Confidence Service Tuning):
```bash
# 1. Identify low-confidence patterns
mongo --eval "db.DecisionTrace.find(
  { 'reasoning.confidence': { \$lt: 0.5 } },
  { _id: 0, 'inputs.incidentMemory.pattern': 1, 'reasoning.confidence': 1 }
).limit(10).pretty()"

# 2. Check if pattern has historical data
mongo --eval "db.IncidentMemory.find(
  { pattern: 'network-timeout' }
).pretty()"

# 3. If pattern is new, it needs training data. Options:
#    a) Run chaos tests to generate data
#    b) Feed historical incident data via learning API
#    c) Manually increase confidence_minimum in config for specific pattern

# 4. Validate fix
curl http://localhost:5000/metrics | grep escalation
# Should trend down within 30 minutes
```

---

### Performance Degradation - High Latency

**Symptoms**:
- decision_latency_ms p99 > 5s (alert fires)
- HTTP requests timeout
- Slow database queries in logs

**Diagnosis**:
```bash
# 1. Check current latency
curl http://localhost:5000/metrics | \
  grep -E 'decision_latency|action_latency' | \
  grep '_bucket{le="5000"}' | tail -1

# 2. Check database query performance
mongo --eval "db.system.profile.find().limit(5).pretty()"
# Or enable profiling first:
mongo --eval "db.setProfilingLevel(1)"

# 3. Check CPU and memory usage
ps aux | grep node
# Look for CPU%, MEM%

# 4. Check queue depth (backing up?)
curl http://localhost:5000/metrics | grep queue_depth

# 5. Check slow MongoDB queries
mongo --eval "db.system.profile.aggregate([{
  \$group: { _id: '\$ns', count: { \$sum: 1 }, avgMillis: { \$avg: '\$millis' } }
}]).sort({avgMillis: -1}).pretty()"
```

**Common Causes & Quick Fixes**:

| Cause | Fix |
|-------|-----|
| Policy engine traversing large decision tree | Simplify policy rules or add indexes |
| Database connections maxed out | Increase pool_size in .env |
| Memory usage high (>1GB) | Check for memory leaks (node heap snapshot) |
| Queue is backed up | Increase number of action agent workers |
| MongoDB slow queries | Add index: `db.DecisionTrace.createIndex({tenantId:1, timestamp:-1})` |

**Performance Recovery** (Immediate Actions):
```bash
# 1. Scale action agents if queue backed up
# Increase CONSUMER_CONCURRENCY in .env (default 5, try 10-20)

# 2. Clear cache if confidence service sluggish
curl -X POST http://localhost:5000/admin/clear-caches

# 3. Optimize MongoDB indexes if queries slow
mongo --eval "db.DecisionTrace.createIndex({tenantId:1, timestamp:-1})"
mongo --eval "db.AuditEvent.createIndex({tenantId:1, timestamp:-1})"
mongo --eval "db.IncidentMemory.createIndex({tenantId:1, patternId:1})"

# 4. Monitor improvement
watch -n 5 'curl -s http://localhost:5000/metrics | grep decision_latency'
```

---

### Database Unavailable or Slow Queries

**Symptoms**:
- MongoDB connection timeout errors
- Query response time > 1s
- ECONNREFUSED on mongoose operations
- Data not persisting to MongoDB

**Diagnosis**:
```bash
# 1. Test MongoDB connectivity
mongo --eval "db.adminCommand('ping')" --quiet

# 2. Check connection pool status
mongo --eval "db.serverStatus().connections"
# Output should show: current, available, totalCreated

# 3. Check slow query logs
mongo --eval "db.system.profile.find({millis:{\$gt:1000}}).pretty()"

# 4. Check indexes
mongo --eval "db.DecisionTrace.getIndexes()"

# 5. Check replication status (if replica set)
mongo --eval "rs.status()" 2>/dev/null || echo "Not a replica set"
```

**Common Causes & Fixes**:

| Issue | Evidence | Fix |
|-------|----------|-----|
| MongoDB not running | ECONNREFUSED | `systemctl start mongod` |
| Connection pool exhausted | "all pool members offline" | Increase MONGODB_POOL_SIZE |
| Slow query (no index) | oplog shows slow op | Create index or optimize query |
| Disk space full | "not enough space" | Clean up old logs: `db.AuditEvent.deleteMany({timestamp: {$lt: ISODate("2026-03-01")}})` |
| Replica set unhealthy | Secondary DOWN | Run `rs.reconfig()` or failover |

**Recovery Steps**:
```bash
# 1. If local disk full, expire old data
mongo --eval "db.AuditEvent.deleteMany({timestamp: {
  \$lt: ISODate(new Date(Date.now() - 90*24*60*60*1000))
}})"

# 2. Recreate indexes if corrupted
mongo --eval "db.DecisionTrace.dropIndex('tenantId_1_timestamp_-1')"
mongo --eval "db.DecisionTrace.createIndex({tenantId:1, timestamp:-1})"

# 3. Monitor query time
mongo --eval "db.setProfilingLevel(1, {slowms:1000})"
```

---

### Message Queue Saturation / DLQ Growth

**Symptoms**:
- queue_depth_messages > 1000 and growing
- dlq_size_messages > 100
- Actions piling up unapplied
- RabbitMQ memory warning

**Diagnosis**:
```bash
# 1. Check queue depth
curl http://localhost:5000/metrics | grep -E 'queue_depth|dlq_size'

# 2. Check RabbitMQ queue status
rabbitmqctl list_queues | grep -E 'incident|decision|action'

# 3. Check consumer concurrency
grep -i "CONSUMER" .env | grep -i "CONCURRENCY"

# 4. Check if agents are running
ps aux | grep -i "agent" | grep node

# 5. Sample DLQ messages to understand failure
mongo --eval "db.FailedMessage.find().limit(5).pretty()"
```

**Common Causes & Fixes**:

| Cause | Evidence | Fix |
|-------|----------|-----|
| Agents not running | ps shows no agents | `npm run agents` or check logs |
| Consumer concurrency too low | queue_depth growing | Increase CONSUMER_CONCURRENCY to 10-20 |
| Action failures | dlq_size growing | Check what action is failing |
| Policy too restrictive | All decisions escalated | Review policy rules |
| Database slow | Actions timeout in queue | [See Database Issues](#database-unavailable-or-slow-queries) |

**Emergency Drain** (If queue > 5000):
```bash
# 1. Stop new incidents being generated (upstream)

# 2. Increase concurrency temporarily
sed -i 's/CONSUMER_CONCURRENCY=.*/CONSUMER_CONCURRENCY=50/' .env
# Restart agents

# 3. Monitor queue depth dropping
watch -n 1 'curl -s http://localhost:5000/metrics | grep queue_depth'

# 4. Reset concurrency when queue < 100
sed -i 's/CONSUMER_CONCURRENCY=.*/CONSUMER_CONCURRENCY=10/' .env
# Restart agents
```

---

## COMMON ERROR CODES AND SOLUTIONS

### Error: "SAFE_MODE: Cannot execute actions"
**Code**: `ERR_SAFE_MODE_ACTIVE` (HTTP 503)  
**Cause**: Multi-instance deployment with Redis unavailable  
**Fix**: [Redis Recovery](#redis-failure-recovery)

### Error: "Policy version mismatch"
**Code**: `ERR_POLICY_VERSION_MISMATCH`  
**Cause**: Agent has outdated policy, restart needed  
**Fix**: Restart decision agents: `systemctl restart aira-decision-agent`

### Error: "Idempotency lock timeout"
**Code**: `ERR_IDEMPOTENCY_LOCK_TIMEOUT` (HTTP 409)  
**Cause**: Another instance processing same incident  
**Fix**: Normal in multi-instance, will auto-retry. If persistent, check instance connectivity.

### Error: "Confidence below escalation threshold"
**Code**: `ERR_CONFIDENCE_TOO_LOW` (HTTP 400)  
**Cause**: Decision confidence < required threshold  
**Fix**: Either approve manually or adjust confidence_minimum in policy

### Error: "Action failed: health check failed"  
**Code**: `ERR_ACTION_HEALTH_CHECK_FAILED`  
**Cause**: Target service not responding or unhealthy  
**Fix**: Verify target service is healthy, check network connectivity

### Error: "Queue backpressure triggered"
**Code**: `ERR_QUEUE_BACKPRESSURE` (HTTP 503)  
**Cause**: Queue depth > capacity, system protecting itself  
**Fix**: Scale consumers or fix the underlying queue backup

---

## Memory Leak Detection

**Symptoms**: Node process memory grows over hours, CPU doesn't recover

**Detection**:
```bash
# 1. Get current memory usage
ps aux | grep "node" | grep -v grep | awk '{print $6}'

# 2. Capture heap snapshot
curl -X POST http://localhost:5000/admin/snapshot-heap
# Saves to ./heap-dumps/ directory

# 3. Analyze with node
node --inspect=9229 server.js
# Open chrome://inspect and analyze heap
```

**Fix**:
- Check incident memory cleanup is running: grep -i "cleanup" logs/*.log
- Verify TTL indexes are set on AuditEvent, IncidentMemory
- Review code for circular references in feedback system

---

## Runbook Execution Issues

**Symptom**: Runbook not executing or failing silently

```bash
# 1. Check if runbook executor is running
ps aux | grep runbook

# 2. Check runbook validation
curl http://localhost:5000/admin/validate-runbooks

# 3. Check runbook logs
tail -f logs/runbooks.log

# 4. Manually trigger a runbook test
curl -X POST http://localhost:5000/admin/test-runbook \
  -H "Content-Type: application/json" \
  -d '{"runbookId":"api-rate-limit-fix"}'

# 5. Check if runbook YAML is valid
npm run validate:runbooks
```

---

## Getting Help

If your issue isn't resolved:

1. **Collect diagnostic bundle**:
   ```bash
   bash scripts/collect-diagnostics.sh > diagnostics-$(date +%s).log
   ```

2. **Check operational runbooks**: See `/runbooks/` directory

3. **Review recent changes**: `git log --oneline -10`

4. **Escalate to on-call**: Include diagnostic bundle and above details

---

**Last Updated**: April 1, 2026  
**Next Review**: April 15, 2026
 
--- 
 
﻿# AIRA Quick Reference

## Local Dev

```bash
cd backend && npm install && npm start
curl http://localhost:5000/health/detailed
```

---

## Docker Compose (Staging)

```bash
docker compose up --build -d        # start everything
docker compose ps                   # check status
docker compose logs -f app          # tail app logs
docker compose down                 # stop
docker compose down -v              # stop + wipe volumes
```

Endpoints: `http://localhost:5000` (app), `http://localhost:15672` (RabbitMQ UI)

---

## Kubernetes (Production)

### First-time deploy

```bash
node k8s/generate-secrets.js
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret-generated.yaml
kubectl apply -f k8s/redis.yaml -f k8s/rabbitmq.yaml -f k8s/mongodb.yaml
kubectl apply -f k8s/deployment.yaml -f k8s/nodeport.yaml
```

### Status & Access

```bash
kubectl get pods -n aira                         # pod status
kubectl get all -n aira                          # all resources
kubectl port-forward svc/aira-backend 8888:80 -n aira   # access app
curl http://localhost:8888/health                # verify
# NodePort (Docker Desktop): http://localhost:30500/health
```

### Operate

```bash
kubectl logs -n aira -l app=aira,component=backend -f --tail=100
kubectl scale deployment/aira-backend --replicas=4 -n aira
kubectl rollout restart deployment/aira-backend -n aira
kubectl rollout undo deployment/aira-backend -n aira
kubectl get events -n aira --sort-by='.lastTimestamp'
```

### Update & Upgrade

```bash
# New image
docker build -t aira-deploy-app:v2 -f Dockerfile .
kubectl set image deployment/aira-backend aira=aira-deploy-app:v2 -n aira
kubectl rollout status deployment/aira-backend -n aira

# Update config (env var)
kubectl patch configmap aira-config -n aira --type=merge \
  -p '{"data":{"LOG_LEVEL":"debug"}}'
kubectl rollout restart deployment/aira-backend -n aira

# Update secrets
node k8s/generate-secrets.js
kubectl apply -f k8s/secret-generated.yaml
kubectl rollout restart deployment/aira-backend -n aira
```

### Enable a Feature Flag

```bash
kubectl patch configmap aira-config -n aira --type=merge \
  -p '{"data":{"ENABLE_AUTO_REMEDIATION":"true"}}'
kubectl rollout restart deployment/aira-backend -n aira
```

### Teardown

```bash
kubectl delete namespace aira
```

---

## Testing

```bash
cd backend
npm test                                    # all tests
npm test -- --testPathPattern=unit          # unit only
npm test -- --testPathPattern=integration   # integration only
npm run test:coverage                       # coverage report
cd chaos && node run-chaos-tests.js         # chaos tests
```

---

## Core API

```bash
BASE=http://localhost:5000
T=demo-tenant

# Health
curl $BASE/health
curl $BASE/health/detailed
curl $BASE/metrics

# Submit incident
curl -X POST $BASE/api/decisions/$T \
  -H 'Content-Type: application/json' \
  -d '{"incidentId":"INC-001","severity":"high","affectedService":"payment-api","symptoms":["high_latency"]}'

# Pending approvals
curl $BASE/api/approvals/$T

# Approve
curl -X POST $BASE/api/approvals/$T/APPROVAL_ID/approve \
  -H 'Content-Type: application/json' \
  -d '{"approvedBy":"engineer","reason":"verified safe"}'

# Policies
curl $BASE/api/policies/$T

# Effectiveness report
curl $BASE/api/reporting/$T/summary
```

---

## Debug Crashed Pod

```bash
kubectl get pods -n aira                       # find pod name
kubectl describe pod <pod-name> -n aira        # events + restart reason
kubectl logs <pod-name> -n aira --previous     # logs from last crash
kubectl exec -it <pod-name> -n aira -- sh      # shell into running pod
```

---

## Git

```bash
git add . && git commit -m "..." && git push origin master
git log --oneline -10
git status
```
