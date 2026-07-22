# Phase 2: Policy System Upgrade

## 🎯 Overview

This phase adds **enterprise-grade policy management** to AIRA with:

✅ **Schema Validation** - All policies validated against strict schema before loading
✅ **Dry-Run Mode** - Simulate actions without execution
✅ **Automatic Rollback** - Revert policies when effectiveness drops
✅ **Version Control** - Track all policy versions with effectiveness scores
✅ **Safety Gates** - Prevent dangerous policy configurations

## 📋 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    POLICY MANAGEMENT LAYER                      │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│  Policy Validator    │
│  (Joi Schema)        │◄──── Validates on load
│                      │      - Syntax checking
└──────────────────────┘      - Type validation
                              - Rule verification

         │
         ▼
┌──────────────────────┐
│   Dry-Run Service    │
│  (Simulation)        │◄──── Predicts outcomes
│                      │      - Success probability
└──────────────────────┘      - Blast radius
                              - Side effects

         │
         ▼
┌──────────────────────┐
│  Rollback Service    │
│  (Version Control)   │◄──── Tracks versions
│                      │      - Effectiveness scoring
└──────────────────────┘      - Auto-rollback on degradation
                              - Rollback history logging
```

## 🚀 Quick Start

### 1. Validate a Policy

```bash
curl -X POST http://localhost:5000/api/v1/policy/validate \
  -H "Content-Type: application/json" \
  -d '{
    "policy": {
      "version": "1.0",
      "tenantId": "acme-corp",
      "effectiveFrom": "2026-04-01",
      "rules": [
        {
          "id": "high-severity-restart",
          "description": "Restart service for high-severity incidents",
          "actions": ["restart"],
          "allowedIf": [
            {
              "severity": ["HIGH", "CRITICAL"],
              "confidence": { "min": 0.65 }
            }
          ],
          "denialReason": "Requires HIGH/CRITICAL severity and 65% confidence"
        }
      ],
      "actions": [
        {
          "name": "restart",
          "description": "Service restart",
          "riskLevel": "medium",
          "reversible": true,
          "dryRunAvailable": true
        }
      ]
    }
  }'
```

**Response**:
```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "validatedPolicy": {...},
  "timestamp": "2026-04-01T10:00:00Z"
}
```

### 2. Dry-Run an Action

```bash
curl -X POST http://localhost:5000/api/v1/policy/dry-run \
  -H "Content-Type: application/json" \
  -d '{
    "action": "restart",
    "conditions": {
      "severity": "HIGH",
      "confidence": 0.82,
      "pattern": "high-error-rate",
      "incidentCount": 3
    },
    "incidentData": {
      "affectedServices": ["payment-service", "cache-service"],
      "errorRate": 0.75,
      "latency": 5000
    },
    "policy": {...}
  }'
```

**Response**:
```json
{
  "simulationId": "DRY-1234567890-abc123",
  "action": "restart",
  "policyAllows": true,
  "analysis": {
    "successProbability": 0.88,
    "estimatedDurationMs": 3500,
    "blastRadius": 30,
    "potentialSideEffects": [
      "Brief service unavailability (30-60 seconds)",
      "In-flight requests will be lost",
      "Cache will be cleared"
    ],
    "safetyAssessment": {
      "safe": true,
      "riskLevel": "medium",
      "warnings": []
    }
  },
  "recommendation": {
    "recommendation": "EXECUTE IMMEDIATELY",
    "rationale": ["High success probability and safety confirmed"],
    "confidenceScore": 88.0,
    "estimatedDurationSec": "3.5",
    "maxAffectedPercent": 30
  }
}
```

### 3. Create Policy Version

```bash
curl -X POST http://localhost:5000/api/v1/policy/create-version \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "acme-corp",
    "policyId": "incident-response-v2",
    "createdBy": "alice@acme-corp.com",
    "content": {
      "version": "2.0",
      "tenantId": "acme-corp",
      "effectiveFrom": "2026-04-01",
      "rules": [...]
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "version": "incident-response-v2-1234567890",
  "status": "draft",
  "createdAt": "2026-04-01T10:00:00Z"
}
```

### 4. Activate Policy Version

```bash
curl -X POST http://localhost:5000/api/v1/policy/activate-version \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "acme-corp",
    "policyId": "incident-response-v2",
    "version": "incident-response-v2-1234567890"
  }'
