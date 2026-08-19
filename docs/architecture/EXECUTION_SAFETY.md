# AIRA Execution Safety Architecture

> **How AIRA converts an approved recovery decision into a deterministic infrastructure action without allowing AI reasoning, duplicate delivery, stale workers, plan mutation, or runtime crashes to bypass safety controls.**

---

# 1. Purpose

Execution is the highest-risk boundary in AIRA.

Before execution, AIRA is primarily:

```text
observing
reasoning
ranking
planning
authorizing
```

At execution:

```text
AIRA
  ↓
changes real infrastructure
```

Examples include:

```text
restart pod
restart deployment
scale deployment
rollback release
fail over service
restart database component
modify cloud resource
```

A mistake before this boundary may create a bad recommendation.

A mistake after this boundary may create a production outage.

Therefore execution is deliberately protected by multiple independent controls.

---

# 2. Core Execution Principle

AIRA does not use:

```text
AI Recommendation
       ↓
Execute
```

Instead:

```text
AI Recommendation
       ↓
Recovery Decision
       ↓
Decision Critic
       ↓
Execution Request
       ↓
Immutable Execution Plan
       ↓
Policy
       ↓
Approval
       ↓
Persisted Authorization
       ↓
Runtime Ownership
       ↓
Idempotency
       ↓
Authorization Revalidation
       ↓
Plan Revalidation
       ↓
Deterministic Executor
       ↓
Infrastructure
```

Every stage removes another class of unsafe behavior.

---

# 3. The Four Different Meanings of "AIRA Wants to Act"

These concepts must never be treated as equivalent.

## Recommendation

```text
"This recovery appears appropriate."
```

Produced by reasoning/recovery systems.

It creates no authority.

---

## Policy Permission

```text
"This type of action is permitted
under these conditions."
```

Produced by deterministic policy.

It still does not mean execution should happen immediately.

---

## Authorization

```text
"This exact execution request
and exact execution plan
are authorized."
```

Authorization is tied to persisted identity.

---

## Execution

```text
"Perform the exact authorized operation."
```

Only the execution subsystem crosses the mutation boundary.

Therefore:

```text
RECOMMENDED
     ≠
POLICY-ELIGIBLE
     ≠
AUTHORIZED
     ≠
EXECUTED
```

---

# 4. Execution Trust Boundary

```text
                REASONING SIDE

Diagnosis
   ↓
Recovery Candidate
   ↓
Recovery Decision
   ↓
Decision Critic

══════════════════════════════════════
       EXECUTION TRUST BOUNDARY
══════════════════════════════════════

Execution Request
   ↓
Immutable Plan
   ↓
Policy
   ↓
Approval
   ↓
Authorization
   ↓
Execution Worker
   ↓
Runbook Engine
   ↓
Infrastructure
```

AI operates above this boundary.

Infrastructure mutation happens below it.

---

# 5. Execution Architecture

```text
┌──────────────────────────────┐
│      Recovery Decision       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Execution Request       │
│                              │
│ executionRequestId           │
│ recoveryDecisionId           │
│ incidentId                   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Execution Plan          │
│                              │
│ planId                       │
│ planHash                     │
│ playbook                     │
│ runbook                      │
│ parameters                   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Policy Evaluation       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       Human Approval         │
│       when required          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Execution Authorization      │
│                              │
│ authorizationId              │
│ exact request                │
│ exact plan                   │
│ authorization status         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Execution Queue         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Execution Worker        │
│                              │
│ checkpoint                   │
│ idempotency                  │
│ authorization validation     │
│ immutable-plan validation    │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Deterministic Execution      │
│                              │
│ playbook                     │
│ runbook                      │
│ registered handlers          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│     REAL INFRASTRUCTURE      │
└──────────────────────────────┘
```

---

# 6. Execution Request

A recovery decision cannot mutate infrastructure directly.

It first becomes an execution request.

Conceptually:

```text
ExecutionRequest
   │
   ├── executionRequestId
   ├── organizationId
   ├── environmentId
   ├── incidentId
   ├── recoveryDecisionId
   ├── selectedPlaybookId
   ├── executionPlanId
   ├── executionPlanHash
   ├── authorizationId
   └── execution state
```

This gives the requested mutation durable identity.

---

# 7. Why Durable Identity Matters

