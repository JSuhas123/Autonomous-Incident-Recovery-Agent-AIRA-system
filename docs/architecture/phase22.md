AIRA Phase 22 — Recovery Certification + Autonomy Reputation

Status

Phase 22: LIVE CERTIFIED / PASS / FROZEN

Final certification result: 65 / 65 master checks passed.

Final certification artifact:

backend/artifacts/phase22/phase22-final-live-certification-2026-09-01T21-21-42-102Z.json

Phase 22 established the production-grade certification and autonomy-reputation layer that determines how much autonomy each recovery capability has actually earned from evidence.

The most important architectural rule introduced and preserved throughout the phase is:

CAPABILITY != CERTIFICATION != AUTHORIZATION

A capability existing in AIRA does not mean it is certified.

A capability being certified does not mean it is authorized to execute.

A high autonomy level does not bypass the canonical execution authorization system.

Phase 22 intentionally remained non-authorizing.

1. Purpose of Phase 22

Phase 21 proved that AIRA could be tested against controlled infrastructure failures and that recovery behavior could be observed, measured, verified, and certified inside the Reliability Lab.

Phase 22 answered the next question:

Given the evidence collected from real recovery experiments, how much autonomy should a specific AIRA recovery capability be trusted with?

The phase introduced a formal certification system where autonomy is earned per capability through real evidence, statistical confidence, safety constraints, tenant policy, environment policy, risk posture, and runtime controls.

The phase did not introduce unrestricted autonomous recovery.

Instead, it created a bounded progression model where AIRA may move from observation to recommendation, approval-gated execution, and eventually autonomous recovery only after sufficient evidence exists.

2. Autonomy Reputation Model

Phase 22 defined the following autonomy ladder:

Level

Meaning

L0 — Observe

AIRA may observe and collect evidence.

L1 — Diagnose

AIRA may diagnose and explain probable causes.

L2 — Recommend

AIRA may recommend recovery actions.

L3 — Approval-Gated Execution

AIRA may prepare an executable recovery path, but a human/canonical approval path is required.

L4 — Bounded Autonomous Recovery

AIRA may become eligible for autonomous recovery within strict certified boundaries.

L5 — High-Confidence Autonomous Recovery

Highest software-infrastructure autonomy level within an explicitly authorized domain.

Important:

L3 != autonomous execution
L4 = first autonomous recovery level
L5 != unrestricted authority

Even L4/L5 still require the existing canonical execution authorization path before infrastructure mutation can occur.

3. Phase 22 Architectural Laws

The phase established and validated these safety laws:

Certification != authorization
Historical success != current authorization
Reputation != authorization
Promotion != authorization
Tenant settings != authorization
Environment settings != authorization
Autonomy level != authorization

Tenant autonomy settings may only REDUCE certification.
Environment controls may only REDUCE certification.
Policy may only REDUCE certification.
Risk may only REDUCE certification.
Kill switch always wins.

Expired certification cannot authorize eligibility.
Revoked certification cannot authorize eligibility.
Suspended certification cannot authorize eligibility.

Production certification is separate from lab certification.
Physical and safety-critical domains have stricter ceilings.

The effective autonomy level is computed conceptually as:

effectiveAutonomy =
    MIN(
        capabilityCertification,
        tenantCeiling,
        environmentCeiling,
        policyCeiling,
        riskCeiling
    )

After that calculation, AIRA still needs canonical execution authorization for an actual action.

4. Phase 22.0 — Certification Architecture Contract

Phase 22.0 established the formal Recovery Certification contract.

The contract defined:

certification as separate from capability existence;

certification as separate from authorization;

autonomy as capability-specific rather than global;

safety ceilings;

evidence requirements;

certification lifecycle states;

production/lab separation;

explicit non-authorizing behavior.

Certification states introduced:

DRAFT
EVALUATING
INSUFFICIENT_EVIDENCE
CERTIFIED
SUSPENDED
REVOKED
EXPIRED
FAILED

The certification contract version used during the foundation work was:

22.0-22.1-v1

5. Phase 22.1 — Certified Capability Identity

Phase 22.1 introduced deterministic identities for certifiable recovery capabilities.

A capability certification identity is not simply an action name. It represents the exact recovery capability being evaluated.

The implementation uses deterministic SHA-256 identity generation so the same capability definition resolves to the same identity.

