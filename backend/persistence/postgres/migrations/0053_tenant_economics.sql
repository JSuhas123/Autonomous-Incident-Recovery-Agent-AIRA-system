-- ============================================================================
-- AIRA PHASE 15.13
-- TENANT ECONOMICS / GROSS MARGIN
--
-- Purpose:
--
-- Combine commercial revenue information with internal attributable cost
-- information to produce tenant-level SaaS economics.
--
-- IMPORTANT:
--
-- This is an operational economics projection.
--
-- It is NOT:
--
--   an invoice
--   payment settlement
--   accounting revenue recognition
--   a payment-provider ledger
--
-- Those layers are introduced later.
--
-- PostgreSQL remains authoritative.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;


-- ============================================================================
-- TENANT ECONOMICS SNAPSHOT
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    billing.tenant_economics_snapshots (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        snapshot_id TEXT NOT NULL,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE RESTRICT,

        subscription_id UUID,

        plan_code TEXT,

        plan_version_id UUID,

        price_id UUID,

        currency TEXT NOT NULL,

        period_start TIMESTAMPTZ NOT NULL,

        period_end TIMESTAMPTZ NOT NULL,

        -- --------------------------------------------------------------------
        -- REVENUE
        -- --------------------------------------------------------------------

        subscription_revenue_minor BIGINT NOT NULL
            DEFAULT 0,

        usage_revenue_minor BIGINT NOT NULL
            DEFAULT 0,

        adjustment_revenue_minor BIGINT NOT NULL
            DEFAULT 0,

        total_revenue_minor BIGINT NOT NULL
            DEFAULT 0,

        -- --------------------------------------------------------------------
        -- INTERNAL COST / COGS
        -- --------------------------------------------------------------------

        llm_cost_minor BIGINT NOT NULL
            DEFAULT 0,

        compute_cost_minor BIGINT NOT NULL
            DEFAULT 0,

        storage_cost_minor BIGINT NOT NULL
            DEFAULT 0,

        network_cost_minor BIGINT NOT NULL
            DEFAULT 0,

        vector_cost_minor BIGINT NOT NULL
            DEFAULT 0,

        notification_cost_minor BIGINT NOT NULL
            DEFAULT 0,

        database_cost_minor BIGINT NOT NULL
            DEFAULT 0,

        payment_processing_cost_minor BIGINT NOT NULL
            DEFAULT 0,

        other_cost_minor BIGINT NOT NULL
            DEFAULT 0,

        total_cost_minor BIGINT NOT NULL
            DEFAULT 0,

        -- --------------------------------------------------------------------
        -- MARGIN
        -- --------------------------------------------------------------------

        gross_profit_minor BIGINT NOT NULL
            DEFAULT 0,

        gross_margin_basis_points INTEGER,

        -- --------------------------------------------------------------------
        -- SOURCE / QUALITY
        -- --------------------------------------------------------------------

        revenue_source TEXT NOT NULL
            DEFAULT 'SUBSCRIPTION_ESTIMATE',

        cost_source TEXT NOT NULL
            DEFAULT 'COST_LEDGER',

        calculation_version INTEGER NOT NULL
            DEFAULT 1,

        calculated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        CONSTRAINT tenant_economics_snapshot_unique
            UNIQUE (
                organization_id,
                currency,
                period_start,
                period_end,
                calculation_version
            ),

        CONSTRAINT tenant_economics_snapshot_id_unique
            UNIQUE (
                snapshot_id
            ),

        CONSTRAINT tenant_economics_currency_check
            CHECK (
                currency IN (
                    'USD',
                    'INR'
                )
            ),

        CONSTRAINT tenant_economics_period_check
            CHECK (
                period_end >
                period_start
            ),

        CONSTRAINT tenant_economics_calculation_version_check
            CHECK (
                calculation_version >
                0
            ),

        CONSTRAINT tenant_economics_revenue_source_check
            CHECK (
                revenue_source IN (
                    'SUBSCRIPTION_ESTIMATE',
                    'INVOICE',
                    'MIXED'
                )
            ),

        CONSTRAINT tenant_economics_cost_source_check
            CHECK (
                cost_source IN (
                    'COST_LEDGER'
                )
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_tenant_economics_org_period
ON billing.tenant_economics_snapshots (
    organization_id,
    period_start DESC
);


CREATE INDEX IF NOT EXISTS
    idx_tenant_economics_plan_period
ON billing.tenant_economics_snapshots (
    plan_code,
    period_start DESC
);


CREATE INDEX IF NOT EXISTS
    idx_tenant_economics_margin
ON billing.tenant_economics_snapshots (
    gross_margin_basis_points,
    period_start DESC
);


-- ============================================================================
-- IMMUTABILITY
--
-- Economics snapshots represent a calculation at a point in time.
--
-- Recalculation creates/replaces through the controlled repository workflow.
-- Arbitrary application mutation is forbidden.
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_prevent_tenant_economics_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    RAISE EXCEPTION
        'tenant economics snapshots cannot be mutated directly';

END;
$$;


DROP TRIGGER IF EXISTS
    trg_tenant_economics_immutable_update
ON billing.tenant_economics_snapshots;


CREATE TRIGGER
    trg_tenant_economics_immutable_update
BEFORE UPDATE
ON billing.tenant_economics_snapshots
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_prevent_tenant_economics_mutation();


DROP TRIGGER IF EXISTS
    trg_tenant_economics_immutable_delete
ON billing.tenant_economics_snapshots;


CREATE TRIGGER
    trg_tenant_economics_immutable_delete
BEFORE DELETE
ON billing.tenant_economics_snapshots
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_prevent_tenant_economics_mutation();


COMMENT ON TABLE
    billing.tenant_economics_snapshots
IS
    'Versioned operational SaaS economics snapshots combining tenant commercial revenue estimates with authoritative internal cost attribution.';


COMMENT ON COLUMN
    billing.tenant_economics_snapshots.gross_margin_basis_points
IS
    'Gross margin percentage expressed as basis points. 7500 means 75.00%. NULL when revenue is zero.';


COMMENT ON COLUMN
    billing.tenant_economics_snapshots.revenue_source
IS
    'SUBSCRIPTION_ESTIMATE until invoice authority is introduced in later Phase 15 work.';