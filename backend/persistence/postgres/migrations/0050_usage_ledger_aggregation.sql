-- ============================================================================
-- AIRA PHASE 15.6 + 15.7 + 15.8
--
-- IMMUTABLE USAGE LEDGER
-- FINANCIAL IDEMPOTENCY
-- USAGE AGGREGATION
--
-- PostgreSQL is authoritative.
--
-- Redis may later mirror hot counters.
-- RabbitMQ may later distribute usage events.
-- ClickHouse may later receive analytical copies.
--
-- None of those systems owns billable usage truth.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;


-- ============================================================================
-- RAW IMMUTABLE USAGE EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.usage_events (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    event_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    environment_id UUID
        REFERENCES tenancy.environments(id)
        ON DELETE RESTRICT,

    meter_definition_id UUID NOT NULL
        REFERENCES billing.meter_definitions(id)
        ON DELETE RESTRICT,

    meter_code TEXT NOT NULL,

    meter_version INTEGER NOT NULL,

    quantity NUMERIC(30, 6) NOT NULL,

    idempotency_key TEXT NOT NULL,

    source_type TEXT NOT NULL,

    source_id TEXT,

    correlation_id TEXT,

    incident_id TEXT,

    execution_request_id TEXT,

    recovery_decision_id TEXT,

    agent_run_id TEXT,

    integration_id TEXT,

    occurred_at TIMESTAMPTZ NOT NULL,

    recorded_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    schema_version INTEGER NOT NULL
        DEFAULT 1,

    CONSTRAINT usage_event_id_unique
        UNIQUE (event_id),

    CONSTRAINT usage_event_idempotency_unique
        UNIQUE (
            organization_id,
            meter_code,
            idempotency_key
        ),

    CONSTRAINT usage_event_quantity_positive
        CHECK (
            quantity > 0
        ),

    CONSTRAINT usage_event_meter_version_positive
        CHECK (
            meter_version > 0
        ),

    CONSTRAINT usage_event_source_type_nonempty
        CHECK (
            length(trim(source_type)) > 0
        ),

    CONSTRAINT usage_event_idempotency_nonempty
        CHECK (
            length(trim(idempotency_key)) > 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_usage_events_org_meter_time
ON billing.usage_events (
    organization_id,
    meter_code,
    occurred_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_usage_events_environment_meter_time
ON billing.usage_events (
    organization_id,
    environment_id,
    meter_code,
    occurred_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_usage_events_source
ON billing.usage_events (
    organization_id,
    source_type,
    source_id
);


CREATE INDEX IF NOT EXISTS
    idx_usage_events_incident
ON billing.usage_events (
    organization_id,
    incident_id,
    occurred_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_usage_events_recovery
ON billing.usage_events (
    organization_id,
    recovery_decision_id,
    occurred_at DESC
);


-- ============================================================================
-- DATABASE TENANT/ENVIRONMENT INTEGRITY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_validate_usage_event_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    environment_organization_id UUID;
BEGIN

    IF NEW.environment_id IS NULL THEN
        RETURN NEW;
    END IF;


    SELECT
        organization_id
    INTO
        environment_organization_id
    FROM tenancy.environments
    WHERE id =
        NEW.environment_id;


    IF environment_organization_id IS NULL THEN
        RAISE EXCEPTION
            'usage event environment does not exist';
    END IF;


    IF environment_organization_id <>
        NEW.organization_id
    THEN
        RAISE EXCEPTION
            'usage event organization/environment mismatch';
    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_usage_event_scope
ON billing.usage_events;


CREATE TRIGGER
    trg_usage_event_scope
BEFORE INSERT
ON billing.usage_events
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_validate_usage_event_scope();


-- ============================================================================
-- RAW USAGE MUST BE IMMUTABLE
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_prevent_usage_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    RAISE EXCEPTION
        'billing usage events are immutable';

END;
$$;


DROP TRIGGER IF EXISTS
    trg_usage_events_immutable_update
ON billing.usage_events;


CREATE TRIGGER
    trg_usage_events_immutable_update
BEFORE UPDATE
ON billing.usage_events
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_prevent_usage_event_mutation();


DROP TRIGGER IF EXISTS
    trg_usage_events_immutable_delete
ON billing.usage_events;


CREATE TRIGGER
    trg_usage_events_immutable_delete
BEFORE DELETE
ON billing.usage_events
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_prevent_usage_event_mutation();


-- ============================================================================
-- BILLING OUTBOX
--
-- Usage and its asynchronous notification are committed in the same database
-- transaction.
--
-- RabbitMQ publishing comes from this durable table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.event_outbox (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    event_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    event_type TEXT NOT NULL,

    aggregate_type TEXT NOT NULL,

    aggregate_id TEXT NOT NULL,

    payload JSONB NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'PENDING',

    attempt_count INTEGER NOT NULL
        DEFAULT 0,

    max_attempts INTEGER NOT NULL
        DEFAULT 20,

    next_attempt_at TIMESTAMPTZ,

    claimed_by TEXT,

    claim_token TEXT,

    claimed_at TIMESTAMPTZ,

    lease_expires_at TIMESTAMPTZ,

    delivered_at TIMESTAMPTZ,

    failure JSONB,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT billing_outbox_event_unique
        UNIQUE (event_id),

    CONSTRAINT billing_outbox_status_check
        CHECK (
            status IN (
                'PENDING',
                'PROCESSING',
                'DELIVERED',
                'FAILED'
            )
        ),

    CONSTRAINT billing_outbox_attempts_nonnegative
        CHECK (
            attempt_count >= 0
        ),

    CONSTRAINT billing_outbox_max_attempts_positive
        CHECK (
            max_attempts > 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_billing_outbox_pending
ON billing.event_outbox (
    status,
    next_attempt_at,
    created_at
);


CREATE INDEX IF NOT EXISTS
    idx_billing_outbox_org
ON billing.event_outbox (
    organization_id,
    created_at DESC
);


DROP TRIGGER IF EXISTS
    trg_billing_outbox_updated_at
ON billing.event_outbox;


CREATE TRIGGER
    trg_billing_outbox_updated_at
BEFORE UPDATE
ON billing.event_outbox
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


-- ============================================================================
-- DAILY AGGREGATES
--
-- Derived data. Rebuildable from billing.usage_events.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.usage_daily_aggregates (
    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID,

    meter_definition_id UUID NOT NULL
        REFERENCES billing.meter_definitions(id)
        ON DELETE RESTRICT,

    meter_code TEXT NOT NULL,

    meter_version INTEGER NOT NULL,

    usage_date DATE NOT NULL,

    quantity NUMERIC(30, 6) NOT NULL
        DEFAULT 0,

    event_count BIGINT NOT NULL
        DEFAULT 0,

    first_occurred_at TIMESTAMPTZ,

    last_occurred_at TIMESTAMPTZ,

    calculated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    PRIMARY KEY (
        organization_id,
        environment_id,
        meter_code,
        meter_version,
        usage_date
    ),

    CONSTRAINT usage_daily_quantity_nonnegative
        CHECK (
            quantity >= 0
        ),

    CONSTRAINT usage_daily_event_count_nonnegative
        CHECK (
            event_count >= 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_usage_daily_org_date
ON billing.usage_daily_aggregates (
    organization_id,
    usage_date DESC
);


-- ============================================================================
-- BILLING PERIOD AGGREGATES
--
-- This is still DERIVED state.
--
-- It is not an invoice snapshot.
-- Invoice finalization later copies quantities/prices into immutable line
-- items.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.usage_period_aggregates (
    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID,

    meter_definition_id UUID NOT NULL
        REFERENCES billing.meter_definitions(id)
        ON DELETE RESTRICT,

    meter_code TEXT NOT NULL,

    meter_version INTEGER NOT NULL,

    period_start TIMESTAMPTZ NOT NULL,

    period_end TIMESTAMPTZ NOT NULL,

    quantity NUMERIC(30, 6) NOT NULL
        DEFAULT 0,

    event_count BIGINT NOT NULL
        DEFAULT 0,

    calculated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    PRIMARY KEY (
        organization_id,
        environment_id,
        meter_code,
        meter_version,
        period_start,
        period_end
    ),

    CONSTRAINT usage_period_valid_range
        CHECK (
            period_end >
            period_start
        ),

    CONSTRAINT usage_period_quantity_nonnegative
        CHECK (
            quantity >= 0
        ),

    CONSTRAINT usage_period_event_count_nonnegative
        CHECK (
            event_count >= 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_usage_period_org
ON billing.usage_period_aggregates (
    organization_id,
    period_start DESC,
    period_end DESC
);


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE
    billing.usage_events
IS
    'Authoritative immutable AIRA usage ledger. Never invoice from Redis or ClickHouse.';


COMMENT ON TABLE
    billing.event_outbox
IS
    'Transactional billing outbox used to publish durable financial domain events asynchronously.';


COMMENT ON TABLE
    billing.usage_daily_aggregates
IS
    'Rebuildable daily usage projection derived exclusively from billing.usage_events.';


COMMENT ON TABLE
    billing.usage_period_aggregates
IS
    'Rebuildable billing-period usage projection. Final invoices later snapshot these values.';