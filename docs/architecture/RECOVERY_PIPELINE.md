# AIRA Recovery Pipeline

> **How AIRA moves from incident diagnosis to safe recovery, verification, and lifecycle management.**

---

# 1. Purpose

The recovery pipeline is the core operational path of AIRA.

It converts:

```text
"What is wrong?"
```

into:

```text
"What should be done?"
```

then:

```text
"Is it allowed?"
```

then:

```text
"Did it actually work?"
```

and finally:

```text
"What should happen to the incident now?"
```

The complete flow is:

```text
Incident
   ↓
Diagnosis
   ↓
Recovery Candidate Discovery
   ↓
Applicability
   ↓
Risk Analysis
   ↓
Policy Eligibility
   ↓
Candidate Ranking
   ↓
Recovery Decision
   ↓
Decision Critic
   ↓
Execution Request
   ↓
Authorization
   ↓
Execution
   ↓
Verification
   ↓
Lifecycle
```

---

# 2. Recovery Pipeline at a Glance

```text
┌──────────────────────────┐
│        INCIDENT          │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│        DIAGNOSIS         │
│                          │
│ root cause               │
│ confidence               │
│ affected resources       │
│ evidence                 │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ PLAYBOOK DISCOVERY       │
│                          │
│ Which approved recovery  │
│ strategies could apply?  │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ APPLICABILITY            │
│                          │
│ Can each candidate       │
│ actually be used here?   │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ RISK ANALYSIS            │
│                          │
│ What could go wrong?     │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ POLICY ELIGIBILITY       │
│                          │
│ Is AIRA allowed to use   │
│ this recovery?           │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ CANDIDATE RANKING        │
│                          │
│ Which safe option is     │
│ best supported?          │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ RECOVERY DECISION        │
│                          │
│ Select final strategy    │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ DECISION CRITIC          │
│                          │
│ Challenge the decision   │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ EXECUTION REQUEST        │
│                          │
│ immutable execution      │
│ intent                   │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ AUTHORIZATION            │
│                          │
│ policy + approval +      │
│ persisted permission     │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ EXECUTION                │
│                          │
│ checkpoint               │
│ idempotency              │
│ deterministic mutation   │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ VERIFICATION             │
│                          │
│ health                   │
│ metrics                  │
│ logs                     │
│ incident state           │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ LIFECYCLE                │
│                          │
│ stability                │
│ closure                  │
│ retry                    │
│ rollback                 │
│ escalation               │
└──────────────────────────┘
```

---

# 3. Main Data Objects

The recovery pipeline passes through several durable objects.

```text
Incident
   ↓
IncidentDiagnosis
   ↓
RecoveryDecision
   ↓
ExecutionRequest
   ↓
ExecutionAuthorization
   ↓
Execution Result
   ↓
RecoveryVerification
   ↓
IncidentLifecycle
```

Each object represents a different trust boundary.

---

# 4. Incident

The incident is the root operational identity.

```text
Signals
   ↓
Correlation
   ↓
Incident
```

It defines:

```text
organization
environment
service
affected resources
severity
signal context
operational state
```

Every later recovery object should remain tied to the same tenant and incident.

```text
Incident
   │
   ├── diagnosis
   ├── decision
   ├── execution
   ├── verification
   └── lifecycle
```

---

# 5. Diagnosis

The diagnosis answers:

> What is most likely causing the incident?

```text
Evidence
   ↓
Agent Investigation
   ↓
Root-Cause Hypotheses
   ↓
Diagnosis
```

Conceptually:

```text
IncidentDiagnosis
   │
   ├── diagnosisId
   ├── revision
   ├── rootCause
   ├── confidence
   ├── evidence
   ├── affected resources
   └── context
```

The revision matters because:

```text
Diagnosis v1
   ↓
new evidence arrives
   ↓
Diagnosis v2
```

A recovery decision for v1 must not be confused with a recovery decision for v2.

---

# 6. Recovery Decision Worker

The first protected worker in the recovery pipeline is:

