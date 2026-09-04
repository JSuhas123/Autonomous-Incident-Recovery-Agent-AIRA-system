-- ============================================================================
-- AIRA PHASE 24.5
-- TENANT KNOWLEDGE ISOLATION + EXPLICIT GLOBAL GENERALIZATION
--
-- TENANT KNOWLEDGE != GLOBAL KNOWLEDGE
-- TENANT CANDIDATE != GLOBAL CANDIDATE
-- GENERALIZATION != MUTATION
-- SCRUBBED != VALIDATED
-- GLOBAL PROPOSAL != PUBLISHED KNOWLEDGE
-- LEARNING != EXECUTION AUTHORITY
--
-- Ordinary tenant sessions remain unable to write canonical GLOBAL
-- Phase-18 production knowledge.
-- ============================================================================

BEGIN;


-- ============================================================================
-- GENERALIZATION REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    learning.generalization_requests (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lgen_' ||
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

        source_candidate_id UUID NOT NULL,

        source_candidate_digest TEXT NOT NULL,

        source_scope TEXT NOT NULL,

        target_scope TEXT NOT NULL
            DEFAULT 'GLOBAL',

        status TEXT NOT NULL
            DEFAULT 'REQUESTED',

        request_reason TEXT NOT NULL,

        requested_by_type TEXT NOT NULL
            DEFAULT 'SYSTEM',

        requested_by_id TEXT,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        completed_at TIMESTAMPTZ,

        CONSTRAINT learning_generalization_candidate_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                source_candidate_id
            )
            REFERENCES learning.knowledge_candidates (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_generalization_source_scope_check
            CHECK (
                source_scope IN (
                    'ORGANIZATION',
                    'ENVIRONMENT'
                )
            ),

        CONSTRAINT learning_generalization_target_scope_check
            CHECK (
                target_scope =
                    'GLOBAL'
            ),

        CONSTRAINT learning_generalization_status_check
            CHECK (
                status IN (
                    'REQUESTED',
                    'PROCESSING',
                    'BOUNDARY_REVIEW_PENDING',
                    'BOUNDARY_APPROVED',
                    'BOUNDARY_REJECTED',
                    'FAILED',
                    'CANCELLED'
                )
            ),

        CONSTRAINT learning_generalization_digest_check
            CHECK (
                source_candidate_digest ~
                    '^[0-9a-f]{64}$'
            ),

        CONSTRAINT learning_generalization_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) =
                    'object'
            ),

        CONSTRAINT learning_generalization_never_authorizes
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


CREATE INDEX IF NOT EXISTS
    idx_learning_generalization_source_candidate
