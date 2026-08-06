# AIRA API Reference 
 
*Consolidated from: API.md, API-REFERENCE.md* 
 
--- 
 
# API Reference

**Version**: 2.1  
**Last Updated**: March 29, 2026

---

## Overview

The Decision Engine exposes 6 core APIs for signal submission, decision inspection, and action management. All endpoints require tenant authentication.

**Base URL**: `http://localhost:5000/api/v1`  
**Authentication**: Bearer token via Authorization header

---

## Core Endpoints

### 1. Submit Signal

**Endpoint**: `POST /tenants/:tenantId/signals`

Submit an incident signal for analysis.

**Request**:
```bash
curl -X POST http://localhost:5000/api/v1/tenants/default/signals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "correlationId": "corr-123-456",
    "severity": "HIGH",
    "signals": {
      "errorRate": 0.45,
      "responseTime": 2500,
      "affectedServices": ["payment-api", "cart-service"]
    }
  }'
```

**Response** (201 Created):
```json
{
  "success": true,
  "correlationId": "corr-123-456",
  "decisionId": "dec-789-101",
  "timestamp": "2026-03-29T10:15:30Z",
  "nextCheck": "2026-03-29T10:15:35Z"
}
```

**Parameters**:
- `correlationId`: Unique request identifier (for tracing)
- `severity`: "LOW", "MEDIUM", "HIGH", "CRITICAL"
- `signals`: Object containing metric values

---

### 2. Get Decision Trace

**Endpoint**: `GET /tenants/:tenantId/decisions/:decisionId`

Retrieve the complete reasoning for a decision.

**Request**:
```bash
curl http://localhost:5000/api/v1/tenants/default/decisions/dec-789-101 \
  -H "Authorization: Bearer <token>"
```

**Response** (200 OK):
```json
{
  "success": true,
  "decision": {
    "decisionId": "dec-789-101",
    "tenantId": "default",
    "timestamp": "2026-03-29T10:15:30Z",
    "status": "EXECUTED",
    "phase": "Phase 2: Action Execution",
    
    "analysis": {
      "severity": "HIGH",
      "occurrenceCount": 3,
      "issueType": "latency",
      "errorRate": 0.45,
      "pattern": "Repeated API gateway timeout"
    },
    
    "decision": {
      "action": "restart",
      "reason": "High severity incident detected. Restarting service to recover stability.",
      "confidence": 0.82,
      "confidenceFactors": {
        "patternMatch": 0.40,
        "historicalSuccess": 0.30,
        "signalStrength": 0.15,
        "recency": 0.10,
        "policyAlignment": 0.05
      }
    },
    
    "execution": {
      "status": "SUCCESS",
      "action": "restart",
      "targetService": "payment-api",
      "timestamp": "2026-03-29T10:15:35Z",
      "durationMs": 2100,
      "result": {
        "podsRestarted": 3,
        "isHealthy": true,
        "recoveryTime": 2100
      }
    },
    
    "audit": {
      "auditId": "aud-456-789",
      "signature": "sha256:abc123...",
      "immutable": true
    }
  }
}
```

**Fields**:
- `analysis`: Pattern detection and severity assessment
- `decision`: Action choice with confidence breakdown
- `execution`: Action result and recovery metrics
- `audit`: Immutable decision record with signature

---

### 3. Get Incident Details

**Endpoint**: `GET /tenants/:tenantId/incidents/:incidentId`

Retrieve complete incident information and history.

**Request**:
```bash
curl http://localhost:5000/api/v1/tenants/default/incidents/inc-456-789 \
  -H "Authorization: Bearer <token>"
```

**Response** (200 OK):
```json
{
  "success": true,
  "incident": {
    "incidentId": "inc-456-789",
    "tenantId": "default",
    "createdAt": "2026-03-29T10:00:00Z",
    "status": "RESOLVED",
    
    "signals": [
      {
        "timestamp": "2026-03-29T10:00:00Z",
        "severity": "HIGH",
        "errorRate": 0.42
      },
      {
        "timestamp": "2026-03-29T10:05:00Z",
        "severity": "HIGH",
        "errorRate": 0.45
      }
    ],
    
    "decisions": [
      "dec-789-101",
      "dec-789-102"
    ],
    
    "timeline": [
      { "time": "10:00:00", "event": "Signal detected" },
      { "time": "10:15:30", "event": "Decision made: restart" },
      { "time": "10:15:35", "event": "Action executed" },
      { "time": "10:17:45", "event": "Service healthy" }
    ]
  }
}
```

---

### 4. Get Action Log

**Endpoint**: `GET /tenants/:tenantId/actions/:actionId`

Retrieve execution details for an action.

