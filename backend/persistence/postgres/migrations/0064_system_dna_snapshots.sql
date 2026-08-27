BEGIN;


CREATE SCHEMA IF NOT EXISTS memory;


CREATE TABLE IF NOT EXISTS memory.system_dna_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    public_id text NOT NULL UNIQUE,

    organization_id uuid NOT NULL,

    tenant_public_id text NOT NULL,

    scope_type text NOT NULL,

    environment_id uuid NULL,

    environment_public_id text NULL,

    service_id text NULL,

    resource_id text NULL,

    fingerprint text NOT NULL,

    version text NOT NULL,

    confidence numeric(8,6) NOT NULL DEFAULT 0,

    trust_score numeric(8,6) NOT NULL DEFAULT 0,

    evidence_count integer NOT NULL DEFAULT 0,

    family_count integer NOT NULL DEFAULT 0,

    complete_family_coverage boolean NOT NULL DEFAULT false,

    dna jsonb NOT NULL DEFAULT '{}'::jsonb,

    provenance jsonb NOT NULL DEFAULT '{}'::jsonb,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    status text NOT NULL DEFAULT 'ACTIVE',

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT system_dna_scope_valid
        CHECK (
            scope_type IN (
                'TENANT',
                'ENVIRONMENT',
                'SERVICE',
                'RESOURCE'
            )
        ),

    CONSTRAINT system_dna_status_valid
        CHECK (
            status IN (
                'ACTIVE',
                'SUPERSEDED',
                'ARCHIVED'
            )
        ),

    CONSTRAINT system_dna_confidence_valid
        CHECK (
            confidence >= 0
            AND confidence <= 1
        ),

    CONSTRAINT system_dna_trust_valid
        CHECK (
            trust_score >= 0
            AND trust_score <= 1
        )
);


CREATE INDEX IF NOT EXISTS
    idx_system_dna_org
ON memory.system_dna_snapshots (
    organization_id
);


CREATE INDEX IF NOT EXISTS
    idx_system_dna_scope
ON memory.system_dna_snapshots (
    organization_id,
    scope_type,
    environment_public_id,
    service_id,
    resource_id,
    status
);


CREATE INDEX IF NOT EXISTS
    idx_system_dna_fingerprint
ON memory.system_dna_snapshots (
    fingerprint
);


ALTER TABLE
    memory.system_dna_snapshots
ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    system_dna_read_policy
ON memory.system_dna_snapshots;


CREATE POLICY
    system_dna_read_policy
ON memory.system_dna_snapshots
FOR SELECT
USING (
    organization_id =
    tenancy.current_organization_id()
);


DROP POLICY IF EXISTS
    system_dna_write_policy
ON memory.system_dna_snapshots;


CREATE POLICY
    system_dna_write_policy
ON memory.system_dna_snapshots
FOR ALL
USING (
    organization_id =
    tenancy.current_organization_id()
)
WITH CHECK (
    organization_id =
    tenancy.current_organization_id()
);


COMMIT;