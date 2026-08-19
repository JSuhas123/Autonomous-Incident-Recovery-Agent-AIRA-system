Phase 11.3 — Durable Workflow Outbox & Reliable Stage Handoff
AIRA — Autonomous Incident Recovery Agent

Phase: 11.3
Status: COMPLETE 🔒
Subsystem: Durable Workflow Transport
Primary Goal: Guarantee reliable, recoverable and idempotent communication between AIRA's protected recovery stages.

1. Why Phase 11.3 Exists

AIRA performs infrastructure recovery as a sequence of protected stages.

At a simplified level:

Incident
   ↓
Diagnosis
   ↓
Recovery Decision
   ↓
Execution
   ↓
Verification
   ↓
Lifecycle

Before Phase 11.3, individual stages could already enforce important safety properties such as authorization, immutable plans and idempotent execution.

However, another distributed-systems problem remained:

What happens if AIRA successfully finishes one stage but crashes before the next stage receives the message?

For example:

Execution succeeds
      ↓
Verification should start
      ↓
PROCESS CRASHES HERE
      ↓
???

Without durable handoff, the workflow could become stranded.

Another failure window exists when using RabbitMQ directly:

Database state saved
      ↓
publish RabbitMQ message
      ↓
RabbitMQ unavailable
      ↓
workflow transition lost

Or:

RabbitMQ accepts message
      ↓
process crashes
      ↓
database never records delivery
      ↓
message may be published again

These are normal failure modes in distributed systems.

Phase 11.3 therefore introduced a Durable Workflow Outbox.

2. Core Principle

The central rule introduced in Phase 11.3 is:

DATABASE STATE
     +
DURABLE OUTBOX EVENT
     ↓
committed before
     ↓
BROKER DELIVERY

The workflow no longer depends on an in-memory call successfully reaching the next worker.

Instead:

Stage completes
      ↓
Durable outbox record created
      ↓
Outbox publisher discovers record
      ↓
Claim record
      ↓
Publish to RabbitMQ
      ↓
Consumer receives event
      ↓
Protected worker executes

Therefore RabbitMQ becomes a transport mechanism, not the source of truth for workflow progress.

3. High-Level Architecture
┌───────────────────────────┐
│ Recovery Decision Worker  │
└─────────────┬─────────────┘
              │
              ▼
     Durable Outbox Event
              │
              ▼
┌───────────────────────────┐
│ Workflow Outbox Runtime   │
└─────────────┬─────────────┘
              │
              ▼
       Claim + Lease
              │
              ▼
┌───────────────────────────┐
│ Outbox Dispatcher         │
└─────────────┬─────────────┘
              │
              ▼
          RabbitMQ
              │
              ▼
┌───────────────────────────┐
│ Consumer Registry         │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ Execution Worker          │
└─────────────┬─────────────┘
              │
              ▼
     Durable Outbox Event
              │
              ▼
         Verification
              │
              ▼
     Durable Outbox Event
              │
              ▼
          Lifecycle
4. Durable Workflow Chain

Phase 11.3 established the durable chain:

Recovery Decision
      │
      │ durable handoff
      ▼
Execution
      │
      │ durable handoff
      ▼
Verification
      │
      │ durable handoff
      ▼
Lifecycle

The important difference is that these arrows are no longer simple function calls.

Each arrow represents a recoverable distributed-systems boundary:

Producer
   ↓
Persistent Outbox
   ↓
Claim
   ↓
Lease
   ↓
Dispatch
   ↓
RabbitMQ
   ↓
Consumer
   ↓
Idempotent Worker
5. Major Components Introduced

Phase 11.3 introduced the workflowOutbox subsystem.

services/
└── workflowOutbox/
    │
    ├── workflowOutboxContracts.js
    ├── workflowOutboxIdentity.js
    ├── workflowOutboxPersistenceService.js
    ├── workflowOutboxClaimService.js
    ├── workflowOutboxRetryPolicy.js
    ├── workflowOutboxRoutingRegistry.js
    ├── workflowOutboxDispatcher.js
    ├── workflowOutboxDeliveryCoordinator.js
    ├── workflowOutboxConsumerRegistry.js
    │
    ├── recoveryDecisionOutboxHandoffService.js
    ├── recoveryDecisionOutboxIntegration.js
    │
    ├── executionVerificationOutboxHandoffService.js
    ├── executionVerificationOutboxIntegration.js
    │
    ├── verificationLifecycleOutboxHandoffService.js
    ├── verificationLifecycleOutboxIntegration.js
    │
    └── lifecycleOutboxJobAdapter.js