```

**Response**:
```json
{
  "success": true,
  "activatedVersion": "incident-response-v2-1234567890",
  "status": "active",
  "activatedAt": "2026-04-01T10:00:00Z"
}
```

### 5. Compare Action Scenarios

```bash
curl -X POST http://localhost:5000/api/v1/policy/dry-run/compare \
  -H "Content-Type: application/json" \
  -d '{
    "scenarios": [
      {
        "action": "restart",
        "conditions": {"severity": "HIGH", "confidence": 0.82}
      },
      {
        "action": "scale",
        "conditions": {"severity": "HIGH", "confidence": 0.82}
      },
      {
        "action": "circuit-break",
        "conditions": {"severity": "HIGH", "confidence": 0.82}
      }
    ],
    "policy": {...}
  }'
```

**Response**:
```json
{
  "compareCount": 3,
  "scenarios": [
    {
      "action": "restart",
      "severity": "HIGH",
      "recommendation": "EXECUTE IMMEDIATELY",
      "successProbability": 0.88,
      "estimatedDurationMs": 3500,
      "blastRadius": 30,
      "safe": true,
      "riskLevel": "medium"
    },
    {
      "action": "scale",
      "severity": "HIGH",
      "recommendation": "EXECUTE WITH MONITORING",
      "successProbability": 0.79,
      "estimatedDurationMs": 5000,
      "blastRadius": 5,
      "safe": true,
      "riskLevel": "low"
    },
    {
      "action": "circuit-break",
      "severity": "HIGH",
      "recommendation": "DO NOT EXECUTE",
      "successProbability": 0.65,
      "estimatedDurationMs": 500,
      "blastRadius": 20,
      "safe": false,
      "riskLevel": "high"
    }
  ],
  "bestOption": {
    "action": "restart",
    "recommendation": "EXECUTE IMMEDIATELY",
    "successProbability": 0.88
  }
}
```

### 6. Rollback to Previous Version

```bash
curl -X POST http://localhost:5000/api/v1/policy/rollback \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "acme-corp",
    "policyId": "incident-response-v2",
    "targetVersion": "incident-response-v2-1234567890",
    "reason": "New version has 40% failure rate",
    "actor": "alice@acme-corp.com"
  }'