```text
RecoveryDecisionWorker
```

Its high-level flow is:

```text
Recovery Decision Job
        │
        ▼
Runtime Checkpoint
        │
        ▼
Checkpoint Claim
        │
        ▼
Idempotency
        │
        ▼
Recovery Decision Lifecycle
        │
        ▼
Persist Result
```

---

# 7. Recovery Decision Runtime Identity

The logical identity is tied to diagnosis state.

```text
organizationId
      +
environmentId
      +
incidentId
      +
diagnosisId
      +
diagnosisRevision
      ↓
logical recovery-decision operation
```

This prevents:

```text
same diagnosis
      ↓
duplicate queue delivery
      ↓
duplicate decision processing
```

---

# 8. Playbook Discovery

The recovery pipeline starts by asking:

```text
Diagnosis
   ↓
"What approved recovery strategies exist?"
```

The repository includes dedicated recovery services for discovery, applicability, ranking, policy eligibility, risk analysis and fallback behavior.

Discovery should return candidates only.

```text
Diagnosis
   ↓
Playbook Discovery
   ↓
Candidate A
Candidate B
Candidate C
```

It must not execute them.

---

# 9. Playbook Applicability

A candidate must match the current incident.

```text
Candidate Playbook
       ↓
Applicability
       ↓
Check:
- incident type
- resource type
- environment
- preconditions
- required evidence
       ↓
APPLICABLE / NOT APPLICABLE
```

Example:

```text
Playbook:
Restart Kubernetes pod

Incident:
Database replication lag

       ↓

NOT APPLICABLE
```

---

# 10. Risk Analysis

Applicable does not mean safe.

```text
Applicable Candidate
        ↓
Risk Analysis
        ↓
Blast Radius
        ↓
Reversibility
        ↓
Criticality
        ↓
Failure Consequence
        ↓
Risk Result
```

Possible classification:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

---

# 11. Approval Requirement

Risk influences approval.

```text
Candidate
   ↓
Risk
   ↓
Approval Requirement
   │
 ┌─┴────────────────────┐
 │                      │
AUTOMATIC          HUMAN APPROVAL
```

Example:

```text
Read-only diagnostic action
        ↓
automatic may be allowed
```

versus:

```text
restart production database node
        ↓
manual approval required
```

---

# 12. Policy Eligibility

Policy is deterministic.

```text
Candidate
   ↓
Policy Rules
   ↓
Organization Policy
   ↓
Environment Policy
   ↓
Risk Limits
   ↓
Approval Constraints
   ↓
ELIGIBLE / DENIED
```

AI cannot override this result.

```text
Agent:
"Action looks safe"

Policy:
"Production DB restart requires approval"

       ↓

POLICY WINS
```

---

# 13. Candidate Ranking

Once unsafe or invalid candidates are removed:

```text
Safe Candidate A
Safe Candidate B
Safe Candidate C
       │
       ▼
Candidate Ranking
       │
       ▼
Best Supported Candidate
```

Ranking can consider:

```text
diagnosis confidence
historical success
risk
blast radius
reversibility
recovery time
playbook fit
```

---

# 14. Recovery Decision Engine

The decision engine converts ranked candidates into a structured recommendation.

```text
Ranked Candidates
      ↓
Recovery Decision Engine
      ↓
Selected Playbook
      ↓
Rationale
      ↓
Risk
      ↓
Approval Requirement
      ↓
Decision
```

---

# 15. Recovery Decision Critic

The critic challenges the recommendation.

```text
Proposed Decision
      ↓
Critic
      ↓
Questions:
- Does evidence support it?
- Was risk underestimated?
- Is a safer candidate available?
- Are required approvals represented?
- Does policy permit it?
      ↓
ACCEPT / REJECT
```

If rejected:

```text
Decision
   ↓
REJECTED
   ↓
fallback / escalation
```

If accepted:

```text
Decision
   ↓
persist
   ↓
execution request
```

---

# 16. Recovery Decision Persistence

The persisted decision should capture:

