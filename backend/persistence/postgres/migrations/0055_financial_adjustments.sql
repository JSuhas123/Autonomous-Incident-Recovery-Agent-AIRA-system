-- ============================================================================
-- AIRA PHASE 15.15
-- CREDITS, DISCOUNTS & FINANCIAL ADJUSTMENTS
--
-- PostgreSQL is authoritative.
--
-- Purpose:
--
-- - promotional discounts
-- - contractual discounts
-- - service credits
-- - goodwill credits
-- - SLA credits
-- - explicit manual billing adjustments
--
-- Finalized invoices remain immutable.
--
-- Corrections are represented as NEW financial records instead of editing
-- historical invoice values.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;


-- ============================================================================
-- CREDIT GRANTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.credit_grants (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    credit_code TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    currency TEXT NOT NULL,

    amount_minor BIGINT NOT NULL,

    reason TEXT NOT NULL,

    source_type TEXT NOT NULL,

    source_id TEXT,

    valid_from TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    expires_at TIMESTAMPTZ,

    status TEXT NOT NULL
        DEFAULT 'ACTIVE',

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    created_by TEXT,

    CONSTRAINT credit_grant_code_unique
        UNIQUE (
            credit_code
        ),

    CONSTRAINT credit_grant_currency_check
        CHECK (
            currency IN (
                'USD',
                'INR'
            )
        ),

    CONSTRAINT credit_grant_amount_positive
        CHECK (
            amount_minor > 0
        ),

    CONSTRAINT credit_grant_status_check
        CHECK (
            status IN (
                'ACTIVE',
                'EXPIRED',
                'REVOKED'
            )
        ),

    CONSTRAINT credit_grant_reason_nonempty
        CHECK (
            length(
                trim(
                    reason
                )
            ) > 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_credit_grants_org_active
ON billing.credit_grants (
    organization_id,
    status,
    currency,
    expires_at
);


-- ============================================================================
-- DISCOUNT GRANTS
--
-- Supported:
--
-- FIXED
-- PERCENTAGE
--
-- percentage_basis_points:
--
-- 1000 = 10.00%
-- 2500 = 25.00%
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.discount_grants (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    discount_code TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    discount_type TEXT NOT NULL,

    currency TEXT,

    fixed_amount_minor BIGINT,

    percentage_basis_points INTEGER,

    reason TEXT NOT NULL,

    valid_from TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    expires_at TIMESTAMPTZ,

    max_applications INTEGER,

    status TEXT NOT NULL
        DEFAULT 'ACTIVE',

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    created_by TEXT,

    CONSTRAINT discount_grant_code_unique
        UNIQUE (
            discount_code
        ),

    CONSTRAINT discount_grant_type_check
        CHECK (
            discount_type IN (
                'FIXED',
                'PERCENTAGE'
            )
        ),

    CONSTRAINT discount_grant_currency_check
        CHECK (
            currency IS NULL
            OR currency IN (
                'USD',
                'INR'
            )
        ),

    CONSTRAINT discount_grant_percentage_check
        CHECK (
            percentage_basis_points IS NULL
            OR (
                percentage_basis_points > 0
                AND percentage_basis_points <= 10000
            )
        ),

    CONSTRAINT discount_grant_max_applications_check
        CHECK (
            max_applications IS NULL
            OR max_applications > 0
        ),

    CONSTRAINT discount_grant_shape_check
        CHECK (
            (
                discount_type = 'FIXED'
                AND fixed_amount_minor IS NOT NULL
                AND fixed_amount_minor > 0
                AND percentage_basis_points IS NULL
                AND currency IS NOT NULL
            )
            OR
            (
                discount_type = 'PERCENTAGE'
                AND fixed_amount_minor IS NULL
                AND percentage_basis_points IS NOT NULL
            )
        ),

    CONSTRAINT discount_grant_status_check
        CHECK (
            status IN (
                'ACTIVE',
                'EXPIRED',
                'REVOKED'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_discount_grants_org_active
ON billing.discount_grants (
    organization_id,
    status,
    expires_at
);


-- ============================================================================
-- MANUAL FINANCIAL ADJUSTMENTS
--
-- DEBIT:
-- increases invoice amount
--
-- CREDIT:
-- decreases invoice amount
--
-- These are explicit financial corrections, not mutable invoice edits.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.financial_adjustments (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    adjustment_code TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    adjustment_type TEXT NOT NULL,

    currency TEXT NOT NULL,

    amount_minor BIGINT NOT NULL,

    reason TEXT NOT NULL,

    source_type TEXT NOT NULL,

    source_id TEXT,

    effective_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    status TEXT NOT NULL
        DEFAULT 'PENDING',

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    created_by TEXT,

    CONSTRAINT financial_adjustment_code_unique
        UNIQUE (
            adjustment_code
        ),

    CONSTRAINT financial_adjustment_type_check
        CHECK (
            adjustment_type IN (
                'CREDIT',
                'DEBIT'
            )
        ),

    CONSTRAINT financial_adjustment_currency_check
        CHECK (
            currency IN (
                'USD',
                'INR'
            )
        ),

    CONSTRAINT financial_adjustment_amount_positive
        CHECK (
            amount_minor > 0
        ),

    CONSTRAINT financial_adjustment_status_check
        CHECK (
            status IN (
                'PENDING',
                'APPLIED',
                'VOID'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_financial_adjustments_pending
ON billing.financial_adjustments (
    organization_id,
    currency,
    status,
    effective_at
);


-- ============================================================================
-- INVOICE APPLICATION LEDGER
--
-- Immutable record of exactly how a grant or adjustment affected an invoice.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.invoice_financial_applications (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL
        REFERENCES billing.invoices(id)
        ON DELETE RESTRICT,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    application_type TEXT NOT NULL,

    source_id UUID NOT NULL,

    source_code TEXT NOT NULL,

    currency TEXT NOT NULL,

    amount_minor BIGINT NOT NULL,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT invoice_financial_application_unique
        UNIQUE (
            invoice_id,
            application_type,
            source_id
        ),

    CONSTRAINT invoice_financial_application_type_check
        CHECK (
            application_type IN (
                'CREDIT',
                'DISCOUNT',
                'ADJUSTMENT_CREDIT',
                'ADJUSTMENT_DEBIT'
            )
        ),

    CONSTRAINT invoice_financial_application_currency_check
        CHECK (
            currency IN (
                'USD',
                'INR'
            )
        ),

    CONSTRAINT invoice_financial_application_amount_positive
        CHECK (
            amount_minor > 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_invoice_financial_applications_invoice
ON billing.invoice_financial_applications (
    invoice_id,
    created_at
);


CREATE INDEX IF NOT EXISTS
    idx_invoice_financial_applications_source
ON billing.invoice_financial_applications (
    application_type,
    source_id
);


-- ============================================================================
-- APPLICATION LEDGER IMMUTABILITY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_prevent_financial_application_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    RAISE EXCEPTION
        'invoice financial applications are immutable';

END;
$$;


DROP TRIGGER IF EXISTS
    trg_invoice_financial_applications_update
ON billing.invoice_financial_applications;


CREATE TRIGGER
    trg_invoice_financial_applications_update
BEFORE UPDATE
ON billing.invoice_financial_applications
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_prevent_financial_application_mutation();


DROP TRIGGER IF EXISTS
    trg_invoice_financial_applications_delete
ON billing.invoice_financial_applications;


CREATE TRIGGER
    trg_invoice_financial_applications_delete
BEFORE DELETE
ON billing.invoice_financial_applications
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_prevent_financial_application_mutation();


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE
    billing.credit_grants
IS
    'Tenant service/goodwill/SLA credit grants. Remaining balance is derived from immutable invoice applications.';


COMMENT ON TABLE
    billing.discount_grants
IS
    'Tenant promotional or contractual discounts applicable during invoice generation.';


COMMENT ON TABLE
    billing.financial_adjustments
IS
    'Explicit debit or credit corrections used instead of mutating finalized invoice history.';


COMMENT ON TABLE
    billing.invoice_financial_applications
IS
    'Immutable ledger recording exactly how credits, discounts or adjustments affected an invoice.';