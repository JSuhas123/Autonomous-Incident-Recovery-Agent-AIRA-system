-- ============================================================================
-- AIRA PHASE 23R.4
-- EVIDENCE REPLAY ENGINE
-- ============================================================================
--
-- SAFETY LAWS
--
-- REPLAY != EXECUTION AUTHORIZATION
--
-- EVIDENCE CHANNEL != EVALUATION CHANNEL
--
-- GROUND TRUTH MUST NEVER ENTER AGENT CONTEXT
--
-- PostgreSQL is authoritative for:
--
--   replay run identity
--   replay schedule
--   replay cursor
--   replay event release history
--   replay checkpoints
--
-- Redis may later coordinate workers, but Redis is NOT replay-history
-- authority.
--
-- Replay events may reference ONLY artifacts registered as:
--
--   channel = 'EVIDENCE'
--
-- No table introduced here grants execution authority.
-- ============================================================================


BEGIN;


-- ============================================================================
-- REPLAY RUNS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    reality.replay_runs (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            DEFAULT (
                'replay_' ||
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

        case_version_id UUID NOT NULL,

        case_public_id TEXT NOT NULL,

        case_revision INTEGER NOT NULL,

        case_content_hash TEXT NOT NULL,

        status TEXT NOT NULL
            DEFAULT 'READY',

        seed BIGINT NOT NULL
            DEFAULT 0,

        speed_multiplier NUMERIC(12, 4) NOT NULL
            DEFAULT 1.0,

        deterministic_timestamps BOOLEAN NOT NULL
            DEFAULT TRUE,

        disorder_window_ms BIGINT NOT NULL
            DEFAULT 0,

        aira_version TEXT NOT NULL,

        timeline_hash TEXT NOT NULL,

        event_count INTEGER NOT NULL,

        cursor_position INTEGER NOT NULL
            DEFAULT 0,

        started_at TIMESTAMPTZ,

        paused_at TIMESTAMPTZ,

        completed_at TIMESTAMPTZ,

        failed_at TIMESTAMPTZ,

        failure_code TEXT,

        failure_message TEXT,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT reality_replay_run_public_id_unique
            UNIQUE (
                public_id
            ),

        CONSTRAINT reality_replay_run_scope_id_unique
            UNIQUE (
                organization_id,
                environment_id,
                id
            ),

        CONSTRAINT reality_replay_run_case_version_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                case_version_id
            )
            REFERENCES reality.case_versions (
                organization_id,
                environment_id,
                id
            )
            ON DELETE RESTRICT,

        CONSTRAINT reality_replay_run_status_check
            CHECK (
                status IN (
                    'READY',
                    'RUNNING',
                    'PAUSED',
                    'COMPLETED',
                    'FAILED'
                )
            ),

        CONSTRAINT reality_replay_run_seed_nonnegative
            CHECK (
                seed >= 0
            ),

        CONSTRAINT reality_replay_run_speed_positive
            CHECK (
                speed_multiplier > 0
            ),

        CONSTRAINT reality_replay_run_disorder_nonnegative
            CHECK (
                disorder_window_ms >= 0
            ),

        CONSTRAINT reality_replay_run_event_count_nonnegative
            CHECK (
                event_count >= 0
            ),

        CONSTRAINT reality_replay_run_cursor_valid
            CHECK (
                cursor_position >= 0
                AND
                cursor_position <= event_count
            ),

        CONSTRAINT reality_replay_run_case_hash_sha256
            CHECK (
                case_content_hash ~ '^[a-f0-9]{64}$'
            ),

        CONSTRAINT reality_replay_run_timeline_hash_sha256
            CHECK (
                timeline_hash ~ '^[a-f0-9]{64}$'
            ),

        CONSTRAINT reality_replay_run_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            ),

        CONSTRAINT reality_replay_run_never_authorizes_execution
            CHECK (
                execution_authorized = FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_reality_replay_runs_case
ON reality.replay_runs (
    organization_id,
    environment_id,
    case_version_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_reality_replay_runs_status
ON reality.replay_runs (
    organization_id,
    environment_id,
    status,
    created_at DESC
);


-- ============================================================================
-- REPLAY EVENTS
-- ============================================================================
--
-- This is the frozen replay schedule for a run.
--
-- artifact_id may be NULL for timeline-only observable events.
--
-- If artifact_id is non-NULL:
--
--   1. the FK guarantees the artifact exists
--   2. tenant scope is enforced through RLS and scope triggers
--   3. a dedicated replay trigger proves the artifact belongs to the exact
--      same case version as the replay run
--   4. that trigger also proves the artifact is in the EVIDENCE channel
--
-- The artifact FK intentionally references case_artifacts(id), which is the
-- canonical primary key. Tenant/environment consistency is validated
-- separately rather than requiring an unnecessary duplicate composite unique
-- constraint on case_artifacts.
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    reality.replay_events (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        replay_run_id UUID NOT NULL,

        sequence_no INTEGER NOT NULL,

        event_public_id TEXT NOT NULL,

        original_offset_ms BIGINT NOT NULL,

        effective_offset_ms BIGINT NOT NULL,

        logical_timestamp TIMESTAMPTZ NOT NULL,

        artifact_id UUID,

        artifact_public_id TEXT,

        artifact_kind TEXT,

        artifact_content_hash TEXT,

        event_payload JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        status TEXT NOT NULL
            DEFAULT 'PENDING',

        released_at TIMESTAMPTZ,

        delivery_id TEXT NOT NULL,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT reality_replay_event_scope_id_unique
            UNIQUE (
                organization_id,
                environment_id,
                id
            ),

        CONSTRAINT reality_replay_event_run_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                replay_run_id
            )
            REFERENCES reality.replay_runs (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT reality_replay_event_artifact_fk
            FOREIGN KEY (
                artifact_id
            )
            REFERENCES reality.case_artifacts (
                id
            )
            ON DELETE RESTRICT,

        CONSTRAINT reality_replay_event_sequence_unique
            UNIQUE (
                organization_id,
                environment_id,
                replay_run_id,
                sequence_no
            ),

        CONSTRAINT reality_replay_event_public_id_unique
            UNIQUE (
                organization_id,
                environment_id,
                replay_run_id,
                event_public_id
            ),

        CONSTRAINT reality_replay_event_delivery_unique
            UNIQUE (
                delivery_id
            ),

        CONSTRAINT reality_replay_event_sequence_nonnegative
            CHECK (
                sequence_no >= 0
            ),

        CONSTRAINT reality_replay_event_original_offset_nonnegative
            CHECK (
                original_offset_ms >= 0
            ),

        CONSTRAINT reality_replay_event_effective_offset_nonnegative
            CHECK (
                effective_offset_ms >= 0
            ),

        CONSTRAINT reality_replay_event_status_check
            CHECK (
                status IN (
                    'PENDING',
                    'RELEASED'
                )
            ),

        CONSTRAINT reality_replay_event_hash_shape
            CHECK (
                artifact_content_hash IS NULL
                OR
                artifact_content_hash ~ '^[a-f0-9]{64}$'
            ),

        CONSTRAINT reality_replay_event_payload_object
            CHECK (
                jsonb_typeof(
                    event_payload
                ) = 'object'
            ),

        CONSTRAINT reality_replay_event_never_authorizes_execution
            CHECK (
                execution_authorized = FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_reality_replay_events_cursor
ON reality.replay_events (
    organization_id,
    environment_id,
    replay_run_id,
    sequence_no
);


CREATE INDEX IF NOT EXISTS
    idx_reality_replay_events_status
ON reality.replay_events (
    organization_id,
    environment_id,
    replay_run_id,
    status,
    sequence_no
);


-- ============================================================================
-- REPLAY CHECKPOINTS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    reality.replay_checkpoints (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            DEFAULT (
                'replaycheckpoint_' ||
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

        replay_run_id UUID NOT NULL,

        cursor_position INTEGER NOT NULL,

        run_status TEXT NOT NULL,

        timeline_hash TEXT NOT NULL,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT reality_replay_checkpoint_public_unique
            UNIQUE (
                public_id
            ),

        CONSTRAINT reality_replay_checkpoint_scope_id_unique
            UNIQUE (
                organization_id,
                environment_id,
                id
            ),

        CONSTRAINT reality_replay_checkpoint_run_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                replay_run_id
            )
            REFERENCES reality.replay_runs (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT reality_replay_checkpoint_cursor_nonnegative
            CHECK (
                cursor_position >= 0
            ),

        CONSTRAINT reality_replay_checkpoint_status_check
            CHECK (
                run_status IN (
                    'READY',
                    'RUNNING',
                    'PAUSED',
                    'COMPLETED',
                    'FAILED'
                )
            ),

        CONSTRAINT reality_replay_checkpoint_timeline_hash
            CHECK (
                timeline_hash ~ '^[a-f0-9]{64}$'
            ),

        CONSTRAINT reality_replay_checkpoint_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            ),

        CONSTRAINT reality_replay_checkpoint_never_authorizes_execution
            CHECK (
                execution_authorized = FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_reality_replay_checkpoints_run
ON reality.replay_checkpoints (
    organization_id,
    environment_id,
    replay_run_id,
    created_at DESC
);


-- ============================================================================
-- EVIDENCE-CHANNEL ENFORCEMENT
-- ============================================================================
--
-- Defense in depth:
--
-- A replay event referencing an artifact must reference an artifact:
--
--   1. in the same case version as the replay run
--   2. in the EVIDENCE channel
--   3. not marked trusted ground truth
--   4. not execution-authorized
--
-- This means application-code mistakes cannot silently connect the evaluation
-- channel to the replay runtime.
-- ============================================================================


CREATE OR REPLACE FUNCTION
    reality.aira_validate_replay_evidence_artifact()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_run_case_version_id UUID;

    v_artifact_case_version_id UUID;

    v_artifact_channel TEXT;

    v_trusted_ground_truth BOOLEAN;

    v_artifact_execution_authorized BOOLEAN;
BEGIN
    IF
        NEW.artifact_id IS NULL
    THEN
        RETURN NEW;
    END IF;


    SELECT
        rr.case_version_id
    INTO
        v_run_case_version_id
    FROM
        reality.replay_runs rr
    WHERE
        rr.id =
            NEW.replay_run_id
    FOR SHARE;


    IF
        v_run_case_version_id IS NULL
    THEN
        RAISE EXCEPTION
            'Reality replay run does not exist';
    END IF;


    SELECT
        ca.case_version_id,
        ca.channel,
        ca.trusted_ground_truth,
        ca.execution_authorized
    INTO
        v_artifact_case_version_id,
        v_artifact_channel,
        v_trusted_ground_truth,
        v_artifact_execution_authorized
    FROM
        reality.case_artifacts ca
    WHERE
        ca.id =
            NEW.artifact_id
    FOR SHARE;


    IF
        v_artifact_case_version_id IS NULL
    THEN
        RAISE EXCEPTION
            'Reality replay artifact does not exist';
    END IF;


    IF
        v_artifact_case_version_id
        IS DISTINCT FROM
        v_run_case_version_id
    THEN
        RAISE EXCEPTION
            'Reality replay artifact belongs to another case version';
    END IF;


    IF
        v_artifact_channel
        IS DISTINCT FROM
        'EVIDENCE'
    THEN
        RAISE EXCEPTION
            'Reality replay may reference only EVIDENCE artifacts';
    END IF;


    IF
        v_trusted_ground_truth
        IS DISTINCT FROM
        FALSE
    THEN
        RAISE EXCEPTION
            'Reality replay artifact may not be trusted ground truth';
    END IF;


    IF
        v_artifact_execution_authorized
        IS DISTINCT FROM
        FALSE
    THEN
        RAISE EXCEPTION
            'Reality replay artifact may not grant execution authority';
    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_reality_replay_evidence_artifact
ON reality.replay_events;


CREATE TRIGGER
    trg_reality_replay_evidence_artifact
BEFORE INSERT OR UPDATE OF artifact_id
ON reality.replay_events
FOR EACH ROW
EXECUTE FUNCTION
    reality.aira_validate_replay_evidence_artifact();


-- ============================================================================
-- RUN IDENTITY IMMUTABILITY
-- ============================================================================


CREATE OR REPLACE FUNCTION
    reality.aira_guard_replay_run_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF
        NEW.id
            IS DISTINCT FROM
            OLD.id
        OR
        NEW.public_id
            IS DISTINCT FROM
            OLD.public_id
        OR
        NEW.organization_id
            IS DISTINCT FROM
            OLD.organization_id
        OR
        NEW.environment_id
            IS DISTINCT FROM
            OLD.environment_id
        OR
        NEW.case_version_id
            IS DISTINCT FROM
            OLD.case_version_id
        OR
        NEW.case_public_id
            IS DISTINCT FROM
            OLD.case_public_id
        OR
        NEW.case_revision
            IS DISTINCT FROM
            OLD.case_revision
        OR
        NEW.case_content_hash
            IS DISTINCT FROM
            OLD.case_content_hash
        OR
        NEW.seed
            IS DISTINCT FROM
            OLD.seed
        OR
        NEW.speed_multiplier
            IS DISTINCT FROM
            OLD.speed_multiplier
        OR
        NEW.deterministic_timestamps
            IS DISTINCT FROM
            OLD.deterministic_timestamps
        OR
        NEW.disorder_window_ms
            IS DISTINCT FROM
            OLD.disorder_window_ms
        OR
        NEW.aira_version
            IS DISTINCT FROM
            OLD.aira_version
        OR
        NEW.timeline_hash
            IS DISTINCT FROM
            OLD.timeline_hash
        OR
        NEW.event_count
            IS DISTINCT FROM
            OLD.event_count
    THEN
        RAISE EXCEPTION
            'Reality replay run identity and schedule configuration are immutable';
    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_reality_replay_run_identity
ON reality.replay_runs;


CREATE TRIGGER
    trg_reality_replay_run_identity
BEFORE UPDATE
ON reality.replay_runs
FOR EACH ROW
EXECUTE FUNCTION
    reality.aira_guard_replay_run_identity();


-- ============================================================================
-- EVENT SCHEDULE IMMUTABILITY
-- ============================================================================


CREATE OR REPLACE FUNCTION
    reality.aira_guard_replay_event_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF
        NEW.id
            IS DISTINCT FROM
            OLD.id
        OR
        NEW.organization_id
            IS DISTINCT FROM
            OLD.organization_id
        OR
        NEW.environment_id
            IS DISTINCT FROM
            OLD.environment_id
        OR
        NEW.replay_run_id
            IS DISTINCT FROM
            OLD.replay_run_id
        OR
        NEW.sequence_no
            IS DISTINCT FROM
            OLD.sequence_no
        OR
        NEW.event_public_id
            IS DISTINCT FROM
            OLD.event_public_id
        OR
        NEW.original_offset_ms
            IS DISTINCT FROM
            OLD.original_offset_ms
        OR
        NEW.effective_offset_ms
            IS DISTINCT FROM
            OLD.effective_offset_ms
        OR
        NEW.logical_timestamp
            IS DISTINCT FROM
            OLD.logical_timestamp
        OR
        NEW.artifact_id
            IS DISTINCT FROM
            OLD.artifact_id
        OR
        NEW.artifact_public_id
            IS DISTINCT FROM
            OLD.artifact_public_id
        OR
        NEW.artifact_kind
            IS DISTINCT FROM
            OLD.artifact_kind
        OR
        NEW.artifact_content_hash
            IS DISTINCT FROM
            OLD.artifact_content_hash
        OR
        NEW.event_payload
            IS DISTINCT FROM
            OLD.event_payload
        OR
        NEW.delivery_id
            IS DISTINCT FROM
            OLD.delivery_id
        OR
        NEW.execution_authorized
            IS DISTINCT FROM
            OLD.execution_authorized
    THEN
        RAISE EXCEPTION
            'Reality replay event schedule is immutable';
    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_reality_replay_event_schedule
ON reality.replay_events;


CREATE TRIGGER
    trg_reality_replay_event_schedule
BEFORE UPDATE
ON reality.replay_events
FOR EACH ROW
EXECUTE FUNCTION
    reality.aira_guard_replay_event_schedule();


-- ============================================================================
-- TENANT-SCOPE TRIGGERS
-- ============================================================================


DROP TRIGGER IF EXISTS
    trg_reality_replay_runs_scope
ON reality.replay_runs;


CREATE TRIGGER
    trg_reality_replay_runs_scope
BEFORE INSERT OR UPDATE
ON reality.replay_runs
FOR EACH ROW
EXECUTE FUNCTION
    reality.aira_validate_reality_scope();


DROP TRIGGER IF EXISTS
    trg_reality_replay_events_scope
ON reality.replay_events;


CREATE TRIGGER
    trg_reality_replay_events_scope
BEFORE INSERT OR UPDATE
ON reality.replay_events
FOR EACH ROW
EXECUTE FUNCTION
    reality.aira_validate_reality_scope();


DROP TRIGGER IF EXISTS
    trg_reality_replay_checkpoints_scope
ON reality.replay_checkpoints;


CREATE TRIGGER
    trg_reality_replay_checkpoints_scope
BEFORE INSERT OR UPDATE
ON reality.replay_checkpoints
FOR EACH ROW
EXECUTE FUNCTION
    reality.aira_validate_reality_scope();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================


ALTER TABLE
    reality.replay_runs
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    reality.replay_runs
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    reality_replay_runs_tenant_policy
ON reality.replay_runs;


CREATE POLICY
    reality_replay_runs_tenant_policy
ON reality.replay_runs
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
);


ALTER TABLE
    reality.replay_events
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    reality.replay_events
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    reality_replay_events_tenant_policy
ON reality.replay_events;


CREATE POLICY
    reality_replay_events_tenant_policy
ON reality.replay_events
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
);


ALTER TABLE
    reality.replay_checkpoints
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    reality.replay_checkpoints
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    reality_replay_checkpoints_tenant_policy
ON reality.replay_checkpoints;


CREATE POLICY
    reality_replay_checkpoints_tenant_policy
ON reality.replay_checkpoints
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
);


COMMIT;