# AIRA Documentation

> **Documentation hub for AIRA — Autonomous Incident Recovery Agent**

AIRA is an AI-assisted, policy-driven incident recovery platform designed around a controlled operational loop:

```text
Observe
   ↓
Investigate
   ↓
Diagnose
   ↓
Decide
   ↓
Authorize
   ↓
Execute
   ↓
Verify
   ↓
Observe Stability
   ↓
Close / Retry / Rollback / Escalate
```

This directory explains how those stages work, how they interact, and the safety guarantees that prevent AI reasoning from becoming unrestricted infrastructure access.

---

# 1. Start Here

If you are new to AIRA, read the documentation in this order:

```text
                    START
                      │
                      ▼
                ../README.md
                      │
                      ▼
              CURRENT_STATUS.md
                      │
                      ▼
               PHASE_HISTORY.md
                      │
                      ▼
        architecture/SYSTEM_ARCHITECTURE.md
                      │
                      ▼
         architecture/AGENT_ARCHITECTURE.md
                      │
                      ▼
         architecture/RECOVERY_PIPELINE.md
                      │
                      ▼
   architecture/PLAYBOOK_RUNBOOK_ARCHITECTURE.md
                      │
                      ▼
        architecture/EXECUTION_SAFETY.md
                      │
                      ▼
 architecture/VERIFICATION_ARCHITECTURE.md
                      │
                      ▼
   architecture/LIFECYCLE_ARCHITECTURE.md
                      │
                      ▼
architecture/IDEMPOTENCY_AND_OWNERSHIP.md
                      │
                      ▼
       architecture/CRASH_RECOVERY.md
                      │
                      ▼
         architecture/SAFETY_MODEL.md
```

You do not need to read every document before understanding AIRA.

For a quick overview:

```text
../README.md
      ↓
CURRENT_STATUS.md
      ↓
SYSTEM_ARCHITECTURE.md
```

Those three should give you the overall picture.

---

# 2. Documentation Map

```text
docs/
│
├── README.md
│
├── CURRENT_STATUS.md
│
├── PHASE_HISTORY.md
│
└── architecture/
    │
    ├── SYSTEM_ARCHITECTURE.md
    │
    ├── AGENT_ARCHITECTURE.md
    │
    ├── RECOVERY_PIPELINE.md
    │
    ├── PLAYBOOK_RUNBOOK_ARCHITECTURE.md
    │
    ├── EXECUTION_SAFETY.md
    │
    ├── VERIFICATION_ARCHITECTURE.md
    │
    ├── LIFECYCLE_ARCHITECTURE.md
    │
    ├── IDEMPOTENCY_AND_OWNERSHIP.md
    │
    ├── CRASH_RECOVERY.md
    │
    └── SAFETY_MODEL.md
```

---

# 3. Root README

File:

```text
../README.md
```

Purpose:

```text
What is AIRA?
      ↓
Why does it exist?
      ↓
What problem does it solve?
      ↓
How does the platform work?
      ↓
What makes the architecture different?
```

Use this document for:

```text
GitHub visitors

recruiters

engineers seeing AIRA for the first time

contributors

technical reviewers
```

---

# 4. Current Status

File:

```text
CURRENT_STATUS.md
```

Answers:

```text
What exists today?

What is tested?

What is partially implemented?

What is still being hardened?

Which phase are we currently on?
```

This document deliberately separates:

```text
IMPLEMENTED
```

from:

```text
PLANNED
```

so future architecture is not accidentally presented as completed functionality.

---

# 5. Phase History

File:

```text
PHASE_HISTORY.md
```

This explains how AIRA evolved.

Conceptually:

```text
Initial Platform
      ↓
Deterministic Recovery
      ↓
Playbooks + Runbooks
      ↓
Agent Intelligence
      ↓
Recovery Decisions
      ↓
Controlled Execution
      ↓
Verification
      ↓
Lifecycle
      ↓
Distributed Idempotency
      ↓
Crash Recovery
```

