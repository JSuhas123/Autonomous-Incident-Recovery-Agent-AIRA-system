# AIRA System - Training & Onboarding (All 10 Phases)

**Version**: 5.0.0 (All 10 Phases)  
**Last Updated**: Current  
**Audience**: New team members, on-call engineers, developers, stakeholders

---

## 📚 Complete Training Path (8-10 Hours)

This training covers all 10 phases of AIRA implementation. You can complete phases 1-3 in ~3-4 hours, then continue with phases 4-10 for specialized knowledge.

---

## **Phase 1: Understanding AIRA (30 minutes)**

**Goal**: Grasp what AIRA does, why it matters, and core concepts

### The Three-Agent Pipeline

```
Signal Input (metric/log spike)
    ↓
[ANALYSIS Agent] → Understand: "What's happening?"
    ↓
[DECISION Agent] → Decide: "What should we do?"
    ↓
[ACTION Agent] → Execute: "Do it safely"
    ↓
Audit Trail + Feedback → Learn & Improve
```

### Key Concepts

- **Signal**: Any metric or log indicating a problem (error rate spike, latency increase, database lag)
- **Pattern**: Repeated sequence of signals (e.g., "cache miss storm" pattern seen before)
- **Severity**: Impact level - LOW, MEDIUM, HIGH, CRITICAL
- **Policy**: Rules that say "IF this pattern → THEN do that action"
- **Decision Trace**: Complete reasoning for why this action was chosen (auditable)
- **Safety Gate**: Check that prevents dangerous actions (dry-run, approval, confidence threshold)

### Real-World Example

```
Incident: API error rate spikes to 15%
  ↓
Analysis Agent detects: "Familiar pattern - load spike before rate limiting"
Confidence: 92% (matches known pattern, clear signals)
  ↓
Decision Agent checks policy: "IF error_rate > 10% THEN increase_rate_limit"
Confidence: 86% (pattern match + historical success rate)
  ↓
Action Agent applies safety gates:
  ✓ Confidence > 65% threshold? YES
  ✓ Policy allows this action? YES
  ✓ Similar action executed recently? NO (avoid duplicates)
  ↓
Action executes: Rate limit increased by 50%
  ↓
Outcome recorded: Error rate drops to <1%, users unaffected
  ↓
System learns: Increases confidence for this pattern-action combo
```

### Hands-On Exercise

1. Start the system:
   ```bash
   cd backend
   docker-compose up -d
   npm start
   ```

2. Send a test signal:
   ```bash
   curl -X POST http://localhost:5000/signals \
     -H "Content-Type: application/json" \
     -d '{"type":"error_rate_spike","value":15,"service":"api"}'
   ```

3. Check the decision:
   ```bash
   curl http://localhost:5000/decisions
   ```

4. Inspect the audit trail - see every step of the reasoning

---

## **Phase 2: Policy Management System (45 minutes)**

**Goal**: Understand how policies drive decision-making

### Policy Files (YAML-Based)

Policies define the rules that guide automatic actions. Located in `/backend/policies/`

**Example Policy**:
```yaml
domain: database
rules:
  - name: "Restart Database Replication"
    condition: "db_replication_lag > 30s"
    action: "restart_replication"
    cooldown: 300        # Don't repeat for 5 minutes
    risk_level: "medium"
    version: "1.0"       # Versioning for audit trail

  - name: "Increase Cache TTL Under Load"
    condition: "cache_miss_rate > 0.5"
    action: "increase_cache_ttl"
    cooldown: 60
    risk_level: "low"
    version: "1.1"
```

### Policy Versioning (Phase 2 Feature)

Every decision stores **exactly which policy version** was used:
- Users can see historical policies
- Older decisions are still auditable
- Policy changes don't invalidate past reasoning
- Rollback to previous policy if needed

**Example**:
```
Decision executed on 2026-04-15 10:30:00 UTC
  Policy domain: "database"  
  Policy version: "1.2"      ← Exact version used
  Rules evaluated: 5
  Rule matched: "Restart Database Replication" (v1.2)
  Confidence: 86%
```

### Hands-On: Write Your First Policy

1. Review existing policy:
   ```bash
   cat backend/policies/default-policy.yaml
   ```

