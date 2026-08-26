-- ============================================================================
-- AIRA PHASE 15.1 + 15.2
-- COMMERCIAL CATALOGUE + VERSIONED USD/INR PRICE BOOK
-- ============================================================================
--
-- PostgreSQL remains the authoritative financial source of truth.
--
-- Stripe and Razorpay are payment execution providers only.
--
-- Redis:
--   cache / quotas / locks
--
-- RabbitMQ:
--   asynchronous billing transport
--
-- ClickHouse:
--   analytical copy / high-volume economics
--
-- Neo4j:
--   infrastructure dependency graph
--
-- Qdrant:
--   semantic memory
--
-- Object storage:
--   large artifacts
--
-- None of those systems are authoritative for:
--
--   plans
--   prices
--   subscriptions
--   entitlements
--   invoices
--   payments
--
-- Existing tenancy.subscriptions is intentionally NOT replaced here.
-- Phase 15.3 will link subscriptions to immutable plan versions.
-- ============================================================================


CREATE SCHEMA IF NOT EXISTS billing;


-- ============================================================================
-- COMMERCIAL PLANS
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.plans (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    code TEXT NOT NULL,

    name TEXT NOT NULL,

    description TEXT,

    status TEXT NOT NULL
        DEFAULT 'active',

    is_public BOOLEAN NOT NULL
        DEFAULT TRUE,

    sort_order INTEGER NOT NULL
        DEFAULT 0,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT billing_plan_code_unique
        UNIQUE (code),

    CONSTRAINT billing_plan_code_check
        CHECK (
            code IN (
                'developer',
                'starter',
                'growth',
                'scale',
                'enterprise'
            )
        ),

    CONSTRAINT billing_plan_status_check
        CHECK (
            status IN (
                'active',
                'retired'
            )
        ),

    CONSTRAINT billing_plan_name_nonempty
        CHECK (
            length(
                trim(name)
            ) > 0
        )
);