And:

workers/
└── workflowOutboxWorker.js

Together these components form AIRA's durable workflow transport layer.

6. Workflow Outbox Contracts

workflowOutboxContracts.js defines the language of the subsystem.

It establishes concepts such as:

Event types
Statuses
Operations
Delivery states
Failure states

Conceptually an event progresses through:

PENDING
   ↓
PROCESSING
   ↓
DELIVERED

or:

PENDING
   ↓
PROCESSING
   ↓
FAILED
   ↓
retry
   ↓
PROCESSING

Eventually:

FAILED
   ↓
retry budget exhausted
   ↓
DEAD_LETTER

This provides explicit lifecycle semantics instead of implicit message state.

7. Deterministic Event Identity

One of the most important properties of the subsystem is deterministic identity.

A workflow event must represent a specific logical transition.

Conceptually:

Organization
     +
Environment
     +
Incident
     +
Workflow Stage
     +
Immutable operation identity
     ↓
Deterministic Outbox Identity

This helps prevent accidental creation of multiple logical events for the same transition.

8. Persistence Layer

The persistence service owns durable event creation.

Instead of:

Worker
   ↓
RabbitMQ

AIRA now uses:

Worker
   ↓
MongoDB Outbox
   ↓
RabbitMQ

This distinction is critical.

If RabbitMQ disappears temporarily:

MongoDB
   ↓
event still exists
   ↓
retry later

The workflow intent is therefore not lost with the transport connection.

9. Claiming Events

Multiple AIRA instances may run simultaneously.

For example:

AIRA Instance A
AIRA Instance B
AIRA Instance C

All three could discover the same pending event.

Phase 11.3 prevents concurrent publication using claims.

Outbox Event
     ↓
Publisher A attempts claim
     ↓
atomic claim succeeds
     ↓
Publisher A becomes owner

Other publishers see:

Publisher B
     ↓
attempt claim
     ↓
LEASE_ACTIVE
     ↓
DO NOT PUBLISH
10. Lease-Based Ownership

Claims are temporary.

A publisher receives:

ownerId
+
claimToken
+
leaseExpiresAt

Conceptually:

Event
  │
  ├── ownerId = publisher-A
  ├── claimToken = random fencing token
  └── leaseExpiresAt = T

This solves another distributed-systems problem.

Suppose Publisher A claims an event and crashes:

Publisher A
     ↓
CLAIM
     ↓
CRASH

Without lease expiry, the event could remain permanently locked.

With Phase 11.3:

Publisher A crashes
      ↓
lease eventually expires
      ↓
Publisher B attempts claim
      ↓
new owner
      ↓
new claimToken
      ↓
processing continues
11. Fencing Tokens

Lease expiry alone is insufficient.

Imagine:

A claims event
   ↓
A freezes
   ↓
lease expires
   ↓
B claims event
   ↓
A wakes up

Now both processes may believe they can modify the event.

The claim token prevents this.

Publisher A
owner=A
token=TOKEN-A


        ↓ lease expires


Publisher B
owner=B
token=TOKEN-B

If A wakes up and attempts:

heartbeat()
markDelivered()
markFailed()

using TOKEN-A, the operation is rejected.

Therefore:

old owner
    +
old fencing token
    ↓
NO AUTHORITY OVER CURRENT CLAIM

This prevents zombie publishers from corrupting outbox state.

12. Heartbeats

Long-running delivery operations can extend ownership through heartbeats.

Claim
  ↓
lease active
  ↓
heartbeat
  ↓
lease extended

Therefore a healthy publisher can maintain ownership.

But:

expired lease
     ↓
heartbeat attempted
     ↓
REJECT

A publisher cannot resurrect expired ownership.