```text
what AIRA selected
why it selected it
what evidence was used
what policy applied
what risk was calculated
what critic concluded
what approval is required
```

This creates auditability.

---

# 17. Execution Request Creation

A decision does not directly execute infrastructure.

Instead:

```text
Recovery Decision
       ↓
Execution Request
```

Conceptually:

```text
ExecutionRequest
   │
   ├── executionRequestId
   ├── incidentId
   ├── recoveryDecisionId
   ├── playbookId
   ├── executionPlan
   ├── planId
   ├── planHash
   ├── authorizationId
   └── state
```

---

# 18. Immutable Execution Plan

The execution plan is frozen.

```text
Recovery Decision
      ↓
Build Execution Plan
      ↓
planId
      +
planHash
      ↓
immutable execution identity
```

If anything changes:

```text
Authorized Hash
      ↓
abc123

Received Hash
      ↓
xyz789

      ↓
MISMATCH
      ↓
BLOCK
```

---

# 19. Authorization

The authorization layer separates recommendation from permission.

```text
Execution Request
      ↓
Policy
      ↓
Approval
      ↓
Authorization Critic / Validation
      ↓
ExecutionAuthorization
```

Conceptually:

```text
ExecutionAuthorization
   │
   ├── authorizationId
   ├── decision
   ├── status
   ├── authorizationGranted
   ├── recoveryDecisionId
   ├── selectedPlaybookId
   ├── planHash
   └── criticResult
```

---

# 20. Execution Worker

ExecutionWorker is the mutation boundary.

```text
Execution Job
      ↓
Runtime Checkpoint
      ↓
Claim
      ↓
Idempotency
      ↓
Load persisted request
      ↓
Load persisted authorization
      ↓
Validate authorization
      ↓
Validate plan
      ↓
Mark RUNNING
      ↓
Approved Executor
      ↓
Infrastructure
```

---

# 21. Execution Idempotency

Execution uses immutable identity.

```text
organization
environment
executionRequestId
executionPlanId
executionPlanHash
      ↓
IDEMPOTENCY KEY
```

Duplicate queue delivery:

```text
same job
   ↓
same key
   ↓
already processing/completed
   ↓
do not execute again
```

---

# 22. Execution Runtime Checkpoint

The runtime checkpoint tracks process ownership.

```text
ExecutionWorker
      ↓
ensure checkpoint
      ↓
claim
      ↓
PROCESSING
      ↓
perform protected execution
      ↓
COMPLETED
```

This is separate from idempotency.

```text
Idempotency
      ↓
protects logical duplicate work

Checkpoint
      ↓
protects runtime ownership / crash recovery
```

---

# 23. Execution Safety Validation

Before infrastructure mutation:

```text
ExecutionRequest exists?
       ↓
Authorization exists?
       ↓
Authorization ID matches?
       ↓
authorizationGranted == true?
       ↓
decision == AUTHORIZED?
       ↓
status == AUTHORIZED?
       ↓
critic accepted?
       ↓
request state executable?
       ↓
recoveryDecisionId matches?
       ↓
playbook matches?
       ↓
plan hash matches?
       ↓
EXECUTE
```

Any failure:

```text
BLOCK
```

---

# 24. Deterministic Executor

The executor receives only an approved plan.

```text
Approved Execution
       ↓
Playbook
       ↓
Runbook
       ↓
Action Registry
       ↓
Handler
       ↓
Infrastructure
```

Examples:

```text
kubernetes/restart_pod
kubernetes/restart_deployment
kubernetes/scale_deployment
kubernetes/list_pods
kubernetes/get_logs
kubernetes/check_pod_health
kubernetes/get_deployment_status
wait/poll_condition
```

---

# 25. Execution State Flow

Conceptually:

```text
AUTHORIZED
    ↓
QUEUED
    ↓
RUNNING
    │
 ┌──┴────────┐
 │           │
 ▼           ▼
SUCCEEDED   FAILED
```

Unsafe state:

```text
BLOCKED
```

---

# 26. Execution Failure