Use it when you want to understand:

```text
why a subsystem exists

when it was introduced

which problem each phase solved

how the architecture evolved
```

---

# 6. System Architecture

File:

```text
architecture/SYSTEM_ARCHITECTURE.md
```

This is the main technical architecture document.

It explains the complete platform:

```text
Signals
   ↓
Incidents
   ↓
Agents
   ↓
Diagnosis
   ↓
Recovery Decision
   ↓
Policy
   ↓
Authorization
   ↓
Execution
   ↓
Verification
   ↓
Lifecycle
```

Read this first if you are evaluating AIRA technically.

---

# 7. Agent Architecture

File:

```text
architecture/AGENT_ARCHITECTURE.md
```

This explains AIRA's intelligence layer.

Topics include:

```text
specialized agents

agent orchestration

evidence collection

hypothesis generation

diagnosis

recovery reasoning

agent tools

structured outputs

agent safety boundaries
```

The most important principle is:

```text
AI REASONS
     ↓
AI DOES NOT DIRECTLY EXECUTE
```

---

# 8. Recovery Pipeline

File:

```text
architecture/RECOVERY_PIPELINE.md
```

This follows one incident through the complete recovery process.

```text
Signal
   ↓
Incident
   ↓
Investigation
   ↓
Diagnosis
   ↓
Recovery Candidate
   ↓
Recovery Decision
   ↓
Authorization
   ↓
Execution
   ↓
Verification
   ↓
Lifecycle
```

Read this when you want to understand the operational flow rather than individual components.

---

# 9. Playbook and Runbook Architecture

File:

```text
architecture/PLAYBOOK_RUNBOOK_ARCHITECTURE.md
```

This explains the separation between:

```text
PLAYBOOK
"What should we do?"
```

and:

```text
RUNBOOK
"Exactly how do we do it?"
```

Core flow:

```text
AI
   ↓
Select Approved Playbook
   ↓
Resolve Approved Runbook
   ↓
Registered Actions
   ↓
Deterministic Handlers
```

This is one of AIRA's most important architectural boundaries.

---

# 10. Execution Safety

File:

```text
architecture/EXECUTION_SAFETY.md
```

This explains the highest-risk part of AIRA:

```text
Infrastructure Mutation
```

It covers:

```text
execution requests

policy

approval

authorization

immutable execution plans

plan hashes

action registration

parameter validation

tenant validation

idempotency

worker ownership
```

The key rule is:

```text
Recommendation
      ≠
Authorization
      ≠
Execution
```

---

# 11. Verification Architecture

File:

```text
architecture/VERIFICATION_ARCHITECTURE.md
```

Execution success is not considered recovery success.

```text
Action Completed
      ↓
Verification
      ↓
Health Evidence
      +
Metrics
      +
Logs
      +
Incident State
      ↓
Recovery Verdict
```

This document explains how AIRA independently determines whether remediation actually worked.

---

# 12. Lifecycle Architecture

File:

```text
architecture/LIFECYCLE_ARCHITECTURE.md
```

Verification answers:

```text
"Does the system appear recovered now?"
```

Lifecycle answers:

```text
"Has it remained recovered long enough?"
```

It covers:

```text
stability observation

closure eligibility

regression

retry

rollback

escalation
```

---

# 13. Idempotency and Ownership

File:

```text
architecture/IDEMPOTENCY_AND_OWNERSHIP.md
```

This documents the distributed-systems protections introduced during Phase 11.1.

```text
Duplicate Message
      ↓
Idempotency Identity
      ↓
Atomic Claim
      ↓
Lease
      ↓
Heartbeat
      ↓
Claim Token
      ↓
Single Logical Owner
```

It protects AIRA from duplicated work and stale workers.

---

# 14. Crash Recovery

File:

```text
architecture/CRASH_RECOVERY.md
```

This documents Phase 11.2.

It answers:

