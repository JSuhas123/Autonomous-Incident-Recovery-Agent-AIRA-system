# AIRA System Architecture

> **Current architecture of the Autonomous Incident Recovery Agent platform.**

AIRA is structured as a set of cooperating control planes rather than one large autonomous agent.

The platform separates:

```text
OBSERVATION
     ↓
REASONING
     ↓
RECOVERY DECISION
     ↓
POLICY
     ↓
AUTHORIZATION
     ↓
EXECUTION
     ↓
VERIFICATION
     ↓
LIFECYCLE
     ↓
RELIABILITY / RECOVERY
```

This separation is intentional.

It ensures that:

```text
AI intelligence
      ≠
execution authority
```

and:

```text
successful command
      ≠
proven recovery
```

---

# 1. Top-Level Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                    CUSTOMER ENVIRONMENT                      │
│                                                              │
│ Kubernetes │ APIs │ DBs │ Queues │ Cloud │ CI/CD │ Services │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              │ telemetry / alerts / state
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY PLANE                       │
│                                                              │
│ Prometheus │ Grafana │ Datadog │ CloudWatch │ OTel │ K8s    │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                       SIGNAL PLANE                           │
│                                                              │
│ ingest → normalize → deduplicate → enrich → correlate        │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
                         INCIDENT
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                       AGENT PLANE                            │
│                                                              │
│ symptoms                                                     │
│    ↓                                                         │
│ investigation                                                │
│    ↓                                                         │
│ topology                                                     │
│    ↓                                                         │
│ changes                                                      │
│    ↓                                                         │
│ history                                                      │
│    ↓                                                         │
│ root cause                                                   │
│    ↓                                                         │
│ diagnosis                                                    │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
                         DIAGNOSIS
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     RECOVERY PLANE                           │
│                                                              │
│ discover → applicability → risk → policy → rank → critic     │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
                    RECOVERY DECISION
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                 POLICY / AUTHORIZATION PLANE                 │
│                                                              │
│ policy                                                       │
│   ↓                                                          │
│ approval requirement                                         │
│   ↓                                                          │
│ immutable plan                                               │
│   ↓                                                          │
│ persisted authorization                                      │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     EXECUTION PLANE                          │
│                                                              │
│ runtime checkpoint                                           │
│        ↓                                                     │
│ idempotency                                                  │
│        ↓                                                     │
│ authorization revalidation                                  │
│        ↓                                                     │
│ immutable plan validation                                   │
│        ↓                                                     │
│ deterministic executor                                      │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
                    INFRASTRUCTURE MUTATION
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    VERIFICATION PLANE                        │
│                                                              │
│ health                                                       │
│ metrics                                                      │
│ logs                                                         │
│ incident state                                               │
│      ↓                                                       │
│ evidence                                                     │
│      ↓                                                       │
│ decision                                                     │
│      ↓                                                       │
│ critic                                                       │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     LIFECYCLE PLANE                          │
│                                                              │
│ stability → closure → regression → retry/rollback/escalate   │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    RELIABILITY PLANE                         │
│                                                              │
│ idempotency │ leases │ checkpoints │ safe resume │ recovery  │
└──────────────────────────────────────────────────────────────┘
```

---

# 2. Architectural Principle

AIRA is deliberately split into:

```text
Reasoning Systems
      ↓
Control Systems
      ↓
Execution Systems
```

The reasoning systems answer:

```text
What is happening?

What probably caused it?

What recovery might work?
```

The control systems answer:

```text
Is this recovery allowed?

Does policy permit it?

Does it need human approval?

Is the exact plan still the same?
```

The execution systems answer:

```text
What exact deterministic operation
should be performed now?
```

---

# 3. Signal Plane

The Signal Plane converts raw external events into structured incident inputs.

The repository contains dedicated services for signal ingestion, normalization, deduplication, enrichment, correlation, grouping and routing. :contentReference[oaicite:0]{index=0}

## Flow

```text
Monitoring Provider
      │
      ▼
