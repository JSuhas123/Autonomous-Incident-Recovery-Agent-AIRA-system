# AIRA Crash Recovery Architecture

> **How AIRA survives worker crashes, stale ownership, process restarts, and uncertain execution outcomes without blindly replaying infrastructure mutations.**

---

# 1. Why Crash Recovery Exists

A distributed recovery system cannot assume its own process stays alive.

AIRA workers can fail because of:

```text
process crash
container restart
node failure
network partition
database timeout
queue disconnect
memory exhaustion
deployment restart
host failure
```

So this situation is normal:

```text
Worker
   ↓
starts operation
   ↓
process dies
```

The key question becomes:

```text
"What was happening before the crash,
and what is safe to do now?"
```

That is the purpose of the runtime recovery subsystem.

---

# 2. Idempotency Is Necessary but Not Sufficient

Idempotency solves:

```text
same logical message
      ↓
delivered twice
      ↓
do not process twice
```

Crash recovery solves:

```text
worker owned an operation
      ↓
worker disappeared
      ↓
what happens now?
```

Therefore:

```text
Idempotency
      +
Runtime Checkpoints
      ↓
Distributed Recovery Safety
```

---

# 3. Runtime Recovery Overview

```text
Critical Worker
      ↓
Create Runtime Checkpoint
      ↓
Claim Ownership
      ↓
PROCESSING
      ↓
Heartbeat
      ↓
Business Logic
      ↓
Complete Checkpoint
```

If the process dies:

```text
PROCESSING
    ↓
heartbeat stops
    ↓
lease expires
    ↓
stale operation
    ↓
AIRA restarts
    ↓
recovery subsystem
```

---

# 4. Critical Runtime Components

The runtime recovery subsystem is composed of:

```text
RuntimeRecoveryCheckpoint
          ↓
RuntimeCheckpointPersistenceService
          ↓
RuntimeStaleOperationDetector
          ↓
RuntimeResumeStateResolver
          ↓
RuntimeRecoveryCoordinator
          ↓
RuntimeRecoveryWorker
```

Each component has one responsibility.

---

# 5. RuntimeRecoveryCheckpoint

The checkpoint is the durable runtime record.

Conceptually:

```text
RuntimeRecoveryCheckpoint
   │
   ├── organizationId
   ├── environmentId
   ├── incidentId
   ├── stage
   ├── operationKey
   ├── workflowIdentity
   ├── status
   ├── owner
   ├── claimToken
   ├── leaseExpiresAt
   ├── heartbeatAt
   ├── interruption
   ├── resumeSafety
   ├── result
   └── error
```

It records:

```text
WHAT is running?

WHO owns it?

WHEN was it last alive?

WHAT stage is it in?

IS it safe to resume?

WHAT happened before failure?
```

---

# 6. Why the Checkpoint Must Be Durable

Unsafe design:

```text
Worker
  ↓
in-memory state
  ↓
process crash
  ↓
state gone
```

With a durable checkpoint:

```text
Worker
  ↓
database checkpoint
  ↓
process crash
  ↓
checkpoint survives
```

This gives AIRA enough information to reason about restart behavior.

---

# 7. Runtime Stages

The recovery subsystem distinguishes major workflow stages.

Conceptually:

```text
RECOVERY_DECISION

EXECUTION

VERIFICATION

LIFECYCLE
```

The stage matters because the replay safety is different for each one.

---

# 8. Checkpoint Lifecycle

A normal checkpoint follows:

```text
CREATED
   ↓
CLAIMED
   ↓
PROCESSING
   ↓
 ┌─┴──────────────┐
 │                │
 ▼                ▼
COMPLETED       FAILED
```

A crash can produce:

```text
PROCESSING
   ↓
lease expires
   ↓
ABANDONED
```

---

# 9. Runtime Ownership

A worker cannot simply start processing.

It must claim the checkpoint.

```text
Worker
   ↓
claim checkpoint
   ↓
owner = workerId
claimToken = unique token
leaseExpiresAt = future
```

Only the current valid owner may finalize the checkpoint.

---

# 10. Why Runtime Ownership Matters

Consider two recovery processes after a restart.

```text
Recovery Worker A
Recovery Worker B
        │
        ▼
same stale operation
```

