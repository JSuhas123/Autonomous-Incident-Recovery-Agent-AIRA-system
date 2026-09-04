-- ============================================================================
-- AIRA PHASE 24.2
-- HUMAN-TO-AIRA LEARNING
-- UNTRUSTED KNOWLEDGE CANDIDATE FOUNDATION
-- ============================================================================
--
-- SAFETY LAWS
--
--   HUMAN ACTION -> CANDIDATE
--
--   HUMAN ACTION != TRUTH
--
--   CANDIDATE != VALIDATED KNOWLEDGE
--
--   CANDIDATE != PUBLISHED KNOWLEDGE
--
--   CANDIDATE != EXECUTION AUTHORITY
--
--   TENANT-DERIVED CANDIDATES MAY NOT BE BORN GLOBAL
--
-- ============================================================================


BEGIN;


-- ============================================================================
-- 1. KNOWLEDGE CANDIDATE
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    learning.knowledge_candidates (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lcand_' ||
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

        source_bundle_id UUID NOT NULL,

        source_incident_id UUID NOT NULL
            REFERENCES incidents.incidents(id)
            ON DELETE RESTRICT,

        candidate_type TEXT NOT NULL,

        candidate_state TEXT NOT NULL
            DEFAULT 'GENERATED',

        truth_level TEXT NOT NULL
            DEFAULT 'CANDIDATE',

        knowledge_scope TEXT NOT NULL
            DEFAULT 'ENVIRONMENT',

        title TEXT NOT NULL,

        summary TEXT,

        candidate_payload JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        confidence NUMERIC(6, 5),

        risk_classification TEXT NOT NULL
            DEFAULT 'UNASSESSED',

        source_digest TEXT NOT NULL,

        candidate_digest TEXT NOT NULL,

        generated_by TEXT NOT NULL,

        generator_version TEXT NOT NULL,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_candidate_source_bundle_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                source_bundle_id
            )
            REFERENCES learning.source_bundles (
                organization_id,
                environment_id,
                id
            )
            ON DELETE RESTRICT,

        CONSTRAINT learning_candidate_type_check
            CHECK (
                candidate_type IN (
                    'FAILURE_MODE',

                    'INVESTIGATION_PROCEDURE',

                    'RUNBOOK',

                    'PLAYBOOK',

                    'RECOVERY_STRATEGY',

                    'EVIDENCE_PATTERN',

                    'NEGATIVE_PROCEDURE',

                    'ANTI_PATTERN',

                    'CONTRAINDICATION',

                    'PREREQUISITE',

                    'ESCALATION_PATTERN'
                )
            ),

        CONSTRAINT learning_candidate_state_check
            CHECK (
                candidate_state IN (
                    'GENERATED',

                    'QUARANTINED',

                    'VALIDATION_PENDING',

                    'VALIDATING',

                    'VALIDATION_FAILED',

                    'HUMAN_REVIEW_PENDING',

                    'APPROVED',

                    'REJECTED',

                    'PUBLISHED',

                    'REVOKED'
                )
            ),

        CONSTRAINT learning_candidate_truth_check
            CHECK (
                truth_level =
                    'CANDIDATE'
            ),

        /*
         * Phase 24 Batch 1 intentionally forbids GLOBAL
         * candidates.
         *
         * Explicit generalization/global-promotion comes
         * later in Phase 24.5.
         */
        CONSTRAINT learning_candidate_scope_check
            CHECK (
                knowledge_scope IN (
                    'ORGANIZATION',
                    'ENVIRONMENT'
                )
            ),

        CONSTRAINT learning_candidate_title_nonempty
            CHECK (
                length(
                    trim(
                        title
                    )
                ) >
                    0
            ),

        CONSTRAINT learning_candidate_payload_object
            CHECK (
                jsonb_typeof(
                    candidate_payload
                ) = 'object'
            ),

        CONSTRAINT learning_candidate_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            ),

        CONSTRAINT learning_candidate_confidence_check
            CHECK (
                confidence IS NULL

                OR

                (
                    confidence >=
                        0

                    AND

                    confidence <=
                        1
                )
            ),

        CONSTRAINT learning_candidate_source_digest_check
            CHECK (
                source_digest ~
                    '^[0-9a-f]{64}$'
            ),

        CONSTRAINT learning_candidate_digest_check
            CHECK (
                candidate_digest ~
                    '^[0-9a-f]{64}$'
            ),

        CONSTRAINT learning_candidate_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            organization_id,
            environment_id,
            id
        ),

        UNIQUE (
            organization_id,
            environment_id,
            candidate_digest
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_learning_candidates_queue
ON learning.knowledge_candidates (
    organization_id,
    environment_id,
    candidate_state,
    created_at ASC
);


CREATE INDEX IF NOT EXISTS
    idx_learning_candidates_source
ON learning.knowledge_candidates (
    organization_id,
    environment_id,
    source_bundle_id,
    candidate_type
);


-- ============================================================================
-- 2. CANDIDATE LINEAGE
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    learning.candidate_lineage (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        candidate_id UUID NOT NULL,

        source_bundle_id UUID NOT NULL,

        source_incident_id UUID NOT NULL
            REFERENCES incidents.incidents(id)
            ON DELETE RESTRICT,

        parent_candidate_id UUID,

        generator_name TEXT NOT NULL,

        generator_version TEXT NOT NULL,

        lineage_payload JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_candidate_lineage_candidate_fk
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

        CONSTRAINT learning_candidate_lineage_bundle_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                source_bundle_id
            )
            REFERENCES learning.source_bundles (
                organization_id,
                environment_id,
                id
            )
            ON DELETE RESTRICT,

        CONSTRAINT learning_candidate_lineage_parent_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                parent_candidate_id
            )
            REFERENCES learning.knowledge_candidates (
                organization_id,
                environment_id,
                id
            )
            ON DELETE RESTRICT,

        CONSTRAINT learning_candidate_lineage_payload_object
            CHECK (
                jsonb_typeof(
                    lineage_payload
                ) = 'object'
            ),

        CONSTRAINT learning_candidate_lineage_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_learning_candidate_lineage_candidate
