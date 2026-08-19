# AIRA Engineering Evolution

> **How AIRA evolved from a playbook-driven recovery engine into a policy-controlled, AI-assisted, crash-safe incident recovery platform.**

---

# 1. Purpose of This Document

AIRA was not designed as:

```text
Alert
  ↓
LLM
  ↓
Shell Command
```

That architecture would give a probabilistic reasoning system too much authority over production infrastructure.

AIRA instead evolved toward:

```text
Signals
   ↓
Incident Understanding
   ↓
AI Investigation
   ↓
Diagnosis
   ↓
Recovery Decision
   ↓
Policy
   ↓
Authorization
   ↓
Deterministic Execution
   ↓
Verification
   ↓
Lifecycle
   ↓
Distributed Safety
   ↓
Crash Recovery
```

Each engineering phase added one capability while exposing the next reliability problem.

That progression is the core of AIRA's architecture.

---

# 2. AIRA's Evolution at a Glance

```text
┌──────────────────────────────┐
│        FOUNDATION            │
│                              │
│ Playbooks + Runbooks         │
│ Catalogues + Schemas         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│     EXECUTION FOUNDATION     │
│                              │
│ Deterministic action engine  │
│ Approval + policy controls   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       INCIDENT LAYER         │
│                              │
│ Signals → incidents          │
│ Incident-aware recovery      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      INTELLIGENCE LAYER      │
│                              │
│ Agents                       │
│ Investigation                │
│ Diagnosis                    │
│ Recovery reasoning           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│    RECOVERY DECISION LAYER   │
│                              │
│ Applicability                │
│ Risk                         │
│ Policy                       │
│ Ranking                      │
│ Critic                       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   AUTHORIZED EXECUTION       │
│                              │
│ Immutable plan               │
│ Authorization                │
│ Deterministic mutation       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       VERIFICATION           │
│                              │
│ Health                       │
│ Metrics                      │
│ Logs                         │
│ State                        │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│         LIFECYCLE            │
│                              │
│ Stability                    │
│ Closure                      │
│ Retry                        │
│ Rollback                     │
│ Escalation                   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│        IDEMPOTENCY           │
│                              │
│ Duplicate protection         │
│ Ownership                    │
│ Leases                       │
│ Claim tokens                 │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      RUNTIME RECOVERY        │
│                              │
│ Checkpoints                  │
│ Heartbeats                   │
│ Stale detection              │
│ Safe resume                  │
└──────────────┬───────────────┘
               │
               ▼
       PRODUCTION-GRADE
       RECOVERY CONTROL
```

---

# 3. The Fundamental AIRA Principle

Every phase follows one architectural rule:

```text
AI
 │
 ▼
UNDERSTAND
 │
 ▼
RECOMMEND
 │
 ▼
STRUCTURED DECISION
 │
 ▼
════════════════════════════
       TRUST BOUNDARY
════════════════════════════
 │
 ▼
POLICY
 │
 ▼
AUTHORIZATION
 │
 ▼
DETERMINISTIC EXECUTION
 │
 ▼
INFRASTRUCTURE
```

AIRA deliberately separates:

```text
"What should probably be done?"

             from

"Is this permitted to happen?"

             from

"What exact operation is executed?"
```

---

# PART I — PLAYBOOK / RUNBOOK FOUNDATION

# 4. Original V1 Phase Sequence

The first major AIRA engineering sequence established the deterministic Playbook + Runbook platform.

Its purpose was simple:

```text
Before giving AI more intelligence,
first build a safe deterministic system
that AI can eventually recommend actions to.
```

---

# Phase 1 — Playbook Catalogue Foundation

## Problem

AIRA cannot safely recover infrastructure if recovery knowledge exists only inside prompts or arbitrary generated commands.

```text
Incident
   ↓
AI invents solution
   ↓
AI invents command
   ↓
Infrastructure
```

This is unsafe.

## What Was Built

A structured playbook catalogue was introduced.

The platform established:

```text
21 Playbooks
     ↓
18 Canonical Incident Families
```

covering areas such as:

```text
Kubernetes
    │
    ├── CrashLoopBackOff
    ├── OOMKilled
    ├── Node NotReady
    ├── ImagePullBackOff
    ├── PVC
    └── HPA

Databases
    │
    ├── Connection Pool
    ├── Replication Lag
    ├── Disk Full
    └── Slow Queries

APIs
    │
    ├── High Latency
    ├── Error Rate
    └── Rate Limit

Queues
Resources
Security
Networking
```