```

**Response**:
```json
{
  "success": true,
  "fromVersion": "incident-response-v2-1234567899",
  "toVersion": "incident-response-v2-1234567890",
  "reason": "New version has 40% failure rate",
  "rollbackAt": "2026-04-01T10:00:00Z"
}
```

## 📚 API Reference

### Policy Validation

**Endpoint**: `POST /api/v1/policy/validate`

Validates a policy against the JSON schema before use.

**Request**:
```json
{
  "policy": {
    "version": "string (required)",
    "tenantId": "string (required)",
    "effectiveFrom": "date (required)",
    "effectiveTo": "date (optional)",
    "description": "string (optional)",
    "rules": [
      {
        "id": "string (required)",
        "description": "string (required)",
        "actions": ["string"] (required)",
        "allowedIf": [
          {
            "severity": ["string"] (optional)",
            "confidence": { "min": 0.0-1.0, "max": 0.0-1.0 } (optional)",
            "pattern": "string (optional)",
            "incidentCount": { "min": 0, "max": 100 } (optional)"
          }
        ] (required)",
        "requiresApproval": "boolean (optional)",
        "denialReason": "string (required)"
      }
    ] (required)",
    "actions": [
      {
        "name": "string (required)",
        "description": "string (required)",
        "riskLevel": "low|medium|high|critical (required)",
        "reversible": "boolean (optional)",
        "dryRunAvailable": "boolean (optional)"
      }
    ] (optional)"
  }
}
```

**Response**:
```json
{
  "valid": true/false,
  "errors": [...],
  "warnings": [...],
  "validatedPolicy": {...},
  "timestamp": "ISO8601"
}
```

### Dry-Run Simulation

**Endpoint**: `POST /api/v1/policy/dry-run`

Simulates action execution to predict outcomes.

**Request**:
```json
{
  "action": "string (required) - Action to simulate",
  "conditions": {
    "severity": "LOW|MEDIUM|HIGH|CRITICAL (required)",
    "confidence": "0.0-1.0 (required)",
    "pattern": "string (optional)",
    "incidentCount": "number (optional)"
  },
  "incidentData": {
    "affectedServices": ["string"],
    "errorRate": "number",
    "latency": "number"
  },
  "policy": "object (optional) - Policy for validation"
}
```

**Response**:
```json
{
  "simulationId": "string",
  "action": "string",
  "policyAllows": true/false,
  "policyDenialReason": "string or null",
  "requiresApproval": true/false,
  "analysis": {
    "successProbability": 0.0-1.0,
    "estimatedDurationMs": "number",
    "blastRadius": "0-100",
    "potentialSideEffects": ["string"],
    "safetyAssessment": {
      "safe": true/false,
      "riskLevel": "low|medium|high|critical",
      "warnings": ["string"]
    }
  },
  "recommendation": {
    "recommendation": "EXECUTE IMMEDIATELY|EXECUTE WITH MONITORING|CONSIDER ALTERNATIVES|DO NOT EXECUTE",
    "rationale": ["string"],
    "confidenceScore": "0-100",
    "estimatedDurationSec": "string"
  }
}
```

### Version Management

#### Create Version
**Endpoint**: `POST /api/v1/policy/create-version`

#### Activate Version
**Endpoint**: `POST /api/v1/policy/activate-version`

#### Rollback
**Endpoint**: `POST /api/v1/policy/rollback`

#### Version History
**Endpoint**: `GET /api/v1/policy/version-history?tenantId=X&policyId=Y`

#### Rollback History
**Endpoint**: `GET /api/v1/policy/rollback-history?tenantId=X&policyId=Y&limit=20`

## 🔒 Policy Schema

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | ✅ | Policy version (e.g., "1.0") |
| `tenantId` | string | ✅ | Tenant identifier |
| `effectiveFrom` | date | ✅ | When policy becomes active |
| `effectiveTo` | date | ❌ | When policy expires |
| `description` | string | ❌ | Policy description |
| `rules` | array | ✅ | Array of decision rules |
| `actions` | array | ❌ | Action configurations |
| `safetyGates` | object | ❌ | Safety gate constraints |
| `monitoring` | object | ❌ | Monitoring configuration |

### Rule Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique rule identifier |
| `description` | string | ✅ | Rule description |
| `actions` | array | ✅ | Actions triggered by rule |
| `allowedIf` | array | ✅ | Conditions to allow action |
| `requiresApproval` | boolean | ❌ | Requires human approval |
| `approvers` | array | ❌ | List of approvers |
| `denialReason` | string | ✅ | Why action denied if unmet |

### Action Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Action identifier |
| `description` | string | ✅ | Action description |
| `riskLevel` | enum | ✅ | low, medium, high, critical |
| `reversible` | boolean | ❌ | Can action be undone |
| `dryRunAvailable` | boolean | ❌ | Supports dry-run |
| `maxBlastRadius` | number | ❌ | Max blast radius percentage |
| `timeout_ms` | number | ❌ | Action timeout |

## 📊 Effectiveness Scoring

AIRA calculates policy effectiveness as:

```
Effectiveness Score = (Success Rate × 80%) + (Resolution Speed × 20%)

Where:
- Success Rate = Successful Actions / Total Actions
- Resolution Speed = 100 - (Average Resolution Time / 1000ms)
```

### Scoring Thresholds

| Score | Status | Action |
|-------|--------|--------|
| 85-100 | Excellent | Keep using |
| 70-84 | Good | Monitor closely |
| 50-69 | Fair | Consider alternatives |
| < 50 | Poor | Auto-rollback triggered |

## 🔄 Automatic Rollback

AIRA automatically rolls back policies when:

1. **Effectiveness drops below 50%** - Immediate auto-rollback
2. **Success rate drops >15% from previous version** - Alert + manual approval required
3. **Blast radius exceeds policy limit** - Rollback recommended

### Monitoring Cycle

- **Frequency**: Every 1 minute
- **Min sample**: 10 incidents before scoring
- **History**: Last 100 effectiveness calculations stored

## 📝 Example Policy

```yaml
version: "2.0"
tenantId: "acme-corp"
effectiveFrom: "2026-04-01"
description: "Incident response policy v2 with improved latency detection"

