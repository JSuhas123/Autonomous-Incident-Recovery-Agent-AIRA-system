AIRA

Phase 18 — Production Knowledge System

Architecture, Implementation & Master Certification Record

Status: COMPLETE • LIVE-CERTIFIED • FROZEN

Certification date: 29 August 2026

Canonical operational database: PostgreSQL


1. Executive Summary

Phase 18 transforms AIRA’s previously fragmented playbook/runbook catalogue and recovery reasoning into a production-grade knowledge system. PostgreSQL is the canonical authority for operational knowledge and execution history; immutable Playbook and Runbook versions make historical execution reconstructible; deterministic reasoning evaluates evidence, hypotheses, capabilities, risk, policy requirements, rollback, verification and escalation; and AI is constrained to selecting approved recovery strategies rather than inventing infrastructure commands.

The phase also retires MongoDB/Mongoose as an active authority for AIRA’s Playbook, Runbook and recovery-execution runtime while deliberately preserving MongoDB as a supported customer infrastructure technology. Phase 18 integrates the Phase 16 operational-memory evidence layer and Phase 17 temporal resource graph without allowing either to authorize execution.

2. Final Phase 18 Architecture

Incident
  ↓
Candidate Failure Modes
  ↓
Evidence Requirements
  ↓
Investigation / Hypotheses
  ↓
Historical Effectiveness
  ↓
Phase 16 Memory Evidence
  ↓
Phase 17 Resource Graph / Known-Good Evidence
  ↓
Knowledge Retrieval + Ranking
  ↓
AI Strategy Selection (approved candidates only)
  ↓
Approved Playbook Version
  ↓
Deterministic Runbook Composition
  ↓
Exact Runbook Version(s)
  ↓
Capability / Risk / Policy / Approval Requirements
  ↓
Existing Authorization Layer
  ↓
Execution
  ↓
Verification
  ↓
Rollback / Escalation

The core rule is: AI chooses the recovery strategy; Playbooks deterministically compose approved operational procedures. There is no supported LLM → arbitrary shell command → production path.

3. Database and Authority Model

System

Phase 18 Role

Authority

PostgreSQL

Definitions, immutable versions, execution history, tenant scope

Canonical

Qdrant

Candidate retrieval / semantic projection when used

Non-canonical

YAML catalogue

Authored/importable knowledge source and domain packs

Non-canonical at runtime

MongoDB/Mongoose

Legacy migration/history compatibility only for this recovery domain

Retired from active authority

Customer MongoDB

Infrastructure AIRA can monitor, diagnose and recover

Supported target technology

4. Phase 18 Invariants

PostgreSQL is canonical operational knowledge truth.

Qdrant is retrieval acceleration only and cannot become canonical truth.

Failure Modes, Playbooks and Runbooks cannot authorize execution.

Capability means technically possible, not permitted.

Historical success is evidence, not authorization.

Memory is historical evidence, not knowledge truth or authorization.

The Resource Graph is structural/temporal evidence, not authorization.

System DNA remains derived operational identity.

Correlation is not causation.

AI may choose among eligible approved strategies but cannot invent production commands or Runbook steps.

Playbooks orchestrate approved procedures; Runbooks define approved procedures.

Published/executed historical versions are immutable and exact executed versions are reconstructible.

Verification is distinct from command success.

Rollback is explicitly defined or explicitly unavailable.

Missing required evidence lowers or blocks eligibility/confidence.

Missing required capability blocks technical applicability.

Policy and authorization remain authoritative.

Tenant isolation applies to tenant-private knowledge and execution history.

Human escalation remains available.

Robotics and future domains can be added without redesigning the core knowledge engine.

5. Stage-by-Stage Implementation Record

18.0 — Existing Knowledge Audit + Architecture Contract

Audited the existing Playbook/Runbook catalogue, registries, execution engines, Mongo dependencies, versioning, recovery reasoning and domain packs. Froze the authority model and AI safety boundary before migration.

18.1 — FailureMode Model

Introduced the domain-neutral FailureMode knowledge contract. Failure modes represent candidate explanations and evidence requirements; they do not authorize execution.

18.2 — Knowledge Domain Taxonomy

Established a domain taxonomy capable of Kubernetes, databases, networking, observability, messaging, cloud, CI/CD, security and future robotics knowledge without changing the core model.

18.3 — PostgreSQL Canonical Knowledge Foundation

Migration 0070 created the knowledge schema and canonical definition/version tables for domains, Failure Modes, Playbooks and Runbooks, including tenant scope, provenance, checksums, JSONB definitions and RLS.

18.4 — PlaybookDefinition + Immutable Versions

Migration 0071 and PostgresPlaybookRepository established canonical Playbook definitions and immutable version history.

18.5 — RunbookDefinition + Immutable Versions

Migration 0072 and PostgresRunbookRepository established canonical Runbook definitions and immutable version history.

18.6 — Mongo Playbook/Runbook Canonical Retirement

