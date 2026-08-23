-- ============================================================================
-- AIRA PHASE 13
-- MIGRATION 0016 — SUBSCRIPTION / ENTITLEMENT PERSISTENCE
-- ============================================================================
--
-- Forward-only migration.
-- Existing migrations must remain immutable.
-- ============================================================================


CREATE TABLE IF NOT EXISTS
  tenancy.subscriptions (
    id UUID PRIMARY KEY
      DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    legacy_mongo_id TEXT,

    organization_id UUID NOT NULL
      REFERENCES tenancy.organizations(id)
      ON DELETE CASCADE,

    plan TEXT NOT NULL
      DEFAULT 'developer',

    status TEXT NOT NULL
      DEFAULT 'active',

    started_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    ends_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    CONSTRAINT subscriptions_public_id_unique
      UNIQUE (
        public_id
      ),

    CONSTRAINT subscriptions_legacy_mongo_id_unique
      UNIQUE (
        legacy_mongo_id
      ),

    CONSTRAINT subscriptions_organization_unique
      UNIQUE (
        organization_id
      ),

    CONSTRAINT subscriptions_status_check
      CHECK (
        status IN (
          'active',
          'trialing',
          'past_due',
          'suspended',
          'cancelled'
        )
      )
  );


CREATE INDEX IF NOT EXISTS
  idx_subscriptions_plan
ON tenancy.subscriptions (
  plan
);


CREATE INDEX IF NOT EXISTS
  idx_subscriptions_status
ON tenancy.subscriptions (
  status
);


DROP TRIGGER IF EXISTS
  trg_subscriptions_updated_at
ON tenancy.subscriptions;


CREATE TRIGGER
  trg_subscriptions_updated_at
BEFORE UPDATE
ON tenancy.subscriptions
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


COMMENT ON TABLE
  tenancy.subscriptions
IS
  'Canonical AIRA organization subscription and plan entitlement state.';