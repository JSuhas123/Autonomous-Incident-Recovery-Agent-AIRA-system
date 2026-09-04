-- ============================================================================
-- AIRA PHASE 24.0 + 24.1
-- HUMAN-TO-AIRA LEARNING
-- STRUCTURED HUMAN INTERVENTION CAPTURE
-- ============================================================================
--
-- SAFETY LAWS
--
--   HUMAN ASSERTION != TRUTH
--
--   INCIDENT RESOLVED != ROOT CAUSE PROVEN
--
--   LEARNING != EXECUTION AUTHORIZATION
--
--   Human intervention events are evidence-bearing historical facts.
--
--   Human diagnoses remain assertions.
--
--   A frozen source bundle is immutable learning input.
--
--   It is NOT validated knowledge.
--
-- ============================================================================


BEGIN;


CREATE SCHEMA IF NOT EXISTS
    learning;


-- ============================================================================
-- 1. INTERVENTION SESSION
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    learning.intervention_sessions (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'hint_' ||
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                )
            ),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        incident_id UUID NOT NULL
            REFERENCES incidents.incidents(id)
            ON DELETE RESTRICT,

        human_task_id UUID,

        takeover_session_id UUID,

        operator_type TEXT NOT NULL
            DEFAULT 'HUMAN',

        operator_user_id UUID
            REFERENCES identity.users(id)
            ON DELETE SET NULL,

        status TEXT NOT NULL
            DEFAULT 'OPEN',

        started_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        completed_at TIMESTAMPTZ,

        abandoned_at TIMESTAMPTZ,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_intervention_task_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                human_task_id
            )
            REFERENCES human_operations.tasks (
                organization_id,
                environment_id,
                id
            )
            ON DELETE SET NULL,

        CONSTRAINT learning_intervention_takeover_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                takeover_session_id
            )
            REFERENCES human_operations.takeover_sessions (
                organization_id,
                environment_id,
                id
            )
            ON DELETE SET NULL,

        CONSTRAINT learning_intervention_status_check
            CHECK (
                status IN (
                    'OPEN',
                    'COMPLETED',
                    'ABANDONED'
                )
            ),

        CONSTRAINT learning_intervention_operator_type_check
            CHECK (
                operator_type IN (
                    'HUMAN',
                    'SERVICE_ACCOUNT',
                    'SYSTEM'
                )
            ),

        CONSTRAINT learning_intervention_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            ),

        CONSTRAINT learning_intervention_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        CONSTRAINT learning_intervention_terminal_time_check
            CHECK (
                (
                    status =
                        'OPEN'

                    AND

                    completed_at
                        IS NULL

                    AND

                    abandoned_at
                        IS NULL
                )

                OR

                (
                    status =
                        'COMPLETED'

                    AND

                    completed_at
                        IS NOT NULL

                    AND

                    abandoned_at
                        IS NULL
                )

                OR

                (
                    status =
                        'ABANDONED'

                    AND

                    abandoned_at
                        IS NOT NULL

                    AND

                    completed_at
                        IS NULL
                )
            ),

        UNIQUE (
            organization_id,
            environment_id,
            id
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_learning_intervention_incident
ON learning.intervention_sessions (
    organization_id,
    environment_id,
    incident_id,
    created_at DESC
);


-- ============================================================================
-- 2. STRUCTURED INTERVENTION EVENTS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    learning.intervention_events (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'hiev_' ||
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                )
            ),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        intervention_session_id UUID NOT NULL,

        sequence_number BIGINT NOT NULL,

        event_type TEXT NOT NULL,

        truth_level TEXT NOT NULL
            DEFAULT 'OBSERVATION',

        actor_type TEXT NOT NULL
            DEFAULT 'HUMAN',

        actor_user_id UUID
            REFERENCES identity.users(id)
            ON DELETE SET NULL,

        summary TEXT,

        payload JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        evidence_refs JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        occurred_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_intervention_event_session_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                intervention_session_id
            )
            REFERENCES learning.intervention_sessions (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_intervention_event_sequence_positive
            CHECK (
                sequence_number >
                    0
            ),

        CONSTRAINT learning_intervention_event_type_check
            CHECK (
                event_type IN (
                    'INVESTIGATION_STARTED',

                    'QUERY_PERFORMED',

                    'EVIDENCE_OBSERVED',

                    'HYPOTHESIS_PROPOSED',

                    'HYPOTHESIS_REJECTED',

                    'DIAGNOSIS_DECLARED',

                    'ACTION_PROPOSED',

                    'ACTION_ATTEMPTED',

                    'ACTION_REJECTED',

                    'ACTION_FAILED',

                    'ACTION_SUCCEEDED',

                    'MITIGATION_APPLIED',

                    'ROOT_FIX_APPLIED',

                    'VERIFICATION_PERFORMED',

                    'OUTCOME_DECLARED',

                    'INVESTIGATION_COMPLETED'
                )
            ),

        CONSTRAINT learning_intervention_event_truth_check
            CHECK (
                truth_level IN (
                    'OBSERVATION',
                    'ASSERTION'
                )
            ),

        CONSTRAINT learning_intervention_event_actor_check
            CHECK (
                actor_type IN (
                    'HUMAN',
                    'SERVICE_ACCOUNT',
                    'SYSTEM'
                )
            ),

        CONSTRAINT learning_intervention_event_payload_object
            CHECK (
                jsonb_typeof(
                    payload
                ) = 'object'
            ),

        CONSTRAINT learning_intervention_event_evidence_array
            CHECK (
                jsonb_typeof(
                    evidence_refs
                ) = 'array'
            ),

        CONSTRAINT learning_intervention_event_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            intervention_session_id,
            sequence_number
        ),

        UNIQUE (
            organization_id,
            environment_id,
            id
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_learning_intervention_event_timeline
ON learning.intervention_events (
    organization_id,
    environment_id,
    intervention_session_id,
    sequence_number ASC
);


-- ============================================================================
-- 3. FROZEN LEARNING SOURCE BUNDLES
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    learning.source_bundles (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lsrc_' ||
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                )
            ),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        incident_id UUID NOT NULL
            REFERENCES incidents.incidents(id)
            ON DELETE RESTRICT,

        intervention_session_id UUID NOT NULL,

        bundle_version INTEGER NOT NULL
            DEFAULT 1,

        observation_payload JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        assertion_payload JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        diagnosis_payload JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        action_payload JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        verification_payload JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        outcome_payload JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        provenance JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        source_digest TEXT NOT NULL,

        frozen_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_source_bundle_session_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                intervention_session_id
            )
            REFERENCES learning.intervention_sessions (
                organization_id,
                environment_id,
                id
            )
            ON DELETE RESTRICT,

        CONSTRAINT learning_source_bundle_version_positive
            CHECK (
                bundle_version >
                    0
            ),

        CONSTRAINT learning_source_bundle_observation_array
            CHECK (
                jsonb_typeof(
                    observation_payload
                ) = 'array'
            ),

        CONSTRAINT learning_source_bundle_assertion_array
            CHECK (
                jsonb_typeof(
                    assertion_payload
                ) = 'array'
            ),

        CONSTRAINT learning_source_bundle_diagnosis_array
            CHECK (
                jsonb_typeof(
                    diagnosis_payload
                ) = 'array'
            ),

        CONSTRAINT learning_source_bundle_action_array
            CHECK (
                jsonb_typeof(
                    action_payload
                ) = 'array'
            ),

        CONSTRAINT learning_source_bundle_verification_array
            CHECK (
                jsonb_typeof(
                    verification_payload
                ) = 'array'
            ),

        CONSTRAINT learning_source_bundle_outcome_array
            CHECK (
                jsonb_typeof(
                    outcome_payload
                ) = 'array'
            ),

        CONSTRAINT learning_source_bundle_provenance_object
            CHECK (
                jsonb_typeof(
                    provenance
                ) = 'object'
            ),

        CONSTRAINT learning_source_bundle_digest_check
            CHECK (
                source_digest ~
                    '^[0-9a-f]{64}$'
            ),

        CONSTRAINT learning_source_bundle_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            intervention_session_id,
            bundle_version
        ),

        UNIQUE (
            organization_id,
            environment_id,
            id
        )
    );


CREATE UNIQUE INDEX IF NOT EXISTS
    idx_learning_source_bundle_digest
ON learning.source_bundles (
    organization_id,
    environment_id,
    source_digest
);


-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================


ALTER TABLE
    learning.intervention_sessions
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    learning.intervention_sessions
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.intervention_events
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    learning.intervention_events
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.source_bundles
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    learning.source_bundles
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    learning_intervention_sessions_scope
ON learning.intervention_sessions;


CREATE POLICY
    learning_intervention_sessions_scope
ON learning.intervention_sessions
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

    AND

    execution_authorized =
        FALSE
);


DROP POLICY IF EXISTS
    learning_intervention_events_scope
ON learning.intervention_events;


CREATE POLICY
    learning_intervention_events_scope
ON learning.intervention_events
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

    AND

    execution_authorized =
        FALSE
);


DROP POLICY IF EXISTS
    learning_source_bundles_scope
ON learning.source_bundles;


CREATE POLICY
    learning_source_bundles_scope
ON learning.source_bundles
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

    AND

    execution_authorized =
        FALSE
);


COMMIT;