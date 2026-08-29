AIRA

PHASE 19

Knowledge Coverage Engine

Architecture, Implementation & Live Certification Record

Field

Value

Status

COMPLETE / LIVE CERTIFIED / FROZEN

Certification date

29 August 2026

Canonical persistence

PostgreSQL

Certification organization

aira-dev-org

Certification environment

env_aira_development

Live certification

29 PASS / 1 SKIP / 0 FAIL

Safety invariant

Coverage never grants execution authorization


AIRA Production & Enterprise Master Roadmap


AIRA • Phase 19 Knowledge Coverage Engine • Certification Record

1. Executive Summary

Phase 19 introduces AIRA's Knowledge Coverage Engine: the layer that measures what AIRA actually knows how to recover for the infrastructure an organization operates. Rather than treating the existence of alerts, resources, memories, playbooks, or runbooks as proof of readiness, Phase 19 evaluates the complete recovery path and explicitly exposes blind spots.

The phase is intentionally an assessment and observability layer. It does not execute infrastructure actions, generate arbitrary production commands, mutate Phase 18 recovery knowledge, or bypass policy and authorization. Its central architectural law is: Coverage describes AIRA's recovery readiness; coverage never grants execution authorization.

The final live certification completed successfully with 29 passing checks, one deliberately skipped alternate-scope behavioral isolation check, and zero failures. The certification environment contained 15 resources and no applicable Phase 18 Failure Modes, so the engine correctly reported 15 knowledge gaps and 0% coverage instead of manufacturing recovery competence.

2. Phase Objective

Phase 19 answers a production-critical question: for the real infrastructure visible to AIRA, where does a complete, policy-governed and verifiable recovery path exist, and where does it not?

Customer Infrastructure
  -> Phase 17 Resource Graph
  -> Applicable Phase 18 Failure Modes
  -> Playbook / Runbook completeness
  -> Evidence / Capability readiness
  -> Policy / Approval readiness
  -> Rollback / Verification / Escalation readiness
  -> Historical validation
  -> COVERED | PARTIAL | HUMAN_ONLY | UNKNOWN
  -> Coverage score + prioritized knowledge gaps

3. Architectural Boundaries

PostgreSQL is the canonical Phase 19 coverage store.

Phase 17 Resource Graph remains canonical infrastructure and topology truth.

Phase 18 PostgreSQL knowledge remains canonical Failure Mode, Playbook and Runbook recovery knowledge.

Phase 16 PostgreSQL operational memory contributes evidence, confidence and prioritization only.

Historical execution evidence may affect readiness/confidence, but never grants authorization.

Qdrant is not canonical Phase 19 persistence.

MongoDB is not canonical Phase 19 persistence.

Coverage classification is not an authorization decision.

A technically available capability is not equivalent to permission to use it.

Phase 19 does not self-generate recovery knowledge.

Dynamic rediscovery means new resources and new Phase 18 knowledge can be reflected on the next refresh without changing the Phase 19 schema.

4. Canonical Evaluation Model

The canonical evaluation unit is Resource × FailureModeVersion × Environment. A resource is discovered from the Phase 17 inventory, applicable Failure Mode versions are resolved from Phase 18 knowledge, and the resulting recovery path is assessed across the readiness dimensions implemented in Phase 19.

Classification

Meaning

COVERED

A production-eligible recovery path is known and its required evidence, playbook/runbook procedure, capabilities, policy path, rollback/verification and escalation requirements are ready. It still does not authorize execution.

PARTIAL

A recovery path is known but one or more readiness dimensions are incomplete, missing, weak or insufficiently validated.

HUMAN_ONLY

The recovery path is understood, but policy, risk or approval requirements deliberately require human action.

UNKNOWN

AIRA cannot establish adequate recovery knowledge for the resource/failure context.

5. Frozen Reason Codes

Reason Code

Purpose

NO_FAILURE_MODE

No applicable Phase 18 Failure Mode knowledge exists.

NO_PLAYBOOK

Failure Mode exists but no viable Playbook path is available.

NO_APPROVED_PLAYBOOK

Playbook knowledge exists but is not approved/eligible.

RUNBOOK_MISSING

Required procedural Runbook knowledge is missing.

RUNBOOK_VERSION_UNRESOLVED

Exact Runbook version cannot be resolved.

EVIDENCE_UNAVAILABLE

Required diagnostic or decision evidence is unavailable.

CAPABILITY_MISSING

Required technical capability is unavailable.

POLICY_BLOCKED

Policy prevents the recovery path.

HUMAN_APPROVAL_REQUIRED

Human approval is required before recovery can proceed.

ROLLBACK_MISSING

