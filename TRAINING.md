# AIRA System - Training & Onboarding Materials

**Version**: 1.0  
**Last Updated**: April 1, 2026  
**Audience**: New team members, on-call engineers, stakeholders

---

## 📚 AIRA Training Path (3-5 Hours)

### Phase 1: Understanding AIRA (30 minutes)
**Goal**: Understand what AIRA does and why it matters

**Video/Presentation Topics**:
1. What is autonomous incident recovery? (5 min)
   - Traditional flow: incident → pager → human → action → docs
   - AIRA flow: incident signal → automatic decision → safe action → audit
   - Why this matters: faster MTTR, consistency, learning

2. Real-world example: API rate limiting incident (5 min)
   - Signal: error_rate spike to 15%
   - Detection: Analysis agent notices pattern
   - Decision: Policy says "increase rate limit" for this service
   - Action: Safe action executed in seconds
   - Outcome: Error rate drops to <1%

3. Safety first philosophy (5 min)
   - AIRA can't do anything without policy approval
   - Every decision is auditable and reversible
   - Multiple safety gates prevent unintended actions
   - Confidence scoring prevents low-certainty decisions

4. System components overview (10 min)
   - Three-agent pipeline
   - Policy engine
   - Safety gates
   - Audit trail

---

### Phase 2: Deep Dive - The Decision Pipeline (60 minutes)

#### Part A: Analysis Agent (15 min)
**What it does**: Detects incidents and understands patterns

**Key concepts**:
- **Signal** = Any metric or log indicating a problem
- **Pattern** = A repeated sequence of signals (e.g., "database replication lag")
- **Severity** = How bad is this (LOW/MEDIUM/HIGH/CRITICAL)
- **Root cause hypothesis** = What do we think is wrong

**Example walkthrough**:
```
Signal: db_replication_lag > 30s
  ↓
Analysis Agent runs pattern matching
  ↓
Pattern found: "database-replication-delay" (seen 47 times before)
  ↓
Severity: CRITICAL (system is read-only)
  ↓
Root cause hypothesis: "Database replication has stalled"
  ↓
Confidence: 92% (matches known pattern, clear signals)
```

**Hands-on exercise** (15 min):
- Open `/backend/agents/analysisAgent.js`
- Trace through `analyzeIssue()` function
- Identify: signal detection, pattern matching, severity calculation
- Modify: Add a new signal type (e.g., "cache_hit_rate < 50%")
- Test: Run `npm test -- analysisAgent.test.js`

#### Part B: Decision Agent (20 min)
**What it does**: Decides what action to take based on policy

**Key concepts**:
- **Policy** = Rules that dictate "if condition → take action"
- **Rule engine** = Matcher that evaluates conditions against signals
- **Confidence** = How sure are we this is the right action?
- **Decision trace** = Full reasoning for why this action was chosen

**Example walkthrough**:
```
Hypothesis: "Database replication has stalled"
  ↓
Load policy for database domain
  ↓
Policy Rule #1: IF replication_lag > 30s THEN restart_replication
  Condition: TRUE ✓
  ↓
Check confidencee factors:
  - Pattern match: 92%
  - Historical success rate: 88%
  - Risk of action: LOW
  ↓
Final confidence: 86% > threshold (65%)
  ↓
Decision: APPROVE action "restart_replication" with confidence 86%
  ↓
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