## Architecture

```text
Incident Type
     │
     ▼
Playbook Catalogue
     │
     ├── applicability
     ├── risk
     ├── approval mode
     ├── recovery strategy
     └── runbook reference
```

## What This Added to AIRA

Before:

```text
Recovery knowledge
      ↓
unstructured
```

After:

```text
Recovery knowledge
      ↓
versioned
      ↓
structured
      ↓
reviewable
      ↓
policy-compatible
```

---

# Phase 2 — Activation Readiness

Having a playbook definition does not mean it is safe to execute.

AIRA therefore needed to answer:

```text
"Does this recovery definition have everything
required before activation?"
```

The activation-readiness layer validates operational readiness.

```text
Playbook
   ↓
Schema valid?
   ↓
Runbook available?
   ↓
Handlers available?
   ↓
Policy defined?
   ↓
Approval requirements known?
   ↓
Verification defined?
   ↓
READY / NOT READY
```

## Why It Strengthened AIRA

It prevented:

```text
definition exists
      ↓
therefore execute
```

from becoming the execution rule.

Instead:

```text
definition exists
      ↓
validate readiness
      ↓
only then consider activation
```

---

# Phase 3 — CrashLoopBackOff Golden Path

A concrete end-to-end recovery path was then established around Kubernetes `CrashLoopBackOff`.

```text
CrashLoopBackOff
       │
       ▼
PB-K8S-CRASHLOOP-001
       │
       ▼
RB-K8S-POD-RESTART
       │
       ▼
Kubernetes handlers
       │
       ▼
Verification
```

The runbook lifecycle deliberately remained controlled:

```text
DRAFT
  ↓
VALIDATED
  ↓
APPROVED
  ↓
ACTIVE
```

A runbook being present in source code did **not** automatically make it executable.

---

# Phase 4 — Golden-Path Safety Testing

The next problem was proving that the path failed safely.

Tests were added around the golden recovery path.

The goal became:

```text
Happy path works
      +
Unsafe paths fail closed
```

Examples:

```text
Missing evidence
      ↓
BLOCK

Invalid parameters
      ↓
BLOCK

Policy denial
      ↓
BLOCK

Missing approval
      ↓
BLOCK

Unavailable handler
      ↓
BLOCK

Unsafe execution
      ↓
BLOCK
```

This moved AIRA from:

```text
"we think the engine is safe"
```

toward:

```text
"the safety assumptions are executable tests"
```

---

# Phase 5 — Incident-Aware Playbook Service

Playbooks were connected to actual incidents.

```text
Incident
   │
   ▼
incidentPlaybookService
   │
   ├── analyseIncident()
   │
   ▼
playbookMatcher
   │
   ▼
Candidate Matches
```

And when execution is requested:

```text
Incident
   ↓
Matched Playbook
   ↓
Execution Eligibility
   ↓
Playbook Execution Engine
```

AIRA was no longer only a catalogue.

It could now reason:

```text
"This incident matches these recovery strategies."
```

---

# Phase 6 — Operational UI

Backend capability alone is insufficient for an operator-facing recovery system.

The UI connected operators to:

```text
Incidents
   ↓
Diagnosis / evidence
   ↓
Matching playbooks
   ↓
Approvals
   ↓
Execution state
   ↓
Verification
```

This established the human side of the human-in-the-loop architecture.

---

# Phase 7 — Hardened Recovery Interfaces

Recovery endpoints and service boundaries were hardened.

The important architectural idea was:

```text
HTTP request
    ↓
Controller / Route
    ↓
Validated service boundary
    ↓
Recovery system
```

rather than:

```text
HTTP request
    ↓
direct infrastructure mutation
```

---

# Phase 8 — Explicit Failure Semantics

AIRA introduced explicit outcome / manual-reason semantics.

Instead of returning generic:

```text
ERROR
```

AIRA could distinguish conditions such as:

```text
NO_SAFE_PLAYBOOK

POLICY_DENIED

APPROVAL_REJECTED

KILL_SWITCH_ACTIVE

BLAST_RADIUS_EXCEEDED

HIGH_RISK_ACTION

VERIFICATION_FAILED

ROLLBACK_FAILED

INFRASTRUCTURE_UNREACHABLE

TENANT_BOUNDARY_VIOLATION
```