Signal Ingestion
      │
      ▼
Signal Normalization
      │
      ▼
Signal Deduplication
      │
      ▼
Signal Enrichment
      │
      ▼
Signal Correlation
      │
      ▼
Correlation Group
      │
      ▼
Incident
```

## Responsibilities

### Signal Ingestion

```text
External system
      ↓
accept signal
      ↓
validate envelope
      ↓
persist / route
```

Its job is simply:

> get operational information into AIRA safely.

---

### Signal Normalization

Different providers describe the same problem differently.

```text
Prometheus alert
Datadog event
CloudWatch alarm
Kubernetes warning
      │
      ▼
Normalization
      │
      ▼
Common AIRA Signal
```

This prevents downstream logic from becoming provider-specific.

---

### Signal Deduplication

```text
same alert
same alert
same alert
same alert
    │
    ▼
Deduplication
    │
    ▼
one logical signal
```

This reduces noise.

---

### Signal Enrichment

Adds useful context such as:

```text
service
environment
resource
namespace
tenant
related metadata
```

---

### Signal Correlation

Correlation answers:

```text
"Do these signals describe
the same underlying problem?"
```

Example:

```text
High API latency
      +
Database pool exhaustion
      +
Request timeout spike
      ↓
same correlated incident
```

---

# 4. Incident Plane

The Incident Plane is the central operational context.

Instead of agents reasoning directly over random alerts:

```text
Raw signal
   ↓
Agent
```

AIRA prefers:

```text
Signals
   ↓
Correlation
   ↓
Incident
   ↓
Investigation
```

An incident becomes the shared identity used through:

```text
Diagnosis
Recovery Decision
Execution
Verification
Lifecycle
Audit
Runtime Recovery
```

---

# 5. Agent Plane

AIRA's intelligence layer is composed of specialized agents rather than one general-purpose autonomous agent.

The repository currently contains agents covering areas such as symptom analysis, topology analysis, change analysis, historical analysis, root-cause hypothesis, diagnosis, playbook selection, risk/impact and verification criticism. :contentReference[oaicite:1]{index=1}

## Flow

```text
Incident
   │
   ▼
Symptom Analysis
   │
   ▼
Investigation
   │
   ▼
Correlation Analysis
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
Root-Cause Hypothesis
   │
   ▼
Diagnosis
```

---

# 6. What the Agents Do

## Symptom Analysis

Answers:

```text
"What is visibly wrong?"
```

Examples:

```text
high latency
pod crash
OOM
error spike
DB timeout
queue backlog
```

---

## Investigation

Collects supporting evidence.

```text
Incident
   ↓
Logs
Metrics
Kubernetes state
Service state
Historical context
   ↓
Evidence Package
```

---

## Topology Analysis

Answers:

```text
"What depends on what?"
```

Example:

```text
Frontend
   ↓
API
   ↓
Payment Service
   ↓
Database
```

If the database is unhealthy, topology allows AIRA to understand why multiple upstream services are failing.

---

## Change Analysis

Looks for events preceding an incident.

```text
Deployment
Config Change
Image Update
Scaling Change
Certificate Change
      │
      ▼
possible incident trigger
```

---

## Historical Analysis

Looks for previous related incidents.

```text
Current incident
      ↓
historical search
      ↓
similar past incidents
      ↓
previous diagnosis
      ↓
previous successful recovery
```

---

## Root-Cause Hypothesis

Combines evidence into candidate explanations.

```text
Symptoms
   +
Topology
   +
Changes
   +
History
   ↓
Possible Root Causes
```

---

## Diagnosis Agent

Produces the structured final diagnosis.

```text
Evidence
   ↓
Hypotheses
   ↓
Confidence
   ↓
Diagnosis
```

The diagnosis then becomes an input into the recovery system.

---

# 7. Recovery Plane

The Recovery Plane answers:

> Given this diagnosis, what recovery strategy is both applicable and safe enough to consider?

The current repository contains dedicated services for policy eligibility, candidate ranking, decision contracts, decision engine, critic, persistence, fallback and rollback evaluation. :contentReference[oaicite:2]{index=2}

## Flow

```text
Diagnosis
   │
   ▼