It must participate in the claim process again.

13. Dispatcher

The dispatcher represents the publishing boundary.

Its responsibility is conceptually:

Outbox Event
      ↓
claim
      ↓
resolve route
      ↓
publish
      ↓
confirm delivery state

The dispatcher does not decide whether infrastructure execution is authorized.

That distinction is fundamental.

14. Routing Registry

The routing registry maps workflow stages to their transport destinations.

Conceptually:

Workflow Event
      ↓
Routing Registry
      ├── Execution
      ├── Verification
      └── Lifecycle

This keeps routing centralized instead of scattering queue/exchange knowledge throughout the system.

15. Delivery Coordinator

The delivery coordinator manages what happens around dispatcher failures.

dispatch()
   │
   ├── success
   │      ↓
   │   delivery complete
   │
   └── failure
          ↓
      classify error
        ↙     ↘
   retryable  permanent
      ↓          ↓
 markFailed   dead-letter

This separates transport delivery from retry policy.

16. Retry Policy

Temporary infrastructure failures should not destroy workflow state.

Examples include:

ECONNRESET
ETIMEDOUT
ECONNREFUSED
temporary queue failure
temporary database failure

For retryable failures:

failure
   ↓
calculate backoff
   ↓
nextAttemptAt
   ↓
FAILED
   ↓
wait
   ↓
claim again
   ↓
retry

This avoids uncontrolled immediate retry loops.

17. Retry Budget

Retries are bounded.

Attempt 1
   ↓ fail
Attempt 2
   ↓ fail
Attempt 3
   ↓ fail
...
maxAttempts
   ↓
DEAD_LETTER

This prevents poisoned events from consuming resources forever.

18. Dead-Letter State

Permanent failures or exhausted retries enter dead-letter state.

Examples:

invalid routing
malformed workflow event
non-retryable contract violation
retry budget exhausted

Flow:

Event
   ↓
cannot safely deliver
   ↓
DEAD_LETTER

The event remains visible for inspection instead of silently disappearing.

19. Recovery → Execution Handoff

The first protected durable boundary is:

Recovery Decision
       ↓
durable outbox
       ↓
Execution

The recovery decision stage does not need to synchronously invoke execution.

Instead it persists execution intent.

RecoveryDecision
       ↓
Execution Request
       ↓
Outbox Event
       ↓
Execution Consumer
       ↓
ExecutionWorker
20. Execution → Verification Handoff

After infrastructure execution:

ExecutionWorker
      ↓
Execution result persisted
      ↓
Verification outbox handoff
      ↓
RabbitMQ
      ↓
VerificationWorker

Therefore:

ACTION EXECUTED

does not automatically mean:

INCIDENT RECOVERED

Verification remains a separate protected stage.

21. Verification → Lifecycle Handoff

Verification produces evidence about whether recovery succeeded.

Verification
      ↓
verification outcome
      ↓
durable lifecycle handoff
      ↓
LifecycleWorker

The lifecycle stage can then make the appropriate state transition.

Conceptually:

Execution
    ↓
Verification
    ├── RECOVERED
    ├── FAILED
    ├── DEGRADED
    └── other protected outcome
          ↓
Lifecycle processing
22. Consumer Registry

The consumer registry forms the boundary between RabbitMQ transport and protected workers.

RabbitMQ
    ↓
Consumer Registry
    ↓
validate event
    ↓
validate authority firewall
    ↓
select worker
    ↓
worker.process()

It routes messages to:

ExecutionWorker
VerificationWorker
LifecycleWorker

without making the business decision itself.

23. The Authority Firewall

This is one of Phase 11.3's most important safety properties.

A transport message must never grant execution authority.

Invalid:

RabbitMQ message:


{
  executionAuthorized: true
}

If transport could grant authority, anyone able to inject a queue message might potentially bypass AIRA's authorization boundary.

Therefore:

Transport
   ↓
can carry identity
can carry immutable plans
can carry workflow state
can carry correlation data


BUT


Transport
   ↓
CANNOT GRANT AUTHORITY

The invariant is:

executionAuthorized !== true

across workflow transport.

