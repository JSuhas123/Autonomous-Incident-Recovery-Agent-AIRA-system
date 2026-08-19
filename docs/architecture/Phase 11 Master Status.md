# Phase 11 — Durable Workflow Reliability

## Status

**100% COMPLETE — FROZEN**

Phase 11 transforms AIRA's recovery workflow from ordinary asynchronous
processing into a durable, restart-safe, duplicate-resistant workflow
runtime.

---

## Phase 11.1 — Idempotency

**COMPLETE**

Guarantee:

> The same logical protected operation must not create duplicate effects.

Provides:

- deterministic operation identity
- durable idempotency records
- ownership/claim semantics
- duplicate detection
- retry-safe operation processing

---

## Phase 11.2 — Durable Runtime Checkpoints

**COMPLETE**

Guarantee:

> AIRA must know how far protected worker processing progressed before a
> failure.

Provides:

- durable runtime checkpoints
- checkpoint ownership
- lease semantics
- stale-operation recovery
- deterministic resume
- duplicate checkpoint protection
- execution ambiguity protection

---

## Phase 11.3 — Durable Workflow Outbox

**COMPLETE**

Guarantee:

> A committed workflow transition must not disappear because a process
> or broker fails.

Provides:

- durable workflow outbox
- deterministic event identity
- atomic claiming
- publisher leases
- routing registry
- retry policy
- dead-letter handling
- broker recovery
- duplicate-delivery protection
- consumer registry
- runtime publisher coordination

---

## Phase 11.4 — Workflow Replay Orchestration

**COMPLETE**

Guarantee:

> After failure, AIRA must determine the safest workflow continuation
> from durable evidence rather than blindly restarting work.

Provides:

- recovery snapshots
- recovery planning
- deterministic reconstruction
- durable replay records
- replay identity
- replay ownership and leases
- startup recovery
- manual review
- reconciliation
- durable replay handoff
- replay audit history
- execution-authority isolation

---

# Combined Reliability Model

                    AIRA WORKFLOW
                         │
                         ▼
                Recovery Decision
                         │
                         ▼
                   Execution
                         │
                         ▼
                 Verification
                         │
                         ▼
                   Lifecycle

Every transition is protected by:

               PHASE 11.4
          Replay Orchestration
                  │
                  ▼
               PHASE 11.3
            Durable Outbox
                  │
                  ▼
               PHASE 11.2
         Runtime Checkpoints
                  │
                  ▼
               PHASE 11.1
             Idempotency
                  │
                  ▼
        Protected Side Effect

---

# Phase 11 Guarantees

After Phase 11, AIRA provides the following guarantees:

### Duplicate resistance

Retries, redelivery and restart do not automatically produce duplicate
logical effects.

### Durable workflow transitions

A workflow transition is persisted before depending on asynchronous
delivery.

### Restart recovery

Process failure does not require restarting an incident workflow from
the beginning.

### Safe partial recovery

AIRA resumes from the earliest stage that durable evidence proves safe.

### Execution ambiguity protection

Unknown infrastructure outcomes trigger reconciliation rather than
blind execution.

### Human safety boundary

Cases that cannot be proven safe automatically are escalated to manual
review.

### Horizontal worker safety

Ownership and leases prevent multiple workers from independently
processing the same durable work.

### Broker failure tolerance

Temporary broker failure does not destroy committed workflow intent.

### Auditability

Recovery decisions, replay ownership, failure and state transitions
remain durably inspectable.

### Execution authority isolation

Recovery, replay and transport layers cannot independently grant
infrastructure execution authority.

---

# Final Phase 11 State

| Phase | Capability | Status |
|---|---|---|
| 11.1 | Idempotency | COMPLETE |
| 11.2 | Durable Runtime Checkpoints | COMPLETE |
| 11.3 | Durable Workflow Outbox | COMPLETE |
| 11.4 | Workflow Replay Orchestration | COMPLETE |

**PHASE 11: 100% COMPLETE**

**STATUS: FROZEN**