Playbook Discovery
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
Approval Requirement
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
Persist Decision
```

---

# 8. Playbook Discovery

Playbook discovery answers:

```text
"What approved strategies
could address this diagnosis?"
```

Example:

```text
Diagnosis:
Kubernetes CrashLoopBackOff

        ↓

Candidates:
PB-K8S-CRASHLOOP-001
PB-K8S-OOM-001
...
```

The discovery layer should not execute anything.

---

# 9. Applicability

A playbook existing does not mean it applies.

```text
Candidate Playbook
       │
       ▼
Applicability Check
       │
   ┌───┴───┐
   │       │
 VALID   INVALID
```

Checks may include:

```text
incident type
affected service
resource type
environment
required evidence
preconditions
```

---

# 10. Risk Analysis

Risk analysis asks:

```text
"If we execute this,
what could go wrong?"
```

Conceptually:

```text
Candidate
   ↓
Blast Radius
   ↓
Reversibility
   ↓
Production Impact
   ↓
Risk Classification
```

Possible result:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

---

# 11. Policy Eligibility

Policy answers:

```text
"Even if this action might work,
is AIRA permitted to perform it?"
```

Example:

```text
Restart one non-critical pod
      ↓
policy may allow

Drain production database node
      ↓
policy may require manual approval

Delete production resource
      ↓
policy may deny
```

---

# 12. Candidate Ranking

After unsafe candidates are removed:

```text
Candidate A
Candidate B
Candidate C
     │
     ▼
Ranking
     │
     ▼
best supported recovery option
```

Ranking can consider:

```text
confidence
risk
blast radius
past outcomes
playbook applicability
reversibility
```

---

# 13. Recovery Decision Critic

The critic creates another reasoning checkpoint.

```text
Decision Engine
      ↓
"Use playbook X"
      ↓
Decision Critic
      ↓
challenge reasoning
      ↓
ACCEPT / REJECT
```

This helps prevent one reasoning path from becoming unquestioned authority.

---

# 14. Playbook Plane

AIRA already maintains a structured Playbook/Runbook platform.

The existing root documentation describes a frozen deterministic execution layer in which the Playbook Execution Engine selects policy and stages, while the Runbook Execution Engine invokes registered deterministic action handlers. :contentReference[oaicite:3]{index=3}

## Playbook

```text
Incident Class
      ↓
Recovery Strategy
      ↓
Conditions
      ↓
Risk
      ↓
Approval
      ↓
Runbook
```

A playbook says:

> what recovery strategy applies.

---

# 15. Runbook Plane

A runbook says:

> how an approved recovery strategy is executed.

```text
Runbook
   │
   ├── Preconditions
   ├── Step 1
   ├── Step 2
   ├── Step 3
   ├── Verification
   └── Rollback
```

Example:

```text
RB-K8S-POD-RESTART
       │
       ▼
Check pod
       │
       ▼
Collect evidence
       │
       ▼
Restart pod
       │
       ▼
Wait
       │
       ▼
Check health
```

The current README also documents registered Kubernetes and wait handlers behind this execution layer. :contentReference[oaicite:4]{index=4}

---

# 16. Strategy vs Execution

This distinction is fundamental:

```text
AI Agent
   ↓
recommend playbook

Playbook
   ↓
describe strategy

Runbook
   ↓
describe exact approved operations

Executor
   ↓
perform deterministic operation
```

Therefore:

```text
AI
   ✗ does not invent arbitrary operational steps

AI
   ✓ selects from approved capabilities
```

---

# 17. Policy / Authorization Plane

This plane separates:

```text
Recommendation
```

from:

```text
Permission
```

Architecture:

```text
Recovery Decision
      ↓
Execution Request
      ↓
Execution Plan
      ↓
Policy Evaluation
      ↓
