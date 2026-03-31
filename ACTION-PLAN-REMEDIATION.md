# PRODUCTION READINESS REMEDIATION ACTION PLAN
## Autonomous Incident Recovery Agent (AIRA)

**Status**: 🔴 NOT PRODUCTION READY  
**Created**: March 31, 2026  
**Target**: Production-ready by April 28, 2026  
**Owner**: Engineering Team  
**Effort**: 154 hours (4 weeks)

---

## CRITICAL PATH TIMELINE

### WEEK 1: Emergency Bug Fixes (30 hours)

#### Day 1-2: Authentication Crisis 🔴 URGENT

```
Priority: P0 (BLOCKS ALL API CALLS)
Effort: 4 hours
Blocker: Cannot authenticate requests
```

**Task 1.1: Fix Auth Middleware Crypto Bug**

- [ ] **File**: `backend/middleware/authMiddleware.js` (line ~130-170)
- [ ] **Issue**: HMAC signature verification has buffer length mismatch
- [ ] **Current Code**: 
  ```javascript
  // Broken: buffers have different lengths
  const computedSignature = crypto.createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  // server signature: 64 chars (sha256 hex)
  // client signature: unknown length (may differ)
  ```
- [ ] **Fix Required**:
  1. Normalize both signatures to same format
  2. Use constant-time comparison (crypto.timingSafeEqual)
  3. Add test for signature verification with various payload sizes
- [ ] **Verification**: Run authMiddleware.test.js → all pass
- [ ] **Impact**: All API requests will work

**Task 1.2: Input Validation Type Coercion**

- [ ] **File**: `backend/middleware/inputValidationMiddleware.test.js` (line ~451)
- [ ] **Issue**: Rate limit field coerced to number instead of string
- [ ] **Fix Required**:
  1. Review Joi schema for rate limits (should allow both)
  2. Check if conversion is expected or bug
  3. Update test assertion or schema
  4. Run tests → all pass
- [ ] **Impact**: Input validation will accept proper requests

**Task 1.3: Tenant Isolation Error Codes**

- [ ] **File**: `backend/middleware/tenantIsolationMiddleware.test.js` (line ~532)
- [ ] **Issue**: Returns 401 (Unauthorized) instead of 500 (Service Error)
- [ ] **Fix Required**:
  1. Review error handling logic
  2. Map internal errors to correct HTTP status codes
  3. Add proper error context to response
  4. Run tests → all pass
- [ ] **Impact**: Clients get correct error codes

**Task 1.4: Rate Limiting Zero-Limit Bug**

- [ ] **File**: `backend/middleware/rateLimitingMiddleware.test.js` (line ~207)
- [ ] **Issue**: Zero rate limit returns allowed=true (should be false)
- [ ] **Fix Required**:
  1. Review zero-limit handling in rate limiter
  2. Add validation for edge case (0 requests/min)
  3. Return false for zero limits
  4. Run tests → all pass
- [ ] **Impact**: Kill switch rate limiting will work

#### Day 2-4: Chaos Test Debug 🔴 CRITICAL

```
Priority: P0 (CANNOT VALIDATE RESILIENCE)
Effort: 12 hours
Blocker: 28/31 chaos tests don't execute
```

**Task 1.5: Debug Chaos Test Hangs**

- [ ] **File**: `backend/tests/phase3-chaos.test.js`
- [ ] **Issue**: Tests time out or skip (hanging on something)
- [ ] **Investigation**:
  1. Add debug logging to first failing test
  2. Check if infinite loops in chaos framework
  3. Verify all async/await is proper
  4. Check for unclosed database connections
  5. Review Jest timeout settings
- [ ] **Fix Approaches**:
  - Option A: Rewrite broken tests
  - Option B: Debug and fix testframework
  - Option C: Move to separate test suite with higher timeout
- [ ] **Target**: 31/31 chaos tests passing (or 28+ passing)
- [ ] **Impact**: Resilience can be validated

#### Day 5: Schema Cleanup & Regression Testing

**Task 1.6: Database Schema Index Cleanup**

- [ ] **Files**: 
  - `backend/models/DecisionTrace.js`
  - `backend/models/ActionLog.js`
  - `backend/models/IncidentMemory.js`
- [ ] **Fix**: Remove duplicate index declarations
  - Keep TTL indexes, remove duplicates
  - Verify indexes at mongodb startup
- [ ] **Verification**: npm start → no Mongoose warnings

**Task 1.7: Full Regression Testing**

- [ ] Run full test suite: `npm test`
- [ ] Target: 434 → 470+ tests passing (90%+)
- [ ] No new failures introduced
- [ ] Document any remaining failures

