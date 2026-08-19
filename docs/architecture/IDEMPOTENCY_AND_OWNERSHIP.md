# AIRA Idempotency and Worker Ownership Architecture

> **How AIRA prevents duplicate distributed work, establishes safe worker ownership, and ensures stale workers cannot repeat or overwrite recovery operations.**

---

# 1. Why Idempotency Exists

Distributed systems commonly use queues with **at-least-once delivery** semantics.

That means a message may be delivered more than once.

Example:

```text
RabbitMQ
   ↓
Execution Message
   ↓
Worker receives it
   ↓
Worker performs action
   ↓
ACK is lost
   ↓
RabbitMQ delivers the same message again
```

Without protection:

```text
Message 1
   ↓
Restart Pod

Message 1 again
   ↓
Restart Pod AGAIN
```

For infrastructure recovery, duplicate processing can be dangerous.

Therefore AIRA does not assume:

```text
exactly-once delivery
```

Instead it builds:

```text
at-least-once delivery
        +
idempotent logical processing
```

---

# 2. Core Principle

AIRA asks:

```text
"Is this a new logical operation,
or another delivery of an operation
we already know about?"
```

That requires a deterministic identity.

---

# 3. Logical Operation Identity

A queue message ID is not enough.

The same logical operation may arrive under different transport metadata.

Therefore AIRA derives identity from durable business fields.

Conceptually:

```text
organizationId
      +
environmentId
      +
operation type
      +
immutable operation identity
      ↓
Logical Operation
```

Then:

```text
Logical Operation
      ↓
Idempotency Key
```

---

# 4. Why Transport IDs Are Not Sufficient

Bad identity:

```text
messageId = random UUID
```

If the same logical execution is published twice:

```text
Message A
messageId = 111

Message B
messageId = 222
```

Transport-level identity says:

```text
different
```

but operationally they may be:

```text
same executionRequest
same plan
same incident
```

AIRA therefore uses logical identity instead.

---

# 5. Idempotency Architecture

```text
Worker receives job
      │
      ▼
Resolve immutable identity
      │
      ▼
Generate idempotency key
      │
      ▼
Look up / atomically claim record
      │
      ├───────────────┬────────────────┐
      │               │                │
      ▼               ▼                ▼
     NEW          PROCESSING       COMPLETED
      │               │                │
      ▼               ▼                ▼
    CLAIM          DO NOT          RETURN STORED
      │             REPEAT            RESULT
      ▼
   PROCESS
      │
      ▼
   COMPLETE
```

---

# 6. Idempotency Record

Conceptually, an idempotency record tracks:

```text
IdempotencyRecord
   │
   ├── idempotencyKey
   ├── organizationId
   ├── environmentId
   ├── operation
   ├── identity
   ├── requestFingerprint
   ├── status
   ├── ownerId
   ├── claimToken
   ├── leaseUntil
   ├── heartbeatAt
   ├── result
   ├── error
   └── references
```

It becomes the durable source of truth for whether a logical operation has already been processed.

---

# 7. Operation Status

Conceptually:

```text
PENDING
   ↓
PROCESSING
   ↓
 ┌─┴───────────────┐
 │                 │
 ▼                 ▼
COMPLETED        FAILED
```

Depending on the failure type, some failed operations may become retryable.

---

# 8. Atomic Claim

The most important operation is:

```text
claim if not already owned
```

This must be atomic.

Unsafe:

```text
Worker A checks
"record is free"

Worker B checks
"record is free"

Worker A claims

Worker B claims
```

Now two workers process the same logical operation.

Correct:

```text
Worker A
   ↓
atomic claim

Worker B
   ↓
atomic claim

database
   ↓
exactly one succeeds
```

---

# 9. Why Atomicity Matters

Without atomic ownership:

```text
duplicate message
      ↓
two workers
      ↓
two successful reads
      ↓
two side effects
```

With atomic claiming:

