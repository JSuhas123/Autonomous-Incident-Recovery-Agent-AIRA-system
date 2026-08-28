AIRA — Phase 17 Completion Document
Known-Good State + Temporal Resource Graph

Status: ✅ COMPLETE / MASTER CERTIFIED
Certification date: August 28, 2026
Canonical database: PostgreSQL
Certified environment: aira-dev-org / env_aira_development
Phase 17 stages: 17.0–17.15 complete

1. Purpose of Phase 17

Before Phase 17, AIRA already had a strong incident-management, memory, agent, policy, integration, and System DNA foundation.

What it did not yet possess was a canonical model of:

What infrastructure exists, how resources are connected, how those resources change over time, what healthy state looks like, and what the infrastructure looked like when an incident occurred.

Phase 17 introduced that missing infrastructure intelligence layer.

The fundamental model became:

Infrastructure
      │
      ▼
Canonical Resources
      │
      ├──────────────┐
      ▼              ▼
Resource States   Relationships
      │              │
      ▼              ▼
State History    Relationship History
      │              │
      └──────┬───────┘
             ▼
      Temporal Resource Graph
             │
       ┌─────┴─────────┐
       ▼               ▼
 Known-Good State   Incident State
       │               │
       └───────┬───────┘
               ▼
              Diff
               │
               ▼
       Change Correlation
               │
               ▼
     Agent Resource Context
               │
               ▼
          System DNA

AIRA therefore moved from knowing about incidents to understanding the infrastructure surrounding those incidents.

2. Architectural Principles Frozen in Phase 17

Several architectural decisions are now invariants.

PostgreSQL is authoritative

The Resource Graph is stored canonically in PostgreSQL.

We deliberately did not introduce Neo4j as another source of truth.

Future graph databases may be introduced as:

PostgreSQL
     │
     │ canonical
     ▼
Resource Graph
     │
     │ projection
     ▼
Neo4j / Graph Engine

but never:

Neo4j
  ↓
canonical infrastructure state

unless we explicitly redesign the architecture later.

Resource is domain-neutral

The graph is not Kubernetes-specific.

It can represent:

application.service
kubernetes.cluster
kubernetes.namespace
kubernetes.deployment
kubernetes.replicaset
kubernetes.pod
kubernetes.service
kubernetes.node

container.docker

linux.host

postgres.database
mysql.database
redis.instance

rabbitmq.queue
kafka.topic

cloud.vm
cloud.load_balancer

network.endpoint
network.service

storage.volume

robotics.robot
robotics.controller
robotics.sensor
robotics.actuator

This means future robotics support does not require redesigning the core Resource Graph.

3. Phase 17.0 — Resource Graph Architecture Contract

The first step defined the architecture before implementation.

We established the central entities:

Resource
ResourceType
Capability
ResourceState
KnownGoodState
ResourceRelationship
RelationshipHistory
GraphChangeEvent

and explicitly separated several concepts.

Resource identity

Answers:

What infrastructure object is this?

Resource state

Answers:

What did this Resource look like at a specific point in time?

Relationship

Answers:

How is this Resource connected to another Resource?

Known-Good State

Answers:

Which observed ResourceState has enough evidence to serve as a trusted baseline?

Capability

Answers:

What can technically be done to this Resource?

Capability explicitly does not answer:

Is AIRA authorized to perform it?

That distinction is critical.

Capability
    ≠
Authorization
4. Phase 17.1 — PostgreSQL Canonical Topology Schema

Instead of creating a competing topology.* schema, Phase 17 evolved the existing:

resources.*

schema.

The existing canonical table:

resources.resources

remained the Resource identity authority.

It was extended with fields such as:

display_name
namespace
region
zone
service_id
attributes
status
first_seen_at

while preserving existing fields including:

id
public_id
legacy_mongo_id
organization_id
environment_id
provider
resource_type
external_id
name
labels
current_state
metadata
discovered_at
last_seen_at

current_state remains a compatibility/latest projection.

It is not historical truth.

Historical truth belongs to:

resources.resource_states
5. Phase 17.2 — ResourceType + Capability Contracts

We introduced formal domain contracts for Resource Graph entities.

Important constants/contracts included:

constants/resourceTypes.js
constants/resourceCapabilities.js
constants/relationshipTypes.js
constants/resourceStateTypes.js

and:

contracts/topology/resourceContract.js
contracts/topology/resourceStateContract.js
contracts/topology/relationshipContract.js
contracts/topology/knownGoodStateContract.js
contracts/topology/capabilityContract.js

