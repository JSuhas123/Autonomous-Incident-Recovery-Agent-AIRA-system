-- ============================================================================
-- AIRA PHASE 14.10
-- TENANT NOTIFICATION ROUTING
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS notifications;


-- ============================================================================
-- CHANNELS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications.channels (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    channel_type TEXT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'active',

    destination TEXT NOT NULL,

    configuration JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    updated_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT notification_channel_public_id_unique
        UNIQUE (public_id),

    CONSTRAINT notification_channel_org_name_unique
        UNIQUE (
            organization_id,
            name
        ),

    CONSTRAINT notification_channel_type_check
        CHECK (
            channel_type IN (
                'email',
                'slack',
                'pagerduty',
                'webhook'
            )
        ),

    CONSTRAINT notification_channel_status_check
        CHECK (
            status IN (
                'active',
                'disabled'
            )
        ),

    CONSTRAINT notification_channel_name_nonempty
        CHECK (
            length(trim(name)) > 0
        ),

    CONSTRAINT notification_channel_destination_nonempty
        CHECK (
            length(trim(destination)) > 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_notification_channels_org
ON notifications.channels (
    organization_id,
    status
);


-- ============================================================================
-- ROUTING RULES
--
-- environment_id NULL means organization-wide.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications.routing_rules (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    enabled BOOLEAN NOT NULL
        DEFAULT TRUE,

    priority INTEGER NOT NULL
        DEFAULT 100,

    event_types JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    severities JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    channel_ids JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    stop_processing BOOLEAN NOT NULL
        DEFAULT FALSE,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    updated_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT notification_rule_public_id_unique
        UNIQUE (public_id),

    CONSTRAINT notification_rule_priority_positive
        CHECK (
            priority >= 0
        ),

    CONSTRAINT notification_rule_event_types_array
        CHECK (
            jsonb_typeof(event_types) = 'array'
        ),

    CONSTRAINT notification_rule_severities_array
        CHECK (
            jsonb_typeof(severities) = 'array'
        ),

    CONSTRAINT notification_rule_channel_ids_array
        CHECK (
            jsonb_typeof(channel_ids) = 'array'
        )
);


CREATE INDEX IF NOT EXISTS
    idx_notification_rules_scope
ON notifications.routing_rules (
    organization_id,
    environment_id,
    enabled,
    priority
);


-- ============================================================================
-- DELIVERY LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications.deliveries (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID
        REFERENCES tenancy.environments(id)
        ON DELETE SET NULL,

    notification_id TEXT,

    incident_id TEXT,

    human_task_id TEXT,

    escalation_id TEXT,

    event_type TEXT NOT NULL,

    severity TEXT,

    channel_id UUID
        REFERENCES notifications.channels(id)
        ON DELETE SET NULL,

    channel_type TEXT NOT NULL,

    destination TEXT,

    status TEXT NOT NULL
        DEFAULT 'pending',

    attempt_count INTEGER NOT NULL
        DEFAULT 0,

    provider_result JSONB,

    failure JSONB,

    delivered_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT notification_delivery_public_id_unique
        UNIQUE (public_id),

    CONSTRAINT notification_delivery_status_check
        CHECK (
            status IN (
                'pending',
                'delivered',
                'failed',
                'skipped'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_notification_deliveries_scope
ON notifications.deliveries (
    organization_id,
    environment_id,
    created_at DESC
);


-- ============================================================================
-- TENANT SCOPE VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    notifications.aira_validate_notification_environment_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    actual_organization_id UUID;
BEGIN
    IF NEW.environment_id IS NULL THEN
        RETURN NEW;
    END IF;

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
            'notification environment does not exist';
    END IF;

    IF actual_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION
            'notification organization/environment mismatch';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_notification_rule_scope
ON notifications.routing_rules;


CREATE TRIGGER
    trg_notification_rule_scope
BEFORE INSERT OR UPDATE
ON notifications.routing_rules
FOR EACH ROW
EXECUTE FUNCTION
    notifications.aira_validate_notification_environment_scope();


DROP TRIGGER IF EXISTS
    trg_notification_delivery_scope
ON notifications.deliveries;


CREATE TRIGGER
    trg_notification_delivery_scope
BEFORE INSERT OR UPDATE
ON notifications.deliveries
FOR EACH ROW
EXECUTE FUNCTION
    notifications.aira_validate_notification_environment_scope();


-- ============================================================================
-- UPDATED_AT
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_notification_channels_updated_at
ON notifications.channels;


CREATE TRIGGER
    trg_notification_channels_updated_at
BEFORE UPDATE
ON notifications.channels
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_notification_rules_updated_at
ON notifications.routing_rules;


CREATE TRIGGER
    trg_notification_rules_updated_at
BEFORE UPDATE
ON notifications.routing_rules
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_notification_deliveries_updated_at
ON notifications.deliveries;


CREATE TRIGGER
    trg_notification_deliveries_updated_at
BEFORE UPDATE
ON notifications.deliveries
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();