2. Create a new policy for a custom scenario:
   ```yaml
   domain: cache
   rules:
     - name: "Clear Cache Under Memory Pressure"
       condition: "memory_usage > 0.85"
       action: "clear_cache"
       cooldown: 120
       risk_level: "low"
       version: "1.0"
   ```

3. Test it via API:
   ```bash
   curl -X POST http://localhost:5000/policies \
     -H "Content-Type: application/json" \
     -d @your-policy.json
   ```

4. Verify in decision trace - see your policy matched

---

## **Phase 3: Effectiveness Metrics & Learning (40 minutes)**

**Goal**: Understand how AIRA learns and improves from outcomes

### Feedback Loops

Every action creates a decision that can be marked successful or failed:

```
Decision: "Increase rate limit to 5000 req/s"
  ↓
Action executes
  ↓
[ Wait 5 minutes ]
  ↓
Measure outcome: 
  - Error rate: 15% → 1% ✅ (SUCCESSFUL)
  - User experience: improved ✅
  - No side effects ✅
  ↓
Record feedback: success_rate += 1
  ↓
Confidence auto-increases for this pattern (via Phase 4)
```

### Effectiveness Metrics

Track success rates for:
- Each decision type (rate limiting, cache optimization, etc.)
- Each policy rule
- Time periods (trends)

**Example Report**:
```
Decision Type: "increase_rate_limit"
Success Rate: 94.2% (97 successes, 6 failures)
Average Impact: 8 minutes MTTR improvement
Cost Impact: $2,400 saved per incident
```

### Hands-On: Record Feedback

1. Get a decision ID:
   ```bash
   curl http://localhost:5000/decisions | jq '.data[0].id'
   ```

2. Mark it as successful:
   ```bash
   curl -X POST http://localhost:5000/feedback \
     -H "Content-Type: application/json" \
     -d '{
       "decision_id": "<id>",
       "outcome": "success",
       "impact": "error_rate reduced from 15% to 1%"
     }'
   ```

3. Check effectiveness:
   ```bash
   curl http://localhost:5000/effectiveness-analysis
   ```

---

## **Phase 4: Adaptive Confidence System (50 minutes)**

**Goal**: Learn how decisions improve over time through ML-based confidence calibration

### The Confidence Problem

Early decisions use generic thresholds:
```
Condition met → IF confidence > 65% → Execute action
```

But what if:
- Some patterns are always safe? (Should increase threshold)
- Some patterns often fail? (Should decrease threshold)
- Confidence factors don't predict success equally? (Should weight differently)

### Solution: Adaptive Confidence

AIRA uses **linear regression** to:
1. Identify which factors best predict success
2. Auto-adjust weights for those factors
3. Continuously improve as new feedback arrives

**Example**:
```
Factors influencing success:
  - Pattern match: weight 0.4 (strong predictor)
  - Historical success: weight 0.35 (strong)
  - Service health: weight 0.15 (weak)
  - Time of day: weight 0.1 (very weak)
  
As system learns → weights auto-adjust
  Pattern match: 0.45 (more important)
  Historical success: 0.40
  Service health: 0.10
  Time of day: 0.05
```

### Confidence Thresholds

Phase 4 introduces multiple decision recommendations:
- **EXECUTE**: Confidence > 80% → Auto-execute immediately
- **MONITOR**: Confidence 60-80% → Execute but monitor closely
- **CAUTION**: Confidence 40-60% → Manual approval required
- **BLOCK**: Confidence < 40% → Don't execute (wait for better conditions)

### Kill-Switch Mechanism

If system detects low-confidence patterns:
```bash
# Auto-enables SAFE_MODE when:
confidence_anomaly_detected: true
average_confidence < 50%

# In SAFE_MODE:
# - All actions require manual approval
# - Confidence calculations extra strict
# - System waits for better understanding
```

### Hands-On: Monitor Confidence Calibration

1. Check current confidence model:
   ```bash
   curl http://localhost:5000/confidence-model
   ```

2. Generate feedback to trigger learning:
   ```bash
   npm run script:generate-feedback-for-learning
   ```

3. Watch weights adjust:
   ```bash
   curl http://localhost:5000/confidence-model | jq '.factor_weights'
   ```

4. Check calibration accuracy:
   ```bash
   curl http://localhost:5000/confidence-metrics
   ```

---

## **Phase 5: Multi-Source Integrations (45 minutes)**

**Goal**: Learn how AIRA connects to external systems and receives signals

