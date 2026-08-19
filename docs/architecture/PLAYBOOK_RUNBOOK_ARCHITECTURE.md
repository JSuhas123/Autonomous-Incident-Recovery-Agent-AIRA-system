# AIRA Playbook and Runbook Architecture

> **How AIRA separates recovery strategy from deterministic execution so AI can reason about incidents without inventing production actions at runtime.**

---

# 1. Why Playbooks and Runbooks Exist

AIRA deliberately does not use this model:

```text
Incident
   ↓
AI thinks
   ↓
AI invents shell command
   ↓
Production
```

Instead:

```text
Incident
   ↓
AI / Recovery Intelligence
   ↓
Select Approved Playbook
   ↓
Policy
   ↓
Authorization
   ↓
Select Approved Runbook
   ↓
Registered Actions
   ↓
Deterministic Executor
   ↓
Infrastructure
```

This separates:

```text
STRATEGY
```

from:

```text
EXECUTION STEPS
```

---

# 2. Playbook vs Runbook

The easiest way to understand the difference is:

```text
PLAYBOOK
   ↓
"What should we do?"
```

```text
RUNBOOK
   ↓
"Exactly how do we do it?"
```

Example:

```text
Incident:
Kubernetes CrashLoopBackOff
        ↓
Playbook:
Recover unhealthy crashing workload
        ↓
Runbook:
Restart exact approved pod
        ↓
Registered Kubernetes Handler
```

---

# 3. Full Architecture

```text
                    INCIDENT
                       │
                       ▼
                   DIAGNOSIS
                       │
                       ▼
              PLAYBOOK DISCOVERY
                       │
                       ▼
             Candidate Playbooks
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
               Recovery Decision
                       │
                       ▼
                 Selected Playbook
                       │
                       ▼
                 Approval Rules
                       │
                       ▼
                  Authorization
                       │
                       ▼
                Selected Runbook
                       │
                       ▼
                Ordered Steps
                       │
                       ▼
               Registered Actions
                       │
                       ▼
               Action Handlers
                       │
                       ▼
                 Infrastructure
```

---

# 4. Playbook Responsibility

A playbook describes the operational strategy for a class of incidents.

Conceptually:

```text
Playbook
   │
   ├── id
   ├── name
   ├── description
   ├── incident family
   ├── triggers
   ├── applicability
   ├── preconditions
   ├── risk
   ├── approval mode
   ├── runbook references
   ├── verification expectations
   ├── rollback strategy
   └── metadata
```

A playbook should answer:

```text
When does this strategy apply?

What problem does it solve?

What must already be true?

How risky is it?

Does it require approval?

Which runbook implements it?

How do we know it worked?

What happens if it fails?
```

---

# 5. Runbook Responsibility

A runbook describes the exact deterministic operational steps.

Conceptually:

```text
Runbook
   │
   ├── runbookId
   ├── description
   ├── severity
   ├── services
   ├── estimatedDuration
   ├── triggers
   ├── preconditions
   ├── ordered steps
   ├── confirmation flags
   ├── rollback information
   ├── postconditions
   ├── notification channels
   ├── ownership
   └── execution statistics
```

A runbook should answer:

```text
What exact steps are allowed?

In what order?

What parameters are needed?

What must be checked first?

What confirms success?

What rollback exists?

Who owns this runbook?
```

---

# 6. Strategy vs Mechanism

This separation is important.

```text
PLAYBOOK
   ↓
Recovery Strategy
```

Example:

```text
"Recover a Kubernetes workload stuck in CrashLoopBackOff."
```

Runbook:

```text
RUNBOOK
   ↓
Deterministic Mechanism
```

Example:

```text
1. Validate namespace
2. Validate pod
3. Collect current state
4. Restart approved pod
5. Wait for readiness
6. Verify pod state
```

---

# 7. Why AI Should Select Playbooks, Not Invent Actions

AI is good at:

```text
matching evidence
reasoning about symptoms
ranking candidates
understanding context
```

AI is less suitable as the authority for:

```text
arbitrary production commands
```

Therefore:

```text
AI
   ↓
select from approved catalogue
```

rather than:

```text
AI
   ↓
invent operational procedure
```

---

# 8. Playbook Discovery

Once diagnosis exists:

```text
Diagnosis
   ↓
Playbook Discovery
   ↓
Candidate Playbooks
```

Example:

```text
Diagnosis:
CrashLoopBackOff

Candidates:
PB-K8S-CRASHLOOP-001
PB-K8S-OOM-001
PB-K8S-IMAGEPULL-001
```

Discovery does not mean execution.

---

# 9. Applicability

Each candidate must be checked.

```text
Playbook
   ↓
Applicability
   ↓
Does incident class match?
   ↓
Does resource type match?
   ↓
Do preconditions hold?
   ↓
Is required evidence available?
   ↓
APPLICABLE / REJECT
```

---

# 10. Risk Evaluation

After applicability:

```text
Candidate
   ↓
Risk Analysis
```

Questions include:

```text
What is the blast radius?

Is the action reversible?

Is this production?

Could data be lost?

Could availability worsen?

Does the action affect one resource or many?
```

---

# 11. Policy Evaluation

Even a good playbook can be disallowed.

```text
Candidate
   ↓
Policy
   ↓
Allowed?
```

Example:

```text
Restart single dev pod
      ↓
AUTO allowed
```

versus:

```text
Drain production node
      ↓
manual approval required
```

---

# 12. Approval Mode

Playbooks may define or contribute to approval expectations.

Conceptually:

```text
AUTO

MANUAL

CONDITIONAL
```

Example:

```text
LOW RISK
      ↓
AUTO
```

```text
HIGH RISK
      ↓
MANUAL
```

---

# 13. Playbook Selection

After filtering:

```text
Candidate A
Candidate B
Candidate C
     │
     ▼
Rank
     │
     ▼
Selected Playbook
```

Ranking can consider:

```text
diagnosis confidence
risk
past success
reversibility
blast radius
historical outcomes
```

---

# 14. Recovery Decision

The selected playbook becomes part of the recovery decision.

```text
Diagnosis
   ↓
Selected Playbook
   ↓
Recovery Decision
```

The decision should preserve:

```text
why this playbook was selected

which alternatives were rejected

what risk was calculated

what policy applied

what approval is required
```

---

# 15. Decision Critic

Before execution:

```text
Selected Playbook
      ↓
Decision Critic
```

The critic can challenge:

```text
bad applicability

underestimated risk

missing evidence

safer alternative available

incorrect policy interpretation
```

---

# 16. Playbook Does Not Equal Runbook Execution

A selected playbook is still only:

```text
approved strategy candidate
```

The system must then resolve:

```text
runbook
parameters
authorization
immutable execution plan
```

---

# 17. Runbook Selection

A playbook may reference one or more runbooks.

```text
Playbook
   │
   ├── Runbook A
   ├── Runbook B
   └── Runbook C
```

Depending on incident state:

```text
select exact runbook
```

---

# 18. Runbook Preconditions

Before execution:

```text
Runbook
   ↓
Preconditions
```

Examples:

```text
resource exists

resource is in expected state

namespace valid

cluster reachable

approval present

rollback available

target count within limits
```

If preconditions fail:

```text
DO NOT EXECUTE
```

---

# 19. Runbook Steps

A runbook should contain ordered deterministic steps.

Example:

```text
Step 1
Validate pod
   ↓
Step 2
Capture current state
   ↓
Step 3
Restart pod
   ↓
Step 4
Wait
   ↓
Step 5
Check readiness
```

Order matters.

---

# 20. Action Registry

Each executable step should map to a registered action.

```text
Runbook Step
     ↓
Action ID
     ↓
Action Registry
     ↓
Registered Handler
```

Example:

```text
kubernetes/restart_pod
```

---

# 21. Unknown Action

If a runbook references:

```text
kubernetes/destroy_everything
```

but no approved action exists:

```text
Registry Lookup
      ↓
UNKNOWN
      ↓
BLOCK
```

Never fallback to arbitrary shell.

---

# 22. Action Handler

Handlers contain deterministic implementation.

Example conceptual handler:

```text
restartPod({
  cluster,
  namespace,
  pod
})
```

The handler should not be asked:

```text
"What should we do?"
```

Its job is:

```text
"Perform this already-approved operation."
```

---

# 23. Parameter Resolution

Runbooks require exact parameters.

```text
Runbook
   ↓
Required Parameters
   ↓
Parameter Resolution
```

Example:

```text
namespace
podName
clusterId
```

These values should come from evidence and authoritative state.

---

# 24. Ambiguous Parameters

Suppose:

```text
target service = payments
```

but three pods match.

Unsafe:

```text
choose first pod
```

Correct:

```text
RESOURCE_AMBIGUOUS
      ↓
BLOCK / MANUAL
```

---

# 25. Parameter Validation

Resolved parameters should pass deterministic validation.

```text
Parameter
   ↓
Type
   ↓
Allowed values
   ↓
Scope
   ↓
Existence
   ↓
Policy
```

---

# 26. Immutable Execution Plan

Once playbook, runbook, action, and parameters are resolved:

```text
Playbook
   +
Runbook
   +
Actions
   +
Parameters
      ↓
Execution Plan
      ↓
planId
      +
planHash
```

This freezes what is being approved.

---

# 27. Why the Plan Must Be Frozen

Imagine approval is given for:

```text
restart pod A
```

but execution later changes to:

```text
restart deployment B
```

That is a new action.

Therefore:

```text
plan changed
      ↓
hash changed
      ↓
authorization invalid
```

---

# 28. Runbook and Authorization

Authorization should apply to the exact runbook execution plan.

```text
Runbook
   ↓
Resolved Parameters
   ↓
Plan Hash
   ↓
Approval
   ↓
Authorization
```

---

# 29. Execution

Only after all controls:

```text
Playbook valid
      ↓
Runbook valid
      ↓
Preconditions valid
      ↓
Parameters valid
      ↓
Policy valid
      ↓
Approval valid
      ↓
Authorization valid
      ↓
Plan hash valid
      ↓
Execution
```

---

# 30. Runbook Execution Engine

The Runbook Execution Engine should:

```text
load runbook
      ↓
validate lifecycle state
      ↓
validate steps
      ↓
resolve registered action
      ↓
invoke handler
      ↓
capture result
      ↓
move to next step
```

---

# 31. Step Failure

If one step fails:

```text
Step N
  ↓
FAIL
```

the runbook should not automatically continue blindly.

Possible outcomes:

```text
stop

rollback

mark failed

escalate

retry step if explicitly allowed
```

---

# 32. Step Retry Safety

Step retries should be defined, not assumed.

Example:

```text
read status
      ↓
safe retry
```

versus:

```text
perform failover
      ↓
do not blindly retry
```

Side-effect semantics matter.

---

# 33. Runbook Rollback

A runbook may define rollback information.

```text
Forward Step
      ↓
Rollback Step
```

But rollback itself must still be:

```text
policy-controlled
authorized
deterministic
```

---

# 34. Verification After Runbook

Runbook completion does not close the incident.

```text
Runbook completed
      ↓
Execution Result
      ↓
Verification
```

The runbook answers:

```text
"Did the steps run?"
```

Verification answers:

```text
"Did the system recover?"
```

---

# 35. Playbook Verification Expectations

Playbooks can define expected recovery outcomes.

Example:

```text
After pod restart:
- pod Ready
- restart count stable
- error rate normalized
- CrashLoopBackOff cleared
```

These expectations help build verification plans.

---

# 36. Playbook Lifecycle

A playbook itself may have lifecycle states.

Conceptually:

```text
DRAFT
  ↓
VALIDATED
  ↓
APPROVED
  ↓
ACTIVE
  ↓
DEPRECATED
```

Only active/approved playbooks should be eligible for autonomous use.

---

# 37. Runbook Lifecycle

Similarly:

```text
DRAFT
  ↓
VALIDATED
  ↓
APPROVED
  ↓
ACTIVE
```

A runbook existing in the repository should not automatically mean:

```text
safe for production execution
```

---

# 38. Why Activation Matters

Without activation control:

```text
developer creates file
      ↓
AIRA can execute it immediately
```

Unsafe.

With lifecycle:

```text
developer creates
      ↓
review
      ↓
validate
      ↓
approve
      ↓
activate
```

---

# 39. Playbook Versioning

Playbooks should evolve without destroying historical truth.

Conceptually:

```text
PB-X v1
   ↓
used in incident A

PB-X v2
   ↓
used in incident B
```

Incident A should continue referencing v1.

---

# 40. Runbook Versioning

Same for runbooks.

```text
RB-X v1
      ↓
executed previously

RB-X v2
      ↓
new safer implementation
```

Audit should preserve which version actually ran.

---

# 41. Why Versioning Matters

Without versioning:

```text
incident history says:
"runbook X"
```

but X changes later.

Then operators cannot reconstruct what actually happened.

