BEGIN;


-- ============================================================================
-- PHASE 17 — KNOWN-GOOD STATE + TEMPORAL RESOURCE GRAPH
--
-- PostgreSQL remains authoritative.
--
-- Existing resources.resources and resources.resource_relationships are
-- evolved rather than replaced.
--
-- Core invariants:
--
--   Resource is domain-neutral.
--   ResourceState is immutable historical evidence.
--   Relationship history is immutable.
--   Known-good requires evidence.
--   Capability is technical ability, not authorization.
--   Graph knowledge never authorizes execution.
-- ============================================================================


CREATE SCHEMA IF NOT EXISTS resources;


-- ============================================================================
-- EVOLVE EXISTING CANONICAL RESOURCE IDENTITY
-- ============================================================================

ALTER TABLE
    resources.resources
ADD COLUMN IF NOT EXISTS
    display_name text NULL;


ALTER TABLE
    resources.resources
ADD COLUMN IF NOT EXISTS
    namespace text NULL;


ALTER TABLE
    resources.resources
ADD COLUMN IF NOT EXISTS
    region text NULL;


ALTER TABLE
    resources.resources
ADD COLUMN IF NOT EXISTS
    zone text NULL;


ALTER TABLE
    resources.resources
ADD COLUMN IF NOT EXISTS
    service_id text NULL;


ALTER TABLE
    resources.resources
ADD COLUMN IF NOT EXISTS
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb;


ALTER TABLE
    resources.resources
ADD COLUMN IF NOT EXISTS
    status text NOT NULL DEFAULT 'ACTIVE';


ALTER TABLE
    resources.resources
ADD COLUMN IF NOT EXISTS
    first_seen_at timestamptz NULL;


-- Existing current_state remains temporarily available as a latest-state
-- compatibility projection.
--
-- It is NOT historical state truth after Phase 17.
--
-- Canonical historical state is resources.resource_states.


CREATE INDEX IF NOT EXISTS
    idx_resources_resource_type
ON resources.resources (
    organization_id,
    environment_id,
    resource_type
);


CREATE INDEX IF NOT EXISTS
    idx_resources_attributes_gin
ON resources.resources
USING GIN (
    attributes
);


CREATE INDEX IF NOT EXISTS
    idx_resources_status
ON resources.resources (
    organization_id,
    environment_id,
    status
);


