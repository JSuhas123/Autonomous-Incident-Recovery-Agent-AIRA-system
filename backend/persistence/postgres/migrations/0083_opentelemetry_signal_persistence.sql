-- ============================================================================
-- AIRA PHASE 21.10B-O
-- OPENTELEMETRY NORMALIZED SIGNAL POSTGRESQL CUTOVER
-- ============================================================================
--
-- PostgreSQL stores only normalized operational signals consumed by AIRA.
--
-- PostgreSQL is NOT a bulk telemetry warehouse.
-- External observability systems remain authoritative for raw/bulk telemetry.
--
-- This table exists for:
--   - deterministic ingestion
--   - tenant-scoped operational correlation
--   - idempotency
--   - bounded operational queries
--   - Phase 20/21 integration verification
--
-- OpenTelemetry ingestion NEVER grants execution authorization.
-- ============================================================================


CREATE SCHEMA IF NOT EXISTS integrations;


CREATE TABLE IF NOT EXISTS
    integrations.opentelemetry_signals (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        integration_id UUID NOT NULL
            REFERENCES integrations.connections(id)
            ON DELETE CASCADE,

        tenant_id TEXT NOT NULL,

        provider TEXT NOT NULL
            DEFAULT 'opentelemetry',

        signal_type TEXT NOT NULL,

        signal_id TEXT NOT NULL,

        payload_hash TEXT NOT NULL,

        service_name TEXT,

        trace_id TEXT,

        span_id TEXT,

        parent_span_id TEXT,

        name TEXT,

        severity TEXT NOT NULL
            DEFAULT 'unknown',

        signal_timestamp TIMESTAMPTZ NOT NULL,

        observed_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        attributes JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        resource_attributes JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        scope JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        log_data JSONB,

        metric_data JSONB,

        span_data JSONB,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        CONSTRAINT integrations_otel_provider_check
            CHECK (
                provider =
                    'opentelemetry'
            ),

        CONSTRAINT integrations_otel_signal_type_check
            CHECK (
                signal_type IN (
                    'log',
                    'metric',
                    'trace'
                )
            ),

        CONSTRAINT integrations_otel_severity_check
            CHECK (
                severity IN (
                    'debug',
                    'info',
                    'warning',
                    'error',
                    'critical',
                    'unknown'
                )
            ),

        CONSTRAINT integrations_otel_attributes_object
            CHECK (
                jsonb_typeof(
                    attributes
                ) =
                'object'
            ),

        CONSTRAINT integrations_otel_resource_attributes_object
            CHECK (
                jsonb_typeof(
                    resource_attributes
                ) =
                'object'
            ),

        CONSTRAINT integrations_otel_scope_object
            CHECK (
                jsonb_typeof(
                    scope
                ) =
                'object'
            ),

        CONSTRAINT integrations_otel_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            organization_id,
            environment_id,
            integration_id,
            signal_id
        )
    );


CREATE INDEX IF NOT EXISTS
    idx_integrations_otel_scope_type_time
ON integrations.opentelemetry_signals (
    organization_id,
    environment_id,
    signal_type,
    signal_timestamp DESC
);


CREATE INDEX IF NOT EXISTS
    idx_integrations_otel_service_type_time
ON integrations.opentelemetry_signals (
    organization_id,
    environment_id,
    service_name,
    signal_type,
    signal_timestamp DESC
);


CREATE INDEX IF NOT EXISTS
    idx_integrations_otel_trace
ON integrations.opentelemetry_signals (
    organization_id,
    environment_id,
    trace_id
)
WHERE trace_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
    idx_integrations_otel_integration_time
ON integrations.opentelemetry_signals (
    organization_id,
    environment_id,
    integration_id,
    signal_timestamp DESC
);


-- ============================================================================
-- UPDATED_AT
-- ============================================================================


CREATE OR REPLACE FUNCTION
    integrations.aira_touch_opentelemetry_signal_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at =
        NOW();

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_integrations_otel_touch_updated_at
ON integrations.opentelemetry_signals;


CREATE TRIGGER
    trg_integrations_otel_touch_updated_at
BEFORE UPDATE
ON integrations.opentelemetry_signals
FOR EACH ROW
EXECUTE FUNCTION
    integrations.aira_touch_opentelemetry_signal_updated_at();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================


ALTER TABLE
    integrations.opentelemetry_signals
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    integrations.opentelemetry_signals
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    integrations_opentelemetry_signals_tenant_policy
ON integrations.opentelemetry_signals;


CREATE POLICY
    integrations_opentelemetry_signals_tenant_policy
ON integrations.opentelemetry_signals
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