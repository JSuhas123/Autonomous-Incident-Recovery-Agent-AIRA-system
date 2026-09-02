-- ============================================================================
-- AIRA PHASE 23.6
-- RETURN CONTROL + FRESH EVALUATION / STALE-PLAN FENCE
-- ============================================================================
--
-- SAFETY LAW
--
-- RELEASED CONTROL != RESUME
-- EXPIRED CONTROL  != RESUME
-- REVOKED CONTROL  != RESUME
--
-- Every terminal ACTIVE human-control lease creates a durable PostgreSQL
-- fence requiring a fresh diagnosis + recovery decision before autonomous
-- incident continuation can be considered again.
--
-- The fence itself NEVER authorizes execution.
-- ============================================================================


BEGIN;


-- ============================================================================
-- CONTROL RETURN FENCE
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    human_operations.control_return_fences (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            DEFAULT (
                'returnfence_' ||
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

        incident_id TEXT NOT NULL,

        control_lease_id UUID NOT NULL,

        takeover_session_id UUID NOT NULL,

        previous_control_epoch BIGINT NOT NULL,

        required_control_epoch BIGINT NOT NULL,

        release_outcome TEXT NOT NULL,

        state TEXT NOT NULL
            DEFAULT 'REQUIRES_FRESH_EVALUATION',

        fresh_after TIMESTAMPTZ NOT NULL,

        fresh_diagnosis_id UUID
            REFERENCES incidents.diagnoses(id)
            ON DELETE SET NULL,

        fresh_recovery_decision_id UUID
            REFERENCES execution.recovery_decisions(id)
            ON DELETE SET NULL,

        satisfied_at TIMESTAMPTZ,

        superseded_at TIMESTAMPTZ,

        stale_plan_resume_allowed BOOLEAN NOT NULL
            DEFAULT FALSE,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT control_return_fence_public_id_unique
            UNIQUE (
                public_id
            ),

        CONSTRAINT control_return_fence_scope_id_unique
            UNIQUE (
                organization_id,
                environment_id,
                id
            ),

        CONSTRAINT control_return_fence_lease_unique
            UNIQUE (
                organization_id,
                environment_id,
                control_lease_id
            ),

        CONSTRAINT control_return_fence_lease_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                control_lease_id
            )
            REFERENCES human_operations.control_leases (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT control_return_fence_session_fk
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
            ON DELETE CASCADE,

        CONSTRAINT control_return_fence_previous_epoch_nonnegative
            CHECK (
                previous_control_epoch >= 0
            ),

        CONSTRAINT control_return_fence_required_epoch_positive
            CHECK (
                required_control_epoch >
                previous_control_epoch
            ),

        CONSTRAINT control_return_fence_outcome_check
            CHECK (
                release_outcome IN (
                    'RELEASED',
                    'EXPIRED',
                    'REVOKED'
                )
            ),

        CONSTRAINT control_return_fence_state_check
            CHECK (
                state IN (
                    'REQUIRES_FRESH_EVALUATION',
                    'SATISFIED',
                    'SUPERSEDED'
                )
            ),

        CONSTRAINT control_return_fence_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            ),

        CONSTRAINT control_return_fence_never_allows_stale_resume
            CHECK (
                stale_plan_resume_allowed = FALSE
            ),

        CONSTRAINT control_return_fence_never_authorizes_execution
            CHECK (
                execution_authorized = FALSE
            )
    );


-- ============================================================================
-- ONE UNSATISFIED RETURN FENCE PER INCIDENT
-- ============================================================================


CREATE UNIQUE INDEX IF NOT EXISTS
    idx_control_return_fence_pending_incident
ON human_operations.control_return_fences (
    organization_id,
    environment_id,
    incident_id
)
WHERE
    state = 'REQUIRES_FRESH_EVALUATION';


CREATE INDEX IF NOT EXISTS
    idx_control_return_fence_incident_history