```text
What happens if AIRA crashes
while an incident is being recovered?
```

Safe stages:

```text
Recovery Decision
Verification
Lifecycle
      ↓
may resume through protected workers
```

Execution is different:

```text
Execution
   ↓
Crash
   ↓
Outcome Unknown
   ↓
RECONCILIATION
```

AIRA does not blindly replay uncertain infrastructure mutation.

---

# 15. Safety Model

File:

```text
architecture/SAFETY_MODEL.md
```

This consolidates the global safety invariants.

The core principle is:

```text
KNOWN SAFE
    ↓
CONTINUE

KNOWN UNSAFE
    ↓
BLOCK

UNKNOWN
    ↓
FAIL CLOSED
```

Read this document when reviewing AIRA from:

```text
security

SRE

platform engineering

production reliability

AI safety

distributed systems
```

perspectives.

---

# 16. AIRA in One Diagram

```text
                         ┌─────────────┐
                         │   SIGNALS   │
                         └──────┬──────┘
                                │
                                ▼
                         ┌─────────────┐
                         │  INCIDENT   │
                         └──────┬──────┘
                                │
                                ▼
                         ┌─────────────┐
                         │ AI AGENTS   │
                         └──────┬──────┘
                                │
                                ▼
                         ┌─────────────┐
                         │ DIAGNOSIS   │
                         └──────┬──────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │ RECOVERY DECISION    │
                    └──────────┬───────────┘
                               │
                               ▼
                         ┌─────────────┐
                         │   POLICY    │
                         └──────┬──────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │ APPROVAL / AUTH      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ IMMUTABLE PLAN       │
                    └──────────┬───────────┘
                               │
                               ▼
                         ┌─────────────┐
                         │ EXECUTION   │
                         └──────┬──────┘
                                │
                                ▼
                         INFRASTRUCTURE
                                │
                                ▼
                    ┌──────────────────────┐
                    │ VERIFICATION         │
                    └──────────┬───────────┘
                               │
                               ▼
                         ┌─────────────┐
                         │ LIFECYCLE   │
                         └──────┬──────┘
                                │
                 ┌──────────────┼───────────────┐
                 │              │               │
                 ▼              ▼               ▼
               CLOSE          RETRY         ROLLBACK
                                                │
                                                ▼
                                            ESCALATE
```

---

# 17. The Distributed Reliability Layer

Under the operational pipeline sits another layer:

```text
                 BUSINESS WORKFLOW

Recovery Decision
Execution
Verification
Lifecycle

                       │
                       ▼

              DISTRIBUTED SAFETY

                 Idempotency
                       │
                 Atomic Claims
                       │
                    Leases
                       │
                  Heartbeats
                       │
                 Claim Tokens
                       │
                   Checkpoints
                       │
                Stale Detection
                       │
                Crash Recovery
```

These mechanisms are not incident intelligence.

They make incident intelligence reliable under distributed execution.

---

# 18. Intelligence vs Control Plane

AIRA deliberately separates these concepts.

```text
INTELLIGENCE PLANE

Signals
   ↓
Evidence
   ↓
Agents
   ↓
Diagnosis
   ↓
Recovery Recommendation
```

Then:

```text
CONTROL PLANE

Recovery Decision
   ↓
Policy
   ↓
Approval
   ↓
Authorization
   ↓
Immutable Plan
```

Then:

```text
EXECUTION PLANE

Registered Actions
   ↓
Runbook Engine
   ↓
Infrastructure Adapter
   ↓
Infrastructure
```

Then:

```text
ASSURANCE PLANE

Verification
   ↓
Lifecycle
   ↓
Audit
```

---

# 19. Why the Separation Matters

Without boundaries:

```text
AI
 ↓
Infrastructure
```

A hallucination can become an operational action.

AIRA instead uses:

```text
AI
 ↓
Structured Recommendation
 ↓
Approved Knowledge
 ↓
Deterministic Policy
 ↓
Authorization
 ↓
Registered Execution
```