24. Authorization vs Ownership

These concepts must never be confused.

Outbox ownership

Answers:

Which publisher currently owns this event?

Represented by:

ownerId
claimToken
leaseExpiresAt
Execution authorization

Answers:

Is this infrastructure action permitted?

These are completely separate security domains.

OUTBOX CLAIM
      ≠
EXECUTION AUTHORIZATION

Therefore:

Publisher owns event
        ↓
does NOT imply
        ↓
Publisher may authorize execution
25. Worker Idempotency

RabbitMQ and durable outbox processing are intentionally compatible with at-least-once delivery.

Therefore this is possible:

publish
   ↓
consumer receives
   ↓
operation succeeds
   ↓
ack/delivery state interrupted
   ↓
message appears again

Instead of pretending duplicates cannot happen, AIRA handles them safely.

Duplicate message
      ↓
Worker idempotency
      ↓
same immutable identity
      ↓
DUPLICATE_COMPLETED
      ↓
no second protected effect

This gives AIRA the practical combination:

At-least-once transport
        +
Idempotent business operations
        ↓
One logical protected effect
26. Crash Window Protection

Phase 11.3 explicitly tested the dangerous window:

publish RabbitMQ
      ↓
RabbitMQ accepts
      ↓
PROCESS CRASH
      ↓
markDelivered never occurs

After restart the outbox may publish the event again.

That is acceptable.

event delivered twice
       ↓
consumer idempotency
       ↓
protected effect once

The system therefore favors recoverability over assuming perfect exactly-once transport.

27. Broker Outage Protection

Another tested scenario:

Outbox event exists
      ↓
RabbitMQ unavailable
      ↓
publish fails
      ↓
retryable failure
      ↓
nextAttemptAt
      ↓
RabbitMQ recovers
      ↓
retry
      ↓
delivery succeeds

The important property is:

RabbitMQ outage
     ≠
workflow loss

because workflow intent exists durably outside RabbitMQ.

28. Process Restart Recovery

Phase 11.3 also proves that workflow continuity does not depend on one Node.js process remaining alive.

Example:

Execution complete
      ↓
Verification event persisted
      ↓
SERVER DIES

New process:

server starts
     ↓
outbox runtime starts
     ↓
consumer registry starts
     ↓
pending workflow resumes
     ↓
Verification

The same applies between verification and lifecycle.

29. Full Restart-Resilient Chain

The final tested chain is:

Recovery
   ↓
Execution Outbox
   ↓
Execution
   ↓
        PROCESS RESTART
   ↓
Verification Outbox
   ↓
Verification
   ↓
        PROCESS RESTART
   ↓
Lifecycle Outbox
   ↓
Lifecycle

The workflow continues because stage boundaries are durable.

30. Failure Model

Phase 11.3 was designed under the assumption that failures are normal.

AIRA now explicitly handles:

┌─────────────────────────────────┐
│ Process crashes                 │
├─────────────────────────────────┤
│ RabbitMQ outages                │
├─────────────────────────────────┤
│ Duplicate broker messages       │
├─────────────────────────────────┤
│ Database timing failures        │
├─────────────────────────────────┤
│ Stale publishers                │
├─────────────────────────────────┤
│ Expired leases                  │
├─────────────────────────────────┤
│ Retry exhaustion                │
├─────────────────────────────────┤
│ Malformed transport events      │
├─────────────────────────────────┤
│ Unauthorized authority fields   │
└─────────────────────────────────┘
31. Failure Recovery Matrix
Failure	AIRA response
RabbitMQ unavailable	Retry
Publisher crashes	Lease expires
Second publisher appears	Active lease blocks it
Lease owner disappears	Another publisher takes over
Old publisher wakes up	Fencing token rejects it
Message delivered twice	Worker idempotency absorbs duplicate
Temporary transport error	Backoff + retry
Permanent transport error	Dead-letter
Retry budget exhausted	Dead-letter
Server restarts	Durable workflow resumes
Message tries to grant authority	Reject
Invalid routing	Reject / dead-letter
32. Phase 11.3 Safety Invariants

Phase 11.3 is frozen around the following invariants.