ON human_operations.control_return_fences (
    organization_id,
    environment_id,
    incident_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_control_return_fence_lease
ON human_operations.control_return_fences (
    organization_id,
    environment_id,
    control_lease_id
);


-- ============================================================================
-- AUTOMATIC FENCE CREATION
-- ============================================================================
--
-- IMPORTANT:
--
-- This is a database trigger deliberately.
--
-- If the process crashes immediately after changing:
--
--   ACTIVE -> RELEASED
--
-- the return-control fence must still exist.
--
-- The lease transition and fence creation therefore commit atomically.
-- ============================================================================


CREATE OR REPLACE FUNCTION
    human_operations.aira_create_control_return_fence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_fresh_after TIMESTAMPTZ;
BEGIN
    IF
        OLD.status = 'ACTIVE'
        AND
        NEW.status IN (
            'RELEASED',
            'EXPIRED',
            'REVOKED'
        )
    THEN

        v_fresh_after :=
            CASE
                WHEN NEW.status = 'RELEASED'
                    THEN COALESCE(
                        NEW.released_at,
                        NOW()
                    )

                WHEN NEW.status = 'REVOKED'
                    THEN COALESCE(
                        NEW.revoked_at,
                        NOW()
                    )

                ELSE
                    NOW()
            END;


        /*
         * Defensive handling:
         *
         * There should normally be no previous unsatisfied fence because
         * AIRA cannot safely resume before satisfying it. If another human
         * control cycle nevertheless terminates, the newest return boundary
         * becomes authoritative.
         */
        UPDATE
            human_operations.control_return_fences

        SET
            state =
                'SUPERSEDED',

            superseded_at =
                NOW(),

            updated_at =
                NOW(),

            metadata =
                metadata ||
                jsonb_build_object(
                    'supersededByControlLeaseId',
                    NEW.public_id,

                    'executionAuthorized',
                    FALSE
                )

        WHERE
            organization_id =
                NEW.organization_id

            AND
            environment_id =
                NEW.environment_id

            AND
            incident_id =
                NEW.incident_id

            AND
            state =
                'REQUIRES_FRESH_EVALUATION'

            AND
            control_lease_id <>
                NEW.id;


        INSERT INTO
            human_operations.control_return_fences (
                organization_id,
                environment_id,

                incident_id,

                control_lease_id,
                takeover_session_id,

                previous_control_epoch,
                required_control_epoch,

                release_outcome,

                state,

                fresh_after,

                stale_plan_resume_allowed,

                metadata,

                execution_authorized
            )

        VALUES (
            NEW.organization_id,
            NEW.environment_id,

            NEW.incident_id,

            NEW.id,
            NEW.takeover_session_id,

            NEW.control_epoch,
            NEW.control_epoch + 1,

            NEW.status,

            'REQUIRES_FRESH_EVALUATION',

            v_fresh_after,

            FALSE,

            jsonb_build_object(
                'source',
                'PHASE_23_6_CONTROL_RETURN',

                'controlLeasePublicId',
                NEW.public_id,

                'requiresFreshEvaluation',
                TRUE,

                'stalePlanResumeAllowed',
                FALSE,

                'executionAuthorized',
                FALSE
            ),

            FALSE
        )

        ON CONFLICT (
            organization_id,
            environment_id,
            control_lease_id
        )
        DO NOTHING;
    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_control_return_fence
ON human_operations.control_leases;


CREATE TRIGGER
    trg_control_return_fence
AFTER UPDATE OF status
ON human_operations.control_leases
FOR EACH ROW
EXECUTE FUNCTION
    human_operations.aira_create_control_return_fence();


-- ============================================================================
-- RLS
-- ============================================================================


ALTER TABLE
    human_operations.control_return_fences
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    human_operations.control_return_fences
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    control_return_fence_tenant_policy
ON human_operations.control_return_fences;


CREATE POLICY
    control_return_fence_tenant_policy
ON human_operations.control_return_fences
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

    stale_plan_resume_allowed =
        FALSE

    AND

    execution_authorized =
        FALSE
);


COMMIT;