Without identity:

```text
"restart payments"
```

could refer to multiple different operations.

With identity:

```text
executionRequestId
      ↓
specific request

executionPlanId
      ↓
specific plan

executionPlanHash
      ↓
specific immutable contents
```

The worker can prove what it is supposed to execute.

---

# 8. Immutable Execution Plan

Once execution is authorized, the operation must not silently change.

Example approved plan:

```text
Playbook:
PB-K8S-CRASHLOOP-001

Runbook:
RB-K8S-POD-RESTART

Namespace:
production

Pod:
payments-api-abc123
```

After approval, changing:

```text
pod = payments-api-abc123
```

to:

```text
deployment = payments
```

is not a harmless modification.

It is a different operational action.

---

# 9. Plan Hash

AIRA therefore derives an immutable plan hash.

```text
Execution Plan
      ↓
Canonical Representation
      ↓
Hash
      ↓
executionPlanHash
```

Conceptually:

```text
PLAN
 │
 ├── playbook
 ├── runbook
 ├── action
 ├── target
 └── parameters
       │
       ▼
    HASH(PLAN)
       │
       ▼
    ABC123...
```

---

# 10. Plan Revalidation

At execution time:

```text
Persisted Authorized Plan
          ↓
       planHash
          ↓
        ABC123

Received Execution Job
          ↓
       planHash
          ↓
        ABC123
```

Then:

```text
ABC123 == ABC123
       ↓
continue
```

But:

```text
ABC123 != XYZ789
       ↓
BLOCK
```

---

# 11. Why Hash Validation Is Important

Without it:

```text
Approve safe action
      ↓
modify parameters
      ↓
execute more dangerous action
```

could become possible.

With immutable identity:

```text
Approve Plan A
      ↓
Plan changes to B
      ↓
hash mismatch
      ↓
BLOCK
```

---

# 12. Execution Authorization

Authorization must be persisted.

The execution worker must not trust:

```text
job.executionAuthorized = true
```

as authority.

Otherwise any upstream component capable of constructing a queue message could potentially grant execution permission.

Instead:

```text
Job
 ↓
authorizationId
 ↓
ExecutionWorker
 ↓
database
 ↓
ExecutionAuthorization
 ↓
validate persisted authorization
```

---

# 13. No Self-Authorization

This is a critical invariant.

Forbidden:

```text
ExecutionWorker
      ↓
executionAuthorized = true
      ↓
execute
```

Also forbidden:

```text
RecoveryDecisionWorker
      ↓
executionAuthorized = true
```

The worker cannot manufacture its own authority.

---

# 14. Authorization Identity

Authorization should be tied to:

```text
authorizationId
organizationId
environmentId
incidentId
executionRequestId
recoveryDecisionId
selectedPlaybookId
executionPlanId
executionPlanHash
```

This prevents authorization from being reused for unrelated work.

---

# 15. Authorization Validation

Before execution:

```text
Load ExecutionRequest
       ↓
Load ExecutionAuthorization
       ↓
Validate tenant
       ↓
Validate environment
       ↓
Validate incident
       ↓
Validate execution request
       ↓
Validate recovery decision
       ↓
Validate selected playbook
       ↓
Validate plan identity
       ↓
Validate authorization state
       ↓
Validate critic state
       ↓
EXECUTE
```

Any mismatch fails closed.

---

# 16. Human Approval

Some actions should never be automatically authorized simply because AI confidence is high.

Example policy:

```text
LOW RISK
   ↓
automatic authorization possible

MEDIUM RISK
   ↓
policy-dependent

HIGH RISK
   ↓
human approval

CRITICAL
   ↓
human approval or deny
```

The exact policy belongs to the policy system, not the AI.

---

# 17. Approval Is Bound to the Plan

Approval should conceptually mean:

```text
"I approve THIS plan."
```

not:

```text
"I approve anything AIRA wants to do
for this incident."
```

Therefore:

```text
Approval
   ↓
Execution Plan Hash
```

must remain connected.

If the plan changes:

```text
old approval
    ↓
invalid for new plan
```

---

# 18. Policy Always Wins

Suppose:

```text
Diagnosis confidence = 99%

Recovery confidence = 98%

AI risk estimate = LOW
```

but policy says:

```text
Production database failover
requires manual approval.
```

Then:

```text
MANUAL APPROVAL REQUIRED
```

AI confidence never overrides deterministic policy.

---

# 19. Execution Worker Responsibilities

The ExecutionWorker is not another reasoning agent.

Its responsibilities should remain narrow:

```text
1. Validate job

2. Resolve immutable execution identity

3. Acquire runtime ownership

4. Enter idempotency boundary

5. Load persisted execution request

6. Load persisted authorization

7. Validate authorization

8. Validate immutable plan

9. Execute existing deterministic logic

10. Persist outcome

11. Publish lifecycle events

12. Finalize checkpoint
```

---

# 20. Execution Worker Must Not

```text
✗ diagnose incidents

✗ invent playbooks

✗ rewrite runbooks

✗ lower risk classification

✗ override policy

✗ create approvals

✗ self-authorize

✗ change plan parameters

✗ blindly replay uncertain execution
```

---

# 21. Execution Job Validation

A job must contain sufficient immutable scope.

Conceptually:

```text
executionRequestId
organizationId
environmentId
incidentId
executionPlanId
executionPlanHash
```

Missing immutable identity means:

```text
BLOCK
```

not:

```text
try to guess it
```

---

# 22. Tenant Validation

Execution is tenant-sensitive.

```text
Job
organization = A

ExecutionRequest
organization = A

Authorization
organization = A
```

Valid.

But:

```text
Job
organization = A

Authorization
organization = B
```

must result in:

```text
BLOCK
```

---

# 23. Environment Validation

Similarly:

```text
staging authorization
```

must never authorize:

```text
production execution
```

Therefore environment identity is part of every protected lookup.

---

# 24. Incident Validation

Authorization must remain tied to the incident that produced it.

```text
Incident 100
      ↓
Recovery Decision 200
      ↓
Execution Request 300
      ↓
Authorization 400
```

Authorization 400 cannot be reused for:

```text
Incident 999
```

---

# 25. Recovery Decision Validation

Execution should be traceable backward.

```text
Execution
    ↑
Authorization
    ↑
Execution Request
    ↑
Recovery Decision
    ↑
Diagnosis
    ↑
Incident
```

This creates an auditable chain of authority.

---

# 26. Selected Playbook Validation

Suppose authorization says:

```text
selectedPlaybookId =
PB-K8S-POD-RESTART
```

but the job requests:

```text
PB-K8S-NODE-DRAIN
```

Then:

```text
BLOCK
```

Even if both playbooks exist.

---

# 27. Execution State Validation

An execution request should only execute from allowed states.

Conceptually:

```text
AUTHORIZED
    ↓
QUEUED
    ↓
RUNNING
```

Not:

```text
SUCCEEDED
   ↓
execute again
```

or:

```text
BLOCKED
   ↓
execute anyway
```

---

# 28. Idempotency Boundary

Queues can deliver the same message more than once.

Therefore:

```text
RabbitMQ
   ↓
Execution Job
   ↓
Worker executes
   ↓
ack lost
   ↓
same message delivered again
```

Without idempotency:

```text
EXECUTE AGAIN
```

With idempotency:

```text
same immutable identity
       ↓
same idempotency record
       ↓
duplicate detected
       ↓
NO SECOND EXECUTION
```

---

# 29. Execution Idempotency Identity

Execution idempotency should be based on immutable execution identity.

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
Execution Idempotency Key
```

---

# 30. Idempotency States

Conceptually:

```text
NEW
 ↓
PROCESSING
 ↓
 ┌───────────────┐
 │               │
 ▼               ▼
COMPLETED       FAILED
```

Duplicate processing can then answer:

```text
Already completed?
      ↓
return stored outcome

Already processing?
      ↓
do not start second execution
```

---

# 31. Why Idempotency Alone Is Not Enough

Consider:

```text
Worker A
   ↓
claims execution
   ↓
starts work
   ↓
freezes

lease expires

Worker B
   ↓
takes over
```

Then Worker A wakes up.

Without ownership fencing:

```text
A and B may both write state.
```

Therefore AIRA also needs:

```text
leases
+
claim tokens
```

---

# 32. Runtime Checkpoint

Execution also creates durable runtime state.

Conceptually:

```text
RuntimeRecoveryCheckpoint
   │
   ├── operation
   ├── operationId
   ├── owner
   ├── claimToken
   ├── status
   ├── leaseUntil
   ├── heartbeat
   └── recoveryDisposition