rules:
  - id: "severe-incident-restart"
    description: "Restart for CRITICAL incidents with high confidence"
    actions: ["restart"]
    allowedIf:
      - severity: ["CRITICAL"]
        confidence: { min: 0.80 }
    denialReason: "CRITICAL severity and 80%+ confidence required"

  - id: "high-incident-circuit-break"
    description: "Circuit break for HIGH incidents"
    actions: ["circuit-break"]
    allowedIf:
      - severity: ["HIGH"]
        confidence: { min: 0.65 }
    denialReason: "HIGH severity and 65%+ confidence required"

  - id: "latency-scale-out"
    description: "Scale out for latency issues"
    actions: ["scale"]
    allowedIf:
      - pattern: "latency"
        confidence: { min: 0.60 }
    denialReason: "Latency pattern and 60%+ confidence required"

  - id: "always-alert"
    description: "Always alert humans"
    actions: ["alert"]
    allowedIf: []
    denialReason: "Alerts always allowed"

actions:
  - name: "restart"
    description: "Service restart"
    riskLevel: "medium"
    reversible: true
    dryRunAvailable: true
    
  - name: "scale"
    description: "Scale replicas"
    riskLevel: "low"
    reversible: true
    dryRunAvailable: true
    
  - name: "circuit-break"
    description: "Activate circuit breaker"
    riskLevel: "medium"
    reversible: true
    dryRunAvailable: true
    
  - name: "alert"
    description: "Alert human operator"
    riskLevel: "low"
    reversible: false
    dryRunAvailable: true

safetyGates:
  requireConfidence: 0.50
  preventConcurrentActions: true
  maxActionsPerIncident: 3
  cooldownBetweenActions_ms: 30000

monitoring:
  trackMetrics: true
  alertOnFailure: true
  alertChannels: ["slack", "pagerduty"]
```

## 🧪 Testing Policy Changes

### Step 1: Create New Version

```bash
curl -X POST http://localhost:5000/api/v1/policy/create-version \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### Step 2: Test with Dry-Run

```bash
curl -X POST http://localhost:5000/api/v1/policy/dry-run/compare \
  -H "Content-Type: application/json" \
  -d '{
    "scenarios": [...],
    "policy": {...}
  }'
```

### Step 3: Analyze Results

Compare success probabilities, blast radius, and safety assessments

### Step 4: Activate After Validation

```bash
curl -X POST http://localhost:5000/api/v1/policy/activate-version \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### Step 5: Monitor Effectiveness

```bash
curl http://localhost:5000/api/v1/policy/version-history?tenantId=X&policyId=Y
```

## 🚨 Troubleshooting

### Policy Validation Fails

```bash
# Check error details
curl -X POST http://localhost:5000/api/v1/policy/validate \
  -H "Content-Type: application/json" \
  -d '{"policy": {...}}'

# Common issues:
# - Missing required fields (version, tenantId, rules)
# - Invalid severity values (must be LOW|MEDIUM|HIGH|CRITICAL)
# - Invalid confidence values (must be 0.0-1.0)
# - Confidence min > max
```

### Dry-Run Returns Low Success Probability

- Review historical outcomes for that action
- Check if conditions match historical success profiles
- Consider using an alternative action
- Use `/policy/dry-run/compare` to compare options

### Auto-Rollback Not Triggered

- Check policy has correct thresholds set
- Ensure enough sample data (min 10 incidents)
- View rollback history: `/policy/rollback-history`
- Check monitoring is enabled

## 📚 Related Documentation

- [README.md](README.md) - Main documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [POLICIES.md](POLICIES.md) - Policy guidelines
- [Phase 1 - Infrastructure Simulation](../infra-simulation/README.md)

## ✅ Phase 2 Completion Checklist

- ✅ Policy schema validation with Joi
- ✅ Dry-run simulation with outcome prediction
- ✅ Automatic policy rollback on degradation
- ✅ Version control and history tracking
- ✅ Effectiveness scoring system
- ✅ API endpoints for all features
- ✅ Comprehensive documentation
- ✅ Example policies and scenarios

## 🎯 Next Steps

- Phase 3: Action Effectiveness Metrics
- Phase 4: Adaptive Confidence Weights
- Phase 5: Slack & Webhook Integrations
- Phase 6: Kubernetes Deployments