The supported certification domains were defined as:

SOFTWARE_INFRASTRUCTURE
DATA_INFRASTRUCTURE
SECURITY_SENSITIVE
PHYSICAL_SYSTEM
SAFETY_CRITICAL

Domain ceilings were defined as:

Domain

Maximum certification ceiling

SOFTWARE_INFRASTRUCTURE

L5

DATA_INFRASTRUCTURE

L4

SECURITY_SENSITIVE

L3

PHYSICAL_SYSTEM

L2

SAFETY_CRITICAL

L1

This ensures a software recovery certificate cannot silently become a physical-system autonomy certificate.

Main files

backend/constants/recoveryCertification.js
backend/contracts/certification/recoveryCertificationContract.js
backend/contracts/certification/certifiedCapabilityContract.js
backend/services/certification/certifiedCapabilityIdentity.js
backend/tests/unit/phase22RecoveryCertificationArchitecture.test.js

6. Phase 22.2 — PostgreSQL Certification Evidence Store

Phase 22.2 introduced the authoritative PostgreSQL persistence layer for recovery certification.

Migration:

0087_recovery_certification_foundation.sql

The following schema was introduced:

certification.certified_capabilities
certification.certification_runs
certification.evidence_links
certification.metric_snapshots
certification.autonomy_evaluations
certification.certificates
certification.certificate_constraints
certification.status_history
certification.revocations

All nine tables are tenant-scoped.

All nine tables contain:

organization_id
environment_id
execution_authorized

execution_authorized defaults to:

FALSE

and each table has a database-level constraint preventing certification data from becoming execution authority.

The final live certification verified:

RLS enabled:          true
FORCE RLS:            true
Organization scoped:  true
Environment scoped:   true
Tenant policy:         present
Execution authority:  false

for all nine tables.

Repository

backend/persistence/postgres/PostgresRecoveryCertificationRepository.js

Key operations include:

createCertifiedCapability
getCertifiedCapability

createCertificationRun
updateCertificationRunStatus

appendEvidenceLink
appendMetricSnapshot
appendAutonomyEvaluation

issueCertificate
getCertificate
getLatestCertificateForCapability

appendCertificateConstraint
appendCertificateStatus
revokeCertificate

Historical evidence, certificate history, and revocations are treated as immutable certification records.

7. Phase 22.3 — Phase 21 Evidence Ingestion

Phase 22 does not manufacture its own recovery truth.

Instead, it consumes frozen Phase 21 Reliability Lab evidence.

Phase 22.3 created a read-only evidence bridge from Phase 21 into the certification system.

Main files

backend/persistence/postgres/PostgresPhase21CertificationEvidenceReader.js
backend/services/certification/phase21EvidenceIngestionService.js
backend/tests/unit/phase22Phase21EvidenceIngestion.test.js

The ingestion layer validates that:

Phase 21 evidence is read-only;

frozen Phase 21 evidence is not mutated;

artifact and canonical evidence hashes are preserved;

Phase 20 authorization evidence may be referenced;

Phase 21 itself never becomes an execution authority;

production certification cannot be inferred;

ground truth leakage is rejected.

This preserves the core boundary:

Phase 21 = observed reliability evidence
Phase 22 = certification decision
Phase 20 = canonical execution authorization

8. Phase 22.4 — Recovery Outcome Statistics

Phase 22.4 introduced structured recovery metrics.

The certification scorecard includes:

totalTests
successfulDetections
diagnosisCorrectRate
recoverySelectionCorrectRate
executionSuccessRate
verifiedRecoveryRate
falseRecoveryRate
recurrenceRate
rollbackSuccessRate
unsafeActionRejectionRate
unauthorizedActionCount
authorityLeakCount
manualEscalationRate
verificationCoverage
evidenceCompleteness

This allows certification to be based on measured recovery behavior rather than a simple PASS/FAIL counter.

Main files

backend/services/certification/recoveryCertificationMetrics.js
backend/services/certification/recoveryOutcomeStatisticsService.js

9. Phase 22.5 — Statistical Confidence + Evidence Sufficiency

One of the most important safeguards added in Phase 22 was evidence sufficiency.

A result such as:

1 successful recovery / 1 experiment = 100%

is not treated as enough evidence for high autonomy.

Phase 22 uses Wilson 95% confidence intervals for proportion-based metrics.