I1 — Outbox ownership is not execution authorization
claim(event)
    ≠
authorize(action)
I2 — Workflow transitions use deterministic identity
same logical transition
        ↓
same logical identity
I3 — Durable events support idempotent processing

Duplicates must not create duplicate protected effects.

I4 — Publishers are lease-fenced

Only the current lease owner may mutate active delivery state.

I5 — Stale publishers cannot commit

Old ownership tokens become invalid after takeover.

I6 — Duplicate broker delivery is safe

At-least-once transport is expected.

I7 — Broker outage does not lose workflow intent

MongoDB remains the durable source of workflow delivery intent.

I8 — Process restart does not lose workflow state

New runtime instances can resume pending work.

I9 — Permanent failures dead-letter

They are not retried forever.

I10 — Retryable failures retain retry state

Temporary failure does not equal workflow termination.

I11 — Transport never executes infrastructure
Outbox
RabbitMQ
Dispatcher
Consumer Registry

are orchestration/transport components.

They are not infrastructure executors.

I12 — Protected workers remain execution boundaries
Transport
    ↓
Protected Worker
    ↓
authorization / policy / identity checks
    ↓
protected operation
I13 — Authority never propagates as transport truth
executionAuthorized: true

must not be trusted or generated by the workflow transport subsystem.

I14 — Workflow is durably resumable
Recovery
   ↓
Execution
   ↓
Verification
   ↓
Lifecycle

must survive transport and process failures.

33. What Phase 11.3 Does NOT Do

The outbox does not:

diagnose incidents
choose recovery actions
approve actions
execute runbooks
decide policies
determine recovery success
grant execution authority

Instead:

Phase 11.3 responsibility
        =
reliable movement of protected workflow intent
between already-defined trust boundaries

This separation is deliberate.

34. Why RabbitMQ Alone Is Not Enough

Without the outbox:

DB write
   ↓
RabbitMQ publish

creates a dual-write problem.

Possible outcome:

DB succeeds
RabbitMQ fails

Now state and messaging disagree.

The durable outbox changes the model:

Business state
     +
Outbox intent
     ↓
durable persistence boundary


THEN


asynchronous delivery

This makes failures recoverable.

35. Why "Exactly Once" Was Not Assumed

AIRA does not depend on magical exactly-once distributed delivery.

Instead:

At-least-once delivery
        +
Deterministic identity
        +
Idempotent workers
        +
Claim fencing
        ↓
Safe logical processing

This is much more realistic for a distributed recovery system.

36. Complete Phase 11.3 Flow
┌──────────────────────────────┐
│ Protected Stage Completes    │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Create Durable Outbox Event  │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Persistence Service          │
└──────────────┬───────────────┘
               ↓
        Event = PENDING
               ↓
┌──────────────────────────────┐
│ Workflow Outbox Worker       │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Claim Service                │
│ owner + token + lease        │
└──────────────┬───────────────┘
               ↓
       Event = PROCESSING
               ↓
┌──────────────────────────────┐
│ Dispatcher                   │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Routing Registry             │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ RabbitMQ                     │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Consumer Registry            │
└──────────────┬───────────────┘
               ↓
      Authority Firewall
               ↓
┌──────────────────────────────┐
│ Protected Worker             │
└──────────────┬───────────────┘
               ↓
       Worker Idempotency
               ↓
       Protected Operation
               ↓
     Next Durable Handoff
37. Failure Branch

The delivery path has an explicit failure branch:

Dispatcher
    ↓
 publish
    ↓
 FAILURE
    ↓
Delivery Coordinator
    ↓
classify
  ↙       ↘
temporary permanent
   ↓         ↓
retry      DEAD_LETTER
   ↓
FAILED
   ↓
nextAttemptAt
   ↓
claim later
   ↓
retry publish
38. Takeover Flow
Publisher A
    ↓
CLAIM
    ↓
TOKEN-A
    ↓
PROCESSING
    ↓
A crashes
    ↓
lease expires
    ↓
Publisher B
    ↓
CLAIM
    ↓
TOKEN-B
    ↓
B becomes owner

If A returns:

A + TOKEN-A
     ↓