```text
duplicate message
      ↓
two workers
      ↓
one claim winner
      ↓
one logical processor
```

---

# 10. Claim Result

Conceptually, claim may return:

```text
ACQUIRED
```

or:

```text
DUPLICATE_PROCESSING
```

or:

```text
DUPLICATE_COMPLETED
```

or:

```text
RETRY_ACQUIRED
```

or:

```text
STALE_RECLAIMED
```

depending on state.

---

# 11. DUPLICATE_PROCESSING

Scenario:

```text
Worker A owns operation
      ↓
Worker B receives duplicate
```

B sees:

```text
status = PROCESSING
lease still valid
```

Therefore:

```text
DUPLICATE_PROCESSING
      ↓
do not invoke business handler
```

---

# 12. DUPLICATE_COMPLETED

Scenario:

```text
operation already finished
      ↓
same logical job arrives again
```

AIRA returns:

```text
previous stored result
```

instead of repeating work.

Flow:

```text
Duplicate Job
     ↓
Same Idempotency Key
     ↓
COMPLETED
     ↓
Return Previous Result
```

---

# 13. Why Previous Results Matter

Without stored results:

```text
duplicate
   ↓
"already completed"
```

may be insufficient for downstream systems.

With stored results:

```text
duplicate
   ↓
previous result
   ↓
same logical outcome
```

This makes duplicate handling deterministic.

---

# 14. Request Fingerprint

Same identity with different input is dangerous.

Example:

```text
executionRequestId = ER-100
planId = PLAN-1
planHash = AAA
```

First payload:

```text
pod = payments-a
```

Second payload:

```text
pod = payments-b
```

If they share the same logical identity unexpectedly, AIRA should not silently reuse the old result.

Therefore AIRA also fingerprints material request input.

---

# 15. Identity vs Fingerprint

```text
IDENTITY
   ↓
"What logical operation is this?"
```

```text
FINGERPRINT
   ↓
"Is the input materially identical?"
```

Both matter.

---

# 16. Fingerprint Mismatch

```text
Same Idempotency Identity
        +
Different Request Fingerprint
        ↓
CONFLICT
        ↓
FAIL CLOSED
```

Not:

```text
reuse old result anyway
```

---

# 17. Worker Owner ID

Every processing claim has an owner.

Example:

```text
workerId =
execution:host-1:pid-2450
```

This helps identify:

```text
which worker owns the operation
```

---

# 18. Why Owner ID Alone Is Not Enough

Suppose a process restarts with the same logical worker name.

Or a stale process wakes up later.

Owner identity alone cannot prove current ownership.

Therefore AIRA also uses:

```text
claimToken
```

---

# 19. Claim Token

Every successful ownership claim receives a unique token.

```text
Worker A
   ↓
claim
   ↓
claimToken = AAA
```

If ownership is later transferred:

```text
Worker B
   ↓
new claim
   ↓
claimToken = BBB
```

The current token defines ownership.

---

# 20. Ownership Fencing

This prevents stale workers from writing after ownership has changed.

Scenario:

```text
Worker A
token AAA
      ↓
processing
      ↓
freezes
```

Lease expires.

```text
Worker B
token BBB
      ↓
takes ownership
```

A later wakes up and attempts:

```text
complete(token=AAA)
```

Current token is:

```text
BBB
```

Therefore:

```text
AAA != BBB
      ↓
REJECT
```

---

# 21. Why Claim Tokens Matter

Without fencing:

```text
Worker B finishes correctly
      ↓
Worker A wakes up
      ↓
A overwrites result
```

With fencing:

```text
old worker
      ↓
stale token
      ↓
cannot write
```

This protects final state integrity.

---

# 22. Lease

A claim should not last forever.

A worker gets ownership for a bounded period.

```text
claim
  ↓
leaseUntil = now + leaseMs
```

Example:

```text
now = 10:00:00
leaseMs = 60 sec
leaseUntil = 10:01:00
```