Approval Requirement
      ↓
Authorization Decision
      ↓
Persist Authorization
```

Only then can execution proceed.

---

# 18. Immutable Execution Plan

An approved recovery must not silently change after authorization.

AIRA therefore uses immutable execution identity.

```text
Execution Plan
      │
      ├── planId
      └── planHash
```

At execution time:

```text
Received Plan Hash
       │
       ▼
Persisted Plan Hash
       │
   ┌───┴────┐
   │        │
 MATCH    MISMATCH
   │        │
   ▼        ▼
 proceed   BLOCK
```

---

# 19. Execution Plane

Execution is the most safety-sensitive plane in AIRA.

## Flow

```text
Execution Job
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
Load Execution Request
     │
     ▼
Load Authorization
     │
     ▼
Validate Authorization
     │
     ▼
Validate Immutable Plan
     │
     ▼
Mark Running
     │
     ▼
Approved Executor
     │
     ▼
Infrastructure Mutation
     │
     ▼
Persist Result
```

---

# 20. Execution Safety Questions

Before mutation:

```text
Correct organization?
       ↓
Correct environment?
       ↓
Correct incident?
       ↓
Correct execution request?
       ↓
Correct authorization?
       ↓
Authorization actually granted?
       ↓
Critic accepted?
       ↓
Correct recovery decision?
       ↓
Correct playbook?
       ↓
Correct plan hash?
       ↓
Operation duplicate?
       ↓
Policy permits?
       ↓
EXECUTE
```

If any check fails:

```text
BLOCK
```

---

# 21. Verification Plane

The repository contains separate services for health verification, incident-state verification, log verification, metrics verification, evidence aggregation, decision, critic, persistence and outcome routing. :contentReference[oaicite:5]{index=5}

## Architecture

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
      Evidence Aggregator
             │
             ▼
       Evidence Package
             │
             ▼
        Decision Engine
             │
             ▼
             Critic
             │
             ▼
        Outcome Router
```

---

# 22. Why Verification Is Separate

Execution answers:

```text
"Did the operation run?"
```

Verification answers:

```text
"Did the operation solve the incident?"
```

These must not be treated as equivalent.

Example:

```text
restart pod succeeded
        ↓
pod starts
        ↓
dependency still unavailable
        ↓
incident NOT recovered
```

Verification catches this difference.

---

# 23. Lifecycle Plane

The lifecycle subsystem contains stability observation, closure eligibility, closure, regression handling, retry orchestration, rollback handoff, escalation, notifications, audit and persistence. :contentReference[oaicite:6]{index=6}

## Architecture

```text
Verification Outcome
        │
        ▼
Stability Observation
        │
    ┌───┴────┐
    │        │
 STABLE   REGRESSION
    │        │
    ▼        ▼
Closure   Route Recovery
             │
       ┌─────┼────────┐
       │     │        │
       ▼     ▼        ▼
     Retry Rollback Escalate
       │     │
       ▼     ▼
     HANDOFF HANDOFF
```

---

# 24. Stability Observation

AIRA does not close an incident after one successful check.

```text
Healthy once
    ↓
Observe
    ↓
Healthy again
    ↓
Observe
    ↓
Stable
    ↓
Close
```

The objective is to prevent premature recovery closure.

---

# 25. Retry / Rollback Handoffs

Lifecycle does not directly execute infrastructure operations.

```text
Lifecycle detects failure
       ↓
Retry needed
       ↓
Retry Handoff
       ↓
protected recovery boundary
```

Similarly:

```text
Rollback required
       ↓
Rollback Handoff
       ↓
protected execution/recovery boundary
```

This preserves execution safety.

---

# 26. Reliability Plane

The Reliability Plane protects distributed processing.

It contains two major mechanisms:

```text
11.1 — Idempotency
11.2 — Runtime Recovery
```

---

# 27. Idempotency Architecture

