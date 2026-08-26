-- ============================================================================
-- AIRA PHASE 15.12
-- INTERNAL COST ATTRIBUTION
--
-- PostgreSQL remains authoritative.
--
-- This domain tracks AIRA's own cost of serving a tenant.
--
-- It is NOT:
--
--   customer pricing
--   invoice calculation
--   subscription value
--
-- ClickHouse may later receive an analytical projection of this data,
-- but PostgreSQL remains authoritative.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;


-- ============================================================================
-- COST DEFINITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.cost_definitions (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    cost_code TEXT NOT NULL,

    version INTEGER NOT NULL
        DEFAULT 1,

    name TEXT NOT NULL,

    description TEXT,

    category TEXT NOT NULL,

    unit TEXT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'active',

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT cost_definition_version_unique
        UNIQUE (
            cost_code,
            version
        ),

    CONSTRAINT cost_definition_version_positive
        CHECK (
            version > 0
        ),

    CONSTRAINT cost_definition_category_check
        CHECK (
            category IN (
                'LLM',
                'COMPUTE',
                'STORAGE',
                'NETWORK',
                'VECTOR',
                'NOTIFICATION',
                'PAYMENT_PROCESSING',
                'DATABASE',
                'OTHER'
            )
        ),

    CONSTRAINT cost_definition_status_check
        CHECK (
            status IN (
                'active',
                'retired'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_cost_definitions_lookup
ON billing.cost_definitions (
    cost_code,
    status,
    version DESC
);


-- ============================================================================
-- IMMUTABLE COST EVENT LEDGER
--
-- amount_minor stores the internal cost in the smallest currency unit.
--
-- USD:
--   105 = $1.05
--
-- INR:
--   105 = ₹1.05
--
-- No FLOAT / REAL / DOUBLE values are used for money.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.cost_events (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    event_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    environment_id UUID
        REFERENCES tenancy.environments(id)
        ON DELETE RESTRICT,

    cost_definition_id UUID NOT NULL
        REFERENCES billing.cost_definitions(id)
        ON DELETE RESTRICT,

    cost_code TEXT NOT NULL,

    cost_version INTEGER NOT NULL,

    category TEXT NOT NULL,

    currency TEXT NOT NULL,

    amount_minor BIGINT NOT NULL,

    quantity NUMERIC(30, 6),

    unit TEXT,

    idempotency_key TEXT NOT NULL,

    source_type TEXT NOT NULL,

    source_id TEXT,

    correlation_id TEXT,

    incident_id TEXT,

    agent_run_id TEXT,

    execution_request_id TEXT,

    integration_id TEXT,

    provider TEXT,

    model TEXT,

    occurred_at TIMESTAMPTZ NOT NULL,

    recorded_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    schema_version INTEGER NOT NULL
        DEFAULT 1,

    CONSTRAINT cost_event_id_unique
        UNIQUE (
            event_id
        ),

    CONSTRAINT cost_event_idempotency_unique
        UNIQUE (
            organization_id,
            cost_code,
            idempotency_key
        ),

    CONSTRAINT cost_event_currency_check
        CHECK (
            currency IN (
                'USD',
                'INR'
            )
        ),

    CONSTRAINT cost_event_amount_nonnegative
        CHECK (
            amount_minor >= 0
        ),

    CONSTRAINT cost_event_version_positive
        CHECK (
            cost_version > 0
        ),

    CONSTRAINT cost_event_idempotency_nonempty
        CHECK (
            length(
                trim(
                    idempotency_key
                )
            ) > 0
        ),

    CONSTRAINT cost_event_source_nonempty
        CHECK (
            length(
                trim(
                    source_type
                )
            ) > 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_cost_events_org_time
ON billing.cost_events (
    organization_id,
    occurred_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_cost_events_org_category_time
ON billing.cost_events (
    organization_id,
    category,
    occurred_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_cost_events_agent
ON billing.cost_events (
    organization_id,
    agent_run_id,
    occurred_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_cost_events_incident
ON billing.cost_events (
    organization_id,
    incident_id,
    occurred_at DESC
);


-- ============================================================================
-- TENANT / ENVIRONMENT INTEGRITY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_validate_cost_event_scope()
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
            'cost event environment does not exist';
    END IF;


    IF environment_organization_id <>
        NEW.organization_id
    THEN
        RAISE EXCEPTION
            'cost event organization/environment mismatch';
    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_cost_event_scope
ON billing.cost_events;


CREATE TRIGGER
    trg_cost_event_scope
BEFORE INSERT
ON billing.cost_events
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_validate_cost_event_scope();


-- ============================================================================
-- COST EVENTS ARE IMMUTABLE
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_prevent_cost_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    RAISE EXCEPTION
        'billing cost events are immutable';

END;
$$;


DROP TRIGGER IF EXISTS
    trg_cost_events_immutable_update
ON billing.cost_events;


CREATE TRIGGER
    trg_cost_events_immutable_update
BEFORE UPDATE
ON billing.cost_events
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_prevent_cost_event_mutation();


DROP TRIGGER IF EXISTS
    trg_cost_events_immutable_delete
ON billing.cost_events;


CREATE TRIGGER
    trg_cost_events_immutable_delete
BEFORE DELETE
ON billing.cost_events
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_prevent_cost_event_mutation();


-- ============================================================================
-- DAILY COST AGGREGATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.cost_daily_aggregates (
    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    category TEXT NOT NULL,

    currency TEXT NOT NULL,

    cost_date DATE NOT NULL,

    amount_minor BIGINT NOT NULL
        DEFAULT 0,

    event_count BIGINT NOT NULL
        DEFAULT 0,

    calculated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    PRIMARY KEY (
        organization_id,
        category,
        currency,
        cost_date
    ),

    CONSTRAINT cost_daily_amount_nonnegative
        CHECK (
            amount_minor >= 0
        ),

    CONSTRAINT cost_daily_count_nonnegative
        CHECK (
            event_count >= 0
        )
);


-- ============================================================================
-- BILLING PERIOD COST AGGREGATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.cost_period_aggregates (
    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    category TEXT NOT NULL,

    currency TEXT NOT NULL,

    period_start TIMESTAMPTZ NOT NULL,

    period_end TIMESTAMPTZ NOT NULL,

    amount_minor BIGINT NOT NULL
        DEFAULT 0,

    event_count BIGINT NOT NULL
        DEFAULT 0,

    calculated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    PRIMARY KEY (
        organization_id,
        category,
        currency,
        period_start,
        period_end
    ),

    CONSTRAINT cost_period_valid_range
        CHECK (
            period_end >
            period_start
        ),

    CONSTRAINT cost_period_amount_nonnegative
        CHECK (
            amount_minor >= 0
        ),

    CONSTRAINT cost_period_count_nonnegative
        CHECK (
            event_count >= 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_cost_period_org
ON billing.cost_period_aggregates (
    organization_id,
    period_start DESC
);


-- ============================================================================
-- COST CATALOGUE
-- ============================================================================

INSERT INTO billing.cost_definitions (
    cost_code,
    version,
    name,
    description,
    category,
    unit
)
VALUES

(
    'llm_inference',
    1,
    'LLM Inference',
    'Cost of inference requests against external or internally hosted language models.',
    'LLM',
    'request'
),

(
    'compute_runtime',
    1,
    'Compute Runtime',
    'Allocated worker, container or execution compute consumed by tenant workloads.',
    'COMPUTE',
    'second'
),

(
    'database_usage',
    1,
    'Database Usage',
    'Allocated database infrastructure cost attributable to tenant activity.',
    'DATABASE',
    'allocation'
),

(
    'object_storage',
    1,
    'Object Storage',
    'Object storage cost attributable to evidence, exports and large artifacts.',
    'STORAGE',
    'byte'
),

(
    'network_transfer',
    1,
    'Network Transfer',
    'Network and egress cost attributable to tenant operations.',
    'NETWORK',
    'byte'
),

(
    'vector_embedding',
    1,
    'Vector Embedding',
    'Cost of generating vector embeddings.',
    'VECTOR',
    'embedding'
),

(
    'vector_storage',
    1,
    'Vector Storage',
    'Allocated semantic/vector storage cost.',
    'VECTOR',
    'byte'
),

(
    'notification_delivery',
    1,
    'Notification Delivery',
    'External notification delivery cost.',
    'NOTIFICATION',
    'notification'
),

(
    'payment_processing',
    1,
    'Payment Processing',
    'Stripe or Razorpay processing fees attributable to a tenant.',
    'PAYMENT_PROCESSING',
    'payment'
)

ON CONFLICT (
    cost_code,
    version
)
DO NOTHING;


COMMENT ON TABLE
    billing.cost_events
IS
    'Immutable internal AIRA cost ledger used for tenant economics. This is not customer billing usage.';


COMMENT ON TABLE
    billing.cost_period_aggregates
IS
    'Rebuildable tenant internal cost totals used for unit economics and gross margin calculations.';