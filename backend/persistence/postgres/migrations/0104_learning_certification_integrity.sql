-- ============================================================================
-- AIRA PHASE 24.9
-- HUMAN-TO-AIRA LEARNING CERTIFICATION INTEGRITY
--
-- CERTIFICATION != EXECUTION AUTHORITY
-- LEARNING != AUTONOMY PROMOTION
-- PUBLISHED KNOWLEDGE != EXECUTION AUTHORIZATION
-- ============================================================================

BEGIN;


CREATE TABLE IF NOT EXISTS
    learning.certification_runs (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lcert_' ||
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

        certification_type TEXT NOT NULL,

        certification_version TEXT NOT NULL,

        status TEXT NOT NULL
            DEFAULT 'RUNNING',

        passed BOOLEAN NULL,

        source_hash TEXT NULL,

        certification_hash TEXT NULL,

        summary JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        production_certified BOOLEAN NOT NULL
            DEFAULT FALSE,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        started_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        completed_at TIMESTAMPTZ NULL,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_certification_type_check
            CHECK (
                certification_type IN (
                    'PREFLIGHT',
                    'ADVERSARIAL',
                    'LIVE_STATE',
                    'FINAL'
                )
            ),

        CONSTRAINT learning_certification_status_check
            CHECK (
                status IN (
                    'RUNNING',
                    'PASS',
                    'FAIL'
                )
            ),

        CONSTRAINT learning_certification_source_hash_check
            CHECK (
                source_hash IS NULL
                OR
                source_hash ~
                    '^[0-9a-f]{64}$'
            ),

        CONSTRAINT learning_certification_hash_check
            CHECK (
                certification_hash IS NULL
                OR
                certification_hash ~
                    '^[0-9a-f]{64}$'
            ),

        CONSTRAINT learning_certification_summary_object
            CHECK (
                jsonb_typeof(summary) =
                    'object'
            ),

        CONSTRAINT learning_certification_never_production
            CHECK (
                production_certified =
                    FALSE
            ),

        CONSTRAINT learning_certification_never_authorizes
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


CREATE TABLE IF NOT EXISTS
    learning.certification_evidence (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        certification_run_id UUID NOT NULL,

        evidence_type TEXT NOT NULL,

        evidence_key TEXT NOT NULL,

        passed BOOLEAN NOT NULL,

        evidence JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        evidence_hash TEXT NOT NULL,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_certification_evidence_run_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                certification_run_id
            )
            REFERENCES learning.certification_runs (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_certification_evidence_object
            CHECK (
                jsonb_typeof(evidence) =
                    'object'
            ),

        CONSTRAINT learning_certification_evidence_hash_check
            CHECK (
                evidence_hash ~
                    '^[0-9a-f]{64}$'
            ),

        CONSTRAINT learning_certification_evidence_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            certification_run_id,
            evidence_key
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_learning_certification_runs_type
ON learning.certification_runs (
    organization_id,
    environment_id,
    certification_type,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_learning_certification_evidence_run
ON learning.certification_evidence (
    certification_run_id,
    evidence_type
);


ALTER TABLE
    learning.certification_runs
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.certification_runs
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.certification_evidence
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.certification_evidence
FORCE ROW LEVEL SECURITY;


CREATE POLICY
    learning_certification_runs_scope
ON learning.certification_runs
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

    production_certified =
        FALSE

    AND

    execution_authorized =
        FALSE
);


CREATE POLICY
    learning_certification_evidence_scope
ON learning.certification_evidence
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