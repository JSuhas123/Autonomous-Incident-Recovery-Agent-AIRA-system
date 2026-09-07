-- ============================================================================
-- AIRA PHASE 25.9
-- MIGRATION 0106 — PRODUCT NOTIFICATION INBOX
-- ============================================================================
--
-- PURPOSE
--
-- Product-facing notification inbox on top of the existing durable
-- notification / escalation / integration delivery platform.
--
-- Existing systems remain authoritative for:
--
-- notifications.requests          Phase-23 delivery intent
-- notifications.delivery_attempts Phase-23 provider attempts
-- notifications.channels          tenant routing configuration
-- notifications.routing_rules     tenant routing policy
--
-- product.notification_events     product inbox events
-- product.notification_receipts   per-user read/dismiss state
--
-- SAFETY
--
-- NOTIFICATION != ACKNOWLEDGEMENT
-- NOTIFICATION != APPROVAL
-- NOTIFICATION != HUMAN CONTROL
-- NOTIFICATION != EXECUTION AUTHORIZATION
--
-- ============================================================================

BEGIN;


CREATE SCHEMA IF NOT EXISTS product;


-- ============================================================================
-- PRODUCT NOTIFICATION EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    product.notification_events (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'pntf_' ||
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                )
            ),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        kind TEXT NOT NULL,

        severity TEXT NOT NULL
            DEFAULT 'INFO',

        title TEXT NOT NULL,

        message TEXT NOT NULL,

        source_type TEXT NOT NULL,

        source_ref TEXT NOT NULL,

        incident_id TEXT NULL,

        human_task_id TEXT NULL,

        approval_id TEXT NULL,

        recovery_id TEXT NULL,

        certification_id TEXT NULL,

        integration_id TEXT NULL,

        target_type TEXT NOT NULL
            DEFAULT 'organization',

        target_user_id UUID NULL
            REFERENCES identity.users(id)
            ON DELETE CASCADE,

        target_team_id UUID NULL
            REFERENCES tenancy.teams(id)
            ON DELETE CASCADE,

        action_path TEXT NULL,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        expires_at TIMESTAMPTZ NULL,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT product_notification_kind_check
            CHECK (
                kind IN (
                    'incident',
                    'approval',
                    'human_task',
                    'recovery',
                    'trust',
                    'certification',
                    'integration',
                    'policy',
                    'security',
                    'onboarding',
                    'system'
                )
            ),

        CONSTRAINT product_notification_severity_check
            CHECK (
                severity IN (
                    'CRITICAL',
                    'HIGH',
                    'MEDIUM',
                    'LOW',
                    'INFO'
                )
            ),

        CONSTRAINT product_notification_target_type_check
            CHECK (
                target_type IN (
                    'organization',
                    'team',
                    'user'
                )
            ),

        CONSTRAINT product_notification_target_integrity
            CHECK (
                (
                    target_type = 'organization'
                    AND target_user_id IS NULL
                    AND target_team_id IS NULL
                )

                OR

                (
                    target_type = 'user'
                    AND target_user_id IS NOT NULL
                    AND target_team_id IS NULL
                )

                OR

                (
                    target_type = 'team'
                    AND target_user_id IS NULL
                    AND target_team_id IS NOT NULL
                )
            ),

        CONSTRAINT product_notification_title_nonempty
            CHECK (
                length(
                    trim(
                        title
                    )
                ) > 0
            ),

        CONSTRAINT product_notification_message_nonempty
            CHECK (
                length(
                    trim(
                        message
                    )
                ) > 0
            ),

        CONSTRAINT product_notification_source_nonempty
            CHECK (
                length(
                    trim(
                        source_type
                    )
                ) > 0

                AND

                length(
                    trim(
                        source_ref
                    )
                ) > 0
            ),

        CONSTRAINT product_notification_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            ),

        CONSTRAINT product_notification_never_executes
            CHECK (
                execution_authorized = FALSE
            )
    );


-- ============================================================================
-- SOURCE DEDUPLICATION
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS
    idx_product_notification_source_unique
ON product.notification_events (
    organization_id,

    COALESCE(
        environment_id,
        '00000000-0000-0000-0000-000000000000'::uuid
    ),

    source_type,

    source_ref,

    kind
);


-- ============================================================================
-- PRODUCT INBOX INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS
    idx_product_notifications_scope