These prevent provider-specific infrastructure data from leaking unpredictably into the canonical domain model.

Capabilities included technical abilities such as:

read
restart
start
stop
scale
rollback
failover
command
config
secret
cordon
drain
snapshot
restore

plus extensibility for robotics.

Again:

Resource capability
        ↓
technical possibility

NOT

execution authorization
6. Migration 0065 — Temporal Resource Graph Foundation

The main Phase 17 foundation migration created/evolved:

resources.resource_types
resources.capabilities
resources.resource_capabilities
resources.resource_states
resources.known_good_states
resources.resource_relationships
resources.relationship_history
resources.graph_change_events

All tenant-owned tables use organization/environment scope.

RLS and FORCE RLS were enabled to preserve tenant boundaries.

7. Phase 17.3 — Resource Repository

We created:

persistence/postgres/PostgresResourceRepository.js

This became the canonical persistence interface for Resource identity.

It supports operations including:

create
get
find
list
metadata update
mark seen

Public Resource IDs use the convention:

res_<uuid>

while PostgreSQL maintains internal canonical UUIDs.

This preserves the existing AIRA identity architecture:

Public ID
Legacy ID
Canonical PostgreSQL UUID

The repository also uses PostgresTenantScope, ensuring all operations execute within resolved organization/environment context.

8. Phase 17.4 — Immutable ResourceState

One of the most important additions was:

resources.resource_states

A ResourceState captures a Resource observation at time T.

It contains:

resource_id
observed_at

health
lifecycle

configuration
runtime
metrics
attributes

version
fingerprint

source
evidence
metadata

Health values include:

UNKNOWN
HEALTHY
DEGRADED
UNHEALTHY
CRITICAL

Lifecycle values include:

UNKNOWN
DISCOVERED
STARTING
RUNNING
STOPPING
STOPPED
TERMINATED
DELETED
ResourceState is immutable

Migration:

0066_resource_state_immutability.sql

introduced PostgreSQL triggers rejecting:

UPDATE resources.resource_states
DELETE FROM resources.resource_states

with:

RESOURCE_STATE_IMMUTABLE

Therefore infrastructure history cannot silently be rewritten.

A new observation creates a new ResourceState.

9. Phase 17.5 — Known-Good State

Phase 17 introduced evidence-backed baselines through:

resources.known_good_states

and:

PostgresKnownGoodStateRepository
KnownGoodStateService

Known-Good State references an actual immutable ResourceState.

Conceptually:

Resource
   │
   ├── State A
   ├── State B ← Known Good
   ├── State C
   └── State D

Known-Good contains provenance including:

confidence
evidence_count
health_evidence
reason
source
approved_by_human
valid_from
valid_until
status
Critical decision

AIRA does not automatically decide:

HEALTHY
   =
KNOWN GOOD

Healthy state alone is insufficient evidence.

Promotion requires explicit evidence.

Only one ACTIVE known-good baseline exists per Resource.

Replacing a baseline supersedes the previous one rather than destroying history.

10. Phase 17.6 — Resource Relationships

The canonical current graph uses:

resources.resource_relationships

A relationship contains:

source_resource_id
target_resource_id
relationship_type
attributes
source
confidence
valid_from
valid_to
status

Examples:

API ──DEPENDS_ON──> PostgreSQL

API ──CONNECTS_TO──> Redis

Deployment ──OWNS──> ReplicaSet

ReplicaSet ──OWNS──> Pod

Service ──ROUTES_TO──> Pod

Relationships are directional.

Self-reference and invalid confidence values are rejected.

11. Phase 17.7 — Temporal Relationship History

A mutable current graph alone cannot answer:

What did the infrastructure look like yesterday?

So we introduced immutable temporal history through:

resources.relationship_history

and:

resources.graph_change_events

The temporal repository supports:

create
update
remove
reactivate

but every mutation creates historical evidence.

Relationship history records changes such as:

CREATED
UPDATED
REMOVED
REACTIVATED

with:

valid_from
valid_to
attributes_before
attributes_after
source
evidence

Graph Change Events separately record:

change_type
changed_at
before_state
after_state
source
evidence

These records are immutable.

This gave AIRA a genuine temporal graph, rather than merely a current topology table.

12. Phase 17.8 — State Ingestion + Normalization

Infrastructure providers expose wildly different payloads.

For example Kubernetes may provide:

metadata
spec
status
containerStatuses
replicas
conditions

