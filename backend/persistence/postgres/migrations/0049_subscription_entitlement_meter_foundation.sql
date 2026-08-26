-- ============================================================================
-- AIRA PHASE 15.3 + 15.4 + 15.5
--
-- 15.3  ENTERPRISE SUBSCRIPTION LIFECYCLE
-- 15.4  DATABASE-BACKED ENTITLEMENT FOUNDATION
-- 15.5  VERSIONED USAGE METER CATALOGUE
--
-- PostgreSQL remains the financial source of truth.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;


-- ============================================================================
-- 15.3 — EVOLVE EXISTING SUBSCRIPTIONS
-- ============================================================================

ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  plan_version_id UUID;


ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  price_id UUID;


ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  billing_interval TEXT;


ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  currency TEXT;


ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  trial_started_at TIMESTAMPTZ;


ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  trial_ends_at TIMESTAMPTZ;


ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  current_period_started_at TIMESTAMPTZ;


ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  current_period_ends_at TIMESTAMPTZ;


ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  cancel_at_period_end BOOLEAN NOT NULL
    DEFAULT FALSE;


ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  cancelled_at TIMESTAMPTZ;


ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  cancellation_reason TEXT;


ALTER TABLE tenancy.subscriptions
ADD COLUMN IF NOT EXISTS
  billing_anchor_at TIMESTAMPTZ;


-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'subscriptions_plan_version_fk'
  ) THEN

    ALTER TABLE tenancy.subscriptions
    ADD CONSTRAINT
      subscriptions_plan_version_fk
    FOREIGN KEY (
      plan_version_id
    )
    REFERENCES billing.plan_versions(id)
    ON DELETE RESTRICT;

  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'subscriptions_price_fk'
  ) THEN

    ALTER TABLE tenancy.subscriptions
    ADD CONSTRAINT
      subscriptions_price_fk
    FOREIGN KEY (
      price_id
    )
    REFERENCES billing.prices(id)
    ON DELETE RESTRICT;

  END IF;

END
$$;


-- ============================================================================
-- NORMALIZE LEGACY PLAN CODES
-- ============================================================================

UPDATE tenancy.subscriptions
SET plan =
  CASE
    WHEN plan = 'team'
      THEN 'starter'

    WHEN plan = 'business'
      THEN 'growth'

    ELSE plan
  END
WHERE plan IN (
  'team',
  'business'
);


-- ============================================================================
-- ATTACH EXISTING SUBSCRIPTIONS TO CURRENT PLAN VERSION
-- ============================================================================

UPDATE tenancy.subscriptions s
SET plan_version_id =
  pv.id
FROM billing.plans p
JOIN billing.plan_versions pv
  ON pv.plan_id =
    p.id
WHERE
  s.plan_version_id IS NULL
  AND p.code =
    s.plan
  AND pv.version_code =
    p.code ||
    '_2026_08';


-- ============================================================================
-- DEFAULT BILLING DIMENSIONS
--
-- Developer subscriptions are free.
--
-- Existing paid subscriptions are assigned USD/monthly as a safe structural
-- baseline only when no commercial billing dimensions exist yet.
--
-- Payment-provider onboarding later owns actual provider synchronization.
-- ============================================================================

UPDATE tenancy.subscriptions
SET
  billing_interval =
    COALESCE(
      billing_interval,
      'monthly'
    ),

  currency =
    COALESCE(
      currency,
      'USD'
    )
WHERE
  billing_interval IS NULL
  OR currency IS NULL;


-- ============================================================================
-- ATTACH PRICE WHERE A MATCH EXISTS
-- ============================================================================

UPDATE tenancy.subscriptions s
SET price_id =
  pr.id
FROM billing.prices pr
WHERE
  s.price_id IS NULL
  AND pr.plan_version_id =
    s.plan_version_id
  AND pr.currency =
    s.currency
  AND pr.billing_interval =
    s.billing_interval
  AND pr.status =
    'active';


-- ============================================================================
-- SUBSCRIPTION VALIDATION
-- ============================================================================

DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'subscriptions_plan_phase15_check'
  ) THEN

    ALTER TABLE tenancy.subscriptions
    ADD CONSTRAINT
      subscriptions_plan_phase15_check
    CHECK (
      plan IN (
        'developer',
        'starter',
        'growth',
        'scale',
        'enterprise'
      )
    );

  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'subscriptions_billing_interval_check'
  ) THEN

    ALTER TABLE tenancy.subscriptions
    ADD CONSTRAINT
      subscriptions_billing_interval_check
    CHECK (
      billing_interval IS NULL
      OR billing_interval IN (
        'monthly',
        'annual'
      )
    );

  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'subscriptions_currency_check'
  ) THEN

    ALTER TABLE tenancy.subscriptions
    ADD CONSTRAINT
      subscriptions_currency_check
    CHECK (
      currency IS NULL
      OR currency IN (
        'USD',
        'INR'
      )
    );

  END IF;