**WEEK 1 COMPLETION CRITERIA**:
- [ ] All 4 middleware bugs fixed
- [ ] Chaos tests running (28+ of 31)
- [ ] Schema warnings gone
- [ ] Test pass rate > 90%
- [ ] **Blocker for Week 2**: All must be complete

---

### WEEK 2: Safety & Coverage Expansion (40 hours)

#### Day 1-4: Safety Gate Validation 🔴 CRITICAL

```
Priority: P0 (CANNOT SHIP UNSAFE SYSTEM)
Effort: 12 hours
Target: Verify all 7 safety gates work
```

**Task 2.1: Phase 1 Safety Test Execution**

- [ ] **File**: `backend/tests/phase1-safety.test.js`
- [ ] **Issue**: Jest configuration hangs/fails
- [ ] **Fix**:
  1. Update Jest config for ES modules (already done)
  2. Run tests in isolation: `npx jest tests/phase1-safety.test.js --testTimeout=60000`
  3. Debug hanging tests
  4. Verify all 23 tests pass
- [ ] **Success**: 23/23 XSS and safety gate tests passing

**Task 2.2: Safety Gate Integration Testing**

Create new comprehensive safety test suite: `backend/tests/safety-gates-integration.test.js`

Test each safety gate:
- [ ] **XSS Sanitization**: Send 10 malicious payloads → all blocked
- [ ] **Global Kill Switch**: Disable actions → no executions
- [ ] **Tenant Kill Switch**: Disable per-tenant → isolated
- [ ] **Action Type Allowlist**: Block action type → no execution
- [ ] **Confidence Thresholds**: Low confidence → escalate to human
- [ ] **Circuit Breaker**: Failure mode → open circuit
- [ ] **Dry Run**: High-risk incident → validate before execute

- [ ] **Tests to Create**: 15 new tests (one per scenario + combinations)
- [ ] **Effort**: 8 hours
- [ ] **Target**: 15/15 pass

**Task 2.3: Penetration Testing**

- [ ] **XSS Payloads**: Test 20+ payload types (existing, new)
- [ ] **SQL Injection**: If applicable (MongoDB)
- [ ] **Auth Bypass**: Attempt without credentials
- [ ] **Privilege Escalation**: Tenant boundary violations
- [ ] **Documentation**: Create security test matrix
- [ ] **Effort**: 4 hours

#### Day 4-5: Code Coverage Expansion 🔴 CRITICAL

```
Priority: P1 (CRITICAL GAP: 4.83% vs 60%)
Effort: 28 hours this week, 40 hours total
```

**Task 2.4: Agent Code Coverage (20 hours)**

**Target**: Increase agent coverage from 0% to 40%

- [ ] **actionAgent.js** (0% → 30%)
  - [ ] Test action validation (5 tests)
  - [ ] Test action execution (5 tests)
  - [ ] Test error handling (3 tests)
  - [ ] Test safety gate integration (5 tests)
  - Effort: 8 hours

- [ ] **decisionAgent.js** (0% → 35%)
  - [ ] Test policy evaluation (4 tests)
  - [ ] Test confidence calculation (4 tests)
  - [ ] Test decision tier assignment (4 tests)
  - [ ] Test learning system (3 tests)
  - Effort: 6 hours

- [ ] **analysisAgent.js** (0% → 30%)
  - [ ] Test signal analysis (4 tests)
  - [ ] Test pattern matching (3 tests)
  - [ ] Test root cause extraction (3 tests)
  - [ ] Test aggregation (2 tests)
  - Effort: 6 hours

**Task 2.5: Middleware Security Coverage (8 hours)**

**Target**: Increase middleware coverage from 1.44% to 40%

- [ ] **authMiddleware.js**: 6 tests
- [ ] **inputValidationMiddleware.js**: 6 tests
- [ ] **killSwitchMiddleware.js**: 5 tests
- [ ] **sanitizationMiddleware.js**: 5 tests
- [ ] **tenantIsolationMiddleware.js**: 6 tests
- [ ] **rateLimitingMiddleware.js**: 6 tests

**WEEK 2 COMPLETION CRITERIA**:
- [ ] All safety gates have integration tests (15 tests, 15/15 pass)
- [ ] Penetration testing documented
- [ ] Code coverage: 4.83% → 30%
- [ ] Agent coverage: 0% → 40%
- [ ] Middleware coverage: 1.44% → 40%

---

### WEEK 3: Performance & Resilience (48 hours)

#### Day 1-3: Load Testing & Performance Baseline 🔴 CRITICAL

```
Priority: P1 (UNKNOWN SCALING = UNPREDICTABLE FAILURES)
Effort: 12 hours
```

**Task 3.1: Load Testing Infrastructure**

