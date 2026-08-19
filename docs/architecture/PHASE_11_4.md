# Phase 11.4 — Workflow Replay Orchestration

## Status

**COMPLETE — FROZEN**

Phase 11.4 provides deterministic and durable workflow recovery after
process crashes, worker failures, broker interruptions, partial workflow
completion, and ambiguous execution outcomes.

It builds on:

- Phase 11.1 — Idempotency
- Phase 11.2 — Durable Runtime Checkpoints
- Phase 11.3 — Durable Workflow Outbox

Phase 11.4 does not create a second execution system.

Its responsibility is to determine:

> Given the durable evidence available after a failure, what is the
> safest next workflow action?

---

# 1. Problem

AIRA workflows cross multiple asynchronous stages:

Recovery Decision
        ↓
Execution
        ↓
Verification
        ↓
Lifecycle

A process may crash between any two durable operations.

Examples:

- decision persisted but execution handoff interrupted
- execution completed but verification not started
- verification completed but lifecycle not started
- worker died while holding a replay lease
- broker temporarily unavailable
- execution started but completion cannot be proven
- manual intervention required before recovery

Blindly restarting the workflow is unsafe.

In particular, repeating an infrastructure execution whose outcome is
unknown could produce duplicate external side effects.

Phase 11.4 therefore reconstructs workflow state from durable evidence
and chooses a safe recovery action.

---

# 2. Architecture

                    FAILURE / RESTART
                           │
                           ▼
                 Durable Workflow State
                           │
                           ▼
                   Replay Persistence
                           │
                           ▼
                 Recovery Snapshot Builder
                           │
                           ▼
                Workflow Recovery Planner
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
           RESUME      RECONCILE       MANUAL
             │             │             │
             │       ┌─────┴─────┐       │
             │       │           │       │
             │      SAFE      UNCERTAIN  │
             │       │           │       │
             │       ▼           └───────┤
             │     RESUME                 │
             │                            ▼
             │                       HUMAN REVIEW
             ▼
       Job Reconstruction
             │
             ▼
      Recovery Orchestrator
             │
             ▼
      Durable Replay Service
             │
             ▼
        Phase 11.3 Outbox
             │
             ▼
          RabbitMQ
             │
             ▼
      Protected AIRA Worker
             │
        ┌────┴────┐
        ▼         ▼
      11.1       11.2
   Idempotency  Checkpoint
        │         │
        └────┬────┘
             ▼
        Safe Processing

---

# 3. Core Principle

Recovery is not execution authority.

Phase 11.4 may:

- inspect durable workflow evidence
- construct recovery snapshots
- determine safe resume stages
- reconstruct canonical jobs
- create durable handoffs
- request reconciliation
- require manual review

Phase 11.4 must never independently authorize infrastructure mutation.

All recovered jobs retain:

executionAuthorized = false

Execution authority remains owned by the normal protected execution
boundary.

---

# 4. Recovery Decisions

The planner can produce recovery outcomes such as:

## RESUME

Durable evidence proves that continuing from a specific stage is safe.

Examples:

Decision completed
Execution not started
→ resume execution

Execution completed
Verification not started
→ resume verification

Verification completed
Lifecycle not started
→ resume lifecycle

---

## NO_ACTION

The workflow is already durably complete.

No replay is created.

---

## RECONCILE

The execution outcome cannot safely be inferred from durable state.

Example:

execution started
        ↓
external infrastructure may have changed
        ↓
process crashed before durable completion
        ↓
execution result UNKNOWN

AIRA must not blindly execute again.

Instead:

UNKNOWN
   ↓
RECONCILIATION
   ↓
┌───────────────┬────────────────┐
│               │                │
SAFE          UNSAFE          UNKNOWN
│               │                │
RESUME      MANUAL REVIEW    MANUAL REVIEW

---

## MANUAL_REVIEW

Automatic recovery cannot establish sufficient safety.

The replay remains durable but blocked until an authorized human
explicitly approves continuation.

---

# 5. Durable Replay Identity

Every logical replay has persistent identity.

Important fields include:

- replayId
- replayKey
- organizationId
- environmentId
- incidentId
- correlationId
- source
- mode
- requested stage
- replay status
- ownership / lease
- failure information
- history / audit information

Replay identity remains stable across:

- process restart
- retry
- manual approval
- reconciliation
- lease recovery

Changing operational context must not manufacture a second logical
replay record.

The persisted replayId and replayKey therefore remain authoritative.

---

# 6. Replay Lease

Replay processing uses durable ownership.

A worker claims a replay with:

- worker identity
- claim token
- claim timestamp
- lease expiration

If the process disappears:

RUNNING
   ↓
lease expires
   ↓
startup recovery detects stale ownership
   ↓
ownership released atomically
   ↓
replay becomes retryable
   ↓
same logical replay resumes

An active lease cannot be stolen by another worker.

---

# 7. Startup Recovery

After AIRA restarts:

MongoDB
   ↓