---

# 23. Why Leases Exist

Without leases:

```text
Worker claims operation
      ↓
process crashes
      ↓
record remains PROCESSING forever
```

Then no other worker can recover it.

With leases:

```text
Worker crashes
      ↓
lease expires
      ↓
operation becomes reclaimable
```

---

# 24. Lease Is Not Automatic Permission to Replay

Important distinction:

```text
lease expired
```

means:

```text
owner may be gone
```

It does not automatically mean:

```text
safe to repeat side effect
```

That is especially important for execution.

---

# 25. Heartbeat

Long-running operations may refresh ownership.

```text
Worker
   ↓
claim
   ↓
work
   ↓
heartbeat
   ↓
work
   ↓
heartbeat
```

Heartbeat proves:

```text
"I am still alive and processing."
```

---

# 26. Heartbeat Architecture

```text
Worker
   │
   ├── process
   │
   ├── heartbeat
   │
   ├── process
   │
   ├── heartbeat
   │
   ▼
complete
```

Each heartbeat may extend the lease.

---

# 27. Lost Heartbeat

If:

```text
heartbeat stops
      ↓
lease expires
```

then the operation may become stale.

This allows runtime recovery to investigate it.

---

# 28. Idempotency vs Runtime Checkpoints

These are related but separate.

## Idempotency

Answers:

```text
"Has this logical operation
already been processed?"
```

## Runtime Checkpoint

Answers:

```text
"What was happening when
the process disappeared?"
```

---

# 29. Why Both Are Needed

Idempotency alone:

```text
duplicate delivery
      ↓
safe
```

but:

```text
worker crashes midway
      ↓
what now?
```

Runtime checkpoint alone:

```text
worker crash state known
```

but:

```text
duplicate queue delivery
      ↓
could process twice
```

Together:

```text
Idempotency
      +
Runtime Checkpoint
      ↓
Distributed Recovery Safety
```

---

# 30. Operation-Specific Identity

Different workers use different immutable identities.

This is intentional.

---

# 31. Recovery Decision Identity

Conceptually:

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
Recovery Decision Idempotency
```

Why diagnosis revision?

```text
Diagnosis v1
      ≠
Diagnosis v2
```

A new diagnosis revision may legitimately produce a new recovery decision.

---

# 32. Execution Identity

Execution needs stricter identity.

```text
organizationId
      +
environmentId
      +
executionRequestId
      +
executionPlanId
      +
executionPlanHash
      ↓
Execution Idempotency
```

This ties processing to an exact immutable plan.

---

# 33. Verification Identity

```text
organizationId
      +
environmentId
      +
executionRequestId
      +
verificationPlanId
      +
verificationPlanHash
      ↓
Verification Idempotency
```

This protects one exact verification operation.

---

# 34. Lifecycle Identity

```text
organizationId
      +
environmentId
      +
incidentId
      +
verificationId
      +
lifecycleIntent
      ↓
Lifecycle Idempotency
```

This distinguishes different lifecycle transitions for the same incident.

---

# 35. Why One Universal Key Would Be Bad

Bad:

```text
incidentId
   ↓
one idempotency key for everything
```

Then:

```text
recovery decision
execution
verification
lifecycle
```

could collide incorrectly.

Instead:

```text
stage-specific immutable identity
```

keeps operations independent.

---

# 36. Idempotent Worker Wrapper

Conceptually, each protected worker follows:

```text
worker.process(job)
      ↓
resolve identity
      ↓
idempotentWorker.run({
  identity,
  payload,
  owner,
  lease,
  handler
})
      ↓
handler executes only if claim succeeds
```

---

# 37. Handler Boundary

The business handler is protected.

```text
Idempotency Service
      ↓
claim succeeds?
   ┌──┴─────┐
   │        │
 YES       NO
   │        │
   ▼        ▼