If execution throws:

```text
Executor
   ↓
error
   ↓
mark request FAILED
   ↓
publish failure
   ↓
runtime checkpoint fail
```

But the checkpoint is marked:

```text
REQUIRES_RECONCILIATION
```

not:

```text
SAFE TO REPLAY
```

---

# 27. Why Execution Failure Is Special

Example:

```text
AIRA sends restart request
       ↓
Kubernetes accepts it
       ↓
network response lost
       ↓
worker throws timeout
```

AIRA sees:

```text
timeout
```

but reality may be:

```text
restart already happened
```

Therefore:

```text
retryable network error
       ≠
safe runtime replay
```

This distinction is critical.

---

# 28. Verification Queue Handoff

After execution reaches a durable result:

```text
Execution Result
      ↓
Verification Job
```

The verification stage asks:

```text
"Did recovery actually work?"
```

---

# 29. Verification Worker

```text
Verification Job
      ↓
Runtime Checkpoint
      ↓
Claim
      ↓
Idempotency
      ↓
Load ExecutionRequest
      ↓
Validate execution state
      ↓
Build Verification Plan
```

Then observational verification begins.

---

# 30. Verification Plan

A verification plan determines what evidence must be collected.

```text
Execution
   ↓
What changed?
   ↓
What signals prove recovery?
   ↓
Verification Plan
```

Possible checks:

```text
health endpoints
metrics
logs
resource status
incident state
```

---

# 31. Health Verification

```text
Service
   ↓
Health Probe
   ↓
Healthy / Unhealthy
```

This answers:

```text
"Is the service responding correctly?"
```

---

# 32. Metrics Verification

```text
Before Recovery Metrics
         +
After Recovery Metrics
         ↓
Metrics Verification
```

Possible checks:

```text
error rate
latency
CPU
memory
restarts
queue depth
DB connections
```

---

# 33. Log Verification

```text
Pre-recovery error pattern
        ↓
Post-recovery logs
        ↓
Did error disappear?
```

Logs help verify that the symptom actually stopped.

---

# 34. Incident-State Verification

This asks:

```text
Are the signals that opened the incident
still active?
```

It is useful because:

```text
resource healthy
      ≠
all incident symptoms cleared
```

---

# 35. Evidence Aggregation

Verification evidence is combined.

```text
Health
Metrics
Logs
Incident State
      │
      ▼
Evidence Aggregator
      │
      ▼
Evidence Package
```

The evidence package should retain:

```text
what was checked
what passed
what failed
what was inconclusive
```

---

# 36. Verification Decision

```text
Evidence Package
      ↓
Decision Engine
      ↓
RECOVERED
FAILED
INCONCLUSIVE
```

---

# 37. Verification Critic

The critic independently challenges the result.

```text
Decision:
RECOVERED
      ↓
Critic
      ↓
"Do all major signals support this?"
```

If not:

```text
challenge / block premature recovery
```

---

# 38. Verification Persistence

The verification record should capture:

```text
verificationId
executionRequestId
verification plan
evidence package
decision
critic result
routing result
```

This creates a durable record of whether recovery was proven.

---

# 39. Verification Runtime Recovery

Verification is observational.

Therefore:

```text
Verification PROCESSING
        ↓
worker crashes
        ↓
lease expires
        ↓
ABANDONED
        ↓
SAFE
        ↓
RESUME
```

No infrastructure mutation is repeated.

---

# 40. Lifecycle Handoff

Verification output is handed to lifecycle processing.

```text
RecoveryVerification
        ↓
Lifecycle Job
```

The lifecycle system now asks:

```text
"Is this incident ready to close?"
```

rather than:

```text
"Did execution run?"
```

---

# 41. Lifecycle Worker

```text
Lifecycle Job
      ↓
Runtime Checkpoint
      ↓
Claim
      ↓
Idempotency
      ↓
Load Verification
      ↓
Evaluate Lifecycle
```

---

# 42. Stability Observation

A recovered service must remain stable.