**Request**:
```bash
curl http://localhost:5000/api/v1/tenants/default/actions/act-321-654 \
  -H "Authorization: Bearer <token>"
```

**Response** (200 OK):
```json
{
  "success": true,
  "action": {
    "actionId": "act-321-654",
    "decisionId": "dec-789-101",
    "action": "restart",
    "status": "SUCCESS",
    "targetService": "payment-api",
    "timestamp": "2026-03-29T10:15:35Z",
    "durationMs": 2100,
    "result": {
      "podsRestarted": 3,
      "isHealthy": true,
      "recoveryTime": 2100
    }
  }
}
```

---

### 5. Dry-Run Action

**Endpoint**: `POST /tenants/:tenantId/actions/:actionId/dry-run`

Simulate a high-risk action without actual execution.

**Request**:
```bash
curl -X POST http://localhost:5000/api/v1/tenants/default/actions/act-321-654/dry-run \
  -H "Authorization: Bearer <token>"
```

**Response** (200 OK):
```json
{
  "success": true,
  "dryRun": {
    "action": "rolling-restart",
    "simulation": "Simulates restart without actual impact",
    "estimatedImpact": {
      "downtime": "0s (rolling)",
      "affectedSessions": 0,
      "recoveryTime": "120s"
    },
    "risks": []
  }
}
```

---

### 6. Get Audit Trail

**Endpoint**: `GET /tenants/:tenantId/audit/:auditId`

Retrieve immutable audit record with signature verification.

**Request**:
```bash
curl http://localhost:5000/api/v1/tenants/default/audit/aud-456-789 \
  -H "Authorization: Bearer <token>"
```

**Response** (200 OK):
```json
{
  "success": true,
  "audit": {
    "auditId": "aud-456-789",
    "tenantId": "default",
    "decisionId": "dec-789-101",
    "action": "DECISION_MADE",
    "userId": "system",
    "timestamp": "2026-03-29T10:15:30Z",
    "changes": {
      "decision": "restart",
      "confidence": 0.82
    },
    "signature": "sha256:abc123def456...",
    "signatureValid": true
  }
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

**Common Error Codes**:
- `UNAUTHORIZED`: Missing or invalid authentication token
- `TENANT_NOT_FOUND`: Tenant does not exist
- `DECISION_NOT_FOUND`: Decision ID not found
- `INVALID_SIGNAL`: Signal missing required fields
- `POLICY_VIOLATION`: Action violates policy rules

---

## Rate Limiting

- **Limit**: 1000 requests/minute per tenant
- **Header**: `X-RateLimit-Remaining: 999`
- **Response**: 429 Too Many Requests when exceeded

---

## Pagination

List endpoints support pagination:

```bash
curl "http://localhost:5000/api/v1/tenants/default/decisions?limit=20&offset=0" \
  -H "Authorization: Bearer <token>"
```

**Parameters**:
- `limit`: Max results (default: 20, max: 100)
- `offset`: Skip N results (default: 0)

---

## Examples

### Complete Decision Lifecycle

```bash
# 1. Submit signal
curl -X POST http://localhost:5000/api/v1/tenants/default/signals \
  -d '{"severity":"HIGH", "signals":{"errorRate":0.45}}' \
  -H "Authorization: Bearer token"
# Response: { "decisionId": "dec-789-101" }

# 2. Check decision (wait 5 seconds)
sleep 5
curl http://localhost:5000/api/v1/tenants/default/decisions/dec-789-101 \
  -H "Authorization: Bearer token"
# Response: { "status": "EXECUTED", "action": "restart" }

# 3. Verify action executed
curl http://localhost:5000/api/v1/tenants/default/incidents/inc-456-789 \
  -H "Authorization: Bearer token"
# Response: { "status": "RESOLVED", "timeline": [...] }
```

---

## Health Check

**Endpoint**: `GET /health`

No authentication required.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-03-29T10:15:30Z"
}
```
 
--- 
 
# AIRA Complete API Reference

## Base URL
```
http://localhost:5000/api/v1
```

## Authentication
All endpoints require the following header (where applicable):
```
Authorization: Bearer YOUR_API_KEY
X-Tenant-ID: your-tenant-id
```