```

This answers:

```text
Who owns execution?

Is the worker alive?

Did the process disappear?

Can the operation be recovered?
```

---

# 33. Execution Ownership

```text
ExecutionWorker A
      ↓
claim checkpoint
      ↓
owner = A
token = AAA
lease = future time
```

While processing:

```text
A
 ↓
heartbeat
 ↓
extend ownership
```

---

# 34. Ownership Fencing

Suppose:

```text
Worker A
token AAA
   ↓
freezes
   ↓
lease expires
   ↓
Worker B
token BBB
```

If A wakes up:

```text
A attempts completion
token AAA
      ↓
current token BBB
      ↓
STALE OWNER
      ↓
REJECT
```

---

# 35. Execution Start

Only after all safety boundaries succeed should deterministic execution begin.

```text
Job valid
   ↓
Checkpoint owned
   ↓
Idempotency claimed
   ↓
Request valid
   ↓
Authorization valid
   ↓
Plan valid
   ↓
State valid
   ↓
Policy boundary satisfied
   ↓
EXECUTE
```

---

# 36. Deterministic Execution Boundary

The execution worker does not ask an LLM:

```text
"How should I restart this pod?"
```

Instead:

```text
Authorized Playbook
      ↓
Approved Runbook
      ↓
Registered Action
      ↓
Known Handler
```

Example:

```text
PB-K8S-CRASHLOOP-001
       ↓
RB-K8S-POD-RESTART
       ↓
kubernetes/restart_pod
       ↓
registered Kubernetes handler
```

---

# 37. Action Registry

The action registry is another safety boundary.

Allowed:

```text
known action ID
      ↓
registered handler
```

Not allowed:

```text
arbitrary AI-generated shell command
```

Conceptually:

```text
Action ID
   ↓
Registry Lookup
   │
 ┌─┴─────┐
 │       │
FOUND   UNKNOWN
 │       │
 ▼       ▼
handler BLOCK
```

---

# 38. Parameter Validation

Before a handler runs:

```text
Action
   ↓
Required Parameters
   ↓
Validate
```

Example:

```text
namespace
pod
cluster
```

Missing or ambiguous target:

```text
BLOCK
```

AIRA should never guess production resource identity.

---

# 39. Execution Blast Radius

The execution boundary should know what the action can affect.

Conceptually:

```text
restart one pod
      ↓
small blast radius

restart deployment
      ↓
larger blast radius

drain node
      ↓
larger blast radius

database failover
      ↓
high operational impact
```

Risk and policy should constrain these actions before execution.

---

# 40. Kill Switch

A production recovery system should support emergency shutdown of autonomous mutation.

Conceptually:

```text
Execution Ready
      ↓
Kill Switch?
   ┌──┴────┐
   │       │
 OFF      ON
   │       │
   ▼       ▼
continue  BLOCK
```

The kill switch must override autonomous execution.

---

# 41. Execution Result

After deterministic execution:

```text
Infrastructure Handler
       ↓
Execution Result
```

The result should capture:

```text
operation attempted
target
timestamps
handler result
provider result
failure information
execution state
```

But:

```text
handler returned success
```

does not mean:

```text
incident recovered
```

That belongs to verification.

---

# 42. Command Success vs Recovery Success

Example:

```text
kubectl rollout restart
       ↓
command accepted
       ↓
EXECUTION SUCCESS
```

But then:

```text
new pods start
       ↓
same dependency failure
       ↓
HTTP 500 remains
       ↓
RECOVERY FAILURE
```

Therefore:

```text
EXECUTION SUCCESS
      ≠
RECOVERY SUCCESS
```

---

# 43. Verification Boundary

Execution should hand off:

```text
Execution Result
      ↓
Verification Queue
      ↓
VerificationWorker
```

The ExecutionWorker must not declare the incident recovered simply because the action completed.

---

# 44. Execution Failure Categories

Failures should distinguish between:

```text
AUTHORIZATION FAILURE

POLICY FAILURE

PLAN MISMATCH

INVALID STATE

HANDLER FAILURE

INFRASTRUCTURE FAILURE