### Slack Integration

Decisions can notify on Slack:

```bash
curl -X POST http://localhost:5000/integrations/slack/notify \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Database replication restarted",
    "decision_id": "<id>",
    "severity": "high",
    "action_details": {
      "service": "postgres_replica_02",
      "action": "restart",
      "expected_recovery": "2-3 minutes"
    }
  }'
```

Slack shows:
- Decision summary
- Action taken
- Confidence level
- Next steps

### Webhook Integration

Receive signals from external systems (Datadog, custom apps):

```bash
# External system sends signal
curl -X POST http://localhost:5000/webhooks/datadog \
  -H "Content-Type: application/json" \
  -d '{
    "alert": "error_rate_high",
    "service": "api",
    "value": 15,
    "timestamp": "2026-04-15T10:30:00Z"
  }'
```

AIRA processes → Analyzes → Decides → Acts

### External Service Integrations

**Datadog**: Import metrics and query performance data
**Prometheus**: Export metrics for external monitoring
**PagerDuty**: Create incidents for manual escalation
**ServiceNow**: Auto-create tickets for compliance

### Hands-On: Set Up Slack Integration

1. Get a Slack bot token
2. Set environment variable:
   ```bash
   export SLACK_TOKEN=xoxb-your-token
   export SLACK_WEBHOOK_URL=https://hooks.slack.com/...
   ```

3. Test notification:
   ```bash
   curl -X POST http://localhost:5000/test-slack-notification
   ```

4. Make a decision and watch Slack get notified automatically

---

## **Phase 6: Docker & Kubernetes Deployment (40 minutes)**

**Goal**: Understand containerization and production deployment

### Docker Basics

Build AIRA container:
```bash
docker build -t aira:v1.0 .

docker run -d \
  --name aira-prod \
  -p 5000:5000 \
  --env-file .env.prod \
  aira:v1.0
```

### Kubernetes Deployment

Production-grade deployment with:
- Multi-replica scaling (3 pods default)
- Health checks (liveness + readiness probes)
- Resource limits (CPU, memory)
- Horizontal Pod Autoscaler (HPA)

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/hpa.yaml

# Scale up/down
kubectl scale deployment aira --replicas=5
```

### Distributed Coordination

When running multiple AIRA instances:
- Redis ensures idempotent actions (no duplicates)
- Distributed locks prevent race conditions
- SAFE_MODE activates if Redis goes down

**Example**:
```
Instance 1: "Acquire lock for restart_service_X"
Instance 2: "Wait for lock..."
Instance 1: "Execute action, release lock"
Instance 2: "Acquire lock, see action already done, skip"
  Result: Action executed exactly once ✓
```

### Hands-On: Deploy to Kubernetes

```bash
# Install AIRA
kubectl apply -f k8s/

# Check status
kubectl get pods -l app=aira

# View logs
kubectl logs -f deployment/aira

# Scale up
kubectl scale deployment aira --replicas=5

# Check autoscaling
kubectl get hpa
```

---

## **Phase 7: Failure Scenario Testing (50 minutes)**

**Goal**: Understand chaos testing and system resilience

### Why Chaos Testing?

Before going to production, test what happens when things break:
- Database crashes
- Network goes down
- External API becomes slow
- Memory runs out
- Queue backs up

AIRA includes 15+ failure scenarios to validate recovery.

### Chaos Test Framework

Run specific failure scenarios:

```bash
cd backend/chaos

# Validate environment
node quick-start.js

# Run all scenarios
node run-chaos-tests.js

# Run specific scenario
node run-chaos-tests.js --scenario database_failure
```

### Test Scenarios

**Database Failures** (4 scenarios):
- Connection timeout
- Query timeout
- Slow queries (>5s)
- Connection pool exhaustion

**Queue Failures** (3 scenarios):
- Broker unavailable
- Message redelivery during restart
- Poison pill detection

**External Service Failures** (4 scenarios):
- Slack API timeout
- Webhook endpoint down
- PagerDuty API failure
- Custom integration timeout

**Resource & Load** (4 scenarios):
- Memory pressure
- CPU spike
- Connection limits
- Database contention

### Expected Behavior Under Failures

When a failure occurs, AIRA should:
1. Detect the failure (connection error, timeout)
2. Trigger circuit breaker (stop retrying immediately)
3. Log comprehensive diagnostics
4. Activate SAFE_MODE if critical service down
5. Either recover automatically or wait for manual intervention

### Hands-On: Run Chaos Tests

```bash
# Run full chaos test suite
cd backend/chaos
npm install
node run-chaos-tests.js