## Response Format
All responses are JSON:
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "error": null,
  "requestId": "uuid-string"
}
```

---

## Phase 1: Core Decision Engine

### Make Decision
**Endpoint**: `POST /tenants/:tenantId/decisions`

**Request**:
```json
{
  "incidentId": "INC-123",
  "pattern": "HighCPU",
  "severity": "high",
  "data": {
    "cpuUsage": 95,
    "affectedServices": ["api-gateway", "payment-service"],
    "duration_minutes": 5
  }
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "decisionTraceId": "trace-abc123",
    "decisionId": "dec-xyz789",
    "action": "Restart pod api-gateway-1",
    "confidence": 0.87,
    "reasoning": "95% CPU indicates resource exhaustion. Restart has 89% success rate for this pattern.",
    "createdAt": "2026-03-15T10:30:00Z"
  }
}
```

**Status Codes**:
- `201`: Decision created successfully
- `400`: Invalid request data
- `401`: Unauthorized
- `409`: Conflicting decision already pending

---

### Execute Decision
**Endpoint**: `POST /tenants/:tenantId/decisions/:decisionId/execute`

**Request**:
```json
{
  "executorId": "user-123",
  "reason": "Auto-approved by approval workflow"
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "decisionId": "dec-xyz789",
    "executionId": "exec-456",
    "status": "EXECUTING",
    "startedAt": "2026-03-15T10:30:15Z",
    "estimatedCompletionTime": "2026-03-15T10:32:00Z"
  }
}
```

---

### List Decisions
**Endpoint**: `GET /tenants/:tenantId/decisions?limit=50&offset=0&status=PENDING`

**Query Parameters**:
- `limit`: Max 100 (default: 50)
- `offset`: Pagination offset (default: 0)
- `status`: PENDING, APPROVED, REJECTED, EXECUTING, COMPLETED, FAILED
- `pattern`: Filter by incident pattern
- `severity`: high, medium, low
- `startDate`: ISO 8601 date
- `endDate`: ISO 8601 date

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "decisions": [
      {
        "decisionId": "dec-xyz789",
        "incidentId": "INC-123",
        "action": "Restart pod",
        "confidence": 0.87,
        "status": "COMPLETED",
        "createdAt": "2026-03-15T10:30:00Z"
      }
    ],
    "total": 1250,
    "limit": 50,
    "offset": 0
  }
}
```

---

### Get Decision Details
**Endpoint**: `GET /tenants/:tenantId/decisions/:decisionId`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "decisionId": "dec-xyz789",
    "decisionTraceId": "trace-abc123",
    "incidentId": "INC-123",
    "pattern": "HighCPU",
    "severity": "high",
    "action": "Restart pod api-gateway-1",
    "confidence": 0.87,
    "executionMode": "APPROVAL",
    "status": "COMPLETED",
    "effectiveness": {
      "beforeScore": 45,
      "afterScore": 89,
      "improvement": 44,
      "improvementPercent": 97.8
    },
    "reasoning": "...",
    "executedAt": "2026-03-15T10:30:15Z",
    "completedAt": "2026-03-15T10:32:00Z"
  }
}
```

---

## Phase 2: Policy Management

### Validate Policy
**Endpoint**: `POST /policy/validate`

**Request**:
```json
{
  "policyId": "policy-default",
  "version": 1,
  "content": {
    "rules": [
      {
        "pattern": "HighCPU",
        "condition": "cpu > 90",
        "action": "Restart pod",
        "confidence_minimum": 0.75
      }
    ]
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": ["Confidence minimum < 0.80 may cause execution issues"],
    "rulesCount": 1
  }
}
```

---

### Dry-Run Policy
**Endpoint**: `POST /policy/dry-run`

**Request**:
```json
{
  "policyId": "policy-default",
  "incidentData": {
    "pattern": "HighCPU",
    "cpuUsage": 95,
    "affectedServices": ["api-gateway"]
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "dryRunId": "dryrun-123",
    "policyId": "policy-default",
    "suggestedAction": "Restart pod api-gateway-1",
    "confidence": 0.87,
    "wouldExecute": false,
    "reasoning": "Confidence 0.87 > 0.75 threshold",
    "risks": ["Potential brief downtime", "May affect active connections"]
  }
}
```

---

### Get Dry-Run Results
**Endpoint**: `GET /policy/dry-run/results?dryRunId=dryrun-123`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "dryRunId": "dryrun-123",
    "status": "COMPLETED",
    "suggestedAction": "Restart pod",
    "confidence": 0.87,
    "simulatedOutcome": {
      "cpuAfter": 25,
      "responseTimeAfter": "120ms",
      "estimatedSaving": "$500"
    }
  }
}
```

---

### Compare Dry-Run Results
**Endpoint**: `POST /policy/dry-run/compare`

**Request**:
```json
{
  "dryRunIds": ["dryrun-123", "dryrun-124"]
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "comparison": [
      {
        "dryRunId": "dryrun-123",
        "action": "Restart pod",
        "confidence": 0.87,
        "effectivenessPrediction": 0.85
      },
      {
        "dryRunId": "dryrun-124",
        "action": "Scale horizontally",
        "confidence": 0.72,
        "effectivenessPrediction": 0.68
      }
    ],
    "recommended": "dryrun-123"
  }
}
```

---