Rewired Playbook and Runbook registries to PostgreSQL. Ordinary tenant runtime cannot mutate global/system knowledge; controlled global import remains a separate path.

18.7 — PostgreSQL Execution History + Runtime Cutover

Migration 0073 created durable Playbook/Runbook execution history. PostgreSQL execution repositories and compatibility adapters replaced active Mongoose execution authority. Migration 0074 hardened initial pending→canonical version binding.

18.8 — Investigation + Hypothesis Framework

Added deterministic hypothesis generation from Failure Modes and evidence assessments, with explicit non-authorizing outputs.

18.9 — Evidence Requirement Engine

Evaluates required evidence, missing evidence, completeness and confidence. Missing required evidence can block or lower confidence.

18.10 — Capability Requirements

Evaluates required capabilities against resource/available capabilities. Technical applicability is separate from authorization.

18.11 — Risk + Policy Requirements

Evaluates effective risk, explicit policy decision and approval requirements. Missing policy fails closed.

18.12 — Rollback Definitions

Normalizes rollback definitions and makes rollback availability explicit rather than implied.

18.13 — Verification Definitions

Separates post-action verification from command/process success and detects missing verification definitions.

18.14 — Escalation Definitions

Normalizes escalation triggers/destinations and guarantees human escalation remains available.

18.15 — Historical Effectiveness

Uses durable PostgreSQL execution history as evidence for strategy quality. Historical outcomes influence reasoning but cannot authorize future execution.

18.16 — Knowledge Retrieval + Ranking

Ranks eligible knowledge candidates while retaining PostgreSQL as canonical truth. Retrieval projections cannot bypass canonical rehydration/eligibility.

18.17 — Phase 16 Memory Integration

Introduces operational memory as historical evidence for recovery reasoning while retaining executionAuthorized=false.

18.18 — Phase 17 Resource Graph Integration

Introduces topology, known-good and change-correlation evidence into reasoning while explicitly preserving correlationIsCausation=false.

18.19 — AI Strategy Boundary + Production Domain-Pack Safety

Constrained AI to approved eligible Playbook selection; deterministic composition resolves stored Runbook references; production linting rejects unsafe direct execution composition and active shell-style knowledge.

18.20 — Retirement Audit + Live/Master Certification

Hardened Playbook→Runbook execution lineage, audited active runtime for Mongo/Mongoose authority, certified the real PostgreSQL schema/environment, ran master architecture/regression gates and froze Phase 18.

6. PostgreSQL Migrations

Migration

Purpose

0070_production_knowledge_foundation.sql

Canonical knowledge schema, definitions/versions, scope, provenance, RLS.

0071_playbook_version_integrity.sql

Playbook version integrity/immutability.

0072_runbook_version_integrity.sql

Runbook version integrity/immutability.

0073_execution_history_foundation.sql

Durable Playbook and Runbook execution history.

0074_execution_version_binding_integrity.sql

Allows exactly the intended initial pending→canonical version bind, then freezes execution version identity.

7. Core Phase 18 Components

Knowledge contracts/constants: constants/knowledge.js, constants/knowledgeDomains.js, contracts/knowledge/failureModeContract.js

Canonical repositories: PostgresPlaybookRepository, PostgresRunbookRepository, PostgreSQL execution repositories

Runtime execution adapters: PostgresPlaybookExecutionAdapter, PostgresRunbookExecutionAdapter

Reasoning: EvidenceRequirementEngine, HypothesisEngine, CapabilityRequirementEngine, RiskPolicyRequirementEngine, RollbackDefinitionEngine, VerificationDefinitionEngine, EscalationDefinitionEngine

Knowledge intelligence: Historical effectiveness, retrieval/ranking, Memory evidence and Resource Graph evidence integration

AI safety/strategy: AiRecoveryStrategyBoundary, DeterministicPlaybookComposer, ProductionKnowledgeSafetyLinter, ProductionDomainPackPolicy

8. Execution Versioning and Forensic Lineage

Every execution must be attributable to the exact immutable knowledge used at that time. The execution layer stores version references, snapshots/checksums and tenant/incident context. The final Phase 18 hardening also propagates the parent Playbook execution identity into Runbook execution, including normal, verification and rollback paths.

PlaybookExecution
  executionId
  exact Playbook version/checksum
       ↓
RunbookExecution
  playbookExecutionId = parent execution
  exact Runbook version/checksum
       ↓
step attempts / verification / rollback / outcome

This lineage is forensic metadata only. Parent linkage does not grant or imply authorization.

9. AI Safety Boundary

The AI strategy boundary accepts reasoning/ranking output and may select only an eligible approved Playbook ID. Operational fields such as commands, shell, scripts, actions, Runbook steps and execution plans are forbidden from AI proposals. If no eligible candidate exists, the system returns no strategy and requires human review.

Allowed:
AI → select PB-123 from eligible candidates

Forbidden:
AI → "kubectl delete ..."
AI → invent Runbook steps
AI → create arbitrary shell/script
AI → bypass capability/policy/approval
AI → executionAuthorized=true