Versioning preserves operational truth.

---

# 42. Playbook Families

AIRA can organize recovery knowledge into incident families.

Examples:

```text
Kubernetes

Containers

Databases

Networking

Cloud

Security

CI/CD

Observability

Incident Management
```

---

# 43. Kubernetes Playbooks

Potential incident classes include:

```text
CrashLoopBackOff

OOMKilled

ImagePullBackOff

Node NotReady

PVC issues

HPA problems

deployment rollout failures

pod readiness failures
```

---

# 44. Database Playbooks

Examples:

```text
connection pool exhaustion

replication lag

disk pressure

service unavailable

slow queries

read replica failure

connection reset
```

---

# 45. Networking Playbooks

Examples:

```text
DNS failure

ingress failure

load balancer unhealthy

service discovery failure

connectivity degradation
```

---

# 46. Cloud Playbooks

Examples:

```text
instance unhealthy

resource capacity

autoscaling issue

managed service degradation

quota exhaustion
```

Any supported cloud action must remain within policy and provider-specific safety constraints.

---

# 47. Security Playbooks

Security actions require especially strong controls.

Possible examples:

```text
certificate renewal

credential rotation

suspicious workload isolation

access revocation
```

These may require stricter approval rules.

---

# 48. CI/CD Playbooks

Examples:

```text
rollback deployment

rerun failed pipeline

deployment verification

pause release

restore previous version
```

---

# 49. Observability Playbooks

Examples:

```text
restart telemetry collector

repair alert pipeline

validate metrics ingestion

recover tracing pipeline
```

---

# 50. Incident-Management Playbooks

Not every playbook mutates infrastructure.

Examples:

```text
collect evidence

notify stakeholders

open escalation

assign owner

prepare incident summary
```

These can be lower-risk operational workflows.

---

# 51. Playbook Matching

Matching should consider structured incident context.

```text
Incident
   ↓
symptoms
   ↓
resource type
   ↓
severity
   ↓
environment
   ↓
diagnosis
   ↓
Candidate Playbooks
```

---

# 52. Matching Is Not Execution

Important:

```text
match score = 0.98
```

does not mean:

```text
execute
```

The playbook still needs:

```text
applicability
risk
policy
approval
authorization
```

---

# 53. AI Role in Playbook Selection

AI can help answer:

```text
Which playbook best fits this diagnosis?
```

It should not answer:

```text
Which arbitrary command should I make up?
```

---

# 54. AI Role in Runbook Parameters

AI may help identify evidence-backed parameter candidates.

Example:

```text
affected namespace appears to be production
```

But deterministic validation must confirm the resource.

---

# 55. AI Cannot Modify Active Runbooks at Runtime

Forbidden:

```text
Runbook step fails
      ↓
AI edits step
      ↓
new command executed
```

Correct:

```text
Runbook step fails
      ↓
known fallback?
      │
   ┌──┴────┐
   │       │
  YES      NO
   │       │
   ▼       ▼
safe     escalate
fallback
```

---

# 56. Unknown Incident

What if no playbook matches?

```text
Incident
   ↓
Diagnosis
   ↓
Playbook Discovery
   ↓
0 safe candidates
```

Correct:

```text
NO_SAFE_PLAYBOOK
      ↓
manual intervention / escalation
```

---

# 57. Future Playbook Creation

AIRA may later suggest:

```text
"This incident class lacks a playbook."
```

Learning may generate:

```text
playbook recommendation
```

But not:

```text
active production playbook automatically
```

Safe flow:

```text
Learning Suggestion
      ↓
Human Review
      ↓
Draft Playbook
      ↓
Validation
      ↓
Approval
      ↓
Activation
```

---

# 58. New Runbook Creation

Same rule:

```text
AI may suggest procedural improvement
      ↓
Human engineering review
      ↓
deterministic implementation
      ↓
tests
      ↓
approval
      ↓
activation
```

---

# 59. Runbook Testing

Every runbook should have tests covering:

```text
schema validity

required parameters

preconditions

step order

handler registration

failure behavior

rollback behavior

postconditions
```

---

# 60. Playbook Testing

Playbooks should test:

```text
correct incident matching

incorrect incident rejection

risk classification

approval requirements

runbook references

verification expectations

policy integration
```

---

# 61. Golden Path Testing

Example:

```text
CrashLoopBackOff
      ↓
correct playbook matched
      ↓
correct runbook selected
      ↓
correct parameters resolved
      ↓
policy allowed
      ↓
authorization granted
      ↓
handler called once
      ↓
verification triggered
```

---

# 62. Negative Testing

Important tests include:

```text
wrong incident class
      ↓
playbook rejected
```

```text
missing runbook
      ↓
activation blocked
```

```text
unknown handler
      ↓
execution blocked
```

```text
ambiguous parameter
      ↓
execution blocked
```

```text
approval missing
      ↓
execution blocked
```

---

# 63. Runbook Statistics

Runbooks can track operational history.

Examples:

```text
execution count

success rate

failure rate

average duration

rollback count

verification success rate

last executed
```

This can later help recovery ranking.

---

# 64. Historical Performance

Suppose:

```text
Playbook A
success rate = 95%

Playbook B
success rate = 60%
```

Historical performance may inform ranking.

But:

```text
past success
      ≠
current applicability
```

Current evidence still matters.

---

# 65. Ownership

Every runbook should have clear ownership.

Example:

```text
ownerTeam = SRE

serviceOwner = Payments

maintainer = Platform Engineering
```

This makes review and escalation easier.

---

# 66. Runbook Notifications

Runbooks can specify notification behavior.

Example:

```text
before high-risk action
      ↓
notify on-call

after action
      ↓
notify incident channel
```

---

# 67. Confirmation Flags

Some runbook steps may require explicit confirmation.

Example:

```text
Step:
drain production node

confirmationRequired = true
```

The execution engine should not skip this requirement.

---

# 68. Preconditions vs Policy

These are different.

Precondition:

```text
"Pod must exist."
```

Policy:

```text
"Production restarts require approval."
```

Both must pass.

---

# 69. Postconditions

Runbooks can define immediate postconditions.

Example:

```text
restart command accepted

replacement pod created

deployment state changed
```

But deeper system recovery belongs to Verification.

---

# 70. Runbook Postcondition vs Verification

```text
RUNBOOK POSTCONDITION
      ↓
"Did this execution step produce
the immediate expected state?"
```

```text
VERIFICATION
      ↓
"Did the incident actually recover?"
```

---

# 71. Playbook Rollback Strategy

A playbook can define:

```text
whether rollback exists

which rollback path applies

what conditions require rollback
```

But actual rollback still enters protected execution.

---

# 72. Playbook Retry Strategy

Similarly:

```text
max attempts

retry eligibility

alternate playbook

backoff
```

may be part of recovery strategy.

Lifecycle enforces bounded retry orchestration.

---

# 73. Playbook Safety Matrix

```text
┌─────────────────────────────┬─────────────────┐
│ Capability                  │ Playbook        │
├─────────────────────────────┼─────────────────┤
│ Describe strategy           │ YES             │
│ Define risk                 │ YES             │
│ Define approval mode        │ YES             │
│ Reference runbooks          │ YES             │
│ Define verification goals   │ YES             │
│ Directly mutate infra       │ NO              │
└─────────────────────────────┴─────────────────┘
```

---

# 74. Runbook Safety Matrix

```text
┌─────────────────────────────┬─────────────────┐
│ Capability                  │ Runbook         │
├─────────────────────────────┼─────────────────┤
│ Define exact steps          │ YES             │
│ Define parameters           │ YES             │
│ Reference registered action │ YES             │
│ Define rollback metadata    │ YES             │
│ Invent arbitrary shell      │ NO              │
│ Self-authorize execution    │ NO              │
└─────────────────────────────┴─────────────────┘
```

---

# 75. AI Safety Matrix

```text
┌─────────────────────────────┬─────────────────┐
│ Capability                  │ AI Agent        │
├─────────────────────────────┼─────────────────┤
│ Analyze diagnosis           │ YES             │
│ Rank playbooks              │ YES             │
│ Suggest parameters          │ YES             │
│ Suggest new playbook draft  │ POSSIBLE        │
│ Activate playbook           │ NO              │
│ Modify active runbook       │ NO              │
│ Directly invoke handler     │ NO              │
└─────────────────────────────┴─────────────────┘
```

---

# 76. Example — CrashLoopBackOff