while cloud providers and robotics systems use entirely different structures.

Phase 17.8 therefore introduced normalization.

Important components include:

CanonicalFingerprint.js
KubernetesResourceNormalizer.js
ResourceNormalizerRegistry.js
ResourceStateIngestionService.js

The flow became:

Provider payload
      ↓
Provider Normalizer
      ↓
Canonical Resource identity
      ↓
Canonical ResourceState
      ↓
Deterministic fingerprint
      ↓
PostgreSQL

The canonical fingerprint uses deterministic serialization plus SHA-256.

That allows AIRA to identify meaningful state equality/change consistently.

13. Phase 17.9 — Temporal Topology Query Engine

Once states and relationships had history, AIRA needed to reconstruct the graph at arbitrary time T.

Phase 17.9 introduced the temporal query engine.

Core capabilities include:

getTopologyAtTime(...)
getChangesBetween(...)

The query engine performs bounded traversal with:

depth limits
direction handling
relationship filtering
cycle protection
tenant scope

It can therefore answer:

What resources were connected to this Resource at 10:31:42?

instead of only:

What is connected now?

That distinction becomes critical during incident investigation.

14. Phase 17.10 — Incident-Time Topology Reconstruction

Phase 17.10 connected incidents with the temporal Resource Graph.

Components included:

PostgresIncidentTopologyRepository
IncidentTopologyReconstructionService

For an incident, AIRA reconstructs three snapshots:

PRE-INCIDENT
     │
     ▼
INCIDENT
     │
     ▼
POST-INCIDENT

Conceptually:

T - 5 min           T             T + 5 min

Topology A      Topology B       Topology C
State A         State B          State C

AIRA can then determine what appeared, disappeared, or changed around the incident.

The incident temporal anchor follows:

startedAt
   ↓ fallback
detectedAt
   ↓ fallback
firstDetectedAt
   ↓ fallback
createdAt

Importantly, Phase 17.10 does not guess a Resource from an ambiguous service ID.

An explicit root Resource is required.

15. Phase 17.11 — Known-Good Comparison Engine

Once AIRA had:

Known-Good State
+
Incident-time State

we implemented deterministic comparison.

The engine compares:

configuration
runtime
metrics
attributes
version
health
lifecycle
fingerprint

For example:

KNOWN GOOD

replicas: 4
image: v21
health: HEALTHY

          ↓ DIFF ↓

INCIDENT

replicas: 2
image: v22
health: DEGRADED

The output identifies precise differences.

The fingerprint difference is treated as derived evidence rather than another independent material difference, preventing double counting.

The comparison can also legitimately return:

NO_KNOWN_GOOD

rather than fabricating a baseline.

16. Phase 17.12 — Change Correlation

The next question was:

What changed close to the incident?

Phase 17.12 correlates:

graph changes
known-good divergence
temporal proximity
relationship proximity
available evidence

Candidate changes receive deterministic diagnostic scores.

Examples include:

configuration divergence
version divergence
health divergence
relationship created
relationship removed
dependency changed

A change closer to the incident and directly connected to the affected Resource receives greater diagnostic weight.

But Phase 17 deliberately preserves:

correlation
    ≠
causation

Every result explicitly retains:

causalityEstablished: false
executionAuthorized: false

This is one of the most important safety properties of Phase 17.

17. Phase 17.13 — Agent Resource Context

The previous components produced useful evidence separately.

Phase 17.13 assembled them into one bounded context suitable for AIRA agents.

Agent Resource Context combines:

Resource identity
Current ResourceState
Incident ResourceState
Known-Good ResourceState
State differences
Current dependencies
Historical dependencies
Incident topology
Recent graph changes
Change correlation
Capabilities/context

Conceptually:

              Resource
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
     State    Topology   Known Good
       │         │         │
       └─────────┼─────────┘
                 ▼
             State Diff
                 │
                 ▼
          Change Correlation
                 │
                 ▼
        Agent Resource Context
                 │
                 ▼
              Agents

Agents no longer need to independently query multiple persistence systems and assemble potentially inconsistent infrastructure context.

The service produces a bounded evidence bundle.

And again:

Agent Resource Context
        ≠
Execution authorization
18. Phase 17.14 — Resource Graph ↔ System DNA

Phase 16 had already created System DNA from operational memory.

Phase 17.14 connected Resource Graph evidence to that architecture.

Before:

Operational Memory
       ↓
   System DNA

After:

Operational Memory ──────┐
                         │
                         ▼
                     System DNA
                         ▲
                         │
                  derived evidence
                         │
                  Resource Graph

The important word is derived.

Resource Graph remains canonical infrastructure truth.

System DNA remains derived operational identity.

Graph evidence does not become memory

We explicitly did not increase:

evidenceMemoryIds
evidenceCount
averageMemoryTrust
memoryFamilyCounts

using Resource Graph observations.

Graph evidence receives separate provenance.

DNA fingerprint integration

A major detail was combining:

memory fingerprint
+
Resource Graph evidence fingerprint

into the resulting System DNA fingerprint.

Therefore:

same memory
+
same graph
=
same DNA snapshot

while:

same memory
+
changed graph
=
new DNA snapshot

This allows System DNA to evolve when infrastructure evidence changes without pretending that topology observations are memories.

19. Phase 17.15 — Live Certification

We then tested Phase 17 against the real local PostgreSQL development environment.

Certified scope:

Organization:
aira-dev-org

Environment:
env_aira_development

The certification created isolated temporary resources and tested the actual Phase 17 chain.

Database architecture verified

Live certification confirmed existence and configuration of:

resources.resources
resources.resource_states
resources.known_good_states
resources.resource_relationships
resources.relationship_history
resources.graph_change_events
memory.system_dna_snapshots

RLS and FORCE RLS were verified on Phase 17 Resource Graph tables.

Temporal graph verified

The live fixture created a stable PostgreSQL dependency and a temporary Redis relationship.

Certification proved:

PRE-INCIDENT
API ──────────────> PostgreSQL

INCIDENT
API ──────────────> PostgreSQL
 │
 └───────────────> Redis

POST-INCIDENT
API ──────────────> PostgreSQL

The query engine correctly reconstructed all three temporal states.

Incident reconstruction verified

The real PostgreSQL incident was resolved and anchored correctly.

Pre-, incident-, and post-incident topology snapshots were reconstructed.

Known-Good diff verified

The certification baseline represented:

replicas = 4
image = v21
health = HEALTHY

while incident state represented:

replicas = 2
image = v22
health = DEGRADED

The live comparison detected the drift.

Change correlation verified

The temporary Redis topology change was detected near the incident.

It was recognized as directly touching the affected Resource.

Known-Good divergence also contributed evidence.

But:

causalityEstablished = false
executionAuthorized = false

remained intact.

Agent Resource Context verified

The real context contained:

root Resource
current state
incident state
Known-Good state
state delta
incident topology
dependency changes
correlation evidence

and remained evidence-only.

System DNA integration verified

Resource Graph evidence successfully contributed to real System DNA generation.

The DNA retained:

RESOURCE_GRAPH evidence authority
resourceGraphCanonical = false
systemDnaDerived = true
executionAuthorized = false
20. Immutability Certified Against Real PostgreSQL

Certification explicitly attempted forbidden mutations.

ResourceState UPDATE

Rejected.

ResourceState DELETE

Rejected.

Relationship History UPDATE

Rejected.

Graph Change Event DELETE

Rejected.

This demonstrates that temporal evidence protection is enforced at the database level, not merely through JavaScript conventions.

21. Tenant Isolation Certification Detail

There was one skipped live check.

The certification environment did not contain another suitable organization/environment against which the temporary Resource could be queried.

Therefore:

Cross-scope tenant isolation was not live-tested during this certification run.

We must preserve that wording.

Isolation is still covered through:

RLS
FORCE RLS
tenant-scoped repositories
unit tests
integration tests

but it would be incorrect to call that particular scenario live-certified.

This is the same certification discipline we used in Phase 16.8.

22. Master Certification

After live certification, the Phase 17 master gate ran:

Complete Phase 17 regression
            +
Phase 16 System DNA regression
            +
Phase 17 live PostgreSQL certification

All passed.

Final result:

AIRA PHASE 17 MASTER CERTIFICATION: PASS

Certification artifacts now include:

certify-phase17-live.js

certify-phase17-master.js

phase17-live-certification-results.txt

phase17-master-certification-results.txt

