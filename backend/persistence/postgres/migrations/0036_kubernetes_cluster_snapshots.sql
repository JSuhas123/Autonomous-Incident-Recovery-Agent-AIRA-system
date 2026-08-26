CREATE SCHEMA IF NOT EXISTS inventory;

CREATE TABLE IF NOT EXISTS inventory.kubernetes_cluster_snapshots (
    id UUID PRIMARY KEY,

    tenant_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    environment_id TEXT,
    integration_id TEXT NOT NULL,

    discovered_at TIMESTAMPTZ NOT NULL,

    summary JSONB NOT NULL DEFAULT '{}'::jsonb,

    duration_ms INTEGER,

    success BOOLEAN NOT NULL DEFAULT TRUE,

    error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_k8s_snapshot_integration
ON inventory.kubernetes_cluster_snapshots (
    organization_id,
    environment_id,
    integration_id,
    discovered_at DESC
);

CREATE INDEX IF NOT EXISTS idx_k8s_snapshot_environment
ON inventory.kubernetes_cluster_snapshots (
    organization_id,
    environment_id,
    discovered_at DESC
);

CREATE INDEX IF NOT EXISTS idx_k8s_snapshot_success
ON inventory.kubernetes_cluster_snapshots (
    organization_id,
    environment_id,
    success,
    discovered_at DESC
);