The AI contributes intelligence without owning unrestricted authority.

---

# 20. Playbooks and Runbooks

AIRA uses two levels of operational knowledge:

```text
PLAYBOOK
   ↓
strategy
```

and:

```text
RUNBOOK
   ↓
procedure
```

Example:

```text
Incident:
CrashLoopBackOff
      ↓
Playbook:
Recover crashing Kubernetes workload
      ↓
Runbook:
Restart exact unhealthy pod
      ↓
Action:
kubernetes/restart_pod
```

---

# 21. Workers

Important worker boundaries include:

```text
RecoveryDecisionWorker
        ↓
decides recovery
        ↓
NO infrastructure mutation
```

```text
ExecutionWorker
        ↓
validates authorization
        ↓
executes approved plan
```

```text
VerificationWorker
        ↓
collects recovery evidence
        ↓
NO infrastructure mutation
```

```text
LifecycleWorker
        ↓
observes stability
        ↓
handoffs retry / rollback
        ↓
NO direct infrastructure mutation
```

---

# 22. Idempotency

Critical worker operations are protected from duplicate logical processing.

```text
Job
 ↓
Identity
 ↓
Idempotency Record
 ↓
Atomic Claim
 ↓
Handler
 ↓
Stored Result
```

Duplicate delivery:

```text
same identity
      ↓
completed already
      ↓
reuse result
```

---

# 23. Worker Ownership

Idempotency is strengthened with ownership.

```text
Worker A
      ↓
Claim
      ↓
Lease
      ↓
Heartbeat
```

If A dies:

```text
Lease Expires
      ↓
Worker B Claims
      ↓
New Claim Token
```

If A returns:

```text
Old Token
   !=
New Token
      ↓
A fenced
```

---

# 24. Runtime Crash Recovery

AIRA assumes:

```text
the AIRA process itself can fail
```

Therefore:

```text
Critical Worker
      ↓
Runtime Checkpoint
      ↓
Process Crash
      ↓
Lease Expires
      ↓
Stale Detector
      ↓
Resume Resolver
```

For safe stages:

```text
redispatch through protected worker
```

For uncertain execution:

```text
reconciliation
```

---

# 25. Safety Boundaries

The architecture is built around several boundaries.

```text
AI boundary
      ↓
AI cannot directly mutate infrastructure
```

```text
Policy boundary
      ↓
AI cannot override policy
```

```text
Authorization boundary
      ↓
workers cannot self-authorize
```

```text
Execution boundary
      ↓
only registered actions execute
```

```text
Verification boundary
      ↓
command success does not prove recovery
```

```text
Runtime boundary
      ↓
crash recovery cannot manufacture authority
```

---

# 26. Failure Philosophy

AIRA should always prefer:

```text
SAFE FAILURE
```

over:

```text
UNSAFE SUCCESS
```

Examples:

```text
No authorization
      ↓
BLOCK
```

```text
Ambiguous resource
      ↓
BLOCK
```

```text
Unknown action
      ↓
BLOCK
```

```text
Insufficient verification
      ↓
DO NOT CLOSE
```

```text
Execution outcome uncertain
      ↓
RECONCILE
```

---

# 27. Unknown Incidents

AIRA does not need an automated answer for every possible problem.

```text
Unknown Incident
      ↓
Investigate
      ↓
Diagnose
      ↓
Safe Playbook Exists?
   ┌─────┴─────┐
   │           │
  YES          NO
   │           │
   ▼           ▼
Normal      Escalate
Pipeline
```

Escalation is a valid system outcome.

---

# 28. How to Understand an Incident End to End

For someone studying a single recovery path, use:

```text
RECOVERY_PIPELINE.md
        ↓
PLAYBOOK_RUNBOOK_ARCHITECTURE.md
        ↓
EXECUTION_SAFETY.md
        ↓
VERIFICATION_ARCHITECTURE.md
        ↓
LIFECYCLE_ARCHITECTURE.md
```