# Run specific failure scenario
node run-chaos-tests.js --scenario db_failure

# Watch recovery
node run-chaos-tests.js --verbose
```

---

## **Phase 8: Approval Workflows & Execution Modes (45 minutes)**

**Goal**: Master approval workflows and different execution approaches

### Execution Modes

AIRA supports three execution modes:

**1️⃣ Automated (Default)**
```
✓ Confidence > 75%
✓ Policy allows it
✓ No recent duplicate
→ Execute immediately
```

**2️⃣ Dry-Run (Pre-execution Testing)**
```
Run action in dry-run mode:
  - Simulates execution
  - Returns expected outcome
  - Doesn't actually change system
  - Shows full diff before proceeding
```

**3️⃣ Manual Approval (High-Risk)**
```
High-risk actions require approval:
  ✓ Confidence 40-75%
  ✓ Database changes
  ✓ Multi-service impacts
  
Sends approval request → Wait for human → Execute/Reject
```

### Approval Workflow State Machine

```
State: PENDING
├─ Awaits reviewer approval
├─ Expires after 1 hour
└─ Can transition to: APPROVED or REJECTED

State: APPROVED
├─ Execution authorized
├─ Action executes immediately
└─ Transitions to: EXECUTING → COMPLETED

State: REJECTED
├─ Action blocked
├─ Reason logged
└─ Transitions to: REJECTED (terminal)
```

### Runbook Execution

Actions are parameterized via runbooks:

**Runbook Example** (`api-rate-limit-fix.yaml`):
```yaml
action: increase_rate_limit
parameters:
  - service: string (required)
  - increase_percentage: number (default: 50)
  - max_limit: number (default: 5000)
steps:
  1. Validate service exists
  2. Calculate new limit: current * (1 + increase_percentage%)
  3. Cap at max_limit
  4. Apply change
  5. Monitor error rate for 2 minutes
  6. Record outcome
```

### Hands-On: Create Approval Workflow

1. Create a decision requesting approval:
   ```bash
   curl -X POST http://localhost:5000/decisions \
     -H "Content-Type: application/json" \
     -d '{
       "signal": "db_replication_lag > 30s",
       "execution_mode": "manual_approval"
     }'
   ```

2. Check approval status:
   ```bash
   curl http://localhost:5000/approvals/pending
   ```

3. Approve the action:
   ```bash
   curl -X POST http://localhost:5000/approvals/<id>/approve
   ```

4. Watch execution:
   ```bash
   curl http://localhost:5000/decisions/<id>
   ```

---

## **Phase 9: API & Documentation (30 minutes)**

**Goal**: Master the API and understand documentation structure

### Core API Endpoints

**Decision Management**:
- `POST /decisions` - Create and execute decision
- `GET /decisions` - List decisions with filters
- `GET /decisions/:id` - Get decision details
- `GET /decisions/:id/trace` - Get full reasoning trace

**Feedback & Learning**:
- `POST /feedback` - Record outcome (success/failure)
- `GET /effectiveness-analysis` - Trend analysis by decision type
- `GET /confidence-model` - Current ML weights and thresholds

**Policy Management**:
- `POST /policies` - Create or update policy
- `GET /policies` - List active policies
- `GET /policies/versions` - Historical versions

**Approval Workflows**:
- `GET /approvals/pending` - Approval requests awaiting action
- `POST /approvals/:id/approve` - Approve action
- `POST /approvals/:id/reject` - Reject action

**Health & Monitoring**:
- `GET /health` - System health check
- `GET /metrics` - Prometheus metrics
- `GET /system-status` - Detailed system status

### Documentation Structure

Main docs:
- **README.md**: Overview, quick start, features (this file)
- **TESTING.md**: Test coverage, chaos testing
- **TRAINING.md**: Training for all phases (this file)
- **DEPLOYMENT.md**: Production deployment guide
- **ARCHITECTURE.md**: System design deep dive
- **API.md**: Complete API reference

### Hands-On: Explore API

```bash
# Health check
curl http://localhost:5000/health

# List decisions
curl http://localhost:5000/decisions | jq

