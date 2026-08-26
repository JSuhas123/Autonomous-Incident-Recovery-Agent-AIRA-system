-- ============================================================================
-- AIRA PHASE 15.9
-- COMMERCIAL RUNTIME ENTITLEMENTS + QUOTA FOUNDATION
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing;


-- ============================================================================
-- COMMERCIAL ENTITLEMENT DEFINITIONS
-- ============================================================================

INSERT INTO billing.entitlement_definitions (
    entitlement_key,
    name,
    description,
    expected_value_type,
    category
)
VALUES
    (
        'resources.max',
        'Managed Resources',
        'Included/allowed managed infrastructure resources.',
        'INTEGER',
        'capacity'
    ),

    (
        'incidents.monthly.included',
        'Included Incidents',
        'Included incidents processed per billing period.',
        'INTEGER',
        'usage'
    ),

    (
        'agent_runs.monthly.included',
        'Included Agent Runs',
        'Included AI agent runs per billing period.',
        'INTEGER',
        'usage'
    ),

    (
        'autonomous_recovery.enabled',
        'Autonomous Recovery',
        'Whether autonomous recovery is commercially enabled.',
        'BOOLEAN',
        'recovery'
    ),

    (
        'autonomous_recovery.monthly.included',
        'Included Autonomous Recoveries',
        'Included autonomous recoveries per billing period before overage.',
        'INTEGER',
        'usage'
    ),

    (
        'production_autonomy.enabled',
        'Production Autonomy',
        'Whether autonomous execution against production is commercially enabled.',
        'BOOLEAN',
        'recovery'
    ),

    (
        'playbook_executions.monthly.included',
        'Included Playbook Executions',
        'Included playbook executions per billing period.',
        'INTEGER',
        'usage'
    ),

    (
        'service_accounts.max',
        'Maximum Service Accounts',
        'Maximum service accounts allowed for the organization.',
        'INTEGER',
        'identity'
    ),

    (
        'api_keys.max',
        'Maximum API Keys',
        'Maximum active API keys allowed for the organization.',
        'INTEGER',
        'identity'
    ),

    (
        'audit.retention_days',
        'Audit Retention',
        'Audit retention period in days.',
        'INTEGER',
        'audit'
    ),

    (
        'audit.export',
        'Audit Export',
        'Whether audit export is commercially enabled.',
        'BOOLEAN',
        'audit'
    ),

    (
        'premium_integrations.enabled',
        'Premium Integrations',
        'Whether premium integrations are enabled.',
        'BOOLEAN',
        'integrations'
    ),

    (
        'enterprise_sso.enabled',
        'Enterprise SSO',
        'Whether enterprise SSO is commercially enabled.',
        'BOOLEAN',
        'identity'
    ),

    (
        'advanced_notification_routing.enabled',
        'Advanced Notification Routing',
        'Whether advanced notification routing is commercially enabled.',
        'BOOLEAN',
        'notifications'
    ),

    (
        'human_operations.enabled',
        'Human Operations',
        'Whether HumanTask/operator workflow features are enabled.',
        'BOOLEAN',
        'operations'
    )
ON CONFLICT (entitlement_key)
DO NOTHING;


-- ============================================================================
-- INTEGER ENTITLEMENT VALUES
-- ============================================================================

WITH valueset AS (
    SELECT *
    FROM (
        VALUES

        -- Developer
        ('developer', 'resources.max', 25::BIGINT),
        ('developer', 'incidents.monthly.included', 100::BIGINT),
        ('developer', 'agent_runs.monthly.included', 250::BIGINT),
        ('developer', 'autonomous_recovery.monthly.included', 0::BIGINT),
        ('developer', 'playbook_executions.monthly.included', 50::BIGINT),
        ('developer', 'service_accounts.max', 1::BIGINT),
        ('developer', 'api_keys.max', 1::BIGINT),
        ('developer', 'audit.retention_days', 7::BIGINT),

        -- Starter
        ('starter', 'resources.max', 150::BIGINT),
        ('starter', 'incidents.monthly.included', 1000::BIGINT),
        ('starter', 'agent_runs.monthly.included', 2500::BIGINT),
        ('starter', 'autonomous_recovery.monthly.included', 20::BIGINT),
        ('starter', 'playbook_executions.monthly.included', 500::BIGINT),
        ('starter', 'service_accounts.max', 5::BIGINT),
        ('starter', 'api_keys.max', 10::BIGINT),
        ('starter', 'audit.retention_days', 30::BIGINT),

        -- Growth
        ('growth', 'resources.max', 750::BIGINT),
        ('growth', 'incidents.monthly.included', 10000::BIGINT),
        ('growth', 'agent_runs.monthly.included', 25000::BIGINT),
        ('growth', 'autonomous_recovery.monthly.included', 150::BIGINT),
        ('growth', 'playbook_executions.monthly.included', 5000::BIGINT),
        ('growth', 'service_accounts.max', 25::BIGINT),
        ('growth', 'api_keys.max', 50::BIGINT),
        ('growth', 'audit.retention_days', 90::BIGINT),

        -- Scale
        ('scale', 'resources.max', 3000::BIGINT),
        ('scale', 'incidents.monthly.included', 50000::BIGINT),
        ('scale', 'agent_runs.monthly.included', 150000::BIGINT),
        ('scale', 'autonomous_recovery.monthly.included', 1000::BIGINT),
        ('scale', 'playbook_executions.monthly.included', 25000::BIGINT),
        ('scale', 'service_accounts.max', 100::BIGINT),
        ('scale', 'api_keys.max', 250::BIGINT),
        ('scale', 'audit.retention_days', 365::BIGINT)

    ) AS v(
        plan_code,
        entitlement_key,
        entitlement_value
    )
)