TEMPORARY TRANSPORT FAILURE

UNKNOWN OUTCOME
```

These categories matter because their retry semantics differ.

---

# 45. Retryable Error Does Not Mean Replayable Execution

This distinction is critical.

Suppose:

```text
request sent to Kubernetes
       ↓
Kubernetes performs restart
       ↓
network connection drops
       ↓
ECONNRESET
```

`ECONNRESET` may normally be considered retryable.

But repeating the entire infrastructure mutation may not be safe.

Therefore:

```text
transport retryability
       ≠
operation replay safety
```

---

# 46. The Ambiguous Outcome Problem

Distributed systems have an unavoidable failure mode:

```text
AIRA
  │
  ├── sends mutation
  │
  ▼
Infrastructure
  │
  ├── performs mutation
  │
  ▼
response travels back
  │
  X
network/process failure
```

AIRA now knows:

```text
request may have executed
```

but not necessarily:

```text
whether it executed.
```

This is an **ambiguous outcome**.

---

# 47. Why Blind Retry Is Dangerous

Suppose the action is:

```text
restart service
```

Blind replay may cause:

```text
restart
   ↓
restart again
```

For another operation:

```text
failover database
```

blind replay could be significantly more dangerous.

Therefore execution crash recovery is intentionally conservative.

---

# 48. Runtime Crash During Execution

```text
ExecutionWorker
      ↓
checkpoint PROCESSING
      ↓
infrastructure mutation begins
      ↓
PROCESS CRASH
      ↓
checkpoint remains PROCESSING
      ↓
lease expires
      ↓
stale detector
      ↓
ABANDONED
```

Now the resume-state resolver sees:

```text
stage = EXECUTION
```

and does **not** return:

```text
SAFE_TO_RESUME
```

---

# 49. Execution Recovery Disposition

Instead:

```text
ABANDONED EXECUTION
        ↓
REQUIRES_RECONCILIATION
        ↓
MANUAL_INTERVENTION
```

This protects AIRA from accidentally repeating a mutation whose outcome is uncertain.

---

# 50. Why Recovery Decision Can Resume but Execution Cannot

Recovery decision:

```text
read state
calculate
persist decision
```

No external infrastructure mutation.

Therefore:

```text
crash
 ↓
idempotency
 ↓
resume
```

Execution:

```text
send mutation externally
       ↓
external system may change
       ↓
local process crashes
```

Therefore:

```text
crash
 ↓
outcome uncertain
 ↓
DO NOT BLINDLY RESUME
```

---

# 51. Why Verification Can Resume

Verification is observational.

```text
read metrics
read logs
read health
read state
```

If it crashes:

```text
restart observations
```

does not normally repeat infrastructure mutation.

Therefore verification is safe to resume through the protected idempotent path.

---

# 52. Execution Reconciliation

Future reconciliation mechanisms may determine whether an ambiguous action actually happened.

Conceptually:

```text
Uncertain Execution
       ↓
Reconciliation
       ↓
Inspect external state
       │
 ┌─────┼─────────────┐
 │     │             │
DONE  NOT DONE     UNKNOWN
 │     │             │
 ▼     ▼             ▼
verify possible     manual
      controlled
      new request
```

Important:

```text
reconciliation
```

is not the same as:

```text
automatic replay
```

---

# 53. Side-Effect Ownership

A useful AIRA rule is:

```text
Exactly one subsystem owns
infrastructure mutation:
the protected execution path.
```

Therefore:

```text
Agents             ✗

Verification       ✗

Lifecycle          ✗

Runtime Recovery   ✗

Explanation        ✗

Learning           ✗

Execution Plane    ✓
```

---

# 54. Retry Handoff Safety

Lifecycle may decide:

```text
another recovery attempt is needed
```

But it does not directly call infrastructure.

Instead:

```text
Lifecycle
   ↓
Retry Handoff
   ↓
new controlled recovery path
   ↓
new execution request
   ↓
new authorization where required
   ↓
ExecutionWorker
```

---

# 55. Rollback Handoff Safety

Same principle:

```text
Lifecycle
   ↓
rollback needed
   ↓
Rollback Handoff
   ↓
protected recovery/execution path
```

Never:

```text
LifecycleWorker
   ↓
