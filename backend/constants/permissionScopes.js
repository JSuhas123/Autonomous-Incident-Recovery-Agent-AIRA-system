"use strict";

const {
  PERMISSIONS:
    P,
} =
  require(
    "./permissions"
  );


const PERMISSION_SCOPES =
  Object.freeze({
    ORGANIZATION:
      "ORGANIZATION",

    ENVIRONMENT:
      "ENVIRONMENT",
  });


const permissionScopes = {

  // ==========================================================================
  // ORGANIZATION CONTROL PLANE
  // ==========================================================================

  [P.ORGANIZATION_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.ORGANIZATION_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.ORGANIZATION_SETTINGS_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // MEMBERS
  // ==========================================================================

  [P.MEMBER_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.MEMBER_INVITE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.MEMBER_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.MEMBER_ROLE_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // TEAMS
  // ==========================================================================

  [P.TEAM_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.TEAM_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // ENVIRONMENT CONTROL PLANE
  // ==========================================================================

  [P.ENVIRONMENT_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.ENVIRONMENT_CREATE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.ENVIRONMENT_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.ENVIRONMENT_ARCHIVE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.ENVIRONMENT_DELETE]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // INCIDENTS
  // ==========================================================================

  [P.INCIDENT_READ]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.INCIDENT_MANAGE]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.INCIDENT_ACKNOWLEDGE]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.INCIDENT_ASSIGN]:
    PERMISSION_SCOPES
      .ENVIRONMENT,


  // ==========================================================================
  // EXECUTION
  // ==========================================================================

  [P.EXECUTION_READ]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.EXECUTION_EXECUTE]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.EXECUTION_APPROVE]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.EXECUTION_CANCEL]:
    PERMISSION_SCOPES
      .ENVIRONMENT,


  // ==========================================================================
  // RECOVERY
  // ==========================================================================

  [P.RECOVERY_READ]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.RECOVERY_EXECUTE]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.RECOVERY_ROLLBACK]:
    PERMISSION_SCOPES
      .ENVIRONMENT,


  // ==========================================================================
  // INTEGRATIONS
  //
  // Connections exist inside an environment.
  // ==========================================================================

  [P.INTEGRATION_READ]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.INTEGRATION_MANAGE]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.INTEGRATION_TEST]:
    PERMISSION_SCOPES
      .ENVIRONMENT,


  // ==========================================================================
  // MONITORING
  // ==========================================================================

  [P.MONITOR_READ]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.MONITOR_MANAGE]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.IDENTITY_PROVIDER_READ]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.IDENTITY_PROVIDER_MANAGE]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.SSO_POLICY_READ]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.SSO_POLICY_MANAGE]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.DOMAIN_READ]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.DOMAIN_MANAGE]:
  PERMISSION_SCOPES
    .ORGANIZATION,

    [P.TENANT_SETTINGS_READ]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.TENANT_SETTINGS_MANAGE]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.AUTONOMY_READ]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.AUTONOMY_MANAGE]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.INTEGRATION_CREDENTIALS_MANAGE]:
  PERMISSION_SCOPES
    .ENVIRONMENT,

[P.INTEGRATION_GOVERNANCE_READ]:
  PERMISSION_SCOPES
    .ENVIRONMENT,

[P.INTEGRATION_GOVERNANCE_MANAGE]:
  PERMISSION_SCOPES
    .ENVIRONMENT,

    [P.NOTIFICATION_ROUTE_READ]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.NOTIFICATION_ROUTE_MANAGE]:
  PERMISSION_SCOPES
    .ORGANIZATION,


[P.HUMAN_TASK_READ]:
  PERMISSION_SCOPES
    .ENVIRONMENT,

[P.HUMAN_TASK_CREATE]:
  PERMISSION_SCOPES
    .ENVIRONMENT,

[P.HUMAN_TASK_ASSIGN]:
  PERMISSION_SCOPES
    .ENVIRONMENT,

[P.HUMAN_TASK_MANAGE]:
  PERMISSION_SCOPES
    .ENVIRONMENT,

[P.HUMAN_TASK_RESOLVE]:
  PERMISSION_SCOPES
    .ENVIRONMENT,

    [P.ONBOARDING_READ]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.ONBOARDING_MANAGE]:
  PERMISSION_SCOPES
    .ORGANIZATION,

    [P.AUDIT_VERIFY]:
  PERMISSION_SCOPES
    .ORGANIZATION,

[P.AUDIT_EXPORT]:
  PERMISSION_SCOPES
    .ORGANIZATION,
  // ==========================================================================
  // INFRASTRUCTURE RESOURCES
  // ==========================================================================

  [P.RESOURCE_READ]:
    PERMISSION_SCOPES
      .ENVIRONMENT,

  [P.RESOURCE_MANAGE]:
    PERMISSION_SCOPES
      .ENVIRONMENT,


  // ==========================================================================
  // PLAYBOOKS
  //
  // Knowledge/control-plane definitions remain organization-scoped.
  // Executions of them are protected separately by execution/recovery
  // permissions and environment scope.
  // ==========================================================================

  [P.PLAYBOOK_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.PLAYBOOK_CREATE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.PLAYBOOK_UPDATE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.PLAYBOOK_PUBLISH]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.PLAYBOOK_DELETE]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // RUNBOOKS
  // ==========================================================================

  [P.RUNBOOK_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.RUNBOOK_CREATE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.RUNBOOK_UPDATE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.RUNBOOK_PUBLISH]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.RUNBOOK_DELETE]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // POLICIES
  // ==========================================================================

  [P.POLICY_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.POLICY_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.POLICY_PUBLISH]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // MACHINE IDENTITY
  // ==========================================================================

  [P.SERVICE_ACCOUNT_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.SERVICE_ACCOUNT_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.API_KEY_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.API_KEY_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // SECURITY / AUDIT
  // ==========================================================================

  [P.AUDIT_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.SECURITY_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.SECURITY_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // BILLING
  // ==========================================================================

  [P.BILLING_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.BILLING_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // KNOWLEDGE / MEMORY
  // ==========================================================================

  [P.KNOWLEDGE_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.KNOWLEDGE_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.MEMORY_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.MEMORY_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // USAGE / ENTITLEMENTS
  // ==========================================================================

  [P.USAGE_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.ENTITLEMENT_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,


  // ==========================================================================
  // NOTIFICATIONS
  // ==========================================================================

  [P.NOTIFICATION_READ]:
    PERMISSION_SCOPES
      .ORGANIZATION,

  [P.NOTIFICATION_MANAGE]:
    PERMISSION_SCOPES
      .ORGANIZATION,
};


const PERMISSION_SCOPE_MAP =
  Object.freeze(
    permissionScopes
  );


function getPermissionScope(
  permission
) {
  return (
    PERMISSION_SCOPE_MAP[
      permission
    ] ||
    null
  );
}


function permissionRequiresEnvironment(
  permission
) {
  return (
    getPermissionScope(
      permission
    ) ===
    PERMISSION_SCOPES
      .ENVIRONMENT
  );
}


module.exports = {
  PERMISSION_SCOPES,
  PERMISSION_SCOPE_MAP,

  getPermissionScope,
  permissionRequiresEnvironment,
};