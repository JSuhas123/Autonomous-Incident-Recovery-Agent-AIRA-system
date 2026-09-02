BEGIN;

-- ============================================================================
-- AIRA PHASE 23R.1
-- CANONICAL REALITYCASE + CORPUS REGISTRY
-- ============================================================================
--
-- INVARIANTS
--
--   * PostgreSQL is canonical authority for corpus metadata and case versions.
--   * Every row is organization/environment scoped and FORCE RLS protected.
--   * Replay-visible evidence and sealed evaluation truth are persisted apart.
--   * Ground truth is never selected by replay-facing repository methods.
--   * Case versions are immutable and SHA-256 content-addressed.
--   * A RealityCase or benchmark result can never grant execution authority.
--   * Phase-23 human-control semantics remain untouched.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS reality;

-- ============================================================================
-- 1. DATASET SOURCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS reality.dataset_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    source_kind TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_version TEXT NOT NULL,
    license TEXT NOT NULL,
    source_uri TEXT,
    modified BOOLEAN NOT NULL DEFAULT FALSE,
    ground_truth_method TEXT NOT NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT reality_dataset_source_public_scope_unique
        UNIQUE (
            organization_id,
            environment_id,
            public_id
        ),

    CONSTRAINT reality_dataset_source_scope_id_unique
        UNIQUE (
            organization_id,
            environment_id,
            id
        ),

    CONSTRAINT reality_dataset_source_kind_check
        CHECK (
            source_kind IN (
                'SYNTHETIC',
                'GENERATED_SIMULATION',
                'AIRA_LAB',
                'EXTERNAL_BENCHMARK',
                'PUBLIC_INCIDENT_RECONSTRUCTION',
                'CONTROLLED_INFRASTRUCTURE',
                'VERIFIED_PRODUCTION'
            )
        ),

    CONSTRAINT reality_dataset_source_metadata_object
        CHECK (
            jsonb_typeof(metadata) = 'object'
        ),

    CONSTRAINT reality_dataset_source_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        )
);

CREATE INDEX IF NOT EXISTS
    idx_reality_dataset_sources_lookup
ON reality.dataset_sources (
    organization_id,
    environment_id,
    source_kind,
    source_name
);

-- ============================================================================
-- 2. CORPORA
-- ============================================================================

CREATE TABLE IF NOT EXISTS reality.corpora (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,
    description TEXT,

    status TEXT NOT NULL DEFAULT 'DRAFT',

    corpus_version INTEGER NOT NULL DEFAULT 1,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    frozen_at TIMESTAMPTZ,

    CONSTRAINT reality_corpus_public_scope_unique
        UNIQUE (
            organization_id,
            environment_id,
            public_id
        ),

    CONSTRAINT reality_corpus_scope_id_unique
        UNIQUE (
            organization_id,
            environment_id,
            id
        ),

    CONSTRAINT reality_corpus_status_check
        CHECK (
            status IN (
                'DRAFT',
                'ACTIVE',
                'FROZEN',
                'RETIRED'
            )
        ),

    CONSTRAINT reality_corpus_version_positive
        CHECK (
            corpus_version >= 1
        ),

    CONSTRAINT reality_corpus_metadata_object
        CHECK (
            jsonb_typeof(metadata) = 'object'
        ),

    CONSTRAINT reality_corpus_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        )
);

CREATE INDEX IF NOT EXISTS
    idx_reality_corpora_status
ON reality.corpora (
    organization_id,
    environment_id,
    status,
    created_at DESC
);