---

# 29. How to Understand Distributed Reliability

Read:

```text
IDEMPOTENCY_AND_OWNERSHIP.md
        ↓
CRASH_RECOVERY.md
        ↓
SAFETY_MODEL.md
```

This explains what happens when:

```text
messages duplicate

workers race

workers die

leases expire

stale workers return

the process crashes

execution becomes ambiguous
```

---

# 30. How to Understand the AI System

Read:

```text
AGENT_ARCHITECTURE.md
        ↓
RECOVERY_PIPELINE.md
        ↓
PLAYBOOK_RUNBOOK_ARCHITECTURE.md
        ↓
SAFETY_MODEL.md
```

This explains:

```text
what agents do

what agents cannot do

how diagnosis is created

how recovery is selected

where deterministic systems take control
```

---

# 31. How to Review AIRA for Safety

Recommended path:

```text
SAFETY_MODEL.md
      ↓
EXECUTION_SAFETY.md
      ↓
IDEMPOTENCY_AND_OWNERSHIP.md
      ↓
CRASH_RECOVERY.md
      ↓
VERIFICATION_ARCHITECTURE.md
```

Questions to ask:

```text
Can AI execute directly?

Can a worker self-authorize?

Can an approved plan change?

Can duplicate messages execute twice?

Can stale workers overwrite state?

Can a crash replay an uncertain mutation?

Can execution success close an incident?
```

The intended answer to each unsafe form is:

```text
NO
```

---

# 32. How to Add a New Recovery Capability

Start with:

```text
Incident Type
      ↓
Playbook
      ↓
Runbook
      ↓
Registered Actions
      ↓
Handlers
      ↓
Policy
      ↓
Verification
      ↓
Tests
```

Do not start with:

```text
"Give the AI another shell command."
```

See:

```text
architecture/PLAYBOOK_RUNBOOK_ARCHITECTURE.md
```

---

# 33. How to Add a New Agent

Start by defining:

```text
Purpose
   ↓
Inputs
   ↓
Allowed Tools
   ↓
Output Contract
   ↓
Confidence Rules
   ↓
Forbidden Actions
```

Then integrate it into orchestration.

See:

```text
architecture/AGENT_ARCHITECTURE.md
```

---

# 34. How to Add a New Worker Stage

Before adding another distributed stage, define:

```text
immutable operation identity

idempotency key

checkpoint identity

lease semantics

retry semantics

crash semantics

resume safety

authorization boundary
```

A new worker should not be added without deciding what happens if:

```text
it receives the same message twice
```

or:

```text
it crashes halfway through
```

---

# 35. Documentation vs Source Code

These documents explain architectural intent.

The source code remains authoritative for current implementation details.

If documentation and code diverge:

```text
DO NOT ASSUME
```

Instead:

```text
inspect implementation
      ↓
inspect tests
      ↓
determine current behavior
      ↓
update documentation
```

---

# 36. Tests as Architecture Evidence

AIRA's safety properties should be represented in tests.

Examples:

```text
RecoveryDecisionWorker
cannot receive execution authorization
```

```text
ExecutionWorker
requires immutable execution identity
```

```text
VerificationWorker
remains side-effect free
```

```text
LifecycleWorker
does not directly execute infrastructure
```

```text
Runtime Recovery
does not replay uncertain execution
```

Tests should make architectural regressions difficult.

---

# 37. Current Milestone

Current documented milestone:

```text
Phase 11.1
Idempotency
      ✅
```

```text
Phase 11.2
Runtime Crash Recovery
      ✅
```

Next development milestone:

```text
Phase 11.3
      ↓
NEXT
```

See:

```text
CURRENT_STATUS.md
```

for the implementation snapshot.

---

# 38. Documentation Maintenance Rule

Whenever a major phase is completed:

```text
Implementation
      ↓
Tests Green
      ↓
Safety Freeze
      ↓
Update CURRENT_STATUS.md
      ↓
Update PHASE_HISTORY.md
      ↓
Update affected architecture docs
      ↓
Update docs/README.md if structure changes
```

Documentation should evolve with the architecture.

---

# 39. Recommended Documentation Structure Going Forward

Keep architecture documents under:

```text
docs/architecture/
```

Future specialized documents can be organized into:

```text
docs/
│
├── architecture/
│
├── operations/
│
├── security/
│
├── testing/
│
├── integrations/
│
└── development/
```

Do not create folders until enough documentation exists to justify them.

---

# 40. Future Documentation Candidates

As AIRA becomes more production-oriented, useful additions may include:

```text
operations/
    DEPLOYMENT.md
    INCIDENT_RESPONSE.md
    MANUAL_RECONCILIATION.md
    DISASTER_RECOVERY.md

security/
    THREAT_MODEL.md
    TENANT_ISOLATION.md
    SECRETS_AND_CREDENTIALS.md

testing/
    TEST_STRATEGY.md
    CHAOS_TESTING.md

integrations/
    KUBERNETES.md
    PROMETHEUS.md
    OPENTELEMETRY.md

development/
    CONTRIBUTING.md
    ADDING_AN_AGENT.md
    ADDING_A_PLAYBOOK.md
    ADDING_A_RUNBOOK.md
```

These should be added as the corresponding implementation becomes mature enough to document accurately.

---

# 41. AIRA's Core Engineering Idea

The architecture can be reduced to four major responsibilities:

```text
                ┌─────────────────┐
                │  INTELLIGENCE   │
                │                 │
                │ Understand      │
                │ Diagnose        │
                │ Recommend       │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │     CONTROL     │
                │                 │
                │ Policy          │
                │ Approval        │
                │ Authorization   │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │    EXECUTION    │
                │                 │
                │ Deterministic   │
                │ Registered      │
                │ Idempotent      │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │    ASSURANCE    │
                │                 │
                │ Verify          │
                │ Observe         │
                │ Audit           │
                │ Recover Runtime │
                └─────────────────┘
```

---

# 42. Final Navigation Map

```text
Want to understand AIRA?
        │
        ▼
    ../README.md
        │
        ▼
SYSTEM_ARCHITECTURE.md


Want to know what is actually built?
        │
        ▼
CURRENT_STATUS.md


Want to know how we got here?
        │
        ▼
PHASE_HISTORY.md


Want to understand the AI?
        │
        ▼
AGENT_ARCHITECTURE.md


Want to understand incident recovery?
        │
        ▼
RECOVERY_PIPELINE.md


Want to understand Playbooks/Runbooks?
        │
        ▼
PLAYBOOK_RUNBOOK_ARCHITECTURE.md


Want to understand production mutation?
        │
        ▼
EXECUTION_SAFETY.md


Want to understand recovery proof?
        │
        ▼
VERIFICATION_ARCHITECTURE.md


Want to understand closure/retry/rollback?
        │
        ▼
LIFECYCLE_ARCHITECTURE.md


Want to understand duplicate/race protection?
        │
        ▼
IDEMPOTENCY_AND_OWNERSHIP.md


Want to understand process crash behavior?
        │
        ▼
CRASH_RECOVERY.md


Want the complete safety model?
        │
        ▼
SAFETY_MODEL.md
```

---

# 43. Final Principle

AIRA is not built around:

```text
AI can operate infrastructure.
```

It is built around:

```text
AI can understand operational problems
              ↓
AI can recommend bounded recovery
              ↓
deterministic systems validate authority
              ↓
approved execution performs mutation
              ↓
independent systems verify recovery
              ↓
distributed controls protect the workflow
```

That distinction is the foundation of the project.

---

**Project:** AIRA — Autonomous Incident Recovery Agent  
**Documentation milestone:** Phase 11.2 complete  
**Next engineering milestone:** Phase 11.3