## Why This Matters

Automation needs machine-readable failure semantics.

```text
Generic Error
     ↓
"What happened?"
```

versus:

```text
POLICY_DENIED
     ↓
Known reason
     ↓
Known next action
```

---

# Phase 9 — Platform Documentation / Contract Freeze

The deterministic platform was documented and its important interfaces treated as stable contracts.

```text
Playbook Matcher
       ↓
Runbook Engine
       ↓
Decision Trace
       ↓
Audit Event
       ↓
Action Registry
       ↓
Runbook Registry
       ↓
Playbook Registry
```

The purpose was to prevent later intelligence layers from bypassing the deterministic foundation.

---

# Phase 10 — V1 Regression Freeze

The V1 backend reached a large green regression suite.

The important result was not simply a test count.

It was this:

```text
New AI capability
      ↓
must NOT break
      ↓
existing deterministic recovery safety
```

The deterministic layer became the foundation upon which later autonomous reasoning could safely be built.

---

# PART II — INTELLIGENCE AND RECOVERY PIPELINE

# 5. Why AIRA Needed Another Layer

The deterministic engine could execute known recovery procedures.

But it still needed to understand:

```text
What happened?
     ↓
Why did it happen?
     ↓
Which recovery applies?
     ↓
How risky is it?
     ↓
Should AIRA act?
```

This produced the intelligence and recovery pipeline.

---

# 6. Multi-Agent Incident Intelligence

Instead of one giant agent:

```text
Incident
   ↓
Giant LLM Prompt
   ↓
Everything
```

AIRA moved toward specialized reasoning.

```text
Incident
   │
   ▼
Symptom Analysis
   │
   ▼
Correlation
   │
   ▼
Investigation
   │
   ▼
Topology Analysis
   │
   ▼
Change Analysis
   │
   ▼
Historical Analysis
   │
   ▼
Root Cause Hypothesis
   │
   ▼
Diagnosis
```

Each agent answers a narrower question.

---

# 7. Diagnosis Pipeline

Diagnosis became evidence-driven.

```text
Signals
   ↓
Evidence
   ↓
Symptoms
   ↓
Dependencies
   ↓
Recent Changes
   ↓
Historical Context
   ↓
Root-Cause Hypotheses
   ↓
Confidence
   ↓
Diagnosis
```

This is important because recovery should depend on evidence rather than raw alert text.

---

# 8. Recovery Decision Architecture

Once diagnosis exists, AIRA still does not execute immediately.

```text
Diagnosis
   │
   ▼
Discover Recovery Candidates
   │
   ▼
Applicability
   │
   ▼
Risk Analysis
   │
   ▼
Policy Eligibility
   │
   ▼
Candidate Ranking
   │
   ▼
Recovery Decision
   │
   ▼
Decision Critic
   │
   ▼
Persist
```

---

# 9. Recovery Decision Components

## Applicability

```text
Playbook
   ↓
"Does this actually apply?"
```

## Risk

```text
Candidate Action
      ↓
"What happens if this goes wrong?"
```

## Policy Eligibility

```text
Candidate
   ↓
"Is AIRA allowed to perform this?"
```

## Ranking

```text
Safe Candidates
      ↓
"Which is the best recovery option?"
```

## Decision Critic

```text
Proposed Decision
       ↓
Challenge assumptions
       ↓
ACCEPT / REJECT
```

This gives AIRA a second reasoning boundary before execution.

---

# PART III — CONTROLLED EXECUTION

# 10. Why Recovery Decision and Execution Must Be Separate

A recommendation is not authorization.

```text
AIRA thinks:
"Restarting this deployment is likely best."

               ≠

AIRA is permitted to restart it.
```

Therefore:

```text
Recovery Decision
      ↓
Execution Request
      ↓
Policy Boundary
      ↓
Approval
      ↓
Authorization
      ↓
Execution
```

---

# 11. Immutable Execution Identity

Execution became tied to immutable identity.

```text
Execution Request
       │
       ├── executionRequestId
       │
       ├── executionPlanId
       │
       └── executionPlanHash
```

Before executing:

```text
Received Plan
     ↓
Hash
     ↓
Compare with authorized hash
     │
 ┌───┴────┐
 │        │
MATCH   MISMATCH
 │        │
 ▼        ▼
CONTINUE BLOCK
```

This protects against plan mutation between approval and execution.

---

# 12. Execution Authorization