PHASE_17_CERTIFICATION.md
23. Complete Phase 17 Status
Stage	Component	Status
17.0	Resource Graph architecture contract	✅
17.1	PostgreSQL canonical topology schema	✅
17.2	ResourceType + Capability contracts	✅
17.3	Resource repository	✅
17.4	Resource state snapshots	✅
17.5	Known-Good State	✅
17.6	Relationships	✅
17.7	Relationship History / temporal graph	✅
17.8	State ingestion + normalization	✅
17.9	Temporal topology query engine	✅
17.10	Incident-time topology reconstruction	✅
17.11	Known-good comparison/diff	✅
17.12	Change correlation	✅
17.13	Agent Resource Context	✅
17.14	Resource Graph ↔ System DNA	✅
17.15	Live + master certification	✅

Phase 17: COMPLETE.

24. What AIRA Can Do After Phase 17

AIRA can now answer questions that were previously impossible to answer reliably.

“What infrastructure is affected?”
Incident
   ↓
Resource
   ↓
Temporal Graph
   ↓
Dependencies
“What did this Resource look like during the incident?”
Resource
   ↓
ResourceState @ incident time
“What should it normally look like?”
Resource
   ↓
Known-Good State
“What changed?”
Known Good
     │
     ▼
    DIFF
     ▲
     │
Incident State
“Did the infrastructure topology change around the incident?”
Pre topology
     ↓
Incident topology
     ↓
Post topology
“What changed close enough to be diagnostically relevant?”
State changes
Graph changes
Known-good divergence
Temporal proximity
       ↓
Change Correlation
“Can agents consume all of this coherently?”

Yes:

Agent Resource Context
“Can AIRA learn infrastructure characteristics as part of System DNA?”

Yes, while preserving the authority boundary:

Resource Graph = infrastructure truth

Operational Memory = learned historical evidence

System DNA = derived operational identity
25. The Safety Boundary After Phase 17

This is worth freezing explicitly.

None of these grant execution permission:

Resource
ResourceState
Known-Good State
Relationship
Relationship History
Graph Change Event
Temporal Topology
Known-Good Diff
Change Correlation
Agent Resource Context
System DNA
Capability

The correct future execution chain remains:

Observation
     ↓
Diagnosis
     ↓
Resource Graph evidence
     ↓
Memory / DNA evidence
     ↓
Proposed action
     ↓
Policy Engine
     ↓
Authorization
     ↓
Safety checks
     ↓
Execution
     ↓
Verification
     ↓
Outcome
     ↓
Memory

Phase 17 improves what AIRA knows.

It does not loosen what AIRA is allowed to do.

26. Phase 17 Database Architecture After Completion

The core operational architecture is now approximately:

                        PostgreSQL
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
       Incidents         Resources          Memory
          │                 │                 │
          │         ┌───────┼────────┐        │
          │         │       │        │        │
          │         ▼       ▼        ▼        │
          │       States  Relations KnownGood │
          │         │       │        │        │
          │         │       ▼        │        │
          │         │     History    │        │
          │         │       │        │        │
          │         └───────┼────────┘        │
          │                 ▼                 │
          │          Temporal Graph           │
          │                 │                 │
          └────────────┬────┘                 │
                       ▼                      │
              Incident Reconstruction         │
                       │                      │
                       ▼                      │
                Known-Good Diff               │
                       │                      │
                       ▼                      │
                Change Correlation            │
                       │                      │
                       ▼                      │
             Agent Resource Context           │
                       │                      │
                       └──────────┬───────────┘
                                  ▼
                             System DNA

This is a substantial architectural milestone for AIRA.

27. What We Should Freeze

Now that master certification passed, do not casually modify:

0065 temporal graph foundation
0066 ResourceState immutability
0067 Known-Good integrity
0068 relationship integrity
0069 temporal evidence immutability

Resource contracts
ResourceState contracts
Known-Good contracts
Relationship contracts

TemporalTopologyQueryService
IncidentTopologyReconstructionService
KnownGoodComparisonService
ChangeCorrelationService
AgentResourceContextService

Resource Graph ↔ System DNA authority boundary

Future changes should be migrations/extensions rather than rewriting certified history.

28. Phase 17 Final Definition

The simplest description of what we accomplished is:

Phase 17 transformed AIRA from an incident-recovery system that understands alerts and operational history into a system with a canonical, temporal model of the infrastructure itself.

AIRA now understands:

WHAT exists
WHERE it belongs
HOW it is connected
WHAT it looked like before
WHAT it looked like during failure
WHAT good looked like
WHAT changed
WHEN it changed
WHAT may be correlated
WHAT context an agent needs
WHAT the system has learned about that Resource

while still refusing to infer:

correlation = causation

capability = authorization

known-good = permission to restore

graph evidence = permission to execute

That is the foundation we need for the next stage.