```text
Worker Job
   │
   ▼
Immutable Logical Identity
   │
   ▼
Idempotency Key
   │
   ▼
Atomic Record Claim
   │
 ┌─┴───────────────────────┐
 │                         │
NEW                     EXISTS
 │                         │
 ▼                  ┌──────┴──────┐
CLAIM               │             │
 │                RUNNING      COMPLETE
 ▼                  │             │
WORK               WAIT       RETURN OLD
 │                                RESULT
 ▼
COMPLETE
```

This prevents duplicate work from duplicate queue deliveries.

---

# 28. Worker Lease Architecture

```text
Worker A
   │
   ▼
Claim Operation
   │
   ├── owner=A
   ├── token=AAA
   └── leaseUntil=T
```

Worker A must maintain ownership while processing.

If it disappears:

```text
heartbeat stops
      ↓
lease expires
      ↓
operation becomes recoverable
```

---

# 29. Ownership Fencing

```text
Worker A
 token AAA
    │
    X crashes
    │
    ▼
lease expires
    │
    ▼
Worker B
 token BBB
    │
    ▼
new owner
```

If A returns:

```text
A submits token AAA
       ↓
record expects BBB
       ↓
REJECT
```

This prevents stale-owner corruption.

---

# 30. Runtime Recovery Plane

The repository now contains dedicated recovery-runtime contracts, checkpoint persistence, stale detection, resume-state resolution, a recovery coordinator and restart/crash tests. :contentReference[oaicite:7]{index=7}

## Architecture

```text
Worker
  │
  ▼
Checkpoint
  │
  ▼
PROCESSING
  │
  X crash
  │
  ▼
lease expires
  │
  ▼
AIRA restart
  │
  ▼
StaleOperationDetector
  │
  ▼
RuntimeRecoveryCoordinator
  │
  ▼
RuntimeResumeStateResolver
  │
  ▼
Recovery Plan
```

---

# 31. Runtime Checkpoint States

Conceptually:

```text
PENDING
   ↓
PROCESSING
   ↓
 ┌─┴────────────────┐
 │                  │
COMPLETED          FAILED
                    │
                    ▼
               retry / block
```

A process crash can leave:

```text
PROCESSING
   ↓
lease expired
   ↓
ABANDONED
```

---

# 32. Safe Resume Rules

AIRA deliberately does not use the same replay rule for every stage.

```text
Recovery Decision
       ↓
safe computation
       ↓
RESUME
```

```text
Verification
       ↓
observational work
       ↓
RESUME
```

```text
Lifecycle
       ↓
controlled orchestration
       ↓
RESUME
```

Execution:

```text
Execution
    ↓
external mutation boundary
    ↓
crash
    ↓
outcome uncertain
    ↓
DO NOT REPLAY
```

---

# 33. Execution Reconciliation Boundary

Consider:

```text
Execution Worker
       ↓
send restart request
       ↓
infrastructure accepts it
       ↓
worker crashes
```

After restart, AIRA cannot safely infer:

```text
mutation did not happen
```

Therefore:

```text
Execution checkpoint stale
        ↓
ABANDONED
        ↓
REQUIRES_RECONCILIATION
        ↓
MANUAL_INTERVENTION
```

This is one of AIRA's strongest runtime safety invariants.

---

# 34. Observability Plane

The repository contains dedicated action audit, general audit, decision-pipeline observability, Prometheus metrics and structured logging services. :contentReference[oaicite:8]{index=8}

## Architecture

```text
Every Important Decision
       │
       ├──────────┬──────────┐
       ▼          ▼          ▼
     Logs       Metrics     Audit
       │          │          │
       └──────────┼──────────┘
                  ▼
            Decision Trace
```

The aim is to answer:

```text
What happened?

Why?

What evidence was used?

What decision was made?

Was it allowed?

What action occurred?

Did recovery work?

Who owned the operation?
```

---

# 35. Learning Plane

The repository also contains learning-related services such as feedback, incident learning, memory, risk simulation and confidence optimization. :contentReference[oaicite:9]{index=9}

## Architecture