```text
Signal:
CrashLoopBackOff
      ↓
Incident
      ↓
Diagnosis
      ↓
Playbook Discovery
      ↓
PB-K8S-CRASHLOOP-001
      ↓
Applicability
      ↓
Risk
      ↓
Policy
      ↓
Decision
      ↓
Runbook
      ↓
RB-K8S-POD-RESTART
      ↓
Resolve:
namespace=production
pod=payments-abc
      ↓
Immutable Plan
      ↓
Authorization
      ↓
Runbook Engine
      ↓
kubernetes/restart_pod
      ↓
Verification
```

---

# 77. Example — Database Replication Lag

```text
Signal:
replication lag high
      ↓
Diagnosis:
replica unhealthy
      ↓
Playbook Discovery
      ↓
database recovery candidates
      ↓
Risk:
HIGH
      ↓
Policy:
manual approval
      ↓
WAIT FOR HUMAN
```

Even if an approved runbook exists, policy may stop autonomous execution.

---

# 78. Example — Unknown Failure

```text
Incident
   ↓
Diagnosis:
unknown / low confidence
   ↓
Playbook Discovery
   ↓
no safe candidate
   ↓
NO_SAFE_PLAYBOOK
   ↓
ESCALATE
```

AIRA does not invent a new runbook during the incident.

---

# 79. Example — Handler Missing

```text
Playbook selected
      ↓
Runbook selected
      ↓
Step:
kubernetes/restart_pod
      ↓
Registry
      ↓
handler missing
      ↓
BLOCK
```

---

# 80. Example — Plan Changes After Approval

```text
Approved:
restart pod A

Hash:
AAA
```

Later:

```text
Runbook parameters changed:
restart pod B

Hash:
BBB
```

Execution:

```text
AAA != BBB
      ↓
BLOCK
```

---

# 81. Example — Duplicate Runbook Execution

```text
Execution Request ER-1
      ↓
Runbook starts
      ↓
queue redelivery
```

Execution idempotency:

```text
same ER-1
same plan
same hash
      ↓
duplicate
      ↓
no second execution
```

---

# 82. Playbook and Runtime Recovery

Runtime recovery should not rediscover an entirely different playbook for an interrupted immutable execution.

For execution:

```text
outcome uncertain
      ↓
reconcile
```

For safe reasoning stages, the existing protected decision path may recompute deterministically where appropriate.

---

# 83. Playbook and Verification

Playbooks can define expected recovery evidence.

```text
Playbook
   ↓
Expected Outcome
   ↓
Verification Plan
```

This connects strategy to measurable recovery.

---

# 84. Playbook and Lifecycle

Playbooks may inform:

```text
stability window

retry limit

rollback option

escalation rules
```

Lifecycle then enforces these through controlled orchestration.

---

# 85. Catalogue Governance

A production catalogue should have governance.

```text
Draft
  ↓
Review
  ↓
Test
  ↓
Approve
  ↓
Activate
  ↓
Observe Outcomes
  ↓
Improve
```

---

# 86. Catalogue Safety

A catalogue entry should not be activated simply because:

```text
schema is valid
```

It should also be:

```text
operationally tested
policy-reviewed
handler-complete
verification-defined
```

---

# 87. New Incident Family Workflow

To add a new incident family:

```text
Define Incident Class
      ↓
Create Playbook
      ↓
Define Applicability
      ↓
Define Risk
      ↓
Define Approval Rules
      ↓
Create Runbook
      ↓
Register Actions
      ↓
Implement Handlers
      ↓
Create Verification Rules
      ↓
Add Tests
      ↓
Validate
      ↓
Approve
      ↓
Activate
```

---

# 88. Why This Scales

Adding new operational knowledge does not require changing the AI's fundamental authority.

```text
New Incident Family
      ↓
New Playbook + Runbook
      ↓
same safety boundaries
```

This allows capability growth without broadening uncontrolled execution.

---

# 89. Cross-Domain Architecture

The same architecture can support:

```text
Kubernetes
Databases
Cloud
Networking
CI/CD
Security
Observability
```

because:

```text
Playbook strategy
      ↓
Runbook steps
      ↓
domain-specific registered handlers
```

The control architecture remains the same.

---

# 90. Runbook Handler Boundary

For each domain:

```text
Runbook
      ↓
Action Registry
      ↓
Domain Adapter
```

Example:

```text
Kubernetes
      ↓
Kubernetes Handler
```

```text
AWS
      ↓
AWS Handler
```

```text
PostgreSQL
      ↓
Database Handler
```

Handlers remain constrained by policy and authorization.

---

# 91. Why Handlers Should Be Narrow

