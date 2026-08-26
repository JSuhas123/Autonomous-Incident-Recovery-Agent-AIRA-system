-- ============================================================================
-- AIRA PHASE 15.18
-- SIGNED PAYMENT WEBHOOK INGESTION
--
-- Provider webhook events are:
--
-- 1. signature verified
-- 2. durably persisted
-- 3. deduplicated
-- 4. processed against canonical AIRA payment state
--
-- PostgreSQL is authoritative for webhook processing state.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;


-- ============================================================================
-- WEBHOOK EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.payment_webhook_events (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    provider TEXT NOT NULL,

    provider_event_id TEXT NOT NULL,

    event_type TEXT NOT NULL,

    provider_created_at TIMESTAMPTZ,

    signature_verified BOOLEAN NOT NULL
        DEFAULT FALSE,

    status TEXT NOT NULL
        DEFAULT 'RECEIVED',

    organization_id UUID
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    payment_id UUID
        REFERENCES billing.payments(id)
        ON DELETE RESTRICT,

    payment_attempt_id UUID
        REFERENCES billing.payment_attempts(id)
        ON DELETE RESTRICT,

    provider_session_id TEXT,

    provider_payment_id TEXT,

    payload JSONB NOT NULL,

    attempt_count INTEGER NOT NULL
        DEFAULT 0,

    processing_started_at TIMESTAMPTZ,

    processed_at TIMESTAMPTZ,

    failed_at TIMESTAMPTZ,

    failure_code TEXT,

    failure_message TEXT,

    received_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    CONSTRAINT payment_webhook_provider_event_unique
        UNIQUE (
            provider,
            provider_event_id
        ),

    CONSTRAINT payment_webhook_provider_check
        CHECK (
            provider IN (
                'stripe',
                'razorpay'
            )
        ),

    CONSTRAINT payment_webhook_status_check
        CHECK (
            status IN (
                'RECEIVED',
                'PROCESSING',
                'PROCESSED',
                'IGNORED',
                'FAILED'
            )
        ),

    CONSTRAINT payment_webhook_event_type_nonempty
        CHECK (
            length(
                trim(
                    event_type
                )
            ) > 0
        ),

    CONSTRAINT payment_webhook_provider_event_nonempty
        CHECK (
            length(
                trim(
                    provider_event_id
                )
            ) > 0
        ),

    CONSTRAINT payment_webhook_attempt_count_nonnegative
        CHECK (
            attempt_count >= 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_payment_webhook_pending
ON billing.payment_webhook_events (
    status,
    received_at
);


CREATE INDEX IF NOT EXISTS
    idx_payment_webhook_provider_session
ON billing.payment_webhook_events (
    provider,
    provider_session_id
);


CREATE INDEX IF NOT EXISTS
    idx_payment_webhook_payment
ON billing.payment_webhook_events (
    payment_id,
    received_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_payment_webhook_failed
ON billing.payment_webhook_events (
    status,
    failed_at
)
WHERE status =
    'FAILED';


-- ============================================================================
-- WEBHOOK EVENT AUDIT IMMUTABILITY
--
-- Payload and provider identity cannot be rewritten after insertion.
-- Processing state may change.
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_protect_webhook_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    IF
        NEW.provider IS DISTINCT FROM OLD.provider
        OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
        OR NEW.event_type IS DISTINCT FROM OLD.event_type
        OR NEW.payload IS DISTINCT FROM OLD.payload
        OR NEW.signature_verified IS DISTINCT FROM OLD.signature_verified
    THEN

        RAISE EXCEPTION
            'payment webhook identity and payload are immutable';

    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_payment_webhook_identity
ON billing.payment_webhook_events;


CREATE TRIGGER
    trg_payment_webhook_identity
BEFORE UPDATE
ON billing.payment_webhook_events
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_protect_webhook_identity();


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE
    billing.payment_webhook_events
IS
    'Durable idempotent ledger of signature-verified Stripe and Razorpay webhook events.';


COMMENT ON COLUMN
    billing.payment_webhook_events.provider_event_id
IS
    'Razorpay x-razorpay-event-id or Stripe event.id used for provider-level idempotency.';