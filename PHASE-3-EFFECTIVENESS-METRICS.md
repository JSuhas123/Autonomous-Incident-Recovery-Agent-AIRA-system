# Phase 3: Action Effectiveness Metrics

## 🎯 Overview

This phase enables **measurement of AIRA action effectiveness** by capturing and analyzing before/after metrics:

✅ **Before Metrics** - Incident state before action execution
✅ **After Metrics** - Incident state after resolution
✅ **Effectiveness Scoring** - Quantifies impact (0-100)
✅ **Action Comparison** - Compare effectiveness across actions
✅ **Cost Analysis** - Calculate ROI for remediation actions
✅ **Trend Analysis** - Track effectiveness over time

## 📋 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│           ACTION EFFECTIVENESS MEASUREMENT LAYER                │
└─────────────────────────────────────────────────────────────────┘

INCIDENT TIMELINE
────────────────────────────────────────────────────────────────

Incident         AIRA Decision      Action            Resolution
Detected         Made               Executed          Detected
   │                 │                  │                  │
   ├─ ERROR_RATE     ├─ dry-run        ├─ restart         │
   ├─ LATENCY        ├─ confidence     ├─ scale           ├─ ERROR_RATE
   ├─ AVAILABILITY   ├─ policy check   ├─ circuit-break   ├─ LATENCY
   ├─ RESOURCES      │                 │                  ├─ AVAILABILITY
   │                 │                 │                  ├─ RESOURCES
   │                 │                 │                  │
   ▼                 ▼                 ▼                  ▼
┌──────────────┬──────────────┬──────────────┬──────────────┐
│   RECORD     │   COMPARE    │   MEASURE    │   CALCULATE  │
│   BEFORE     │   OPTIONS    │   AFTER      │   EFFECTIVENESS
│              │              │              │              │
│ metrics_     │ dry-run      │ metrics_     │ score: 0-100
│ before       │ success_prob │ after        │ roi: $$$
└──────────────┴──────────────┴──────────────┴──────────────┘
```

## 🚀 Quick Start

### 1. Record Before Metrics

```bash
curl -X POST http://localhost:5000/api/v1/effectiveness/record-before \
  -H "Content-Type: application/json" \
  -d '{
    "decisionTraceId": "trace-123",
    "tenantId": "acme-corp",
    "metrics": {
      "action": "restart",
      "service": "payment-service",
      "pattern": "high-error-rate",
      "detected_at": "2026-04-01T10:00:00Z",
      "error_rate": 75,
      "availability": 25,
      "p50_latency": 200,
      "p95_latency": 500,
      "p99_latency": 2000,
      "mean_latency": 800,
      "request_rate": 1000,
      "transaction_volume": 10000,
      "cpu_percent": 85,
      "memory_percent": 92,
      "disk_percent": 70,
      "connection_pool_utilization": 95,
      "user_impact": 5000,
      "revenue_impact": 50000
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "decisionTraceId": "trace-123",
  "status": "pending",
  "timestamp": "2026-04-01T10:00:00Z"
}
```

### 2. Record Action Execution

```bash
curl -X POST http://localhost:5000/api/v1/effectiveness/record-action \
  -H "Content-Type: application/json" \
  -d '{
    "decisionTraceId": "trace-123",
    "actionId": "action-456",
    "durationMs": 3500,
    "success": true
  }'