# Get specific decision
curl http://localhost:5000/decisions/<id> | jq '.data.reasoning'

# Export metrics
curl http://localhost:5000/metrics > prometheus-metrics.txt
```

---

## **Phase 10: Advanced Reporting & Analytics (50 minutes)**

**Goal**: Understand reporting, trend analysis, and ROI calculation

### Report Types

**1. Effectiveness Report**
```
Shows success rates by decision type:
- Decision: "increase_rate_limit"  
  Success Rate: 94.2% (97/103)
  Average MTTR: 8.5 min
  Cost Impact: $2,400 saved

- Decision: "restart_service"
  Success Rate: 88.1% (45/51)
  Average MTTR: 12.3 min
  Cost Impact: $1,800 saved
```

**2. Trend Analysis Report**
```
Tracks patterns over time:
- Week-over-week incident reduction: 23%
- Average confidence trend: ↗ +3.2% (improving)
- False positive trend: ↘ -1.8% (improving)
- Mean time to recovery: 18.4 min (best this month)
```

**3. ROI Calculation**
```
Business impact:
- Incidents detected: 247
- Automated resolutions: 186 (75.3%)
- Manual interventions: 61 (24.7%)
- Average MTTR: 12.8 minutes
- Estimated cost savings: $47,200/month
```

### Analytics Pipelines

AIRA uses MongoDB aggregation pipelines (Phase 10) for:
- Grouping decisions by type/policy
- Calculating success rates
- Trend detection (exponential moving average)
- ROI analysis (time saved × hourly cost)
- False positive detection

**Example Aggregation**:
```javascript
db.decisions.aggregate([
  { $match: { "created_at": { $gte: ISODate("2026-04-01") } } },
  { $group: {
      _id: "$action_type",
      total: { $sum: 1 },
      successful: { $sum: { $cond: ["$outcome.success", 1, 0] } },
      avg_confidence: { $avg: "$confidence" }
    }
  },
  { $project: {
      success_rate: { $divide: ["$successful", "$total"] },
      total: 1,
      avg_confidence: 1
    }
  }
])
```

### Hands-On: Generate Reports

1. Create sample decisions (for demo):
   ```bash
   npm run script:generate-sample-decisions
   ```

2. Generate effectiveness report:
   ```bash
   curl http://localhost:5000/reports/effectiveness \
     ?start_date=2026-04-01 \
     ?end_date=2026-04-30
   ```

3. Get trend analysis:
   ```bash
   curl http://localhost:5000/reports/trends \
     ?metric=confidence \
     ?interval=daily
   ```

4. Calculate ROI:
   ```bash
   curl http://localhost:5000/reports/roi \
     ?hourly_cost=150  # $ per hour of engineer time
   ```

5. Export to CSV:
   ```bash
   curl http://localhost:5000/reports/export \
     ?format=csv > report.csv
   ```

---

## Quick Reference: Completing the Training

| Phase | Topic | Time | Key Takeaway |
|-------|-------|------|--------------|
| 1 | AIRA Overview | 30 min | Three-agent pipeline, safety first |
| 2 | Policy System | 45 min | YAML policies + versioning |
| 3 | Learning Loops | 40 min | Feedback → Effectiveness metrics |
| 4 | Confidence | 50 min | ML-based calibration improves over time |
| 5 | Integrations | 45 min | Connect to external systems |
| 6 | Deployment | 40 min | Docker + Kubernetes + distributed locks |
| 7 | Resilience | 50 min | 15+ failure scenarios tested |
| 8 | Workflows | 45 min | Approval workflows + execution modes |
| 9 | API | 30 min | 30+ endpoints + documentation |
| 10 | Reporting | 50 min | Analytics + ROI calculation |
| **TOTAL** | **All 10 Phases** | **8-10 hours** | **Production-ready engineer** |

---

## Next Steps After Training

1. **Review**: [ARCHITECTURE.md](ARCHITECTURE.md) for system design details
2. **Reference**: [API.md](API.md) for complete endpoint documentation  
3. **Test**: [TESTING.md](TESTING.md) for running test suites
4. **Deploy**: [DEPLOYMENT.md](DEPLOYMENT.md) for production setup
5. **Troubleshoot**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues
6. **Operate**: [OPERATIONS.md](OPERATIONS.md) for on-call runbooks

---

## Resources

- **Code**: `/backend` directory
- **Tests**: `/backend/tests` (512+ tests)
- **Policies**: `/backend/policies/`
- **Runbooks**: `/backend/runbooks/`
- **Chaos Tests**: `/backend/chaos/`
- **Documentation**: Root README, ARCHITECTURE.md, API.md, etc.
Record decision trace (full reasoning audit trail)
```