kubectl rollback
```

---

# 56. Agent Safety Boundary

Agents may say:

```text
"Restarting the deployment is
the best recovery candidate."
```

They cannot say:

```text
"Therefore I am authorized
to restart it."
```

And they cannot perform:

```text
restartDeployment()
```

directly.

---

# 57. Queue Safety

A queue message is a transport mechanism.

It is not proof of authority.

```text
Execution Queue Message
       ↓
ExecutionWorker
       ↓
REVALIDATE EVERYTHING
```

The worker must never assume:

```text
"Because this message reached the execution queue,
it must be safe."
```

---

# 58. Database Safety

Similarly, the worker should not rely solely on job payload data.

Important safety information should be reloaded from authoritative persistence.

```text
Job
 ↓
IDs
 ↓
Database
 ↓
ExecutionRequest
+
ExecutionAuthorization
```

This limits tampered or stale queue payloads.

---

# 59. Execution Audit Chain

Every execution should be reconstructable.

```text
Incident
   ↓
Diagnosis
   ↓
Recovery Decision
   ↓
Critic
   ↓
Execution Request
   ↓
Policy
   ↓
Approval
   ↓
Authorization
   ↓
Execution
   ↓
Result
   ↓
Verification
```

An operator should be able to ask:

```text
Why was this action performed?

Who/what approved it?

Which plan was approved?

Was the plan changed?

What target was affected?

What happened?

Did recovery succeed?
```

---

# 60. Secret Safety

Execution parameters may contain secrets.

Therefore audit logs should never blindly serialize all parameters.

```text
Execution Parameters
       ↓
Secret Classification
       │
 ┌─────┴─────┐
 │           │
PUBLIC     SECRET
 │           │
 ▼           ▼
log        redact
```

---

# 61. Least Privilege

The executor should have only the permissions needed for approved actions.

Bad:

```text
AIRA Kubernetes ServiceAccount
       ↓
cluster-admin
```

Preferred:

```text
AIRA ServiceAccount
       ↓
specific verbs
       ↓
specific resources
       ↓
specific namespaces
```

Even if application controls fail, infrastructure-level RBAC provides another boundary.

---

# 62. Defense in Depth

AIRA execution safety should not depend on one check.

```text
Agent Boundary
      ↓
Playbook Catalogue
      ↓
Applicability
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
Tenant Validation
      ↓
Idempotency
      ↓
Runtime Ownership
      ↓
Action Registry
      ↓
Parameter Validation
      ↓
Infrastructure RBAC
```

If one layer fails, another can still stop unsafe execution.

---

# 63. Fail-Closed Philosophy

If authorization cannot be loaded:

```text
BLOCK
```

If plan hash cannot be verified:

```text
BLOCK
```

If target is ambiguous:

```text
BLOCK
```

If tenant scope does not match:

```text
BLOCK
```

If execution outcome is uncertain after crash:

```text
DO NOT REPLAY
```

---

# 64. What AIRA Must Never Do

```text
AI output
   ↓
shell command
   ↓
production
```

Never.

```text
queue says authorized=true
   ↓
trust blindly
```

Never.

```text
plan changed after approval
   ↓
execute anyway
```

Never.

```text
worker crashes during mutation
   ↓
restart mutation automatically
```

Never.

```text
unknown target
   ↓
guess
```

Never.

---

# 65. Safe Execution Example

```text
Incident:
payments-api CrashLoopBackOff
      ↓
Diagnosis:
bad pod state
      ↓
Recovery Decision:
PB-K8S-CRASHLOOP-001
      ↓
Risk:
within policy
      ↓
Execution Request:
ER-100
      ↓
Plan:
PLAN-10
      ↓
Hash:
ABC123
      ↓
Authorization:
AUTH-20
      ↓
Execution Queue
      ↓
ExecutionWorker
      ↓
load ER-100
      ↓
load AUTH-20
      ↓
tenant matches
      ↓
incident matches
      ↓
decision matches
      ↓
playbook matches
      ↓
planId matches
      ↓
hash ABC123 matches
      ↓
checkpoint claimed
      ↓
idempotency claimed
      ↓
run approved runbook
      ↓
restart exact pod
      ↓
persist result
      ↓
verification
```

---

# 66. Unsafe Plan Mutation Example

```text
Approval:
restart pod A

