-- ============================================================================
-- AIRA PHASE 24.7 + 24.8
-- HUMAN REVIEW + CANONICAL KNOWLEDGE PUBLICATION
--
-- AUTOMATED VALIDATION != PUBLICATION
-- REVIEW APPROVAL != EXECUTION AUTHORITY
-- PUBLICATION != EXECUTION AUTHORITY
-- REVOCATION MUST PRESERVE HISTORY
-- GLOBAL PUBLICATION REQUIRES CONTROLLED PLATFORM PATH
-- ============================================================================

BEGIN;


-- ============================================================================
-- REVIEW TASKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    learning.review_tasks (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lrview_' ||
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

        validation_run_id UUID NULL,

        status TEXT NOT NULL
            DEFAULT 'PENDING',

        risk_classification TEXT NOT NULL
            DEFAULT 'STANDARD',

        requires_independent_reviewer BOOLEAN NOT NULL
            DEFAULT FALSE,

        source_operator_id TEXT NULL,

        assigned_reviewer_id TEXT NULL,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        completed_at TIMESTAMPTZ NULL,

        CONSTRAINT learning_review_task_candidate_fk
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

        CONSTRAINT learning_review_task_validation_run_fk
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
            ON DELETE SET NULL,

        CONSTRAINT learning_review_task_status_check
            CHECK (
                status IN (
                    'PENDING',
                    'COMPLETED',
                    'CANCELLED'
                )
            ),

        CONSTRAINT learning_review_task_metadata_object
            CHECK (
                jsonb_typeof(metadata) =
                    'object'
            ),

        CONSTRAINT learning_review_task_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            organization_id,
            environment_id,
            id
        )
    );


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_learning_review_active_candidate
ON learning.review_tasks (
    candidate_id
)
WHERE
    status = 'PENDING';


CREATE INDEX IF NOT EXISTS
    idx_learning_review_tasks_candidate
ON learning.review_tasks (
    organization_id,
    environment_id,
    candidate_id,
    created_at DESC
);