RabbitMQ
   ↓
Idempotency
   ↓
Workflow Outbox Consumers
   ↓
Workflow Outbox Runtime
   ↓
Phase 11.4 Startup Recovery
   ↓
Remaining Background Services
   ↓
HTTP Server

Startup recovery searches only for automatically recoverable replay
states.

Examples:

FAILED + retryable
RUNNING + expired lease

It does not automatically process:

- WAITING_MANUAL_REVIEW
- WAITING_RECONCILIATION
- BLOCKED
- COMPLETED

Those states represent deliberate recovery barriers.

---

# 8. Manual Recovery

A replay waiting for manual review cannot continue without an explicit
actor.

WAITING_MANUAL_REVIEW
        ↓
authorized human approval
        ↓
REQUESTED
        ↓
same replay identity
        ↓
DurableReplayService

Manual approval does not grant execution authority.

---

# 9. Reconciliation

Reconciliation handles ambiguous infrastructure outcomes.

WAITING_RECONCILIATION
        ↓
external state inspected
        ↓
┌───────────────────────┐
│ safe === true         │
└───────────┬───────────┘
            ↓
         REQUESTED
            ↓
          RESUME

If safety cannot be proven:

WAITING_RECONCILIATION
        ↓
unsafe / unknown
        ↓
WAITING_MANUAL_REVIEW

This is intentionally fail-closed.

---

# 10. Durable Handoff

Replay orchestration never directly invokes protected workers.

Incorrect:

Replay
  ↓
executionWorker.process()

Correct:

Replay
  ↓
Recovery Orchestrator
  ↓
Phase 11.3 Handoff Service
  ↓
Workflow Outbox
  ↓
Publisher
  ↓
RabbitMQ
  ↓
Protected Worker

Existing handoff boundaries are reused:

Recovery Decision
→ createExecutionRequestReady()

Execution
→ createVerificationRequested()

Verification
→ createLifecycleRequested()

This preserves the guarantees introduced in Phase 11.3.

---

# 11. Failure Matrix

| Failure | Recovery |
|---|---|
| Crash before execution | Resume execution when proven safe |
| Crash after execution | Resume verification |
| Crash after verification | Resume lifecycle |
| Crash after lifecycle | No action |
| Ambiguous execution outcome | Reconcile |
| Reconciliation uncertain | Manual review |
| Replay worker dies | Lease expiration + reclaim |
| Broker unavailable | Durable outbox retains transition |
| Duplicate delivery | Idempotency/checkpoint absorbs duplicate |
| Manual checkpoint | Wait for explicit approval |
| Invalid immutable identity | Fail closed |
| Replay authority injection | Reject |
| Process restart | Recover same replay identity |

---

# 12. Defense in Depth

Phase 11 recovery now has four major layers.

## Phase 11.1 — Idempotency

Prevents the same logical protected operation from being performed
multiple times.

## Phase 11.2 — Runtime Checkpoints

Records durable processing progress and protects worker-level resume.

## Phase 11.3 — Workflow Outbox

Ensures workflow stage transitions survive process and broker failures.

## Phase 11.4 — Replay Orchestration

Determines what workflow work can safely be reconstructed after failure.

Together:

Replay Identity
      ↓
Outbox Identity
      ↓
Checkpoint Identity
      ↓
Worker Idempotency
      ↓
Protected Execution Boundary

No single replay mechanism is relied upon for duplicate-effect
prevention.

---

# 13. Observability

Detailed health reporting exposes replay recovery state including:

- initialized
- startupRecoveryCompleted
- discovered
- recovered
- failed
- lastRunAt
- lastError

Replay recovery is therefore independently observable from normal
workflow-outbox runtime health.

---

# 14. Safety Invariants

Phase 11.4 must maintain all of the following:

1. Replay never grants execution authority.
2. Ambiguous execution is never blindly repeated.
3. Replay identity remains immutable.
4. Active replay leases cannot be stolen.
5. Expired leases can be safely reclaimed.
6. Manual states require explicit human action.
7. Reconciliation must explicitly prove safety.
8. Recovery never bypasses the durable outbox.
9. Duplicate delivery must remain safe.
10. Missing or contradictory durable evidence fails closed.
11. One poisoned replay cannot stop recovery of unrelated workflows.
12. Startup recovery must not run before durable infrastructure is ready.

---

# 15. Phase Completion

Phase 11.4.1 — Contracts
COMPLETE

Phase 11.4.2 — Snapshot + Recovery Planner
COMPLETE

Phase 11.4.3 — Reconstruction + Orchestrator
COMPLETE

Phase 11.4.4 — Durable Replay + Lease + Audit
COMPLETE

Phase 11.4.5 — Runtime / Manual / Reconciliation
COMPLETE

Phase 11.4.6 — Production Wiring
COMPLETE

Phase 11.4.7 — Regression / Certification
COMPLETE

PHASE 11.4 STATUS:

COMPLETE — FROZEN