heartbeat     ❌
markFailed    ❌
markDelivered ❌

while:

B + TOKEN-B
     ↓
valid owner
     ↓
continue delivery
39. Duplicate Delivery Flow
Outbox
   ↓
RabbitMQ
   ↓
Worker
   ↓
operation succeeds
   ↓
delivery acknowledgement interrupted
   ↓
same event arrives again
   ↓
Worker idempotency
   ↓
DUPLICATE_COMPLETED
   ↓
NO duplicate infrastructure operation
40. Security Boundary

Phase 11.3 establishes a particularly important trust hierarchy:

          POLICY / AUTHORIZATION
                  │
                  ▼
          Protected Workers
                  │
                  ▼
         Infrastructure Action


-----------------------------------------
           TRUST BOUNDARY
-----------------------------------------


          Workflow Transport
                  │
       ┌──────────┼──────────┐
       ↓          ↓          ↓
     Outbox    RabbitMQ   Consumers

Transport moves information.

It does not create authority.

41. Tests Added During Phase 11.3

The subsystem contains extensive component tests plus dedicated durability certification tests.

The final failure-oriented block includes:

workflowOutboxCrashRecovery.test.js


workflowOutboxDuplicateDelivery.test.js


workflowOutboxLeaseRecovery.test.js


workflowOutboxBrokerRecovery.test.js


workflowOutboxRestartContinuity.test.js

Together they test the failure model rather than only the happy path.

42. Durability Certification

The final Phase 11.3 certification established:

Persist before publish                  PASS
Crash-window recovery                   PASS
Duplicate broker delivery               PASS
Lease exclusivity                       PASS
Lease expiration                        PASS
Publisher takeover                      PASS
Zombie publisher fencing                PASS
Heartbeat lease extension               PASS
Broker outage recovery                  PASS
Retry scheduling                        PASS
Retry budget enforcement                PASS
Dead-letter behavior                    PASS
Immutable identity preservation         PASS
Process restart recovery                PASS
Duplicate-after-restart safety          PASS
Authority injection rejection           PASS
Full workflow continuity                PASS
43. Before Phase 11.3

Conceptually:

Stage A
   ↓
send something
   ↓
Stage B

The reliability of the workflow depended too heavily on the runtime surviving the transition.

44. After Phase 11.3

Now:

Stage A
   ↓
DURABLE INTENT
   ↓
recoverable publisher
   ↓
durable broker
   ↓
validated consumer
   ↓
idempotent Stage B

This is a much stronger architecture.

45. How Phase 11.3 Strengthens AIRA

Phase 11.3 changes AIRA from merely having protected workers into having a durable protected workflow.

Before:

Safe Worker A
      ↓
unreliable boundary
      ↓
Safe Worker B

After:

Safe Worker A
      ↓
Durable Handoff
      ↓
Leased Publisher
      ↓
RabbitMQ
      ↓
Authority Firewall
      ↓
Idempotent Safe Worker B

This means AIRA can tolerate infrastructure failures occurring inside AIRA itself.

That distinction matters.

A recovery platform cannot only recover other systems.

It must also tolerate failures in its own orchestration plane.

46. Combined Reliability Model

AIRA now combines several layers:

                 AIRA RELIABILITY
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
   Safety          Durability       Idempotency
       │               │                │
       ▼               ▼                ▼
   Policies          Outbox        Identity keys
 Authorization       MongoDB       Duplicate guard
 Immutable plan      RabbitMQ      Replay safety
       │               │                │
       └───────────────┼────────────────┘
                       ▼
               Reliable Recovery

And Phase 11.3 adds another layer:

               Distributed Failure Safety
                         │
             ┌───────────┼───────────┐
             ↓           ↓           ↓
           Lease       Fencing      Retry
             ↓           ↓           ↓
          takeover     zombie      temporary
           safety     rejection     recovery
47. Architectural Rule Going Forward

Future AIRA development must not bypass the durable stage boundaries.

Do not introduce:

ExecutionWorker
      ↓
verificationWorker.process()

as an ordinary direct workflow transition.

Prefer:

ExecutionWorker
      ↓
persist verification handoff
      ↓