Without atomic ownership:

```text
A resumes
B resumes
```

With checkpoint claiming:

```text
A claim succeeds
B claim fails
```

Only one process proceeds.

---

# 11. Runtime Claim Token

Each claim gets a unique token.

```text
Worker A
   ↓
token AAA
```

If ownership later changes:

```text
Worker B
   ↓
token BBB
```

A stale Worker A cannot complete using AAA.

---

# 12. Lease

Checkpoint ownership expires.

```text
claim
  ↓
leaseExpiresAt
```

Example:

```text
10:00:00 claimed
10:01:00 lease expiry
```

If the worker disappears before completion, the operation eventually becomes stale.

---

# 13. Heartbeat

While running:

```text
Worker
   ↓
work
   ↓
heartbeat
   ↓
work
   ↓
heartbeat
```

The heartbeat communicates:

```text
"This owner is still alive."
```

---

# 14. Healthy Processing

```text
PROCESSING
   ↓
heartbeat
   ↓
lease extended
   ↓
heartbeat
   ↓
lease extended
```

The stale detector should not interfere.

---

# 15. Worker Crash

If the worker dies:

```text
PROCESSING
   ↓
no heartbeat
   ↓
lease expires
```

The record now appears abandoned.

---

# 16. Stale Operation Detector

The stale detector scans runtime checkpoints.

```text
Runtime Checkpoints
       ↓
StaleOperationDetector
       ↓
Check:
- status
- lease expiry
- heartbeat
- stage
- ownership
       ↓
ACTIVE / STALE
```

Its job is detection only.

It should not perform infrastructure recovery directly.

---

# 17. Stale Detection Example

Checkpoint:

```text
status = PROCESSING

last heartbeat = 10:00

lease expiry = 10:01

current time = 10:05
```

Detector:

```text
lease expired
      ↓
STALE
```

---

# 18. Live Worker Must Not Be Stolen

Checkpoint:

```text
status = PROCESSING

lease expiry = 10:05

current time = 10:01
```

Then:

```text
worker still has valid ownership
      ↓
WAIT
```

Recovery must not steal live work.

---

# 19. Marking Abandoned

Once the coordinator confirms stale ownership:

```text
PROCESSING
   ↓
mark abandoned
   ↓
ABANDONED
```

This represents:

```text
"The previous runtime owner did not finish
while its ownership was valid."
```

---

# 20. Interruption Metadata

The checkpoint can preserve why interruption was inferred.

Conceptually:

```text
interruption:
  interrupted = true
  reason = LEASE_EXPIRED
  detectedAt = timestamp
```

This helps audit and debugging.

---

# 21. Resume-State Resolver

The resolver answers:

```text
"What should happen to this checkpoint now?"
```

Possible decisions may include:

```text
RESUME

WAIT

SKIP_COMPLETED

BLOCK

MANUAL_INTERVENTION
```

The decision depends heavily on the runtime stage.

---

# 22. Core Resume Rule

AIRA does not use:

```text
stale
   ↓
retry everything
```

Instead:

```text
stale
   ↓
inspect stage
   ↓
inspect resume safety
   ↓
choose stage-specific action
```

---

# 23. Safe Resume Matrix

```text
┌─────────────────────┬──────────────────────────────┐
│ Stage               │ Crash Behavior               │
├─────────────────────┼──────────────────────────────┤
│ Recovery Decision   │ SAFE TO RESUME               │
│ Verification        │ SAFE TO RESUME               │
│ Lifecycle           │ SAFE TO RESUME               │
│ Execution           │ REQUIRES RECONCILIATION      │
└─────────────────────┴──────────────────────────────┘
```

This distinction is the heart of AIRA runtime recovery.

---

# 24. Recovery Decision Crash

Recovery decision is primarily control-plane processing.

```text
Diagnosis
   ↓
candidate discovery
   ↓
risk
   ↓
policy
   ↓
decision
```

If AIRA crashes:

```text
checkpoint PROCESSING
      ↓
lease expires
      ↓
ABANDONED
      ↓
SAFE
      ↓
resume through idempotency
```

---

# 25. Why Recovery Decision Is Safe to Resume

