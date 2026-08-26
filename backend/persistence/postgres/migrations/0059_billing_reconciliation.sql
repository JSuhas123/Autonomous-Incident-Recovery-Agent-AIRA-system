-- ============================================================================
-- AIRA PHASE 15.19
-- BILLING RECONCILIATION / SUBSCRIPTION STATE SYNCHRONIZATION
--
-- Purpose:
--
-- - detect state drift
-- - recover missed provider updates
-- - repair stale payment state
-- - replay failed webhook events
-- - reconcile subscription state
-- - preserve immutable financial history
--
-- PostgreSQL remains authoritative for AIRA canonical state.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;


-- ============================================================================
-- RECONCILIATION RUNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.reconciliation_runs (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    run_code TEXT NOT NULL,

    run_type TEXT NOT NULL,

    provider TEXT,

    status TEXT NOT NULL
        DEFAULT 'RUNNING',

    scanned_count BIGINT NOT NULL
        DEFAULT 0,

    matched_count BIGINT NOT NULL
        DEFAULT 0,

    repaired_count BIGINT NOT NULL
        DEFAULT 0,

    suspicious_count BIGINT NOT NULL
        DEFAULT 0,

    failed_count BIGINT NOT NULL
        DEFAULT 0,

    started_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    completed_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    CONSTRAINT reconciliation_run_code_unique
        UNIQUE (
            run_code
        ),

    CONSTRAINT reconciliation_run_type_check
        CHECK (
            run_type IN (
                'PAYMENT',
                'WEBHOOK',
                'SUBSCRIPTION',
                'FULL'
            )
        ),

    CONSTRAINT reconciliation_provider_check
        CHECK (
            provider IS NULL
            OR provider IN (
                'stripe',
                'razorpay'
            )
        ),

    CONSTRAINT reconciliation_run_status_check
        CHECK (
            status IN (
                'RUNNING',
                'COMPLETED',
                'PARTIAL',
                'FAILED'
            )
        ),

    CONSTRAINT reconciliation_run_counts_nonnegative
        CHECK (
            scanned_count >= 0
            AND matched_count >= 0
            AND repaired_count >= 0
            AND suspicious_count >= 0
            AND failed_count >= 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_reconciliation_runs_started
ON billing.reconciliation_runs (
    started_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_reconciliation_runs_status
ON billing.reconciliation_runs (
    status,
    started_at DESC
);


-- ============================================================================
-- RECONCILIATION FINDINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.reconciliation_findings (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    run_id UUID NOT NULL
        REFERENCES billing.reconciliation_runs(id)
        ON DELETE RESTRICT,

    finding_code TEXT NOT NULL,

    organization_id UUID
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    provider TEXT,

    entity_type TEXT NOT NULL,

    entity_id TEXT,

    provider_entity_id TEXT,

    severity TEXT NOT NULL,

    classification TEXT NOT NULL,

    detected_state JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    canonical_state JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    provider_state JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    repair_action TEXT,

    repair_status TEXT NOT NULL
        DEFAULT 'NOT_REQUIRED',

    repair_error_code TEXT,

    repair_error_message TEXT,

    detected_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    repaired_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    CONSTRAINT reconciliation_finding_code_unique
        UNIQUE (
            finding_code
        ),

    CONSTRAINT reconciliation_finding_provider_check
        CHECK (
            provider IS NULL
            OR provider IN (
                'stripe',
                'razorpay'
            )
        ),

    CONSTRAINT reconciliation_entity_type_check
        CHECK (
            entity_type IN (
                'PAYMENT',
                'PAYMENT_ATTEMPT',
                'PROVIDER_SESSION',
                'WEBHOOK',
                'INVOICE',
                'SUBSCRIPTION'
            )
        ),

    CONSTRAINT reconciliation_severity_check
        CHECK (
            severity IN (
                'INFO',
                'WARNING',
                'CRITICAL'
            )
        ),

    CONSTRAINT reconciliation_classification_check
        CHECK (
            classification IN (
                'MATCH',
                'REPAIRABLE_DRIFT',
                'SUSPICIOUS_DRIFT',
                'ORPHAN_PROVIDER_OBJECT',
                'STALE_PROCESSING',
                'FAILED_WEBHOOK',
                'SUBSCRIPTION_DRIFT'
            )
        ),

    CONSTRAINT reconciliation_repair_status_check
        CHECK (
            repair_status IN (
                'NOT_REQUIRED',
                'PENDING',
                'REPAIRED',
                'FAILED',
                'MANUAL_REVIEW'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_reconciliation_findings_run
ON billing.reconciliation_findings (
    run_id,
    detected_at
);


CREATE INDEX IF NOT EXISTS
    idx_reconciliation_findings_review
ON billing.reconciliation_findings (
    repair_status,
    severity,
    detected_at
);


CREATE INDEX IF NOT EXISTS
    idx_reconciliation_findings_entity
ON billing.reconciliation_findings (
    entity_type,
    entity_id
);


-- ============================================================================
-- SUBSCRIPTION CHANGE EVENTS
--
-- Canonical audit trail of subscription state transitions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing.subscription_change_events (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    event_code TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    subscription_id UUID NOT NULL,

    provider TEXT,

    provider_subscription_id TEXT,

    change_type TEXT NOT NULL,

    previous_state JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    next_state JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    source_type TEXT NOT NULL,

    source_id TEXT,

    occurred_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    CONSTRAINT subscription_change_event_code_unique
        UNIQUE (
            event_code
        ),

    CONSTRAINT subscription_change_provider_check
        CHECK (
            provider IS NULL
            OR provider IN (
                'stripe',
                'razorpay'
            )
        ),

    CONSTRAINT subscription_change_type_check
        CHECK (
            change_type IN (
                'CREATED',
                'ACTIVATED',
                'PLAN_CHANGED',
                'PRICE_CHANGED',
                'PERIOD_CHANGED',
                'CANCEL_AT_PERIOD_END',
                'CANCELLED',
                'PAST_DUE',
                'PAUSED',
                'RESUMED',
                'RECONCILED'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_subscription_change_events_org
ON billing.subscription_change_events (
    organization_id,
    occurred_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_subscription_change_events_subscription
ON billing.subscription_change_events (
    subscription_id,
    occurred_at DESC
);


-- ============================================================================
-- RECONCILIATION FINDING AUDIT PROTECTION
--
-- Finding identity/detected state cannot be rewritten.
-- Repair status may evolve.
-- ============================================================================

CREATE OR REPLACE FUNCTION
    billing.aira_protect_reconciliation_finding_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    IF
        NEW.run_id IS DISTINCT FROM OLD.run_id
        OR NEW.finding_code IS DISTINCT FROM OLD.finding_code
        OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
        OR NEW.provider IS DISTINCT FROM OLD.provider
        OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
        OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
        OR NEW.provider_entity_id IS DISTINCT FROM OLD.provider_entity_id
        OR NEW.classification IS DISTINCT FROM OLD.classification
        OR NEW.detected_state IS DISTINCT FROM OLD.detected_state
        OR NEW.canonical_state IS DISTINCT FROM OLD.canonical_state
        OR NEW.provider_state IS DISTINCT FROM OLD.provider_state
    THEN

        RAISE EXCEPTION
            'reconciliation finding identity is immutable';

    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_reconciliation_finding_identity
ON billing.reconciliation_findings;


CREATE TRIGGER
    trg_reconciliation_finding_identity
BEFORE UPDATE
ON billing.reconciliation_findings
FOR EACH ROW
EXECUTE FUNCTION
    billing.aira_protect_reconciliation_finding_identity();


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE
    billing.reconciliation_runs
IS
    'Operational reconciliation runs comparing AIRA canonical billing state with provider state.';


COMMENT ON TABLE
    billing.reconciliation_findings
IS
    'Auditable drift findings and controlled repair results. Immutable financial ledgers are never rewritten by reconciliation.';


COMMENT ON TABLE
    billing.subscription_change_events
IS
    'Immutable audit trail of canonical AIRA subscription state transitions and reconciliation changes.';