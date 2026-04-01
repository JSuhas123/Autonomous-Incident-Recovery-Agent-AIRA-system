# AIRA v3.0: Production-Grade Autonomous Incident Recovery System

## Overview

This document describes the production-grade upgrade to the Autonomous Incident Decision Engine (AIRA). The system now includes:

1. **Kubernetes Integration** - Direct cluster integration for pod/deployment management
2. **Confidence-Based Decision System** - Scored decisions with three tiers of action
3. **Human-in-the-Loop Approval** - Middleware approval workflow for mid-confidence decisions  
4. **Comprehensive Testing** - Unit, integration, and chaos test suites

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   OBSERVABILITY SYSTEMS                     │
│         (Datadog, Prometheus, Log Analytics, etc.)          │
└──────────────────────┬──────────────────────────────────────┘
                       │ (Raw Signals)
                       ▼
        ┌──────────────────────────────────┐
        │    DECISION ENGINE (AIRA v3.0)   │
        ├──────────────────────────────────┤
        │  Signal Analysis                 │
        │  ├─ Pattern Detection            │
        │  └─ Severity Assessment          │
        │                                  │
        │  Confidence Scoring (0.0-1.0)    │
        │  ├─ Pattern Match (40%)          │
        │  ├─ Historical Success (30%)     │
        │  ├─ Signal Strength (15%)        │
        │  ├─ Recency (10%)                │
        │  └─ Policy Alignment (5%)        │
        │                                  │
        │  Decision Tier Classification    │
        │  ├─ AUTO_EXECUTE (≥0.85)         │
        │  ├─ ESCALATE (0.60-0.85)         │
        │  └─ OBSERVE (<0.60)              │
        └──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
   ┌────▼────┐             ┌─────────▼──────┐
   │ Confidence ≥ 0.85     │ Confidence 0.60-0.85
   │ AUTO-EXECUTE          │ REQUIRES APPROVAL
   │ (Direct K8s action)   │ (Queue for human)
   │                       │
   │ No approval needed    │ ┌─────────────────┐
   └────────────────────────┤   Approval Queue  │
                            │  (MongoDB/Redis) │
                            ├─────────────────┤
                            │ Pending/Approved │
                            │ Rejected/Expired │
                            └────────┬─────────┘
                                     │
                            ┌────────▼─────────┐
                            │ Human Reviews    │
                            │  (Team/On-call)  │
                            └────────┬─────────┘
                                     │
                ┌────────────────────┴────────────────────┐
                │                                         │
          ┌─────▼──────┐                           ┌──────▼──────┐
          │ APPROVED   │                           │  REJECTED   │
          │ Execute K8s│                           │  Log + Alert│
          └─────┬──────┘                           └─────────────┘
                │
        ┌───────▼────────────────┐
        │  KUBERNETES CLUSTER    │
        ├────────────────────────┤
        │ • Pod Restart          │
        │ • Deployment Restart   │
        │ • Scaling              │
        │ • (Extensible)         │
        └────────────────────────┘
```

---

## Component Details

### 1. Kubernetes Integration (`backend/services/k8s/`)

**Purpose:** Abstraction layer for Kubernetes cluster operations

**File:** `k8sClient.js`

**Features:**
- Pod restart (via deletion, triggers automatic recreation)
- Deployment rollout restart (updates annotations to trigger new pods)
- Deployment scaling (adjust replica count)
- Automatic retries with exponential backoff (configurable)
- API failure handling with classification (retryable vs. permanent)
- Comprehensive logging at every step

**Supported Actions:**
```javascript
await k8sClient.executeAction('restart_pod', {
  resource: 'api-gateway-pod-1',
  namespace: 'production'
});

await k8sClient.executeAction('restart_deployment', {
  resource: 'web-service-deployment',
  namespace: 'production'
});

await k8sClient.executeAction('scale_deployment', {
  resource: 'web-service-deployment',
  replicas: 10,
  namespace: 'production'
});
```

**Configuration (Environment Variables):**
```bash
# Path to kubeconfig file (uses default locations if not set)
KUBECONFIG=/path/to/kubeconfig