```

### 3. Record After Metrics

```bash
curl -X POST http://localhost:5000/api/v1/effectiveness/record-after \
  -H "Content-Type: application/json" \
  -d '{
    "decisionTraceId": "trace-123",
    "metrics": {
      "error_rate": 5,
      "availability": 95,
      "p50_latency": 100,
      "p95_latency": 200,
      "p99_latency": 400,
      "mean_latency": 150,
      "request_rate": 1200,
      "transaction_volume": 12000,
      "cpu_percent": 45,
      "memory_percent": 50,
      "disk_percent": 70,
      "connection_pool_utilization": 30,
      "user_impact": 50,
      "revenue_impact": 100,
      "resolved_at": "2026-04-01T10:10:00Z"
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "decisionTraceId": "trace-123",
  "effectiveness": {
    "incident_resolved": true,
    "error_rate_reduced": true,
    "error_rate_reduction_percent": 93.3,
    "availability_improved": true,
    "availability_improvement_percent": 70,
    "latency_improved": true,
    "latency_improvement_percent": 80,
    "user_impact_reduced": true,
    "user_impact_reduction_percent": 99,
    "time_to_resolve_ms": 600000,
    "effectiveness_score": 94,
    "success": true
  },
  "status": "complete",
  "timestamp": "2026-04-01T10:10:00Z"
}
```

### 4. Compare Actions

```bash
curl "http://localhost:5000/api/v1/effectiveness/compare/actions?tenantId=acme-corp&timeRangeHours=24"
```

**Response**:
```json
{
  "tenantId": "acme-corp",
  "timeRangeHours": 24,
  "actions": [
    {
      "action": "restart",
      "sampleSize": 42,
      "effectivenessScore": 87.3,
      "successRate": 90.5,
      "avgResolutionTimeSec": 180,
      "avgErrorReduction": 85.2
    },
    {
      "action": "scale",
      "sampleSize": 28,
      "effectivenessScore": 79.1,
      "successRate": 82.1,
      "avgResolutionTimeSec": 240,
      "avgErrorReduction": 72.1
    },
    {
      "action": "circuit-break",
      "sampleSize": 15,
      "effectivenessScore": 71.4,
      "successRate": 73.3,
      "avgResolutionTimeSec": 120,
      "avgErrorReduction": 65.3
    }
  ],
  "topPerformer": {
    "action": "restart",
    "effectivenessScore": 87.3
  }
}
```

### 5. Track Trends

```bash
curl "http://localhost:5000/api/v1/effectiveness/trends/restart?tenantId=acme-corp"
```

**Response**:
```json
{
  "action": "restart",
  "tenantId": "acme-corp",
  "timeRange": "last 24 hours",
  "intervalMinutes": 60,
  "trends": [
    {
      "timestamp": "2026-04-01 04:00:00",
      "sampleCount": 5,
      "effectivenessScore": 82.0,
      "successRate": 88.0
    },
    {
      "timestamp": "2026-04-01 05:00:00",
      "sampleCount": 3,
      "effectivenessScore": 85.5,
      "successRate": 90.0
    },
    {
      "timestamp": "2026-04-01 06:00:00",
      "sampleCount": 4,
      "effectivenessScore": 89.2,
      "successRate": 95.0
    }
  ]
}
```

### 6. Calculate ROI

```bash
curl -X POST http://localhost:5000/api/v1/effectiveness/cost-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "decisionTraceId": "trace-123",
    "actionCostEstimate": 500
  }'
```

**Response**:
```json
{
  "decisionTraceId": "trace-123",
  "costAnalysis": {
    "action_cost_estimate": 500,
    "incident_cost_estimate": 50000,
    "savings": 49500,
    "roi": 9900
  },
  "effectiveness": {...},
  "timestamp": "2026-04-01T10:10:00Z"
}
```

## 📚 API Reference

### Record Before Metrics

**Endpoint**: `POST /api/v1/effectiveness/record-before`

Records infrastructure metrics at incident detection time.

**Metrics Fields**:
```json
{
  "action": "string (required)",
  "service": "string (required)",
  "pattern": "string",
  "detected_at": "ISO8601 date",
  
  // Availability metrics
  "error_rate": "number (0-100)",
  "availability": "number (0-100)",
  
  // Performance metrics
  "p50_latency": "number (ms)",
  "p95_latency": "number (ms)",
  "p99_latency": "number (ms)",
  "mean_latency": "number (ms)",
  
  // Volume metrics
  "request_rate": "number (req/sec)",
  "transaction_volume": "number",
  
  // Resource metrics
  "cpu_percent": "number (0-100)",
  "memory_percent": "number (0-100)",
  "disk_percent": "number (0-100)",
  "connection_pool_utilization": "number (0-100)",
  
  // Business impact
  "user_impact": "number (affected users)",
  "revenue_impact": "number (estimated loss)",
  
  // Custom metrics
  "custom": "object"
}
```

### Record After Metrics

**Endpoint**: `POST /api/v1/effectiveness/record-after`

Records metrics after incident resolution.

Same fields as `record-before`.

### Get Effectiveness

**Endpoint**: `GET /api/v1/effectiveness/:decisionTraceId`

Retrieves complete effectiveness analysis for a decision.

**Response**:
```json
{
  "metricsBefore": {...},
  "metricsAfter": {...},
  "effectiveness": {
    "incident_resolved": "boolean",
    "error_rate_reduced": "boolean",
    "error_rate_reduction_percent": "number",
    "availability_improved": "boolean",
    "availability_improvement_percent": "number",
    "latency_improved": "boolean",
    "latency_improvement_percent": "number",
    "user_impact_reduced": "boolean",
    "user_impact_reduction_percent": "number",
    "time_to_resolve_ms": "number",
    "effectiveness_score": "0-100",
    "success": "boolean"
  },
  "costAnalysis": {...},
  "recommendations": ["string"],
  "status": "pending|complete|partial"
}
```

### Compare Actions

**Endpoint**: `GET /api/v1/effectiveness/compare/actions`

**Query Parameters**:
- `tenantId` (optional, default: "default")
- `timeRangeHours` (optional, default: 24)

### Pattern Effectiveness

**Endpoint**: `GET /api/v1/effectiveness/pattern/:pattern`

**Query Parameters**:
- `tenantId` (optional)
- `timeRangeHours` (optional)

### Trends

**Endpoint**: `GET /api/v1/effectiveness/trends/:action`

**Query Parameters**:
- `tenantId` (optional)

### Cost Analysis

**Endpoint**: `POST /api/v1/effectiveness/cost-analysis`

Calculates ROI and savings for an action.

### Statistics

**Endpoint**: `GET /api/v1/effectiveness`

**Query Parameters**:
- `tenantId` (optional)

## 📊 Effectiveness Scoring

AIRA calculates effectiveness as:

```
Effectiveness Score = (Error Reduction × 30%) 
                    + (Availability Gain × 30%)
                    + (Latency Reduction × 20%)
                    + (User Impact Reduction × 20%)
                    + (Speed Bonus × 10%)