handler   do not invoke
```

This is essential.

A duplicate must never enter the side-effecting handler.

---

# 38. Result Persistence

When processing succeeds:

```text
handler result
      ↓
complete idempotency record
      ↓
store result
```

Future duplicate:

```text
same key
      ↓
DUPLICATE_COMPLETED
      ↓
previous result
```

---

# 39. Error Persistence

On failure:

```text
handler throws
      ↓
classify error
      ↓
record failure
```

Possible metadata:

```text
code
message
retryable
timestamp
attempt
```

---

# 40. Retry Classification

Not every error should automatically allow a retry.

Potentially retryable:

```text
ECONNRESET
ETIMEDOUT
temporary DB failure
temporary queue failure
```

Potentially non-retryable:

```text
policy denied
authorization invalid
plan mismatch
malformed input
tenant mismatch
```

---

# 41. Why Retryability Must Be Conservative

Bad:

```text
any error
  ↓
retry
```

Could cause:

```text
policy violation
      ↓
retry
      ↓
policy violation
      ↓
retry forever
```

Correct:

```text
classify failure
      ↓
retry only known transient classes
```

---

# 42. Retryability vs Side-Effect Replay Safety

This distinction is critical.

An execution error can be technically retryable:

```text
ECONNRESET
```

but the infrastructure mutation may already have happened.

Therefore:

```text
idempotency retryability
       ≠
runtime mutation replay safety
```

Runtime recovery treats execution more conservatively.

---

# 43. Recovery Decision Duplicate Example

First delivery:

```text
incident = INC-1
diagnosis = D-1
revision = 2
      ↓
RecoveryDecisionWorker
      ↓
claim
      ↓
decision produced
      ↓
complete
```

Second delivery:

```text
INC-1 + D-1 + rev2
      ↓
same key
      ↓
DUPLICATE_COMPLETED
      ↓
return previous decision
```

---

# 44. Execution Duplicate Example

First:

```text
ER-100
PLAN-1
HASH-AAA
      ↓
execute
```

Second:

```text
ER-100
PLAN-1
HASH-AAA
      ↓
same key
      ↓
already complete
      ↓
NO SECOND MUTATION
```

---

# 45. Verification Duplicate Example

First:

```text
ER-100
VERIFY-PLAN-1
HASH-V
      ↓
verification completed
```

Duplicate:

```text
same identity
      ↓
return previous verification
```

---

# 46. Lifecycle Duplicate Example

First:

```text
verificationId = V1
intent = PROCESS_VERIFICATION_OUTCOME
      ↓
lifecycle transition
```

Duplicate:

```text
same V1
same intent
      ↓
previous lifecycle result
```

---

# 47. Concurrent Worker Example

Suppose the same execution job reaches two consumers.

```text
                 JOB
                /   \
               /     \
              ▼       ▼
          Worker A  Worker B
              │       │
              └───┬───┘
                  ▼
             Atomic Claim
               /     \
              /       \
             ▼         ▼
          ACQUIRED   DUPLICATE
```

Only A invokes the handler.

---

# 48. Crash Before Handler

```text
Worker
   ↓
claim
   ↓
crashes before business logic
```

Lease eventually expires.

A new worker may reclaim depending on stage and runtime recovery semantics.

---

# 49. Crash During Non-Mutating Handler

Example:

```text
Verification
      ↓
claim
      ↓
collect metrics
      ↓
crash
```

Lease expires.

Runtime recovery:

```text
safe stage
      ↓
resume
```

Idempotency ensures logical consistency.

---

# 50. Crash During Execution Handler

```text
Execution
      ↓
claim
      ↓
mutation may be sent
      ↓
crash
```

Lease expires.

AIRA must not simply say:

```text
claim expired
      ↓
run handler again
```

Instead runtime recovery requires reconciliation.

---

# 51. Stale Reclaim

A stale operation may be reclaimed when appropriate.

Conceptually:

```text
PROCESSING
   ↓
lease expired
   ↓