Required rollback path is unavailable.

VERIFICATION_MISSING

Required post-action verification is unavailable.

UNTESTED_RECOVERY

Recovery path lacks adequate execution validation.

LOW_HISTORICAL_CONFIDENCE

Historical evidence is too weak for strong readiness confidence.

UNSUPPORTED_RESOURCE_TYPE

Resource type is not supported by current recovery knowledge.

6. Phase 19 Stage-by-Stage Implementation

Stage

Name

Outcome

19.0

Coverage Architecture Contract + Existing-System Reconciliation

Defined the coverage boundary, canonical classifications, safety invariants and contracts while preventing duplication of Phase 16/17/18 systems.

19.1

Canonical Coverage Evaluation Model

Established Resource × FailureModeVersion × Environment as the evaluation unit and froze the COVERED/PARTIAL/HUMAN_ONLY/UNKNOWN semantics.

19.2

PostgreSQL Coverage Foundation

Created canonical evaluations, snapshots, snapshot items and gaps with tenant scoping, RLS and execution_authorized=false constraints.

19.3

Phase 17 Resource Inventory Provider

Reused Phase 17 PostgreSQL resource truth rather than creating a second infrastructure inventory.

19.4

Applicable Failure Mode Repository + Resolver

Resolved applicable Phase 18 Failure Mode knowledge from PostgreSQL.

19.5

FailureMode -> Playbook Coverage

Evaluated whether an applicable Failure Mode has a viable Playbook recovery strategy.

19.6

Playbook -> Runbook Procedural Completeness

Validated exact procedural Runbook completeness and version resolution.

19.7

Evidence Readiness Coverage

Measured whether required recovery evidence can be obtained.

19.8

Capability Coverage

Measured technical capability availability without treating capability as authorization.

19.9

Policy / Approval / HUMAN_ONLY Classification

Separated policy-blocked and human-approval paths from technically ready paths.

19.10

Rollback + Verification Readiness

Measured rollback availability and post-action verification readiness separately from command success.

19.11

Escalation Coverage

Ensured a recovery path can represent required human escalation.

19.12

Historical Validation / Effectiveness Readiness

Reused Phase 18 execution history to assess whether recovery paths have credible historical validation.

19.13

Coverage Classification Engine

Implemented deterministic classification precedence.

19.14

Coverage Scoring Engine

Implemented the headline coverage metric and summary counts.

19.15

Unknown Knowledge / Blind-Spot Detection

Converted missing knowledge into explicit gaps rather than silent absence.

19.16

Critical Gap Prioritization

Prioritized gaps using severity/readiness context.

19.17

Phase 17 Topology / Blast-Radius Coverage

Reused temporal resource relationships to add topology context without claiming causation.

19.18

Phase 16 Memory / Incident-Frequency Contribution

Used canonical PostgreSQL memory as historical evidence for confidence/priority only; memory cannot change canonical classification.

19.19

Coverage API + Dashboard

Added refresh/query APIs, immutable snapshots, current/historical gaps, and frontend coverage surfaces.

19.20

Live Certification + Master Certification

Validated the real local PostgreSQL implementation, immutability, RLS, provenance, safety boundaries and dynamic refresh behavior.

7. Core Implementation Components

Area

Primary Components

Contracts/constants

constants/coverage.js; contracts/coverage/coverageContract.js; coverageReasonContract.js; coverageSummaryContract.js

Resource/failure-mode discovery

coverage/ResourceInventoryProvider.js; persistence/postgres/PostgresFailureModeRepository.js

Knowledge path readiness

FailureModePlaybookCoverageResolver.js; PlaybookRunbookCompletenessService.js

Evidence/capability/policy

EvidenceReadinessService.js; CapabilityCoverageService.js; PolicyApprovalCoverageService.js

Recovery safeguards

RollbackReadinessService.js; VerificationReadinessService.js; EscalationCoverageService.js

Historical evidence

PostgresRecoveryExecutionHistoryRepository.js; HistoricalValidationCoverageService.js

Classification/scoring

RecoveryCoverageClassificationEngine.js; RecoveryCoverageScoringEngine.js

Gap intelligence

KnowledgeGapDetectionService.js; CriticalGapPrioritizationService.js; TopologyBlastRadiusCoverageService.js

Memory contribution

MemoryCoverageContributionService.js using PostgresMemoryRepository + MemoryEvidenceAdapter

Orchestration

coverage/CoverageRefreshOrchestrator.js

Persistence

PostgresCoverageEvaluationRepository.js; PostgresCoverageSnapshotRepository.js; PostgresCoverageGapRepository.js

Product/API