Bad handler:

```text
executeAnything(command)
```

Good handlers:

```text
restartPod()

scaleDeployment()

checkPodHealth()

getLogs()
```

Narrow handlers are easier to:

```text
validate
test
authorize
audit
limit through RBAC
```

---

# 92. Read Actions vs Mutation Actions

Runbooks may use both.

Read:

```text
get_logs

get_status

check_health
```

Mutation:

```text
restart_pod

scale_deployment
```

Policy can treat them differently.

---

# 93. Risk by Action Type

Conceptually:

```text
READ
  ↓
low

RESTART
  ↓
medium

SCALE
  ↓
medium/high

FAILOVER
  ↓
high

DESTRUCTIVE
  ↓
critical/manual-only
```

---

# 94. Playbook Observability

Useful metrics:

```text
match count

selection count

execution count

success rate

verification success rate

rollback rate

manual approval rate

policy rejection rate
```

---

# 95. Runbook Observability

Useful metrics:

```text
step duration

handler error rate

average execution duration

rollback frequency

parameter resolution failure

unknown handler count
```

---

# 96. Audit Requirements

For each execution, operators should know:

```text
Which playbook was selected?

Why?

Which version?

Which runbook?

Which version?

Which parameters?

Which policy?

Which approval?

Which plan hash?

Which handlers ran?

What happened?

Was recovery verified?
```

---

# 97. Core Invariants

## Invariant 1

```text
AI selects from approved capabilities.
```

## Invariant 2

```text
AI does not invent production execution steps at runtime.
```

## Invariant 3

```text
Playbook describes strategy.
```

## Invariant 4

```text
Runbook describes deterministic mechanism.
```

## Invariant 5

```text
Only registered actions may execute.
```

## Invariant 6

```text
Parameters must be exact and validated.
```

## Invariant 7

```text
Policy and approval remain outside AI authority.
```

## Invariant 8

```text
Plan changes invalidate prior authorization.
```

## Invariant 9

```text
Runbook completion does not equal incident recovery.
```

## Invariant 10

```text
Unknown recovery paths escalate instead of being invented.
```

---

# 98. Full Playbook/Runbook Flow

```text
                      INCIDENT
                         │
                         ▼
                      DIAGNOSIS
                         │
                         ▼
                  PLAYBOOK DISCOVERY
                         │
                         ▼
                    CANDIDATES
                         │
                         ▼
                  APPLICABILITY
                         │
                         ▼
                       RISK
                         │
                         ▼
                      POLICY
                         │
                         ▼
                      RANKING
                         │
                         ▼
                  SELECT PLAYBOOK
                         │
                         ▼
                  DECISION CRITIC
                         │
                         ▼
                   SELECT RUNBOOK
                         │
                         ▼
                RESOLVE PARAMETERS
                         │
                         ▼
                 VALIDATE PARAMETERS
                         │
                         ▼
                 IMMUTABLE PLAN
                         │
                         ▼
                     APPROVAL
                         │
                         ▼
                  AUTHORIZATION
                         │
                         ▼
                  RUNBOOK ENGINE
                         │
                         ▼
               REGISTERED ACTIONS
                         │
                         ▼
                 DOMAIN HANDLERS
                         │
                         ▼
                   INFRASTRUCTURE
                         │
                         ▼
                    VERIFICATION
                         │
                         ▼
                     LIFECYCLE
```

---

# 99. Why This Architecture Strengthens AIRA

Without Playbook/Runbook separation:

```text
AI reasoning
      ↓
execution logic mixed together
```

With separation:

```text
AI reasoning
      ↓
approved strategy
      ↓
deterministic procedure
      ↓
authorized action
```

This gives AIRA:

```text
repeatability
auditability
testability
versioning
policy control
human review
bounded automation
```

---

# 100. Final Principle

The Playbook/Runbook architecture follows one simple rule:

> **AI may decide which approved recovery strategy best fits an incident, but the actual operational procedure must remain deterministic, reviewed, authorized, and testable.**

In short:

```text
AI
  ↓
chooses

PLAYBOOK
  ↓
defines strategy

RUNBOOK
  ↓
defines exact steps

POLICY
  ↓
constrains

AUTHORIZATION
  ↓
permits

EXECUTOR
  ↓
acts

VERIFICATION
  ↓
proves
```

That separation allows AIRA to become more intelligent without making its infrastructure control less predictable.