It does not directly perform infrastructure mutation.

Recomputing or re-entering the protected decision workflow does not restart a pod, fail over a DB, or delete a resource.

Therefore:

```text
Recovery Decision
      ↓
safe reconstruction
```

---

# 26. Verification Crash

Verification is observational.

```text
health
metrics
logs
incident state
```

Crash:

```text
VerificationWorker
      ↓
PROCESSING
      ↓
process dies
      ↓
ABANDONED
      ↓
SAFE
      ↓
resume
```

---

# 27. Why Verification Is Safe to Resume

Repeating:

```text
read metrics
read logs
read health
```

does not repeat the previous infrastructure mutation.

Therefore:

```text
observational work
      ↓
safe replay
```

---

# 28. Lifecycle Crash

Lifecycle performs state evaluation and protected handoffs.

```text
stability
closure
retry request
rollback request
escalation
```

It does not directly mutate infrastructure.

Therefore:

```text
Lifecycle crash
      ↓
SAFE
      ↓
resume through idempotency
```

---

# 29. Execution Crash

Execution is fundamentally different.

```text
ExecutionWorker
      ↓
send external mutation
      ↓
infrastructure changes
```

If the process crashes at the wrong moment, the outcome may be ambiguous.

---

# 30. The Ambiguous Execution Problem

Consider:

```text
AIRA
  ↓
send restart request
  ↓
Kubernetes receives request
  ↓
Kubernetes restarts pod
  ↓
AIRA crashes before storing result
```

After restart, local state may say:

```text
PROCESSING
```

But external reality is:

```text
mutation already happened
```

---

# 31. Another Ambiguous Case

```text
AIRA sends request
      ↓
network failure
```

AIRA cannot necessarily know whether:

```text
request never arrived
```

or:

```text
request arrived and succeeded
```

This is a classic distributed-systems ambiguous outcome.

---

# 32. Why Blind Replay Is Unsafe

Suppose recovery is:

```text
restart deployment
```

Blind replay:

```text
restart
   ↓
crash
   ↓
restart again
```

For more sensitive operations:

```text
database failover
node drain
rollback
resource mutation
```

the second execution could be significantly more dangerous.

---

# 33. Execution Resume Rule

Therefore:

```text
EXECUTION checkpoint abandoned
        ↓
DO NOT AUTO RESUME
        ↓
REQUIRES_RECONCILIATION
        ↓
MANUAL_INTERVENTION
```

---

# 34. Execution Stage Overrides Incorrect SAFE Metadata

Even if a bad caller were to persist:

```text
stage = EXECUTION
resumeSafety = SAFE
```

the resolver should still enforce:

```text
stage = EXECUTION
      ↓
REQUIRES_RECONCILIATION
```

The stage itself represents the side-effect boundary.

---

# 35. Resume Safety

Conceptually:

```text
SAFE
```

means:

```text
re-entering the protected worker does not blindly
repeat an unknown infrastructure side effect
```

```text
REQUIRES_RECONCILIATION
```

means:

```text
external state must be understood before
another mutation can be considered
```

```text
UNKNOWN
```

means:

```text
fail closed
```

---

# 36. Unknown Safety Must Fail Closed

Unsafe:

```text
resumeSafety = UNKNOWN
      ↓
probably safe
      ↓
resume
```

Correct:

```text
UNKNOWN
   ↓
BLOCK
```

or:

```text
MANUAL INTERVENTION
```

depending on stage.

---

# 37. Runtime Recovery Coordinator

The coordinator connects detection with resolution.

```text
Stale Detector
      ↓
stale candidate
      ↓
Persistence
      ↓
mark abandoned
      ↓
Resume-State Resolver
      ↓
Recovery Plan
```

---

# 38. Coordinator Responsibility

It answers:

```text
Which stale operations exist?

Which should be abandoned?

Which are safe to resume?

Which require manual intervention?

Which should be skipped?

Which should remain waiting?
```

It should not directly execute infrastructure.

---

# 39. Recovery Plan

Conceptually a plan contains:

```text
organizationId
environmentId
incidentId
stage
operationKey
workflowIdentity
resume decision
resume payload
executionAuthorized = false
```

The plan is a recovery instruction, not execution authority.