```text
Verification Passed
      ↓
Stability Window
      ↓
observe
      ↓
observe
      ↓
observe
```

Then:

```text
stable
   ↓
closure eligible
```

or:

```text
regression
   ↓
new recovery action required
```

---

# 43. Closure Eligibility

AIRA asks:

```text
Verification passed?
       ↓
Required stability period passed?
       ↓
No active regression?
       ↓
No unresolved safety condition?
       ↓
Eligible to close?
```

---

# 44. Incident Closure

```text
Closure Eligible
      ↓
Incident Closure Service
      ↓
Persist CLOSED state
      ↓
Audit
      ↓
Notify
```

Closure should be evidence-backed.

---

# 45. Regression Detection

```text
Recovered
    ↓
system degrades again
    ↓
Regression Engine
```

Possible outcomes:

```text
retry
rollback
reopen incident
escalate
```

---

# 46. Retry Handoff

Lifecycle does not execute retry.

```text
Lifecycle
   ↓
Retry Required
   ↓
RecoveryRetryOrchestrator
   ↓
new protected recovery request
```

Then normal safety boundaries apply again.

---

# 47. Rollback Handoff

Similarly:

```text
Lifecycle
   ↓
Rollback Required
   ↓
RollbackHandoffOrchestrator
   ↓
protected rollback path
```

Not:

```text
LifecycleWorker
   ↓
raw kubectl rollback
```

---

# 48. Escalation

When recovery cannot continue safely:

```text
No safe candidate
Policy block
Verification inconclusive
Rollback unavailable
Repeated regression
      ↓
Escalation
```

Escalation is an intended outcome.

---

# 49. Full Protected Worker Chain

```text
RecoveryDecisionWorker
     │
     ├── runtime checkpoint
     └── idempotency
     │
     ▼
RecoveryDecision
     │
     ▼
ExecutionWorker
     │
     ├── runtime checkpoint
     ├── idempotency
     ├── authorization
     └── immutable plan
     │
     ▼
Infrastructure Mutation
     │
     ▼
VerificationWorker
     │
     ├── runtime checkpoint
     └── idempotency
     │
     ▼
RecoveryVerification
     │
     ▼
LifecycleWorker
     │
     ├── runtime checkpoint
     └── idempotency
     │
     ▼
Close / Retry / Rollback / Escalate
```

---

# 50. Failure Path: No Safe Playbook

```text
Diagnosis
   ↓
Discovery
   ↓
Candidates
   ↓
Applicability
   ↓
none valid
   ↓
NO_SAFE_PLAYBOOK
   ↓
Escalate
```

No execution request is created.

---

# 51. Failure Path: Policy Denial

```text
Candidate
   ↓
Policy
   ↓
DENIED
   ↓
Recovery Decision blocked
   ↓
Audit
   ↓
Escalate / manual
```

---

# 52. Failure Path: Approval Missing

```text
Candidate
   ↓
Manual approval required
   ↓
approval missing
   ↓
DO NOT EXECUTE
```

---

# 53. Failure Path: Plan Mismatch

```text
Authorized plan hash
        ↓
abc123

Execution job hash
        ↓
xyz789

        ↓
BLOCK
```

---

# 54. Failure Path: Duplicate Delivery

```text
Queue message
      ↓
Worker
      ↓
idempotency key already exists
      ↓
DUPLICATE_COMPLETED / PROCESSING
      ↓
no repeated work
```

---

# 55. Failure Path: Worker Crash Before Execution

```text
Checkpoint claimed
      ↓
worker crashes before mutation
      ↓
lease expires
      ↓
stage = EXECUTION
      ↓
uncertain boundary
      ↓
REQUIRES_RECONCILIATION
```

Even though the mutation may not have occurred, AIRA fails closed.

---

# 56. Failure Path: Worker Crash During Verification

```text
Verification checkpoint PROCESSING
      ↓
worker crashes
      ↓
lease expires
      ↓
ABANDONED
      ↓
SAFE
      ↓
resume verification
```

---