Where:
- Error Reduction = (Error_Before - Error_After) / Error_Before
- Availability Gain = (Availability_After - Availability_Before)
- Latency Reduction = (Latency_Before - Latency_After) / Latency_Before
- User Impact Reduction = (Users_Before - Users_After) / Users_Before
- Speed Bonus = +10 if resolved in < 1 minute

Score is clamped to 0-100 range
```

### Score Interpretation

| Score | Status | Meaning |
|-------|--------|---------|
| 90-100 | Excellent | Action was highly effective |
| 75-89 | Good | Action resolved incident effectively |
| 60-74 | Fair | Action helped but not optimal |
| < 60 | Poor | Action had minimal impact or made things worse |

## 💰 ROI Calculation

```
Savings = Incident Cost - Action Cost
ROI = (Savings / Action Cost) × 100%

Example:
- Action Cost: $500
- Incident Cost: $50,000
- Savings: $49,500
- ROI: 9,900%
```

## 🧪 Example Effectiveness Workflow

### Scenario: High Error Rate in Payment Service

**1:00 PM - Incident Detected**
```bash
# Record before metrics
curl -X POST http://localhost:5000/api/v1/effectiveness/record-before \
  -H "Content-Type: application/json" \
  -d '{
    "decisionTraceId": "trace-payment-001",
    "tenantId": "acme",
    "metrics": {
      "action": "restart",
      "service": "payment-service",
      "pattern": "high-error-rate",
      "error_rate": 85,
      "availability": 15,
      "p99_latency": 8000,
      "user_impact": 12000,
      "revenue_impact": 120000
    }
  }'
```

**1:02 PM - AIRA Makes Decision**
```bash
# Decision engine evaluates action via dry-run
# Chooses: restart (87% confidence, 90% success probability)
```

**1:03 PM - Action Executed**
```bash
curl -X POST http://localhost:5000/api/v1/effectiveness/record-action \
  -H "Content-Type: application/json" \
  -d '{
    "decisionTraceId": "trace-payment-001",
    "actionId": "action-restart-001",
    "durationMs": 3200,
    "success": true
  }'
```

**1:10 PM - Incident Resolved**
```bash
# Record after metrics
curl -X POST http://localhost:5000/api/v1/effectiveness/record-after \
  -H "Content-Type: application/json" \
  -d '{
    "decisionTraceId": "trace-payment-001",
    "metrics": {
      "error_rate": 2,
      "availability": 98,
      "p99_latency": 300,
      "user_impact": 100,
      "revenue_impact": 500,
      "resolved_at": "2026-04-01T13:10:00Z"
    }
  }'
```

**Analysis Results**:
```json
{
  "effectiveness_score": 96,
  "error_rate_reduction": 97.6%,
  "availability_improvement": 83%,
  "latency_reduction": 96.3%,
  "user_impact_reduction": 99.2%,
  "time_to_resolve": "10 minutes",
  "roi": 23,900% (savings: $119,500 on $500 action cost)
}
```

## 📈 Viewing Effectiveness Data

### Dashboard Queries

**Top Performing Actions (Last 24h)**:
```bash
curl "http://localhost:5000/api/v1/effectiveness/compare/actions?timeRangeHours=24"
```

**Pattern Effectiveness (Payment Errors)**:
```bash
curl "http://localhost:5000/api/v1/effectiveness/pattern/high-error-rate?timeRangeHours=24"
```

**Restart Action Trends**:
```bash
curl "http://localhost:5000/api/v1/effectiveness/trends/restart"
```

**Overall Statistics**:
```bash
curl "http://localhost:5000/api/v1/effectiveness"
```

## 🔄 Integration with DecisionTrace

The effectiveness metrics are automatically linked to DecisionTrace records:

```
DecisionTrace
├── inputs (incident data)
├── reasoning (AIRA's logic)
├── decision (action chosen)
├── actionResult (what happened)
└── effectiveness (NEW!)
    ├── metricsBefore
    ├── metricsAfter
    ├── calculated (score, success, etc)
    └── recommendations
```

## ✅ Phase 3 Completion Checklist

- ✅ Metrics recording (before & after)
- ✅ Effectiveness scoring algorithm
- ✅ Action comparison framework
- ✅ Pattern-based analysis
- ✅ Trend tracking
- ✅ ROI calculation
- ✅ API endpoints (7 endpoints)
- ✅ Integration with DecisionTrace
- ✅ Comprehensive documentation

## 🎯 Next Steps

- Phase 4: Adaptive Confidence - Dynamically adjust confidence weights based on effectiveness
- Phase 5: Integrations - Slack alerts for low effectiveness actions
- Phase 6: Deployment - Package with Docker and Kubernetes