stale
   ↓
new owner
   ↓
new claim token
```

This is safe only under stage-specific recovery rules.

---

# 52. Why Execution Reclaim Is Different

A stale execution record may represent:

```text
no mutation happened
```

or:

```text
mutation happened
```

or:

```text
mutation partially happened
```

Therefore the runtime layer must not automatically turn stale ownership into a new execution attempt.

---

# 53. Idempotency Is Not Authorization

Another critical rule:

```text
idempotency claim acquired
      ≠
execution authorized
```

The idempotency system answers:

```text
"May this worker process this logical operation?"
```

The authorization system answers:

```text
"May this infrastructure mutation happen?"
```

They are different.

---

# 54. Claim Ownership Is Not Authorization

Similarly:

```text
runtime checkpoint claimed
      ≠
execution authorized
```

Ownership means:

```text
"This worker currently owns processing."
```

Not:

```text
"This worker is allowed to mutate infrastructure."
```

---

# 55. Worker Ownership Layers

AIRA effectively has two related ownership mechanisms.

```text
Runtime Checkpoint Ownership
       ↓
"Who owns this stage now?"
```

and:

```text
Idempotency Ownership
       ↓
"Who owns this logical operation?"
```

Both protect different failure modes.

---

# 56. Why Two Ownership Layers Are Useful

Runtime ownership protects:

```text
process crash
restart
stale checkpoint
resume planning
```

Idempotency ownership protects:

```text
duplicate delivery
concurrent workers
logical exactly-once behavior
```

Together they strengthen distributed coordination.

---

# 57. Lease Timing

Lease values should be longer than expected heartbeat intervals.

Example:

```text
lease = 60 sec
heartbeat = 20 sec
```

Flow:

```text
0 sec     claim
20 sec    heartbeat
40 sec    heartbeat
60 sec    heartbeat
```

As long as heartbeats continue:

```text
ownership remains valid
```

---

# 58. Heartbeat Failure

If the process stalls:

```text
last heartbeat = 40 sec
      ↓
time = 120 sec
      ↓
lease expired
      ↓
stale
```

Runtime recovery can investigate.

---

# 59. Lease Too Short

Danger:

```text
normal operation takes 30 sec
lease = 5 sec
```

A healthy worker may appear stale.

This can create false reclaims.

Therefore lease configuration must reflect expected workload.

---

# 60. Lease Too Long

Opposite danger:

```text
worker crashes
lease = 1 hour
```

Recovery is unnecessarily delayed.

Therefore leases are a balance between:

```text
false stale detection
      and
slow failure recovery
```

---

# 61. Heartbeat Interval

Heartbeat should be comfortably shorter than lease duration.

Conceptually:

```text
heartbeatMs < leaseMs
```

with enough margin for transient delays.

---

# 62. Database Atomicity

Ownership correctness depends on atomic persistence operations.

Conceptually:

```text
find record
and
claim if eligible
```

should happen as one protected DB operation.

Not:

```text
read
wait
write
```

with race windows.

---

# 63. Compare-and-Set Style Updates

Safe ownership updates follow logic like:

```text
update record
WHERE
idempotencyKey = X
AND
owner = current owner
AND
claimToken = current token
```

If no record matches:

```text
ownership changed
      ↓
reject update
```

---

# 64. Completion Fencing

Worker completion should require the current claim token.

```text
complete({
  key,
  owner,
  claimToken
})
```

Otherwise stale workers could finalize operations they no longer own.

---

# 65. Failure Fencing

Failure updates should also require ownership.

A stale worker should not be able to mark a new owner's operation failed.

---

# 66. Heartbeat Fencing

Heartbeat should require the current token too.

Otherwise a stale worker could keep extending an operation it no longer owns.

---

# 67. Result Reference

Large results may sometimes be better represented through references.

Conceptually:

```text
Idempotency Record
      ↓
resultReference
      ↓