Default sufficiency expectations include:

minimum samples:                  30
minimum independent experiments:  3
minimum failure modes:             1
minimum infrastructure contexts:  1
verification coverage:            >= 0.95
evidence completeness:            >= 0.95
critical metric samples:          >= 30
maximum evidence age:             90 days

unauthorized actions:             0
authority leaks:                  0
safety violations:                0

Possible evidence outcomes:

SUFFICIENT
INSUFFICIENT_EVIDENCE
SAFETY_BLOCKED

Main file

backend/services/certification/evidenceSufficiencyService.js

10. Phase 22.6 — Autonomy Qualification Engine

Phase 22.6 introduced the engine that converts evidence into an earned autonomy level.

The engine considers:

diagnosis correctness;

recovery-selection correctness;

execution success;

verified recovery;

false recovery;

recurrence;

rollback success;

verification coverage;

evidence completeness;

unsafe actions;

authority leaks;

statistical confidence;

sample count;

number of experiments;

failure-mode diversity;

infrastructure-context diversity.

Qualification policy

L1

minimum samples: 10
diagnosis lower confidence bound >= 0.70

L2

minimum samples: 20
diagnosis >= 0.80
recovery selection >= 0.75
verification >= 0.80

L3

sufficient evidence required
minimum samples: 30
minimum experiments: 3
diagnosis >= 0.90
recovery selection >= 0.88
verified recovery >= 0.85
false recovery upper bound <= 0.05
recurrence <= 0.10
rollback success >= 0.80
verification coverage >= 0.95
evidence completeness >= 0.95
clean safety record required

L4

minimum samples: 400
minimum experiments: 10
minimum failure modes: 2
minimum infrastructure contexts: 2

diagnosis >= 0.95
recovery selection >= 0.94
execution success >= 0.95
verified recovery >= 0.95

false recovery upper bound <= 0.01
recurrence <= 0.03
rollback success >= 0.95

verification coverage >= 0.99
evidence completeness >= 0.99

L5

minimum samples: 2000
minimum experiments: 30
minimum failure modes: 3
minimum infrastructure contexts: 3

diagnosis >= 0.98
recovery selection >= 0.98
execution success >= 0.99
verified recovery >= 0.99

false recovery upper bound <= 0.002
recurrence <= 0.01
rollback success >= 0.99

verification coverage >= 0.995
evidence completeness >= 0.995

These thresholds intentionally make L4/L5 difficult to earn.

11. Phase 22.7 — L0–L5 Promotion Matrix

The promotion system evaluates whether a capability has earned the next level.

Promotion is evidence-driven.

It is never:

one successful test -> autonomous recovery

Instead, promotion depends on:

statistical evidence
+
independent experiments
+
safety history
+
verified recovery
+
rollback behavior
+
recurrence behavior
+
false recovery behavior
+
environment diversity

A promotion result such as:

PROMOTION_ELIGIBLE

means the capability may be considered for a higher certification level.

It does not mean:

executionAuthorized = true

12. Phase 22.8 — Safety Caps + Automatic Demotion

Phase 22.8 introduced safety caps that can reduce a capability regardless of its historical success.

Examples:

authority leak
    -> L0 / FAILED

production-boundary violation
    -> L0 / FAILED

unauthorized action
    -> maximum L2 / SUSPENDED

safety violation
    -> maximum L2 / SUSPENDED

false-recovery upper bound > 0.02
    -> maximum L2

recurrence upper bound > 0.10
    -> maximum L2

verification coverage < 0.95
    -> maximum L2

risky mutation without rollback
    -> maximum L3

This means autonomy can be lost automatically when safety posture deteriorates.

Main files

backend/services/certification/autonomyQualificationPolicy.js
backend/services/certification/autonomySafetyCapService.js
backend/services/certification/autonomyQualificationEngine.js
backend/tests/unit/phase22AutonomyQualificationAndSafetyCaps.test.js

13. Phase 22.9 — Bounded Autonomy Constraints

Phase 22.9 introduced runtime constraints around autonomous recovery.

Even when a capability is certified, the runtime still evaluates:

tenant autonomy mode;

tenant autonomous-recovery switch;

production-autonomy switch;

approval requirements;

confidence threshold;

environment ceiling;

risk;

policy;

kill switch;

