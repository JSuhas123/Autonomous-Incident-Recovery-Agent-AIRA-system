-- ============================================================================
-- AIRA PHASE 21.2
-- RELIABILITY LAB FOUNDATION
-- ============================================================================
--
-- PostgreSQL is the canonical authority for:
--
--   - registered Reliability Lab environments
--   - versioned experiment definitions
--   - experiment runs
--   - failure injection provenance
--   - observations
--   - assertion results
--   - reliability measurements
--
-- Bulk telemetry remains in external observability systems.
--
-- Phase 21 NEVER grants execution authorization.
-- ============================================================================


CREATE SCHEMA IF NOT EXISTS reliability;


-- ============================================================================
-- LAB ENVIRONMENTS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    reliability.lab_environments (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        name TEXT NOT NULL,

        kind TEXT NOT NULL,

        status TEXT NOT NULL
            DEFAULT 'ABSENT',

        safety_class TEXT NOT NULL
            DEFAULT 'LAB_ONLY',

        production BOOLEAN NOT NULL
            DEFAULT FALSE,

        infrastructure_ref TEXT,

        namespace TEXT,

        labels JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        configuration JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        baseline JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        dirty_reason TEXT,

        last_baselined_at TIMESTAMPTZ,

        last_reset_at TIMESTAMPTZ,

        last_health_check_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        CONSTRAINT reliability_lab_environment_kind_check
            CHECK (
                kind IN (
                    'DOCKER',
                    'KIND',
                    'K3D',
                    'KUBERNETES'
                )
            ),

        CONSTRAINT reliability_lab_environment_status_check
            CHECK (
                status IN (
                    'ABSENT',
                    'PROVISIONING',
                    'READY',
                    'BASELINING',
                    'AVAILABLE',
                    'RUNNING_EXPERIMENT',
                    'RESETTING',
                    'PROVISION_FAILED',
                    'DIRTY',
                    'RESET_FAILED',
                    'UNHEALTHY'
                )
            ),

        CONSTRAINT reliability_lab_environment_safety_check
            CHECK (
                safety_class =
                    'LAB_ONLY'
            ),

        CONSTRAINT reliability_lab_environment_not_production
            CHECK (
                production =
                    FALSE
            ),

        CONSTRAINT reliability_lab_environment_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        CONSTRAINT reliability_lab_environment_labels_object
            CHECK (
                jsonb_typeof(
                    labels
                ) =
                'object'
            ),

        CONSTRAINT reliability_lab_environment_configuration_object
            CHECK (
                jsonb_typeof(
                    configuration
                ) =
                'object'
            ),

        CONSTRAINT reliability_lab_environment_baseline_object
            CHECK (
                jsonb_typeof(
                    baseline
                ) =
                'object'
            ),

        UNIQUE (
            organization_id,
            environment_id,
            public_id
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_reliability_lab_environment_scope
ON reliability.lab_environments (
    organization_id,
    environment_id
);


CREATE INDEX IF NOT EXISTS
    idx_reliability_lab_environment_status
ON reliability.lab_environments (
    organization_id,
    environment_id,
    status
);


-- ============================================================================
-- EXPERIMENT DEFINITIONS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    reliability.experiment_definitions (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        experiment_key TEXT NOT NULL,

        version INTEGER NOT NULL,

        name TEXT NOT NULL,

        description TEXT,

        failure_domain TEXT NOT NULL,

        failure_type TEXT NOT NULL,

        target_resource_type TEXT NOT NULL,

        ground_truth JSONB NOT NULL,

        assertions JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        configuration JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        enabled BOOLEAN NOT NULL
            DEFAULT TRUE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        CONSTRAINT reliability_experiment_definition_version_check
            CHECK (
                version >
                    0
            ),

        CONSTRAINT reliability_experiment_ground_truth_object
            CHECK (
                jsonb_typeof(
                    ground_truth
                ) =
                'object'
            ),

        CONSTRAINT reliability_experiment_assertions_array
            CHECK (
                jsonb_typeof(
                    assertions
                ) =
                'array'
            ),

        CONSTRAINT reliability_experiment_configuration_object
            CHECK (
                jsonb_typeof(
                    configuration
                ) =
                'object'
            ),

        CONSTRAINT reliability_experiment_definition_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            organization_id,
            environment_id,
            experiment_key,
            version
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_reliability_experiment_definition_key
ON reliability.experiment_definitions (
    organization_id,
    environment_id,
    experiment_key,
    version DESC
);


-- ============================================================================
-- EXPERIMENT RUNS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    reliability.experiment_runs (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        lab_environment_id UUID NOT NULL
            REFERENCES reliability.lab_environments(id)
            ON DELETE RESTRICT,

        experiment_definition_id UUID NOT NULL
            REFERENCES reliability.experiment_definitions(id)
            ON DELETE RESTRICT,

        experiment_key TEXT NOT NULL,

        experiment_version INTEGER NOT NULL,

        correlation_id TEXT NOT NULL,

        status TEXT NOT NULL
            DEFAULT 'CREATED',

        outcome TEXT,

        started_at TIMESTAMPTZ,

        completed_at TIMESTAMPTZ,

        baseline_snapshot JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        final_snapshot JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        failure_summary JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        recovery_summary JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        verification_summary JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        reset_summary JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        CONSTRAINT reliability_experiment_run_status_check
            CHECK (
                status IN (
                    'CREATED',
                    'PREPARING',
                    'BASELINING',
                    'INJECTING',
                    'FAILURE_ACTIVE',
                    'WAITING_FOR_DETECTION',
                    'WAITING_FOR_DIAGNOSIS',
                    'WAITING_FOR_RECOVERY',
                    'VERIFYING',
                    'RESETTING',
                    'COMPLETE',
                    'ABORTED',
                    'FAILED'
                )
            ),

        CONSTRAINT reliability_experiment_run_outcome_check
            CHECK (
                outcome IS NULL
                OR
                outcome IN (
                    'PASSED',
                    'FAILED',
                    'INCONCLUSIVE',
                    'SAFE_REFUSAL',
                    'HUMAN_REQUIRED',
                    'ABORTED'
                )
            ),

        CONSTRAINT reliability_experiment_run_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_reliability_experiment_run_scope_time
ON reliability.experiment_runs (
    organization_id,
    environment_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_reliability_experiment_run_correlation
ON reliability.experiment_runs (
    correlation_id
);


CREATE INDEX IF NOT EXISTS
    idx_reliability_experiment_run_definition
ON reliability.experiment_runs (
    experiment_definition_id,
    created_at DESC
);


-- ============================================================================
-- FAILURE INJECTIONS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    reliability.failure_injections (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        experiment_run_id UUID NOT NULL
            REFERENCES reliability.experiment_runs(id)
            ON DELETE RESTRICT,

        failure_domain TEXT NOT NULL,

        failure_type TEXT NOT NULL,

        target_resource_id UUID,

        target_resource_public_id TEXT,

        target_resource_type TEXT NOT NULL,

        injector_key TEXT NOT NULL,

        injector_version TEXT,

        requested_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        injected_at TIMESTAMPTZ,

        reverted_at TIMESTAMPTZ,

        state TEXT NOT NULL
            DEFAULT 'REQUESTED',

        injection_parameters JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        provenance JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        error_summary TEXT,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        CONSTRAINT reliability_failure_injection_state_check
            CHECK (
                state IN (
                    'REQUESTED',
                    'INJECTING',
                    'ACTIVE',
                    'REVERTING',
                    'REVERTED',
                    'FAILED'
                )
            ),

        CONSTRAINT reliability_failure_injection_parameters_object
            CHECK (
                jsonb_typeof(
                    injection_parameters
                ) =
                'object'
            ),

        CONSTRAINT reliability_failure_injection_provenance_object
            CHECK (
                jsonb_typeof(
                    provenance
                ) =
                'object'
            ),

        CONSTRAINT reliability_failure_injection_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_reliability_failure_injection_run
ON reliability.failure_injections (
    experiment_run_id,
    requested_at
);


-- ============================================================================
-- OBSERVATIONS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    reliability.observations (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        experiment_run_id UUID NOT NULL
            REFERENCES reliability.experiment_runs(id)
            ON DELETE RESTRICT,

        observation_type TEXT NOT NULL,

        source TEXT NOT NULL,

        observed_at TIMESTAMPTZ NOT NULL,

        reference_type TEXT,

        reference_id TEXT,

        summary JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        CONSTRAINT reliability_observation_summary_object
            CHECK (
                jsonb_typeof(
                    summary
                ) =
                'object'
            ),

        CONSTRAINT reliability_observation_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_reliability_observation_run_time
ON reliability.observations (
    experiment_run_id,
    observed_at
);


-- ============================================================================
-- ASSERTION RESULTS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    reliability.assertion_results (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        experiment_run_id UUID NOT NULL
            REFERENCES reliability.experiment_runs(id)
            ON DELETE RESTRICT,

        assertion_key TEXT NOT NULL,

        status TEXT NOT NULL,

        expected JSONB,

        actual JSONB,

        reason_code TEXT,

        details JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        evaluated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        CONSTRAINT reliability_assertion_result_status_check
            CHECK (
                status IN (
                    'PASS',
                    'FAIL',
                    'INCONCLUSIVE',
                    'NOT_APPLICABLE'
                )
            ),

        CONSTRAINT reliability_assertion_details_object
            CHECK (
                jsonb_typeof(
                    details
                ) =
                'object'
            ),

        CONSTRAINT reliability_assertion_result_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            experiment_run_id,
            assertion_key
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_reliability_assertion_run
ON reliability.assertion_results (
    experiment_run_id,
    assertion_key
);


-- ============================================================================
-- METRICS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    reliability.metrics (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        experiment_run_id UUID NOT NULL
            REFERENCES reliability.experiment_runs(id)
            ON DELETE RESTRICT,

        metric_key TEXT NOT NULL,

        value DOUBLE PRECISION NOT NULL,

        unit TEXT,

        measured_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        CONSTRAINT reliability_metric_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) =
                'object'
            ),

        CONSTRAINT reliability_metric_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            experiment_run_id,
            metric_key
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_reliability_metric_run
ON reliability.metrics (
    experiment_run_id,
    metric_key
);


-- ============================================================================
-- TENANT SCOPE VALIDATION
-- ============================================================================


CREATE OR REPLACE FUNCTION
    reliability.aira_validate_lab_environment_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    actual_organization_id UUID;
BEGIN
    SELECT
        organization_id
    INTO
        actual_organization_id
    FROM
        tenancy.environments
    WHERE
        id =
            NEW.environment_id;

    IF actual_organization_id IS NULL THEN
        RAISE EXCEPTION
            'Reliability Lab environment references unknown environment';
    END IF;

    IF actual_organization_id <>
       NEW.organization_id THEN
        RAISE EXCEPTION
            'Reliability Lab organization/environment mismatch';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_reliability_lab_environment_scope
ON reliability.lab_environments;


CREATE TRIGGER
    trg_reliability_lab_environment_scope
BEFORE INSERT OR UPDATE
ON reliability.lab_environments
FOR EACH ROW
EXECUTE FUNCTION
    reliability.aira_validate_lab_environment_scope();


-- ============================================================================
-- UPDATED_AT
-- ============================================================================


DROP TRIGGER IF EXISTS
    trg_reliability_lab_environment_updated_at
ON reliability.lab_environments;


CREATE TRIGGER
    trg_reliability_lab_environment_updated_at
BEFORE UPDATE
ON reliability.lab_environments
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_reliability_experiment_run_updated_at
ON reliability.experiment_runs;


CREATE TRIGGER
    trg_reliability_experiment_run_updated_at
BEFORE UPDATE
ON reliability.experiment_runs
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


-- ============================================================================
-- IMMUTABLE EXPERIMENT DEFINITIONS
-- ============================================================================


CREATE OR REPLACE FUNCTION
    reliability.aira_reject_experiment_definition_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'Reliability experiment definitions are immutable; create a new version';
END;
$$;


DROP TRIGGER IF EXISTS
    trg_reliability_experiment_definition_no_update
ON reliability.experiment_definitions;


CREATE TRIGGER
    trg_reliability_experiment_definition_no_update
BEFORE UPDATE
ON reliability.experiment_definitions
FOR EACH ROW
EXECUTE FUNCTION
    reliability.aira_reject_experiment_definition_mutation();


DROP TRIGGER IF EXISTS
    trg_reliability_experiment_definition_no_delete
ON reliability.experiment_definitions;


CREATE TRIGGER
    trg_reliability_experiment_definition_no_delete
BEFORE DELETE
ON reliability.experiment_definitions
FOR EACH ROW
EXECUTE FUNCTION
    reliability.aira_reject_experiment_definition_mutation();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================


ALTER TABLE reliability.lab_environments
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE reliability.lab_environments
    FORCE ROW LEVEL SECURITY;


ALTER TABLE reliability.experiment_definitions
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE reliability.experiment_definitions
    FORCE ROW LEVEL SECURITY;


ALTER TABLE reliability.experiment_runs
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE reliability.experiment_runs
    FORCE ROW LEVEL SECURITY;


ALTER TABLE reliability.failure_injections
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE reliability.failure_injections
    FORCE ROW LEVEL SECURITY;


ALTER TABLE reliability.observations
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE reliability.observations
    FORCE ROW LEVEL SECURITY;


ALTER TABLE reliability.assertion_results
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE reliability.assertion_results
    FORCE ROW LEVEL SECURITY;


ALTER TABLE reliability.metrics
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE reliability.metrics
    FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- RLS POLICIES
-- ============================================================================


DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'lab_environments',
        'experiment_definitions',
        'experiment_runs',
        'failure_injections',
        'observations',
        'assertion_results',
        'metrics'
    ]
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON reliability.%I',
            'reliability_' || table_name || '_tenant_policy',
            table_name
        );

        EXECUTE format(
            '
                CREATE POLICY %I
                ON reliability.%I
                FOR ALL
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
                    execution_authorized = FALSE
                )
            ',
            'reliability_' || table_name || '_tenant_policy',
            table_name
        );
    END LOOP;
END;
$$;