planHash:
AAA
```

Then queue payload contains:

```text
restart deployment B

planHash:
BBB
```

Worker:

```text
AAA != BBB
    ↓
BLOCK
```

---

# 67. Unsafe Authorization Spoof Example

Queue payload:

```text
executionAuthorized: true
```

but persisted authorization:

```text
authorizationGranted: false
```

Worker must use persisted authority:

```text
FALSE
 ↓
BLOCK
```

---

# 68. Duplicate Message Example

```text
Message 1
executionRequestId = ER-100
planId = PLAN-10
planHash = AAA
      ↓
execute
      ↓
complete
```

RabbitMQ redelivers:

```text
Message 2
executionRequestId = ER-100
planId = PLAN-10
planHash = AAA
      ↓
same idempotency identity
      ↓
DUPLICATE_COMPLETED
      ↓
NO MUTATION
```

---

# 69. Stale Worker Example

```text
Worker A
token = AAA
      ↓
processing
      ↓
freezes
```

Lease expires.

```text
Worker B
token = BBB
      ↓
takes ownership
```

A returns:

```text
A attempts completion
      ↓
AAA != BBB
      ↓
STALE OWNER
      ↓
REJECT
```

---

# 70. Crash During Mutation Example

```text
Worker
   ↓
sends restart request
   ↓
Kubernetes restarts pod
   ↓
AIRA process dies before persistence
```

After restart:

```text
checkpoint stale
      ↓
stage = EXECUTION
      ↓
outcome uncertain
      ↓
REQUIRES_RECONCILIATION
      ↓
NO AUTOMATIC REPLAY
```

---

# 71. Execution Safety Invariants

AIRA should maintain these invariants.

## Invariant 1

```text
No AI component directly mutates infrastructure.
```

## Invariant 2

```text
No worker grants itself execution authority.
```

## Invariant 3

```text
No execution occurs without persisted authorization.
```

## Invariant 4

```text
Authorization applies only to the exact approved plan.
```

## Invariant 5

```text
Plan mutation invalidates execution eligibility.
```

## Invariant 6

```text
Duplicate delivery must not duplicate mutation.
```

## Invariant 7

```text
A stale owner cannot finalize another worker's claim.
```

## Invariant 8

```text
Unknown execution outcome must not trigger blind replay.
```

## Invariant 9

```text
Execution success must not imply recovery success.
```

## Invariant 10

```text
Lifecycle and verification remain side-effect free
with respect to direct infrastructure mutation.
```

---

# 72. Safety Test Categories

Execution tests should cover:

```text
VALID AUTHORIZATION
       ↓
execute once
```

```text
MISSING AUTHORIZATION
       ↓
block
```

```text
DENIED AUTHORIZATION
       ↓
block
```

```text
PLAN HASH MISMATCH
       ↓
block
```

```text
PLAYBOOK MISMATCH
       ↓
block
```

```text
TENANT MISMATCH
       ↓
block
```

```text
INCIDENT MISMATCH
       ↓
block
```

```text
DUPLICATE MESSAGE
       ↓
no duplicate mutation
```

```text
STALE CLAIM TOKEN
       ↓
reject
```

```text
PROCESS CRASH
       ↓
no blind replay
```

---

# 73. Safety Property vs Feature

Features answer:

```text
Can AIRA restart a pod?
```

Safety properties answer:

```text
Can AIRA prove it will NOT restart
the wrong pod?
```

Production readiness depends heavily on the second question.

---

# 74. Execution Security Model

The execution plane should assume:

```text
queue messages can be duplicated

queue payloads can be stale

agents can be wrong

operators can make mistakes

workers can crash

networks can fail

databases can become temporarily unavailable

external APIs can return ambiguous outcomes
```

Safety must still hold.

---

# 75. Execution Reliability Model

The goal is not:

```text
exactly-once message delivery
```

because distributed messaging rarely guarantees true end-to-end exactly-once side effects.

The practical architecture is:

```text
at-least-once delivery
        +
idempotent processing
        +
immutable operation identity
        +
ownership fencing
        +
side-effect-aware crash recovery
```

---

# 76. Why Execution Is Treated Differently From Every Other Worker

```text
RecoveryDecisionWorker
      ↓
reasoning/control state

VerificationWorker
      ↓
observation