### Create Policy Version
**Endpoint**: `POST /policy/create-version`

**Request**:
```json
{
  "policyId": "policy-default",
  "content": {
    "rules": [
      {
        "pattern": "HighCPU",
        "condition": "cpu > 90",
        "action": "Restart pod",
        "confidence_minimum": 0.80
      }
    ]
  },
  "changelog": "Updated confidence threshold from 0.75 to 0.80"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "policyId": "policy-default",
    "version": 2,
    "createdAt": "2026-03-15T10:30:00Z",
    "status": "INACTIVE",
    "changeCount": 1
  }
}
```

---

### Activate Policy Version
**Endpoint**: `POST /policy/activate-version`

**Request**:
```json
{
  "policyId": "policy-default",
  "version": 2
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "policyId": "policy-default",
    "activeVersion": 2,
    "previousVersion": 1,
    "activatedAt": "2026-03-15T10:31:00Z",
    "rulesUpdated": 1
  }
}
```

---

### Rollback Policy
**Endpoint**: `POST /policy/rollback`

**Request**:
```json
{
  "policyId": "policy-default",
  "rollbackToVersion": 1,
  "reason": "New policy causing false positives"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "policyId": "policy-default",
    "activeVersion": 1,
    "rolledBackFrom": 2,
    "reason": "New policy causing false positives",
    "rolledBackAt": "2026-03-15T10:35:00Z"
  }
}
```

---

## Phase 3: Effectiveness Metrics

### Record Before State
**Endpoint**: `POST /effectiveness/record-before`

**Request**:
```json
{
  "decisionTraceId": "trace-abc123",
  "pattern": "HighCPU",
  "metrics": {
    "cpu_usage": 95,
    "memory_usage": 78,
    "error_rate": 0.08,
    "response_time_p99_ms": 2500,
    "active_connections": 15000,
    "throughput_requests_per_sec": 500
  },
  "affected_services": ["api-gateway", "payment-service"]
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "beforeStateId": "before-123",
    "decisionTraceId": "trace-abc123",
    "pattern": "HighCPU",
    "recordedAt": "2026-03-15T10:30:00Z"
  }
}
```

---

### Record Action Taken
**Endpoint**: `POST /effectiveness/record-action`

**Request**:
```json
{
  "decisionTraceId": "trace-abc123",
  "action": "Restart pod api-gateway-1",
  "duration_seconds": 45,
  "status": "SUCCESS"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "actionId": "action-456",
    "decisionTraceId": "trace-abc123",
    "action": "Restart pod api-gateway-1",
    "completedAt": "2026-03-15T10:31:00Z"
  }
}
```

---

### Record After State
**Endpoint**: `POST /effectiveness/record-after`

**Request**:
```json
{
  "decisionTraceId": "trace-abc123",
  "metrics": {
    "cpu_usage": 25,
    "memory_usage": 42,
    "error_rate": 0.002,
    "response_time_p99_ms": 120,
    "active_connections": 2000,
    "throughput_requests_per_sec": 2000
  }
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "afterStateId": "after-789",
    "decisionTraceId": "trace-abc123",
    "effectiveness": {
      "cpu_improvement_percent": 73.7,
      "error_rate_improvement_percent": 97.5,
      "response_time_improvement_percent": 95.2,
      "overall_effectiveness_score": 88.8
    }
  }
}
```

---

### Get Effectiveness by Decision
**Endpoint**: `GET /effectiveness/:decisionTraceId`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "decisionTraceId": "trace-abc123",
    "pattern": "HighCPU",
    "beforeState": { /* metrics */ },
    "action": "Restart pod",
    "afterState": { /* metrics */ },
    "effectiveness_score": 88.8,
    "success": true,
    "duration_seconds": 45,
    "recommendations": [
      "Consider reducing pod memory limit to prevent similar issues"
    ]
  }
}
```

---

### List Effectiveness Results
**Endpoint**: `GET /effectiveness?pattern=HighCPU&limit=50&offset=0`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "decisionTraceId": "trace-abc123",
        "pattern": "HighCPU",
        "effectiveness_score": 88.8,
        "success": true,
        "createdAt": "2026-03-15T10:30:00Z"
      }
    ],
    "total": 256,
    "averageEffectiveness": 82.3,
    "successRate": 0.94
  }
}
```

---

### Compare Actions
**Endpoint**: `GET /effectiveness/compare/actions`