CoverageQueryService.js; controllers/coverageController.js; routes/coverageRoutes.js; frontend coverage API/dashboard integration

8. Database Architecture

The canonical Phase 19 PostgreSQL schema is `coverage`. The final live-certified table set is:

Table

Role

coverage.evaluations

Current Resource × FailureModeVersion coverage evaluations.

coverage.snapshots

Immutable aggregate coverage posture at refresh time.

coverage.snapshot_items

Immutable evaluation-level contents of a snapshot.

coverage.gaps

Current unresolved knowledge/readiness gaps.

coverage.snapshot_gaps

Immutable historical gap posture bound to a snapshot.

All five tables were live-certified with row-level security enabled and forced, organization/environment ownership, and execution_authorized defaulting to false. Snapshots, snapshot items and snapshot gaps are protected by immutability triggers.

9. Migrations

Migration

Purpose

0075_knowledge_coverage_foundation.sql

Initial Phase 19 coverage schema, evaluations, snapshots, snapshot items, gaps, RLS and immutability foundation.

0076 coverage-gap history migration

Added durable current-gap/history behavior and immutable snapshot_gaps persistence.

0077_coverage_gap_resource_identity.sql

Corrected blind-spot identity semantics so resource_public_id may be null when canonical resource_id/resource_type identifies the gap.

0078_coverage_gap_failure_mode_identity.sql

Corrected NO_FAILURE_MODE/unsupported-resource semantics so Failure Mode identity may legitimately be absent.

The 0077 and 0078 corrections are important production semantics rather than cosmetic relaxations. A NO_FAILURE_MODE gap must not invent a public resource identifier or a fake Failure Mode key merely to satisfy a database constraint.

10. Classification Precedence

1. No applicable Failure Mode
      -> UNKNOWN + NO_FAILURE_MODE

2. Failure Mode exists but no viable Playbook
      -> UNKNOWN + NO_PLAYBOOK

3. Recovery path exists but readiness deficiencies remain
      -> PARTIAL

4. Recovery path otherwise ready but human approval is required
      -> HUMAN_ONLY

5. Recovery path fully ready
      -> COVERED

In every case:
      executionAuthorized = false

11. Coverage Scoring

The frozen headline metric is:

Coverage % =
    COVERED applicable failure-mode evaluations
    ------------------------------------------------ × 100
    all applicable failure-mode evaluations

When no applicable Failure Modes exist, the stored headline percentage is 0. This does not mean the engine failed; the blind-spot layer separately records the absence of applicable knowledge.

12. Dynamic Refresh Behavior

CoverageRefreshOrchestrator dynamically rediscovers Phase 17 resources and Phase 18 Failure Mode knowledge on every refresh. It evaluates the currently visible knowledge state, persists current evaluations, creates a new immutable snapshot, persists current and historical gaps, calculates coverage, and adds topology/memory/history context where relevant.

A newly discovered resource can appear in the next refresh without a Phase 19 schema change.

New Phase 18 Failure Mode/Playbook/Runbook knowledge can become assessable on the next refresh.

Old snapshots are not overwritten.

Phase 19 does not create Phase 18 definitions or versions.

Dynamic knowledge discovery is explicitly recorded in snapshot generation provenance.

13. API and Dashboard Layer

The Phase 19 API surface includes:

GET  /api/v1/coverage/summary
GET  /api/v1/coverage/resources
GET  /api/v1/coverage/failure-modes
GET  /api/v1/coverage/domains
GET  /api/v1/coverage/gaps
GET  /api/v1/coverage/history
POST /api/v1/coverage/refresh

The frontend coverage model includes the four classifications, coverage summary, resource/failure-mode views, immutable history and gap data. The product wording must never imply that a high coverage percentage grants permission to execute.

14. Security and Safety Invariants

Invariant

Phase 19 behavior

Execution authorization

Always false; coverage is evidence/readiness only.

Tenant isolation

Organization/environment ownership + forced PostgreSQL RLS.

Historical integrity

Snapshots, items and snapshot gaps are immutable.

Knowledge authority

Phase 18 remains canonical; Phase 19 assesses but does not author recovery knowledge.

Infrastructure authority

Phase 17 remains canonical resource/topology truth.

Memory authority

Phase 16 memory is evidence, not knowledge truth or authorization.

Capability semantics

Capability means technically possible, not permitted.

Causality

Topology and historical correlation are not treated as proof of causation.

Arbitrary execution

Coverage services contain no direct arbitrary command-execution authority.

15. Testing and Certification Coverage

The Phase 19 implementation was developed with focused unit suites covering:

coverage contracts and frozen constants

PostgreSQL foundation and repositories

Failure Mode / Playbook / Runbook resolution