---

# 40. Runtime Recovery Worker

The runtime recovery worker dispatches only safe stages.

Conceptually:

```text
Recovery Plan
      ↓
RuntimeRecoveryWorker
      │
      ├── RECOVERY_DECISION → RecoveryDecisionWorker
      │
      ├── VERIFICATION → VerificationWorker
      │
      ├── LIFECYCLE → LifecycleWorker
      │
      └── EXECUTION → DO NOT DISPATCH
```

---

# 41. Why Runtime Recovery Reuses Existing Workers

Unsafe design:

```text
Runtime Recovery
      ↓
call internal business logic directly
```

This could bypass:

```text
idempotency
validation
safety checks
worker contracts
```

Correct design:

```text
Runtime Recovery
      ↓
protected worker
      ↓
existing idempotency
      ↓
existing validation
```

---

# 42. Recovery Decision Resume Path

```text
stale recovery-decision checkpoint
      ↓
resolver = RESUME
      ↓
RuntimeRecoveryWorker
      ↓
RecoveryDecisionWorker.process()
      ↓
checkpoint
      ↓
idempotency
      ↓
decision flow
```

---

# 43. Verification Resume Path

```text
stale verification checkpoint
      ↓
resolver = RESUME
      ↓
RuntimeRecoveryWorker
      ↓
VerificationWorker.process()
      ↓
checkpoint
      ↓
idempotency
      ↓
verification flow
```

---

# 44. Lifecycle Resume Path

```text
stale lifecycle checkpoint
      ↓
resolver = RESUME
      ↓
RuntimeRecoveryWorker
      ↓
LifecycleWorker.process()
      ↓
checkpoint
      ↓
idempotency
      ↓
lifecycle flow
```

---

# 45. Execution Recovery Path

```text
stale execution checkpoint
      ↓
resolver
      ↓
MANUAL_INTERVENTION
      ↓
RuntimeRecoveryWorker
      ↓
NO EXECUTION DISPATCH
```

This is intentional.

---

# 46. Runtime Recovery Must Never Import Execution Authority

The recovery subsystem must never transform:

```text
restart recovery
```

into:

```text
executionAuthorized = true
```

Runtime recovery ownership means:

```text
"you may resume processing"
```

not:

```text
"you may mutate infrastructure"
```

---

# 47. Runtime Checkpoint vs Idempotency Record

They may look similar but serve different purposes.

## Checkpoint

```text
"What stage was the process in?"
```

## Idempotency Record

```text
"Has this logical operation already been processed?"
```

---

# 48. Example

Verification crashes.

Checkpoint says:

```text
stage = VERIFICATION
status = ABANDONED
resumeSafety = SAFE
```

Idempotency says:

```text
operation still PROCESSING
or reclaimable
```

Recovery then re-enters VerificationWorker.

Both systems cooperate.

---

# 49. Completed Checkpoint

If the checkpoint is already:

```text
COMPLETED
```

restart recovery should not rerun it.

```text
COMPLETED
   ↓
SKIP_COMPLETED
```

Previous result may be returned/referenced.

---

# 50. Active Checkpoint

If ownership is still valid:

```text
PROCESSING
lease not expired
      ↓
WAIT
```

Restart recovery must not steal it.

---

# 51. Failed Safe Stage

A safe stage may fail rather than crash.

Example:

```text
Verification
      ↓
metrics provider temporary failure
      ↓
checkpoint FAILED
      ↓
resumeSafety = SAFE
```

A controlled retry may later be possible.

---

# 52. Failed Execution Stage

Execution failure is treated differently.

```text
Execution
      ↓
failure
      ↓
external side effect may be ambiguous
      ↓
REQUIRES_RECONCILIATION
```

---

# 53. Retryable Does Not Mean Replayable

Again:

```text
error.retryable = true
```

may mean:

```text
the technical failure is transient
```

but:

```text
resumeSafety = REQUIRES_RECONCILIATION
```

may still be necessary.

Example:

```text
ECONNRESET
```

The connection failure is transient.

The mutation outcome may still be unknown.

---

# 54. Crash Detection vs Failure Detection

A normal failure:

```text
worker catches error
      ↓
checkpoint.fail()
```

A crash:

