-- ============================================================================
-- AIRA PHASE 15.16
-- PROVIDER-NEUTRAL PAYMENT STATE MACHINE
--
-- PostgreSQL is authoritative.
--
-- Stripe and Razorpay are external payment execution providers only.
--
-- Their provider-native state MUST be translated into AIRA's canonical
-- payment lifecycle.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;


-- ============================================================================
-- PAYMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.payments (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    payment_code TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    invoice_id UUID NOT NULL
        REFERENCES billing.invoices(id)
        ON DELETE RESTRICT,

    currency TEXT NOT NULL,

    amount_minor BIGINT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'REQUIRES_PAYMENT',

    provider TEXT,

    provider_customer_id TEXT,

    provider_payment_id TEXT,

    provider_payment_intent_id TEXT,

    payment_method_type TEXT,

    failure_code TEXT,

    failure_message TEXT,

    requested_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    processing_at TIMESTAMPTZ,

    succeeded_at TIMESTAMPTZ,

    failed_at TIMESTAMPTZ,

    cancelled_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT payment_code_unique
        UNIQUE (
            payment_code
        ),

    CONSTRAINT payment_currency_check
        CHECK (
            currency IN (
                'USD',
                'INR'
            )
        ),

    CONSTRAINT payment_amount_positive
        CHECK (
            amount_minor > 0
        ),

    CONSTRAINT payment_status_check
        CHECK (
            status IN (
                'REQUIRES_PAYMENT',
                'PROCESSING',
                'SUCCEEDED',
                'FAILED',
                'CANCELLED'
            )
        ),

    CONSTRAINT payment_provider_check
        CHECK (
            provider IS NULL
            OR provider IN (
                'stripe',
                'razorpay'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_payments_invoice
ON billing.payments (
    invoice_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_payments_org_status
ON billing.payments (
    organization_id,
    status,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_payments_provider_reference
ON billing.payments (
    provider,
    provider_payment_id
);


-- ============================================================================
-- PAYMENT ATTEMPTS
--
-- One payment may have multiple provider attempts.
--
-- Example:
--
-- payment
--   attempt 1 → card failed
--   attempt 2 → retry
--   attempt 3 → succeeded
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.payment_attempts (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    attempt_code TEXT NOT NULL,

    payment_id UUID NOT NULL
        REFERENCES billing.payments(id)
        ON DELETE RESTRICT,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    provider TEXT NOT NULL,

    provider_attempt_id TEXT,

    status TEXT NOT NULL
        DEFAULT 'CREATED',

    amount_minor BIGINT NOT NULL,

    currency TEXT NOT NULL,

    failure_code TEXT,

    failure_message TEXT,

    request_payload JSONB,

    response_payload JSONB,

    started_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    completed_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT payment_attempt_code_unique
        UNIQUE (
            attempt_code
        ),

    CONSTRAINT payment_attempt_provider_reference_unique
        UNIQUE (
            provider,
            provider_attempt_id
        ),

    CONSTRAINT payment_attempt_provider_check
        CHECK (
            provider IN (
                'stripe',
                'razorpay'
            )
        ),

    CONSTRAINT payment_attempt_status_check
        CHECK (
            status IN (
                'CREATED',
                'PROCESSING',
                'SUCCEEDED',
                'FAILED',
                'CANCELLED'
            )
        ),

    CONSTRAINT payment_attempt_amount_positive
        CHECK (
            amount_minor > 0
        ),

    CONSTRAINT payment_attempt_currency_check
        CHECK (
            currency IN (
                'USD',
                'INR'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_payment_attempts_payment
ON billing.payment_attempts (
    payment_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_payment_attempts_provider
ON billing.payment_attempts (
    provider,
    status,
    created_at DESC
);


-- ============================================================================
-- REFUNDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.refunds (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    refund_code TEXT NOT NULL,

    payment_id UUID NOT NULL
        REFERENCES billing.payments(id)
        ON DELETE RESTRICT,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    currency TEXT NOT NULL,

    amount_minor BIGINT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'REQUESTED',

    reason TEXT,

    provider TEXT,

    provider_refund_id TEXT,

    requested_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    processing_at TIMESTAMPTZ,

    succeeded_at TIMESTAMPTZ,

    failed_at TIMESTAMPTZ,

    failure_code TEXT,

    failure_message TEXT,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT refund_code_unique
        UNIQUE (
            refund_code
        ),

    CONSTRAINT refund_provider_reference_unique
        UNIQUE (
            provider,
            provider_refund_id
        ),

    CONSTRAINT refund_currency_check
        CHECK (
            currency IN (
                'USD',
                'INR'
            )
        ),

    CONSTRAINT refund_amount_positive
        CHECK (
            amount_minor > 0
        ),

    CONSTRAINT refund_status_check
        CHECK (
            status IN (
                'REQUESTED',
                'PROCESSING',
                'SUCCEEDED',
                'FAILED',
                'CANCELLED'
            )
        ),

    CONSTRAINT refund_provider_check
        CHECK (
            provider IS NULL
            OR provider IN (
                'stripe',
                'razorpay'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_refunds_payment
ON billing.refunds (
    payment_id,
    created_at DESC
);


-- ============================================================================
-- UPDATED_AT
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_payments_updated_at
ON billing.payments;


CREATE TRIGGER
    trg_payments_updated_at
BEFORE UPDATE
ON billing.payments
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_refunds_updated_at
ON billing.refunds;


CREATE TRIGGER
    trg_refunds_updated_at
BEFORE UPDATE
ON billing.refunds
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


-- ============================================================================
-- PAYMENT STATE TRANSITION VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_validate_payment_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    IF NEW.status =
        OLD.status
    THEN
        RETURN NEW;
    END IF;


    IF OLD.status =
        'REQUIRES_PAYMENT'
    THEN

        IF NEW.status NOT IN (
            'PROCESSING',
            'CANCELLED'
        )
        THEN
            RAISE EXCEPTION
                'invalid payment transition from REQUIRES_PAYMENT to %',
                NEW.status;
        END IF;


    ELSIF OLD.status =
        'PROCESSING'
    THEN

        IF NEW.status NOT IN (
            'SUCCEEDED',
            'FAILED',
            'CANCELLED'
        )
        THEN
            RAISE EXCEPTION
                'invalid payment transition from PROCESSING to %',
                NEW.status;
        END IF;


    ELSIF OLD.status =
        'FAILED'
    THEN

        IF NEW.status NOT IN (
            'PROCESSING',
            'CANCELLED'
        )
        THEN
            RAISE EXCEPTION
                'invalid payment transition from FAILED to %',
                NEW.status;
        END IF;


    ELSIF OLD.status IN (
        'SUCCEEDED',
        'CANCELLED'
    )
    THEN

        RAISE EXCEPTION
            'terminal payment state % cannot transition',
            OLD.status;

    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_payment_state_transition
ON billing.payments;


CREATE TRIGGER
    trg_payment_state_transition
BEFORE UPDATE OF status
ON billing.payments
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_validate_payment_transition();


-- ============================================================================
-- SUCCEEDED PAYMENT FINANCIAL IMMUTABILITY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_protect_succeeded_payment_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    IF OLD.status =
        'SUCCEEDED'
    THEN

        IF
            NEW.organization_id IS DISTINCT FROM OLD.organization_id
            OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
            OR NEW.currency IS DISTINCT FROM OLD.currency
            OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
            OR NEW.provider IS DISTINCT FROM OLD.provider
            OR NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id
        THEN

            RAISE EXCEPTION
                'succeeded payment financial fields are immutable';

        END IF;

    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_payment_financial_immutability
ON billing.payments;


CREATE TRIGGER
    trg_payment_financial_immutability
BEFORE UPDATE
ON billing.payments
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_protect_succeeded_payment_financials();


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE
    billing.payments
IS
    'AIRA canonical provider-neutral payment state. Stripe and Razorpay are execution providers only.';


COMMENT ON TABLE
    billing.payment_attempts
IS
    'Provider-specific attempts belonging to one canonical AIRA payment.';


COMMENT ON TABLE
    billing.refunds
IS
    'Refund lifecycle linked to successful AIRA payments.';