-- ============================================================================
-- 3. CANONICAL CASE IDENTITIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS reality.cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    corpus_id UUID NOT NULL,

    dataset_source_id UUID,

    case_key TEXT NOT NULL,

    title TEXT NOT NULL,

    evidence_grade TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'ACTIVE',

    current_revision INTEGER NOT NULL DEFAULT 0,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT reality_case_corpus_fk
        FOREIGN KEY (
            organization_id,
            environment_id,
            corpus_id
        )
        REFERENCES reality.corpora (
            organization_id,
            environment_id,
            id
        )
        ON DELETE CASCADE,

    CONSTRAINT reality_case_dataset_source_fk
        FOREIGN KEY (
            organization_id,
            environment_id,
            dataset_source_id
        )
        REFERENCES reality.dataset_sources (
            organization_id,
            environment_id,
            id
        )
        ON DELETE RESTRICT,

    CONSTRAINT reality_case_public_scope_unique
        UNIQUE (
            organization_id,
            environment_id,
            public_id
        ),

    CONSTRAINT reality_case_scope_id_unique
        UNIQUE (
            organization_id,
            environment_id,
            id
        ),

    CONSTRAINT reality_case_key_per_corpus_unique
        UNIQUE (
            organization_id,
            environment_id,
            corpus_id,
            case_key
        ),

    CONSTRAINT reality_case_grade_check
        CHECK (
            evidence_grade IN (
                'E0',
                'E1',
                'E2',
                'E3',
                'E4',
                'E5',
                'E6'
            )
        ),

    CONSTRAINT reality_case_status_check
        CHECK (
            status IN (
                'ACTIVE',
                'DISABLED',
                'RETIRED'
            )
        ),

    CONSTRAINT reality_case_revision_nonnegative
        CHECK (
            current_revision >= 0
        ),

    CONSTRAINT reality_case_metadata_object
        CHECK (
            jsonb_typeof(metadata) = 'object'
        ),

    CONSTRAINT reality_case_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        )
);

CREATE INDEX IF NOT EXISTS
    idx_reality_cases_corpus_grade
ON reality.cases (
    organization_id,
    environment_id,
    corpus_id,
    evidence_grade,
    status
);

-- ============================================================================
-- 4. IMMUTABLE REPLAY-VISIBLE CASE VERSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS reality.case_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    case_id UUID NOT NULL,

    revision INTEGER NOT NULL,

    contract_version TEXT NOT NULL,

    content_hash TEXT NOT NULL,

    /*
     * IMPORTANT:
     *
     * visible_case is the replay-visible RealityCase document only.
     *
     * sealedEvaluation and evaluationRubric are deliberately removed
     * before this JSON reaches PostgreSQL.
     */
    visible_case JSONB NOT NULL,

    is_current BOOLEAN NOT NULL DEFAULT TRUE,

    superseded_at TIMESTAMPTZ,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT reality_case_version_case_fk
        FOREIGN KEY (
            organization_id,
            environment_id,
            case_id
        )
        REFERENCES reality.cases (
            organization_id,
            environment_id,
            id
        )
        ON DELETE CASCADE,

    CONSTRAINT reality_case_version_public_scope_unique
        UNIQUE (
            organization_id,
            environment_id,
            public_id
        ),

    CONSTRAINT reality_case_version_scope_id_unique
        UNIQUE (
            organization_id,
            environment_id,
            id
        ),

    CONSTRAINT reality_case_version_revision_unique
        UNIQUE (
            organization_id,
            environment_id,
            case_id,
            revision
        ),

    CONSTRAINT reality_case_version_hash_unique
        UNIQUE (
            organization_id,
            environment_id,
            case_id,
            content_hash
        ),

    CONSTRAINT reality_case_version_revision_positive
        CHECK (
            revision >= 1
        ),

    CONSTRAINT reality_case_version_hash_sha256
        CHECK (
            content_hash ~ '^[a-fA-F0-9]{64}$'
        ),

    CONSTRAINT reality_case_version_visible_object
        CHECK (
            jsonb_typeof(visible_case) = 'object'
        ),

    /*
     * Database-level answer-sealing boundary.
     *
     * Even if application code makes a mistake, the replay-visible
     * document cannot contain the two canonical sealed sections.
     */
    CONSTRAINT reality_case_version_visible_has_no_ground_truth
        CHECK (
            NOT (
                visible_case
                ? 'sealedEvaluation'
            )

            AND

            NOT (
                visible_case
                ? 'evaluationRubric'
            )
        ),

    CONSTRAINT reality_case_version_metadata_object
        CHECK (
            jsonb_typeof(metadata) = 'object'
        ),

    CONSTRAINT reality_case_version_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS
    idx_reality_case_versions_one_current