**Query Parameters**:
- `actions`: Comma-separated list (e.g., "restart,scale,rollback")
- `pattern`: Filter by pattern
- `days`: Look back period (default: 30)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "comparison": [
      {
        "action": "Restart pod",
        "count": 45,
        "avg_effectiveness": 0.88,
        "success_rate": 0.96,
        "avg_duration_seconds": 45
      },
      {
        "action": "Scale horizontally",
        "count": 28,
        "avg_effectiveness": 0.72,
        "success_rate": 0.82,
        "avg_duration_seconds": 180
      },
      {
        "action": "Rollback deployment",
        "count": 12,
        "avg_effectiveness": 0.95,
        "success_rate": 1.0,
        "avg_duration_seconds": 120
      }
    ]
  }
}
```

---

## Phase 4: Adaptive Confidence System

### Record Confidence Prediction
**Endpoint**: `POST /confidence/record-prediction`

**Request**:
```json
{
  "decisionTraceId": "trace-abc123",
  "predicted_confidence": 0.87,
  "confidence_factors": {
    "historical_success_rate": 0.85,
    "similarity_to_past": 0.90,
    "policy_alignment": 0.88,
    "risk_level": 0.80,
    "resource_availability": 0.92
  }
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "predictionId": "pred-123",
    "decisionTraceId": "trace-abc123",
    "predicted_confidence": 0.87,
    "recordedAt": "2026-03-15T10:30:00Z"
  }
}
```

---

### Record Outcome
**Endpoint**: `POST /confidence/record-outcome`

**Request**:
```json
{
  "decisionTraceId": "trace-abc123",
  "actual_success": true,
  "actual_execution_time_ms": 3200,
  "actual_effectiveness_score": 89
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "outcomeId": "out-456",
    "decisionTraceId": "trace-abc123",
    "accuracy_gap": 0.02,
    "prediction_validation": "ACCURATE",
    "metrics": {
      "execution_time_ms": 3200,
      "effectiveness_score": 89
    }
  }
}
```

---

### Get Current Weights
**Endpoint**: `GET /confidence/weights`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "calibrationWeights": {
      "historical_success_rate": 0.35,
      "similarity_to_past": 0.25,
      "policy_alignment": 0.20,
      "risk_level": 0.15,
      "resource_availability": 0.05
    },
    "accuracy_metrics": {
      "overall_accuracy": 0.81,
      "overconfident_percent": 18.5,
      "underconfident_percent": 12.3
    },
    "last_updated": "2026-03-10T00:00:00Z"
  }
}
```

---

### Trigger Recalibration
**Endpoint**: `POST /confidence/recalibrate`

**Request**:
```json
{
  "tenantId": "acme",
  "lookBackDays": 30
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "recalibrationId": "recal-123",
    "weightsUpdated": 3,
    "accuracy_before": 0.78,
    "accuracy_after": 0.83,
    "improvement": 0.05,
    "processedSamples": 156,
    "nextRecalibrationDate": "2026-04-10T00:00:00Z"
  }
}
```

---

### Get Accuracy by Action
**Endpoint**: `GET /confidence/accuracy/by-action`

**Query Parameters**:
- `days`: Look-back period (default: 30)
- `action`: Filter by action type

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "accuracyByAction": [
      {
        "action": "Restart pod",
        "sampleCount": 45,
        "accuracy": 0.91,
        "overconfident_cases": 3,
        "underconfident_cases": 1
      },
      {
        "action": "Scale horizontally",
        "sampleCount": 28,
        "accuracy": 0.72,
        "overconfident_cases": 6,
        "underconfident_cases": 2
      }
    ]
  }
}
```

---

### Get Accuracy by Pattern
**Endpoint**: `GET /confidence/accuracy/by-pattern`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "accuracyByPattern": [
      {
        "pattern": "HighCPU",
        "sampleCount": 87,
        "accuracy": 0.89,
        "accuracy_trend": "IMPROVING"
      },
      {
        "pattern": "DatabaseConnectionPoolExhaustion",
        "sampleCount": 34,
        "accuracy": 0.76,
        "accuracy_trend": "STABLE"
      }
    ]
  }
}
```

---

### Get Confidence Trends
**Endpoint**: `GET /confidence/trends`