LifecycleWorker
      ↓
orchestration

ExecutionWorker
      ↓
REAL-WORLD SIDE EFFECT
```

Therefore ExecutionWorker has stricter recovery semantics.

---

# 77. Full Execution Safety Flow

```text
                     RECOVERY DECISION
                             │
                             ▼
                      DECISION CRITIC
                             │
                             ▼
                     EXECUTION REQUEST
                             │
                             ▼
                     IMMUTABLE PLAN
                             │
                             ▼
                       PLAN HASH
                             │
                             ▼
                          POLICY
                             │
                             ▼
                    APPROVAL IF NEEDED
                             │
                             ▼
                  PERSISTED AUTHORIZATION
                             │
                             ▼
                      EXECUTION QUEUE
                             │
                             ▼
                      EXECUTION WORKER
                             │
                             ▼
                     VALIDATE JOB SCOPE
                             │
                             ▼
                    RUNTIME CHECKPOINT
                             │
                             ▼
                      CLAIM OWNERSHIP
                             │
                             ▼
                        IDEMPOTENCY
                             │
                             ▼
                LOAD AUTHORITATIVE REQUEST
                             │
                             ▼
             LOAD AUTHORITATIVE AUTHORIZATION
                             │
                             ▼
                   VALIDATE TENANT SCOPE
                             │
                             ▼
                 VALIDATE INCIDENT IDENTITY
                             │
                             ▼
                VALIDATE RECOVERY DECISION
                             │
                             ▼
                   VALIDATE PLAYBOOK
                             │
                             ▼
                    VALIDATE PLAN HASH
                             │
                             ▼
                  VALIDATE AUTHORIZATION
                             │
                             ▼
                      VALIDATE STATE
                             │
                             ▼
                       KILL SWITCH
                             │
                             ▼
                    REGISTERED RUNBOOK
                             │
                             ▼
                    REGISTERED ACTION
                             │
                             ▼
                    VALIDATED PARAMETERS
                             │
                             ▼
═════════════════════════════╪══════════════════════════════
                INFRASTRUCTURE MUTATION BOUNDARY
═════════════════════════════╪══════════════════════════════
                             │
                             ▼
                       INFRASTRUCTURE
                             │
                             ▼
                      EXECUTION RESULT
                             │
                             ▼
                        PERSISTENCE
                             │
                             ▼
                        VERIFICATION
```

---

# 78. The Most Important Crash Rule

The execution subsystem follows:

```text
IF WE KNOW IT DID NOT EXECUTE
      ↓
a new controlled attempt may be considered
```

```text
IF WE KNOW IT EXECUTED
      ↓
verify the result
```

```text
IF WE DO NOT KNOW
      ↓
DO NOT GUESS
      ↓
RECONCILE
```

That is the correct distributed-systems behavior for high-impact infrastructure mutation.

---

# 79. Execution Safety Summary

AIRA execution safety is built from:

```text
STRUCTURED RECOVERY DECISION
            +
DECISION CRITIC
            +
IMMUTABLE EXECUTION REQUEST
            +
PLAN HASH
            +
POLICY
            +
HUMAN APPROVAL
            +
PERSISTED AUTHORIZATION
            +
TENANT VALIDATION
            +
IDEMPOTENCY
            +
LEASES
            +
CLAIM TOKENS
            +
REGISTERED ACTIONS
            +
PARAMETER VALIDATION
            +
INFRASTRUCTURE RBAC
            +
POST-ACTION VERIFICATION
            +
NO BLIND EXECUTION REPLAY
```

---

# 80. Final Principle

The execution layer exists to enforce one rule:

> **AIRA may only mutate infrastructure when the exact operation has passed every required deterministic safety boundary.**

And if AIRA cannot prove that:

```text
the request is correct

the tenant is correct

the incident is correct

the plan is unchanged

authorization exists

the worker owns the operation

the operation has not already completed

the target is unambiguous

the action is registered

the execution outcome is known
```

then the correct behavior is:

```text
DO NOT EXECUTE
```

AIRA's execution system is therefore not designed to maximize the number of automated actions.

It is designed to maximize:

```text
SAFE
+
EXPLAINABLE
+
AUTHORIZED
+
DETERMINISTIC
+
RECOVERABLE
```

infrastructure actions.