verification requirements;

rollback requirements;

execution restrictions.

Autonomy is therefore bounded by the context in which the capability is being used.

14. Phase 22.10 — Runtime Autonomy Eligibility Gate

The runtime eligibility gate converts certification plus current runtime controls into an effective decision.

Runtime decisions include:

OBSERVE
DIAGNOSE
RECOMMEND
REQUIRE_APPROVAL
AUTONOMOUSLY_ELIGIBLE
BLOCKED

Runtime policy version:

22.9-22.11-runtime-autonomy-v1

Policy ceilings:

ELIGIBLE          -> L5
REQUIRES_APPROVAL -> L3
BLOCKED           -> L0
UNKNOWN           -> L0

Risk ceilings:

LOW      -> L5
MEDIUM   -> L4
HIGH     -> L3
CRITICAL -> L0

Tenant autonomy ceilings:

observe           -> L0
recommend         -> L2
approval_required -> L3
autonomous        -> L5

Additional runtime rules include:

allowAutonomousRecovery = false
    -> maximum L3

confidence below tenant minimum
    -> maximum L3

production restrictions
    -> maximum L3 unless explicitly permitted

risk score >= 0.85
    -> L0

risk score >= 0.65
    -> maximum L3

risk score >= 0.40
    -> maximum L4

kill switch blocked/missing
    -> hard L0

The result maps to:

L0 -> OBSERVE
L1 -> DIAGNOSE
L2 -> RECOMMEND
L3 -> REQUIRE_APPROVAL
L4 -> AUTONOMOUSLY_ELIGIBLE
L5 -> AUTONOMOUSLY_ELIGIBLE

For L3/L4/L5, the next authority remains:

CANONICAL_EXECUTION_AUTHORIZATION

The gate itself never grants execution authority.

Main files

backend/services/certification/runtimeAutonomyPolicy.js
backend/services/certification/boundedAutonomyConstraintService.js
backend/services/certification/runtimeAutonomyEligibilityGate.js
backend/tests/unit/phase22RuntimeAutonomyAndReputation.test.js

15. Phase 22.11 — Autonomy Reputation + Continuous Qualification

Autonomy is not permanently earned.

Phase 22.11 introduced a reputation layer that continuously considers:

current autonomy level
previous autonomy level
trend
evidence count
new evidence
confidence
certificate dates
promotion eligibility
demotion risk
suspension
revocation
recertification need

This means future recovery evidence can:

promote
hold
demote
suspend
revoke
require recertification

a capability.

Reputation remains non-authorizing.

16. Phase 22.12 — Physical / Safety-Critical Boundary

Phase 22 explicitly separated software infrastructure recovery from physical and safety-critical systems.

Physical capabilities covered by the boundary include:

ROBOT_STOP
ROBOT_RECALIBRATE
ROBOT_RETURN_HOME

The phase certified that:

PHYSICAL_SYSTEM maximum = L2
SAFETY_CRITICAL maximum = L1

and that these domains cannot reuse a normal software-infrastructure certificate to gain autonomous execution.

The final Phase 22 master certification verified that these boundaries existed and remained non-authorizing.

Main files

backend/constants/safetyCriticalCertificationPolicy.js
backend/services/certification/safetyCriticalDomainBoundaryService.js

17. Phase 22.13 — Certification API + Dashboard Read Model

Phase 22 introduced a read model for exposing certification state to the product layer.

Main files

backend/persistence/postgres/PostgresCertificationReadModelRepository.js
backend/services/certification/certificationReadModelService.js
backend/routes/certificationRoutes.js

The certification API is read-oriented and protected by:

AUTONOMY_READ

The read model exposes certification state without creating execution authority.

18. Phase 22.14 — Adversarial Certification

Phase 22.14 tested the certification system against attempts to violate its safety assumptions.

The adversarial block checked cases including:

trying to infer authorization from certification;

attempting to exceed domain ceilings;

safety-critical/physical boundary violations;

revoked or suspended certification;

runtime-policy reduction;

non-authorizing API behavior.

Test

backend/tests/unit/phase22SafetyCriticalApiAndAdversarial.test.js

19. Phase 22.15 — First Live Capability Certification

Phase 22.15 performed the first real live capability assessment.

Capability:

K8S_POD_CRASH_DEPLOYMENT_RESTART

Failure mode:

kubernetes.pod.crash

The evidence was taken from the frozen Phase 21 Kubernetes reliability experiment.

Frozen Phase 21 sources

phase21-batch7-live-certification-2026-08-31T18-35-58.235Z.json
phase21-batch8a-live-certification-2026-08-31T19-26-48.596Z.json
phase21-batch8b-live-certification-2026-08-31T20-44-20.984Z.json
phase21-batch9-live-certification-2026-09-01T08-37-32-960Z.json

These files represent stages of the same independent experiment.

Therefore Phase 22 correctly counted:

real samples:              1
independent experiments:   1
verified recovery rate:    100%
recurrence rate:           0%
unauthorized actions:      0
authority leaks:           0

The certification engine returned:

Evidence sufficiency:      INSUFFICIENT_EVIDENCE
Qualified autonomy level:  L0
Autonomous eligible:       false
Execution authorized:      false
Production certified:      false

This was an important success.

AIRA deliberately refused to interpret one successful recovery as enough evidence for autonomy.

Live result

PHASE 22.15 — FIRST LIVE CAPABILITY ASSESSMENT: PASS

Artifact:

phase22-15-first-live-capability-2026-09-01T20-57-31-765Z.json

Main files

backend/services/certification/phase21LiveRecoveryEvidenceMapper.js
backend/tests/unit/phase22FirstLiveCapabilityCertification.test.js
backend/scripts/certify-phase22-15-live.js

20. Phase 22.16 — Live Runtime Autonomy Enforcement

Phase 22.16 took the real Phase 22.15 capability and passed it through the runtime autonomy gate.

Real tenant settings were:

Organization:          aira-dev-org
Environment:           env_aira_development
Autonomy mode:         approval_required
Autonomous recovery:   false
Production autonomy:   false
Minimum confidence:    0.95

Real capability:

Certification level:   L0
Effective level:       L0
Decision:              OBSERVE
Autonomous eligible:   false
Next authority:        NONE
Execution authorized:  false

Additional runtime probes verified:

Tenant reduction probe: PASS
Kill-switch probe:      PASS

This proved that runtime settings cannot raise a certification level.

Live result

PHASE 22.16 — LIVE RUNTIME ENFORCEMENT: PASS

21. Phase 22.17 — Promotion / Demotion Enforcement

Phase 22.17 introduced lifecycle enforcement around autonomy reputation.

Lifecycle actions include:

HOLD
PROMOTION_ELIGIBLE
DEMOTION_REQUIRED
SUSPENSION_REQUIRED
REVOCATION_ENFORCED
RECERTIFICATION_REQUIRED

Controlled probes produced:

Promotion probe:    PROMOTION_ELIGIBLE
Demotion probe:     DEMOTION_REQUIRED
Suspension probe:   SUSPENSION_REQUIRED
Revocation probe:   REVOCATION_ENFORCED

All lifecycle results remained:

executionAuthorized = false

The promotion probe was explicitly controlled test evidence and did not promote the real Kubernetes capability.

Main files

backend/services/certification/autonomyLifecycleEnforcementService.js
backend/tests/unit/phase22LiveRuntimeAndLifecycleEnforcement.test.js
backend/scripts/certify-phase22-16-17-live.js

Live result

PHASE 22.17 — PROMOTION / DEMOTION ENFORCEMENT: PASS

Combined artifact:

phase22-16-17-live-certification-2026-09-01T21-02-38-316Z.json

22. Phase 22.18 — Multi-Tenant Autonomy Isolation

Phase 22.18 proved that certification and autonomy state cannot leak between tenants.

The live certification verified all nine certification tables:

autonomy_evaluations
certificate_constraints
certificates
certification_runs
certified_capabilities
evidence_links
metric_snapshots
revocations
status_history

For every table:

RLS=true
FORCE=true
TENANT=true
NONAUTH=true

The hardened RLS certification role was also verified:

superuser:    false
BYPASSRLS:    false

Live RLS canary

Certification role safe:   true
Source sees own row:        true
Foreign tenant sees row:    0
Cross-tenant leak:          false
Cross-tenant write block:   true
Scope restore:              true

Controlled autonomy isolation

The same hypothetical L5 certificate was evaluated under two independent tenant configurations:

Tenant A effective level: L5
Tenant A autonomous:      true