```text
Incident
   ↓
Decision
   ↓
Recovery
   ↓
Verification
   ↓
Outcome
   ↓
Feedback
   ↓
Memory
   ↓
Historical Intelligence
   ↓
Future Reasoning
```

Learning is constrained.

```text
Learning
   ✗ does not automatically alter policy
   ✗ does not create new infrastructure authority

Learning
   ✓ can improve ranking
   ✓ can improve confidence
   ✓ can improve historical comparison
   ✓ can improve recommendations
```

---

# 36. Authentication Plane

AIRA has separate human and machine authentication paths.

The current project documentation describes cookie-backed session auth for browser users and HMAC-based authentication for machine/API clients. :contentReference[oaicite:10]{index=10}

## Human

```text
Email + Password
      ↓
Argon2id
      ↓
Server Session
      ↓
HttpOnly Cookie
      ↓
CSRF Protection
```

## Machine

```text
Tenant ID
Key ID
Timestamp
Request
      ↓
HMAC Signature
      ↓
Replay Validation
      ↓
Tenant Context
```

---

# 37. Multi-Tenant Boundary

Tenant context must follow the operation through the entire pipeline.

```text
Organization
     +
Environment
     │
     ▼
Signal
     ↓
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
```

AIRA must never accidentally turn:

```text
Org A incident
```

into:

```text
Org B mutation
```

Tenant identity is therefore part of safety-sensitive lookup and idempotency identities.

---

# 38. Worker Architecture

Critical recovery stages are separated into workers.

```text
RecoveryDecisionWorker
          │
          ▼
ExecutionWorker
          │
          ▼
VerificationWorker
          │
          ▼
LifecycleWorker
```

Runtime recovery is handled separately:

```text
RuntimeRecoveryWorker
        ↓
resumes only allowed stages
```

This avoids one giant worker having unrestricted control over the entire incident lifecycle.

---

# 39. Current Critical Worker Flow

```text
RecoveryDecisionWorker
   │
   ├── checkpoint
   ├── idempotency
   └── recovery reasoning
   │
   ▼
ExecutionWorker
   │
   ├── checkpoint
   ├── idempotency
   ├── authorization
   ├── immutable plan
   └── executor
   │
   ▼
VerificationWorker
   │
   ├── checkpoint
   ├── idempotency
   └── observational verification
   │
   ▼
LifecycleWorker
   │
   ├── checkpoint
   ├── idempotency
   └── controlled state transition
```

---

# 40. Trust Boundaries

AIRA contains multiple trust boundaries rather than one.

```text
UNTRUSTED SIGNAL DATA
        │
════════╪════════
        ▼
SIGNAL VALIDATION

AI REASONING
        │
════════╪════════
        ▼
STRUCTURED CONTRACT

RECOVERY RECOMMENDATION
        │
════════╪════════
        ▼
POLICY / APPROVAL

AUTHORIZED PLAN
        │
════════╪════════
        ▼
EXECUTION WORKER

INFRASTRUCTURE RESULT
        │
════════╪════════
        ▼
VERIFICATION
```

Each boundary reduces the authority of upstream uncertainty.

---

# 41. Failure Philosophy

AIRA follows:

```text
KNOWN SAFE
    ↓
continue
```

```text
KNOWN UNSAFE
    ↓
block
```

```text
UNKNOWN
    ↓
fail closed
```

Never:

```text
UNKNOWN
    ↓
probably safe
    ↓
production mutation
```

---

# 42. Example Incident: CrashLoopBackOff

This is how the architecture fits together.