ON learning.candidate_lineage (
    organization_id,
    environment_id,
    candidate_id,
    created_at ASC
);


-- ============================================================================
-- 3. CANDIDATE STATUS HISTORY
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    learning.candidate_status_history (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        candidate_id UUID NOT NULL,

        from_state TEXT,

        to_state TEXT NOT NULL,

        actor_type TEXT NOT NULL
            DEFAULT 'SYSTEM',

        actor_user_id UUID
            REFERENCES identity.users(id)
            ON DELETE SET NULL,

        reason TEXT NOT NULL,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_candidate_history_candidate_fk
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

        CONSTRAINT learning_candidate_history_from_state_check
            CHECK (
                from_state IS NULL

                OR

                from_state IN (
                    'GENERATED',

                    'QUARANTINED',

                    'VALIDATION_PENDING',

                    'VALIDATING',

                    'VALIDATION_FAILED',

                    'HUMAN_REVIEW_PENDING',

                    'APPROVED',

                    'REJECTED',

                    'PUBLISHED',

                    'REVOKED'
                )
            ),

        CONSTRAINT learning_candidate_history_to_state_check
            CHECK (
                to_state IN (
                    'GENERATED',

                    'QUARANTINED',

                    'VALIDATION_PENDING',

                    'VALIDATING',

                    'VALIDATION_FAILED',

                    'HUMAN_REVIEW_PENDING',

                    'APPROVED',

                    'REJECTED',

                    'PUBLISHED',

                    'REVOKED'
                )
            ),

        CONSTRAINT learning_candidate_history_actor_type_check
            CHECK (
                actor_type IN (
                    'HUMAN',
                    'SERVICE_ACCOUNT',
                    'SYSTEM'
                )
            ),

        CONSTRAINT learning_candidate_history_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            ),

        CONSTRAINT learning_candidate_history_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_learning_candidate_history
ON learning.candidate_status_history (
    organization_id,
    environment_id,
    candidate_id,
    created_at ASC
);


-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================


ALTER TABLE
    learning.knowledge_candidates
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    learning.knowledge_candidates
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.candidate_lineage
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    learning.candidate_lineage
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.candidate_status_history
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    learning.candidate_status_history
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    learning_candidates_scope
ON learning.knowledge_candidates;


CREATE POLICY
    learning_candidates_scope
ON learning.knowledge_candidates
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

    AND

    truth_level =
        'CANDIDATE'

    AND

    knowledge_scope <>
        'GLOBAL'
);


DROP POLICY IF EXISTS
    learning_candidate_lineage_scope
ON learning.candidate_lineage;


CREATE POLICY
    learning_candidate_lineage_scope
ON learning.candidate_lineage
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
    learning_candidate_history_scope
ON learning.candidate_status_history;


CREATE POLICY
    learning_candidate_history_scope
ON learning.candidate_status_history
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