ON reality.case_versions (
    organization_id,
    environment_id,
    case_id
)
WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS
    idx_reality_case_versions_hash
ON reality.case_versions (
    organization_id,
    environment_id,
    content_hash
);

-- ============================================================================
-- 5. SEALED EVALUATION CHANNEL
-- ============================================================================

CREATE TABLE IF NOT EXISTS reality.case_ground_truth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    case_id UUID NOT NULL,

    case_version_id UUID NOT NULL,

    /*
     * These columns must never be included in the replay-facing query path.
     */
    sealed_evaluation JSONB NOT NULL,

    evaluation_rubric JSONB NOT NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT reality_ground_truth_case_fk
        FOREIGN KEY (
            organization_id,
            environment_id,
            case_id
        )
        REFERENCES reality.cases (
            organization_id,
            environment_id,
            id
        )
        ON DELETE CASCADE,

    CONSTRAINT reality_ground_truth_version_fk
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
        ON DELETE CASCADE,

    CONSTRAINT reality_ground_truth_public_scope_unique
        UNIQUE (
            organization_id,
            environment_id,
            public_id
        ),

    CONSTRAINT reality_ground_truth_one_per_version
        UNIQUE (
            organization_id,
            environment_id,
            case_version_id
        ),

    CONSTRAINT reality_ground_truth_sealed_object
        CHECK (
            jsonb_typeof(
                sealed_evaluation
            ) = 'object'
        ),

    CONSTRAINT reality_ground_truth_rubric_object
        CHECK (
            jsonb_typeof(
                evaluation_rubric
            ) = 'object'
        ),

    CONSTRAINT reality_ground_truth_metadata_object
        CHECK (
            jsonb_typeof(metadata) = 'object'
        ),

    CONSTRAINT reality_ground_truth_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        )
);

-- ============================================================================
-- 6. ORGANIZATION / ENVIRONMENT SCOPE VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    reality.aira_validate_reality_scope()
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

    IF
        actual_organization_id
        IS NULL
    THEN
        RAISE EXCEPTION
            'reality environment does not exist';
    END IF;

    IF
        actual_organization_id
        <>
        NEW.organization_id
    THEN
        RAISE EXCEPTION
            'reality organization/environment mismatch';
    END IF;

    IF
        NEW.execution_authorized
        <>
        FALSE
    THEN
        RAISE EXCEPTION
            'reality corpus state cannot authorize AIRA execution';
    END IF;

    RETURN NEW;
END;
$$;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH
        table_name
    IN ARRAY
        ARRAY[
            'dataset_sources',
            'corpora',
            'cases',
            'case_versions',
            'case_ground_truth'
        ]
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_reality_scope_%I ON reality.%I',
            table_name,
            table_name
        );

        EXECUTE format(
            'CREATE TRIGGER trg_reality_scope_%I
             BEFORE INSERT OR UPDATE
             ON reality.%I
             FOR EACH ROW
             EXECUTE FUNCTION reality.aira_validate_reality_scope()',
            table_name,
            table_name
        );
    END LOOP;
END;
$$;

-- ============================================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================================

DO $$
DECLARE
    table_name TEXT;
    policy_name TEXT;
BEGIN
    FOREACH
        table_name
    IN ARRAY
        ARRAY[
            'dataset_sources',
            'corpora',
            'cases',
            'case_versions',
            'case_ground_truth'
        ]
    LOOP
        EXECUTE format(
            'ALTER TABLE reality.%I ENABLE ROW LEVEL SECURITY',
            table_name
        );

        EXECUTE format(
            'ALTER TABLE reality.%I FORCE ROW LEVEL SECURITY',
            table_name
        );

        policy_name :=
            'reality_' ||
            table_name ||
            '_tenant_policy';

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON reality.%I',
            policy_name,
            table_name
        );

        EXECUTE format(
            'CREATE POLICY %I
             ON reality.%I
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
             )',
            policy_name,
            table_name
        );
    END LOOP;
END;
$$;

COMMIT;