# Default namespace for operations
K8S_NAMESPACE=default

# API timeout in milliseconds
K8S_API_TIMEOUT=30000

# Retry configuration
K8S_MAX_RETRIES=3
K8S_RETRY_BACKOFF_MS=1000  # Initial backoff, increases exponentially
```

**Integration with Runbook Execution:**
```javascript
// In server.js startup, the K8s handler is automatically registered:
runbookExecutionService.registerHandler('kubernetes', async (step, context) => {
  // Handler calls K8sClient.executeAction()
  // Returns success/failure with full logging
});

// YAML runbooks can now specify K8s actions:
/*
steps:
  - name: "Restart failing pod"
    type: "kubernetes"
    action: "restart_pod"
    params:
      resource: "api-pod-1"
      namespace: "production"
*/
```

---

### 2. Approval System (`backend/services/approval/`)

**Purpose:** Human-in-the-loop approval for mid-confidence decisions

#### Components:

**A) ApprovalQueue (`approvalQueue.js`)**
- Stores pending approval requests
- Supports both in-memory and Redis-backed storage
- Auto-expiration via MongoDB TTL index
- Fast retrieval with memory cache

**B) ApprovalService (`approvalService.js`)**
- Decision tier classification
- Approval request creation
- Approval workflow orchestration
- Status tracking and statistics

**C) ApprovalRequest Model (`backend/models/ApprovalRequest.js`)**
- MongoDB schema with full audit trail
- TTL index for automatic expiration
- Approval/rejection tracking
- Decision trace preservation

#### API Endpoints:

**List pending approvals:**
```bash
GET /api/v1/tenants/{tenantId}/approvals

Response:
{
  "tenantId": "tenant-1",
  "pendingCount": 3,
  "pending": [
    {
      "approvalId": "appr-123-456",
      "action": "restart_deployment",
      "reason": "Memory leak detected",
      "confidence": 0.72,
      "resource": "cache-service-deployment",
      "severity": "medium",
      "createdAt": "2026-04-01T10:30:00Z",
      "expiresAt": "2026-04-01T11:30:00Z",
      "expiresIn": "3599s"
    }
  ]
}
```

**Get approval status:**
```bash
GET /api/v1/tenants/{tenantId}/approvals/{approvalId}

Response:
{
  "approvalId": "appr-123-456",
  "status": "pending",
  "action": "restart_deployment",
  "confidence": 0.72,
  "resource": "cache-service-deployment",
  "createdAt": "2026-04-01T10:30:00Z",
  "expiresAt": "2026-04-01T11:30:00Z",
  "approvedBy": null,
  "rejectedBy": null
}
```

**Approve and queue for execution:**
```bash
POST /api/v1/tenants/{tenantId}/approvals/{approvalId}/approve

Body:
{
  "approvedBy": "ops-team-lead-123",
  "comment": "Approved - cache service needs memory management"
}

Response:
{
  "approvalId": "appr-123-456",
  "status": "approved",
  "message": "Approval granted. Action is now approved for execution.",
  "action": "restart_deployment",
  "approvedBy": "ops-team-lead-123",
  "timestamp": "2026-04-01T10:35:00Z"
}
```

**Reject with reason:**
```bash
POST /api/v1/tenants/{tenantId}/approvals/{approvalId}/reject

Body:
{
  "rejectedBy": "ops-manager",
  "reason": "Production deployment in progress - cannot restart now"
}

Response:
{
  "approvalId": "appr-123-456",
  "status": "rejected",
  "message": "Approval request has been rejected.",
  "rejectedBy": "ops-manager",
  "reason": "Production deployment in progress - cannot restart now",
  "timestamp": "2026-04-01T10:35:00Z"
}
```

**Queue statistics:**
```bash
GET /api/v1/tenants/{tenantId}/approvals/queue/stats