Tenant B effective level: L2
Tenant B autonomous:      false

This demonstrated that one tenant's autonomy posture cannot raise another tenant.

The real Kubernetes capability still remained:

L0

Live result

PHASE 22.18 — MULTI-TENANT AUTONOMY ISOLATION: PASS

Artifact:

phase22-18-multi-tenant-autonomy-isolation-2026-09-01T21-12-34-210Z.json

23. Phase 22.19 — Master Recovery Certification

Phase 22.19 combined the entire certification chain into one final master validation.

The following categories were checked.

Source certification chain

All live source artifacts passed:

22.15 PASS
22.16/22.17 PASS
22.18 PASS

Phase 21 evidence remained immutable.

Production certification remained false.

PostgreSQL certification architecture

The final run verified:

0087 migration applied
9 certification tables present
RLS enabled everywhere
FORCE RLS everywhere
organization scoping everywhere
environment scoping everywhere
execution_authorized present everywhere
execution_authorized defaults false
database constraints prohibit authorization
tenant RLS policies present
RLS certification role exists
RLS certification role is not superuser
RLS certification role cannot BYPASSRLS

Master authority invariants

All passed:

capability != certification
certification != authorization
reputation != authorization
promotion != authorization
tenant settings != authorization
environment settings != authorization
autonomy level != authorization
tenant isolation cannot be bypassed
cross-tenant visibility leak absent
cross-tenant write rejected
cross-tenant autonomy inheritance absent
kill switch cannot be bypassed
real capability did not reach execution authorization
real capability remains non-autonomous
Phase 22 grants no execution authority
Phase 22 grants no production certification

Autonomy qualification invariants

All passed:

one real experiment is not inflated
independent experiment count remains one
real evidence is insufficient
real evidence qualifies only L0
real capability autonomous eligibility false
tenant reduction probe passed
kill switch probe passed
promotion probe is controlled only
controlled promotion did not promote live capability
promotion classified correctly
demotion classified correctly
suspension classified correctly
revocation classified correctly
same certification supports isolated tenant ceilings
actual capability remains L0 after tenant isolation probes

Physical / safety-critical boundary

All passed:

physical-system boundary exists
safety-critical boundary exists
ROBOT_STOP covered
ROBOT_RECALIBRATE covered
ROBOT_RETURN_HOME covered
physical autonomy is capped
restricted-domain service remains non-authorizing

Source artifact immutability

All input artifacts were SHA-256 checked before and after final certification.

All remained unchanged.

Result

PHASE 22.19 — MASTER RECOVERY CERTIFICATION: PASS

24. Phase 22.20 — Final Freeze

After the master certification succeeded, Phase 22 was frozen.

Final result:

AIRA PHASE 22
RECOVERY CERTIFICATION + AUTONOMY REPUTATION

LIVE CERTIFIED
PASS
FROZEN

Final master checks:

65 / 65 PASS

Final artifact:

backend/artifacts/phase22/
phase22-final-live-certification-2026-09-01T21-21-42-102Z.json

The final certificate recorded hashes of the preceding live Phase 22 artifacts so the certification chain is traceable.

25. Final Live Capability State

The first real certified capability remains:

Capability:
K8S_POD_CRASH_DEPLOYMENT_RESTART

Failure mode:
kubernetes.pod.crash

Real evidence samples:
1

Independent experiments:
1

Evidence sufficiency:
INSUFFICIENT_EVIDENCE

Qualified autonomy:
L0

Autonomous eligible:
false

Execution authorized:
false

Production certified:
false

This is the correct result.

The recovery itself succeeded, but there is not yet enough independent evidence to justify autonomy.

26. What Phase 22 Achieved

Before Phase 22, AIRA could perform controlled reliability experiments and collect recovery evidence.

After Phase 22, AIRA now has a formal system capable of answering:

What exact recovery capability is this?

What real evidence exists for it?

How many independent experiments support it?

How reliable is detection?

How accurate is diagnosis?

How accurate is recovery selection?

How often does execution succeed?

How often is recovery actually verified?

How often are recoveries false?

How often does the problem recur?

Can rollback succeed?

Have unauthorized actions occurred?

Have authority leaks occurred?

Is evidence statistically sufficient?

What autonomy level has this capability earned?

Has new evidence improved or damaged its reputation?

Should it be promoted?