Execution authorization is persisted rather than inferred from a worker flag.

```text
Execution Request
      ↓
Policy / Approval
      ↓
Execution Authorization
      ↓
Persist
      ↓
Execution Worker reloads authorization
      ↓
Validate
      ↓
Execute
```

The worker must never do:

```text
executionAuthorized = true
```

to grant itself authority.

Authority must come from the protected authorization boundary.

---

# PART IV — POST-ACTION VERIFICATION

# 13. Why Verification Became Necessary

Suppose AIRA runs:

```text
kubectl restart ...
```

and Kubernetes returns success.

That proves:

```text
command accepted
```

It does **not** prove:

```text
incident recovered
```

Therefore:

```text
Execution
    ↓
Verification
```

became a separate subsystem.

---

# 14. Verification Architecture

```text
Execution Result
      │
      ▼
Verification Plan
      │
 ┌────┼────────┬────────────┐
 │    │        │            │
 ▼    ▼        ▼            ▼
Health Metrics Logs   Incident State
 │    │        │            │
 └────┴────────┴────────────┘
             │
             ▼
      Evidence Aggregation
             │
             ▼
      Verification Decision
             │
             ▼
      Verification Critic
             │
             ▼
        Outcome Routing
```

---

# 15. Verification Outcomes

Conceptually:

```text
Verification
     │
 ┌───┼─────────────┐
 │   │             │
 ▼   ▼             ▼
PASS FAIL      INCONCLUSIVE
 │   │             │
 ▼   ▼             ▼
next retry/      escalate/
stage rollback    observe
```

The key principle is:

```text
Execution success
       ≠
Recovery success
```

---

# PART V — INCIDENT LIFECYCLE

# 16. Why Verification Still Wasn't Enough

Imagine:

```text
12:00:00 service healthy
12:00:10 service healthy
12:00:20 incident CLOSED
12:00:30 service crashes again
```

Immediate closure would be premature.

AIRA therefore introduced lifecycle management.

---

# 17. Stability Observation

```text
Verification Passed
        │
        ▼
Stability Observation
        │
        ▼
Continue observing
        │
   ┌────┴────┐
   │         │
 STABLE   REGRESSION
   │         │
   ▼         ▼
Closure   Recovery Path
```

This distinguishes:

```text
temporarily healthy
```

from:

```text
stably recovered
```

---

# 18. Lifecycle Outcome Routing

```text
Lifecycle
    │
    ├───────────────┐
    │               │
    ▼               ▼
Recovered        Regression
    │               │
    ▼               ├────────────┐
Closure              │            │
                     ▼            ▼
                   Retry       Rollback
                     │            │
                     ▼            ▼
                  Handoff      Handoff
                                  │
                                  ▼
                              Escalation
```

Important:

```text
Lifecycle
    ↓
does NOT directly mutate infrastructure.
```

Retry and rollback are **handoffs** into protected recovery paths.

---

# PART VI — PHASE 11: DISTRIBUTED RELIABILITY

# 19. Why Phase 11 Exists

By this point AIRA had a powerful pipeline:

```text
Diagnosis
   ↓
Recovery Decision
   ↓
Execution
   ↓
Verification
   ↓
Lifecycle
```

But production distributed systems introduce another class of problems.

```text
What if RabbitMQ delivers twice?

What if a worker crashes?

What if Worker A dies after performing work?

What if another worker takes ownership?

What if the old worker returns?

What if AIRA restarts?

What if execution outcome is uncertain?
```

Phase 11 addresses these questions.

---

# Phase 11.1 — Deterministic Idempotency

## Problem

Message delivery is commonly at-least-once.

Therefore:

```text
Message
   ↓
Worker
   ↓
Action
```

can become:

```text
Message
   ↓
Worker
   ↓
Action

Message redelivered
   ↓
Worker
   ↓
Action AGAIN
```

For infrastructure recovery, this can be dangerous.

---

# 20. Idempotency Identity

AIRA generates a deterministic identity for a logical operation.

```text
Organization
     +
Environment
     +
Incident
     +
Operation Type
     +
Immutable Operation Identity
     │
     ▼
IDEMPOTENCY KEY
```

The same logical operation produces the same key.

---

# 21. Atomic Claiming