RecoveryDecision / Verification / Lifecycle document
```

This can avoid duplicating large domain objects.

---

# 68. Auditability

An idempotency record helps answer:

```text
Was this operation duplicated?

Which worker owned it?

How many attempts occurred?

Was ownership reclaimed?

Did a stale worker return?

What result was reused?

How long did processing take?
```

---

# 69. Operational Metrics

Useful idempotency metrics include:

```text
claim success count

duplicate-processing count

duplicate-completed count

retry-acquired count

stale-reclaim count

lease expiration count

heartbeat failure count

fingerprint conflict count

stale-token rejection count
```

---

# 70. Alerting

Potential alerts:

```text
high stale-reclaim rate
```

could indicate:

```text
worker instability
bad lease configuration
database latency
process crashes
```

Similarly:

```text
high duplicate rate
```

may indicate queue redelivery or publisher behavior issues.

---

# 71. Idempotency and Queue ACK

The correct general sequence is:

```text
receive message
      ↓
idempotent processing
      ↓
durable result
      ↓
ACK message
```

If ACK fails after completion:

```text
message may redeliver
      ↓
idempotency returns old result
```

This is exactly why idempotency is needed.

---

# 72. Do Not ACK Too Early

Unsafe:

```text
receive
   ↓
ACK
   ↓
process
   ↓
process crashes
```

The queue now believes the work is done even though it was lost.

Protected worker/queue design should ensure persistence semantics are compatible with delivery semantics.

---

# 73. At-Least-Once vs Exactly-Once

AIRA should assume:

```text
AT-LEAST-ONCE DELIVERY
```

because true distributed exactly-once side effects are difficult.

Instead AIRA aims for:

```text
EFFECTIVELY-ONCE LOGICAL PROCESSING
```

using:

```text
deterministic identity
+
atomic claims
+
idempotency records
+
ownership fencing
+
safe side-effect design
```

---

# 74. Effectively-Once Processing

```text
Message delivered once
      ↓
process
```

or:

```text
Message delivered 5 times
      ↓
same logical identity
      ↓
one handler execution
      ↓
same result reused 4 times
```

Operationally, the logical action occurs once.

---

# 75. Multi-Tenant Idempotency

Tenant scope must be part of identity.

Without tenant identity:

```text
Org A incident 123
Org B incident 123
```

could collide.

Therefore:

```text
organizationId
+
environmentId
```

must participate in logical identity.

---

# 76. Environment Isolation

Likewise:

```text
production
```

and:

```text
staging
```

must never share idempotency identity accidentally.

---

# 77. Operation Type Isolation

Recovery decision and execution must not collide even if they reference the same incident.

Therefore:

```text
operation type
```

is part of identity.

Example:

```text
RECOVERY_DECISION:INC-1
```

is not:

```text
EXECUTION:INC-1
```

---

# 78. Idempotency Safety Invariants

## Invariant 1

```text
The same logical operation must map
to the same idempotency identity.
```

## Invariant 2

```text
Different logical operations must not collide.
```

## Invariant 3

```text
Only one active owner may process a logical operation.
```

## Invariant 4

```text
Duplicate deliveries must not invoke the protected handler twice.
```

## Invariant 5

```text
Completed duplicates return prior outcome.
```

## Invariant 6

```text
Ownership expires when the lease expires.
```

## Invariant 7

```text
Reclaim creates a new claim token.
```

## Invariant 8

```text
Stale tokens cannot complete, fail, or heartbeat.
```

## Invariant 9

```text
Idempotency ownership never grants execution authorization.
```

## Invariant 10

```text
Execution replay safety is determined separately
from idempotency retryability.
```

---

# 79. Recovery Decision Worker Flow

```text
RecoveryDecision Job
        ↓
Runtime Checkpoint
        ↓
Idempotency
        ↓
Recovery Decision Lifecycle
        ↓
Persist
        ↓
Complete Idempotency
```

Duplicate:

```text
same diagnosis revision
      ↓