evidence, capability and policy readiness

rollback, verification, escalation and historical validation

classification and scoring

gap detection, topology and prioritization

dynamic refresh behavior

snapshot/API persistence

durable current and historical gap persistence

master architecture/safety invariants

16. Final Live PostgreSQL Certification

Metric

Certified result

PASS

29

SKIP

1

FAIL

0

Resources discovered

15

Applicable Failure Modes

0

Current evaluations

0

Current active gaps

15

Latest snapshot gaps

15

Latest coverage

0.000%

Historical snapshots at final run

6

Coverage authorizes execution

false

Final certified snapshot:

cov_snapshot_d34f46c8-69f2-4bb5-8e1c-096bf445f6e8

17. What the Live Certification Proved

A real PostgreSQL connection to the `aira` database was used.

The certification organization and environment resolved correctly and the environment belonged to the organization.

The coverage schema and all five canonical tables existed.

All canonical Phase 19 records defaulted execution_authorized to false.

Never-authorize CHECK constraints were present.

RLS was enabled and forced on every canonical Phase 19 table.

Snapshot-history immutability triggers existed.

Resource-level blind spots without evaluations were supported.

A real Phase 19 refresh completed against the local database.

Current evaluations and gaps persisted canonically in PostgreSQL.

An immutable snapshot and immutable snapshot gap history were created.

The headline formula and classification totals were consistent.

Live UPDATE attempts against snapshot history were rejected.

No current evaluation authorized execution.

Coverage refresh appended new historical snapshots rather than overwriting history.

All coverage tables retained organization/environment ownership.

Persisted provenance identified Phase 19 PostgreSQL coverage, Phase 18 PostgreSQL knowledge, Phase 17 Resource Graph infrastructure and Phase 16 PostgreSQL memory correctly.

18. Certification Caveat

One check was deliberately skipped: live alternate-scope behavioral isolation. The local certification database did not contain a second real environment suitable for that test. The certification therefore does not claim that cross-tenant behavior was live-tested in this run. Tenant/environment ownership and forced RLS were structurally verified across all five Phase 19 tables.

19. Interpretation of the 0% Result

The final 0% result is a meaningful production finding, not a failed Phase 19 implementation. AIRA discovered 15 infrastructure resources, but the certification environment contained no applicable Phase 18 Failure Mode versions for those resources. Consequently there were no Resource × FailureModeVersion evaluations to classify as COVERED. Phase 19 created 15 current blind-spot gaps, each representing missing applicable recovery knowledge.

This demonstrates the purpose of the phase: AIRA refuses to equate infrastructure visibility with recovery competence. Future Phase 18 knowledge additions can be discovered by Phase 19 during refresh and should progressively convert blind spots into explicit UNKNOWN/PARTIAL/HUMAN_ONLY/COVERED evaluations as appropriate.

20. Phase 19 Final State

Area

Final state

Architecture

Frozen

PostgreSQL schema

Live-certified

Resource discovery

Phase 17 reused

Recovery knowledge

Phase 18 reused

Operational memory

Phase 16 reused as evidence

Coverage classification

Implemented

Coverage scoring

Implemented

Blind-spot detection

Implemented

Gap prioritization

Implemented

Topology contribution

Implemented

Historical validation

Implemented

Immutable snapshots

Implemented and live-tested

Current/historical gaps

Implemented and live-tested

API/dashboard layer

Implemented

Execution authorization

Explicitly false

Certification

29 PASS / 1 SKIP / 0 FAIL

21. Freeze Declaration

PHASE 19 — KNOWLEDGE COVERAGE ENGINE

STATUS: COMPLETE
STATUS: LIVE CERTIFIED
STATUS: FROZEN
CERTIFICATION DATE: 2026-08-29
CANONICAL COVERAGE STORE: POSTGRESQL
COVERAGE AUTHORIZES EXECUTION: FALSE

Future work should consume Phase 19 through its contracts, repositories, services and APIs rather than duplicating its responsibilities. Any future phase that needs infrastructure competence, recovery readiness or knowledge-gap information should treat Phase 19 as the canonical assessment layer.

22. Handoff to Phase 20 Mapping

Before Phase 20 implementation begins, the latest repository should be mapped against the Production & Enterprise Master Roadmap. The mapping should identify what Phase 20 is intended to own, what functionality already exists in Phases 16–19 or earlier components, which files are reusable, which legacy paths should be retired, the database authority for the phase, safety boundaries, migrations required, test/certification gates, and the exact stage-by-stage implementation plan. No Phase 20 code should be introduced until that reconciliation is complete.

AIRA • Phase 19 Knowledge Coverage Engine • Certification Record