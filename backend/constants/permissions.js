"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14.5
 * CANONICAL FINE-GRAINED PERMISSION REGISTRY
 * ============================================================================
 *
 * Permissions are the canonical authorization vocabulary.
 *
 * Roles are bundles of permissions.
 *
 * Existing Phase 14 public exports are preserved:
 *
 *   PERMISSION_VALUES
 *   isKnownPermission()
 *
 * New Phase 14.5 aliases are also exposed:
 *
 *   ALL_PERMISSIONS
 *   isValidPermission()
 *   normalizePermissions()
 * ============================================================================
 */

const PERMISSIONS =
  Object.freeze({

    // ========================================================================
    // ORGANIZATION
    // ========================================================================

    ORGANIZATION_READ:
      "organization.read",

    ORGANIZATION_MANAGE:
      "organization.manage",

    ORGANIZATION_SETTINGS_MANAGE:
      "organization.settings.manage",

    IDENTITY_PROVIDER_READ:
  "identity_provider.read",

IDENTITY_PROVIDER_MANAGE:
  "identity_provider.manage",

SSO_POLICY_READ:
  "sso_policy.read",

SSO_POLICY_MANAGE:
  "sso_policy.manage",

DOMAIN_READ:
  "domain.read",

DOMAIN_MANAGE:
  "domain.manage",

  TENANT_SETTINGS_READ:
  "tenant_settings.read",

TENANT_SETTINGS_MANAGE:
  "tenant_settings.manage",

AUTONOMY_READ:
  "autonomy.read",

AUTONOMY_MANAGE:
  "autonomy.manage",

INTEGRATION_CREDENTIALS_MANAGE:
  "integration.credentials.manage",

INTEGRATION_GOVERNANCE_READ:
  "integration.governance.read",

INTEGRATION_GOVERNANCE_MANAGE:
  "integration.governance.manage",
  // ========================================================================
// NOTIFICATIONS
// ========================================================================

NOTIFICATION_READ:
  "notification.read",

NOTIFICATION_MANAGE:
  "notification.manage",

NOTIFICATION_ROUTE_READ:
  "notification.route.read",

NOTIFICATION_ROUTE_MANAGE:
  "notification.route.manage",


// ========================================================================
// HUMAN OPERATIONS
// ========================================================================

HUMAN_TASK_READ:
  "human_task.read",

HUMAN_TASK_CREATE:
  "human_task.create",

HUMAN_TASK_ASSIGN:
  "human_task.assign",

HUMAN_TASK_MANAGE:
  "human_task.manage",

HUMAN_TASK_RESOLVE:
  "human_task.resolve",

  ONBOARDING_READ:
  "onboarding.read",

ONBOARDING_MANAGE:
  "onboarding.manage",
  AUDIT_VERIFY:
  "audit.verify",

AUDIT_EXPORT:
  "audit.export",
    // ========================================================================
    // MEMBERS
    // ========================================================================

    MEMBER_READ:
      "member.read",

    MEMBER_INVITE:
      "member.invite",

    MEMBER_MANAGE:
      "member.manage",

    MEMBER_ROLE_MANAGE:
      "member.role.manage",


    // ========================================================================
    // TEAMS
    // ========================================================================

    TEAM_READ:
      "team.read",

    TEAM_MANAGE:
      "team.manage",


    // ========================================================================
    // ENVIRONMENTS
    // ========================================================================

    ENVIRONMENT_READ:
      "environment.read",

    ENVIRONMENT_CREATE:
      "environment.create",

    ENVIRONMENT_MANAGE:
      "environment.manage",

    ENVIRONMENT_ARCHIVE:
      "environment.archive",

    ENVIRONMENT_DELETE:
      "environment.delete",


    // ========================================================================
    // INCIDENTS
    // ========================================================================

    INCIDENT_READ:
      "incident.read",

    INCIDENT_MANAGE:
      "incident.manage",

    INCIDENT_ACKNOWLEDGE:
      "incident.acknowledge",

    INCIDENT_ASSIGN:
      "incident.assign",


    // ========================================================================
    // EXECUTION
    // ========================================================================

    EXECUTION_READ:
      "execution.read",

    EXECUTION_EXECUTE:
      "execution.execute",

    EXECUTION_APPROVE:
      "execution.approve",

    EXECUTION_CANCEL:
      "execution.cancel",


    // ========================================================================
    // RECOVERY
    // ========================================================================

    RECOVERY_READ:
      "recovery.read",

    RECOVERY_EXECUTE:
      "recovery.execute",

    RECOVERY_ROLLBACK:
      "recovery.rollback",


    // ========================================================================
    // PLAYBOOKS
    // ========================================================================

    PLAYBOOK_READ:
      "playbook.read",

    PLAYBOOK_CREATE:
      "playbook.create",

    PLAYBOOK_UPDATE:
      "playbook.update",

    PLAYBOOK_PUBLISH:
      "playbook.publish",

    PLAYBOOK_DELETE:
      "playbook.delete",


    // ========================================================================
    // RUNBOOKS
    // ========================================================================

    RUNBOOK_READ:
      "runbook.read",

    RUNBOOK_CREATE:
      "runbook.create",

    RUNBOOK_UPDATE:
      "runbook.update",

    RUNBOOK_PUBLISH:
      "runbook.publish",

    RUNBOOK_DELETE:
      "runbook.delete",


    // ========================================================================
    // POLICIES
    // ========================================================================

    POLICY_READ:
      "policy.read",

    POLICY_MANAGE:
      "policy.manage",

    POLICY_PUBLISH:
      "policy.publish",


    // ========================================================================
    // INTEGRATIONS
    // ========================================================================

    INTEGRATION_READ:
      "integration.read",

    INTEGRATION_MANAGE:
      "integration.manage",

    INTEGRATION_TEST:
      "integration.test",


    // ========================================================================
    // MACHINE IDENTITY
    // ========================================================================

    SERVICE_ACCOUNT_READ:
      "service_account.read",

    SERVICE_ACCOUNT_MANAGE:
      "service_account.manage",

    API_KEY_READ:
      "api_key.read",

    API_KEY_MANAGE:
      "api_key.manage",


    // ========================================================================
    // SECURITY / AUDIT
    // ========================================================================

    AUDIT_READ:
      "audit.read",

    SECURITY_READ:
      "security.read",

    SECURITY_MANAGE:
      "security.manage",


    // ========================================================================
    // BILLING
    // ========================================================================

    BILLING_READ:
      "billing.read",

    BILLING_MANAGE:
      "billing.manage",


    // ========================================================================
    // KNOWLEDGE
    // ========================================================================

    KNOWLEDGE_READ:
      "knowledge.read",

    KNOWLEDGE_MANAGE:
      "knowledge.manage",


    // ========================================================================
    // MEMORY
    // ========================================================================

    MEMORY_READ:
      "memory.read",

    MEMORY_MANAGE:
      "memory.manage",


    // ========================================================================
    // MONITORING
    // ========================================================================

    MONITOR_READ:
      "monitor.read",

    MONITOR_MANAGE:
      "monitor.manage",


    // ========================================================================
    // RESOURCES
    // ========================================================================

    RESOURCE_READ:
      "resource.read",

    RESOURCE_MANAGE:
      "resource.manage",


    // ========================================================================
    // USAGE / ENTITLEMENTS
    // ========================================================================

    USAGE_READ:
      "usage.read",

    ENTITLEMENT_READ:
      "entitlement.read",


    // ========================================================================
    // NOTIFICATIONS
    // ========================================================================

    NOTIFICATION_READ:
      "notification.read",

    NOTIFICATION_MANAGE:
      "notification.manage",
  });


const PERMISSION_VALUES =
  Object.freeze(
    Object.values(
      PERMISSIONS
    )
  );


const ALL_PERMISSIONS =
  PERMISSION_VALUES;


const PERMISSION_SET =
  new Set(
    PERMISSION_VALUES
  );


function isKnownPermission(
  permission
) {
  if (
    typeof permission !==
      "string"
  ) {
    return false;
  }

  return PERMISSION_SET.has(
    permission.trim()
  );
}


function isValidPermission(
  permission
) {
  return isKnownPermission(
    permission
  );
}


function normalizePermissions(
  permissions
) {
  if (
    !Array.isArray(
      permissions
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      permissions
        .map(
          (permission) =>
            typeof permission ===
              "string"
              ? permission.trim()
              : ""
        )
        .filter(
          isKnownPermission
        )
    ),
  ];
}


module.exports = {
  PERMISSIONS,

  // Existing Phase 14 API
  PERMISSION_VALUES,
  isKnownPermission,

  // Phase 14.5 API
  ALL_PERMISSIONS,
  PERMISSION_SET,
  isValidPermission,
  normalizePermissions,
};