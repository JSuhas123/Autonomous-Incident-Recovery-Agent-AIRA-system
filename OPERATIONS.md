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