Should it be demoted?

Should it be suspended?

Should it be revoked?

What does this tenant allow?

What does this environment allow?

What does policy allow?

What does risk allow?

Is the kill switch active?

Is the capability currently eligible for autonomous recovery?

Does it still require canonical execution authorization?

That is the main architectural achievement of Phase 22.

27. Security and Safety Properties Proven

The final live certification proved that:

Certification grants authority:       false
Reputation grants authority:          false
Tenant controls bypassed:             false
Policy bypassed:                      false
Kill switch bypassed:                 false
Canonical authorization bypassed:     false

Physical autonomy certified:          false
Safety-critical autonomy certified:   false
Unrestricted production autonomy:     false

Execution authorized by Phase 22:     false

Cross-tenant certification isolation was also live-certified.

28. Relationship to Previous Phases

Phase 22 builds directly on earlier AIRA architecture.

Phase 20
Canonical execution authorization
        |
        v
Phase 21
Reliability Lab + real recovery evidence
        |
        v
Phase 22
Recovery Certification + Autonomy Reputation

The boundaries are intentionally separate:

Phase 21 proves what happened.

Phase 22 determines how much confidence/autonomy
that evidence deserves.

The canonical execution system determines
whether the exact requested action may execute.

29. Certification Pipeline Established by Phase 22

The complete intended lifecycle is now:

Failure / Incident
      |
      v
Reliability Experiment
      |
      v
Observed Recovery Evidence
      |
      v
Phase-21 Evidence Ingestion
      |
      v
Recovery Statistics
      |
      v
Evidence Sufficiency
      |
      v
Statistical Confidence
      |
      v
Autonomy Qualification
      |
      v
Safety Caps
      |
      v
Capability Certification
      |
      v
Autonomy Reputation
      |
      v
Tenant Ceiling
      |
      v
Environment Ceiling
      |
      v
Policy Ceiling
      |
      v
Risk Ceiling
      |
      v
Kill Switch
      |
      v
Runtime Autonomy Eligibility
      |
      v
Canonical Execution Authorization
      |
      v
Execution
      |
      v
Recovery Verification
      |
      v
New Evidence
      |
      +------> Reputation / Recertification

The feedback loop allows evidence from future recovery runs to continuously update capability reputation.

30. Files Added / Extended During Phase 22

Major Phase 22 implementation files include:

constants/recoveryCertification.js
constants/safetyCriticalCertificationPolicy.js

contracts/certification/recoveryCertificationContract.js
contracts/certification/certifiedCapabilityContract.js

services/certification/certifiedCapabilityIdentity.js
services/certification/phase21EvidenceIngestionService.js
services/certification/phase21LiveRecoveryEvidenceMapper.js

services/certification/recoveryCertificationMetrics.js
services/certification/recoveryOutcomeStatisticsService.js
services/certification/evidenceSufficiencyService.js

services/certification/autonomyQualificationPolicy.js
services/certification/autonomySafetyCapService.js
services/certification/autonomyQualificationEngine.js

services/certification/runtimeAutonomyPolicy.js
services/certification/boundedAutonomyConstraintService.js
services/certification/runtimeAutonomyEligibilityGate.js
services/certification/autonomyReputationService.js
services/certification/autonomyLifecycleEnforcementService.js

services/certification/safetyCriticalDomainBoundaryService.js
services/certification/certificationReadModelService.js

persistence/postgres/PostgresRecoveryCertificationRepository.js
persistence/postgres/PostgresPhase21CertificationEvidenceReader.js
persistence/postgres/PostgresCertificationReadModelRepository.js

routes/certificationRoutes.js

persistence/postgres/migrations/0087_recovery_certification_foundation.sql

Major certification/test files include:

tests/unit/phase22RecoveryCertificationArchitecture.test.js
tests/unit/phase22RecoveryCertificationPersistence.test.js
tests/unit/phase22Phase21EvidenceIngestion.test.js
tests/unit/phase22RecoveryStatisticsAndEvidenceSufficiency.test.js
tests/unit/phase22AutonomyQualificationAndSafetyCaps.test.js
tests/unit/phase22RuntimeAutonomyAndReputation.test.js
tests/unit/phase22SafetyCriticalApiAndAdversarial.test.js
tests/unit/phase22FirstLiveCapabilityCertification.test.js
tests/unit/phase22LiveRuntimeAndLifecycleEnforcement.test.js
tests/unit/phase22MultiTenantAutonomyIsolation.test.js
tests/unit/phase22MasterRecoveryCertification.test.js