- [ ] Create load test script in `backend/load-test-suite.js` (if not exists)
- [ ] Define test scenarios:
  1. **Baseline (100 req/min)**: Normal operation
  2. **Moderate (500 req/min)**: Customer traffic
  3. **Stress (1000 req/min)**: Peak conditions
  4. **Overload (2000 req/min)**: Breaking point
- [ ] Metrics to measure:
  - Decision latency (p50, p95, p99)
  - Action latency (p50, p95, p99)
  - Error rate (%)
  - Queue depth
  - DB latency
  - Memory usage
  - CPU usage

- [ ] **Effort**: 4 hours setup + 8 hours execution

**Task 3.2: Chaos Test Execution** 🔴 CRITICAL

```
Priority: P0 (RESILIENCE UNPROVEN)
Effort: 8 hours
```

Execute all 31 chaos scenarios:

- [ ] **Database Failures** (5 scenarios)
  - Unavailability → observe graceful degradation
  - High latency → timeout handling
  - Intermittent (50%) → resilience
  - Query timeout → circuit breaker
  - Connection pool exhaustion → see results

- [ ] **Queue Failures** (5 scenarios)
  - Saturation → backpressure
  - Latency → timeout behavior
  - Message reordering → idempotency
  - Consumer down → dead letter queue
  - Broker restart → recovery

- [ ] **External Service Failures** (5 scenarios)
  - Slow response → timeout
  - Timeout error → circuit breaker
  - Connection refused → fallback
  - Intermittent (30%) → retries
  - Response corruption → validation

- [ ] **Load & Stress** (4 scenarios)
  - Incident storm (500/sec) → throughput
  - Memory under load → leak detection
  - Cascading failures → isolation
  - Recovery from storm → stabilization