return previous result
```

---

# 80. Execution Worker Flow

```text
Execution Job
      ↓
Runtime Checkpoint
      ↓
Idempotency
      ↓
Authorization
      ↓
Plan Validation
      ↓
Execution
```

Duplicate:

```text
same execution request + plan
      ↓
no repeated mutation
```

---

# 81. Verification Worker Flow

```text
Verification Job
      ↓
Runtime Checkpoint
      ↓
Idempotency
      ↓
Verification Pipeline
```

Duplicate:

```text
same execution + verification plan
      ↓
reuse verification result
```

---

# 82. Lifecycle Worker Flow

```text
Lifecycle Job
      ↓
Runtime Checkpoint
      ↓
Idempotency
      ↓
Lifecycle State Transition
```

Duplicate:

```text
same verification + intent
      ↓
no duplicate transition
```

---

# 83. Stale Worker Failure Example

```text
Worker A
   ↓
claims key K
token AAA
   ↓
performs work
   ↓
hangs before completion
```

Lease expires.

```text
Worker B
   ↓
claims K
token BBB
   ↓
processes safely
```

A wakes:

```text
complete K with AAA
      ↓
rejected
```

---

# 84. Fingerprint Conflict Example

First request:

```text
key K

payload:
target = pod-A
```

Second:

```text
key K

payload:
target = pod-B
```

AIRA should detect:

```text
same identity
different material request
      ↓
CONFLICT
```

This can reveal upstream bugs or tampering.

---

# 85. Idempotency and Manual Intervention

Some operations should not be automatically retried after failure.

Idempotency can record:

```text
FAILED
```

while higher-level recovery decides:

```text
MANUAL_INTERVENTION
```

The idempotency subsystem should not independently decide operational safety.

---

# 86. Idempotency and Runtime Recovery

After restart:

```text
Runtime Recovery
      ↓
decides SAFE RESUME
      ↓
protected worker
      ↓
idempotency
```

This is important.

Runtime recovery does not bypass idempotency.

---

# 87. Correct Restart Flow

```text
checkpoint abandoned
      ↓
resolver says RESUME
      ↓
RuntimeRecoveryWorker
      ↓
VerificationWorker / LifecycleWorker / RecoveryDecisionWorker
      ↓
Idempotency
      ↓
safe processing
```

---

# 88. Incorrect Restart Flow

Forbidden:

```text
checkpoint abandoned
      ↓
call business logic directly
      ↓
bypass idempotency
```

That would weaken duplicate safety.

---

# 89. Execution Restart Flow

For execution:

```text
checkpoint abandoned
      ↓
resolver says REQUIRES_RECONCILIATION
      ↓
RuntimeRecoveryWorker
      ↓
DO NOT dispatch ExecutionWorker
```

This is stronger than normal idempotency replay semantics because the side effect may be ambiguous.

---

# 90. Testing Strategy

Idempotency tests should cover:

```text
first claim succeeds
```

```text
second concurrent claim rejected
```

```text
completed duplicate returns result
```

```text
same identity + different payload fails
```

```text
lease expires
```

```text
stale worker can be reclaimed
```

```text
new claim token issued
```

```text
old token cannot complete
```

```text
old token cannot heartbeat
```

```text
retryable failure may be retried
```

```text
non-retryable failure fails closed
```

---

# 91. Worker-Specific Tests

Recovery decision:

```text
duplicate diagnosis processing
      ↓
lifecycle called once
```

Execution:

```text
duplicate delivery
      ↓
executor called once
```

Verification:

```text
duplicate delivery
      ↓
verification pipeline called once
```

Lifecycle:

```text
duplicate delivery
      ↓
lifecycle transition called once
```

---

# 92. Safety Freeze Scans

Static checks can also ensure protected workers do not accidentally add unsafe authority.

Examples:

```text
search for:
executionAuthorized: true
```

in places where authority must never be manufactured.

Static scans are not a substitute for runtime tests, but they help freeze important invariants.

---

# 93. Why Idempotency Strengthens AIRA

Without it:

```text
safe recovery logic
      ↓
