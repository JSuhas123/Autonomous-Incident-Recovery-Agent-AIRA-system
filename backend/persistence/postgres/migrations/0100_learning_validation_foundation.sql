-- ============================================================================
-- AIRA PHASE 24.4A + 24.4B
-- LEARNING CANDIDATE VALIDATION FOUNDATION
-- ============================================================================
--
-- CANDIDATE != VALIDATED KNOWLEDGE
-- REPLAY PASS != PUBLICATION
-- LAB PASS != EXECUTION AUTHORITY
-- SOURCE INCIDENT SUCCESS != GENERAL VALIDITY
--
-- PostgreSQL remains authoritative.
-- Reality and Reliability systems provide evidence.
--
-- ============================================================================

BEGIN;


CREATE TABLE IF NOT EXISTS
    learning.validation_runs (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lval_' ||
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

        candidate_id UUID NOT NULL,

        validation_version INTEGER NOT NULL
            DEFAULT 1,

        status TEXT NOT NULL
            DEFAULT 'PENDING',

        validation_profile TEXT NOT NULL
            DEFAULT 'STANDARD',

        source_digest TEXT NOT NULL,

        candidate_digest TEXT NOT NULL,

        replay_pass BOOLEAN,

        reliability_lab_pass BOOLEAN,

        regression_pass BOOLEAN,

        safety_pass BOOLEAN,

        overall_pass BOOLEAN,

        summary JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        started_at TIMESTAMPTZ,

        completed_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_validation_candidate_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                candidate_id
            )
            REFERENCES learning.knowledge_candidates (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_validation_status_check
            CHECK (
                status IN (
                    'PENDING',
                    'RUNNING',
                    'FAILED',
                    'COMPLETED'
                )
            ),

        CONSTRAINT learning_validation_profile_check
            CHECK (
                validation_profile IN (
                    'STANDARD',
                    'HIGH_RISK',
                    'GLOBAL_PROMOTION'
                )
            ),

        CONSTRAINT learning_validation_source_digest_check
            CHECK (
                source_digest ~
                    '^[0-9a-f]{64}$'
            ),

        CONSTRAINT learning_validation_candidate_digest_check
            CHECK (
                candidate_digest ~
                    '^[0-9a-f]{64}$'
            ),

        CONSTRAINT learning_validation_summary_object
            CHECK (
                jsonb_typeof(
                    summary
                ) = 'object'
            ),

        CONSTRAINT learning_validation_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            organization_id,
            environment_id,
            candidate_id,
            validation_version
        ),

        UNIQUE (
            organization_id,
            environment_id,
            id
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_learning_validation_candidate
ON learning.validation_runs (
    organization_id,
    environment_id,
    candidate_id,
    created_at DESC
);


-- ============================================================================
-- VALIDATION STAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    learning.validation_stages (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        validation_run_id UUID NOT NULL,

        stage_type TEXT NOT NULL,

        status TEXT NOT NULL
            DEFAULT 'PENDING',

        pass BOOLEAN,

        metrics JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        reason TEXT,

        started_at TIMESTAMPTZ,

        completed_at TIMESTAMPTZ,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_validation_stage_run_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                validation_run_id
            )
            REFERENCES learning.validation_runs (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_validation_stage_type_check
            CHECK (
                stage_type IN (
                    'REPLAY',
                    'RELIABILITY_LAB',
                    'REGRESSION',
                    'SAFETY'
                )
            ),

        CONSTRAINT learning_validation_stage_status_check
            CHECK (
                status IN (
                    'PENDING',
                    'RUNNING',
                    'PASSED',
                    'FAILED',
                    'SKIPPED'
                )
            ),

        CONSTRAINT learning_validation_stage_metrics_object
            CHECK (
                jsonb_typeof(
                    metrics
                ) = 'object'
            ),

        CONSTRAINT learning_validation_stage_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            validation_run_id,
            stage_type
        ),

        UNIQUE (
            organization_id,
            environment_id,
            id
        )
    );


-- ============================================================================
-- VALIDATION EVIDENCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    learning.validation_evidence (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        validation_run_id UUID NOT NULL,

        stage_type TEXT NOT NULL,

        evidence_type TEXT NOT NULL,

        source_system TEXT NOT NULL,

        source_reference TEXT,

        evidence_payload JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        evidence_digest TEXT NOT NULL,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_validation_evidence_run_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                validation_run_id
            )
            REFERENCES learning.validation_runs (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_validation_evidence_stage_check
            CHECK (
                stage_type IN (
                    'REPLAY',
                    'RELIABILITY_LAB',
                    'REGRESSION',
                    'SAFETY'
                )
            ),

        CONSTRAINT learning_validation_evidence_payload_object
            CHECK (
                jsonb_typeof(
                    evidence_payload
                ) = 'object'
            ),

        CONSTRAINT learning_validation_evidence_digest_check
            CHECK (
                evidence_digest ~
                    '^[0-9a-f]{64}$'
            ),

        CONSTRAINT learning_validation_evidence_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            )
    );


-- ============================================================================
-- REALITY REPLAY BINDINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    learning.replay_bindings (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        validation_run_id UUID NOT NULL,

        candidate_id UUID NOT NULL,

        reality_case_id TEXT NOT NULL,

        replay_run_id TEXT,

        binding_role TEXT NOT NULL,

        result_status TEXT NOT NULL
            DEFAULT 'PENDING',

        result_payload JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_replay_binding_validation_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                validation_run_id
            )
            REFERENCES learning.validation_runs (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_replay_binding_candidate_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                candidate_id
            )
            REFERENCES learning.knowledge_candidates (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_replay_binding_role_check
            CHECK (
                binding_role IN (
                    'SOURCE_INCIDENT',
                    'SIMILAR_CASE',
                    'NEGATIVE_CASE',
                    'COUNTEREXAMPLE'
                )
            ),

        CONSTRAINT learning_replay_binding_status_check
            CHECK (
                result_status IN (
                    'PENDING',
                    'RUNNING',
                    'PASSED',
                    'FAILED',
                    'INCONCLUSIVE'
                )
            ),

        CONSTRAINT learning_replay_binding_payload_object
            CHECK (
                jsonb_typeof(
                    result_payload
                ) = 'object'
            ),

        CONSTRAINT learning_replay_binding_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            validation_run_id,
            reality_case_id,
            binding_role
        )
    );


-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE
    learning.validation_runs
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.validation_runs
FORCE ROW LEVEL SECURITY;

ALTER TABLE
    learning.validation_stages
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.validation_stages
FORCE ROW LEVEL SECURITY;

ALTER TABLE
    learning.validation_evidence
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.validation_evidence
FORCE ROW LEVEL SECURITY;

ALTER TABLE
    learning.replay_bindings
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.replay_bindings
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    learning_validation_runs_scope
ON learning.validation_runs;

CREATE POLICY
    learning_validation_runs_scope
ON learning.validation_runs
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
    learning_validation_stages_scope
ON learning.validation_stages;

CREATE POLICY
    learning_validation_stages_scope
ON learning.validation_stages
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
    learning_validation_evidence_scope
ON learning.validation_evidence;

CREATE POLICY
    learning_validation_evidence_scope
ON learning.validation_evidence
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
    learning_replay_bindings_scope
ON learning.replay_bindings;

CREATE POLICY
    learning_replay_bindings_scope
ON learning.replay_bindings
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