- [ ] **Measure**:
  - Failure is handled correctly
  - Recovery time
  - No data loss
  - No cascading failures
  - Error isolation (doesn't spread)

**Effort**: Run full matrix (8 hours)

#### Day 3-5: Observability End-to-End Validation

```
Priority: P1 (DEBUGGING AID, NOT SHIPPING BLOCKER)
Effort: 16 hours
```

**Task 3.3: Observability Pipeline Testing**

- [ ] **Structured Logging**
  - [ ] Incident recorded to logs
  - [ ] Decision logged with confidence/tier
  - [ ] Action logged with status
  - [ ] Error logged with stack trace
  - [ ] Correlation ID flows through all 3

- [ ] **Prometheus Metrics**
  - [ ] `/metrics` endpoint returns 200
  - [ ] All 20+ metrics present
  - [ ] Metrics labeled with tenantId, actionType, etc.
  - [ ] Can filter metrics by label
  - [ ] Scrape test (simulate Prometheus)

- [ ] **Audit Trail**
  - [ ] Decision recorded to MongoDB
  - [ ] Action execution recorded
  - [ ] Authorization changes recorded
  - [ ] Query audit trail by tenantId
  - [ ] TTL cleanup working

- [ ] **End-to-End Trace**
  - [ ] Start incident
  - [ ] Navigate to logs → see decision
  - [ ] Navigate to metrics → see latency
  - [ ] Navigate to audit → see approvals
  - [ ] Correlation ID ties all together

**Task 3.4: Alert Validation**

- [ ] **Escalation Rate Alert**: 
  - [ ] Test: Trigger high escalation
  - [ ] Alert should fire
  - [ ] Can link to dashboard

- [ ] **Error Rate Alert**:
  - [ ] Test: Trigger errors
  - [ ] Alert should fire

- [ ] **Kill Switch Status Alert**:
  - [ ] Test: Enable/disable kill switch
  - [ ] Alert reflects status

**WEEK 3 COMPLETION CRITERIA**:
- [ ] Load test baseline established (100-1000 req/min)
- [ ] All 31 chaos tests executed, results documented
- [ ] Observability pipeline validated (logs→metrics→alerts)
- [ ] No unknown failure modes
- [ ] Performance characterization complete

---

### WEEK 4: Code Coverage Target & Production Trial (36 hours)

#### Day 1-5: Coverage Push to 40%+ 🔴 CRITICAL

```
Priority: P1 (CRITICAL GAP)
Effort: 16 hours this week, cumulative 40+ hours
Target: 4.83% → 40%
```

**Task 4.1: Core Service Coverage (8 hours)**

- [ ] **decisionTraceService.js**: +8% coverage
- [ ] **confidenceService.js**: +6% coverage  
- [ ] **policyEngine.js**: +7% coverage
- [ ] **idempotencyService.js**: +5% coverage
- [ ] **circuitBreakerService.js**: +4% coverage

**Task 4.2: Infrastructure Coverage (8 hours)**

- [ ] **distributedLockService.js**: +3% coverage
- [ ] **dbService.js**: +4% coverage
- [ ] **queueService.js**: +5% coverage
- [ ] **retryHandler.js**: +3% coverage
- [ ] **metricsService.js**: +4% coverage

**Target End Result**: 40%+ coverage

#### Day 5-7: Canary Deployment & Trial 🟡 MONITORED

```
Priority: P2 (ONLY IF WEEKS 1-3 COMPLETE)
Effort: 12 hours
Duration: 48-72 hours (continuous monitoring)
```

**Task 4.3: Single-Tenant Canary**

- [ ] **Deployment**:
  - [ ] Select low-traffic test tenant
  - [ ] Deploy to staging environment
  - [ ] Verify all services startup
  - [ ] Run smoke tests

- [ ] **Monitoring (48-72 hours)**:
  - [ ] Decision latency: tracking
  - [ ] Action success rate: tracking
  - [ ] Error rate: < 1%
  - [ ] Escalation rate: normal
  - [ ] Memory: stable (no leaks)
  - [ ] Kill switch: responsive

- [ ] **Go/No-Go Decision**:
  - [ ] All metrics healthy?
  - [ ] No unexpected errors?
  - [ ] Can trace incidents?
  - [ ] Ready for 10% deployment?

**Task 4.4: Go-Live Decision**

- [ ] **Pass Criteria**:
  - ✅ All 4 middleware bugs fixed
  - ✅ 28+ chaos tests passing
  - ✅ 40%+ code coverage
  - ✅ Load test baseline (100-1000 req/min)
  - ✅ All 7 safety gates validated
  - ✅ Observability end-to-end working
  - ✅ Canary trial: 48h with zero critical issues

- [ ] **Go** (proceed to 10% rollout) OR
- [ ] **No-Go** (additional work needed)

---

## TASK TRACKING TEMPLATE

```
Task: [ID].[WEEK].[NUMBER]
Priority: P0 (BLOCKS) | P1 (CRITICAL) | P2 (IMPORTANT)
Status: NOT STARTED | IN PROGRESS | BLOCKED | COMPLETE
Effort: X hours
Owner: [Name]
Blocker: [Other task this depends on]
```

### Example Tracking

```
Task: 1.1 - Auth Crypto Fix
Priority: P0
Status: NOT STARTED
Effort: 4 hours
Owner: [to be assigned]
Blocker: None
```

---

## RESOURCE REQUIREMENTS

### Personnel
- **Lead SRE**: 1 person (full-time)
- **Backend Engineers**: 2 people (full-time)
- **QA Engineer**: 1 person (part-time)
- **DevOps/Infra**: 1 person (part-time for load testing)

### Infrastructure
- **Development Database**: MongoDB (in-process OK)
- **Load Testing Environment**: Real hardware recommended
- **Monitoring Stack**: Prometheus + Grafana (local OK)
- **Staging Environment**: For canary trial

### Tools
- **Jest**: Unit/integration testing (already configured)
- **Locust/k6**: Load testing tool (need to select)
- **Prometheus**: Metrics collection
- **Grafana**: Dashboards
- **ELK/CloudWatch**: Log aggregation

---

## SUCCESS CRITERIA

### Week 1: Bug Fixes ✅
- [ ] All 4 middleware bugs fixed
- [ ] Chaos tests running
- [ ] 90%+ test pass rate
- [ ] No new critical issues

### Week 2: Safety ✅
- [ ] 7 safety gates validated
- [ ] Penetration testing passed
- [ ] 30% code coverage
- [ ] 15 safety integration tests passing

### Week 3: Resilience ✅
- [ ] Load test baseline established
- [ ] 31 chaos scenarios executed
- [ ] Observability pipeline working
- [ ] No unknown failure modes

### Week 4: Ready ✅
- [ ] 40%+ code coverage
- [ ] Canary trial: 72-hour success
- [ ] All go-live criteria met
- [ ] **APPROVAL**: Ready for production

---

## ROLLBACK PLAN

If at any stage we discover show-stoppers:

1. **Revert code**: `git checkout main`
2. **Document findings**: What broke and why
3. **Extend timeline**: Weeks 5-6 for remediation
4. **Restart from Step 1**

---

## Sign-Off

**Created**: March 31, 2026  
**Target Completion**: April 28, 2026  
**Status**: READY TO EXECUTE  
**Next Step**: Assign tasks to team, begin Week 1

---

*Schedule: Monday April 1 → Friday April 28 (4 weeks)*  
*Effort: 154 hours (39 per week)*  
*Team Size: 4-5 people*  
*Deliverable: Production-ready AIRA system*
