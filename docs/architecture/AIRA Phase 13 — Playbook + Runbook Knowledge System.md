AIRA Phase 13 — Playbook + Runbook Knowledge System

Status

COMPLETE / FROZEN AS FOUNDATION

Phase 13 established AIRA's production operational-knowledge layer: a physical, versioned, lifecycle-governed Playbook/Runbook catalogue whose dependencies can be discovered, validated, linted, safely generated/imported, and bound to real deterministic action handlers.

Roadmap note: an older planning document used "Phase 13" for Enterprise Data Architecture. The implementation completed in the current production roadmap re-baselined Phase 13 as the Playbook + Runbook Knowledge System. This README documents the phase that was actually implemented.

The core rule is:

AI chooses/recommends strategy
        ↓
Playbook composes approved procedures
        ↓
Runbook defines deterministic steps
        ↓
ActionHandlerRegistry resolves real capabilities
        ↓
Execution / observation / verification

A YAML file is not considered operationally valid merely because it parses.

1. Why Phase 13 existed

Before this phase, AIRA already had Playbooks and Runbooks, but the catalogue had production risks:

YAML could reference missing Runbooks.

Generic Runbooks could be reused for semantically unrelated incidents.

Lifecycle compatibility was not deeply enforced.

New packs could collide with existing IDs/files.

Tests hard-coded catalogue counts.

Generated knowledge could accidentally overwrite physical knowledge.

Shallow YAML could parse while lacking operational depth.

Runbooks could claim actions with no deterministic handler.

Physical existence could be mistaken for execution readiness.

Domain expansion lacked a repeatable safety pattern.

Phase 13 turned a directory of YAML into a governed operational knowledge system.

2. Physical catalogue discovery

A catalogue scanner discovers physical definitions from:

playbooks/catalogue/**
runbooks/definitions/**

The scanner normalizes data such as:

Playbook ID
Runbook ID
name
semver
lifecycle
domain/naming information
file location
Runbook references
relationship metadata
steps/actions

This scanner became the foundation for manifest, relationship and validation logic.

One important fix was removing hard-coded catalogue counts from tests. The catalogue can now grow without tests failing merely because "21" became "36" or another legitimate count.

3. Canonical naming

Phase 13 formalized Playbook/Runbook ID conventions while preserving known legacy-valid IDs.

Examples:

PB-K8S-...
PB-DB-...
PB-NET-...
PB-OBS-...
PB-MSG-...
PB-CONTAINER-...

RB-K8S-...
RB-DB-...
RB-NET-...
RB-OBS-...
RB-MSG-...
RB-CONTAINER-...

The naming layer distinguishes canonical, legacy-valid and invalid IDs.

4. Catalogue manifest

A physical catalogue manifest was added to answer:

how many Playbooks and Runbooks physically exist;

what domains they belong to;

which Runbooks are referenced;

which required references are missing;

which Runbooks are unused/orphaned;

how catalogue expansion is progressing.

The manifest is based on real physical discovery rather than manually maintained totals.

5. Playbook → Runbook relationship graph

Phase 13 introduced an authoritative dependency graph.

Playbook
   ├── Stage relationship ──→ Runbook
   └── Rollback relationship → Runbook

Edges can preserve:

playbookId / from
runbookId / to
relationType
stageId
stageName
stageType
required
versionConstraint
parameterMappings
targetExists
targetLifecycle

This supports missing-reference detection, lifecycle checks, orphan discovery, future indexing/search and UI visualization.

6. Missing reference enforcement

Required Playbook references must physically resolve.

A required missing Runbook is a blocking catalogue integrity issue.

This fixed multiple early Phase 13 failures where Kubernetes Playbooks pointed at Runbooks that had not yet been implemented.

7. Lifecycle policy

Phase 13 formalized lifecycle compatibility.

Core rule:

ACTIVE Playbook
    └── required dependency
            └── ACTIVE Runbook

An ACTIVE Playbook cannot safely depend on a required DRAFT Runbook.

A Runbook's existence on disk is not the same as execution eligibility. Activation readiness also depends on its deterministic action handlers existing.

8. Catalogue linting and capability enforcement

Catalogue linting validates the complete physical knowledge surface.

It checks concerns such as:

malformed structure;

lifecycle mismatches;

missing dependencies;

unsupported actions;

ownership/scope gaps;

unsafe activation assumptions.

The linter resolves actions against the authoritative action registry.

Therefore:

Runbook says action exists
        ≠
AIRA actually supports the action

No ACTIVE Runbook should depend on an unknown deterministic action.

9. Quality / depth contract

A Phase 13 quality policy prevents shallow YAML from entering production.

Playbook depth includes

stable ID/version;

name/description;

lifecycle;

owner;

scope;

incident matching;

required evidence;

confidence/conditions;

risk;

policy;

approval;

stages;

Runbook references;

escalation;

outcome;

rollback configuration where relevant.

Runbook depth includes

stable ID/version;

lifecycle;

owner;

scope;

risk;

parameters;

deterministic steps;

verification;

rollback configuration;

audit/redaction metadata;

tags.

Syntactically valid but operationally incomplete definitions are rejected.

10. Safe authoring and path boundaries

The knowledge writer/planner constrains physical destinations:

Playbooks → playbooks/catalogue/**
Runbooks  → runbooks/definitions/**

Path traversal and destination escape attempts are rejected.

Bulk-generated knowledge is written to staging rather than directly to production.

Typical staging layout:

knowledge/.generated/<pack>/

This creates a review boundary between candidate knowledge and production knowledge.

11. Generator safety model

Kubernetes and Database established the reusable bulk-generation pattern:

Canonical definitions
        ↓
Definition validation
        ↓
YAML rendering
        ↓
knowledge/.generated/...
        ↓
Quality + authoring validation
        ↓
Import planning
        ↓
Physical catalogue

Generators were designed to:

write deterministically;

stay inside staging;

reject path traversal;

reject duplicate generated IDs;

reject non-allowlisted actions;

preserve production-depth YAML;

refuse accidental overwrite.

12. Conflict-safe and idempotent import

Import planning classifies every candidate as:

NEW
EXISTING_IDENTICAL
ID_CONFLICT
FILE_CONFLICT

NEW

Safe candidate for create-only import.

EXISTING_IDENTICAL

The same semantic definition already exists. It is skipped safely.

ID_CONFLICT

The same ID exists with different content or location. Import fails closed.

FILE_CONFLICT

The destination path is already owned by something else. Import fails closed.

This made imports create-only, collision-safe and repeatable.

13. Post-import idempotency

Phase 13 corrected a subtle validation issue: after a generated pack has been successfully imported, the generated copy and physical copy should be recognized as identical, not treated as a broken duplicate.

The post-import state therefore supports:

generated definition
        =
physical definition
        =
EXISTING_IDENTICAL

This keeps the validation suite green before and after safe promotion.

14. Authoritative ActionHandlerRegistry

Knowledge is bound to:

runbooks/actions/actionHandlerRegistry.js

Registry keys use:

<type>/<action>

Examples:

kubernetes/get_pod
database/check_connection
networking/check_dns
observability/check_metrics_flow
messaging/check_consumer_lag
containers/check_resource_usage

Unknown actions are hard errors.

There is no arbitrary shell fallback.

Each handler is registered with fields/functions such as:

type
action
metadata
validate()
execute()
capturePreState?()
verify?()
rollback?()

This registry is the capability boundary between knowledge and real execution/observation.

15. Capability matrices

Domain capability matrices make AIRA explicit about what it actually supports.

A capability entry can identify:

capability
handlerKey
mode
required
affectedPlaybooks
availability

The matrix compares desired knowledge coverage with the live registry.

This prevents Playbooks from implying capabilities that do not exist.

Domain Packs Completed

16. Kubernetes

Kubernetes established the first major expansion and safe pack workflow.

Work included:

scanner fixes for nested Playbooks;

missing Runbook reference repair;

relationship validation;

Kubernetes capability matrix;

deterministic handler expansion;

staging generation;

quality/authoring validation;

collision checking;

safe import;

post-import idempotency tests.

The generated Kubernetes pack contained:

6 Playbooks
11 Runbooks
17 definitions

Coverage included deployment/node/PVC/DNS/service/endpoints/ingress investigation and recovery verification.

17. Database

The Database domain introduced a broad external-target diagnostic surface for:

PostgreSQL
MySQL
Redis
MongoDB

The authoritative registry loaded 21 deterministic database handlers.

Safety rules included:

targetId required;

external diagnostic target abstraction;

no dependence on AIRA's internal MongoDB connection;

raw credentials rejected;

unsupported target methods fail closed;

read-only observation/verification for this phase.

The Database generator produced:

21 Runbooks
9 Playbooks
30 staged definitions

Legacy database Playbooks were modernized to use dedicated diagnostic Runbooks.

18. Networking

Networking stopped abusing Kubernetes Runbooks for network incidents.

Ten deterministic networking actions

networking/check_connectivity
networking/check_dns
networking/check_latency
networking/check_packet_loss
networking/check_port
networking/check_route
networking/check_tls
networking/check_upstream
networking/check_load_balancer
networking/check_egress

These use networkDiagnosticTargetRegistry.

Safety characteristics:

no shell;

no DNS mutation;

no route mutation;

no firewall mutation;

no certificate replacement;

no load-balancer mutation;

raw credentials rejected.

Networking catalogue

The pack added:

20 Runbooks
12 new Playbooks

Three legacy Playbooks were modernized:

PB-NET-DNS-FAILURE-001
PB-NET-INGRESS-FAILURE-001
PB-NET-TLS-EXPIRY-001

They previously misused RB-K8S-POD-RESTART for unrelated DNS/Ingress/TLS work. They now compose RB-NET-* diagnostics and verification.

19. Observability

The original Observability Playbooks also misused Kubernetes pod restart as a generic diagnostic/recovery primitive.

Twelve observability actions

observability/check_target_health
observability/check_metrics_flow
observability/check_logs_flow
observability/check_traces_flow
observability/check_collector_health
observability/check_scrape_health
observability/check_alert_pipeline
observability/check_alert_delivery
observability/check_exporter_health
observability/check_ingestion_health
observability/check_telemetry_freshness
observability/check_cardinality

These use observabilityDiagnosticTargetRegistry.

Runbook coverage

Twelve reusable Runbooks cover:

backend health;

metrics flow;

log flow;

trace flow;

collector health;

scrape health;

alert pipeline;

alert delivery;

exporter health;

ingestion health;

telemetry freshness;

cardinality.

Playbook coverage

The two legacy Playbooks were modernized:

PB-OBS-ALERT-PIPELINE-001
PB-OBS-TELEMETRY-COLLECTOR-001

Additional Playbooks cover:

metrics flow failure;

log pipeline failure;

trace pipeline failure;

scrape failure;

exporter failure;

stale telemetry;

cardinality explosion;

ingestion failure.

Validation confirmed the domain had no fake Kubernetes restart dependency and that all actions resolved to non-destructive handlers.

20. Messaging / Queues

The legacy PB-MQ-RECOVERY-001 used one generic Runbook for diagnosis, recovery and verification.

Phase 13 replaced that pattern with a dedicated read-only Messaging surface.

Ten messaging actions

messaging/check_broker_health
messaging/check_queue_depth
messaging/check_dlq_depth
messaging/check_consumer_lag
messaging/check_consumer_health
messaging/check_publish_health
messaging/check_delivery_health
messaging/check_partition_health
messaging/check_replication_health
messaging/check_connection_health

These use messagingDiagnosticTargetRegistry.

Unsafe mutation deliberately excluded:

queue purge;

DLQ replay;

offset reset;

consumer restart;

broker restart;

partition reassignment;

message deletion.

Messaging catalogue

Ten reusable diagnostic Runbooks were added.

PB-MQ-RECOVERY-001 was modernized and focused Playbooks were added for:

queue backlog;

DLQ overflow;

broker unavailable;

consumer lag;

publish failure;

consumer failure;

Kafka partition failure;

replication degradation.

Deeper mutation/recovery is intentionally deferred.

21. Containers / Runtime

The original Container Playbooks used RB-K8S-POD-RESTART for diagnosis, mitigation and verification.

Phase 13 introduced a real container-specific diagnostic layer.

Ten container actions

containers/check_container_state
containers/check_container_logs
containers/check_exit_reason
containers/check_restart_history
containers/check_resource_usage
containers/check_resource_limits
containers/check_runtime_health
containers/check_image_state
containers/check_filesystem_usage
containers/check_process_health

These use containerDiagnosticTargetRegistry.

Unsafe operations deliberately excluded:

container restart;

container deletion;

image deletion;

resource mutation;

runtime configuration changes;

arbitrary shell execution.

Container catalogue

The existing Playbooks were modernized:

PB-CONTAINER-CRASH-001
PB-CONTAINER-RESOURCE-EXHAUST-001

Additional Playbooks were added for:

restart storms;

runtime unavailable;

filesystem pressure;

image failure;

process unhealthy;

OOM.

Ten container diagnostic Runbooks cover state, logs, exit reason, restart history, resources, runtime, images, filesystem and process health.

22. Legacy knowledge modernization

One of the most important Phase 13 outcomes was fixing semantically wrong but technically resolvable dependencies.

Examples removed:

DNS investigation
    → RB-K8S-POD-RESTART

TLS verification
    → RB-K8S-POD-RESTART

Alert delivery validation
    → RB-K8S-POD-RESTART

Container resource analysis
    → RB-K8S-POD-RESTART

A simple "does the Runbook ID exist?" test would allow these relationships, but they are operationally nonsensical.

Phase 13 replaced them with domain-specific Runbooks backed by real handler keys.

23. Diagnostic target registry pattern

Multiple domains now follow one adapter architecture:

Runbook action
       ↓
Action Handler
       ↓
Domain Diagnostic Target Registry
       ↓
Explicitly registered adapter

Examples:

networkDiagnosticTargetRegistry
observabilityDiagnosticTargetRegistry
messagingDiagnosticTargetRegistry
containerDiagnosticTargetRegistry
database external diagnostic targets

Provider credentials and SDK connections stay behind adapters rather than inside YAML.

24. Raw credentials are not Runbook inputs

Domain handlers reject credential-like fields such as:

password
secret
token
apiKey
privateKey
credential
credentials
authorization

Playbooks/Runbooks pass a logical identifier such as:

targetId

The adapter owns authentication and connection details.

This prevents the knowledge catalogue from becoming a secret transport mechanism.

25. Read-only first

Phase 13 intentionally chose observation before mutation for new domains.

AIRA must not claim a recovery capability merely because it can diagnose the failure.

Therefore many new Playbooks remain DRAFT/manual/diagnostic until later phases provide:

tested mutation capability;

pre-state capture;

policy constraints;

approval requirements;

rollback;

real-infrastructure validation.

Capability gaps are explicit rather than hidden.

26. Tests

The knowledge/__tests__ suite expanded significantly.

Representative coverage includes:

catalogueManifest
catalogueRelationships
catalogueLinting
catalogueLifecycle
catalogueQualityPolicy
safe catalogue importer
Kubernetes pack/validation/capability matrix
Database capability/handlers/definitions/pack/import
legacy database Playbooks
Networking capability/handlers/pack/validation/import
legacy networking Playbooks
Observability physical catalogue

Final catalogue-wide tests were also run after direct Messaging and Container expansion.

Important assertions include:

zero unexpected missing required Runbook references;

naming compatibility;

no unknown ACTIVE Runbook action;

lifecycle compatibility;

deep YAML requirements;

staging-only generation;

traversal rejection;

no silent overwrite;

semantic idempotency after import;

raw credential rejection;

adapter failure closes safely;

read-only handlers stay non-destructive.

27. Structural health vs execution readiness

Phase 13 distinguishes:

Structural health

YAML parses;

IDs are valid;

references resolve;

no conflicting files;

relationship graph is complete.

Execution readiness

Additionally requires:

lifecycle allows execution;

required dependencies are ACTIVE;

handlers exist;

parameters resolve;

policy/approval permits execution;

capability is actually implemented.

A physical DRAFT definition is not automatically production-authorized.

28. Orphan Runbooks

Unreferenced Runbooks are surfaced but are not automatically deleted or treated as corruption.

A reusable Runbook may be:

prepared for future Playbooks;

invoked manually;

used by another workflow;

temporarily unused during migration.

Orphan detection is governance information.

29. What Phase 13 deliberately deferred

Phase 13 did not try to implement every possible operational procedure.

Deferred work includes:

deep Kafka mutation/recovery;

queue purge/DLQ replay;

offset reset;

broker failover;

container/runtime mutation;

broad Linux host operations;

cloud recovery packs;

CI/CD recovery;

security remediation;

exhaustive storage/network edge cases.

These can be added later using the same foundation.

30. Frozen Phase 13 invariants

Playbooks compose operational strategy.

Runbooks define approved deterministic procedures.

Runbook actions must exist in the authoritative registry.

Unknown actions fail closed.

No arbitrary shell fallback.

Physical existence does not imply execution eligibility.

ACTIVE Playbooks cannot require non-ACTIVE Runbooks.

Required missing references are blocking issues.

Knowledge has stable IDs and versions.

Generated knowledge stages before promotion.

Imports use conflict-safe/create-only semantics.

Existing identical content is idempotent.

ID/file conflicts block import.

Paths cannot escape allowed roots.

Raw credentials do not belong in knowledge parameters.

New domains start read-only unless mutation is explicitly engineered.

Semantically wrong legacy knowledge must be modernized.

Catalogue counts are physically discovered, not permanently hard-coded.

31. Phase 13 architecture after completion

                 PHYSICAL CATALOGUE
                        ↓
                 Catalogue Scanner
                        ↓
          ┌─────────────┴─────────────┐
          ↓                           ↓
       Manifest               Relationship Graph
          └─────────────┬─────────────┘
                        ↓
              Lifecycle + Linting
                        ↓
                Quality Contract
                        ↓
              Capability Resolution
                        ↓
             ActionHandlerRegistry
                        ↓
              Safe Execution Boundary

For bulk knowledge:

Definitions
    ↓
Generator / direct authoring
    ↓
Validation
    ↓
Staging
    ↓
Conflict-safe import
    ↓
Physical catalogue

32. Relationship to Phase 12

Phase 12 created safe intelligence.

Phase 13 created safe operational knowledge.

Together:

Signals / Evidence
        ↓
Phase 12 Intelligence
        ↓
Diagnosis / Risk / Recommendation
        ↓
Phase 13 Knowledge Catalogue
        ↓
Approved Playbook
        ↓
Approved Runbooks
        ↓
Real deterministic handlers
        ↓
Policy / Approval / Authorization
        ↓
Action or safe observation

This is AIRA's autonomy boundary.


34. Final Phase 13 summary

Phase 13 established:

✓ canonical Playbook/Runbook naming
✓ physical catalogue discovery
✓ dynamic manifest
✓ Playbook→Runbook relationship graph
✓ missing-reference detection
✓ orphan visibility
✓ lifecycle enforcement
✓ quality/depth enforcement
✓ capability enforcement
✓ ActionHandlerRegistry integration
✓ safe staging/writer boundaries
✓ path traversal protection
✓ deterministic generators
✓ collision-safe import planning
✓ idempotent post-import behavior
✓ Kubernetes knowledge expansion
✓ Database knowledge pack
✓ Networking knowledge pack
✓ Observability knowledge pack
✓ Messaging knowledge pack
✓ Container/runtime knowledge pack
✓ legacy Playbook modernization
✓ external diagnostic target pattern
✓ raw credential rejection
✓ fail-closed unknown capability behavior
✓ catalogue-wide regression testing

The result is not merely more YAML. It is a governed operational knowledge system.

Maintenance Rule

Phase 13 is frozen as a foundation.

For future knowledge expansion:

1. Define the real capability surface.
2. Register deterministic handlers.
3. Prefer explicit target adapters.
4. Add Runbooks using real handler keys only.
5. Add Playbooks that compose those Runbooks.
6. Keep unsupported mutation DRAFT/manual.
7. Run catalogue integrity/lifecycle/lint tests.
8. Use safe staging/import for bulk-generated knowledge.

Do not weaken these checks just to make a new definition pass.