10. MongoDB Retirement Boundary

Phase 18 retires MongoDB/Mongoose only as an active internal authority for Playbook, Runbook and recovery execution runtime. Legacy model files, migration/backfill utilities and compatibility tooling may remain when they are not imported by active recovery runtime. The generic repository migration layer is not blindly deleted because other AIRA domains may have independent migration plans.

This must not be confused with customer MongoDB support. Domain knowledge such as database.mongodb remains valid and is intentionally retained so AIRA can monitor and recover customer MongoDB deployments.

11. Certification Record

The user confirmed all Phase 18 unit/regression gates passed and the Phase 18 live PostgreSQL certification passed against the real local development environment.

Certification Item

Result

Knowledge architecture/contracts

PASS

PostgreSQL knowledge foundation

PASS

Playbook immutable versioning

PASS

Runbook immutable versioning

PASS

PostgreSQL execution foundation/repositories

PASS

Runtime PostgreSQL cutover

PASS

Playbook golden path regression

PASS

Mongo knowledge/runtime retirement audits

PASS

Reasoning foundation

PASS

Operational requirements

PASS

Knowledge intelligence / Phase 16–17 evidence integration

PASS

AI strategy boundary / production safety

PASS

Playbook→Runbook execution lineage

PASS

Live PostgreSQL certification

PASS

Master Phase 18 certification

PASS

12. Live Certification Scope and Accuracy

Live certification used the real local PostgreSQL development environment with organization public ID `aira-dev-org` and environment public ID `env_aira_development`. The live gate verified PostgreSQL connectivity, canonical Phase 18 schemas/tables/keys, execution-history safety defaults, version checksum representation, tenant-ownership structure, execution-lineage schema support, integrity mechanisms and other Phase 18 database requirements.

Certification language must remain precise: if no suitable second organization/environment existed during the live run, do not claim a live cross-tenant attack/isolation test. Tenant isolation is supported by schema/RLS, repository scope handling and automated tests; only explicitly executed live checks should be described as live-tested.

13. Production Knowledge Domains

Kubernetes — Required production domain

PostgreSQL — Required production domain

MongoDB customer infrastructure — Required/support retained

Networking — Required production domain

Observability — Required production domain

Messaging — Required production domain

Cloud — Extensible/optional pack

CI/CD — Extensible/optional pack

Security — Extensible/optional pack

Robotics — Extensible/optional; validates domain-neutral architecture

14. What Phase 18 Does Not Do

It does not replace the existing policy or authorization system.

It does not permit knowledge, AI, memory, graph evidence, capability or historical success to authorize execution.

It does not make Qdrant canonical.

It does not treat YAML files as runtime canonical truth.

It does not allow arbitrary LLM-generated production commands.

It does not delete customer MongoDB recovery support.

It does not prove causation merely because a topology/state change correlates with an incident.

15. Phase 18 Completion Checklist

✓ PostgreSQL canonical knowledge authority

✓ PostgreSQL canonical execution-history authority

✓ Immutable Playbook versions

✓ Immutable Runbook versions

✓ Exact executed versions reconstructible

✓ Playbook→Runbook execution lineage preserved

✓ Active recovery runtime free of Mongo/Mongoose authority

✓ Customer MongoDB infrastructure support retained

✓ Evidence-driven Failure Modes

✓ Capability requirements enforced as applicability, not authorization

✓ Risk/policy/approval requirements represented

✓ Rollback explicitly defined or unavailable

✓ Verification distinct from command success

✓ Human escalation available

✓ Historical effectiveness non-authorizing

✓ Phase 16 Memory integration non-authorizing

✓ Phase 17 Resource Graph integration non-authorizing

✓ Correlation ≠ causation

✓ AI constrained to approved strategy selection

✓ Deterministic Playbook→Runbook composition

✓ No arbitrary AI production-command path

✓ Golden path regression passed

✓ Live PostgreSQL certification passed

✓ Master certification passed

16. Freeze Decision

Phase 18 is COMPLETE, LIVE-CERTIFIED and FROZEN. Future phases should consume the Phase 18 knowledge contracts, repositories, reasoning services and strategy boundaries rather than creating parallel authorities or bypass paths. Any future modification to Phase 18 should preserve the certified invariants and be accompanied by regression and architecture certification.

17. Handoff to Phase 19 Mapping

Phase 19 should begin with repository mapping rather than immediate implementation. The mapping must treat Phases 16–18 as certified foundations and identify what already exists before introducing new components. In particular, Phase 19 planning must preserve PostgreSQL authority, exact execution/version lineage, policy/authorization boundaries, Memory-as-evidence, Resource-Graph-as-structural-truth, and the AI strategy boundary established here.

Certified foundation entering Phase 19:

Phase 16 → Operational Memory + System DNA
Phase 17 → Known-Good State + Temporal Resource Graph
Phase 18 → Production Knowledge + Safe Recovery Strategy

                    ↓
              PHASE 19 MAPPING

END OF PHASE 18 CERTIFICATION RECORD