Response:
{
  "tenantId": "tenant-1",
  "queue": {
    "pending": 5,
    "approved": 12,
    "rejected": 3,
    "backend": "memory",
    "memoryStoreSize": 5
  }
}
```

---

### 3. Confidence-Based Decision System (Existing)

**Tiers:**

1. **AUTO_EXECUTE** (confidence ≥ 0.85)
   - Automatically executed without approval
   - Suitable for high-confidence, well-validated decisions
   - Full audit trail maintained
   - Examples: Known patterns, repeated successful interventions

2. **ESCALATE** (confidence 0.60-0.85)
   - Requires human approval before execution
   -  Approval request created and queued
   - 10-minute timeout (configurable)
   - Examples: Pattern match with low historical success, new scenarios

3. **OBSERVE** (confidence < 0.60)
   - Blocked from execution
   - Logged for learning and trend analysis
   - Might trigger alerts but won't execute
   - Examples: Ambiguous signals, insufficient evidence

**Configuration:**
```bash
# Threshold for automatic execution
AUTO_EXECUTE_THRESHOLD=0.85

# Threshold for requiring approval
ESCALATION_THRESHOLD=0.60

# Timeout for approval requests (milliseconds)
APPROVAL_TIMEOUT_MS=600000  # 10 minutes
```

---

## Decision Flow: Complete Example

### Scenario: High CPU Detection on API Gateway

**Step 1: Signal Input**
```javascript
{
  service: 'api-gateway',
  metric: 'cpu_usage',
  value: 95,
  threshold: 80,
  severity: 'high'
}
```

**Step 2: Analysis Agent**
```javascript
{
  issueType: 'cpu_spike',
  severity: 'high',
  occurrenceCount: 1,
  confidence: 0.92
}
```

**Step 3: Decision Agent**
- Matches policy: "Restart on high CPU"
- Calculates confidence: 0.92 (92%)
- Creates decision

**Step 4: Confidence Evaluation**
- Confidence 0.92 ≥ 0.85 (AUTO_EXECUTE threshold)
- **Action:** Auto-execute immediately

**Step 5: K8s Execution**
```javascript
await k8sClient.restartDeployment('api-gateway-deployment', 'production')
// Kubernetes recreates pods
// New pods start, old pods drain connections
// System recovers
```

**Step 6: Audit Trail**
- Full decision trace logged
- Execution result recorded
- Metrics updated

### Scenario 2: Memory Leak Possible

**Step 1: Signal Input**
```javascript
{
  service: 'cache-service',
  metric: 'memory_usage',
  value: 85,
  threshold: 75,
  severity: 'medium'
}
```

**Step 2: Analysis Agent**
```javascript
{
  issueType: 'memory_leak_possible',
  severity: 'medium',
  occurrenceCount: 2,
  confidence: 0.72
}
```

**Step 3: Decision Agent**
- Matches policy: "Scale on memory"
- Calculates confidence: 0.72 (72%)
- Creates decision

**Step 4: Confidence Evaluation**
- Confidence 0.72 is in range [0.60, 0.85] (ESCALATE)
- **Action:** Create approval request

**Step 5: Approval Queue**
```javascript
ApprovalRequest {
  approvalId: 'appr-456',
  action: 'scale_deployment',
  resource: 'cache-service-deployment',
  confidence: 0.72,
  status: 'pending',
  expiresAt: 'now + 10 minutes'
}
```

**Step 6: Human Review**
- Operations team gets notification
- Reviews decision trace, confidence factors, historical data
- Approves with comment: "Approved - cache needs scaling"
- Or rejects: "Production deployment in progress"

**Step 7: If Approved - K8s Execution**
```javascript
await k8sClient.scaleDeployment(
  'cache-service-deployment',
  10,  // replicas
  'production'
)
```

**Step 8: Audit Trail**
- Full approval workflow logged
- Approver identification
- Timestamps for SLA tracking
- Complete decision context preserved

---

## Testing Strategy

### Unit Tests

**K8sClient Tests** (`backend/tests/unit/k8sClient.test.js`)
- 42 test cases covering:
  - Client initialization and configuration
  - Environment variable handling
  - Error classification (retryable vs. permanent)
  - Action validation (pod restart, deployment restart, scaling)
  - Timeout and retry configuration
  - Cluster isolation and no hardcoded details
  - Operation logging with correlation IDs

**ApprovalService Tests** (`backend/tests/unit/approvalService.test.js`)
- 30 test cases covering:
  - Confidence-based approval requirements
  - Threshold edge cases
  - Approval request creation
  - Approval/rejection workflows
  - Timeout handling
  - Decision metadata capture
  - Tenant isolation
  - Queue statistics
  - Error scenarios

### Integration Tests

**E2E Approval Workflow** (`backend/tests/integration/e2e-approval-flow.test.js`)

Six complete scenarios:

**Scenario 1: High Confidence Auto-Execution**
- Signal → Analysis → Decision (confidence 0.92)
- Automatic execution without approval
- Verifies immediate K8s action
- Full audit trail validation

**Scenario 2: Medium Confidence - Approval Required**
- Signal → Analysis → Decision (confidence 0.73)
- Approval request created
- Human review workflow
- Approval/rejection handling
- Post-approval execution readiness

**Scenario 3: Low Confidence - Observe Only**
- Signal → Analysis → Decision (confidence 0.35)
- Blocked from execution
- Monitoring only mode
- Learning data collected

**Scenario 4: Timeout and Expiration**
- Approval request created
- Expiration time validation
- Auto-cleanup after timeout

**Scenario 5: Complete Decision Trace**
- Comprehensive decision with full context
- Signal → Analysis → Policy → Safety Gates
- Confidence breakdown by factors
- Full trace preservation through workflow
- Trace retrievability for audit

**Scenario 6: Kubernetes Integration**
- K8s action parameters validation
- Resource and namespace specification
- Supported action types
- Parameter preservation

### Chaos Tests (To Be Created)

Structure ready in `backend/tests/integration/`:

**Planned Scenarios:**
1. **Pod Crash During Restart**
   - K8s API returns pod not found
   - Retry logic validation
   - Error handling

2. **Network Delay**
   - Simulated API latency
   - Timeout handling
   - Graceful degradation

3. **K8s API Failure**
   - Mock API returns 503
   - Retry with backoff
   - Circuit breaker integration

4. **Approval Timeout**
   - Automatic expiration
   - Cleanup job validation
   - Resource release

---

## Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run specific test file
npm test -- backend/tests/unit/k8sClient.test.js

# Run with coverage
npm run test:coverage

# Run specific test scenario
npm test -- -t "High Confidence"
```