```text
worker disappears
      ↓
cannot call fail()
      ↓
lease expires
      ↓
stale detector infers interruption
```

Both must be supported.

---

# 55. Process Crash Simulation

Crash simulation tests should model:

```text
claim checkpoint
      ↓
do not complete
      ↓
advance time
      ↓
lease expires
      ↓
restart subsystem
      ↓
detect stale
      ↓
resolve
```

This proves crash recovery without needing to physically kill the test runner.

---

# 56. Restart/Resume E2E

The complete E2E path is:

```text
Worker owns operation
      ↓
process crash simulated
      ↓
lease expires
      ↓
AIRA restarts
      ↓
detector scans
      ↓
coordinator marks abandoned
      ↓
resolver decides
      ↓
runtime worker dispatches
      ↓
protected worker runs
      ↓
idempotency protects resume
```

---

# 57. Recovery Decision E2E

```text
RECOVERY_DECISION PROCESSING
      ↓
crash
      ↓
ABANDONED
      ↓
SAFE
      ↓
RESUME
      ↓
RecoveryDecisionWorker
```

Expected:

```text
dispatched = true
executionAuthorized = false
```

---

# 58. Verification E2E

```text
VERIFICATION PROCESSING
      ↓
crash
      ↓
ABANDONED
      ↓
SAFE
      ↓
RESUME
      ↓
VerificationWorker
```

No infrastructure execution is started.

---

# 59. Lifecycle E2E

```text
LIFECYCLE PROCESSING
      ↓
crash
      ↓
ABANDONED
      ↓
SAFE
      ↓
RESUME
      ↓
LifecycleWorker
```

Retry/rollback remain handoffs only.

---

# 60. Execution E2E

```text
EXECUTION PROCESSING
      ↓
crash
      ↓
ABANDONED
      ↓
REQUIRES_RECONCILIATION
      ↓
MANUAL_INTERVENTION
```

Expected:

```text
dispatched = false
executionStarted = false
executionAuthorized = false
```

---

# 61. Stale Owner Fencing During Resume

Suppose old worker A returns after restart recovery creates owner B.

```text
A token = AAA
B token = BBB
```

A attempts:

```text
complete checkpoint
```

Persistence checks:

```text
AAA != BBB
      ↓
reject
```

This prevents post-restart corruption.

---

# 62. Runtime Recovery and Tenant Safety

Recovery plans must preserve:

```text
organizationId
environmentId
incidentId
```

No resume operation should cross tenant scope.

---

# 63. Operation Key

Each checkpoint should have a deterministic operation key.

Example recovery decision:

```text
recovery-decision:
incidentId:
diagnosisId:
revision
```

Example execution:

```text
execution:
incidentId:
executionRequestId:
planId:
planHash
```

This makes runtime recovery traceable to immutable workflow identity.

---

# 64. Workflow Identity

The checkpoint should preserve stage-specific domain references.

Examples:

```text
Recovery Decision:
diagnosisId
diagnosisRevision
recoveryDecisionId
```

```text
Execution:
executionRequestId
executionPlanHash
recoveryDecisionId
```

```text
Verification:
executionRequestId
verificationId
verificationPlanId
verificationPlanHash
```

```text
Lifecycle:
verificationId
lifecycleId
lifecycleIntent
```

---

# 65. Why Workflow Identity Matters

After process restart, in-memory job data is gone.

The system needs enough durable references to reconstruct safe work.

```text
checkpoint
      ↓
workflowIdentity
      ↓
resume payload
      ↓
protected worker
```

---

# 66. Resume Payload

A resume payload should contain only what the protected worker needs to reconstruct the logical operation.

It should not contain new authority.

Bad:

```text
resumePayload:
  executionAuthorized = true
```

Correct:

```text
resumePayload:
  immutable IDs
  read-only context
  plan identity
```

---

# 67. Runtime Recovery Safety Matrix

```text
┌──────────────────────┬────────┬───────────┬────────────────────────┐
│ Stage                │ Mutates│ Resume?   │ Runtime Action          │
├──────────────────────┼────────┼───────────┼────────────────────────┤
│ Recovery Decision    │ NO     │ YES       │ protected redispatch    │
│ Verification         │ NO     │ YES       │ protected redispatch    │
│ Lifecycle            │ NO     │ YES       │ protected redispatch    │
│ Execution            │ YES    │ NO blind  │ reconciliation/manual   │
└──────────────────────┴────────┴───────────┴────────────────────────┘
```

