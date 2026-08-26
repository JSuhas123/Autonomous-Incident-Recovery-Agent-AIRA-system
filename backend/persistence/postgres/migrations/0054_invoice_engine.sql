-- ============================================================================
-- AIRA PHASE 15.14
-- ENTERPRISE INVOICE ENGINE
--
-- Purpose:
--
-- Convert authoritative commercial subscription state and authoritative
-- metered usage into immutable customer-facing invoice documents.
--
-- IMPORTANT:
--
-- This phase DOES NOT collect payment.
--
-- Stripe / Razorpay arrive later.
--
-- PostgreSQL remains the authoritative invoice source of truth.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;


-- ============================================================================
-- INVOICE NUMBER SEQUENCE
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS
    billing.invoice_number_seq
START WITH 1
INCREMENT BY 1
NO CYCLE;


-- ============================================================================
-- USAGE OVERAGE PRICE BOOK
--
-- Provider neutral.
--
-- Stripe and Razorpay MUST NOT become the pricing source of truth.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.usage_rates (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    plan_version_id UUID NOT NULL
        REFERENCES billing.plan_versions(id)
        ON DELETE RESTRICT,

    meter_definition_id UUID NOT NULL
        REFERENCES billing.meter_definitions(id)
        ON DELETE RESTRICT,

    meter_code TEXT NOT NULL,

    included_entitlement_key TEXT,

    currency TEXT NOT NULL,

    amount_minor_per_unit BIGINT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'active',

    effective_at TIMESTAMPTZ NOT NULL,

    retired_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT usage_rate_unique
        UNIQUE (
            plan_version_id,
            meter_definition_id,
            currency
        ),

    CONSTRAINT usage_rate_currency_check
        CHECK (
            currency IN (
                'USD',
                'INR'
            )
        ),

    CONSTRAINT usage_rate_amount_nonnegative
        CHECK (
            amount_minor_per_unit >= 0
        ),

    CONSTRAINT usage_rate_status_check
        CHECK (
            status IN (
                'active',
                'retired'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_usage_rates_lookup
ON billing.usage_rates (
    plan_version_id,
    meter_code,
    currency,
    status
);


-- ============================================================================
-- INVOICES
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.invoices (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    invoice_number TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    subscription_id UUID,

    plan_version_id UUID,

    price_id UUID,

    currency TEXT NOT NULL,

    billing_interval TEXT,

    period_start TIMESTAMPTZ NOT NULL,

    period_end TIMESTAMPTZ NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'DRAFT',

    subtotal_minor BIGINT NOT NULL
        DEFAULT 0,

    discount_minor BIGINT NOT NULL
        DEFAULT 0,

    credit_minor BIGINT NOT NULL
        DEFAULT 0,

    tax_minor BIGINT NOT NULL
        DEFAULT 0,

    total_minor BIGINT NOT NULL
        DEFAULT 0,

    amount_paid_minor BIGINT NOT NULL
        DEFAULT 0,

    amount_due_minor BIGINT NOT NULL
        DEFAULT 0,

    finalized_at TIMESTAMPTZ,

    opened_at TIMESTAMPTZ,

    paid_at TIMESTAMPTZ,

    voided_at TIMESTAMPTZ,

    uncollectible_at TIMESTAMPTZ,

    due_at TIMESTAMPTZ,

    generation_version INTEGER NOT NULL
        DEFAULT 1,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT invoice_number_unique
        UNIQUE (
            invoice_number
        ),

    CONSTRAINT invoice_period_generation_unique
        UNIQUE (
            organization_id,
            currency,
            period_start,
            period_end,
            generation_version
        ),

    CONSTRAINT invoice_currency_check
        CHECK (
            currency IN (
                'USD',
                'INR'
            )
        ),

    CONSTRAINT invoice_status_check
        CHECK (
            status IN (
                'DRAFT',
                'OPEN',
                'PAID',
                'VOID',
                'UNCOLLECTIBLE'
            )
        ),

    CONSTRAINT invoice_period_valid
        CHECK (
            period_end >
            period_start
        ),

    CONSTRAINT invoice_amounts_nonnegative
        CHECK (
            subtotal_minor >= 0
            AND discount_minor >= 0
            AND credit_minor >= 0
            AND tax_minor >= 0
            AND total_minor >= 0
            AND amount_paid_minor >= 0
            AND amount_due_minor >= 0
        ),

    CONSTRAINT invoice_generation_version_positive
        CHECK (
            generation_version > 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_invoices_org_period
ON billing.invoices (
    organization_id,
    period_start DESC
);


CREATE INDEX IF NOT EXISTS
    idx_invoices_status_due
ON billing.invoices (
    status,
    due_at
);


-- ============================================================================
-- INVOICE ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.invoice_items (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL
        REFERENCES billing.invoices(id)
        ON DELETE RESTRICT,

    line_number INTEGER NOT NULL,

    item_type TEXT NOT NULL,

    description TEXT NOT NULL,

    quantity NUMERIC(30, 6) NOT NULL
        DEFAULT 1,

    unit_amount_minor BIGINT NOT NULL
        DEFAULT 0,

    amount_minor BIGINT NOT NULL
        DEFAULT 0,

    meter_code TEXT,

    meter_version INTEGER,

    included_quantity NUMERIC(30, 6),

    actual_quantity NUMERIC(30, 6),

    overage_quantity NUMERIC(30, 6),

    source_type TEXT,

    source_id TEXT,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT invoice_item_line_unique
        UNIQUE (
            invoice_id,
            line_number
        ),

    CONSTRAINT invoice_item_type_check
        CHECK (
            item_type IN (
                'SUBSCRIPTION',
                'USAGE',
                'ADJUSTMENT',
                'CREDIT',
                'DISCOUNT',
                'TAX'
            )
        ),

    CONSTRAINT invoice_item_line_positive
        CHECK (
            line_number > 0
        ),

    CONSTRAINT invoice_item_quantity_nonnegative
        CHECK (
            quantity >= 0
        ),

    CONSTRAINT invoice_item_unit_amount_nonnegative
        CHECK (
            unit_amount_minor >= 0
        ),

    CONSTRAINT invoice_item_amount_nonnegative
        CHECK (
            amount_minor >= 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_invoice_items_invoice
ON billing.invoice_items (
    invoice_id,
    line_number
);


CREATE INDEX IF NOT EXISTS
    idx_invoice_items_meter
ON billing.invoice_items (
    meter_code,
    created_at DESC
);


-- ============================================================================
-- UPDATED_AT
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_invoices_updated_at
ON billing.invoices;


CREATE TRIGGER
    trg_invoices_updated_at
BEFORE UPDATE
ON billing.invoices
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


-- ============================================================================
-- FINALIZED INVOICE FINANCIAL IMMUTABILITY
--
-- Lifecycle state may later move:
--
-- OPEN -> PAID
-- OPEN -> VOID
-- OPEN -> UNCOLLECTIBLE
--
-- but financial content cannot change after finalization.
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_protect_finalized_invoice_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    IF OLD.finalized_at IS NOT NULL THEN

        IF
            NEW.organization_id IS DISTINCT FROM OLD.organization_id
            OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
            OR NEW.plan_version_id IS DISTINCT FROM OLD.plan_version_id
            OR NEW.price_id IS DISTINCT FROM OLD.price_id
            OR NEW.currency IS DISTINCT FROM OLD.currency
            OR NEW.billing_interval IS DISTINCT FROM OLD.billing_interval
            OR NEW.period_start IS DISTINCT FROM OLD.period_start
            OR NEW.period_end IS DISTINCT FROM OLD.period_end
            OR NEW.subtotal_minor IS DISTINCT FROM OLD.subtotal_minor
            OR NEW.discount_minor IS DISTINCT FROM OLD.discount_minor
            OR NEW.credit_minor IS DISTINCT FROM OLD.credit_minor
            OR NEW.tax_minor IS DISTINCT FROM OLD.tax_minor
            OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
            OR NEW.generation_version IS DISTINCT FROM OLD.generation_version
        THEN

            RAISE EXCEPTION
                'finalized invoice financial fields are immutable';

        END IF;

    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_invoice_financial_immutability
ON billing.invoices;


CREATE TRIGGER
    trg_invoice_financial_immutability
BEFORE UPDATE
ON billing.invoices
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_protect_finalized_invoice_financials();


-- ============================================================================
-- FINALIZED INVOICE ITEM IMMUTABILITY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_protect_finalized_invoice_items()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_invoice_id UUID;

    target_finalized_at TIMESTAMPTZ;
BEGIN

    target_invoice_id =
        COALESCE(
            NEW.invoice_id,
            OLD.invoice_id
        );


    SELECT
        finalized_at
    INTO
        target_finalized_at
    FROM billing.invoices
    WHERE id =
        target_invoice_id;


    IF target_finalized_at IS NOT NULL THEN

        RAISE EXCEPTION
            'finalized invoice items are immutable';

    END IF;


    RETURN COALESCE(
        NEW,
        OLD
    );

END;
$$;


DROP TRIGGER IF EXISTS
    trg_invoice_items_immutable_update
ON billing.invoice_items;


CREATE TRIGGER
    trg_invoice_items_immutable_update
BEFORE UPDATE
ON billing.invoice_items
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_protect_finalized_invoice_items();


DROP TRIGGER IF EXISTS
    trg_invoice_items_immutable_delete
ON billing.invoice_items;


CREATE TRIGGER
    trg_invoice_items_immutable_delete
BEFORE DELETE
ON billing.invoice_items
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_protect_finalized_invoice_items();


-- ============================================================================
-- USAGE RATE SEED
--
-- Frozen Phase 15 commercial baseline.
--
-- Starter:
--   Resources:            $0.30 / ₹29
--   Autonomous recovery: $2.00 / ₹190
--
-- Growth:
--   Resources:            $0.20 / ₹19
--   Autonomous recovery: $1.25 / ₹119
--
-- Scale:
--   Resources:            $0.12 / ₹12
--   Autonomous recovery: $0.75 / ₹72
-- ============================================================================

WITH rate_values AS (
    SELECT *
    FROM (
        VALUES

        -- STARTER / USD
        (
            'starter',
            'resources',
            'resources.max',
            'USD',
            30::BIGINT
        ),

        (
            'starter',
            'autonomous_recoveries',
            'autonomous_recovery.monthly.included',
            'USD',
            200::BIGINT
        ),

        -- STARTER / INR
        (
            'starter',
            'resources',
            'resources.max',
            'INR',
            2900::BIGINT
        ),

        (
            'starter',
            'autonomous_recoveries',
            'autonomous_recovery.monthly.included',
            'INR',
            19000::BIGINT
        ),

        -- GROWTH / USD
        (
            'growth',
            'resources',
            'resources.max',
            'USD',
            20::BIGINT
        ),

        (
            'growth',
            'autonomous_recoveries',
            'autonomous_recovery.monthly.included',
            'USD',
            125::BIGINT
        ),

        -- GROWTH / INR
        (
            'growth',
            'resources',
            'resources.max',
            'INR',
            1900::BIGINT
        ),

        (
            'growth',
            'autonomous_recoveries',
            'autonomous_recovery.monthly.included',
            'INR',
            11900::BIGINT
        ),

        -- SCALE / USD
        (
            'scale',
            'resources',
            'resources.max',
            'USD',
            12::BIGINT
        ),

        (
            'scale',
            'autonomous_recoveries',
            'autonomous_recovery.monthly.included',
            'USD',
            75::BIGINT
        ),

        -- SCALE / INR
        (
            'scale',
            'resources',
            'resources.max',
            'INR',
            1200::BIGINT
        ),

        (
            'scale',
            'autonomous_recoveries',
            'autonomous_recovery.monthly.included',
            'INR',
            7200::BIGINT
        )

    ) AS v(
        plan_code,
        meter_code,
        included_entitlement_key,
        currency,
        amount_minor_per_unit
    )
)

INSERT INTO billing.usage_rates (
    plan_version_id,

    meter_definition_id,

    meter_code,

    included_entitlement_key,

    currency,

    amount_minor_per_unit,

    status,

    effective_at
)

SELECT
    pv.id,

    md.id,

    rate_values.meter_code,

    rate_values.included_entitlement_key,

    rate_values.currency,

    rate_values.amount_minor_per_unit,

    'active',

    TIMESTAMPTZ '2026-08-26 00:00:00+00'

FROM rate_values

JOIN billing.plans p
  ON p.code =
      rate_values.plan_code

JOIN billing.plan_versions pv
  ON pv.plan_id =
      p.id
 AND pv.version_code =
      p.code || '_2026_08'

JOIN billing.meter_definitions md
  ON md.meter_code =
      rate_values.meter_code
 AND md.status =
      'active'

ON CONFLICT (
    plan_version_id,
    meter_definition_id,
    currency
)
DO NOTHING;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE
    billing.invoices
IS
    'Authoritative AIRA customer invoice documents. Payment provider state does not define invoice financial content.';


COMMENT ON TABLE
    billing.invoice_items
IS
    'Immutable-after-finalization invoice line items.';


COMMENT ON TABLE
    billing.usage_rates
IS
    'Versioned provider-neutral overage rates attached to AIRA plan versions.';