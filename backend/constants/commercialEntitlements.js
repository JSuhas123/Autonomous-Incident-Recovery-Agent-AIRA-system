"use strict";


const COMMERCIAL_ENTITLEMENTS =
  Object.freeze({

    RESOURCES_MAX:
      "resources.max",

    INCIDENTS_MONTHLY_INCLUDED:
      "incidents.monthly.included",

    AGENT_RUNS_MONTHLY_INCLUDED:
      "agent_runs.monthly.included",

    AUTONOMOUS_RECOVERY_ENABLED:
      "autonomous_recovery.enabled",

    AUTONOMOUS_RECOVERY_MONTHLY_INCLUDED:
      "autonomous_recovery.monthly.included",

    PRODUCTION_AUTONOMY_ENABLED:
      "production_autonomy.enabled",

    PLAYBOOK_EXECUTIONS_MONTHLY_INCLUDED:
      "playbook_executions.monthly.included",

    SERVICE_ACCOUNTS_MAX:
      "service_accounts.max",

    API_KEYS_MAX:
      "api_keys.max",

    AUDIT_RETENTION_DAYS:
      "audit.retention_days",

    AUDIT_EXPORT:
      "audit.export",

    PREMIUM_INTEGRATIONS:
      "premium_integrations.enabled",

    ENTERPRISE_SSO:
      "enterprise_sso.enabled",

    ADVANCED_NOTIFICATION_ROUTING:
      "advanced_notification_routing.enabled",

    HUMAN_OPERATIONS:
      "human_operations.enabled",
  });


const COMMERCIAL_ENTITLEMENT_VALUES =
  Object.freeze(
    Object.values(
      COMMERCIAL_ENTITLEMENTS
    )
  );


function isKnownCommercialEntitlement(
  value
) {
  return (
    typeof value ===
      "string" &&
    COMMERCIAL_ENTITLEMENT_VALUES
      .includes(
        value
      )
  );
}


module.exports = {
  COMMERCIAL_ENTITLEMENTS,

  COMMERCIAL_ENTITLEMENT_VALUES,

  isKnownCommercialEntitlement,
};