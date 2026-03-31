# Production Deployment Guide - Phases 1, 2, 3

## Overview

This document provides comprehensive deployment guidance for Phases 1-3 of the Autonomous Backend Incident Recovery Agent (AIRA) hardening initiative:

- **Phase 1 (SAFE)**: XSS protection, action kill switches, learning system toggles, confidence thresholds
- **Phase 2 (OBSERVABLE)**: Structured logging, Prometheus metrics, immutable audit trails
- **Phase 3 (CHAOS-TESTED)**: Validated resilience under failure conditions

**Status**: ✅ All code complete and integrated | ⏳ Awaiting first production deployment

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Phase 1: Safety Features](#phase-1-safety-features)
3. [Phase 2: Observability](#phase-2-observability)
4. [Phase 3: Validation](#phase-3-validation)
5. [Environment Variables](#environment-variables)
6. [Emergency Runbooks](#emergency-runbooks)
7. [Monitoring & Alerting](#monitoring--alerting)
8. [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment Checklist

Before deploying to any environment, verify:

- [ ] MongoDB is running and accessible (for audit logs)
- [ ] RabbitMQ is running (for message queues)
- [ ] Prometheus scrape targets configured (if using Prometheus)
- [ ] ELK/Datadog/CloudWatch ready to receive logs (if using external logging)
- [ ] Redis available for distributed locking (for multi-instance safety)
- [ ] All test suites pass: `npm test` (Phase 1 + Phase 2 + Phase 3 chaos tests)
- [ ] Code review approval obtained
- [ ] Staging environment validation complete

**Test Verification**:
```bash
# Run all test suites
npm test

# Expected output:
# PASS backend/tests/phase1-safety.test.js (23 tests)
# PASS backend/tests/phase2-observability.test.js (30 tests)
# PASS backend/tests/phase3-chaos.test.js (31 tests)
# Test Suites: 3 passed, 3 total
# Tests: 84 passed, 84 total
```

---

## Phase 1: Safety Features

### 1.1 XSS Sanitization Middleware

**What It Does**: 
- Strips malicious HTML/JavaScript from all user input
- Protects against script injection, event handler injection, data URI attacks
- Applied early in request pipeline (after `express.json()`, before handlers)

**Configuration**:
- Enabled by default (no flag required)
- Uses DOMPurify with strict text-only config (no HTML tags allowed)
- Selective fields can be exempted via middleware options

**Deployment**: 
✅ No action required - automatically enabled when app starts

**Testing**:
```bash
# Test XSS payloads
curl http://localhost:3000/api/v1/safety/xss-test

# Response: { "payloads_tested": 8, "all_sanitized": true }
```

---

### 1.2 Global Kill Switches for Actions

**What It Does**:
- Prevents ALL actions from executing when disabled
- Checked on every request (no caching, immediate effect)
- Maintains immutable audit trail of all changes

**Environment Variables**:
```bash
# ACTIONS_ENABLED: Enable/disable all action execution globally
# Default: true (enabled)
# Set to 'false' to disable: ACTIONS_ENABLED=false

ACTIONS_ENABLED=true

# ENABLE_INCIDENT_LEARNING: Enable/disable learning system (dangerous feature)
# Default: false (disabled for production safety)
# Recommended: Keep false unless extensively tested first
ENABLE_INCIDENT_LEARNING=false

# EMERGENCY_MODE: Escalate all decisions to human review
# Default: false
# Set to true during incidents: EMERGENCY_MODE=true
EMERGENCY_MODE=false
```

**Deployment**:
1. Deploy code with new kill switch middleware
2. Verify `ACTIONS_ENABLED=true` in environment (default)
3. Monitor `/api/v1/safety/kill-switches` endpoint to verify status

**Check Status**:
```bash
# GET kill switch status (no auth required for monitoring)
curl http://localhost:3000/api/v1/safety/kill-switches

# Response:
{
  "actionsEnabled": true,
  "learningEnabled": false,
  "emergencyModeActive": false,
  "lastModified": "2026-03-31T14:00:00Z",
  "auditTrail": [
    {
      "timestamp": "2026-03-31T14:00:00Z",
      "action": "ENABLED",
      "reason": "Application startup"
    }
  ]
}
```

**Disable Actions (Emergency Response)**:
```bash
# POST to disable actions (requires auth)
curl -X POST http://localhost:3000/api/v1/safety/kill-switches \
  -H "X-API-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "actionsEnabled": false,
    "reason": "Critical incident - all actions disabled for investigation"
  }'

# Response: { "status": "UPDATED", "actionsEnabled": false }

# All subsequent action requests will return 503:
# {
#   "error": "Service Unavailable",
#   "message": "Global kill switch ACTIVE - all actions disabled",
#   "reason": "Critical incident - all actions disabled for investigation"
# }
```

**Re-enable Actions**:
```bash
curl -X POST http://localhost:3000/api/v1/safety/kill-switches \
  -H "X-API-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "actionsEnabled": true,
    "reason": "Investigation complete - actions re-enabled"
  }'
```

**Per-Tenant Kill Switches**:
```bash
# Disable actions for specific tenant only
curl -X POST http://localhost:3000/api/v1/safety/kill-switches \
  -H "X-API-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-123",
    "enabled": false,
    "reason": "Tenant experiencing runaway incident - isolated for safety"
  }'

# This tenant will get no actions, others unaffected
```

---

### 1.3 Confidence Threshold Enforcement

**What It Does**:
- Blocks AUTO_EXECUTE of low-confidence decisions
- Enforces decision tiers: AUTO_EXECUTE (≥0.85), ESCALATE (0.60-0.85), OBSERVE (<0.60)
- Prevents risky actions from executing without human approval

**Environment Variables**:
```bash
# AUTO_EXECUTE_THRESHOLD: Minimum confidence for automatic action execution
# Default: 0.85 (85%)
# Range: 0.0 to 1.0
# Higher = more conservative (more human review)
AUTO_EXECUTE_THRESHOLD=0.85

# ESCALATION_THRESHOLD: Minimum confidence for escalation (vs observe-only)
# Default: 0.60 (60%)
# Range: 0.0 to AUTO_EXECUTE_THRESHOLD
ESCALATION_THRESHOLD=0.60
```

**Check Current Thresholds**:
```bash
# GET current threshold configuration
curl http://localhost:3000/api/v1/safety/thresholds

# Response:
{
  "autoExecuteThreshold": 0.85,
  "escalationThreshold": 0.60,
  "tiers": {
    "AUTO_EXECUTE": { "min": 0.85, "max": 1.0, "action": "execute_immediately" },
    "ESCALATE": { "min": 0.60, "max": 0.85, "action": "human_review_required" },
    "OBSERVE": { "min": 0.0, "max": 0.60, "action": "log_only_no_action" }
  },
  "examples": {
    "confidence_0.95": "AUTO_EXECUTE - immediate action",
    "confidence_0.75": "ESCALATE - human approval required",
    "confidence_0.45": "OBSERVE - logged for trend analysis"
  }
}
```

**Update Thresholds (During Incident)**:
```bash
# POST to adjust thresholds (requires auth)
curl -X POST http://localhost:3000/api/v1/safety/thresholds \
  -H "X-API-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "autoExecuteThreshold": 0.90,
    "escalationThreshold": 0.70,
    "reason": "Incident spike - raising confidence requirements"
  }'

# Response:
{
  "status": "UPDATED",
  "previous": { "autoExecute": 0.85, "escalation": 0.60 },
  "current": { "autoExecute": 0.90, "escalation": 0.70 }
}

# Now decisions need 90% confidence to auto-execute (vs 85%)
```

**Revert to Defaults**:
```bash
curl -X POST http://localhost:3000/api/v1/safety/thresholds \
  -H "X-API-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "autoExecuteThreshold": 0.85,
    "escalationThreshold": 0.60,
    "reason": "Incident resolved - reverting to standard thresholds"
  }'
```

---

## Phase 2: Observability

### 2.1 Structured Logging

**What It Does**:
- JSON-formatted logs with correlation IDs
- Structured fields: tenant ID, service, timestamp, level, context
- File rotation: 5MB per file, 10 files per topic
- Compatible with ELK, Datadog, AWS CloudWatch

**Environment Variables**:
```bash
# LOG_LEVEL: Minimum log level to output
# Options: error, warn, info, debug
# Default: info
LOG_LEVEL=info

# LOG_DIR: Directory for log files
# Default: ./backend/logs
LOG_DIR=./backend/logs

# EXTERNAL_LOG_SERVICE: Send logs to external service
# Options: elk, datadog, cloudwatch, none
# Default: none (local files only)
EXTERNAL_LOG_SERVICE=none

# ELK_HOSTS: Elasticsearch hosts (if EXTERNAL_LOG_SERVICE=elk)
ELK_HOSTS=localhost:9200

# DATADOG_API_KEY: Datadog API key (if EXTERNAL_LOG_SERVICE=datadog)
DATADOG_API_KEY=

# DATADOG_SITE: Datadog site (datadoghq.com or datadoghq.eu)
DATADOG_SITE=datadoghq.com

# AWS_CLOUDWATCH_LOG_GROUP: CloudWatch log group (if using CloudWatch)
AWS_CLOUDWATCH_LOG_GROUP=/aws/aira/backend
```

**Log Format**:
```json
{
  "timestamp": "2026-03-31T14:23:45.123Z",
  "level": "info",
  "service": "decision-engine",
  "component": "decision-agent",
  "tenantId": "tenant-123",
  "correlationId": "req-uuid-1234",
  "message": "decision_made",
  "severity": "medium",
  "confidence": 0.82,
  "action": "restart",
  "durationMs": 1250,
  "context": {
    "issueType": "latency",
    "errorRate": 0.35,
    "responseTime": 1200
  }
}
```

**Query Logs (ELK)**:
```bash
# Find all decisions above 0.80 confidence
curl "http://localhost:9200/aira-logs-*/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "bool": {
        "must": [
          { "match": { "message": "decision_made" } },
          { "range": { "confidence": { "gte": 0.80 } } }
        ]
      }
    },
    "size": 100
  }'

# Find all escalations
curl "http://localhost:9200/aira-logs-*/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": { "match": { "message": "escalated_to_human" } },
    "size": 50
  }'
```

---

### 2.2 Prometheus Metrics

**What It Does**:
- Exports 20+ metrics: decision latency, action latency, error rates, queue depth, confidence distribution
- Prometheus format at `/metrics` endpoint
- Queryable by tenant ID, action type, severity, component
- Compatible with Grafana dashboards

**Environment Variables**:
```bash
# PROMETHEUS_ENABLED: Enable /metrics endpoint
# Default: true
PROMETHEUS_ENABLED=true

# PROMETHEUS_PORT: Port for metrics endpoint (if separate from main server)
# Default: 8080 (combined with app endpoint)
PROMETHEUS_PORT=8080

# METRIC_RETENTION_HOURS: How long to retain metrics in memory
# Default: 24
METRIC_RETENTION_HOURS=24
```

**Scrape Configuration** (Prometheus):
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'aira-backend'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

**Key Metrics**:
```
# Decision Metrics
decision_latency_ms{tenantId="...", severity="..."} histogram (p50, p95, p99)
decisions_total{tenantId="...", tier="AUTO_EXECUTE|ESCALATE|OBSERVE", outcome="success|failure"} counter

# Action Metrics
action_latency_ms{tenantId="...", actionType="..."} histogram
actions_total{tenantId="...", actionType="...", result="success|failure"} counter

# Queue Metrics
queue_depth{queueType="incidents|decisions|actions"} gauge
queue_latency_ms{queueType="..."} histogram
dlq_size{queueType="..."} gauge

# Error Metrics
errors_total{tenantId="...", component="...", errorType="..."} counter
error_rate_percent{component="..."} gauge

# Security Metrics
xss_sanitizations_total{endpoint="..."} counter
security_events_total{eventType="AUTH_FAILED|RATE_LIMIT|XSS_DETECTED"} counter

# System Metrics
system_uptime_seconds gauge
memory_usage_bytes{type="heap_used|heap_total|rss"} gauge
database_query_latency_ms{operation="...", collection="..."} histogram
```

**Grafana Dashboard Setup**:

1. Add Prometheus data source:
   - URL: `http://localhost:9090`
   - Access: Server

2. Import dashboard JSON (compatible with standard templates):
   ```json
   {
     "dashboard": {
       "title": "AIRA Backend - Phase 2 Observability",
       "panels": [
         {
           "title": "Decision Latency p99",
           "targets": [
             { "expr": "histogram_quantile(0.99, decision_latency_ms)" }
           ]
         },
         {
           "title": "Auto-Execute Decisions",
           "targets": [
             { "expr": "decisions_total{tier=\"AUTO_EXECUTE\"}" }
           ]
         },
         {
           "title": "Error Rate",
           "targets": [
             { "expr": "error_rate_percent" }
           ]
         },
         {
           "title": "Queue Depth",
           "targets": [
             { "expr": "queue_depth" }
           ]
         }
       ]
     }
   }
   ```

3. **Query Examples**:
   ```promql
   # Decision success rate over time
   rate(decisions_total{outcome="success"}[5m]) / rate(decisions_total[5m])

   # Average action latency by action type
   avg(action_latency_ms) by (actionType)

   # 95th percentile decision latency
   histogram_quantile(0.95, decision_latency_ms)

   # Actions escalated due to low confidence
   decisions_total{tier="ESCALATE"}

   # Error rate by component
   rate(errors_total[5m]) by (component)

   # Memory usage trend
   memory_usage_bytes{type="heap_used"}
   ```

---

### 2.3 Action Audit Trail

**What It Does**:
- Immutable, queryable log of all decisions and actions
- Stored in MongoDB with pagination support
- Sensitive parameters sanitized (passwords hidden as *** REDACTED ***)
- Tenant-isolated for compliance

**Environment Variables**:
```bash
# AUDIT_RETENTION_DAYS: How long to keep audit logs
# Default: 90 (3 months)
AUDIT_RETENTION_DAYS=90

# AUDIT_TTL_INDEX: Enable automatic deletion of old records
# Default: true
AUDIT_TTL_INDEX=true
```

**MongoDB Collections**:
```javascript
// AuditEvent schema
db.auditevent.findOne({
  _id: ObjectId("..."),
  tenantId: "tenant-123",
  eventType: "action.executed",
  correlationId: "req-uuid-1234",
  timestamp: ISODate("2026-03-31T14:23:45Z"),
  actor: "decision-agent",
  severity: "medium",
  action: "restart-service",
  result: "SUCCESS",
  durationMs: 3200,
  output: "Service restarted successfully",
  parameters: {
    serviceId: "service-abc",
    forceful: false,
    // Sensitive fields redacted:
    apiKey: "*** REDACTED ***",
    password: "*** REDACTED ***"
  },
  context: {
    decisionId: "decision-uuid",
    confidence: 0.87,
    severit: "medium"
  }
})
```

**Query Audit Trail**:
```bash
# Get audit service via API
curl "http://localhost:3000/api/v1/audit/trail?tenantId=tenant-123&eventType=action.executed&limit=50&page=1"

# Response:
{
  "results": [
    {
      "timestamp": "2026-03-31T14:23:45Z",
      "eventType": "action.executed",
      "action": "restart-service",
      "result": "SUCCESS",
      "durationMs": 3200,
      "decisionId": "decision-uuid",
      "confidence": 0.87
    }
  ],
  "pagination": {
    "total": 342,
    "page": 1,
    "limit": 50,
    "pages": 7
  }
}
```

**Audit Summary**:
```bash
# Get summary of last 24 hours
curl "http://localhost:3000/api/v1/audit/summary?tenantId=tenant-123&hours=24"

# Response:
{
  "timeWindow": "24h",
  "eventCounts": {
    "decision.made": 1205,
    "action.executed": 342,
    "action.failed": 8,
    "security.event": 2
  },
  "successRate": 0.977,
  "avgLatency": 1450,
  "escalations": 203,
  "trends": {
    "decision_volume_trend": "stable",
    "error_trend": "decreasing",
    "escalation_trend": "stable"
  }
}
```

**Export Audit Logs** (for compliance):
```bash
# Export all audit logs for tenant to CSV (last 30 days)
curl "http://localhost:3000/api/v1/audit/export?tenantId=tenant-123&format=csv&days=30" \
  -o audit-tenant-123-30d.csv

# Or JSON
curl "http://localhost:3000/api/v1/audit/export?tenantId=tenant-123&format=json&days=90" \
  -o audit-tenant-123-90d.json
```

---

## Phase 3: Validation

### 3.1 Chaos Test Execution

**What It Does**:
- Validates system resilience under failure conditions
- 5 test scenarios: DB failure, queue saturation, latency injection, incident storm, cascading failures
- No external dependencies needed (uses mocked services)

**Running Chaos Tests**:
```bash
# Run Phase 3 chaos tests only
npm test -- phase3-chaos.test.js

# Expected output:
# PASS backend/tests/phase3-chaos.test.js
#   PHASE 3: Chaos Testing
#     Chaos Framework Basics
#       ✓ should create chaos test framework
#       ✓ should register failures
#       ... (6 tests total)
#     Database Chaos Scenarios
#       ✓ should simulate database unavailability
#       ✓ should simulate slow queries
#       ✓ should verify graceful degradation on DB failure
#       ... (5 tests total)
#     Queue Chaos Scenarios
#       ✓ should handle queue saturation
#       ... (5 tests total)
#     High Load / Incident Storm
#       ✓ should handle incident storm
#       ✓ should measure throughput under load
#       ... (4 tests total)
#     Recovery and Resilience
#       ✓ should recover from transient failures
#       ... (3 tests total)

# Total: 31 tests, all passing = system is chaos-resilient ✅
```

**Staging Environment Full Validation**:
```bash
# 1. Deploy Phase 1, 2, 3 code to staging
# 2. Spin up MongoDB and RabbitMQ test containers
docker-compose -f docker-compose.test.yml up

# 3. Run all test suites
npm test

# 4. Execute load test simulation (requires real MongoDB)
npm run test:load \
  --incident-count=500 \
  --concurrent=50 \
  --duration=300

# 5. Generate chaos test report
npm run test:chaos:report > chaos-report.json

# 6. Verify no memory leaks
npm run test:memory-leak \
  --duration=600 # 10 minutes of sustained load

# 7. Verify kill switch/threshold responsiveness
npm run test:safety-gates:performance

# Expected: All response times <100ms
```

---

## Environment Variables

### Complete Reference

```bash
##############################
# PHASE 1: SAFETY
##############################

# XSS Protection
# No env vars needed - automatically enabled

# Kill Switches
ACTIONS_ENABLED=true                    # Enable/disable all actions
ENABLE_INCIDENT_LEARNING=false          # Enable learning system (set false for production)
EMERGENCY_MODE=false                    # Escalate all decisions to human review

# Confidence Thresholds
AUTO_EXECUTE_THRESHOLD=0.85             # Min confidence for auto-execution (0.0-1.0)
ESCALATION_THRESHOLD=0.60               # Min confidence for escalation (0.0-AUTO_EXECUTE_THRESHOLD)

##############################
# PHASE 2: OBSERVABILITY
##############################

# Structured Logging
LOG_LEVEL=info                          # error, warn, info, debug
LOG_DIR=./backend/logs                  # Directory for log files
EXTERNAL_LOG_SERVICE=none               # elk, datadog, cloudwatch, none

# ELK Stack
ELK_HOSTS=localhost:9200                # Elasticsearch hosts
ELK_INDEX_PREFIX=aira-logs              # Log index prefix

# Datadog
DATADOG_API_KEY=                        # Datadog API key
DATADOG_SITE=datadoghq.com              # Datadog site

# AWS CloudWatch
AWS_REGION=us-east-1                    # AWS region
AWS_CLOUDWATCH_LOG_GROUP=/aws/aira      # Log group name

# Prometheus Metrics
PROMETHEUS_ENABLED=true                 # Enable /metrics endpoint
PROMETHEUS_PORT=8080                    # Metrics port (separate or combined with app)
METRIC_RETENTION_HOURS=24               # How long to keep metrics

# Audit Trail
AUDIT_RETENTION_DAYS=90                 # How long to keep audit logs
AUDIT_TTL_INDEX=true                    # Auto-delete old records

##############################
# INFRASTRUCTURE
##############################

# MongoDB
MONGODB_URI=mongodb://localhost:27017/aira    # Connection string
MONGODB_TIMEOUT_MS=5000                       # Query timeout

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672           # Connection string
RABBITMQ_PREFETCH=10                         # Consumer prefetch count

# Redis (Distributed Locking)
REDIS_URL=redis://localhost:6379              # Connection string
REDIS_TIMEOUT_MS=3000                        # Operation timeout

# API Keys & Auth
ADMIN_API_KEY=<secure-key>              # For safety control endpoints
METRICS_API_KEY=<secure-key>            # For metrics endpoint access

##############################
# TESTING & DEVELOPMENT
##############################

TEST_ENV=false                          # Set true in test environment
CHAOS_TEST_ENABLED=true                 # Enable chaos testing
LOAD_TEST_INCIDENT_COUNT=100            # For load tests
LOAD_TEST_CONCURRENT=10                 # Concurrent incidents
LOAD_TEST_DURATION_SECONDS=300          # Load test duration

# Debug Options
DEBUG=aira:*                            # Debug namespace (set for verbose logging)
PRESERVE_LOGS_ON_FAILURE=true           # Keep logs if test fails
```

**Sample .env File** (Development):
```bash
# .env (DO NOT COMMIT TO GIT)

# Phase 1
ACTIONS_ENABLED=true
ENABLE_INCIDENT_LEARNING=false
AUTO_EXECUTE_THRESHOLD=0.85
ESCALATION_THRESHOLD=0.60

# Phase 2
LOG_LEVEL=debug
EXTERNAL_LOG_SERVICE=none
PROMETHEUS_ENABLED=true

# Infrastructure
MONGODB_URI=mongodb://localhost:27017/aira-dev
RABBITMQ_URL=amqp://localhost:5672
REDIS_URL=redis://localhost:6379

# Auth
ADMIN_API_KEY=dev-api-key-insecure-only-for-development
```

**Sample .env File** (Production):
```bash
# .env.production
# Copy to production system with ACTUAL SECURE VALUES

# Phase 1
ACTIONS_ENABLED=true
ENABLE_INCIDENT_LEARNING=false
AUTO_EXECUTE_THRESHOLD=0.85
ESCALATION_THRESHOLD=0.60
EMERGENCY_MODE=false

# Phase 2
LOG_LEVEL=info
EXTERNAL_LOG_SERVICE=datadog
DATADOG_API_KEY=${PROD_DATADOG_API_KEY}
DATADOG_SITE=datadoghq.com
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=8080

# Infrastructure - Production Addresses
MONGODB_URI=${PROD_MONGODB_URI}
RABBITMQ_URL=${PROD_RABBITMQ_URL}
REDIS_URL=${PROD_REDIS_URL}

# Security
ADMIN_API_KEY=${PROD_ADMIN_API_KEY}      # Store in secrets vault, not in file
METRICS_API_KEY=${PROD_METRICS_API_KEY}
```

---

## Emergency Runbooks

### Runbook 1: Critical Incident - Disable All Actions

**When to Use**: System is causing damage (cascading failures, deleting data, etc.)

**Time Limit**: < 2 minutes

**Steps**:
```bash
# 1. Immediately disable all actions (no restart needed)
curl -X POST http://localhost:3000/api/v1/safety/kill-switches \
  -H "X-API-Key: ${ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "actionsEnabled": false,
    "reason": "CRITICAL INCIDENT - All actions disabled. Severity: human error in action logic detected. Investigation: [incident ticket]"
  }'

# 2. Verify disabled
curl http://localhost:3000/api/v1/safety/kill-switches | jq .actionsEnabled
# Output: false

# 3. Monitor decisions to see they now escalate to human
curl http://localhost:3000/api/v1/audit/summary?hours=1 | jq '.eventCounts'

# 4. Investigate root cause (check logs, trace decision logic)
grep "ERROR" backend/logs/error.log | tail -50

# 5. Once fixed, re-enable
curl -X POST http://localhost:3000/api/v1/safety/kill-switches \
  -H "X-API-Key: ${ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "actionsEnabled": true,
    "reason": "INCIDENT RESOLVED - Root cause fixed, re-enabling actions. Fix: [describe fix]"
  }'
```

---

### Runbook 2: High Escalation Rate - Increase Confidence Thresholds

**When to Use**: Many decisions are being escalated (> 50% of decisions)

**Symptoms**: 
- Dashboard shows `escalations_total` > 500/min
- Audit logs filled with `ESCALATE` decisions
- "ESCALATED_TO_HUMAN" events spiking

**Steps**:
```bash
# 1. Check current escalation rate
curl "http://localhost:3000/api/v1/audit/summary?hours=1" | \
  jq '.eventCounts, .escalations'

# 2. Increase confidence thresholds (make system more conservative)
curl -X POST http://localhost:3000/api/v1/safety/thresholds \
  -H "X-API-Key: ${ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "autoExecuteThreshold": 0.90,
    "escalationThreshold": 0.75,
    "reason": "High escalation rate (>50%). Raising thresholds temporarily."
  }'

# 3. Monitor escalation rate drops
watch -n 5 'curl "http://localhost:3000/api/v1/audit/summary?hours=1" | jq .escalations'

# 4. Once stabilized, gradually lower back to normal
# Wait 10 minutes, then lower by 0.02 increments: 0.90 → 0.88 → 0.86 → 0.85
curl -X POST http://localhost:3000/api/v1/safety/thresholds \
  -H "X-API-Key: ${ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "autoExecuteThreshold": 0.88,
    "escalationThreshold": 0.73,
    "reason": "Stabilized. Adjusting back toward normal."
  }'

# 5. Verify escalation rate stabilizes at acceptable level (< 30%)
```

---

### Runbook 3: Database Connection Issues - Verify Graceful Degradation

**When to Use**: MongoDB is down or slow

**Symptoms**:
- `errors_total{component="database"}` spiking
- `database_query_latency_ms{operation="..."}` > 10000ms
- `db_query_latency` percentiles degrading

**Steps**:
```bash
# 1. Check database connection status
curl http://localhost:3000/api/v1/health | jq '.database'

# Expected when DB down:
# {
#   "status": "DEGRADED",
#   "error": "Connection timeout",
#   "lastAttempt": "2026-03-31T14:30:00Z"
# }

# 2. Verify system is still making decisions (not crashing)
curl http://localhost:3000/api/v1/audit/summary?hours=1 | jq '.eventCounts.decision | length'

# Should still have decisions being logged (using fallback/cache)

# 3. Check kill switch status (should still work - stored in memory)
curl http://localhost:3000/api/v1/safety/kill-switches

# Should respond with current status (even if DB is down)

# 4. Restore database connection
# Option A: Restart MongoDB
systemctl restart mongodb

# Option B: Check MongoDB logs for errors
tail -100 /var/log/mongodb/mongod.log

# Option C: Verify network connectivity
ping <mongodb-host>
nc -zv <mongodb-host> 27017

# 5. Once DB is back, verify recovery
curl http://localhost:3000/api/v1/health | jq '.database.status'
# Should be "HEALTHY"

# 6. Check for data loss in audit trail
mongo --eval "db.auditevent.count()" aira
```

---

### Runbook 4: Queue Saturation - Clear Backlog

**When to Use**: RabbitMQ queue is growing faster than it's consumed

**Symptoms**:
- `queue_depth{queueType="incidents"}` > 10000
- `queue_latency_ms` > 5000ms
- Actions are delayed, decisions pile up

**Steps**:
```bash
# 1. Check queue depth
curl http://localhost:3000/api/v1/metrics | grep queue_depth

# 2. Check consumer status (see if agents are consuming messages)
docker logs <rabbitmq-container> | grep 'consumer'
# or
rabbitmqctl list_consumers

# 3. If consumers are stuck, restart agents
docker restart <action-agent-container>
docker restart <decision-agent-container>

# 4. Monitor queue drain
watch -n 2 'curl http://localhost:3000/api/v1/metrics | grep queue_depth'

# 5. If still backed up, enable priority mode (scale up consumers)
export DECISION_AGENT_PARALLELISM=20  # Increase from default 10
export ACTION_AGENT_PARALLELISM=20
docker restart <agent-containers>

# 6. Once queue clears, revert to normal parallelism
export DECISION_AGENT_PARALLELISM=10
export ACTION_AGENT_PARALLELISM=10

# 7. Verify no messages lost
rabbitmqctl list_queues name messages_ready messages_unacked
# All queues should be < 100 messages once healthy
```

---

## Monitoring & Alerting

### Prometheus Alerts (alerting.rules.yml)

```yaml
groups:
  - name: aira-alerts
    rules:
      # Safety Gates
      - alert: GlobalKillSwitchActive
        expr: kill_switch_status{switch="actions"} == 0
        for: 1m
        annotations:
          summary: "Global action kill switch is ACTIVE"
          description: "All actions are disabled. Check /api/v1/safety/kill-switches"

      - alert: HighEscalationRate
        expr: rate(decisions_total{tier="ESCALATE"}[5m]) / rate(decisions_total[5m]) > 0.5
        for: 5m
        annotations:
          summary: "Over 50% of decisions are being escalated"
          description: "Check confidence thresholds and decision quality"

      # Observability & Performance
      - alert: HighDecisionLatency
        expr: histogram_quantile(0.99, decision_latency_ms) > 5000
        for: 5m
        annotations:
          summary: "Decision latency p99 > 5 seconds"
          description: "System is slow in making decisions"

      - alert: ActionFailureRate
        expr: rate(actions_total{result="failure"}[5m]) / rate(actions_total[5m]) > 0.1
        for: 5m
        annotations:
          summary: "Over 10% of actions are failing"
          description: "Check action logs and circuit breaker status"

      - alert: QueueBacklog
        expr: queue_depth{queueType="incidents"} > 10000
        for: 5m
        annotations:
          summary: "Incident queue has > 10k messages"
          description: "Analyze consumer parallelism, may need to scale up agents"

      # Infrastructure
      - alert: DatabaseErrors
        expr: rate(errors_total{component="database"}[5m]) > 10
        for: 2m
        annotations:
          summary: "Database errors > 10/sec"
          description: "Check MongoDB connectivity and logs"

      - alert: HighMemoryUsage
        expr: memory_usage_bytes{type="heap_used"} / memory_usage_bytes{type="heap_total"} > 0.9
        for: 5m
        annotations:
          summary: "Heap memory usage > 90%"
          description: "May need to increase Node.js heap size or restart process"
```

### Datadog Dashboard

```
# Check Datadog dashboard for:
1. Decision Volume (incidents processed per minute)
2. Confidence Distribution (% at each tier)
3. Error Rate (failures vs successes)
4. Escalation Rate (human review rate)
5. Queue Depth (backlog in each queue)
6. Action Latency (time to execute)
7. Kill Switch Status (enabled/disabled)
8. Memory/CPU Trends
```

---

## Rollback Procedures

### If Phase 1 Features Cause Issues

```bash
# Disable kill switches (revert to all actions enabled)
ACTIONS_ENABLED=true
ENABLE_INCIDENT_LEARNING=false  # Keep this false

# Revert to default thresholds
AUTO_EXECUTE_THRESHOLD=0.50    # Lower, more permissive
ESCALATION_THRESHOLD=0.30

# Restart application
systemctl restart aira-backend
```

### If Observability Is Too Verbose

```bash
# Reduce logging volume
LOG_LEVEL=warn              # Only warnings and errors
EXTERNAL_LOG_SERVICE=none   # Disable external logging

# Reduce metrics retention
METRIC_RETENTION_HOURS=6    # 6 instead of 24 hours

# Restart
systemctl restart aira-backend
```

### Complete Rollback to Pre-Phase1

```bash
# 1. Disable all new features
ACTIONS_ENABLED=true
ENABLE_INCIDENT_LEARNING=false
AUTO_EXECUTE_THRESHOLD=0.50
ESCALATION_THRESHOLD=0.30
LOG_LEVEL=error
PROMETHEUS_ENABLED=false
EXTERNAL_LOG_SERVICE=none

# 2. Deploy previous version of code
git checkout <pre-phase1-commit-hash>
npm install
npm run build

# 3. Restart
systemctl restart aira-backend

# 4. Verify system is back to baseline
curl http://localhost:3000/api/v1/health
```

---

## Success Criteria

**Phase 1 - Safety**: ✅
- [ ] XSS test endpoint returns 8 payloads all sanitized
- [ ] Kill switch can disable actions and they return 503
- [ ] Escalation happens when confidence < threshold
- [ ] All 23 safety tests PASS

**Phase 2 - Observability**: ✅
- [ ] Logs are JSON formatted and queryable
- [ ] Prometheus `/metrics` responds with 20+ metrics
- [ ] Audit trail tracks all decisions and actions
- [ ] Dashboard shows decision/action/error trends
- [ ] All 30 observability tests PASS

**Phase 3 - Resilience**: ✅
- [ ] Chaos tests simulate DB failure - system degrades gracefully
- [ ] Chaos tests simulate queue saturation - no message loss
- [ ] Under 500 incident/sec load - p99 latency < 2 seconds
- [ ] All 31 chaos tests PASS
- [ ] No memory leaks under sustained load

---

## Support & Escalation

**Phase 1 Issues** (Kill Switches): Contact Platform Safety Team
**Phase 2 Issues** (Observability): Contact Monitoring Team  
**Phase 3 Issues** (Performance): Contact SRE Team

---

**Last Updated**: March 31, 2026  
**Deployment Version**: 1.0.0  
**Status**: Ready for Production Rollout