ON product.notification_events (
    organization_id,
    environment_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_product_notifications_user_target
ON product.notification_events (
    organization_id,
    target_user_id,
    created_at DESC
)
WHERE target_type = 'user';


CREATE INDEX IF NOT EXISTS
    idx_product_notifications_team_target
ON product.notification_events (
    organization_id,
    target_team_id,
    created_at DESC
)
WHERE target_type = 'team';


CREATE INDEX IF NOT EXISTS
    idx_product_notifications_kind
ON product.notification_events (
    organization_id,
    environment_id,
    kind,
    created_at DESC
);


-- ============================================================================
-- USER RECEIPTS
--
-- Read/dismiss state belongs to a user.
--
-- A read receipt DOES NOT acknowledge an incident/human task.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    product.notification_receipts (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        notification_event_id UUID NOT NULL
            REFERENCES product.notification_events(id)
            ON DELETE CASCADE,

        user_id UUID NOT NULL
            REFERENCES identity.users(id)
            ON DELETE CASCADE,

        read_at TIMESTAMPTZ NULL,

        dismissed_at TIMESTAMPTZ NULL,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT product_notification_receipt_unique
            UNIQUE (
                notification_event_id,
                user_id
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_product_notification_receipts_user
ON product.notification_receipts (
    organization_id,
    user_id,
    read_at
);


-- ============================================================================
-- ENVIRONMENT / TENANT VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    product.aira_validate_notification_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    actual_organization_id UUID;
    actual_team_organization_id UUID;
BEGIN

    IF NEW.environment_id IS NOT NULL THEN

        SELECT
            organization_id
        INTO
            actual_organization_id
        FROM
            tenancy.environments
        WHERE
            id = NEW.environment_id;

        IF actual_organization_id IS NULL THEN
            RAISE EXCEPTION
                'product notification environment does not exist';
        END IF;

        IF actual_organization_id <> NEW.organization_id THEN
            RAISE EXCEPTION
                'product notification organization/environment mismatch';
        END IF;

    END IF;


    IF NEW.target_team_id IS NOT NULL THEN

        SELECT
            organization_id
        INTO
            actual_team_organization_id
        FROM
            tenancy.teams
        WHERE
            id = NEW.target_team_id;

        IF actual_team_organization_id IS NULL THEN
            RAISE EXCEPTION
                'product notification team does not exist';
        END IF;

        IF actual_team_organization_id <> NEW.organization_id THEN
            RAISE EXCEPTION
                'product notification organization/team mismatch';
        END IF;

    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_product_notification_scope
ON product.notification_events;


CREATE TRIGGER
    trg_product_notification_scope
BEFORE INSERT OR UPDATE
ON product.notification_events
FOR EACH ROW
EXECUTE FUNCTION
    product.aira_validate_notification_scope();


-- ============================================================================
-- UPDATED_AT
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_product_notification_events_updated_at
ON product.notification_events;


CREATE TRIGGER
    trg_product_notification_events_updated_at
BEFORE UPDATE
ON product.notification_events
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_product_notification_receipts_updated_at
ON product.notification_receipts;


CREATE TRIGGER
    trg_product_notification_receipts_updated_at
BEFORE UPDATE
ON product.notification_receipts
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE
    product.notification_events
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    product.notification_events
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    product.notification_receipts
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    product.notification_receipts
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    product_notification_events_scope
ON product.notification_events;


CREATE POLICY
    product_notification_events_scope
ON product.notification_events
FOR ALL
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    (
        environment_id IS NULL

        OR

        environment_id =
            tenancy.current_environment_id()
    )
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()

    AND

    (
        environment_id IS NULL

        OR

        environment_id =
            tenancy.current_environment_id()
    )

    AND

    execution_authorized = FALSE
);


DROP POLICY IF EXISTS
    product_notification_receipts_scope
ON product.notification_receipts;


CREATE POLICY
    product_notification_receipts_scope
ON product.notification_receipts
FOR ALL
USING (
    organization_id =
        tenancy.current_organization_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
);


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE
    product.notification_events
IS
    'AIRA in-product notification events. Notification state never grants operational authority.';


COMMENT ON TABLE
    product.notification_receipts
IS
    'Per-user product notification read/dismiss state. Reading a notification is not incident or human-task acknowledgement.';


-- ============================================================================
-- CERTIFICATION
-- ============================================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT
            1
        FROM
            pg_class c
        JOIN
            pg_namespace n
        ON
            n.oid =
            c.relnamespace
        WHERE
            n.nspname =
                'product'

            AND

            c.relname =
                'notification_events'

            AND

            c.relrowsecurity =
                TRUE

            AND

            c.relforcerowsecurity =
                TRUE
    ) THEN

        RAISE EXCEPTION
            'product.notification_events must FORCE RLS';

    END IF;


    IF NOT EXISTS (
        SELECT
            1
        FROM
            pg_constraint
        WHERE
            conname =
                'product_notification_never_executes'
    ) THEN

        RAISE EXCEPTION
            'product notification execution-authority constraint missing';

    END IF;

END $$;


COMMIT;