**Query Parameters**:
- `periods`: Number of periods to include (default: 7)
- `interval`: "hourly", "daily", "weekly" (default: "daily")

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "trends": [
      {
        "period": "2026-03-09",
        "avg_confidence": 0.84,
        "avg_accuracy": 0.79,
        "decisions_count": 23,
        "success_rate": 0.91
      },
      {
        "period": "2026-03-10",
        "avg_confidence": 0.86,
        "avg_accuracy": 0.82,
        "decisions_count": 31,
        "success_rate": 0.94
      }
    ]
  }
}
```

---

## Phase 5: Integration Webhooks

### Register Webhook Source
**Endpoint**: `POST /integrations/webhooks/register`

**Request**:
```json
{
  "sourceConfig": {
    "name": "datadog-prod",
    "type": "datadog",
    "enabled": true,
    "apiKey": "your-datadog-api-key",
    "site": "datadoghq.com"
  }
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "sourceId": "source-123",
    "name": "datadog-prod",
    "type": "datadog",
    "status": "ACTIVE",
    "createdAt": "2026-03-15T10:30:00Z"
  }
}
```

---

### Ingest Webhook Event
**Endpoint**: `POST /integrations/webhooks/ingest`

**Request**:
```json
{
  "sourceId": "source-123",
  "eventPayload": {
    "alert_transition": "triggered",
    "alert_title": "High Error Rate",
    "alert_metric": "errors{host:web-prod-01}"
  }
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "eventId": "evt-123",
    "sourceId": "source-123",
    "status": "PROCESSING",
    "aiiraDecisionPending": true
  }
}
```

---

### Record Decision for Event
**Endpoint**: `POST /integrations/webhooks/:eventId/decision`

**Request**:
```json
{
  "decisionTraceId": "trace-abc123",
  "action": "Restart pod",
  "confidence": 0.87
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "eventId": "evt-123",
    "decisionTraceId": "trace-abc123",
    "linkedAt": "2026-03-15T10:30:00Z"
  }
}
```

---

### Get Webhook History
**Endpoint**: `GET /integrations/webhooks/history?sourceId=source-123&limit=50`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "eventId": "evt-123",
        "sourceId": "source-123",
        "title": "High Error Rate",
        "status": "PROCESSED",
        "hasDecision": true,
        "receivedAt": "2026-03-15T10:30:00Z"
      }
    ],
    "total": 256
  }
}
```

---

### Get Webhook Statistics
**Endpoint**: `GET /integrations/webhooks/stats`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "stats": {
      "total_events": 1250,
      "processed_events": 1198,
      "pending_events": 52,
      "avg_processing_time_ms": 2340,
      "events_per_source": {
        "datadog": 654,
        "prometheus": 423,
        "pagerduty": 173
      }
    }
  }
}
```

---

### Slack Notification
**Endpoint**: `POST /integrations/slack/notify`

**Request**:
```json
{
  "channel": "#incident-response",
  "decisionData": {
    "incidentId": "INC-123",
    "action": "Restart pod payment-service-1",
    "confidence": 0.87,
    "severity": "high"
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "messageId": "msg-123",
    "channel": "#incident-response",
    "sentAt": "2026-03-15T10:30:00Z"
  }
}
```

---

## Phase 8: Execution Modes

### Set Default Execution Mode
**Endpoint**: `POST /execution/config/default-mode`

**Request**:
```json
{
  "tenantId": "acme",
  "mode": "APPROVAL"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "tenantId": "acme",
    "defaultMode": "APPROVAL",
    "updatedAt": "2026-03-15T10:30:00Z"
  }
}
```

---

### Set Action-Specific Mode
**Endpoint**: `POST /execution/config/action-mode`

**Request**:
```json
{
  "tenantId": "acme",
  "action": "restart",
  "mode": "AUTO"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "tenantId": "acme",
    "action": "restart",
    "mode": "AUTO",
    "updatedAt": "2026-03-15T10:30:00Z"
  }
}
```

---

### Create Execution Request
**Endpoint**: `POST /execution/requests`

**Request**:
```json
{
  "decisionTraceId": "trace-abc123",
  "tenantId": "acme",
  "executionMode": "APPROVAL"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "executionRequestId": "req-123",
    "decisionTraceId": "trace-abc123",
    "status": "PENDING_APPROVAL",
    "mode": "APPROVAL",
    "createdAt": "2026-03-15T10:30:00Z",
    "expiresAt": "2026-03-15T15:30:00Z"
  }
}
```

---

### Approve Request
**Endpoint**: `POST /execution/requests/:decisionTraceId/approve`

**Request**:
```json
{
  "approverId": "user-123",
  "approverEmail": "ops@acme.com",
  "approvalNotes": "Approved after reviewing metrics"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "executionRequestId": "req-123",
    "status": "APPROVED",
    "approvedBy": "user-123",
    "approvedAt": "2026-03-15T10:31:00Z"
  }
}
```

---

### Reject Request
**Endpoint**: `POST /execution/requests/:decisionTraceId/reject`

**Request**:
```json
{
  "rejectorId": "user-456",
  "rejectionReason": "Waiting for deployment window"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "executionRequestId": "req-123",
    "status": "REJECTED",
    "rejectedBy": "user-456",
    "rejectedAt": "2026-03-15T10:35:00Z"
  }
}
```

---

### Mark Execution Started
**Endpoint**: `POST /execution/requests/:decisionTraceId/execute`

**Request**:
```json{
  "executorId": "system"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "executionRequestId": "req-123",
    "status": "EXECUTING",
    "executionStartedAt": "2026-03-15T10:31:15Z"
  }
}
```

---

### Mark Execution Completed
**Endpoint**: `POST /execution/requests/:decisionTraceId/complete`

**Request**:
```json
{
  "status": "SUCCESS",
  "result": {
    "podsRestarted": ["api-gateway-1"],
    "executionTimeMs": 3200
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "executionRequestId": "req-123",
    "status": "COMPLETED",
    "completedAt": "2026-03-15T10:32:00Z",
    "result": { /* provided data */ }
  }
}
```

---

### Get Pending Approvals
**Endpoint**: `GET /execution/approvals/pending?limit=50`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "pendingRequests": [
      {
        "executionRequestId": "req-123",
        "decisionTraceId": "trace-abc123",
        "action": "Restart pod payment-service-1",
        "severity": "high",
        "createdAt": "2026-03-15T10:30:00Z",
        "expiresAt": "2026-03-15T15:30:00Z",
        "requiredApprovers": 2,
        "approvalsReceived": 0
      }
    ],
    "total": 12
  }
}
```