---

# 68. Why Execution Has the Strictest Rule

The general rule is:

```text
read-side crash
      ↓
repeat read
```

But:

```text
write-side crash
      ↓
cannot assume write did not happen
```

Execution is the write-side boundary.

---

# 69. Reconciliation

Reconciliation is a future/controlled process for determining external truth.

Conceptually:

```text
Ambiguous Execution
      ↓
Inspect Infrastructure
      ↓
Compare Expected Effect
      │
 ┌────┼─────────────┐
 │    │             │
DONE NOT DONE      UNKNOWN
 │    │             │
 ▼    ▼             ▼
verify new          human
       controlled
       execution
```

Critically:

```text
NOT DONE
      ↓
does not mean reuse old execution authorization blindly
```

A new controlled action may still be required depending on policy.

---

# 70. Manual Intervention

Manual intervention is used when automated runtime recovery cannot prove a safe next step.

Examples:

```text
ambiguous execution outcome

unknown resume safety

corrupted checkpoint

missing authoritative identity

repeated stale ownership

irreconcilable state
```

---

# 71. Recovery Does Not Mean "Always Continue"

A safe recovery system must sometimes stop.

```text
Can prove safe resume?
      │
 ┌────┴────┐
 │         │
YES        NO
 │         │
 ▼         ▼
RESUME   BLOCK /
         MANUAL
```

---

# 72. Crash Recovery Observability

Useful metrics include:

```text
runtime checkpoints created

checkpoint claim success

checkpoint claim contention

heartbeat count

lease expiry count

stale checkpoint count

abandoned checkpoint count

safe resume count

manual intervention count

execution reconciliation count

restart recovery duration
```

---

# 73. Important Alerts

Potential alerts:

```text
high abandoned checkpoint rate
```

May indicate:

```text
worker crashes
resource pressure
network instability
bad lease timing
```

---

```text
high execution reconciliation rate
```

May indicate:

```text
unstable executor communication
external API ambiguity
process crashes during mutation
```

---

# 74. Audit Requirements

Each recovery event should answer:

```text
Which checkpoint became stale?

Which worker owned it?

When did the lease expire?

Why was it considered abandoned?

What resume decision was made?

Was work redispatched?

Was execution blocked from replay?

Did manual intervention become necessary?
```

---

# 75. Crash Recovery Failure Philosophy

If the checkpoint is malformed:

```text
BLOCK
```

If workflow identity is missing:

```text
BLOCK
```

If execution state is ambiguous:

```text
RECONCILE
```

If stage safety is unknown:

```text
BLOCK
```

If another worker still owns the lease:

```text
WAIT
```

---

# 76. What Runtime Recovery Must Never Do

```text
✗ grant execution authorization
```

```text
✗ call arbitrary infrastructure handlers
```

```text
✗ bypass worker idempotency
```

```text
✗ replay uncertain execution
```

```text
✗ steal live ownership
```

```text
✗ ignore tenant identity
```

```text
✗ guess missing workflow state
```

---

# 77. Runtime Recovery Static Safety

Useful safety scans include searching runtime-recovery code for:

```text
executionAuthorized: true
```

Expected:

```text
no production matches
```

Also scan for:

```text
ExecutionWorker
processAuthorizedExecution
kubectl
child_process
execSync
spawnSync
```

The recovery subsystem should not become an alternate execution engine.

---

# 78. Crash Recovery Tests

Tests should cover:

```text
safe recovery-decision resume

safe verification resume

safe lifecycle resume

execution replay prohibition

live lease wait

completed checkpoint skip

unknown safety block

stale checkpoint abandonment

claim ownership

original error preservation

execution authorization remains false
```

---

# 79. Safety Freeze

At the end of runtime-recovery work:

```text
syntax tests
      +
unit tests
      +
integration tests
      +
process-crash simulations
      +
restart/resume E2E
      +
static invariant scans
      ↓
SAFETY FREEZE
```