INSERT INTO billing.plan_entitlements (
    plan_version_id,
    entitlement_definition_id,
    value_type,
    integer_value
)

SELECT
    pv.id,
    ed.id,
    'INTEGER',
    valueset.entitlement_value

FROM valueset

JOIN billing.plans p
  ON p.code = valueset.plan_code

JOIN billing.plan_versions pv
  ON pv.plan_id = p.id
 AND pv.version_code = p.code || '_2026_08'

JOIN billing.entitlement_definitions ed
  ON ed.entitlement_key = valueset.entitlement_key

ON CONFLICT (
    plan_version_id,
    entitlement_definition_id
)
DO NOTHING;


-- ============================================================================
-- ENTERPRISE UNLIMITED LIMITS
-- ============================================================================

INSERT INTO billing.plan_entitlements (
    plan_version_id,
    entitlement_definition_id,
    value_type
)

SELECT
    pv.id,
    ed.id,
    'UNLIMITED'

FROM billing.plans p

JOIN billing.plan_versions pv
  ON pv.plan_id = p.id
 AND pv.version_code = 'enterprise_2026_08'

JOIN billing.entitlement_definitions ed
  ON ed.entitlement_key IN (
      'resources.max',
      'incidents.monthly.included',
      'agent_runs.monthly.included',
      'autonomous_recovery.monthly.included',
      'playbook_executions.monthly.included',
      'service_accounts.max',
      'api_keys.max',
      'audit.retention_days'
  )

WHERE p.code = 'enterprise'

ON CONFLICT (
    plan_version_id,
    entitlement_definition_id
)
DO NOTHING;


-- ============================================================================
-- BOOLEAN ENTITLEMENTS
-- ============================================================================

WITH valueset AS (
    SELECT *
    FROM (
        VALUES

        -- developer
        ('developer', 'autonomous_recovery.enabled', FALSE),
        ('developer', 'production_autonomy.enabled', FALSE),
        ('developer', 'audit.export', FALSE),
        ('developer', 'premium_integrations.enabled', FALSE),
        ('developer', 'enterprise_sso.enabled', FALSE),
        ('developer', 'advanced_notification_routing.enabled', FALSE),
        ('developer', 'human_operations.enabled', FALSE),

        -- starter
        ('starter', 'autonomous_recovery.enabled', TRUE),
        ('starter', 'production_autonomy.enabled', FALSE),
        ('starter', 'audit.export', FALSE),
        ('starter', 'premium_integrations.enabled', FALSE),
        ('starter', 'enterprise_sso.enabled', FALSE),
        ('starter', 'advanced_notification_routing.enabled', TRUE),
        ('starter', 'human_operations.enabled', TRUE),

        -- growth
        ('growth', 'autonomous_recovery.enabled', TRUE),
        ('growth', 'production_autonomy.enabled', TRUE),
        ('growth', 'audit.export', TRUE),
        ('growth', 'premium_integrations.enabled', TRUE),
        ('growth', 'enterprise_sso.enabled', FALSE),
        ('growth', 'advanced_notification_routing.enabled', TRUE),
        ('growth', 'human_operations.enabled', TRUE),

        -- scale
        ('scale', 'autonomous_recovery.enabled', TRUE),
        ('scale', 'production_autonomy.enabled', TRUE),
        ('scale', 'audit.export', TRUE),
        ('scale', 'premium_integrations.enabled', TRUE),
        ('scale', 'enterprise_sso.enabled', TRUE),
        ('scale', 'advanced_notification_routing.enabled', TRUE),
        ('scale', 'human_operations.enabled', TRUE),

        -- enterprise
        ('enterprise', 'autonomous_recovery.enabled', TRUE),
        ('enterprise', 'production_autonomy.enabled', TRUE),
        ('enterprise', 'audit.export', TRUE),
        ('enterprise', 'premium_integrations.enabled', TRUE),
        ('enterprise', 'enterprise_sso.enabled', TRUE),
        ('enterprise', 'advanced_notification_routing.enabled', TRUE),
        ('enterprise', 'human_operations.enabled', TRUE)

    ) AS v(
        plan_code,
        entitlement_key,
        enabled
    )
)

INSERT INTO billing.plan_entitlements (
    plan_version_id,
    entitlement_definition_id,
    value_type,
    boolean_value
)

SELECT
    pv.id,
    ed.id,
    'BOOLEAN',
    valueset.enabled

FROM valueset

JOIN billing.plans p
  ON p.code = valueset.plan_code

JOIN billing.plan_versions pv
  ON pv.plan_id = p.id
 AND pv.version_code = p.code || '_2026_08'

JOIN billing.entitlement_definitions ed
  ON ed.entitlement_key = valueset.entitlement_key

ON CONFLICT (
    plan_version_id,
    entitlement_definition_id
)
DO NOTHING;