---

### Get Execution Statistics
**Endpoint**: `GET /execution/stats?days=30`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "stats": {
      "total_requests": 156,
      "by_mode": {
        "AUTO": 92,
        "APPROVAL": 52,
        "SUGGEST_ONLY": 12
      },
      "by_status": {
        "COMPLETED": 148,
        "FAILED": 4,
        "PENDING": 4
      },
      "avg_approval_time_minutes": 8.3,
      "success_rate": 0.97
    }
  }
}
```

---

## Phase 10: Reporting

### Generate Effectiveness Report
**Endpoint**: `POST /reports/effectiveness`

**Request**:
```json
{
  "startDate": "2026-03-01T00:00:00Z",
  "endDate": "2026-03-31T23:59:59Z",
  "groupBy": "action"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "reportId": "report-123",
    "type": "effectiveness",
    "summary": {
      "totalIncidents": 156,
      "successRate": 0.874,
      "avgEffectiveness": 82.1,
      "totalCostSavings": 850000
    },
    "metrics": {
      "avgResolutionTime": "8.5 minutes",
      "avgDowntimeAverted": "15.2 minutes",
      "roi": "2125%"
    },
    "findings": [
      "Restart pod actions have highest success rate (96%)",
      "Database failover actions need policy review (76% success)"
    ],
    "generatedAt": "2026-03-15T10:30:00Z"
  }
}
```

---

### Generate Failure Analysis Report
**Endpoint**: `POST /reports/failure-analysis`

**Request**:
```json
{
  "startDate": "2026-03-01T00:00:00Z",
  "endDate": "2026-03-31T23:59:59Z"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "reportId": "report-124",
    "type": "failure-analysis",
    "summary": {
      "totalIncidents": 156,
      "failureCount": 22,
      "failureRate": 0.141
    },
    "rootCauseAnalysis": [
      {
        "cause": "Incorrect policy decision",
        "count": 7,
        "percent": 31.8,
        "examples": ["INC-123", "INC-145"]
      },
      {
        "cause": "Degraded observability",
        "count": 5,
        "percent": 22.7,
        "examples": ["INC-156", "INC-178"]
      }
    ],
    "recommendations": [
      "Review policy rules for false positives",
      "Implement observability SLOs"
    ],
    "generatedAt": "2026-03-15T10:30:00Z"
  }
}
```

---

### Generate Confidence Calibration Report
**Endpoint**: `POST /reports/confidence-calibration`

**Request**:
```json
{
  "startDate": "2026-03-01T00:00:00Z",
  "endDate": "2026-03-31T23:59:59Z"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "reportId": "report-125",
    "type": "confidence-calibration",
    "summary": {
      "totalPredictions": 234,
      "overallAccuracy": 0.812,
      "overconfidentCases": 18.5,
      "underconfidentCases": 12.3
    },
    "accuracyByConfidenceLevel": [
      {
        "confidenceRange": "0.80-1.00",
        "count": 156,
        "actualSuccessRate": 0.88
      },
      {
        "confidenceRange": "0.60-0.80",
        "count": 56,
        "actualSuccessRate": 0.71
      }
    ],
    "factorPerformance": [
      {
        "factor": "historical_success_rate",
        "weight": 0.35,
        "accuracy": 0.89,
        "impact": "HIGH"
      },
      {
        "factor": "similarity_to_past",
        "weight": 0.25,
        "accuracy": 0.84,
        "impact": "MEDIUM"
      }
    ],
    "recommendations": [
      "Increase weight for historical_success_rate (highest accuracy)",
      "Review similarity_to_past calculation"
    ],
    "generatedAt": "2026-03-15T10:30:00Z"
  }
}
```

---

### Generate Executive Summary Report
**Endpoint**: `POST /reports/executive-summary`

**Request**:
```json
{
  "startDate": "2026-03-01T00:00:00Z",
  "endDate": "2026-03-31T23:59:59Z"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "reportId": "report-126",
    "type": "executive-summary",
    "summary": {
      "period": "March 2026",
      "incidentsHandled": 156,
      "ROI": "2125%",
      "costSavings": 850000,
      "avgResolutionTime": "8.5 min"
    },
    "businessImpact": {
      "downtimeAverted": "12.8 hours",
      "revenueProtected": 425000,
      "customerSatisfactionImprovement": "8.5%"
    },
    "performance": {
      "successRate": 0.874,
      "avgEffectiveness": 82.1,
      "trend": "IMPROVING"
    },
    "topActions": [
      {
        "action": "Restart pod",
        "count": 78,
        "effectiveness": 0.92
      }
    ],
    "riskAreas": [
      "Database failover has 76% success rate",
      "Scale operations approval time > 15 min"
    ],
    "recommendations": [
      "Expand auto-execution for restart actions",
      "Review database failover policies",
      "Implement approval SLA management"
    ],
    "generatedAt": "2026-03-15T10:30:00Z"
  }
}
```

---

### List Reports
**Endpoint**: `GET /reports?type=effectiveness&limit=50&offset=0`

**Query Parameters**:
- `type`: effectiveness, failure-analysis, confidence-calibration, executive-summary
- `limit`: Max 100 (default: 50)
- `offset`: Pagination offset

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "reportId": "report-123",
        "type": "effectiveness",
        "period": "2026-03-01 to 2026-03-31",
        "summary": {
          "totalIncidents": 156,
          "successRate": 0.874
        },
        "generatedAt": "2026-03-15T10:30:00Z"
      }
    ],
    "total": 45,
    "limit": 50,
    "offset": 0
  }
}
```