```text
Prometheus / Kubernetes Alert
          │
          ▼
Signal Pipeline
          │
          ▼
Incident:
CrashLoopBackOff
          │
          ▼
Agent Investigation
          │
          ├── logs
          ├── pod state
          ├── recent deploy
          └── topology
          │
          ▼
Diagnosis
          │
          ▼
Playbook Discovery
          │
          ▼
PB-K8S-CRASHLOOP-001
          │
          ▼
Applicability
          │
          ▼
Risk
          │
          ▼
Policy
          │
          ▼
Approval if required
          │
          ▼
Execution Authorization
          │
          ▼
RB-K8S-POD-RESTART
          │
          ▼
Execution Worker
          │
          ▼
Kubernetes Mutation
          │
          ▼
Verification
          │
          ├── pod health
          ├── metrics
          ├── logs
          └── incident state
          │
          ▼
Recovered?
     ┌────┴─────┐
     │          │
    YES         NO
     │          │
     ▼          ▼
 Stability   Retry/Rollback/
 Window       Escalation
     │
     ▼
   Close
```

---

# 43. Example Crash During Verification

```text
Execution completed
      ↓
Verification starts
      ↓
Runtime checkpoint = PROCESSING
      ↓
AIRA crashes
      ↓
lease expires
      ↓
AIRA restarts
      ↓
stale detector
      ↓
verification checkpoint abandoned
      ↓
resume resolver
      ↓
SAFE
      ↓
VerificationWorker
      ↓
idempotency
      ↓
verification resumes
```

No infrastructure mutation is repeated.

---

# 44. Example Crash During Execution

```text
Execution starts
      ↓
Runtime checkpoint = PROCESSING
      ↓
request sent to infrastructure
      ↓
AIRA crashes
      ↓
outcome uncertain
      ↓
AIRA restarts
      ↓
stale detector
      ↓
execution checkpoint abandoned
      ↓
resume resolver
      ↓
REQUIRES_RECONCILIATION
      ↓
MANUAL_INTERVENTION
```

No automatic execution replay occurs.

---

# 45. Current Repository Mapping

```text
backend/
│
├── agents/
│   └── v2/
│       ├── agents/
│       ├── runtime/
│       ├── contracts/
│       └── tools/
│
├── models/
│   ├── Incident
│   ├── IncidentDiagnosis
│   ├── RecoveryDecision
│   ├── ExecutionRequest
│   ├── ExecutionAuthorization
│   ├── RecoveryVerification
│   ├── IncidentLifecycle
│   ├── IdempotencyRecord
│   └── RuntimeRecoveryCheckpoint
│
├── services/
│   ├── signals/
│   ├── recovery/
│   ├── execution/
│   ├── verification/
│   ├── lifecycle/
│   ├── idempotency/
│   ├── recoveryRuntime/
│   ├── observability/
│   ├── learning/
│   └── playbooks/
│
└── workers/
    ├── recoveryDecisionWorker.js
    ├── executionWorker.js
    ├── verificationWorker.js
    ├── lifecycleWorker.js
    └── runtimeRecoveryWorker.js
```

---

# 46. Architecture Summary

The easiest way to remember AIRA is:

```text
OBSERVE
   ↓
UNDERSTAND
   ↓
DIAGNOSE
   ↓
PLAN
   ↓
CHECK SAFETY
   ↓
AUTHORIZE
   ↓
EXECUTE
   ↓
VERIFY
   ↓
OBSERVE STABILITY
   ↓
CLOSE / RECOVER FURTHER
```

And underneath every critical stage:

```text
AUDIT
+
IDEMPOTENCY
+
OWNERSHIP
+
FAIL-CLOSED SAFETY
```

---

# 47. Final Architecture Principle

AIRA's architecture deliberately prevents any one component from owning the entire decision chain.

```text
Agent
  ↓
cannot execute

Recovery Decision
  ↓
cannot authorize itself

Authorization
  ↓
cannot change the plan

Execution
  ↓
cannot prove recovery

Verification
  ↓
cannot mutate infrastructure

Lifecycle
  ↓
cannot directly perform rollback/retry

Runtime Recovery
  ↓
cannot manufacture execution authority
```

This separation is the foundation of AIRA's safety model.

> **AIRA is not one autonomous agent.**
>
> It is a controlled incident-recovery system in which intelligence, policy, execution, verification, lifecycle management and distributed reliability operate behind explicit trust boundaries.