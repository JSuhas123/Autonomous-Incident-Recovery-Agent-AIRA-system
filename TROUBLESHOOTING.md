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