END
$$;


CREATE INDEX IF NOT EXISTS
  idx_subscriptions_plan_version
ON tenancy.subscriptions (
  plan_version_id
);


CREATE INDEX IF NOT EXISTS
  idx_subscriptions_price
ON tenancy.subscriptions (
  price_id
);


CREATE INDEX IF NOT EXISTS
  idx_subscriptions_period_end
ON tenancy.subscriptions (
  current_period_ends_at
);


-- ============================================================================
-- 15.4 — TENANT ENTITLEMENT OVERRIDES
--
-- Base entitlement:
--
-- plan_version
--      ↓
-- plan_entitlements
--
-- Effective entitlement:
--
-- plan entitlement
--      +
-- tenant override
--      ↓
-- effective entitlement
--
-- This is necessary for negotiated Enterprise contracts and temporary
-- commercial exceptions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
  billing.tenant_entitlement_overrides (

    id UUID PRIMARY KEY
      DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
      REFERENCES tenancy.organizations(id)
      ON DELETE CASCADE,

    entitlement_definition_id UUID NOT NULL
      REFERENCES billing.entitlement_definitions(id)
      ON DELETE RESTRICT,

    value_type TEXT NOT NULL,

    boolean_value BOOLEAN,

    integer_value BIGINT,

    text_value TEXT,

    json_value JSONB,

    reason TEXT,

    effective_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    expires_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    CONSTRAINT
      tenant_entitlement_override_type_check
    CHECK (
      value_type IN (
        'BOOLEAN',
        'INTEGER',
        'STRING',
        'JSON',
        'UNLIMITED'
      )
    ),

    CONSTRAINT
      tenant_entitlement_override_shape_check
    CHECK (

      (
        value_type = 'BOOLEAN'
        AND boolean_value IS NOT NULL
        AND integer_value IS NULL
        AND text_value IS NULL
        AND json_value IS NULL
      )

      OR

      (
        value_type = 'INTEGER'
        AND boolean_value IS NULL
        AND integer_value IS NOT NULL
        AND integer_value >= 0
        AND text_value IS NULL
        AND json_value IS NULL
      )

      OR

      (
        value_type = 'STRING'
        AND boolean_value IS NULL
        AND integer_value IS NULL
        AND text_value IS NOT NULL
        AND json_value IS NULL
      )

      OR

      (
        value_type = 'JSON'
        AND boolean_value IS NULL
        AND integer_value IS NULL
        AND text_value IS NULL
        AND json_value IS NOT NULL
      )

      OR

      (
        value_type = 'UNLIMITED'
        AND boolean_value IS NULL
        AND integer_value IS NULL
        AND text_value IS NULL
        AND json_value IS NULL
      )
    )
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_tenant_entitlement_override_unique
ON billing.tenant_entitlement_overrides (
  organization_id,
  entitlement_definition_id
);


CREATE INDEX IF NOT EXISTS
  idx_tenant_entitlement_override_expiry
ON billing.tenant_entitlement_overrides (
  expires_at
);


DROP TRIGGER IF EXISTS
  trg_tenant_entitlement_overrides_updated_at
ON billing.tenant_entitlement_overrides;


CREATE TRIGGER
  trg_tenant_entitlement_overrides_updated_at
BEFORE UPDATE
ON billing.tenant_entitlement_overrides
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


-- ============================================================================
-- EFFECTIVE ENTITLEMENT VIEW
-- ============================================================================

CREATE OR REPLACE VIEW
  billing.effective_entitlements
AS
SELECT
  s.organization_id,

  s.id AS
    subscription_id,

  s.plan_version_id,

  p.code AS
    plan_code,

  ed.id AS
    entitlement_definition_id,

  ed.entitlement_key,

  COALESCE(
    teo.value_type,
    pe.value_type
  ) AS value_type,

  CASE
    WHEN teo.id IS NOT NULL
      THEN teo.boolean_value
    ELSE pe.boolean_value
  END AS boolean_value,

  CASE
    WHEN teo.id IS NOT NULL
      THEN teo.integer_value
    ELSE pe.integer_value
  END AS integer_value,

  CASE
    WHEN teo.id IS NOT NULL
      THEN teo.text_value
    ELSE pe.text_value
  END AS text_value,

  CASE
    WHEN teo.id IS NOT NULL
      THEN teo.json_value
    ELSE pe.json_value
  END AS json_value,

  (
    teo.id IS NOT NULL
  ) AS overridden

FROM tenancy.subscriptions s

JOIN billing.plan_versions pv
  ON pv.id =
    s.plan_version_id

JOIN billing.plans p
  ON p.id =
    pv.plan_id

JOIN billing.plan_entitlements pe
  ON pe.plan_version_id =
    pv.id

JOIN billing.entitlement_definitions ed
  ON ed.id =
    pe.entitlement_definition_id

LEFT JOIN billing.tenant_entitlement_overrides teo
  ON teo.organization_id =
    s.organization_id

  AND teo.entitlement_definition_id =
    ed.id

  AND teo.effective_at <=
    NOW()

  AND (
    teo.expires_at IS NULL
    OR teo.expires_at >
      NOW()
  );


COMMENT ON VIEW
  billing.effective_entitlements
IS
  'Effective organization entitlements after plan-version defaults and tenant-specific overrides.';


-- ============================================================================
-- 15.5 — USAGE METER DEFINITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
  billing.meter_definitions (

    id UUID PRIMARY KEY
      DEFAULT gen_random_uuid(),

    meter_code TEXT NOT NULL,

    version INTEGER NOT NULL
      DEFAULT 1,

    name TEXT NOT NULL,

    description TEXT,

    unit TEXT NOT NULL,

    aggregation_type TEXT NOT NULL,

    billable BOOLEAN NOT NULL
      DEFAULT FALSE,

    economic BOOLEAN NOT NULL
      DEFAULT TRUE,

    status TEXT NOT NULL
      DEFAULT 'active',

    metadata JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    CONSTRAINT
      meter_definition_version_unique
    UNIQUE (
      meter_code,
      version
    ),

    CONSTRAINT
      meter_definition_version_positive
    CHECK (
      version > 0
    ),

    CONSTRAINT
      meter_definition_aggregation_check
    CHECK (
      aggregation_type IN (
        'SUM',
        'COUNT',
        'MAX',
        'LATEST'
      )
    ),

    CONSTRAINT
      meter_definition_status_check
    CHECK (
      status IN (
        'active',
        'retired'
      )
    )
);


CREATE INDEX IF NOT EXISTS
  idx_meter_definitions_active
ON billing.meter_definitions (
  meter_code,
  status
);


-- ============================================================================
-- INITIAL ENTERPRISE METER REGISTRY
-- ============================================================================

INSERT INTO billing.meter_definitions (
  meter_code,
  version,
  name,
  description,
  unit,
  aggregation_type,
  billable,
  economic
)
VALUES

(
  'incidents_processed',
  1,
  'Incidents Processed',
  'Number of incidents processed by AIRA.',
  'incident',
  'COUNT',
  FALSE,
  TRUE
),

(
  'agent_runs',
  1,
  'Agent Runs',
  'Number of autonomous or assisted agent executions.',
  'run',
  'COUNT',
  FALSE,
  TRUE
),

(
  'llm_input_tokens',
  1,
  'LLM Input Tokens',
  'Input tokens consumed by AIRA AI workloads.',
  'token',
  'SUM',
  FALSE,
  TRUE
),

(
  'llm_output_tokens',
  1,
  'LLM Output Tokens',
  'Output tokens generated by AIRA AI workloads.',
  'token',
  'SUM',
  FALSE,
  TRUE
),

(
  'integration_queries',
  1,
  'Integration Queries',
  'Queries made against external integrations.',
  'query',
  'COUNT',
  FALSE,
  TRUE
),

(
  'telemetry_bytes',
  1,
  'Telemetry Bytes',
  'Telemetry volume processed by AIRA.',
  'byte',
  'SUM',
  FALSE,
  TRUE
),

(
  'playbook_executions',
  1,
  'Playbook Executions',
  'Playbook executions performed by AIRA.',
  'execution',
  'COUNT',
  FALSE,
  TRUE
),

(
  'autonomous_recoveries',
  1,
  'Autonomous Recoveries',
  'Recovery operations completed autonomously.',
  'recovery',
  'COUNT',
  FALSE,
  TRUE
),

(
  'evidence_storage_bytes',
  1,
  'Evidence Storage',
  'Stored incident and recovery evidence.',
  'byte',
  'LATEST',
  FALSE,
  TRUE
),

(
  'vector_embeddings',
  1,
  'Vector Embeddings',
  'Vector embeddings generated for semantic retrieval.',
  'embedding',
  'COUNT',
  FALSE,
  TRUE
),

(
  'notifications',
  1,
  'Notifications',
  'Notifications emitted by AIRA.',
  'notification',
  'COUNT',
  FALSE,
  TRUE
),

(
  'environments',
  1,
  'Environments',
  'Active managed environments.',
  'environment',
  'MAX',
  FALSE,
  TRUE
),

(
  'users',
  1,
  'Users',
  'Active organization users.',
  'user',
  'MAX',
  FALSE,
  TRUE
),

(
  'resources',
  1,
  'Resources',
  'Infrastructure resources managed by AIRA.',
  'resource',
  'MAX',
  FALSE,
  TRUE
)

ON CONFLICT (
  meter_code,
  version
)
DO NOTHING;


COMMENT ON TABLE
  billing.meter_definitions
IS
  'Immutable-versioned definitions describing what AIRA measures. Usage events are introduced separately.';