-- ============================================================================
-- IMMUTABLE PLAN VERSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.plan_versions (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    plan_id UUID NOT NULL
        REFERENCES billing.plans(id)
        ON DELETE RESTRICT,

    version_code TEXT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'draft',

    effective_at TIMESTAMPTZ NOT NULL,

    retired_at TIMESTAMPTZ,

    feature_summary JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT billing_plan_version_code_unique
        UNIQUE (version_code),

    CONSTRAINT billing_plan_version_status_check
        CHECK (
            status IN (
                'draft',
                'active',
                'retired'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_billing_plan_versions_plan
ON billing.plan_versions (
    plan_id,
    status,
    effective_at DESC
);


-- ============================================================================
-- VERSIONED PRICE BOOK
--
-- Money is always stored in MINOR currency units.
--
-- Examples:
--
-- $79.00      -> 7900
-- ₹7,499.00   -> 749900
--
-- Never use floating-point values for financial amounts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.prices (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    plan_version_id UUID NOT NULL
        REFERENCES billing.plan_versions(id)
        ON DELETE RESTRICT,

    price_code TEXT NOT NULL,

    currency TEXT NOT NULL,

    billing_interval TEXT NOT NULL,

    amount_minor BIGINT NOT NULL,

    market_code TEXT NOT NULL
        DEFAULT 'GLOBAL',

    status TEXT NOT NULL
        DEFAULT 'active',

    effective_at TIMESTAMPTZ NOT NULL,

    retired_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT billing_price_code_unique
        UNIQUE (price_code),

    CONSTRAINT billing_price_currency_check
        CHECK (
            currency IN (
                'USD',
                'INR'
            )
        ),

    CONSTRAINT billing_price_interval_check
        CHECK (
            billing_interval IN (
                'monthly',
                'annual'
            )
        ),

    CONSTRAINT billing_price_amount_nonnegative
        CHECK (
            amount_minor >= 0
        ),

    CONSTRAINT billing_price_status_check
        CHECK (
            status IN (
                'active',
                'retired'
            )
        )
);


CREATE UNIQUE INDEX IF NOT EXISTS
    idx_billing_price_version_currency_interval_market
ON billing.prices (
    plan_version_id,
    currency,
    billing_interval,
    market_code
);


CREATE INDEX IF NOT EXISTS
    idx_billing_prices_lookup
ON billing.prices (
    currency,
    billing_interval,
    status
);


-- ============================================================================
-- ENTITLEMENT DEFINITIONS
--
-- Phase 15.4 will make the database-backed entitlement engine authoritative.
--
-- For 15.1 we establish the catalogue and seed the Phase 14 entitlement keys.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.entitlement_definitions (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    entitlement_key TEXT NOT NULL,

    name TEXT NOT NULL,

    description TEXT,

    expected_value_type TEXT NOT NULL,

    category TEXT NOT NULL
        DEFAULT 'platform',

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT billing_entitlement_definition_key_unique
        UNIQUE (
            entitlement_key
        ),

    CONSTRAINT billing_entitlement_expected_type_check
        CHECK (
            expected_value_type IN (
                'BOOLEAN',
                'INTEGER',
                'STRING',
                'JSON'
            )
        )
);


-- ============================================================================
-- PLAN ENTITLEMENTS
--
-- UNLIMITED is explicit rather than overloading an arbitrary huge integer.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.plan_entitlements (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    plan_version_id UUID NOT NULL
        REFERENCES billing.plan_versions(id)
        ON DELETE CASCADE,

    entitlement_definition_id UUID NOT NULL
        REFERENCES billing.entitlement_definitions(id)
        ON DELETE RESTRICT,

    value_type TEXT NOT NULL,

    boolean_value BOOLEAN,

    integer_value BIGINT,

    text_value TEXT,

    json_value JSONB,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT billing_plan_entitlement_unique
        UNIQUE (
            plan_version_id,
            entitlement_definition_id
        ),

    CONSTRAINT billing_plan_entitlement_value_type_check
        CHECK (
            value_type IN (
                'BOOLEAN',
                'INTEGER',
                'STRING',
                'JSON',
                'UNLIMITED'
            )
        ),

    CONSTRAINT billing_plan_entitlement_value_shape_check
        CHECK (
            (
                value_type = 'BOOLEAN'
                AND boolean_value IS NOT NULL
                AND integer_value IS NULL
                AND text_value IS NULL
                AND json_value IS NULL
            )
            OR
            (
                value_type = 'INTEGER'
                AND boolean_value IS NULL
                AND integer_value IS NOT NULL
                AND integer_value >= 0
                AND text_value IS NULL
                AND json_value IS NULL
            )
            OR
            (
                value_type = 'STRING'
                AND boolean_value IS NULL
                AND integer_value IS NULL
                AND text_value IS NOT NULL
                AND json_value IS NULL
            )
            OR
            (
                value_type = 'JSON'
                AND boolean_value IS NULL
                AND integer_value IS NULL
                AND text_value IS NULL
                AND json_value IS NOT NULL
            )
            OR
            (
                value_type = 'UNLIMITED'
                AND boolean_value IS NULL
                AND integer_value IS NULL
                AND text_value IS NULL
                AND json_value IS NULL
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_billing_plan_entitlements_version
ON billing.plan_entitlements (
    plan_version_id
);


-- ============================================================================
-- UPDATED_AT
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_billing_plans_updated_at
ON billing.plans;


CREATE TRIGGER
    trg_billing_plans_updated_at
BEFORE UPDATE
ON billing.plans
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_billing_entitlement_definitions_updated_at
ON billing.entitlement_definitions;


CREATE TRIGGER
    trg_billing_entitlement_definitions_updated_at
BEFORE UPDATE
ON billing.entitlement_definitions
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


-- ============================================================================
-- SEED CANONICAL PLANS
-- ============================================================================

INSERT INTO billing.plans (
    code,
    name,
    description,
    status,
    is_public,
    sort_order
)
VALUES
    (
        'developer',
        'Developer',
        'Free AIRA plan for individual development and evaluation.',
        'active',
        TRUE,
        10
    ),
    (
        'starter',
        'Starter',
        'Entry production plan for small infrastructure teams.',
        'active',
        TRUE,
        20
    ),
    (
        'growth',
        'Growth',
        'Production automation plan for growing engineering organizations.',
        'active',
        TRUE,
        30
    ),
    (
        'scale',
        'Scale',
        'High-capacity plan for larger engineering organizations.',
        'active',
        TRUE,
        40
    ),
    (
        'enterprise',
        'Enterprise',
        'Contract-based AIRA deployment with negotiated capacity and controls.',
        'active',
        FALSE,
        50
    )
ON CONFLICT (code)
DO NOTHING;


-- ============================================================================
-- SEED AUGUST 2026 PLAN VERSIONS
-- ============================================================================

INSERT INTO billing.plan_versions (
    plan_id,
    version_code,
    status,
    effective_at,
    feature_summary
)
SELECT
    p.id,
    p.code || '_2026_08',
    'active',
    TIMESTAMPTZ '2026-08-26 00:00:00+00',
    '{}'::jsonb
FROM billing.plans p
WHERE p.code IN (
    'developer',
    'starter',
    'growth',
    'scale',
    'enterprise'
)
ON CONFLICT (version_code)
DO NOTHING;


-- ============================================================================
-- SEED VERSIONED USD PRICE BOOK
-- ============================================================================

INSERT INTO billing.prices (
    plan_version_id,
    price_code,
    currency,
    billing_interval,
    amount_minor,
    market_code,
    status,
    effective_at
)
SELECT
    pv.id,
    valueset.price_code,
    'USD',
    valueset.billing_interval,
    valueset.amount_minor,
    'GLOBAL',
    'active',
    TIMESTAMPTZ '2026-08-26 00:00:00+00'
FROM billing.plan_versions pv
JOIN billing.plans p
    ON p.id = pv.plan_id
JOIN (
    VALUES
        ('developer', 'developer_monthly_usd_2026_08', 'monthly', 0::BIGINT),
        ('developer', 'developer_annual_usd_2026_08',  'annual',  0::BIGINT),

        ('starter', 'starter_monthly_usd_2026_08', 'monthly', 7900::BIGINT),
        ('starter', 'starter_annual_usd_2026_08',  'annual', 79000::BIGINT),

        ('growth', 'growth_monthly_usd_2026_08', 'monthly', 24900::BIGINT),
        ('growth', 'growth_annual_usd_2026_08',  'annual', 249000::BIGINT),

        ('scale', 'scale_monthly_usd_2026_08', 'monthly', 79900::BIGINT),
        ('scale', 'scale_annual_usd_2026_08',  'annual', 799000::BIGINT)
) AS valueset(
    plan_code,
    price_code,
    billing_interval,
    amount_minor
)
    ON valueset.plan_code = p.code
WHERE
    pv.version_code =
        p.code || '_2026_08'
ON CONFLICT (price_code)
DO NOTHING;


-- ============================================================================
-- SEED VERSIONED INR PRICE BOOK
-- ============================================================================

INSERT INTO billing.prices (
    plan_version_id,
    price_code,
    currency,
    billing_interval,
    amount_minor,
    market_code,
    status,
    effective_at
)
SELECT
    pv.id,
    valueset.price_code,
    'INR',
    valueset.billing_interval,
    valueset.amount_minor,
    'IN',
    'active',
    TIMESTAMPTZ '2026-08-26 00:00:00+00'
FROM billing.plan_versions pv
JOIN billing.plans p
    ON p.id = pv.plan_id
JOIN (
    VALUES
        ('developer', 'developer_monthly_inr_2026_08', 'monthly', 0::BIGINT),
        ('developer', 'developer_annual_inr_2026_08',  'annual',  0::BIGINT),

        ('starter', 'starter_monthly_inr_2026_08', 'monthly', 749900::BIGINT),
        ('starter', 'starter_annual_inr_2026_08',  'annual', 7499900::BIGINT),

        ('growth', 'growth_monthly_inr_2026_08', 'monthly', 2399900::BIGINT),
        ('growth', 'growth_annual_inr_2026_08',  'annual', 23999900::BIGINT),

        ('scale', 'scale_monthly_inr_2026_08', 'monthly', 7699900::BIGINT),
        ('scale', 'scale_annual_inr_2026_08',  'annual', 76999900::BIGINT)
) AS valueset(
    plan_code,
    price_code,
    billing_interval,
    amount_minor
)
    ON valueset.plan_code = p.code
WHERE
    pv.version_code =
        p.code || '_2026_08'
ON CONFLICT (price_code)
DO NOTHING;


-- ============================================================================
-- SEED CURRENT ENTITLEMENT DEFINITIONS
-- ============================================================================

INSERT INTO billing.entitlement_definitions (
    entitlement_key,
    name,
    description,
    expected_value_type,
    category
)
VALUES
    (
        'organizations.max',
        'Maximum Organizations',
        'Maximum number of organizations permitted by the commercial plan.',
        'INTEGER',
        'tenancy'
    ),

    (
        'environments.max',
        'Maximum Environments',
        'Maximum number of environments permitted by the commercial plan.',
        'INTEGER',
        'tenancy'
    ),

    (
        'members.max',
        'Maximum Members',
        'Maximum number of organization members permitted by the commercial plan.',
        'INTEGER',
        'tenancy'
    ),

    (
        'teams.max',
        'Maximum Teams',
        'Maximum number of organization teams permitted by the commercial plan.',
        'INTEGER',
        'tenancy'
    ),

    (
        'environments.production',
        'Production Environments',
        'Whether the organization may create production environments.',
        'BOOLEAN',
        'tenancy'
    )
ON CONFLICT (entitlement_key)
DO NOTHING;


-- ============================================================================
-- SEED INTEGER ENTITLEMENTS
-- ============================================================================

WITH entitlement_values AS (
    SELECT *
    FROM (
        VALUES
            ('developer', 'organizations.max', 1::BIGINT),
            ('developer', 'environments.max',  1::BIGINT),
            ('developer', 'members.max',       2::BIGINT),
            ('developer', 'teams.max',         1::BIGINT),

            ('starter',   'organizations.max', 1::BIGINT),
            ('starter',   'environments.max',  3::BIGINT),
            ('starter',   'members.max',       5::BIGINT),
            ('starter',   'teams.max',         3::BIGINT),

            ('growth',    'organizations.max', 1::BIGINT),
            ('growth',    'environments.max', 10::BIGINT),
            ('growth',    'members.max',      20::BIGINT),
            ('growth',    'teams.max',        10::BIGINT),

            ('scale',     'organizations.max', 3::BIGINT),
            ('scale',     'environments.max', 30::BIGINT),
            ('scale',     'members.max',      75::BIGINT),
            ('scale',     'teams.max',        30::BIGINT)
    ) AS v(
        plan_code,
        entitlement_key,
        entitlement_value
    )
)
INSERT INTO billing.plan_entitlements (
    plan_version_id,
    entitlement_definition_id,
    value_type,
    integer_value
)
SELECT
    pv.id,
    ed.id,
    'INTEGER',
    ev.entitlement_value
FROM entitlement_values ev
JOIN billing.plans p
    ON p.code = ev.plan_code
JOIN billing.plan_versions pv
    ON pv.plan_id = p.id
    AND pv.version_code =
        p.code || '_2026_08'
JOIN billing.entitlement_definitions ed
    ON ed.entitlement_key =
        ev.entitlement_key
ON CONFLICT (
    plan_version_id,
    entitlement_definition_id
)
DO NOTHING;


-- ============================================================================
-- ENTERPRISE UNLIMITED TENANCY LIMITS
-- ============================================================================

INSERT INTO billing.plan_entitlements (
    plan_version_id,
    entitlement_definition_id,
    value_type
)
SELECT
    pv.id,
    ed.id,
    'UNLIMITED'
FROM billing.plans p
JOIN billing.plan_versions pv
    ON pv.plan_id = p.id
JOIN billing.entitlement_definitions ed
    ON ed.entitlement_key IN (
        'organizations.max',
        'environments.max',
        'members.max',
        'teams.max'
    )
WHERE
    p.code = 'enterprise'
    AND pv.version_code =
        'enterprise_2026_08'
ON CONFLICT (
    plan_version_id,
    entitlement_definition_id
)
DO NOTHING;


-- ============================================================================
-- PRODUCTION ENVIRONMENT ENTITLEMENT
-- ============================================================================

WITH production_values AS (
    SELECT *
    FROM (
        VALUES
            ('developer', FALSE),
            ('starter',   TRUE),
            ('growth',    TRUE),
            ('scale',     TRUE),
            ('enterprise',TRUE)
    ) AS v(
        plan_code,
        enabled
    )
)
INSERT INTO billing.plan_entitlements (
    plan_version_id,
    entitlement_definition_id,
    value_type,
    boolean_value
)
SELECT
    pv.id,
    ed.id,
    'BOOLEAN',
    production_values.enabled
FROM production_values
JOIN billing.plans p
    ON p.code =
        production_values.plan_code
JOIN billing.plan_versions pv
    ON pv.plan_id = p.id
    AND pv.version_code =
        p.code || '_2026_08'
JOIN billing.entitlement_definitions ed
    ON ed.entitlement_key =
        'environments.production'
ON CONFLICT (
    plan_version_id,
    entitlement_definition_id
)
DO NOTHING;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON SCHEMA billing IS
    'AIRA authoritative commercial, metering, invoicing and payment domain.';


COMMENT ON TABLE billing.plans IS
    'Stable commercial plan identities. Plan pricing is never stored directly here.';


COMMENT ON TABLE billing.plan_versions IS
    'Immutable/versioned commercial plan definitions used for grandfathering and historical reproducibility.';


COMMENT ON TABLE billing.prices IS
    'Versioned provider-neutral price book. Monetary amounts are stored as BIGINT minor currency units.';


COMMENT ON TABLE billing.entitlement_definitions IS
    'Canonical commercial capability and limit definitions.';


COMMENT ON TABLE billing.plan_entitlements IS
    'Entitlement values attached to immutable plan versions.';