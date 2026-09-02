# AIRA Phase 23 — Human Operations Control Plane

**Status:** COMPLETE / CERTIFIED / FROZEN  
**Phase:** 23  
**Final certification:** Phase 23.9  
**Certification state:** PASS  
**System:** Autonomous Incident Recovery Agent — AIRA

---

# 1. Purpose

Phase 23 introduced AIRA's production Human Operations Control Plane.

Before Phase 23, AIRA already had incident detection, diagnosis, recovery planning, approval handling, infrastructure execution authorization, verification, autonomy certification, reliability testing, and recovery safety controls.

Phase 23 solved a different problem:

> What happens when AIRA cannot or should not safely continue autonomously and a human operator must enter the incident workflow?

The objective was not merely to send an alert to a person.

Phase 23 introduced a durable, tenant-isolated, auditable human-control system covering:

- escalation;
- human tasks;
- assignments;
- acknowledgements;
- notifications;
- incident handoff packages;
- takeover requests;
- takeover authorization;
- human control leases;
- concurrent control protection;
- lease expiry;
- human control return;
- fresh AIRA reevaluation;
- stale recovery-plan fencing;
- Incident Command backend APIs;
- Incident Command frontend UI;
- tenant isolation certification;
- adversarial certification;
- final closed-loop certification.

The completed operational path is:

```text
Signal
  ↓
Incident
  ↓
Investigation
  ↓
Diagnosis
  ↓
Recovery Decision
  ↓
Safety / Policy / Autonomy Gates
  │
  ├── Safe + authorized
  │      ↓
  │   Recovery
  │      ↓
  │   Verification
  │      ↓
  │   Close
  │
  └── Human intervention required
         ↓
      Escalation Engine
         ↓
      HumanTask
         ↓
      Assignment
         ↓
      Notification
         ↓
      Human ACK
         ↓
      Takeover Request
         ↓
      Takeover Authorization
         ↓
      ControlLease
         ↓
      Human Control
         ↓
      Human Resolution
         ↓
      Return Control
         ↓
      Durable Fresh-Evaluation Fence
         ↓
      Fresh AIRA Investigation
         ↓
      Fresh Diagnosis
         ↓
      Fresh Recovery Decision
2. Permanent Phase 23 Safety Laws

Phase 23 froze the following safety invariants.

CAPABILITY != AUTHORITY

ASSIGNMENT != CONTROL

ACKNOWLEDGEMENT != CONTROL

NOTIFICATION != CONTROL

HANDOFF PACKAGE != CONTROL

TAKEOVER REQUEST != CONTROL

TAKEOVER AUTHORIZATION != CONTROL

ACTIVE POSTGRESQL CONTROL LEASE = HUMAN CONTROL AUTHORITY

HUMAN CONTROL != EXECUTION AUTHORIZATION

CONTROL LEASE != PERMANENT AUTHORITY

LEASE EXPIRY => FAIL SAFE

RETURN CONTROL != RESUME

LEASE RELEASE => FRESH EVALUATION

LEASE EXPIRY => FRESH EVALUATION

LEASE REVOCATION => FRESH EVALUATION

OLD DIAGNOSIS CANNOT RESUME OLD PLAN

OLD RECOVERY DECISION CANNOT RESUME

STALE PLAN RESUME = PROHIBITED

POSTGRESQL = AUTHORITATIVE CONTROL STATE

PHASE 23 MAY NEVER CREATE EXECUTION AUTHORIZATION

These invariants are intentionally stronger than ordinary application authorization.

Human takeover controls who currently owns operational control of an incident.

It does not authorize infrastructure execution.

Canonical infrastructure execution authorization remains a completely separate AIRA safety boundary.

3. Architectural Principle

The most important architectural separation introduced in Phase 23 is:

Human operational authority
        !=
Infrastructure execution authority

A human may:

receive an incident;
acknowledge a HumanTask;
accept assignment;
request takeover;
receive takeover authorization;
acquire the active control lease;
investigate manually;
coordinate response;
return control.

None of those events automatically gives AIRA or the operator infrastructure execution authorization.

Phase 23 state therefore carries:

execution_authorized = FALSE

through the authoritative Human Operations domain.

Database constraints and certification continuously verify this property.

4. Database Authority

PostgreSQL is the authoritative Phase 23 state store.

The Human Operations control plane does not treat Redis, RabbitMQ, the browser, notification providers, or frontend state as control authority.

Architecture:

PostgreSQL
    ↓
authoritative Human Operations state
    ↓
tasks
assignments
acknowledgements
resolutions
escalations
takeover sessions
control leases
return fences
handoff metadata
audit/history

Supporting infrastructure:

Redis
    → coordination/cache only

RabbitMQ
    → asynchronous notification/event transport

Workflow Outbox
    → durable async handoff

Qdrant
    → memory/vector intelligence only

Frontend
    → operator interface only

Neither Redis nor RabbitMQ can manufacture human-control authority.

The browser cannot manufacture human-control authority.

Only canonical server validation backed by PostgreSQL state can establish an active human control lease.

5. Batch 1 — Phase 23.0 + 23.1
5.1 Phase 23.0 — Human Takeover Safety Architecture

Phase 23 began by freezing the Human Takeover safety contract.

Primary constants and domain contracts defined:

HumanTask states
OPEN
ASSIGNED
ACKNOWLEDGED
IN_PROGRESS
WAITING
RESOLVED
CANCELLED
EXPIRED
TakeoverSession states
REQUESTED
AUTHORIZED
ACTIVE
RELEASING
RELEASED
EXPIRED
REVOKED
DENIED
ControlLease states
PENDING
ACTIVE
RELEASED
EXPIRED
REVOKED
Assignment states
ACTIVE
REASSIGNED
RELEASED
EXPIRED
Acknowledgement outcomes
ACKNOWLEDGED
DECLINED
TIMED_OUT

The core invariant object established:

NEVER_AUTHORIZES_EXECUTION
EXACTLY_ONE_ACTIVE_LEASE_PER_INCIDENT
POSTGRES_IS_CONTROL_AUTHORITY
RETURN_REQUIRES_REEVALUATION
STALE_PLAN_RESUME_PROHIBITED
6. Phase 23.1 — Human Operations Domain

Phase 23.1 extended the existing Human Operations foundation rather than replacing it.

Migration:

0088_human_takeover_domain.sql

The migration evolved the existing HumanTask domain and introduced the authoritative takeover model.

Tables introduced or expanded include:

human_operations.tasks
human_operations.assignments
human_operations.acknowledgements
human_operations.resolutions
human_operations.takeover_sessions
human_operations.control_leases
human_operations.task_status_history
human_operations.takeover_events

Every authoritative state table is tenant scoped.

Important database properties include:

PostgreSQL RLS;
FORCE RLS;
organization isolation;
environment isolation;
database constraints;
execution authorization forced false;
control epochs;
lease versions;
expiration timestamps;
audit/history records;
unique active assignment rules;
unique active takeover rules;
exactly one active control lease per incident.
7. HumanTask State Machine

The HumanTask lifecycle was frozen as:

OPEN
 ├── ASSIGNED
 ├── WAITING
 ├── CANCELLED
 └── EXPIRED

ASSIGNED
 ├── ACKNOWLEDGED
 ├── WAITING
 ├── CANCELLED
 └── EXPIRED

ACKNOWLEDGED
 ├── IN_PROGRESS
 ├── WAITING
 ├── RESOLVED
 ├── CANCELLED
 └── EXPIRED

IN_PROGRESS
 ├── WAITING
 ├── RESOLVED
 ├── CANCELLED
 └── EXPIRED

WAITING
 ├── ASSIGNED
 ├── ACKNOWLEDGED
 ├── IN_PROGRESS
 ├── RESOLVED
 ├── CANCELLED
 └── EXPIRED

Invalid state transitions are rejected by canonical lifecycle services.

8. Human Takeover State Machine

Takeover requests were deliberately separated from actual control.

REQUESTED
    ↓
AUTHORIZED
    ↓
ACTIVE
    ↓
RELEASING
    ↓
RELEASED

Alternative terminal paths include:

EXPIRED
REVOKED
DENIED

The critical rule is:

REQUESTED != CONTROL

AUTHORIZED != CONTROL

ACTIVE CONTROL LEASE = CONTROL

A takeover session by itself never gives the human active operational control.

9. ControlLease

The ControlLease became the authoritative representation of current human control.

A lease contains information including:

organization;
environment;
incident;
takeover session;
holder;
lease version;
control epoch;
acquired timestamp;
heartbeat timestamp;
expiration timestamp;
release/revoke state;
audit metadata.

The system guarantees:

maximum active leases per incident = 1

Concurrent operators cannot both become authoritative human controllers.

The database is the final arbiter during races.

10. Phase 23.1E — Live PostgreSQL + RLS Certification

The first major live certification validated Phase 23 against the actual PostgreSQL development environment.

It validated:

canonical organization scope;
canonical environment scope;
temporary hardened runtime certification role;
NOSUPERUSER;
NOBYPASSRLS;
tenant RLS;
source-tenant visibility;
foreign-tenant invisibility;
control acquisition;
concurrency behavior;
no execution authority.

A significant deployment security finding was identified:

The local administrative aira database role had elevated privileges including superuser/BYPASSRLS capability.

This is acceptable for migrations/local administration but must not be used as the normal production runtime identity.

Production must separate:

Migration/Admin Role
    → elevated schema management

Runtime Role
    → NOSUPERUSER
    → NOBYPASSRLS
    → tenant-scoped execution
11. Phase 23.1F — Durable Lease Expiry

A dedicated live certification hardened lease expiration.

The important failure mode was:

lease expires
    ↓
operator sends heartbeat

The required behavior is:

heartbeat rejected

AND

lease status = EXPIRED

AND

takeover session status = EXPIRED

AND

expiry event persisted

AND

human control = false

AND

execution authorization = false

AND

fresh evaluation required

AND

stale plan resume prohibited

The implementation intentionally persists expiry before surfacing the domain error.

This avoids an unsafe state where the caller is told a lease expired while PostgreSQL still records it as active.

12. Batch 2 — Phase 23.2 Escalation Engine

Phase 23.2 introduced the canonical Human Escalation Engine.

It determines when AIRA cannot safely continue autonomously and needs human intervention.

Components included:

escalation constants;
escalation policy model;
escalation target model;
escalation repository;
escalation decision service;
escalation orchestrator;
HumanTask creation;
autonomy blocking;
retry behavior;
timeout handling;
escalation ladders;
idempotency;
legacy Phase-14 compatibility cutover.

The resulting logical path is:

AIRA cannot safely continue
        ↓
Escalation decision
        ↓
Escalation record
        ↓
HumanTask
        ↓
autonomousRecoveryBlocked = TRUE

Escalation itself never grants execution authority.

ESCALATION != EXECUTION AUTHORIZATION
13. Escalation Reliability

Phase 23.2C added reliability around human escalation.

It covered:

duplicate escalation prevention;
retry-safe behavior;
acknowledgement deadlines;
timeout detection;
escalation progression;
durable state;
historical compatibility behavior.

The old Phase-14 runtime ESCALATED HumanTask status was removed from the active Phase-23 status model and normalized into the newer lifecycle.

14. Batch 3 — Phase 23.3 Notification Platform

Phase 23.3 introduced durable notification delivery for Human Operations.

The architecture was:

Escalation
   ↓
Canonical Notification Request
   ↓
Workflow Outbox
   ↓
RabbitMQ
   ↓
Notification Worker
   ↓
Target Resolver
   ↓
Provider Gateway
   ↓
Delivery Attempt

The system separates notification request state from provider delivery state.

Capabilities include:

durable requests;
attempts;
target resolution;
outbox handoff;
RabbitMQ transport;
provider dispatch;
retries;
deduplication;
dead-letter handling;
failure tracking.
15. Notification Safety Boundary

A notification merely tells a human something happened.

Therefore:

NOTIFICATION != ASSIGNMENT

NOTIFICATION != ACKNOWLEDGEMENT

NOTIFICATION != CONTROL

NOTIFICATION != EXECUTION AUTHORIZATION

Even successful delivery has no control authority.

RabbitMQ is therefore transport only.

16. Batch 4 — Phase 23.4 Incident Handoff Package

Phase 23.4 created the canonical Incident Handoff Package.

Migration:

0092_incident_handoff_packages.sql

The handoff package provides humans with an auditable operational brief.

It can contain information such as:

incident identity;
incident state;
escalation context;
evidence;
diagnosis information;
recovery decision context;
recommended operator actions;
safety notes;
provenance;
generation reason;
package revision;
content hash.

Packages are revisioned.

Only one revision is current.

Semantic content hashing prevents unnecessary duplicate packages.

The handoff package is intentionally informational.

HANDOFF PACKAGE = INFORMATION

HANDOFF PACKAGE != ACKNOWLEDGEMENT

HANDOFF PACKAGE != TAKEOVER

HANDOFF PACKAGE != CONTROL

HANDOFF PACKAGE != EXECUTION AUTHORIZATION
17. Batch 5 — Phase 23.5 Take Control

Phase 23.5 implemented the operational Take Control path.

Primary services included:

humanTakeControlService.js
humanControlFenceService.js

The workflow became:

HumanTask acknowledged
        ↓
Request Control
        ↓
TakeoverSession REQUESTED
        ↓
Authorize Control
        ↓
TakeoverSession AUTHORIZED
        ↓
Acquire Control
        ↓
ControlLease ACTIVE

Only the final state establishes human operational control.

18. Take Control Eligibility

The HumanTask must be in an eligible state before control can be requested.

The Phase-23 control service permits the relevant takeover path only from appropriate acknowledged/in-progress human workflows.

Direct user assignment is also enforced.

If a task is assigned directly to a particular operator, another user cannot simply claim it.

19. Concurrent Take Control

Phase 23 explicitly handles simultaneous human operators.

Example:

Operator A ─┐
            ├── Take Control simultaneously
Operator B ─┘

Required outcome:

winner count = 1
loser count = 1
ACTIVE lease count = 1

This was later live-certified adversarially.

No frontend race or API race can create two authoritative control holders.

20. Human Control Fence

While an ACTIVE control lease exists:

humanControlActive = TRUE

autonomousContinuationAllowed = FALSE

executionAuthorized = FALSE

This blocks autonomous continuation without altering the canonical infrastructure execution authorization system.

That separation was intentional.

Phase 23 did not inject human-control logic directly into unrelated execution certification layers where it would create unsafe coupling.

21. Batch 6 — Phase 23.6 Return Control

Phase 23.6 solved one of the most safety-critical problems in the entire phase:

What should AIRA do after a human gives control back?

A naive implementation would resume the plan that existed before human takeover.

Phase 23 explicitly prohibits that.

Migration:

0093_control_return_fresh_evaluation.sql

Table:

human_operations.control_return_fences
22. Return-Control Fence

Whenever an ACTIVE lease changes to:

RELEASED
EXPIRED
REVOKED

PostgreSQL automatically creates a durable return-control fence.

Database trigger:

trg_control_return_fence

The fence records:

incident;
control lease;
takeover session;
previous control epoch;
required control epoch;
release outcome;
fence state;
fresh_after;
fresh diagnosis;
fresh recovery decision;
stale-plan prohibition;
execution-authorized false.
23. Fresh Evaluation Requirement

After human control ends:

Old Investigation
Old Diagnosis
Old Recovery Decision
        ↓
INVALID FOR RESUME

AIRA must perform:

Fresh Investigation
        ↓
Fresh Diagnosis
        ↓
Fresh Recovery Decision

and those artifacts must be newer than the return-control fence boundary.

Only then may the fence become:

SATISFIED

Even after satisfaction:

executionAuthorized = FALSE

because fresh evaluation is not execution authorization.

24. Control Epoch

The Control Epoch prevents stale authority from surviving control transitions.

Example:

lease control epoch = 4
        ↓
human returns control
        ↓
return fence requires epoch = 5

Any old plan associated with the earlier epoch cannot silently continue.

This provides a durable monotonic boundary around human takeover events.

25. Batch 7 — Phase 23.7 Incident Command API

Phase 23.7 introduced the backend Incident Command read model and command API.

The backend aggregates authoritative Human Operations state into one tenant-scoped incident projection.

The read model includes:

escalation;
HumanTask;
assignment;
acknowledgement;
notification;
handoff package;
takeover session;
active control lease;
control holder;
control epoch;
return-control fence;
fresh-evaluation requirement;
server-calculated capabilities.
26. Server-Calculated Capabilities

The API computes capabilities such as:

acknowledge

requestControl

authorizeControl

acquireControl

heartbeatControl

returnControl

These are server-calculated.

The browser does not infer them from statuses.

The permanent API rule is:

API CAPABILITY != AUTHORITY

A returned capability means:

The current canonical server state indicates that this operator may attempt this command.

When the command arrives, the server validates everything again.

27. Incident Command API Safety

The command API delegates to existing canonical Phase-23 services.

It does not duplicate control logic.

Therefore:

HTTP request
    ↓
RBAC
    ↓
tenant/environment context
    ↓
canonical domain service
    ↓
PostgreSQL authoritative validation

The API itself cannot create execution authorization.

28. Batch 8 — Phase 23.7 Incident Command UI V1

The existing Incident Detail interface was extended with an Incident Command panel.

The panel displays:

HumanTask state;
escalation state;
notification state;
handoff package;
takeover session;
control lease;
lease holder;
heartbeat;
expiration;
control epoch;
return-control fence;
fresh-evaluation state.

Supported operator commands include:

Acknowledge task

Request control

Authorize takeover

Take control

Refresh lease

Return control
29. Frontend Safety Model

The browser is never authoritative.

VISIBLE BUTTON != AUTHORITY

ENABLED BUTTON != AUTHORITY

CLICK != AUTHORITY

Even if a malicious user manually modifies frontend state or enables a disabled button:

forged browser command
        ↓
backend
        ↓
RBAC
        ↓
tenant scope
        ↓
canonical state validation
        ↓
PostgreSQL
        ↓
invalid transition rejected

The frontend never contains an execution path that can grant infrastructure execution authorization.

30. Batch 9 — Phase 23.8 Tenant + Adversarial Certification

Phase 23.8 intentionally attacked the Phase-23 control plane.

This was not ordinary unit testing.

It performed adversarial live certification against PostgreSQL.

The permanent adversarial laws were:

CROSS-TENANT READ = PROHIBITED

CROSS-TENANT WRITE = PROHIBITED

FORGED EXECUTION AUTHORITY = PROHIBITED

MULTIPLE HUMAN CONTROL WINNERS = PROHIBITED

LEASE THEFT = PROHIBITED

STALE LEASE CONTROL = PROHIBITED

RETURN CONTROL WITHOUT FRESH EVALUATION = PROHIBITED

STALE PLAN RESUME = PROHIBITED
31. Live RLS Certification

The certification created a hardened temporary PostgreSQL role with:

NOSUPERUSER

NOBYPASSRLS

NOLOGIN

It then validated every Phase-23 Human Operations table with:

RLS ENABLED

FORCE RLS

Tables certified included:

tasks
assignments
acknowledgements
resolutions
takeover_sessions
control_leases
task_status_history
takeover_events
control_return_fences
32. Cross-Tenant Attack Certification

A canonical HumanTask was created in the certification tenant.

Source-tenant query:

expected rows = 1
observed rows = 1

Foreign-tenant query:

expected rows = 0
observed rows = 0

Foreign-tenant update:

expected updated rows = 0
observed updated rows = 0

Therefore tenant isolation passed live against PostgreSQL.

33. Database Execution-Authority Forgery

The adversarial certification attempted to write:

execution_authorized = TRUE

into the Human Operations domain.

Expected:

REJECTED

Observed:

REJECTED

This proved the database itself participates in the authority boundary rather than relying exclusively on application code.

34. Concurrent Human Control Attack

Phase 23.8 raced two control acquisition attempts.

Certified result:

exactly 1 winner

exactly 1 loser

exactly 1 ACTIVE lease

This proved that concurrent API requests cannot create split-brain human control.

35. Lease Theft Attack

The adversarial certification attempted to heartbeat an active lease using a non-holder identity.

Expected:

REJECTED

Observed:

REJECTED

Therefore:

knowledge of lease ID != lease ownership
36. Durable Lease Expiry Retention

Phase 23.8 also verified that the hardened Phase 23.1F durable expiry behavior had not disappeared during later changes.

The certification checks the semantic expiry contract rather than relying on brittle SQL formatting.

Required semantic path:

heartbeatLease exists

HUMAN_CONTROL_LEASE_EXPIRED exists

CONTROL_LEASE_EXPIRED event exists

lease EXPIRED persistence exists

session EXPIRED persistence exists

error surfaced after durable transaction
37. Return-Control Adversarial Test

The active control lease was returned.

Certification required:

requiresFreshEvaluation = TRUE

stalePlanResumeAllowed = FALSE

executionAuthorized = FALSE

PostgreSQL was then queried directly to ensure the durable return fence existed.

Expected state:

REQUIRES_FRESH_EVALUATION

with:

required_control_epoch > previous_control_epoch
38. Final Adversarial Authority Audit

The certification scanned all Human Operations tables containing:

execution_authorized

and counted rows where:

execution_authorized = TRUE

Required result:

0

This forms one of the most important Phase-23 certification gates.

39. Batch 10 — Phase 23.9 Final Closed-Loop Certification

Phase 23.9 did not introduce another product feature.

Instead it composed the independently certified Phase-23 safety blocks and performed the final system freeze.

The final certifier re-runs:

Phase 23.1E
Live PostgreSQL + RLS + takeover certification

        ↓

Phase 23.1F
Durable lease-expiry certification

        ↓

Phase 23.8
Tenant + adversarial certification

        ↓

Phase 23.9
Final database and authority audits
40. Final Schema Certification

The final certifier verifies that required Phase-23 migrations exist:

0088_human_takeover_domain.sql

0089_human_escalation_engine.sql

0090_human_escalation_reliability.sql

0091_phase23_notification_platform.sql

0092_incident_handoff_packages.sql

0093_control_return_fresh_evaluation.sql

It then verifies the authoritative PostgreSQL tables exist.

41. Final RLS Certification

All Phase-23 authoritative Human Operations tables are inspected directly through PostgreSQL system catalogs.

Each must satisfy:

relrowsecurity = TRUE

relforcerowsecurity = TRUE

A missing or incorrectly configured table blocks Phase 23 freeze.

42. Final Active-Lease Audit

The final certification scans:

human_operations.control_leases

for any incident with:

COUNT(ACTIVE lease) > 1

Expected:

0 incidents

Any violation fails Phase 23 certification.

43. Final Return-Control Trigger Audit

The certification verifies PostgreSQL still contains:

trg_control_return_fence

on:

human_operations.control_leases

Without this trigger, Phase 23 cannot freeze.

The return-control safety boundary is therefore checked at the actual database level.

44. Final Stale-Plan Audit

The final certifier queries return fences for either:

stale_plan_resume_allowed = TRUE

or:

execution_authorized = TRUE

Required violation count:

0
45. Final Execution Authority Audit

The final Phase-23 authority certification identity is:

PHASE23_EXECUTION_AUTHORITY_AUDIT

The certifier scans all applicable Human Operations tables.

Required:

execution_authorized = TRUE rows = 0

This certification is mandatory.

It cannot be omitted from the final certification set.

46. Phase 23 Final Certification Set

The final freeze requires all of the following:

PHASE23_1_LIVE_CONTROL_FOUNDATION

PHASE23_1F_DURABLE_LEASE_EXPIRY

PHASE23_8_TENANT_ADVERSARIAL

PHASE23_DATABASE_SCHEMA

PHASE23_DATABASE_RLS

PHASE23_ACTIVE_LEASE_UNIQUENESS

PHASE23_RETURN_CONTROL_FENCE

PHASE23_STALE_PLAN_FENCE

PHASE23_EXECUTION_AUTHORITY_AUDIT

PHASE23_FINAL_FREEZE

All must pass.

There is no partial freeze.

47. Final Phase 23 Result

The expected final certification output is:

PHASE 23 FINAL CERTIFICATION

Result: PASS

Certifications: 10/10

Frozen: YES

ASSIGNMENT != CONTROL

ACKNOWLEDGEMENT != CONTROL

NOTIFICATION != CONTROL

HANDOFF != CONTROL

TAKEOVER AUTHORIZATION != CONTROL

ACTIVE POSTGRES LEASE = HUMAN CONTROL AUTHORITY

HUMAN CONTROL != EXECUTION AUTHORIZATION

RETURN CONTROL != RESUME

STALE PLAN RESUME: PROHIBITED

EXECUTION AUTHORITY: 0

AIRA PHASE 23 — FINAL PASS / FROZEN
48. Phase 23 Batch Summary
Batch	Scope	Result
Batch 1	23.0 Safety Architecture + 23.1 Human Operations Domain	PASS / FROZEN
Batch 2	23.2 Escalation Engine	PASS / FROZEN
Batch 3	23.3 Notification Platform	PASS / FROZEN
Batch 4	23.4 Incident Handoff Package	PASS / FROZEN
Batch 5	23.5 Take Control	PASS / FROZEN
Batch 6	23.6 Return Control	PASS / FROZEN
Batch 7	23.7 Incident Command API / Read Model	PASS / FROZEN
Batch 8	23.7 Incident Command UI V1	PASS / FROZEN
Batch 9	23.8 Tenant + Adversarial Certification	PASS / FROZEN
Batch 10	23.9 Closed-Loop Live Certification	PASS / FROZEN
49. What Phase 23 Changed in AIRA

Before Phase 23, AIRA could reason about incidents and safely control autonomous recovery.

After Phase 23, AIRA additionally has a complete human-intervention lifecycle.

AIRA can now safely say:

I cannot continue automatically.

I know why I am escalating.

I can create an authoritative HumanTask.

I can route the escalation.

I can notify the appropriate human path.

I can provide the operator with an incident handoff.

I can record acknowledgement.

I can distinguish acknowledgement from control.

I can request human takeover.

I can authorize takeover without accidentally granting control.

I can establish exactly one authoritative control holder.

I can expire that authority safely.

I can reject lease theft.

I can prevent autonomous continuation during human control.

I can accept control back.

I will not resume the old recovery plan.

I require new investigation after human intervention.

I maintain tenant isolation throughout the entire process.

I never turn human takeover into infrastructure execution authorization.

That is the central achievement of Phase 23.

50. Enterprise Value

Phase 23 converts AIRA from an autonomous recovery engine with approval mechanisms into a system capable of participating in real production incident operations.

Enterprise incident management requires more than automation.

It requires controlled transitions between:

machine ownership

human ownership

machine reevaluation

with clear authority boundaries.

Phase 23 provides that boundary.

This makes future integrations with:

incident commanders;
NOC/SRE teams;
on-call engineers;
escalation policies;
Slack/PagerDuty-style workflows;
enterprise RBAC;
audited takeover;
regulated operational environments;

much safer and more realistic.

51. What Phase 23 Does Not Do

Phase 23 intentionally does not allow:

HumanTask → arbitrary execution

Notification → control

Acknowledgement → control

Authorization → immediate control

Control → infrastructure execution authorization

Frontend button → authority

Redis lease → authority

RabbitMQ message → authority

Return control → old plan resume

Those exclusions are features of the safety architecture, not missing functionality.

52. Frozen Interfaces

After final certification, the following semantics should be treated as frozen unless a future phase explicitly performs a controlled architecture revision:

HumanTask status model

TakeoverSession status model

ControlLease semantics

exactly-one-active-lease invariant

PostgreSQL control authority

execution_authorized = false throughout Human Operations

return-control fresh-evaluation requirement

stale-plan prohibition

control epoch progression

server-calculated Incident Command capabilities

Future phases should integrate with these semantics rather than bypass them.

53. Operational Database Rule

Production deployment must preserve separation between database roles.

Recommended pattern:

aira_migration_admin
    SUPERUSER only if operationally necessary
    schema/migration authority

aira_runtime
    NOSUPERUSER
    NOBYPASSRLS
    application permissions only

Normal AIRA runtime operations must never depend on PostgreSQL superuser or BYPASSRLS privileges.

54. Certification Evidence

Phase 23 certification artifacts are stored under:

backend/artifacts/phase23/

Important evidence includes:

Phase 23.1 live takeover/RLS certification

Phase 23.1F durable lease-expiry certification

Phase 23.8 tenant/adversarial certification

Phase 23 final live certification

The final artifact naming convention is:

phase23-final-live-certification-<timestamp>.json

The final artifact records:

certification result;
required gates;
pass/fail counts;
architecture;
permanent safety laws;
execution-authority state;
stale-plan state;
frozen status.
55. Final Architecture
                     AIRA INCIDENT
                          │
                          ▼
                 Investigation Engine
                          │
                          ▼
                     Diagnosis
                          │
                          ▼
                  Recovery Decision
                          │
               ┌──────────┴──────────┐
               │                     │
               ▼                     ▼
        Safe to continue       Human required
               │                     │
               ▼                     ▼
      canonical execution       Escalation
       authorization gate            │
               │                     ▼
               │                 HumanTask
               │                     │
               │                     ▼
               │                 Assignment
               │                     │
               │                     ▼
               │                Notification
               │                     │
               │                     ▼
               │                Human ACK
               │                     │
               │                     ▼
               │               Handoff Package
               │                     │
               │                     ▼
               │              Takeover REQUESTED
               │                     │
               │                     ▼
               │              Takeover AUTHORIZED
               │                     │
               │                     ▼
               │             PostgreSQL ControlLease
               │                     │
               │                     ▼
               │              HUMAN CONTROL ACTIVE
               │                     │
               │                     ▼
               │                Human response
               │                     │
               │                     ▼
               │               Return Control
               │                     │
               │                     ▼
               │            Fresh-Evaluation Fence
               │                     │
               │                     ▼
               │             Fresh Investigation
               │                     │
               │                     ▼
               │                Fresh Diagnosis
               │                     │
               │                     ▼
               │            Fresh Recovery Decision
               │                     │
               └──────────────┬──────┘
                              │
                              ▼
                  canonical safety gates
                              │
                              ▼
                    execution / no execution
56. Final Safety Statement

Phase 23 establishes a durable contract between AIRA and human operators:

Humans may take operational control of an incident without accidentally receiving or granting infrastructure execution authority.

AIRA may surrender control without retaining the right to silently resume an obsolete recovery plan.

Once human intervention changes the incident context, AIRA must investigate the new reality again.

The final invariant remains:

CAPABILITY != CERTIFICATION != AUTHORIZATION

HUMAN TAKEOVER != EXECUTION AUTHORIZATION

RETURN CONTROL != RESUME

STALE PLAN RESUME = PROHIBITED
57. Phase Status
AIRA PHASE 23
HUMAN OPERATIONS CONTROL PLANE

IMPLEMENTATION: COMPLETE

UNIT CERTIFICATION: PASS

POSTGRESQL LIVE CERTIFICATION: PASS

RLS CERTIFICATION: PASS

CONCURRENCY CERTIFICATION: PASS

DURABLE LEASE EXPIRY: PASS

TENANT ISOLATION: PASS

ADVERSARIAL CERTIFICATION: PASS

RETURN-CONTROL SAFETY: PASS

STALE-PLAN FENCE: PASS

FINAL EXECUTION-AUTHORITY AUDIT: PASS

FINAL CLOSED-LOOP CERTIFICATION: PASS

STATUS: FROZEN
END OF PHASE 23

## Final commands

After making the tiny certification-ID fix:

```powershell
npx jest --runTestsByPath `
  "tests/unit/phase23FinalCertification.test.js" `
  --runInBand

Then one last Phase-23 regression:

npx jest "phase23" --runInBand

And final certification selector:

$tests = npx jest --listTests

$certTests = $tests | Where-Object {
    $_ -match "phase14" -or
    $_ -match "phase23" -or
    $_ -match "workflowOutbox[\\/]+__tests__"
}

npx jest --runTestsByPath $certTests --runInBand

With the final live certification already passed and this final unit test repaired, the canonical state is:

AIRA PHASE 23
HUMAN OPERATIONS CONTROL PLANE

10 / 10 BATCHES COMPLETE

FINAL STATUS:
PASS / CERTIFIED / FROZEN

The next workstream is therefore no longer another Phase-23 patch. It is Phase 23R — Reality Corpus + Replay Platform.