Live certification scripts include:

scripts/certify-phase22-15-live.js
scripts/certify-phase22-16-17-live.js
scripts/certify-phase22-18-live.js
scripts/certify-phase22-final-live.js

31. Live Certification Artifacts

Important Phase 22 artifacts:

phase22-15-first-live-capability-2026-09-01T20-57-31-765Z.json

phase22-16-17-live-certification-2026-09-01T21-02-38-316Z.json

phase22-18-multi-tenant-autonomy-isolation-2026-09-01T21-12-34-210Z.json

phase22-final-live-certification-2026-09-01T21-21-42-102Z.json

These artifacts form the live certification chain for Phase 22.

32. Final Phase 22 State

PHASE 22
RECOVERY CERTIFICATION + AUTONOMY REPUTATION

STATUS:
LIVE CERTIFIED
PASS
FROZEN

MASTER CERTIFICATION:
65 / 65 PASS

POSTGRESQL CERTIFICATION STORE:
PASS

TENANT ISOLATION:
PASS

AUTONOMY ISOLATION:
PASS

PROMOTION / DEMOTION:
PASS

SUSPENSION / REVOCATION:
PASS

PHYSICAL / SAFETY BOUNDARY:
PASS

SOURCE ARTIFACT IMMUTABILITY:
PASS

EXECUTION AUTHORITY:
NONE

UNRESTRICTED PRODUCTION AUTONOMY:
FALSE

33. What Phase 22 Does Not Claim

The Phase 22 freeze does not mean:

AIRA is globally autonomous.

It does not mean:

all capabilities are L5.

It does not mean:

one successful recovery authorizes future execution.

It does not mean:

production autonomy is unrestricted.

It does not mean:

certification bypasses approval or policy.

It means:

AIRA now has a live-certified, tenant-isolated, statistically grounded, safety-bounded system for deciding how much autonomy each recovery capability has earned.

34. Next Phase

With Phase 22 frozen, the next planned stage is:

PHASE 23 — HUMAN TAKEOVER PLATFORM

Phase 23 should extend the existing AIRA human-operations foundation and add:

EscalationPolicy
OnCallTarget
Assignment lifecycle
NotificationAttempt
Acknowledgement history
Take Control session
Incident handoff package
Slack escalation
PagerDuty escalation
Microsoft Teams escalation
Human ownership transfer
Human-resolution lineage
AIRA resume / release control

The Phase 23 safety law should remain:

HUMAN TAKEOVER != EXECUTION AUTHORIZATION
ACKNOWLEDGEMENT != EXECUTION AUTHORIZATION
ASSIGNMENT != EXECUTION AUTHORIZATION
NOTIFICATION != EXECUTION AUTHORIZATION

Only canonical execution authorization may authorize
infrastructure mutation.

Conclusion

Phase 22 transformed AIRA's recovery testing evidence into a formal autonomy-governance system.

The phase established:

capability-specific recovery certification;

deterministic capability identity;

PostgreSQL-backed certification evidence;

immutable evidence lineage;

statistical recovery evaluation;

evidence sufficiency;

confidence-aware autonomy qualification;

L0-L5 autonomy reputation;

safety caps;

automatic demotion;

suspension and revocation;

bounded runtime autonomy;

tenant/environment/policy/risk ceilings;

kill-switch dominance;

physical and safety-critical domain boundaries;

read-only certification APIs;

multi-tenant certification isolation;

live capability certification;

live runtime enforcement;

live lifecycle enforcement;

final master certification.

The final Phase 22 result is:

AIRA PHASE 22
RECOVERY CERTIFICATION + AUTONOMY REPUTATION

LIVE CERTIFIED
PASS
FROZEN

65 / 65 MASTER CHECKS PASS

Certification grants authority:       false
Reputation grants authority:          false
Tenant controls bypassed:             false
Policy bypassed:                      false
Kill switch bypassed:                 false
Canonical authorization bypassed:     false
Physical autonomy certified:          false
Safety-critical autonomy certified:   false
Unrestricted production autonomy:     false
Execution authorized by Phase 22:     false

Phase 22 is complete.