# 57. Failure Path: Worker Crash During Lifecycle

```text
Lifecycle checkpoint PROCESSING
      ↓
worker crashes
      ↓
lease expires
      ↓
SAFE
      ↓
resume lifecycle
```

The resumed lifecycle still uses idempotency.

---

# 58. Runtime Restart Flow

```text
AIRA process starts
      ↓
RuntimeRecoveryWorker
      ↓
StaleOperationDetector
      ↓
find stale checkpoints
      ↓
RuntimeRecoveryCoordinator
      ↓
ResumeStateResolver
```

Then:

```text
Recovery Decision
      ↓
RESUME
```

```text
Verification
      ↓
RESUME
```

```text
Lifecycle
      ↓
RESUME
```

```text
Execution
      ↓
MANUAL_INTERVENTION
```

---

# 59. Why Checkpointing and Idempotency Are Both Required

They solve different failures.

## Idempotency

```text
same logical operation
      ↓
delivered twice
      ↓
do not repeat
```

## Runtime Checkpoint

```text
operation was running
      ↓
process died
      ↓
what should happen now?
```

Together:

```text
Duplicate Safety
      +
Crash Safety
      ↓
Reliable Distributed Recovery
```

---

# 60. Recovery Pipeline Trust Boundaries

```text
AI Diagnosis
    │
════╪════════
    ▼
Recovery Services
    │
════╪════════
    ▼
Policy
    │
════╪════════
    ▼
Authorization
    │
════╪════════
    ▼
Execution
    │
════╪════════
    ▼
Infrastructure
    │
════╪════════
    ▼
Verification
```

Each boundary reduces authority.

---

# 61. Recovery Pipeline Object Flow

```text
Incident
   │
   ▼
IncidentDiagnosis
   │
   ▼
RecoveryDecision
   │
   ▼
ExecutionRequest
   │
   ▼
ExecutionAuthorization
   │
   ▼
ExecutionResult
   │
   ▼
RecoveryVerification
   │
   ▼
IncidentLifecycle
```

This is the durable history of one recovery attempt.

---

# 62. Recovery Pipeline Queue Flow

Conceptually:

```text
Diagnosis Ready
      ↓
Recovery Decision Queue
      ↓
RecoveryDecisionWorker
      ↓
Decision Persisted
      ↓
Execution Queue
      ↓
ExecutionWorker
      ↓
Execution Completed
      ↓
Verification Queue
      ↓
VerificationWorker
      ↓
Verification Persisted
      ↓
Lifecycle Queue
      ↓
LifecycleWorker
```

---

# 63. Audit Flow

Every major transition should emit audit evidence.

```text
Diagnosis
   ↓
Decision Trace

Recovery Decision
   ↓
Decision Trace

Authorization
   ↓
Audit Event

Execution
   ↓
Action Audit

Verification
   ↓
Evidence + Audit

Lifecycle
   ↓
Lifecycle Audit
```

This supports:

```text
"Why did AIRA do this?"
```

---

# 64. Tenant Safety

Every stage carries:

```text
organizationId
environmentId
incidentId
```

Therefore:

```text
Org A Diagnosis
      ↓
Org A Decision
      ↓
Org A Execution
```

must never become:

```text
Org B Execution
```

Tenant context is part of protected lookups and logical identities.

---

# 65. Recovery Pipeline Safety Matrix

```text
┌─────────────────────┬────────────┬────────────┬───────────────┐
│ Stage               │ AI Reason  │ Mutates    │ Safe Replay   │
├─────────────────────┼────────────┼────────────┼───────────────┤
│ Diagnosis           │ YES        │ NO         │ YES           │
│ Recovery Decision   │ SOME       │ NO         │ YES           │
│ Authorization       │ NO         │ NO         │ deterministic │
│ Execution           │ NO         │ YES        │ NO if unknown │
│ Verification        │ SOME       │ NO         │ YES           │
│ Lifecycle           │ NO/SOME    │ NO direct  │ YES           │
└─────────────────────┴────────────┴────────────┴───────────────┘
```