**Hands-on exercise** (20 min):
- Open `/backend/services/core/policyEngine.js`
- Create a new policy YAML in `/backend/policies/`
- Trigger decision with test incident
- Observe decision trace in `/logs/` or MongoDB
- Verify reasoning matches your policy

#### Part C: Action Agent (15 min)
**What it does**: Executes the decision safely

**Key concepts**:
- **Safety gates** = Checks before executing (Is system healthy? Is confidence high? Does the action still make sense?)
- **Idempotency** = Executing the same action twice is safe (no side effects)
- **Rollback capability** = Can we undo this if it goes wrong?

**Example walkthrough**:
```
Decision: "restart_replication" with confidence 86%
  ↓
Safety gates check:
  ✓ Kill-switch not active?
  ✓ Circuit breaker not open?
  ✓ Idempotency lock available? (no concurrent execution)
  ✓ Target service reachable?
  ✓ Confidence > minimum threshold?
  ↓
All gates pass → Execute action
  ↓
Action executes: Calls database admin API
  ↓
Verify action success:
  - Replication status: "syncing"
  - Lag: decreases over next 30s
  ↓
Record: ACTION_EXECUTED with replication_status=syncing
  ↓
Return: 200 OK with action outcome
```

**Hands-on exercise** (15 min):
- Open `/backend/agents/actionAgent.js`
- Review safety gate checks
- Create a test runbook in `/backend/runbooks/`
- Execute test action: `curl -X POST http://localhost:5000/actions/test`
- Verify audit trail: `db.AuditEvent.find({eventType:'action_executed'})`

#### Part D: Pipeline End-to-End (10 min)
**Exercise**: Trigger a full incident → decision → action flow

```bash
# 1. Start the system
npm start

# 2. Inject a test signal
curl -X POST http://localhost:5000/incidents/signal \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "training-tenant",
    "serviceId": "api-gateway",
    "error_rate": 15,
    "error_count": 142,
    "timestamps": ["2026-04-01T14:00:00Z"]
  }'

# 3. Wait 2-5 seconds for pipeline execution

# 4. Check decision
curl http://localhost:5000/decisions?tenantId=training-tenant | jq '.last'

# 5. Check if action executed
curl http://localhost:5000/actions?tenantId=training-tenant | jq '.last'

# 6. Verify audit trail
curl http://localhost:5000/audit?tenantId=training-tenant | jq '.logs | last'
```

---

### Phase 3: Operational Scenarios (60 minutes)

#### Scenario 1: Handling Escalation (15 min)
**Situation**: A decision's confidence is 52% (below 65% threshold)

**What happens**:
- Decision is still made but marked "requires_approval"
- Escalates to on-call engineer
- Action does NOT execute automatically
- Engineer gets paged with decision details

**Your role**:
1. Receive alert: "Decision needs approval: api-rate-limit-increase"
2. Review decision details: severity=CRITICAL, confidence=52%
3. Decide: Approve or reject
4. If approve: Action executes immediately, audit trail shows "approved_by_human"
5. If reject: Incident escalates further or goes to manual remediation

**Exercise** (10 min):
```bash
# 1. Create low-confidence scenario
curl -X POST http://localhost:5000/incidents/signal \
  -d '{"serviceId":"new-service","error_rate":8}' # Unknown pattern = low confidence

# 2. Query decisions
curl http://localhost:5000/decisions | jq '.[] | select(.requiresApproval==true)'

# 3. Approve decision
curl -X POST http://localhost:5000/decisions/{decisionId}/approve \
  -d '{"approvedBy":"training-user","notes":"Pattern looks safe"}'

# 4. Monitor action execution
watch -n 1 'curl -s http://localhost:5000/actions | jq ".last"'
```

#### Scenario 2: Understanding Safety Gates (15 min)
**Situation**: Action fails safety gate check

**Gate 1: Kill-Switch Active**
- Meaning: Someone manually disabled this action type
- When used: During code deployment, major incidents, security issues
- Your response: Contact on-call lead, enable kill-switch in admin panel