---

## Deployment Checklist

- [ ] **Pre-Deployment**
  - [ ] Review ARCHITECTURE.md for system design
  - [ ] Set environment variables in `.env`
  - [ ] Verify Kubernetes cluster access (test with `kubectl`)
  - [ ] Ensure MongoDB connection
  - [ ] Ensure Redis connection (for approval queue)

- [ ] **Environment Setup**
  ```bash
  # Kubernetes access
  export KUBECONFIG=/path/to/kubeconfig
  export K8S_NAMESPACE=production
  
  # Approval system
  export APPROVAL_TIMEOUT_MS=600000
  export APPROVAL_QUEUE_BACKEND=redis
  
  # Confidence thresholds
  export AUTO_EXECUTE_THRESHOLD=0.85
  export ESCALATION_THRESHOLD=0.60
  ```

- [ ] **Testing**
  - [ ] Run full test suite
  - [ ] Validate K8s connectivity
  - [ ] Test approval workflow with mock data
  - [ ] Verify decision traces in database

- [ ] **Kubernetes Preparation**
  - [ ] RBAC: Service account with pod/deployment permissions
  - [ ] Network: K8s API accessibility from application pod
  - [ ] KUBECONFIG: Mounted or configured
  - [ ] Resource limits: Set appropriate limits

