# AIRA — Autonomous Incident Recovery Agent

> **Policy-driven, AI-assisted, deterministic incident recovery for production infrastructure.**

AIRA observes operational signals, investigates incidents, reasons about likely causes, selects approved recovery strategies, executes only policy-authorized deterministic actions, verifies whether recovery actually worked, and manages the incident until closure, retry, rollback, or escalation.

> **Core safety principle**
>
> AI in AIRA does **not** receive unrestricted infrastructure execution authority.
>
> AI reasons.  
> Policies constrain.  
> Playbooks define strategy.  
> Runbooks define deterministic actions.  
> Authorization grants permission.  
> The execution boundary performs approved mutations.  
> Verification proves whether recovery worked.

---

## Live Project

**Frontend:**  
https://autonomous-incident-recovery-agent-ten.vercel.app

**Backend:**  
https://autonomous-incident-recovery-agent-aira-system-production.up.railway.app

**Repository:**  
https://github.com/JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system

---

# Why AIRA Exists

Modern production incidents rarely fail because teams have no monitoring.

They fail because monitoring produces information faster than humans can correlate, reason about, validate, and safely act upon.

A typical incident looks like:

```text
Alert
  ↓
another alert
  ↓
20 related alerts
  ↓
engineer checks metrics
  ↓
engineer checks logs
  ↓
engineer checks deployment history
  ↓
engineer forms hypothesis
  ↓
engineer searches runbook
  ↓
engineer evaluates risk
  ↓
engineer executes recovery
  ↓
engineer checks whether it worked

AIRA turns that into a controlled recovery pipeline:

Operational Signals
        │
        ▼
Signal Processing
        │
        ▼
Incident
        │
        ▼
AI Investigation
        │
        ▼
Diagnosis
        │
        ▼
Recovery Decision
        │
        ▼
Policy + Risk + Approval
        │
        ▼
Authorized Execution
        │
        ▼
Verification
        │
        ▼
Lifecycle Management
        │
        ▼
Close / Retry / Rollback / Escalate

The goal is not to replace reliability engineering with an LLM.

The goal is to automate the repetitive reasoning and operational workflow while keeping infrastructure mutations behind deterministic, policy-controlled safety boundaries.

System Architecture

┌──────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER INFRASTRUCTURE                      │
│                                                                      │
│   Kubernetes │ APIs │ Databases │ Queues │ Cloud │ Services │ CI/CD │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                │ telemetry / alerts / state
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         OBSERVABILITY LAYER                          │
│                                                                      │
│ Prometheus │ Grafana │ Datadog │ CloudWatch │ OpenTelemetry │ K8s   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           SIGNAL PIPELINE                            │
│                                                                      │
│  Ingest                                                              │
│    ↓                                                                 │
│  Normalize                                                           │
│    ↓                                                                 │
│  Deduplicate                                                         │
│    ↓                                                                 │
│  Enrich                                                              │
│    ↓                                                                 │
│  Correlate                                                           │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
                           ┌──────────┐
                           │ INCIDENT │
                           └────┬─────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        AI INVESTIGATION LAYER                        │
│                                                                      │
│ Symptom Analysis                                                     │
│       ↓                                                              │
│ Correlation                                                          │
│       ↓                                                              │
│ Investigation                                                        │
│       ↓                                                              │
│ Topology Analysis                                                    │
│       ↓                                                              │
│ Change Analysis                                                      │
│       ↓                                                              │
│ Historical Analysis                                                  │
│       ↓                                                              │
│ Root-Cause Hypothesis                                                │
│       ↓                                                              │
│ Diagnosis                                                            │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
                            DIAGNOSIS
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      RECOVERY INTELLIGENCE                           │
│                                                                      │
│ Playbook Discovery                                                   │
│       ↓                                                              │
│ Applicability                                                        │
│       ↓                                                              │
│ Risk / Impact Analysis                                               │
│       ↓                                                              │
│ Policy Eligibility                                                   │
│       ↓                                                              │
│ Candidate Ranking                                                    │
│       ↓                                                              │
│ Recovery Decision                                                    │
│       ↓                                                              │
│ Decision Critic                                                      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
                       RECOVERY DECISION
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     POLICY + SAFETY BOUNDARY                         │
│                                                                      │
│ Policy Rules → Risk → Approval Requirement → Authorization           │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                   ┌────────────┴────────────┐
                   │                         │
                BLOCKED                  AUTHORIZED
                   │                         │
                   ▼                         ▼
               ESCALATE              EXECUTION REQUEST
                                             │
                                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         EXECUTION BOUNDARY                           │
│                                                                      │
│ Runtime Checkpoint                                                   │
│       ↓                                                              │
│ Idempotency                                                          │
│       ↓                                                              │
│ Authorization Revalidation                                           │
│       ↓                                                              │
│ Immutable Plan Validation                                            │
│       ↓                                                              │
│ Approved Playbook / Runbook                                          │
│       ↓                                                              │
│ Deterministic Executor                                               │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
                      INFRASTRUCTURE MUTATION
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         VERIFICATION                                 │
│                                                                      │
│ Health ─────┐                                                        │
│ Metrics ────┤                                                        │
│ Logs ───────┼──→ Evidence Aggregation                                │
│ State ──────┘             ↓                                          │
│                    Verification Decision                             │
│                            ↓                                         │
│                         Critic                                       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      INCIDENT LIFECYCLE                              │
│                                                                      │
│ Stability Observation                                                │
│        ↓                                                             │
│ Closure Eligibility                                                  │
│        │                                                             │
│   ┌────┴───────────────┬─────────────────┐                           │
│   ▼                    ▼                 ▼                           │
│ CLOSE              RETRY HANDOFF    ROLLBACK HANDOFF                 │
│                                           │                          │
│                                           ▼                          │
│                                       ESCALATION                     │
└──────────────────────────────────────────────────────────────────────┘


What Each Layer Does
1. Signal Pipeline

The signal layer converts noisy operational telemetry into structured incident evidence.

External Alert
     │
     ▼
Signal Ingestion
     │
     │ accepts external operational information
     ▼
Normalization
     │
     │ converts provider-specific formats
     ▼
Deduplication
     │
     │ removes repeated copies of the same signal
     ▼
Enrichment
     │
     │ adds service / resource / tenant context
     ▼
Correlation
     │
     │ determines which signals belong together
     ▼
Incident
Why it matters

Without this layer:

100 alerts
   ↓
100 apparent problems

With correlation:

100 alerts
   ↓
7 related signal groups
   ↓
1 underlying incident
AI Investigation System

AIRA uses specialized agents instead of asking one model to perform the entire incident workflow.

Incident
   │
   ▼
Symptom Analysis
   │
   ▼
"What is visibly failing?"
   │
   ▼
Correlation Analysis
   │
   ▼
"What evidence is connected?"
   │
   ▼
Investigation
   │
   ▼
"What additional evidence do we need?"
   │
   ▼
Topology Analysis
   │
   ▼
"What depends on the affected resource?"
   │
   ▼
Change Analysis
   │
   ▼
"What changed before the incident?"
   │
   ▼
Historical Analysis
   │
   ▼
"Has this happened before?"
   │
   ▼
Root-Cause Hypothesis
   │
   ▼
"What could explain all evidence?"
   │
   ▼
Diagnosis
   │
   ▼
"What is the most defensible diagnosis?"

Additional agents support recovery planning, risk evaluation, verification criticism, explanation, learning and post-recovery monitoring.

AI responsibilities

AI is allowed to:

Analyze evidence
      ↓
Form hypotheses
      ↓
Estimate confidence
      ↓
Rank recovery candidates
      ↓
Explain decisions

AI is not allowed to:

Invent arbitrary infrastructure commands
      ↓
Bypass policy
      ↓
Bypass authorization
      ↓
Grant itself execution authority
      ↓
Silently modify safety policy
Playbooks vs Runbooks

AIRA separates strategy from execution instructions.

                       PLAYBOOK
              "How should this type of
                  incident be handled?"
                         │
          ┌──────────────┼───────────────┐
          │              │               │
          ▼              ▼               ▼
      Preconditions     Risk         Recovery Path
                                           │
                                           ▼
                                        RUNBOOK
                                "What exact approved
                                  steps are available?"
                                           │
                      ┌────────────────────┼──────────────────┐
                      ▼                    ▼                  ▼
                   Step 1               Step 2             Step 3
                  inspect               mutate              verify
Playbook

A playbook describes the recovery strategy:

when it applies;
risk level;
required approvals;
candidate runbooks;
recovery/rollback behavior;
verification expectations.
Runbook

A runbook contains exact deterministic operational steps.

Example:

Runbook: Kubernetes Pod Restart


Check pod exists
      ↓
Collect current state
      ↓
Restart approved pod
      ↓
Wait for readiness
      ↓
Verify health
Why this separation matters
AI recommendation
      ≠
raw infrastructure command

Instead:

AI recommendation
      ↓
approved playbook
      ↓
approved runbook
      ↓
policy
      ↓
authorization
      ↓
deterministic executor
Recovery Decision Pipeline

AIRA does not jump directly from diagnosis to execution.

Diagnosis
   │
   ▼
Playbook Discovery
   │
   ▼
Candidate Playbooks
   │
   ▼
Applicability Check
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
Recovery Decision Engine
   │
   ▼
Recovery Decision Critic
   │
   ├── rejected ──→ fallback / escalation
   │
   ▼
Persist Decision
Components

Playbook discovery

Diagnosis
   ↓
"What approved recovery strategies exist?"

Applicability

Candidate
   ↓
"Can this actually be used here?"

Risk analysis

Action
   ↓
"What is the blast radius and failure risk?"

Policy eligibility

Action
   ↓
"Is AIRA permitted to do this?"

Candidate ranking

Safe candidates
   ↓
"Which option is best?"

Decision critic

Proposed decision
   ↓
"Is there a reason this should NOT proceed?"
Execution Safety Model

Execution is intentionally separated from reasoning.

Recovery Decision
       │
       ▼
Execution Request
       │
       ▼
Immutable Execution Plan
       │
       ├── planId
       └── planHash
       │
       ▼
Policy
       │
       ▼
Approval
       │
       ▼
Execution Authorization
       │
       ▼
Execution Worker
       │
       ▼
Runtime Checkpoint
       │
       ▼
Idempotency
       │
       ▼
Reload persisted request
       │
       ▼
Reload persisted authorization
       │
       ▼
Revalidate authorization
       │
       ▼
Revalidate immutable plan
       │
       ▼
Approved Executor
       │
       ▼
Infrastructure

Before mutation, AIRA effectively asks:

Correct organization?
       ↓
Correct environment?
       ↓
Correct incident?
       ↓
Correct execution request?
       ↓
Correct recovery decision?
       ↓
Correct approved playbook?
       ↓
Correct immutable plan hash?
       ↓
Policy allows it?
       ↓
Required approval exists?
       ↓
Authorization is valid?
       ↓
Operation is not a duplicate?
       ↓
EXECUTE
Idempotent Distributed Processing

Queue-based systems can deliver the same logical operation more than once.

Without protection:

Execution Message
      ↓
restart pod
      ↓
queue redelivery
      ↓
restart pod again
      ↓
potential recovery amplification

AIRA uses deterministic idempotency identities.

Worker receives operation
        │
        ▼
Construct logical identity
        │
        ▼
Generate idempotency key
        │
        ▼
Atomic claim
        │
 ┌──────┼───────────────┐
 │      │               │
 ▼      ▼               ▼
NEW   PROCESSING      COMPLETED
 │      │               │
 ▼      ▼               ▼
CLAIM  DO NOT          RETURN
 │     DUPLICATE      PREVIOUS
 ▼                    RESULT
WORK
 │
 ▼
COMPLETE

This protects recovery decision, execution, verification and lifecycle processing.

Worker Ownership and Leases

Distributed workers may crash while owning work.

AIRA therefore uses leases and claim tokens.

Worker A
   │
   ├── claimToken = AAA
   ▼
PROCESSING
   │
   X crashes
   │
   ▼
lease expires
   │
   ▼
Worker B
   │
   ├── claimToken = BBB
   ▼
RECLAIMED

If Worker A somehow returns later:

Worker A
   │
   ▼
tries token AAA
   │
   ▼
current token = BBB
   │
   ▼
REJECT UPDATE

A stale process cannot overwrite the new owner's result.

Crash-Safe Runtime Recovery

AIRA maintains durable runtime recovery checkpoints for critical stages.

Worker
   │
   ▼
Checkpoint
   │
   ▼
CLAIM
   │
   ▼
PROCESSING
   │
   ├── heartbeat
   │
   ▼
WORK
   │
   ▼
COMPLETED

If the process dies:

PROCESSING
    │
    X
process dies
    │
    ▼
heartbeat stops
    │
    ▼
lease expires
    │
    ▼
AIRA restart
    │
    ▼
Stale Operation Detector
    │
    ▼
Recovery Coordinator
    │
    ▼
Resume-State Resolver

The resolver deliberately distinguishes safe computational/observational work from uncertain external mutations.

                    CRASHED STAGE
                         │
        ┌────────────────┼─────────────────┐
        │                │                 │
 Recovery Decision   Verification      Lifecycle
        │                │                 │
        ▼                ▼                 ▼
      SAFE             SAFE              SAFE
        │                │                 │
        └────────────────┼─────────────────┘
                         ▼
                       RESUME
                         │
                         ▼
                    Idempotency
                         │
                         ▼
                 Protected Worker

Execution is different:

EXECUTION
    │
    X process dies
    │
    ▼
Did infrastructure mutation happen?
    │
    ▼
UNKNOWN
    │
    ▼
DO NOT REPLAY
    │
    ▼
REQUIRES_RECONCILIATION
    │
    ▼
MANUAL INTERVENTION

This prevents a restart from accidentally repeating an external infrastructure mutation.

Verification: Execution Is Not Recovery

A successful command does not prove the incident is resolved.

Execution
    ↓
"Command succeeded"

is different from:

Verification
    ↓
"System recovered"

AIRA therefore performs post-execution verification.

Execution Result
      │
      ▼
Verification Plan
      │
 ┌────┼─────┬─────────────┐
 │    │     │             │
 ▼    ▼     ▼             ▼
Health Metrics Logs   Incident State
 │    │     │             │
 └────┴─────┴─────────────┘
             │
             ▼
      Evidence Aggregator
             │
             ▼
       Evidence Package
             │
             ▼
      Verification Decision
             │
             ▼
       Verification Critic
             │
             ▼
        Outcome Router
Incident Lifecycle

AIRA does not immediately close an incident after one good verification result.

Verification says recovered
            │
            ▼
     Stability Observation
            │
            ▼
    Continue watching system
            │
       ┌────┴─────┐
       │          │
     STABLE     REGRESSION
       │          │
       ▼          ▼
    Closure    Reopen / Retry /
               Rollback / Escalate

Why?

one healthy response
        ≠
stable recovery

Lifecycle management provides:

stability observation;
closure eligibility;
incident closure;
regression detection;
retry handoff;
rollback handoff;
escalation;
audit;
notification;
persistent lifecycle transitions.
AI and Deterministic Trust Boundary

One of AIRA's most important architectural boundaries is:

             NON-DETERMINISTIC INTELLIGENCE
                         │
                         ▼
                    AI Agents
                         │
              analyze / reason / rank
                         │
                         ▼
                Structured Decision
                         │
══════════════════ TRUST BOUNDARY ══════════════════
                         │
                         ▼
                Deterministic Systems
                         │
       ┌─────────────────┼────────────────┐
       ▼                 ▼                ▼
     Policy           Playbook          Runbook
       │                 │                │
       └─────────────────┼────────────────┘
                         ▼
                  Authorization
                         │
                         ▼
                 Execution Engine
                         │
                         ▼
                  Infrastructure

AI can influence what is recommended.

AI cannot independently decide what is permitted to mutate.

Safety Principles

AIRA follows a fail-closed model.

UNCERTAIN
   ↓
DO NOT GUESS
   ↓
BLOCK / ESCALATE

Major invariants include:

AI never receives unrestricted infrastructure access.
Unknown execution authorization fails closed.
Unknown plan identity fails closed.
Policy denial cannot be bypassed.
High-risk actions can require human approval.
Duplicate execution is blocked by idempotency.
Stale workers cannot overwrite current owners.
Interrupted infrastructure execution is never blindly replayed.
Verification cannot start new infrastructure execution.
Lifecycle retry and rollback are controlled handoffs, not direct mutations.
Learning cannot silently modify execution policy.
Tenant and environment boundaries are preserved throughout the pipeline.
Operational decisions are recorded for auditing.
Observability and Auditability

AIRA records more than the final outcome.

Decision
   │
   ├─────────────┐
   ▼             ▼
Structured     Metrics
Logging
   │             │
   └──────┬──────┘
          ▼
      Audit Events
          │
          ▼
     Decision Trace
          │
          ▼
"Why did AIRA make this decision?"

The system includes:

structured logging;
Prometheus-compatible metrics;
action audit records;
decision traces;
execution history;
verification evidence;
lifecycle transitions;
agent intelligence traces.
Learning Loop

AIRA can use previous incidents and outcomes to improve future reasoning.

Incident
   ↓
Diagnosis
   ↓
Recovery
   ↓
Verification
   ↓
Outcome
   ↓
Feedback
   ↓
Incident Memory
   ↓
Historical Intelligence
   ↓
Future Investigation

Learning is deliberately constrained.

Learning
   ≠
automatically rewriting safety policy


Learning
   ≠
inventing executable infrastructure actions


Learning
   =
better evidence
better historical comparison
better confidence
better candidate ranking
better recommendations
Authentication and Multi-Tenant Security

AIRA maintains separate authentication paths for humans and machine clients.

Human / Browser Authentication
User
 ↓
Register / Login
 ↓
Argon2id Password Verification
 ↓
Server-side Session
 ↓
HttpOnly Cookie
 ↓
CSRF Protection
 ↓
Authenticated AIRA UI/API
Machine Authentication
Machine Client
      ↓
Tenant ID + Key ID + Timestamp
      ↓
HMAC Signature
      ↓
Replay Window Validation
      ↓
Tenant Context
      ↓
Authorized API

Tenant-isolation and environment-context middleware prevent cross-organization or cross-environment operations.

Current Major Components
backend/
│
├── agents/v2/
│   ├── agents/              AI investigation/reasoning specialists
│   ├── runtime/             Agent orchestration + reasoning provider
│   ├── contracts/           Structured agent contracts/confidence
│   ├── tools/               Read-oriented investigation tools
│   └── tests/
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
│   ├── RuntimeRecoveryCheckpoint
│   ├── Playbook
│   ├── Runbook
│   ├── DecisionTrace
│   └── AuditEvent
│
├── services/
│   ├── signals/             Signal processing
│   ├── recovery/            Recovery-decision pipeline
│   ├── execution/           Authorization/execution services
│   ├── verification/        Post-execution verification
│   ├── lifecycle/           Stability/closure/retry/rollback
│   ├── idempotency/         Distributed duplicate protection
│   ├── recoveryRuntime/     Crash/restart recovery
│   ├── observability/       Metrics/logging/audit
│   ├── playbooks/
│   └── learning/
│
├── workers/
│   ├── recoveryDecisionWorker.js
│   ├── executionWorker.js
│   ├── verificationWorker.js
│   ├── lifecycleWorker.js
│   └── runtimeRecoveryWorker.js
│
├── controllers/
├── middleware/
├── routes/
└── tests/
Frontend

The frontend provides operational visibility into AIRA's decisions and state.

React UI
   │
   ├── Dashboard
   ├── Incidents
   ├── Agent Intelligence
   ├── Services
   ├── Integrations
   ├── Monitors
   ├── Policies
   ├── Approvals
   ├── Runbooks
   ├── Verification
   ├── Safety
   └── Audit / Analytics

The React frontend uses typed API hooks for incidents, integrations, approvals, decisions, policies, runbooks, verification, monitoring, analytics and agent intelligence.

Technology Stack
Layer	Technology
Backend	Node.js 20, Express
Language	JavaScript/CommonJS backend
Frontend	React 18, TypeScript, Vite
Database	MongoDB + Mongoose
Queue / async architecture	RabbitMQ-based worker flows
Cache / coordination	Redis where configured
Authentication	Argon2id, server sessions, HMAC machine auth
Infrastructure	Docker, Kubernetes
Observability	Prometheus-style metrics, structured logging
Testing	Jest, Supertest, MongoDB memory testing
Deployment	Railway backend, Vercel frontend
Local Development
Backend
cd backend
cp .env.example .env
npm install
npm start

Default development backend:

http://localhost:5000

Typical backend environment variables:

MONGODB_URI=
SESSION_SECRET=
CORS_ORIGINS=http://localhost:5173
NODE_ENV=development
Frontend
cd frontend
cp .env.example .env
npm install
npm run dev

Set:

VITE_API_URL=http://localhost:5000

Default frontend:

http://localhost:5173
Running Tests

Run the full backend test suite:

cd backend
npx jest --runInBand

Critical recovery pipeline:

npx jest \
  services/recovery \
  services/execution \
  services/verification \
  services/lifecycle \
  services/idempotency \
  services/recoveryRuntime \
  --runInBand

Runtime crash-recovery tests cover:

Checkpoint persistence
        ↓
Lease ownership
        ↓
Stale detection
        ↓
Resume-state resolution
        ↓
Recovery coordination
        ↓
Crash simulation
        ↓
Restart/resume E2E
        ↓
Execution replay prohibition
Deployment
Backend

Hosted on Railway.

Production configuration should include at minimum:

NODE_ENV=production
MONGODB_URI=
SESSION_SECRET=
CORS_ORIGINS=
Frontend

Hosted on Vercel.

VITE_API_URL=<Railway backend URL>
Engineering Evolution

AIRA has evolved in layers rather than being built as one large autonomous agent.

Foundation
    ↓
Authentication + Tenant Isolation
    ↓
Signals + Monitoring
    ↓
Infrastructure Understanding
    ↓
AI Investigation
    ↓
Diagnosis
    ↓
Playbooks + Runbooks
    ↓
Recovery Decision
    ↓
Controlled Execution
    ↓
Post-Execution Verification
    ↓
Incident Lifecycle
    ↓
Distributed Idempotency
    ↓
Crash-Safe Runtime Recovery
    ↓
Production Reliability Hardening

Later phases exist because earlier capabilities expose new reliability problems.

Example:

AIRA can execute recovery
        ↓
But command success does not prove recovery
        ↓
Verification becomes necessary

Then:

Verification exists
        ↓
But recovery needs stability observation and closure
        ↓
Lifecycle becomes necessary

Then:

Full pipeline exists
        ↓
But queue delivery can duplicate work
        ↓
Idempotency becomes necessary

Then:

Idempotency exists
        ↓
But a worker may crash midway
        ↓
Runtime crash recovery becomes necessary

This incremental architecture is intentional.

Documentation

Detailed engineering documentation lives under:

docs/
│
├── architecture/
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── AGENT_ARCHITECTURE.md
│   ├── RECOVERY_PIPELINE.md
│   ├── EXECUTION_SAFETY.md
│   ├── CRASH_RECOVERY.md
│   └── SAFETY_MODEL.md
│
├── phases/
│   ├── PHASE_01.md
│   ├── PHASE_02.md
│   ├── PHASE_03.md
│   ├── ...
│   ├── PHASE_10.md
│   └── PHASE_11.md
│
├── PHASE_HISTORY.md
└── CURRENT_STATUS.md
Design Philosophy

AIRA follows one central philosophy:

             INTELLIGENCE
                  │
                  ▼
         Understand the problem
                  │
                  ▼
          Recommend an action
                  │
                  ▼
             SAFETY GATE
                  │
                  ▼
           Prove permission
                  │
                  ▼
           EXECUTION GATE
                  │
                  ▼
        Perform deterministic work
                  │
                  ▼
            VERIFICATION
                  │
                  ▼
          Prove recovery worked

The objective is not maximum autonomy.

The objective is:

the maximum safe autonomy that can be justified by evidence, policy, deterministic controls, and verifiable outcomes.

Current Development Direction

The current reliability work is strengthening the distributed execution model around:

worker ownership;
durable checkpoints;
crash recovery;
safe replay rules;
message ordering;
duplicate protection;
recovery reconciliation;
execution safety;
distributed coordination.

The next architecture layers continue toward production-grade autonomous incident recovery while maintaining the core rule:

When AIRA cannot prove an operation is safe, it must stop rather than guess.

Author

J Suhas

AIRA — Autonomous Incident Recovery Agent



---

### The docs I recommend creating next




```text
README.md                                  ← THIS ONE


docs/PHASE_HISTORY.md                      ← Phase 1 → current evolution
docs/CURRENT_STATUS.md                     ← what is actually finished today


docs/architecture/SYSTEM_ARCHITECTURE.md   ← complete internal architecture
docs/architecture/AGENT_ARCHITECTURE.md    ← every agent + what it does
docs/architecture/RECOVERY_PIPELINE.md     ← diagnosis → recovery → execution
docs/architecture/PLAYBOOK_RUNBOOK.md      ← strategy vs deterministic steps
docs/architecture/EXECUTION_SAFETY.md      ← authorization + immutable plans
docs/architecture/VERIFICATION.md          ← proof of recovery
docs/architecture/LIFECYCLE.md             ← closure/retry/rollback
docs/architecture/IDEMPOTENCY.md           ← Phase 11.1
docs/architecture/CRASH_RECOVERY.md        ← Phase 11.2
docs/architecture/SAFETY_MODEL.md           ← all fail-closed invariants


docs/phases/PHASE_01.md
...
docs/phases/PHASE_11.md