The objective is to prevent later code from accidentally weakening the crash-recovery contract.

---

# 80. Runtime Recovery and Deployment Restarts

A planned AIRA deployment restart can look similar to a crash:

```text
worker processing
      ↓
container terminated
      ↓
new container starts
```

Durable checkpoints mean recovery state is not tied to one process lifetime.

---

# 81. Runtime Recovery and Kubernetes

If AIRA itself runs on Kubernetes:

```text
AIRA Pod A
    ↓
processing
    ↓
pod evicted
```

AIRA Pod B can later:

```text
start
  ↓
scan durable checkpoints
  ↓
recover safe work
```

This is exactly why process-local state is insufficient.

---

# 82. Runtime Recovery and Horizontal Scaling

With multiple AIRA replicas:

```text
AIRA-1
AIRA-2
AIRA-3
```

all may see available work.

Atomic checkpoint claims ensure:

```text
one current runtime owner
```

while idempotency ensures:

```text
one logical processor
```

---

# 83. Runtime Recovery vs Leader Election

AIRA does not necessarily require one global leader for every workflow.

Instead:

```text
operation-level ownership
```

allows distributed workers to process independent incidents concurrently.

---

# 84. Per-Operation Ownership

```text
Incident A
      ↓
Worker 1

Incident B
      ↓
Worker 2

Incident C
      ↓
Worker 3
```

This scales better than serializing all recovery through one leader.

---

# 85. Crash Recovery and Auditability

Checkpoint state also creates forensic value.

After an incident, operators can inspect:

```text
worker started
      ↓
checkpoint claimed
      ↓
heartbeat stopped
      ↓
lease expired
      ↓
recovery classified SAFE
      ↓
new worker resumed
```

This makes AIRA's own failures explainable.

---

# 86. AIRA Must Recover From Its Own Failure

A recovery platform that only handles customer infrastructure failures but loses its own state when it crashes is incomplete.

The runtime-recovery layer adds:

```text
AIRA can recover systems
      +
AIRA can recover its own workflow
```

---

# 87. Two Different Meanings of Recovery

```text
CUSTOMER RECOVERY
      ↓
restore customer infrastructure
```

and:

```text
AIRA RUNTIME RECOVERY
      ↓
restore AIRA's interrupted workflow
```

These should never be confused.

Runtime recovery restores processing.

It does not grant new operational authority.

---

# 88. Full Crash-Recovery Flow

```text
                    PROTECTED WORKER
                           │
                           ▼
                    CREATE CHECKPOINT
                           │
                           ▼
                     CLAIM OWNERSHIP
                           │
                           ▼
                       PROCESSING
                           │
                      heartbeat
                           │
                           ▼
                     BUSINESS LOGIC
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     X
             COMPLETE              PROCESS CRASH
                │                     │
                ▼                     ▼
           COMPLETED           heartbeat stops
                                      │
                                      ▼
                                 lease expires
                                      │
                                      ▼
                                STALE DETECTOR
                                      │
                                      ▼
                                  ABANDONED
                                      │
                                      ▼
                              RESUME-STATE RESOLVER
                                      │
                  ┌───────────────────┼────────────────────┐
                  │                   │                    │
                  ▼                   ▼                    ▼
                 SAFE            EXECUTION              UNKNOWN
                  │                   │                    │
                  ▼                   ▼                    ▼
                RESUME        RECONCILIATION           BLOCK
                  │                   │
                  ▼                   ▼
          RuntimeRecoveryWorker      MANUAL
                  │
                  ▼
            Protected Worker
                  │
                  ▼
              Idempotency
                  │
                  ▼
           Continue Safely
```

---

# 89. The Execution Branch

The single most important branch is:

```text
ABANDONED
    ↓
stage == EXECUTION?
    │
 ┌──┴────┐
 │       │
NO      YES
 │       │
 ▼       ▼
evaluate  REQUIRES_RECONCILIATION
safe      │
resume    ▼
       MANUAL_INTERVENTION
```

No code path should skip this distinction.

---

# 90. Runtime Recovery Invariants

## Invariant 1

```text
A durable checkpoint exists before protected work.
```

## Invariant 2

```text
Only the current claim owner may finalize a checkpoint.
```