---

# 66. Example: CrashLoopBackOff Recovery

```text
Signal:
CrashLoopBackOff
      ↓
Incident
      ↓
Diagnosis:
bad deployment / unhealthy pod
      ↓
Playbook Discovery
      ↓
PB-K8S-CRASHLOOP-001
      ↓
Applicability
      ↓
valid
      ↓
Risk
      ↓
conditional
      ↓
Policy
      ↓
allowed with required controls
      ↓
Decision Critic
      ↓
accepted
      ↓
Execution Request
      ↓
Immutable Plan
      ↓
Authorization
      ↓
ExecutionWorker
      ↓
RB-K8S-POD-RESTART
      ↓
restart pod
      ↓
Verification
      ↓
health + metrics + logs + state
      ↓
Recovered
      ↓
Stability Observation
      ↓
Stable
      ↓
Close Incident
```

---

# 67. Example: Recovery Fails

```text
Execution
   ↓
restart succeeds
   ↓
Verification
   ↓
error rate remains high
   ↓
FAILED RECOVERY
   ↓
Lifecycle
   ↓
Rollback Evaluation
   │
 ┌─┴────────────┐
 │              │
rollback      no rollback
available       │
 │              ▼
 ▼           ESCALATE
handoff
```

---

# 68. Example: Policy Blocks Action

```text
Diagnosis:
DB primary unhealthy
      ↓
Playbook candidate:
failover
      ↓
Risk:
HIGH
      ↓
Policy:
manual approval required
      ↓
No approval
      ↓
BLOCK
      ↓
manual escalation
```

AI confidence cannot override this.

---

# 69. Example: Duplicate Execution Message

```text
executionRequestId = ER-100
planId = PLAN-1
planHash = ABC
      ↓
first delivery
      ↓
idempotency claim
      ↓
execute
      ↓
complete

same message delivered again
      ↓
same identity
      ↓
existing completed record
      ↓
return previous result
      ↓
NO SECOND EXECUTION
```

---

# 70. Example: Crash During Execution

```text
execution checkpoint
      ↓
PROCESSING
      ↓
mutation request sent
      ↓
process crashes
      ↓
restart
      ↓
stale detector
      ↓
ABANDONED
      ↓
stage = EXECUTION
      ↓
REQUIRES_RECONCILIATION
      ↓
MANUAL_INTERVENTION
```

This is intentionally conservative.

---

# 71. Example: Crash During Verification

```text
verification checkpoint
      ↓
PROCESSING
      ↓
metrics collected
      ↓
process crashes
      ↓
restart
      ↓
stale detector
      ↓
ABANDONED
      ↓
SAFE
      ↓
verification resumes
```

---

# 72. Core Recovery Principle

AIRA separates:

```text
DIAGNOSIS
"What is wrong?"
```

from:

```text
RECOVERY DECISION
"What should be done?"
```

from:

```text
AUTHORIZATION
"May it be done?"
```

from:

```text
EXECUTION
"Perform exactly what was approved."
```

from:

```text
VERIFICATION
"Did it actually work?"
```

from:

```text
LIFECYCLE
"What happens to the incident now?"
```

That separation is the foundation of the recovery architecture.

---

# 73. Summary

The AIRA recovery pipeline can be remembered as:

```text
UNDERSTAND
    ↓
SELECT
    ↓
CHALLENGE
    ↓
CONSTRAIN
    ↓
AUTHORIZE
    ↓
EXECUTE
    ↓
VERIFY
    ↓
OBSERVE
    ↓
CLOSE OR RECOVER FURTHER
```

And every critical distributed step adds:

```text
IDEMPOTENCY
      +
CHECKPOINTING
      +
OWNERSHIP
      +
AUDIT
```

The objective is not simply to automate remediation.

The objective is to create a recovery system that remains:

```text
evidence-driven
policy-controlled
deterministic
auditable
idempotent
crash-safe
fail-closed
```

even when the surrounding infrastructure and the AIRA process itself fail.