Workflow Outbox
      ↓
Verification Consumer
      ↓
VerificationWorker

Likewise:

VerificationWorker
      ↓
Durable Lifecycle Handoff
      ↓
LifecycleWorker

The outbox is now an architectural boundary, not a temporary implementation detail.

48. Phase 11.3 Freeze Rules

After completion, modifications to this subsystem should preserve:

1. Deterministic event identity


2. Persist-before-publish semantics


3. Lease-based publisher ownership


4. Fencing tokens


5. Bounded retries


6. Dead-letter handling


7. At-least-once delivery assumptions


8. Worker idempotency


9. Authority firewall


10. Immutable execution identity


11. Durable stage transitions


12. Restart recovery


13. No direct infrastructure execution from transport


14. No transport-created authorization

Any future change violating one of these requires explicit architectural review.

49. Phase 11.3 Final Architecture
                         AIRA
                          │
                          ▼
                 Recovery Decision
                          │
                          ▼
              ┌─────────────────────┐
              │ Durable Outbox      │
              │ EXECUTION           │
              └──────────┬──────────┘
                         ↓
                  Claim + Lease
                         ↓
                 Fencing Token
                         ↓
                    Dispatcher
                         ↓
                     RabbitMQ
                         ↓
                Consumer Registry
                         ↓
                Authority Firewall
                         ↓
                 ExecutionWorker
                         │
                         ▼
              ┌─────────────────────┐
              │ Durable Outbox      │
              │ VERIFICATION        │
              └──────────┬──────────┘
                         ↓
                    Dispatcher
                         ↓
                     RabbitMQ
                         ↓
                Consumer Registry
                         ↓
               VerificationWorker
                         │
                         ▼
              ┌─────────────────────┐
              │ Durable Outbox      │
              │ LIFECYCLE           │
              └──────────┬──────────┘
                         ↓
                    Dispatcher
                         ↓
                     RabbitMQ
                         ↓
                Consumer Registry
                         ↓
                  LifecycleWorker
                         ↓
                 Incident State
50. Phase 11.3 Completion
PHASE 11.3
DURABLE WORKFLOW OUTBOX
================================


Contracts                    ✅
Deterministic Identity       ✅
Persistence                  ✅
Claims                       ✅
Leases                       ✅
Fencing Tokens               ✅
Heartbeats                   ✅
Dispatcher                   ✅
Routing Registry             ✅
Delivery Coordinator         ✅
Retry Policy                 ✅
Retry Budget                 ✅
Dead Letter                  ✅
Outbox Worker                ✅
Recovery → Execution         ✅
Execution → Verification     ✅
Verification → Lifecycle     ✅
Consumer Registry            ✅
RabbitMQ Integration         ✅
Production Startup Wiring    ✅
Crash Recovery               ✅
Duplicate Delivery Safety    ✅
Publisher Takeover           ✅
Broker Recovery              ✅
Restart Continuity           ✅
Authority Firewall           ✅
Final Regression             ✅


STATUS:


        PHASE 11.3 COMPLETE 🔒
Final Mental Model

The easiest way to remember Phase 11.3 is:

DECIDE
  ↓
PERSIST
  ↓
CLAIM
  ↓
PUBLISH
  ↓
CONSUME
  ↓
VALIDATE
  ↓
PROCESS IDEMPOTENTLY
  ↓
PERSIST NEXT HANDOFF
  ↓
REPEAT

And under failure:

                    FAILURE
                       │
       ┌───────────────┼────────────────┐
       ↓               ↓                ↓
   PROCESS DIES    BROKER DIES     PUBLISHER DIES
       ↓               ↓                ↓
   restart          retry           lease expires
       ↓               ↓                ↓
   resume          recover          takeover
       │               │                │
       └───────────────┼────────────────┘
                       ↓
                WORKFLOW CONTINUES

And the security rule remains:

TRANSPORT
   │
   ├── carries identity
   ├── carries workflow data
   ├── carries immutable references
   └── carries correlation


BUT


TRANSPORT
   ✕
DOES NOT GRANT AUTHORITY

That is the architectural contribution of Phase 11.3.