```text
Worker
   │
   ▼
Idempotency Record
   │
   ▼
Atomic Claim
   │
 ┌─┴──────────────────────────┐
 │                            │
NEW                       ALREADY EXISTS
 │                            │
 ▼                       ┌────┴──────┐
CLAIM                    │           │
 │                    PROCESSING  COMPLETED
 ▼                       │           │
EXECUTE                   ▼           ▼
                      DUPLICATE   RETURN RESULT
```

---

# 22. Leases

A worker cannot own work forever.

```text
Worker A
   │
   ▼
CLAIM
   │
   ├── leaseUntil
   │
   ▼
PROCESSING
```

If A dies:

```text
PROCESSING
    │
    X
worker dies
    │
    ▼
lease expires
    │
    ▼
eligible for recovery
```

---

# 23. Claim Tokens

Lease expiry alone is not enough.

Consider:

```text
Worker A claims operation
      ↓
token = AAA
      ↓
A freezes
      ↓
lease expires
      ↓
Worker B claims
      ↓
token = BBB
      ↓
A wakes up
```

Without ownership fencing:

```text
A could overwrite B.
```

With claim tokens:

```text
A tries update
   │
   ▼
token AAA
   │
   ▼
current token BBB
   │
   ▼
MISMATCH
   │
   ▼
REJECT
```

This creates ownership fencing.

---

# 24. Idempotency Across Critical Workers

The idempotency boundary protects critical recovery stages:

```text
Recovery Decision Worker
          │
          ▼
      Idempotency

Execution Worker
          │
          ▼
      Idempotency

Verification Worker
          │
          ▼
      Idempotency

Lifecycle Worker
          │
          ▼
      Idempotency
```

Each uses stage-specific immutable identity.

---

# 25. Why Phase 11.1 Strengthened AIRA

Before:

```text
Duplicate delivery
      ↓
potential duplicate processing
```

After:

```text
Duplicate delivery
      ↓
same deterministic identity
      ↓
idempotency record
      ↓
duplicate recognized
      ↓
no repeated side effect
```

---

# Phase 11.2 — Runtime Crash / Restart Recovery

Idempotency solves duplicates.

It does not fully solve:

```text
"What happens if AIRA dies halfway through processing?"
```

That required durable runtime recovery.

---

# 26. Runtime Recovery Checkpoints

Critical operations gain durable checkpoint state.

```text
Operation Starts
      ↓
Checkpoint Created
      ↓
CLAIMED
      ↓
PROCESSING
      ↓
heartbeat
      ↓
COMPLETED
```

Conceptually, the checkpoint records:

```text
WHO owns this operation?

WHAT operation is running?

WHICH stage is it in?

WHEN was it last alive?

IS it safe to resume?

WHAT happened before the crash?
```

---

# 27. Heartbeats

While processing:

```text
Worker
   │
   ├── work
   │
   ├── heartbeat
   │
   ├── work
   │
   ├── heartbeat
   │
   ▼
complete
```

If heartbeats disappear:

```text
Last heartbeat
      ↓
time passes
      ↓
stale threshold exceeded
      ↓
possible abandoned operation
```

---

# 28. Stale Operation Detection

```text
Runtime Checkpoints
       │
       ▼
Stale Detector
       │
       ▼
Check:
   status?
   lease?
   heartbeat?
   owner?
       │
       ▼
STALE / ACTIVE
```

---

# 29. Runtime Recovery Coordinator

After restart:

```text
AIRA Starts
    │
    ▼
Runtime Recovery Worker
    │
    ▼
Stale Operation Detector
    │
    ▼
Recovery Coordinator
    │
    ▼
Resume-State Resolver
```

The important question is:

```text
"Can this operation be safely resumed?"
```

---

# 30. Safe Resume Matrix

Not every stage has the same replay semantics.

```text
┌─────────────────────┬───────────────────────────────┐
│ Stage               │ Crash Recovery               │
├─────────────────────┼───────────────────────────────┤
│ Recovery Decision   │ Resume through idempotency    │
│ Verification        │ Resume through idempotency    │
│ Lifecycle           │ Resume through idempotency    │
│ Execution           │ DO NOT blindly replay         │
└─────────────────────┴───────────────────────────────┘
```

Why?

---

# 31. Safe Computational Resume

Recovery decision is primarily deterministic/control-plane processing.

```text
Recovery Decision
      ↓
process crashes
      ↓
restart
      ↓
same immutable identity
      ↓
idempotency
      ↓
safe resume
```

Verification is observational:

```text
Verification
      ↓
read health / logs / metrics
      ↓
crash
      ↓
resume observation
```

Lifecycle is orchestration:

```text
Lifecycle
      ↓
crash
      ↓
resume controlled transition
```

---

# 32. Why Execution Is Different

Execution crosses the external side-effect boundary.

Consider:

```text
Execution Worker
      ↓
send restart request to Kubernetes
      ↓
Kubernetes receives request
      ↓
PROCESS DIES
```

After restart, AIRA may know:

```text
execution started
```

but not necessarily:

```text
whether mutation happened.
```

Blind replay could cause:

```text
restart
   ↓
crash
   ↓
restart again
```

Therefore:

```text
UNCERTAIN EXECUTION
        │
        ▼
DO NOT REPLAY
        │
        ▼
REQUIRES_RECONCILIATION
        │
        ▼
MANUAL / SAFE RESOLUTION
```

---

# 33. Runtime Recovery Architecture

```text
                       AIRA PROCESS
                            │
                            X
                          CRASH
                            │
                            ▼
                       AIRA RESTART
                            │
                            ▼
                ┌───────────────────────┐
                │ RuntimeRecoveryWorker │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ StaleOperationDetector│
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ RecoveryCoordinator   │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ ResumeStateResolver   │
                └───────────┬───────────┘
                            │
             ┌──────────────┴──────────────┐
             │                             │
         SAFE STAGE                    EXECUTION
             │                             │
             ▼                             ▼
           RESUME                 OUTCOME UNCERTAIN
             │                             │
             ▼                             ▼
        Idempotency                  NO AUTO REPLAY
             │                             │
             ▼                             ▼
      Protected Worker                RECONCILE
```

---

# 34. What Phase 11.2 Protects Against

```text
PROCESS CRASH
      ↓
lost in-memory state
      ↓
durable checkpoint survives
```

```text
WORKER DISAPPEARS
      ↓
heartbeat expires
      ↓
stale work detected
```

```text
AIRA RESTARTS
      ↓
recovery coordinator scans state
      ↓
safe work resumes
```

```text
EXECUTION CRASH
      ↓
outcome uncertain
      ↓
NO BLIND REPLAY
```

---

# 35. Phase 11.1 + 11.2 Together

These two layers solve different problems.

```text
                 DISTRIBUTED FAILURE
                        │
             ┌──────────┴──────────┐
             │                     │
       DUPLICATE DELIVERY      PROCESS CRASH
             │                     │
             ▼                     ▼
        IDEMPOTENCY          RUNTIME RECOVERY
          11.1                    11.2
             │                     │
             └──────────┬──────────┘
                        ▼
              SAFE DISTRIBUTED WORK
```

---

# 36. Current End-to-End Recovery Pipeline

After the current reliability work, the conceptual pipeline is:

```text
                           SIGNAL
                             │
                             ▼
                        NORMALIZE
                             │
                             ▼
                         CORRELATE
                             │
                             ▼
                          INCIDENT
                             │
                             ▼
                    AI INVESTIGATION
                             │
                             ▼
                         DIAGNOSIS
                             │
                             ▼
                    RECOVERY DECISION
                             │
                    ┌────────┴────────┐
                    │                 │
               checkpoint        idempotency
                    │                 │
                    └────────┬────────┘
                             ▼
                      EXECUTION REQUEST
                             │
                             ▼
                    POLICY / APPROVAL
                             │
                             ▼
                       AUTHORIZATION
                             │
                             ▼
                     IMMUTABLE PLAN
                             │
                             ▼
                        EXECUTION
                             │
                    ┌────────┴────────┐
                    │                 │
               checkpoint        idempotency
                    │                 │
                    └────────┬────────┘
                             ▼
                    INFRASTRUCTURE
                       MUTATION
                             │
                             ▼
                       VERIFICATION
                             │
                    ┌────────┴────────┐
                    │                 │
               checkpoint        idempotency
                    │                 │
                    └────────┬────────┘
                             ▼
                         EVIDENCE
                             │
                             ▼
                  VERIFICATION DECISION
                             │
                             ▼
                         LIFECYCLE
                             │
                    ┌────────┴────────┐
                    │                 │
               checkpoint        idempotency
                    │                 │
                    └────────┬────────┘
                             ▼
             ┌───────────────┼────────────────┐
             │               │                │
             ▼               ▼                ▼
           CLOSE        RETRY HANDOFF    ROLLBACK HANDOFF
                                               │
                                               ▼
                                           ESCALATE
```

