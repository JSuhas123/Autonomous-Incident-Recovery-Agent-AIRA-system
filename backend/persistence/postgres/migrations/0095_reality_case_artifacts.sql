BEGIN;

-- ============================================================================
-- AIRA PHASE 23R.2
-- EVIDENCE STORE + OBJECT STORAGE METADATA
-- ============================================================================
--
-- PostgreSQL stores:
--
--   metadata
--   object identity
--   SHA-256 hashes
--   media type
--   size
--   provenance
--   object-storage location
--
-- PostgreSQL DOES NOT store the large evidence body.
--
-- Object storage:
--
--   != transactional authority
--   != ground-truth authority
--   != execution authority
--
-- Replay-visible artifacts and sealed-evaluation artifacts remain
-- explicitly separated by channel.
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    reality.case_artifacts (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL,


        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,


        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,


        case_version_id UUID NOT NULL,


        artifact_kind TEXT NOT NULL,


        channel TEXT NOT NULL
            DEFAULT 'EVIDENCE',


        content_hash TEXT NOT NULL,


        byte_size BIGINT NOT NULL,


        media_type TEXT NOT NULL
            DEFAULT 'application/octet-stream',


        storage_bucket TEXT NOT NULL,


        storage_key TEXT NOT NULL,


        etag TEXT,


        provenance JSONB NOT NULL
            DEFAULT '{}'::jsonb,


        trusted_ground_truth BOOLEAN NOT NULL
            DEFAULT FALSE,


        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,


        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),


        CONSTRAINT reality_case_artifact_version_fk
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


        CONSTRAINT reality_case_artifact_public_unique
            UNIQUE (
                organization_id,
                environment_id,
                case_version_id,
                public_id
            ),


        CONSTRAINT reality_case_artifact_kind_check
            CHECK (
                artifact_kind IN (
                    'SIGNAL',
                    'METRIC',
                    'LOG',
                    'TRACE',
                    'TOPOLOGY',
                    'RESOURCE_STATE',
                    'MANIFEST',
                    'DATASET_BUNDLE',
                    'POSTMORTEM',
                    'REPLAY_OUTPUT',
                    'CERTIFICATION_EVIDENCE'
                )
            ),


        CONSTRAINT reality_case_artifact_channel_check
            CHECK (
                channel IN (
                    'EVIDENCE',
                    'SEALED_EVALUATION'
                )
            ),


        CONSTRAINT reality_case_artifact_hash_sha256
            CHECK (
                content_hash ~
                    '^[a-fA-F0-9]{64}$'
            ),


        CONSTRAINT reality_case_artifact_size_nonnegative
            CHECK (
                byte_size >= 0
            ),


        CONSTRAINT reality_case_artifact_provenance_object
            CHECK (
                jsonb_typeof(
                    provenance
                ) =
                'object'
            ),


        /*
         * Permanent 23R rule:
         *
         * Object-storage content may support evaluation,
         * but its presence never establishes trusted truth.
         *
         * Trust comes from canonical provenance / evaluation metadata.
         */
        CONSTRAINT reality_case_artifact_not_ground_truth_authority
            CHECK (
                trusted_ground_truth = FALSE
            ),


        CONSTRAINT reality_case_artifact_never_authorizes_execution
            CHECK (
                execution_authorized = FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_reality_case_artifacts_version
ON reality.case_artifacts (
    organization_id,
    environment_id,
    case_version_id,
    channel,
    created_at
);


CREATE INDEX IF NOT EXISTS
    idx_reality_case_artifacts_hash
ON reality.case_artifacts (
    organization_id,
    environment_id,
    content_hash
);


CREATE INDEX IF NOT EXISTS
    idx_reality_case_artifacts_kind
ON reality.case_artifacts (
    organization_id,
    environment_id,
    artifact_kind
);


-- ============================================================================
-- TENANT / ENVIRONMENT SCOPE
-- ============================================================================
--
-- Reuse the Phase 23R.1 scope validator.
-- ============================================================================


DROP TRIGGER IF EXISTS
    trg_reality_scope_case_artifacts
ON reality.case_artifacts;


CREATE TRIGGER
    trg_reality_scope_case_artifacts

BEFORE INSERT OR UPDATE
ON reality.case_artifacts

FOR EACH ROW

EXECUTE FUNCTION
    reality.aira_validate_reality_scope();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================


ALTER TABLE
    reality.case_artifacts
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    reality.case_artifacts
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    reality_case_artifacts_tenant_policy
ON reality.case_artifacts;


CREATE POLICY
    reality_case_artifacts_tenant_policy

ON reality.case_artifacts

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

    trusted_ground_truth =
        FALSE

    AND

    execution_authorized =
        FALSE
);


COMMIT;