-- ============================================================================
-- RESOURCE TYPE REGISTRY
--
-- This is a registry/catalogue, not a provider-specific schema.
--
-- Unknown future namespaced types may be registered without changing the
-- Resource Graph engine.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    resources.resource_types (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        type_key text NOT NULL UNIQUE,

        domain text NOT NULL,

        resource_kind text NOT NULL,

        display_name text NULL,

        description text NULL,

        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

        status text NOT NULL DEFAULT 'ACTIVE',

        created_at timestamptz NOT NULL DEFAULT now(),

        updated_at timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT resource_types_key_format
            CHECK (
                type_key ~
                '^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$'
            ),

        CONSTRAINT resource_types_domain_format
            CHECK (
                domain ~
                '^[a-z][a-z0-9_-]*$'
            ),

        CONSTRAINT resource_types_kind_format
            CHECK (
                resource_kind ~
                '^[a-z][a-z0-9_-]*$'
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_resource_types_domain
ON resources.resource_types (
    domain,
    status
);


-- ============================================================================
-- CAPABILITY REGISTRY
--
-- Capability means technically supported.
-- Capability does NOT mean permission or authorization.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    resources.capabilities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        capability_key text NOT NULL UNIQUE,

        description text NULL,

        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

        status text NOT NULL DEFAULT 'ACTIVE',

        created_at timestamptz NOT NULL DEFAULT now(),

        updated_at timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT capabilities_key_format
            CHECK (
                capability_key ~
                '^[A-Z][A-Z0-9_]*$'
            )
    );


-- ============================================================================
-- RESOURCE CAPABILITIES
--
-- Tenant-owned observation of technical capability.
--
-- No permission/authorization fields are intentionally present.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    resources.resource_capabilities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        organization_id uuid NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        resource_id uuid NOT NULL
            REFERENCES resources.resources(id)
            ON DELETE CASCADE,

        capability_id uuid NOT NULL
            REFERENCES resources.capabilities(id)
            ON DELETE RESTRICT,

        available boolean NOT NULL DEFAULT true,

        source text NOT NULL,

        observed_at timestamptz NOT NULL,

        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

        created_at timestamptz NOT NULL DEFAULT now(),

        updated_at timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT resource_capabilities_unique
            UNIQUE (
                resource_id,
                capability_id
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_resource_capabilities_scope
ON resources.resource_capabilities (
    organization_id,
    environment_id,
    resource_id
);


CREATE INDEX IF NOT EXISTS
    idx_resource_capabilities_capability
ON resources.resource_capabilities (
    capability_id,
    available
);


-- ============================================================================
-- IMMUTABLE RESOURCE STATE HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    resources.resource_states (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        organization_id uuid NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        resource_id uuid NOT NULL
            REFERENCES resources.resources(id)
            ON DELETE CASCADE,

        observed_at timestamptz NOT NULL,

        health text NOT NULL,

        lifecycle text NOT NULL,

        configuration jsonb NOT NULL DEFAULT '{}'::jsonb,

        runtime jsonb NOT NULL DEFAULT '{}'::jsonb,

        metrics jsonb NOT NULL DEFAULT '{}'::jsonb,

        attributes jsonb NOT NULL DEFAULT '{}'::jsonb,

        version text NULL,

        fingerprint text NOT NULL,

        source text NOT NULL,

        evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

        created_at timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT resource_states_health_valid
            CHECK (
                health IN (
                    'UNKNOWN',
                    'HEALTHY',
                    'DEGRADED',
                    'UNHEALTHY',
                    'CRITICAL'
                )
            ),

        CONSTRAINT resource_states_lifecycle_valid
            CHECK (
                lifecycle IN (
                    'UNKNOWN',
                    'DISCOVERED',
                    'STARTING',
                    'RUNNING',
                    'STOPPING',
                    'STOPPED',
                    'TERMINATED',
                    'DELETED'
                )
            ),

        CONSTRAINT resource_states_fingerprint_not_empty
            CHECK (
                length(
                    trim(
                        fingerprint
                    )
                ) > 0
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_resource_states_resource_time
ON resources.resource_states (
    organization_id,
    environment_id,
    resource_id,
    observed_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_resource_states_fingerprint
ON resources.resource_states (
    resource_id,
    fingerprint
);


CREATE INDEX IF NOT EXISTS
    idx_resource_states_health
ON resources.resource_states (
    organization_id,
    environment_id,
    health,
    observed_at DESC
);


-- ============================================================================
-- KNOWN-GOOD STATE HISTORY
--
-- A known-good state points at an immutable ResourceState.
--
-- It is never inferred merely because the state immediately preceded an
-- incident.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    resources.known_good_states (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        organization_id uuid NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        resource_id uuid NOT NULL
            REFERENCES resources.resources(id)
            ON DELETE CASCADE,

        resource_state_id uuid NOT NULL
            REFERENCES resources.resource_states(id)
            ON DELETE RESTRICT,

        valid_from timestamptz NOT NULL,

        valid_until timestamptz NULL,

        confidence numeric(8,6) NOT NULL,

        evidence_count integer NOT NULL,

        health_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

        reason text NOT NULL,

        source text NOT NULL,

        approved_by_human boolean NOT NULL DEFAULT false,

        superseded_by uuid NULL
            REFERENCES resources.known_good_states(id)
            ON DELETE SET NULL,

        status text NOT NULL DEFAULT 'ACTIVE',

        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

        created_at timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT known_good_confidence_valid
            CHECK (
                confidence >= 0
                AND confidence <= 1
            ),

        CONSTRAINT known_good_evidence_required
            CHECK (
                evidence_count > 0
            ),

        CONSTRAINT known_good_validity_window
            CHECK (
                valid_until IS NULL
                OR valid_until > valid_from
            ),

        CONSTRAINT known_good_status_valid
            CHECK (
                status IN (
                    'ACTIVE',
                    'SUPERSEDED',
                    'EXPIRED',
                    'REVOKED'
                )
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_known_good_resource
ON resources.known_good_states (
    organization_id,
    environment_id,
    resource_id,
    status,
    valid_from DESC
);


CREATE UNIQUE INDEX IF NOT EXISTS
    idx_known_good_one_active_per_resource
ON resources.known_good_states (
    resource_id
)
WHERE status = 'ACTIVE';


-- ============================================================================
-- EVOLVE CURRENT RELATIONSHIP IDENTITY
-- ============================================================================

ALTER TABLE
    resources.resource_relationships
ADD COLUMN IF NOT EXISTS
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb;


ALTER TABLE
    resources.resource_relationships
ADD COLUMN IF NOT EXISTS
    status text NOT NULL DEFAULT 'ACTIVE';


ALTER TABLE
    resources.resource_relationships
ADD COLUMN IF NOT EXISTS
    last_seen_at timestamptz NULL;


-- ============================================================================
-- IMMUTABLE RELATIONSHIP HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    resources.relationship_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        organization_id uuid NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        relationship_id uuid NOT NULL
            REFERENCES resources.resource_relationships(id)
            ON DELETE CASCADE,

        source_resource_id uuid NOT NULL
            REFERENCES resources.resources(id)
            ON DELETE CASCADE,

        target_resource_id uuid NOT NULL
            REFERENCES resources.resources(id)
            ON DELETE CASCADE,

        relationship_type text NOT NULL,

        valid_from timestamptz NOT NULL,

        valid_to timestamptz NULL,

        change_type text NOT NULL,

        attributes_before jsonb NOT NULL DEFAULT '{}'::jsonb,

        attributes_after jsonb NOT NULL DEFAULT '{}'::jsonb,

        source text NOT NULL,

        evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

        created_at timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT relationship_history_no_self_reference
            CHECK (
                source_resource_id <>
                target_resource_id
            ),

        CONSTRAINT relationship_history_validity
            CHECK (
                valid_to IS NULL
                OR valid_to > valid_from
            ),

        CONSTRAINT relationship_history_change_type_valid
            CHECK (
                change_type IN (
                    'CREATED',
                    'UPDATED',
                    'REMOVED',
                    'REACTIVATED'
                )
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_relationship_history_relationship_time
ON resources.relationship_history (
    organization_id,
    environment_id,
    relationship_id,
    valid_from DESC
);


CREATE INDEX IF NOT EXISTS
    idx_relationship_history_source_time
ON resources.relationship_history (
    organization_id,
    environment_id,
    source_resource_id,
    valid_from DESC
);


CREATE INDEX IF NOT EXISTS
    idx_relationship_history_target_time
ON resources.relationship_history (
    organization_id,
    environment_id,
    target_resource_id,
    valid_from DESC
);


-- ============================================================================
-- GRAPH CHANGE EVENTS
--
-- Generic evidence ledger for meaningful topology/state changes.
--
-- These events are evidence. They are not declarations of causality.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    resources.graph_change_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        organization_id uuid NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        resource_id uuid NULL
            REFERENCES resources.resources(id)
            ON DELETE CASCADE,

        relationship_id uuid NULL
            REFERENCES resources.resource_relationships(id)
            ON DELETE CASCADE,

        change_type text NOT NULL,

        changed_at timestamptz NOT NULL,

        before_state jsonb NOT NULL DEFAULT '{}'::jsonb,

        after_state jsonb NOT NULL DEFAULT '{}'::jsonb,

        source text NOT NULL,

        evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

        created_at timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT graph_change_target_present
            CHECK (
                resource_id IS NOT NULL
                OR relationship_id IS NOT NULL
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_graph_change_events_time
ON resources.graph_change_events (
    organization_id,
    environment_id,
    changed_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_graph_change_events_resource
ON resources.graph_change_events (
    organization_id,
    environment_id,
    resource_id,
    changed_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_graph_change_events_relationship
ON resources.graph_change_events (
    organization_id,
    environment_id,
    relationship_id,
    changed_at DESC
);


-- ============================================================================
-- TENANT ISOLATION
-- ============================================================================

ALTER TABLE
    resources.resource_capabilities
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    resources.resource_capabilities
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    resources.resource_states
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    resources.resource_states
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    resources.known_good_states
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    resources.known_good_states
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    resources.relationship_history
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    resources.relationship_history
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    resources.graph_change_events
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    resources.graph_change_events
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    resource_capabilities_scope_policy
ON resources.resource_capabilities;


CREATE POLICY
    resource_capabilities_scope_policy
ON resources.resource_capabilities
USING (
    organization_id =
        tenancy.current_organization_id()
    AND
    environment_id =
        tenancy.current_environment_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
    AND
    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    resource_states_scope_policy
ON resources.resource_states;


CREATE POLICY
    resource_states_scope_policy
ON resources.resource_states
USING (
    organization_id =
        tenancy.current_organization_id()
    AND
    environment_id =
        tenancy.current_environment_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
    AND
    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    known_good_states_scope_policy
ON resources.known_good_states;


CREATE POLICY
    known_good_states_scope_policy
ON resources.known_good_states
USING (
    organization_id =
        tenancy.current_organization_id()
    AND
    environment_id =
        tenancy.current_environment_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
    AND
    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    relationship_history_scope_policy
ON resources.relationship_history;


CREATE POLICY
    relationship_history_scope_policy
ON resources.relationship_history
USING (
    organization_id =
        tenancy.current_organization_id()
    AND
    environment_id =
        tenancy.current_environment_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
    AND
    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    graph_change_events_scope_policy
ON resources.graph_change_events;


CREATE POLICY
    graph_change_events_scope_policy
ON resources.graph_change_events
USING (
    organization_id =
        tenancy.current_organization_id()
    AND
    environment_id =
        tenancy.current_environment_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
    AND
    environment_id =
        tenancy.current_environment_id()
);


-- ============================================================================
-- SEED DOMAIN-NEUTRAL RESOURCE TYPES
-- ============================================================================

INSERT INTO
    resources.resource_types (
        type_key,
        domain,
        resource_kind,
        display_name
    )
VALUES
    ('application.service', 'application', 'service', 'Application Service'),

    ('kubernetes.pod', 'kubernetes', 'pod', 'Kubernetes Pod'),
    ('kubernetes.deployment', 'kubernetes', 'deployment', 'Kubernetes Deployment'),
    ('kubernetes.service', 'kubernetes', 'service', 'Kubernetes Service'),
    ('kubernetes.node', 'kubernetes', 'node', 'Kubernetes Node'),

    ('container.docker', 'container', 'docker', 'Docker Container'),

    ('linux.host', 'linux', 'host', 'Linux Host'),
    ('linux.process', 'linux', 'process', 'Linux Process'),

    ('postgres.database', 'postgres', 'database', 'PostgreSQL Database'),
    ('postgres.replica', 'postgres', 'replica', 'PostgreSQL Replica'),

    ('mysql.database', 'mysql', 'database', 'MySQL Database'),
    ('mongodb.database', 'mongodb', 'database', 'MongoDB Database'),
    ('redis.instance', 'redis', 'instance', 'Redis Instance'),

    ('rabbitmq.queue', 'rabbitmq', 'queue', 'RabbitMQ Queue'),
    ('rabbitmq.exchange', 'rabbitmq', 'exchange', 'RabbitMQ Exchange'),

    ('kafka.broker', 'kafka', 'broker', 'Kafka Broker'),
    ('kafka.topic', 'kafka', 'topic', 'Kafka Topic'),

    ('aws.ec2', 'aws', 'ec2', 'AWS EC2 Instance'),
    ('aws.rds', 'aws', 'rds', 'AWS RDS Instance'),
    ('aws.lambda', 'aws', 'lambda', 'AWS Lambda'),

    ('azure.vm', 'azure', 'vm', 'Azure Virtual Machine'),

    ('gcp.compute_instance', 'gcp', 'compute_instance', 'GCP Compute Instance'),

    ('network.switch', 'network', 'switch', 'Network Switch'),
    ('network.router', 'network', 'router', 'Network Router'),
    ('network.firewall', 'network', 'firewall', 'Network Firewall'),

    ('storage.volume', 'storage', 'volume', 'Storage Volume'),

    ('robotics.amr', 'robotics', 'amr', 'Autonomous Mobile Robot'),
    ('robotics.lidar', 'robotics', 'lidar', 'LiDAR Sensor'),
    ('robotics.camera', 'robotics', 'camera', 'Robot Camera'),
    ('robotics.motor', 'robotics', 'motor', 'Robot Motor')
ON CONFLICT (
    type_key
)
DO NOTHING;


-- ============================================================================
-- SEED TECHNICAL CAPABILITIES
-- ============================================================================

INSERT INTO
    resources.capabilities (
        capability_key
    )
VALUES
    ('READ_STATE'),
    ('READ_METRICS'),
    ('READ_LOGS'),
    ('READ_EVENTS'),

    ('RESTART'),
    ('STOP'),
    ('START'),
    ('SCALE'),
    ('ROLLBACK'),
    ('FAILOVER'),

    ('EXEC_COMMAND'),
    ('UPDATE_CONFIG'),
    ('ROTATE_SECRET'),

    ('CORDON'),
    ('DRAIN'),

    ('SNAPSHOT'),
    ('RESTORE'),

    ('ROBOT_STOP'),
    ('ROBOT_RECALIBRATE'),
    ('ROBOT_RETURN_HOME')
ON CONFLICT (
    capability_key
)
DO NOTHING;


COMMIT;