duplicate queue message
      ↓
unsafe repeated operation
```

With it:

```text
safe recovery logic
      +
distributed duplicate protection
      ↓
more reliable automation
```

---

# 94. Idempotency Does Not Make Unsafe Actions Safe

Important:

```text
unsafe action
      +
idempotency
      ≠
safe action
```

Idempotency only ensures:

```text
the same logical action is not repeated unintentionally
```

Policy and authorization still determine whether the action should happen at all.

---

# 95. Ownership Does Not Make Unsafe Actions Safe

Similarly:

```text
worker owns operation
      ≠
operation is authorized
```

Ownership is coordination.

Authorization is permission.

---

# 96. Three Different Questions

AIRA must distinguish:

```text
QUESTION 1
"Is this action allowed?"
      ↓
Authorization
```

```text
QUESTION 2
"Has this logical action already been processed?"
      ↓
Idempotency
```

```text
QUESTION 3
"Which worker currently owns processing?"
      ↓
Lease + Claim Token
```

All three are required.

---

# 97. Distributed Reliability Stack

```text
                    PROTECTED OPERATION
                           │
                           ▼
                    AUTHORIZATION
                           │
                           ▼
                      IDEMPOTENCY
                           │
                           ▼
                         LEASE
                           │
                           ▼
                      CLAIM TOKEN
                           │
                           ▼
                    RUNTIME CHECKPOINT
                           │
                           ▼
                     BUSINESS LOGIC
                           │
                           ▼
                    DURABLE RESULT
```

For mutating execution, additional side-effect-aware recovery rules apply.

---

# 98. Practical Exactly-Once Model

AIRA's practical model is:

```text
Transport
   ↓
At-Least-Once

Processing
   ↓
Idempotent

Ownership
   ↓
Leased + Fenced

State
   ↓
Durable

Crash Recovery
   ↓
Stage-Aware

Side Effects
   ↓
Never blindly replay uncertain execution
```

This is more realistic than assuming perfect exactly-once delivery.

---

# 99. Full Idempotency Flow

```text
                         QUEUE MESSAGE
                              │
                              ▼
                       PROTECTED WORKER
                              │
                              ▼
                    RESOLVE LOGICAL IDENTITY
                              │
                              ▼
                     GENERATE IDEMPOTENCY KEY
                              │
                              ▼
                     COMPUTE FINGERPRINT
                              │
                              ▼
                         ATOMIC CLAIM
                              │
              ┌───────────────┼─────────────────┐
              │               │                 │
              ▼               ▼                 ▼
           ACQUIRED       PROCESSING        COMPLETED
              │               │                 │
              ▼               ▼                 ▼
          claimToken      DUPLICATE         OLD RESULT
              │
              ▼
             LEASE
              │
              ▼
           HEARTBEAT
              │
              ▼
            HANDLER
              │
       ┌──────┴──────┐
       │             │
       ▼             ▼
    SUCCESS        FAILURE
       │             │
       ▼             ▼
   COMPLETE          FAIL
       │
       ▼
 STORE RESULT
```

---

# 100. Final Principle

AIRA's idempotency architecture follows one central rule:

> **A logical recovery operation may be delivered many times, but it should only be processed once by the valid current owner.**

And ownership follows:

> **A worker only owns an operation while its lease and claim token remain valid.**

Together:

```text
DETERMINISTIC IDENTITY
        +
ATOMIC CLAIMING
        +
LEASES
        +
HEARTBEATS
        +
CLAIM-TOKEN FENCING
        +
RESULT REUSE
        ↓
SAFE DISTRIBUTED PROCESSING
```

This is what allows AIRA to operate on top of real queueing and distributed-worker semantics without assuming perfect message delivery.