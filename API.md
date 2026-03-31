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