-- ============================================================================
-- REVIEW DECISIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    learning.review_decisions (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lrdec_' ||
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

        review_task_id UUID NOT NULL,

        candidate_id UUID NOT NULL,

        decision TEXT NOT NULL,

        reason TEXT NOT NULL,

        reviewer_id TEXT NOT NULL,

        reviewer_type TEXT NOT NULL
            DEFAULT 'HUMAN',

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_review_decision_task_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                review_task_id
            )
            REFERENCES learning.review_tasks (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_review_decision_candidate_fk
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

        CONSTRAINT learning_review_decision_check
            CHECK (
                decision IN (
                    'APPROVE',
                    'REJECT',
                    'REQUEST_CHANGES',
                    'DEFER'
                )
            ),

        CONSTRAINT learning_review_decision_reason_required
            CHECK (
                length(
                    btrim(reason)
                ) > 0
            ),

        CONSTRAINT learning_review_decision_metadata_object
            CHECK (
                jsonb_typeof(metadata) =
                    'object'
            ),

        CONSTRAINT learning_review_decision_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        -- REQUIRED FOR COMPOSITE FK FROM knowledge_publications
        UNIQUE (
            organization_id,
            environment_id,
            id
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_learning_review_decisions_candidate
ON learning.review_decisions (
    organization_id,
    environment_id,
    candidate_id,
    created_at DESC
);


-- ============================================================================
-- PUBLICATION LEDGER
--
-- This is provenance / lifecycle history.
--
-- Actual operational knowledge remains in the canonical Phase-18
-- knowledge.* structures.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    learning.knowledge_publications (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lpub_' ||
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

        review_decision_id UUID NOT NULL,

        validation_run_id UUID NULL,

        publication_status TEXT NOT NULL
            DEFAULT 'PUBLISHED',

        target_scope TEXT NOT NULL,

        target_knowledge_type TEXT NOT NULL,

        canonical_definition_public_id TEXT NULL,

        canonical_version_public_id TEXT NULL,

        canonical_knowledge_key TEXT NOT NULL,

        publication_version TEXT NOT NULL,

        provenance JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        deprecated_at TIMESTAMPTZ NULL,

        revoked_at TIMESTAMPTZ NULL,

        CONSTRAINT learning_publication_candidate_fk
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
            ON DELETE RESTRICT,

        CONSTRAINT learning_publication_review_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                review_decision_id
            )
            REFERENCES learning.review_decisions (
                organization_id,
                environment_id,
                id
            )
            ON DELETE RESTRICT,

        CONSTRAINT learning_publication_validation_run_fk
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
            ON DELETE SET NULL,

        CONSTRAINT learning_publication_status_check
            CHECK (
                publication_status IN (
                    'PUBLISHED',
                    'DEPRECATED',
                    'REVOKED'
                )
            ),

        CONSTRAINT learning_publication_scope_check
            CHECK (
                target_scope IN (
                    'ORGANIZATION',
                    'ENVIRONMENT',
                    'GLOBAL'
                )
            ),

        CONSTRAINT learning_publication_provenance_object
            CHECK (
                jsonb_typeof(provenance) =
                    'object'
            ),

        CONSTRAINT learning_publication_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            candidate_id,
            publication_version
        ),

        UNIQUE (
            organization_id,
            environment_id,
            id
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_learning_publication_candidate
ON learning.knowledge_publications (
    organization_id,
    environment_id,
    candidate_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_learning_publication_canonical_key
ON learning.knowledge_publications (
    canonical_knowledge_key,
    publication_status
);


-- ============================================================================
-- REVOCATION / DEPRECATION RECORDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    learning.knowledge_revocations (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lrev_' ||
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

        publication_id UUID NOT NULL,

        action TEXT NOT NULL,

        reason TEXT NOT NULL,

        actor_id TEXT NOT NULL,

        actor_type TEXT NOT NULL
            DEFAULT 'HUMAN',

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_revocation_publication_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                publication_id
            )
            REFERENCES learning.knowledge_publications (
                organization_id,
                environment_id,
                id
            )
            ON DELETE RESTRICT,

        CONSTRAINT learning_revocation_action_check
            CHECK (
                action IN (
                    'DEPRECATE',
                    'REVOKE'
                )
            ),

        CONSTRAINT learning_revocation_reason_required
            CHECK (
                length(
                    btrim(reason)
                ) > 0
            ),

        CONSTRAINT learning_revocation_metadata_object
            CHECK (
                jsonb_typeof(metadata) =
                    'object'
            ),

        CONSTRAINT learning_revocation_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_learning_revocation_publication
ON learning.knowledge_revocations (
    organization_id,
    environment_id,
    publication_id,
    created_at DESC
);


-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE
    learning.review_tasks
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.review_tasks
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.review_decisions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.review_decisions
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.knowledge_publications
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.knowledge_publications
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.knowledge_revocations
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.knowledge_revocations
FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- POLICIES
-- ============================================================================

DROP POLICY IF EXISTS
    learning_review_tasks_scope
ON learning.review_tasks;


CREATE POLICY
    learning_review_tasks_scope
ON learning.review_tasks
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

    execution_authorized =
        FALSE
);


DROP POLICY IF EXISTS
    learning_review_decisions_scope
ON learning.review_decisions;


CREATE POLICY
    learning_review_decisions_scope
ON learning.review_decisions
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

    execution_authorized =
        FALSE
);


DROP POLICY IF EXISTS
    learning_publications_scope
ON learning.knowledge_publications;


CREATE POLICY
    learning_publications_scope
ON learning.knowledge_publications
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

    execution_authorized =
        FALSE
);


DROP POLICY IF EXISTS
    learning_revocations_scope
ON learning.knowledge_revocations;


CREATE POLICY
    learning_revocations_scope
ON learning.knowledge_revocations
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

    execution_authorized =
        FALSE
);


COMMIT;