- [ ] **Monitoring Setup**
  - [ ] Approval queue metrics
  - [ ] Decision tier distribution
  - [ ] K8s action success/failure rates
  - [ ] Approval timeout rates

- [ ] **Post-Deployment**
  - [ ] Verify health endpoints
  - [ ] Check approval queue is empty
  - [ ] Test with low-confidence decisions first
  - [ ] Monitor logs for errors

---

## Safety Guarantees

1. **No Hardcoded Cluster Details**
   - All K8s configuration from environment variables
   - Multi-cluster support possible

2. **Automatic Expiration**
   - Approval requests expire after 10 minutes (configurable)
   - MongoDB TTL index automatically cleans up
   - No manual cleanup required

3. **Audit Trail**
   - Every decision logged with full context
   - Approval/rejection fully tracked
   - Timestamps for SLA monitoring

4. **Idempotent Operations**
   - Pod deletion is idempotent (can retry safely)
   - Deployment restarts are idempotent
   - Scaling is idempotent

5. **Tenant Isolation**
   - Approvals scoped to tenant
   - No cross-tenant data leakage
   - RBAC enforced at API level

---

## Architecture Decisions

### Why MongoDB for Approval Requests?

- **Durability:** Approval decisions must be persistent
- **TTL Index:** Automatic expiration without cleanup jobs
- **ACID:** Atomic status transitions
- **Audit Trail:** Full document history with timestamps
- **Query Performance:** Indexed lookups by tenant, status, creation time

### Why Handler Registration Pattern?

- **Extensibility:** New K8s actions can be added without core changes
- **Testability:** Handlers can be mocked
- **Decoupling:** Runbook executor doesn't need K8s knowledge
- **Separation of Concerns:** Each layer has single responsibility

### Why Confidence Tiers?

- **Simplicity:** Three clear states instead of complex probability handling
- **Operational Clarity:** Teams understand tier meanings
- **Audit Trail:** Tier recorded with every decision
- **Safety:** High confidence gets auto-execution, medium requires human

---

## Future Enhancements

1. **Additional K8s Actions**
   - Rollback deployments
   - Node draining
   - StatefulSet scaling
   - DaemonSet updates

2. **Approval Enhancements**
   - Multi-step approval workflows
   - RBAC-based approval authorization
   - Webhook notifications to Slack/Teams
   - Bulk approval operations

3. **Decision Learning**
   - Feedback scores on approval outcomes
   - Confidence threshold auto-adjustment
   - Historical success rate tracking
   - Seasonal pattern detection

4. **Chaos Engineering**
   - Automated chaos test suite
   - Failure injection scenarios
   - Recovery time metrics
   - Resilience scoring

---

## Troubleshooting

**K8s Connection Fails**
```bash
# Verify kubeconfig
kubectl auth can-i get pods --as=system:serviceaccount:default:aira

# Check logs
docker logs <container-id> | grep "\[K8s\]"

# Test connectivity
kubectl get pods -n production
```

**Approval Requests Not Creating**
```bash
# Check MongoDB
mongodb> db.approval_requests.count()

# Check Redis for queue backend
redis-cli KEYS "approval:*"
```

**Decision Traces Missing**
```bash
# Check decision trace service
mongodb> db.decision_traces.count()

# Verify logging
docker logs <container-id> | grep "Decision trace"
```

---

## Support and Documentation

- **API Documentation:** See `API.md` for endpoint specifications
- **Architecture Documentation:** See `ARCHITECTURE.md` for system design
- **Testing Guide:** See test files for usage examples
- **Changelog:** See `CHANGELOG.md` for version history
- **Observability:** See `OBSERVABILITY.md` for monitoring setup

---

## Version

**AIRA v3.0** - Production Grade Autonomous Incident Recovery

- Kubernetes Integration: 1.0
- Approval System: 1.0
- Confidence System: 2.2 (existing)
- Test Coverage: Comprehensive

Last Updated: April 1, 2026
