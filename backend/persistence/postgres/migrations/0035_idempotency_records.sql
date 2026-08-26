CREATE SCHEMA IF NOT EXISTS workflow;

CREATE TABLE IF NOT EXISTS workflow.idempotency_records (
    id TEXT PRIMARY KEY,

    organization_id TEXT NOT NULL,
    environment_id TEXT NOT NULL,

    operation TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'PROCESSING',

    owner_id TEXT,
    claim_token TEXT,

    incident_id TEXT,
    recovery_decision_id TEXT,
    execution_request_id TEXT,
    verification_id TEXT,
    lifecycle_id TEXT,
    event_id TEXT,
    correlation_id TEXT,

    request_fingerprint TEXT,

    result JSONB,
    result_reference TEXT,

    failure JSONB,

    claimed_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,

    completed_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,

    attempt_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    last_duplicate_at TIMESTAMPTZ,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    schema_version INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uniq_idempotency_scope_operation_key
        UNIQUE (
            organization_id,
            environment_id,
            operation,
            idempotency_key
        )
);

CREATE INDEX IF NOT EXISTS idx_idempotency_stale_claims
    ON workflow.idempotency_records (
        status,
        lease_expires_at
    );

CREATE INDEX IF NOT EXISTS idx_idempotency_incident_history
    ON workflow.idempotency_records (
        organization_id,
        environment_id,
        incident_id,
        created_at DESC
    );

CREATE INDEX IF NOT EXISTS idx_idempotency_execution_request
    ON workflow.idempotency_records (
        organization_id,
        environment_id,
        execution_request_id
    );