**Gate 2: Circuit Breaker Open**
- Meaning: This action has failed too many times (>80% failure rate)
- When used: Prevent cascading failures (don't keep trying something broken)
- Your response: Fix underlying issue, manually reset circuit breaker

**Gate 3: Idempotency Lock Held**
- Meaning: Same action is already executing elsewhere
- When used: Prevents duplicate actions in multi-instance deployment
- Your response: Normal in high-concurrency scenarios, will auto-retry

**Gate 4:Target Unreachable**
- Meaning: Can't reach the service we need to fix
- When used: Network issues, service down
- Your response: Verify network, check target service health

**Gate 5: Confidence Below Threshold**
- Meaning: Decision confidence < 65% (configurable)
- When used: Prevent uncertain action execution
- Your response: Manual approval or tune policy for higher confidence

**Exercise** (15 min):
```bash
# Simulate gate failures
# 1. Activate kill-switch
curl -X POST http://localhost:5000/admin/kill-switch/activate \
  -d '{"actionType":"databases.restart","reason":"testing"}'

# 2. Try to execute action
curl -X POST http://localhost:5000/actions \
  -d '{"actionType":"databases.restart"}'
# Expected: 403 FORBIDDEN "Kill-switch active"

# 3. Deactivate kill-switch
curl -X POST http://localhost:5000/admin/kill-switch/deactivate \
  -d '{"actionType":"databases.restart"}'

# 4. Retry action
curl -X POST http://localhost:5000/actions \
  -d '{"actionType":"databases.restart"}'
# Expected: 200 OK or 503 if other gates fail
```

#### Scenario 3: Reading the Audit Trail (15 min)
**Situation**: An incident happened, need to understand what AIRA did

**Steps**:
```bash
# 1. Find the incident
curl http://localhost:5000/audit?from=2026-04-01T14:00:00Z&to=2026-04-01T15:00:00Z | \
  jq '.logs[] | select(.eventType=="decision_made")'

# 2. Get decision details
DECISION_ID=$(curl -s http://localhost:5000/decisions | jq -r '.[-1].decisionId')
curl http://localhost:5000/decisions/$DECISION_ID | jq '.'

# 3. Check what action was taken
curl http://localhost:5000/audit | jq '.logs[] | select(.eventType=="action_executed")'

# 4. Verify service recovered
curl http://localhost:5000/metrics | grep -E 'error_rate|api_latency'
```

**What to look for**:
- Timing: Did decision happen before service recovered?
- Confidence: Was this high-confidence decision?
- Success: Did the action actually fix the issue?
- Alternatives: What else could AIRA have done?

---

### Phase 4: Troubleshooting Practicum (30 minutes)

**Scenario-based troubleshooting exercises**:

#### Exercise 1: "Why didn't AIRA act on this incident?"
Problem: Incident signal arrived, but no decision made  
Expected time: 5 minutes  
Steps:
1. Check `/logs/incidents.log` for signal receipt
2. Query IncidentMemory - was pattern recognized?
3. Check DecisionTrace - was decision made?
4. If no decision: check policy - does any rule match?
5. If policy mismatch: add new rule to policy

#### Exercise 2: "Why was the confidence so low?"
Problem: Decision made but required manual approval  
Expected time: 5 minutes  
Steps:
1. Get decision trace
2. Review confidence factors (pattern match %, historical success)
3. Check IncidentMemory - is pattern recognized?
4. If new pattern: system hasn't learned yet
5. Solution: Provide feedback, historical data, or adjust policy

#### Exercise 3: "Action failed - why?"
Problem: Decision approved, action didn't execute  
Expected time: 5 minutes  
Steps:
1. Check FailedMessage queue
2. Identify which safety gate failed
3. Diagnose gate-specific issue (kill-switch? circuit breaker? network?)
4. Fix underlying issue, retry action

#### Exercise 4: "Queue is backing up"
Problem: queue_depth_messages keeps growing  
Expected time: 10 minutes  
Steps:
1. Check if agents are running: `ps aux | grep agent`
2. Check CONSUMER_CONCURRENCY setting
3. Diagnose why actions slow (database? network? policy evaluation time?)
4. Scale: increase concurrency, fix underlying resource issue
5. Verify queue drains

---

### Phase 5: Runbooks & Response Procedures (30 minutes)

**Hands-on with operational runbooks**:

#### Runbook 1: "API Rate Limit Spike"
**Scenario**: API backend suddenly getting rate-limited errors

**Runbook steps** (from `/backend/runbooks/api-rate-limit-fix.yaml`):
```
1. Detect: error_rate > 10 AND error_code="429"
2. Analyze: Is this legitimate traffic spike or attack?
3. Policy rule: IF rate-limited AND traffic_pattern=normal THEN increase-rate-limit
4. Action: Call API to increase rate limit by 50%
5. Verify: Error rate should drop within 30s
6. If dropped: Mark as resolved
7. If not dropped: Escalate and fall back to load shedding
```

**Exercise**:
```bash
# 1. Trigger rate limit scenario
curl -X POST http://localhost:5000/admin/simulate-incident \
  -d '{"type":"api-rate-limit","errorRate":15,"errorCode":"429"}'

# 2. Let AIRA handle it (wait 5 seconds)

# 3. Verify action
curl http://localhost:5000/audit | jq | grep -i "rate-limit"

# 4. Check policy in action
cat backend/policies/api-policies.yaml | grep -A 10 "rate_limit_spike"
```

#### Runbook 2: "Database Replication Lag"
**Scenario**: Database secondaries falling behind, affecting read consistency

**Runbook steps**:
```
1. Detect: replication_lag > 30 seconds
2. Analyze: Why is replication slow?
3. Policy rule: IF replication_lag THEN restart_replication
4. Action: Restart MongoDB replication, monitor lag recovery
5. Verify: replication_lag < 5s within 60s
6. If success: All systems back to normal
7. If failure: Scale database to reduce lag, escalate if persistent
```

**Exercise**:
```bash
# 1. Trigger database scenario
curl -X POST http://localhost:5000/admin/simulate-incident \
  -d '{"type":"db-replication-lag","lagSeconds":45}'

# 2. Monitor AIRA response
tail -f logs/incidents.log | grep -i "replication"

# 3. Verify policy execution
curl http://localhost:5000/decisions | jq '.[] | select(.action=="restart_replication")'

# 4. Check success metrics
curl http://localhost:5000/metrics | grep replication_lag
```

---

## 🔧 Quick Reference Guides

### Policy Authoring Cheatsheet
```yaml
# File: backend/policies/my-domain-policy.yaml
rules:
  - name: rule-name
    condition: "metric_name > threshold"  # Use MongoDB aggregation syntax
    action: ACTION_TYPE  # RESTART_SERVICE, SCALE_UP, INCREASE_RATE_LIMIT, etc.
    severity: HIGH
    cooldown: 300  # Seconds before rule can trigger again
    escalateIfConfidenceLessThan: 65
```

### Decision Query Syntax
```bash
# Recent decisions for a service
curl 'http://localhost:5000/decisions?serviceId=api-gateway&limit=10'

# Decisions with low confidence (need approval)
curl 'http://localhost:5000/decisions?requiresApproval=true'

# Decision trace for specific incident
curl 'http://localhost:5000/decisions/{decisionId}/trace'

# Decisions that led to action
curl 'http://localhost:5000/decisions?resultedInAction=true'
```

### Common Metrics to Monitor
```
decision_latency_ms         # How long decisions take (target p99 < 5s)
decision_confidence         # How confident are our decisions (higher = better)
escalation_rate_percent     # % of decisions needing manual approval
action_success_rate_percent # % of actions that achieved their goal
queue_depth_messages        # How many pending incidents
dlq_size_messages           # Failed messages (should stay < 100)
```

---

## 📞 Getting Help

### During Incident
1. Check `/TROUBLESHOOTING.md` for your symptom
2. Follow diagnosis steps
3. If not resolved in 5 minutes, page on-call lead
4. Provide: diagnostic bundle, affected time range, symptoms

### Training Questions
- Chat `#aira-questions` on Slack
- Review `/documentation/ARCHITECTURE.md` for deep concepts
- Watch recorded training videos (link in wiki)

### Feature/Policy Questions
- Contact: Policy team (@policy-maintainers)
- Request policy changes in: `#aira-policy-requests`

---

**Last Updated**: April 1, 2026  
**Next Review**: May 1, 2026  
**Training Feedback**: Please share feedback via [Training Form](https://forms.example.com/aira-training)