ON learning.generalization_requests (
    organization_id,
    environment_id,
    source_candidate_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_learning_generalization_status
ON learning.generalization_requests (
    organization_id,
    environment_id,
    status,
    created_at DESC
);


-- ============================================================================
-- GENERALIZED CANDIDATE ARTIFACTS
--
-- IMPORTANT:
--
-- These are quarantined proposals.
--
-- They are NOT inserted into canonical GLOBAL Phase-18 knowledge.
-- They are NOT directly visible cross-tenant.
-- They are NOT execution-authoritative.
--
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    learning.generalization_artifacts (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lgart_' ||
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                )
            ),

        generalized_candidate_public_id TEXT NOT NULL
            UNIQUE,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        generalization_request_id UUID NOT NULL,

        source_candidate_id UUID NOT NULL,

        artifact_digest TEXT NOT NULL,

        proposed_scope TEXT NOT NULL
            DEFAULT 'GLOBAL',

        candidate_type TEXT NOT NULL,

        truth_level TEXT NOT NULL
            DEFAULT 'CANDIDATE',

        generalized_candidate JSONB NOT NULL,

        redaction_manifest JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        leakage_findings JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        status TEXT NOT NULL
            DEFAULT 'QUARANTINED',

        publication_eligible BOOLEAN NOT NULL
            DEFAULT FALSE,

        requires_independent_validation BOOLEAN NOT NULL
            DEFAULT TRUE,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_generalization_artifact_request_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                generalization_request_id
            )
            REFERENCES learning.generalization_requests (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_generalization_artifact_candidate_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                source_candidate_id
            )
            REFERENCES learning.knowledge_candidates (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_generalization_artifact_scope_check
            CHECK (
                proposed_scope =
                    'GLOBAL'
            ),

        CONSTRAINT learning_generalization_artifact_truth_check
            CHECK (
                truth_level =
                    'CANDIDATE'
            ),

        CONSTRAINT learning_generalization_artifact_digest_check
            CHECK (
                artifact_digest ~
                    '^[0-9a-f]{64}$'
            ),

        CONSTRAINT learning_generalization_candidate_object
            CHECK (
                jsonb_typeof(
                    generalized_candidate
                ) =
                    'object'
            ),

        CONSTRAINT learning_generalization_redaction_object
            CHECK (
                jsonb_typeof(
                    redaction_manifest
                ) =
                    'object'
            ),

        CONSTRAINT learning_generalization_findings_array
            CHECK (
                jsonb_typeof(
                    leakage_findings
                ) =
                    'array'
            ),

        CONSTRAINT learning_generalization_artifact_status_check
            CHECK (
                status IN (
                    'QUARANTINED',
                    'BOUNDARY_CLEAN',
                    'BOUNDARY_REJECTED'
                )
            ),

        CONSTRAINT learning_generalization_not_publishable
            CHECK (
                publication_eligible =
                    FALSE
            ),

        CONSTRAINT learning_generalization_requires_revalidation
            CHECK (
                requires_independent_validation =
                    TRUE
            ),

        CONSTRAINT learning_generalization_artifact_never_authorizes
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


CREATE INDEX IF NOT EXISTS
    idx_learning_generalization_artifact_request
ON learning.generalization_artifacts (
    organization_id,
    environment_id,
    generalization_request_id
);


-- ============================================================================
-- CROSS-TENANT ISOLATION CHECKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    learning.generalization_isolation_checks (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        generalization_request_id UUID NOT NULL,

        artifact_id UUID NOT NULL,

        check_type TEXT NOT NULL,

        passed BOOLEAN NOT NULL,

        findings JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        metrics JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_generalization_check_request_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                generalization_request_id
            )
            REFERENCES learning.generalization_requests (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_generalization_check_artifact_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                artifact_id
            )
            REFERENCES learning.generalization_artifacts (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_generalization_check_type
            CHECK (
                check_type IN (
                    'TENANT_IDENTIFIER_LEAKAGE',
                    'SECRET_LEAKAGE',
                    'TOPOLOGY_LEAKAGE',
                    'SOURCE_IDENTITY_LEAKAGE',
                    'CROSS_TENANT_RETRIEVAL'
                )
            ),

        CONSTRAINT learning_generalization_findings_array_check
            CHECK (
                jsonb_typeof(
                    findings
                ) =
                    'array'
            ),

        CONSTRAINT learning_generalization_metrics_object_check
            CHECK (
                jsonb_typeof(
                    metrics
                ) =
                    'object'
            ),

        CONSTRAINT learning_generalization_check_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            artifact_id,
            check_type
        )
    );


-- ============================================================================
-- GENERALIZATION BOUNDARY REVIEWS
--
-- This is NOT the final Phase 24.7 knowledge review.
--
-- It only approves or rejects the privacy/generalization boundary.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    learning.generalization_reviews (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        generalization_request_id UUID NOT NULL,

        artifact_id UUID NOT NULL,

        decision TEXT NOT NULL,

        reason TEXT NOT NULL,

        reviewer_type TEXT NOT NULL,

        reviewer_id TEXT NOT NULL,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_generalization_review_request_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                generalization_request_id
            )
            REFERENCES learning.generalization_requests (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_generalization_review_artifact_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                artifact_id
            )
            REFERENCES learning.generalization_artifacts (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_generalization_review_decision_check
            CHECK (
                decision IN (
                    'APPROVE',
                    'REJECT',
                    'REQUEST_CHANGES'
                )
            ),

        CONSTRAINT learning_generalization_review_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) =
                    'object'
            ),

        CONSTRAINT learning_generalization_review_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            )
    );


-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE
    learning.generalization_requests
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.generalization_requests
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.generalization_artifacts
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.generalization_artifacts
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.generalization_isolation_checks
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.generalization_isolation_checks
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.generalization_reviews
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.generalization_reviews
FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- TENANT POLICIES
-- ============================================================================

DROP POLICY IF EXISTS
    learning_generalization_requests_scope
ON learning.generalization_requests;


CREATE POLICY
    learning_generalization_requests_scope
ON learning.generalization_requests
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

    target_scope =
        'GLOBAL'

    AND

    execution_authorized =
        FALSE
);


DROP POLICY IF EXISTS
    learning_generalization_artifacts_scope
ON learning.generalization_artifacts;


CREATE POLICY
    learning_generalization_artifacts_scope
ON learning.generalization_artifacts
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

    proposed_scope =
        'GLOBAL'

    AND

    truth_level =
        'CANDIDATE'

    AND

    publication_eligible =
        FALSE

    AND

    requires_independent_validation =
        TRUE

    AND

    execution_authorized =
        FALSE
);


DROP POLICY IF EXISTS
    learning_generalization_checks_scope
ON learning.generalization_isolation_checks;


CREATE POLICY
    learning_generalization_checks_scope
ON learning.generalization_isolation_checks
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
    learning_generalization_reviews_scope
ON learning.generalization_reviews;


CREATE POLICY
    learning_generalization_reviews_scope
ON learning.generalization_reviews
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