---

### Get Specific Report
**Endpoint**: `GET /reports/:reportId`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "reportId": "report-123",
    "type": "effectiveness",
    "summary": { /* ... */ },
    "metrics": { /* ... */ },
    "findings": [ /* ... */ ],
    "recommendations": [ /* ... */ ],
    "generatedAt": "2026-03-15T10:30:00Z"
  }
}
```

---

### Archive Report
**Endpoint**: `POST /reports/:reportId/archive`

**Request**:
```json
{
  "reason": "Quarterly review complete"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "reportId": "report-123",
    "status": "ARCHIVED",
    "archivedAt": "2026-03-15T10:30:00Z"
  }
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Missing required field: action",
    "details": {
      "field": "action",
      "reason": "required"
    }
  },
  "requestId": "uuid-string"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_REQUEST | 400 | Request validation failed |
| UNAUTHORIZED | 401 | Missing or invalid auth |
| FORBIDDEN | 403 | User doesn't have permission |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Request conflicts with state |
| INTERNAL_ERROR | 500 | Server error |

---

## Rate Limiting

- **Default**: 1000 requests per hour per tenant
- **Headers**:
  - `X-RateLimit-Limit`: 1000
  - `X-RateLimit-Remaining`: 945
  - `X-RateLimit-Reset`: 1710491400

When limit exceeded, returns `429 Too Many Requests`.

---

## Pagination

All list endpoints support pagination:

**Query Parameters**:
- `limit`: Max 100 (default: 50)
- `offset`: Starting position (default: 0)
- `sort`: Field and direction (e.g., "createdAt:desc")

**Response**:
```json
{
  "success": true,
  "data": {
    "items": [ /* ... */ ],
    "total": 1250,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Webhooks (Incoming)

### Datadog Alert Webhook

```bash
POST /api/v1/integrations/webhooks/datadog
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "alert_transition": "triggered",
  "alert_title": "High Error Rate",
  "alert_metric": "trace.web.request.errors{host:web-prod-01}",
  "alert_status": "alert",
  "org": {"name": "acme-corp"},
  "last_updated": 1710491400
}
```

### Prometheus AlertManager Webhook

```bash
POST /api/v1/integrations/webhooks/prometheus
Content-Type: application/json

{
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "HighErrorRate",
        "severity": "critical"
      },
      "annotations": {
        "summary": "Error rate > 5%"
      },
      "startsAt": "2026-03-15T10:30:00Z"
    }
  ]
}
```

---

## Conclusion

This API reference covers all 55+ endpoints across all 10 phases. For more details on specific integrations, see:
- [DEPLOYMENT-INTEGRATION-GUIDE.md](DEPLOYMENT-INTEGRATION-GUIDE.md)
- [PHASES-4-10-COMPLETE.md](PHASES-4-10-COMPLETE.md)