## Invariant 3

```text
Live ownership must not be stolen.
```

## Invariant 4

```text
Expired ownership can be detected as stale.
```

## Invariant 5

```text
Safe stages resume through existing protected workers.
```

## Invariant 6

```text
Resumed work still passes through idempotency.
```

## Invariant 7

```text
Execution is never blindly replayed after ambiguous interruption.
```

## Invariant 8

```text
Runtime recovery never creates execution authorization.
```

## Invariant 9

```text
Unknown safety fails closed.
```

## Invariant 10

```text
Completed work is not repeated after restart.
```

---

# 91. Why Phase 11.2 Strengthens AIRA

Before runtime checkpoints:

```text
process crash
      ↓
workflow state uncertain or lost
```

After runtime checkpoints:

```text
process crash
      ↓
durable state survives
      ↓
stale work detected
      ↓
safe resume decision
```

---

# 92. Before vs After

Before:

```text
AIRA can recover customer infrastructure
      ↓
but AIRA process failure can interrupt workflow
```

After:

```text
AIRA can recover customer infrastructure
      +
recover safe portions of its own interrupted workflow
```

---

# 93. Why It Matters in Production

Production systems eventually encounter:

```text
pod restarts
deployment rollouts
machine failures
network partitions
temporary database failures
queue reconnects
```

Crash recovery turns these from exceptional events into designed-for operating conditions.

---

# 94. Reliability Composition

AIRA's distributed reliability now becomes:

```text
QUEUE DELIVERY SAFETY
        ↓
Idempotency

WORKER OWNERSHIP SAFETY
        ↓
Leases + Tokens

PROCESS CRASH SAFETY
        ↓
Runtime Checkpoints

RESTART SAFETY
        ↓
Stale Detection + Coordinator

SIDE-EFFECT SAFETY
        ↓
Stage-Aware Resume Rules
```

---

# 95. Idempotency + Runtime Recovery + Execution Safety

Together:

```text
Duplicate Message
      ↓
Idempotency protects

Worker Crash
      ↓
Checkpoint protects

Old Worker Returns
      ↓
Claim token protects

Execution Outcome Unknown
      ↓
Reconciliation protects
```

Each layer solves a different distributed-systems problem.

---

# 96. What Runtime Recovery Does Not Solve

Crash recovery does not automatically solve:

```text
external infrastructure reconciliation

distributed transaction semantics

provider-specific mutation tokens

network partition consensus

multi-region coordination

disaster recovery of checkpoint storage itself
```

Those may belong to future reliability phases.

This document describes the current crash/restart recovery boundary.

---

# 97. Future Extension: Automated Reconciliation

A future safe enhancement could add stage-specific reconciliation.

Example:

```text
Uncertain Kubernetes Restart
      ↓
query Deployment generation
      ↓
query Pod creation time
      ↓
compare expected mutation identity
      ↓
determine whether action happened
```

Only after deterministic evidence should another action be considered.

---

# 98. Future Extension: Recovery Tokens at Provider Boundary

For supported APIs, future executor designs may pass provider-level idempotency or operation tokens.

```text
AIRA Execution ID
      ↓
Cloud Provider Idempotency Token
```

This could further reduce ambiguous side-effect risk where providers support it.

---

# 99. Future Extension: Runtime Recovery Dashboard

Operators could eventually see:

```text
ACTIVE WORK

STALE WORK

SAFE TO RESUME

AWAITING RECONCILIATION

MANUAL INTERVENTION

COMPLETED AFTER RESTART
```

This would make AIRA's internal reliability state visible operationally.

---

# 100. Final Principle

AIRA's runtime recovery system follows one rule:

> **Recover processing automatically only when repeating that processing cannot blindly repeat an uncertain infrastructure mutation.**

Therefore:

```text
SAFE COMPUTATION
      ↓
RESUME
```

```text
SAFE OBSERVATION
      ↓
RESUME
```

```text
SAFE ORCHESTRATION
      ↓
RESUME
```

but:

```text
UNCERTAIN MUTATION
      ↓
DO NOT REPLAY
      ↓
RECONCILE
```

That distinction is what makes AIRA's crash recovery safe rather than merely aggressive.