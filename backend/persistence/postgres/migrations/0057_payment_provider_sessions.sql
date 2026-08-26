-- ============================================================================
-- AIRA PHASE 15.17
-- PAYMENT PROVIDER SESSION MAPPING
--
-- Maps external Stripe PaymentIntents / Razorpay Orders to canonical
-- AIRA payments and payment attempts.
--
-- NO PROVIDER SECRETS ARE STORED HERE.
--
-- PostgreSQL remains authoritative for mapping and audit.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;


CREATE TABLE IF NOT EXISTS billing.payment_provider_sessions (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    payment_id UUID NOT NULL
        REFERENCES billing.payments(id)
        ON DELETE RESTRICT,

    payment_attempt_id UUID NOT NULL
        REFERENCES billing.payment_attempts(id)
        ON DELETE RESTRICT,

    provider TEXT NOT NULL,

    provider_session_id TEXT NOT NULL,

    session_type TEXT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'CREATED',

    provider_status TEXT,

    amount_minor BIGINT NOT NULL,

    currency TEXT NOT NULL,

    checkout_reference TEXT,

    expires_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT payment_provider_session_unique
        UNIQUE (
            provider,
            provider_session_id
        ),

    CONSTRAINT payment_provider_session_attempt_unique
        UNIQUE (
            payment_attempt_id
        ),

    CONSTRAINT payment_provider_session_provider_check
        CHECK (
            provider IN (
                'stripe',
                'razorpay'
            )
        ),

    CONSTRAINT payment_provider_session_type_check
        CHECK (
            session_type IN (
                'PAYMENT_INTENT',
                'ORDER'
            )
        ),

    CONSTRAINT payment_provider_session_status_check
        CHECK (
            status IN (
                'CREATED',
                'REQUIRES_CUSTOMER_ACTION',
                'PROCESSING',
                'SUCCEEDED',
                'FAILED',
                'CANCELLED'
            )
        ),

    CONSTRAINT payment_provider_session_currency_check
        CHECK (
            currency IN (
                'USD',
                'INR'
            )
        ),

    CONSTRAINT payment_provider_session_amount_positive
        CHECK (
            amount_minor > 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_payment_provider_sessions_payment
ON billing.payment_provider_sessions (
    payment_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_payment_provider_sessions_attempt
ON billing.payment_provider_sessions (
    payment_attempt_id
);


CREATE INDEX IF NOT EXISTS
    idx_payment_provider_sessions_provider
ON billing.payment_provider_sessions (
    provider,
    provider_session_id
);


DROP TRIGGER IF EXISTS
    trg_payment_provider_sessions_updated_at
ON billing.payment_provider_sessions;


CREATE TRIGGER
    trg_payment_provider_sessions_updated_at
BEFORE UPDATE
ON billing.payment_provider_sessions
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


COMMENT ON TABLE
    billing.payment_provider_sessions
IS
    'Provider-neutral mapping of AIRA payment attempts to Stripe PaymentIntents or Razorpay Orders. Provider secrets and checkout client secrets are never persisted.';