---

# 37. Safety Invariants Accumulated Across the Phases

AIRA's architecture is increasingly defined by what it **refuses** to do.

## AI Safety

```text
AI
  ✗ cannot directly mutate infrastructure
  ✗ cannot create arbitrary executable operations
  ✗ cannot bypass policy
  ✗ cannot silently change safety policy

AI
  ✓ analyzes
  ✓ ranks
  ✓ recommends
  ✓ explains
```

## Execution Safety

```text
Execution
  ✗ cannot self-authorize
  ✗ cannot ignore plan identity
  ✗ cannot ignore tenant scope
  ✗ cannot bypass approval
  ✗ cannot blindly replay uncertain execution
```

## Verification Safety

```text
Verification
  ✗ cannot start infrastructure execution

Verification
  ✓ observes
  ✓ gathers evidence
  ✓ determines recovery state
```

## Lifecycle Safety

```text
Lifecycle
  ✗ cannot directly execute retry
  ✗ cannot directly execute rollback

Lifecycle
  ✓ creates controlled handoffs
```

## Runtime Recovery Safety

```text
Recovery Runtime
  ✗ cannot convert restart into execution authority
  ✗ cannot blindly replay infrastructure mutation

Recovery Runtime
  ✓ identifies stale work
  ✓ resolves safe resume state
  ✓ resumes safe stages
  ✓ requires reconciliation for uncertain execution
```

---

# 38. How Every Major Layer Strengthened AIRA

```text
PLAYBOOKS
   ↓
gave AIRA structured recovery knowledge

RUNBOOKS
   ↓
gave AIRA deterministic execution steps

POLICY
   ↓
gave AIRA operational boundaries

AGENTS
   ↓
gave AIRA incident reasoning

DIAGNOSIS
   ↓
gave AIRA evidence-based understanding

RECOVERY DECISION
   ↓
gave AIRA structured recovery selection

AUTHORIZATION
   ↓
separated recommendation from permission

IMMUTABLE PLANS
   ↓
protected approved execution intent

EXECUTION
   ↓
gave AIRA controlled infrastructure mutation

VERIFICATION
   ↓
made AIRA prove that recovery worked

LIFECYCLE
   ↓
made AIRA manage recovery beyond one action

IDEMPOTENCY
   ↓
protected AIRA from duplicate distributed work

RUNTIME CHECKPOINTS
   ↓
made work survive process crashes

LEASES + TOKENS
   ↓
protected distributed worker ownership

SAFE RESUME
   ↓
allowed restart recovery without unsafe replay
```

---

# 39. The Difference Between Early AIRA and Current AIRA

## Early Architecture

```text
Incident
   ↓
Match Playbook
   ↓
Execute Runbook
   ↓
Result
```

## Current Architecture

```text
Signals
   ↓
Normalization
   ↓
Correlation
   ↓
Incident
   ↓
Evidence
   ↓
Multi-Agent Investigation
   ↓
Diagnosis
   ↓
Recovery Candidates
   ↓
Applicability
   ↓
Risk
   ↓
Policy
   ↓
Ranking
   ↓
Decision
   ↓
Critic
   ↓
Execution Request
   ↓
Immutable Plan
   ↓
Authorization
   ↓
Idempotency
   ↓
Runtime Checkpoint
   ↓
Execution
   ↓
Verification
   ↓
Evidence Aggregation
   ↓
Verification Critic
   ↓
Stability Observation
   ↓
Lifecycle
   ↓
Close / Retry / Rollback / Escalate
```

---

# 40. What Makes AIRA Different

AIRA is not designed around:

```text
"How much autonomy can we give an LLM?"
```

It is designed around:

```text
"How much autonomy can the system
prove is safe?"
```

That changes the architecture.

Instead of:

```text
LLM
 ↓
kubectl
```

AIRA uses:

```text
LLM / Agents
      ↓
Structured Reasoning
      ↓
Recovery Candidate
      ↓
Risk
      ↓
Policy
      ↓
Approval
      ↓
Authorization
      ↓
Immutable Plan
      ↓
Idempotency
      ↓
Deterministic Executor
      ↓
Infrastructure
      ↓
Independent Verification
      ↓
Lifecycle
```

---

# 41. Current Development Boundary

At the current point in development, AIRA has established the foundations for:

```text
✓ structured recovery knowledge

✓ deterministic runbook execution

✓ policy-controlled actions

✓ human approval boundaries

✓ multi-agent investigation

✓ evidence-driven diagnosis

✓ recovery decision pipeline

✓ recovery decision criticism

✓ immutable execution identity

✓ persisted execution authorization

✓ post-action verification

✓ verification criticism

✓ stability observation

✓ incident lifecycle orchestration

✓ retry / rollback handoffs

✓ idempotent distributed processing

✓ worker leases

✓ claim-token ownership fencing

✓ durable runtime checkpoints

✓ heartbeat-based stale detection

✓ restart recovery coordination

✓ safe-stage resume

✓ prohibition of blind execution replay

✓ auditability and observability
```

---

# 42. Next Reliability Layers

The next phases continue strengthening the distributed runtime.

They should preserve the existing principle:

```text
NEW CAPABILITY
      │
      ▼
MUST NOT weaken
      │
      ▼
existing safety invariant
```

The next distributed reliability work should build on:

```text
Idempotency
     +
Runtime Checkpoints
     +
Ownership
     +
Safe Resume
     │
     ▼
Further Runtime Coordination
     │
     ▼
Production Hardening
```

Exact future phase contracts should be documented when they are implemented rather than described as completed architecture in advance.

---

# 43. AIRA's Reliability Ladder

A useful way to understand the entire project is:

```text
LEVEL 1
Can AIRA detect a problem?
        │
        ▼
LEVEL 2
Can AIRA understand the problem?
        │
        ▼
LEVEL 3
Can AIRA identify a recovery?
        │
        ▼
LEVEL 4
Can AIRA determine whether it is safe?
        │
        ▼
LEVEL 5
Can AIRA execute it deterministically?
        │
        ▼
LEVEL 6
Can AIRA prove the recovery worked?
        │
        ▼
LEVEL 7
Can AIRA manage the incident afterward?
        │
        ▼
LEVEL 8
Can AIRA survive duplicate messages?
        │
        ▼
LEVEL 9
Can AIRA survive worker crashes?
        │
        ▼
LEVEL 10
Can AIRA restart without repeating
an uncertain infrastructure mutation?
```

The later levels are what turn an automation prototype into a reliability platform.

---

# 44. Final Architectural Principle

AIRA should always prefer:

```text
UNKNOWN
   ↓
BLOCK
```

over:

```text
UNKNOWN
   ↓
GUESS
   ↓
PRODUCTION MUTATION
```

And:

```text
UNCERTAIN EXECUTION
        ↓
RECONCILE
```

over:

```text
UNCERTAIN EXECUTION
        ↓
REPEAT
```

The long-term goal of AIRA is therefore not unrestricted autonomy.

It is:

> **Evidence-driven, policy-constrained, deterministic, auditable and recoverable operational autonomy.**

---

# 45. Engineering Evolution Summary

```text
PLAYBOOK CATALOGUE
        │
        ▼
RUNBOOK EXECUTION
        │
        ▼
POLICY + APPROVAL
        │
        ▼
INCIDENT INTEGRATION
        │
        ▼
AI INVESTIGATION
        │
        ▼
DIAGNOSIS
        │
        ▼
RECOVERY DECISION
        │
        ▼
DECISION CRITIC
        │
        ▼
IMMUTABLE EXECUTION PLAN
        │
        ▼
EXECUTION AUTHORIZATION
        │
        ▼
DETERMINISTIC EXECUTION
        │
        ▼
VERIFICATION
        │
        ▼
VERIFICATION CRITIC
        │
        ▼
STABILITY OBSERVATION
        │
        ▼
INCIDENT LIFECYCLE
        │
        ▼
IDEMPOTENCY
        │
        ▼
LEASES + CLAIM TOKENS
        │
        ▼
RUNTIME CHECKPOINTS
        │
        ▼
STALE OPERATION DETECTION
        │
        ▼
SAFE CRASH RECOVERY
        │
        ▼
NO BLIND EXECUTION REPLAY
        │
        ▼
PRODUCTION-GRADE
AUTONOMOUS INCIDENT RECOVERY
```

---

**AIRA — Autonomous Incident Recovery Agent**

**Engineering principle:**

> Intelligence may recommend.  
> Policy must permit.  
> Deterministic systems must execute.  
> Evidence must verify.  
> Runtime recovery must never create new authority.