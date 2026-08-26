"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14.5
 * DEFAULT ROLE -> PERMISSION BUNDLES
 * ============================================================================
 *
 * Roles are not authorization decisions.
 *
 * Roles are default bundles of canonical permissions.
 *
 * Existing Phase 14 API is preserved:
 *
 *   ROLE_PERMISSIONS
 *   getPermissionsForRole()
 *
 * Phase 14.5 aliases:
 *
 *   ROLE_PERMISSION_BUNDLES
 *   permissionsForRole()
 *
 * Separation-of-duty invariants:
 *
 * Developer:
 *   execution.execute = YES
 *   execution.approve = NO
 *
 * Security Analyst:
 *   execution.approve = YES
 *   execution.execute = NO
 *
 * Platform Engineer:
 *   environment.manage  = YES
 *   environment.archive = NO
 *
 * Viewer:
 *   read-only
 * ============================================================================
 */

const {
  ORGANIZATION_ROLES,
} =
  require(
    "./roles"
  );


const {
  PERMISSIONS:
    P,

  PERMISSION_VALUES,
} =
  require(
    "./permissions"
  );


// ============================================================================
// HELPERS
// ============================================================================

function frozenUnique(
  permissions
) {
  return Object.freeze(
    [
      ...new Set(
        permissions
      ),
    ]
  );
}


// ============================================================================
// ROLE BUNDLES
// ============================================================================

const rolePermissions = {

  // ==========================================================================
  // OWNER
  // ==========================================================================

  [ORGANIZATION_ROLES.OWNER]:
    frozenUnique(
      PERMISSION_VALUES
    ),


  // ==========================================================================
  // ADMIN
  // ==========================================================================

  [ORGANIZATION_ROLES.ADMIN]:
    frozenUnique([
      P.ORGANIZATION_READ,
      P.ORGANIZATION_MANAGE,
      P.ORGANIZATION_SETTINGS_MANAGE,
P.NOTIFICATION_ROUTE_READ,
P.NOTIFICATION_ROUTE_MANAGE,
P.ONBOARDING_READ,
P.ONBOARDING_MANAGE,
P.HUMAN_TASK_READ,
P.HUMAN_TASK_CREATE,
P.HUMAN_TASK_ASSIGN,
P.HUMAN_TASK_MANAGE,
P.HUMAN_TASK_RESOLVE,
      P.MEMBER_READ,
      P.MEMBER_INVITE,
      P.MEMBER_MANAGE,
      P.MEMBER_ROLE_MANAGE,
      

      P.TEAM_READ,
      P.TEAM_MANAGE,

      P.ENVIRONMENT_READ,
      P.ENVIRONMENT_CREATE,
      P.ENVIRONMENT_MANAGE,
      P.ENVIRONMENT_ARCHIVE,
      P.ENVIRONMENT_DELETE,

      P.INCIDENT_READ,
      P.INCIDENT_MANAGE,
      P.INCIDENT_ACKNOWLEDGE,
      P.INCIDENT_ASSIGN,

      P.EXECUTION_READ,
      P.EXECUTION_EXECUTE,
      P.EXECUTION_APPROVE,
      P.EXECUTION_CANCEL,

      P.RECOVERY_READ,
      P.RECOVERY_EXECUTE,
      P.RECOVERY_ROLLBACK,

      P.PLAYBOOK_READ,
      P.PLAYBOOK_CREATE,
      P.PLAYBOOK_UPDATE,
      P.PLAYBOOK_PUBLISH,
      P.PLAYBOOK_DELETE,

      P.RUNBOOK_READ,
      P.RUNBOOK_CREATE,
      P.RUNBOOK_UPDATE,
      P.RUNBOOK_PUBLISH,
      P.RUNBOOK_DELETE,

      P.POLICY_READ,
      P.POLICY_MANAGE,
      P.POLICY_PUBLISH,

      P.INTEGRATION_READ,
      P.INTEGRATION_MANAGE,
      P.INTEGRATION_TEST,
      
      P.TENANT_SETTINGS_READ,
P.TENANT_SETTINGS_MANAGE,

P.AUTONOMY_READ,
P.AUTONOMY_MANAGE,

P.INTEGRATION_CREDENTIALS_MANAGE,
P.INTEGRATION_GOVERNANCE_READ,
P.INTEGRATION_GOVERNANCE_MANAGE,
      P.SERVICE_ACCOUNT_READ,
      P.SERVICE_ACCOUNT_MANAGE,

      P.API_KEY_READ,
      P.API_KEY_MANAGE,

      P.AUDIT_READ,
      P.IDENTITY_PROVIDER_READ,
P.IDENTITY_PROVIDER_MANAGE,

P.SSO_POLICY_READ,
P.SSO_POLICY_MANAGE,

P.DOMAIN_READ,
P.DOMAIN_MANAGE,
      P.SECURITY_READ,
      P.SECURITY_MANAGE,

      P.BILLING_READ,

      P.KNOWLEDGE_READ,
      P.KNOWLEDGE_MANAGE,

      P.MEMORY_READ,
      P.MEMORY_MANAGE,

      P.MONITOR_READ,
      P.MONITOR_MANAGE,

      P.RESOURCE_READ,
      P.RESOURCE_MANAGE,

      P.USAGE_READ,
      P.ENTITLEMENT_READ,

      P.NOTIFICATION_READ,
      P.NOTIFICATION_MANAGE,
    ]),


  // ==========================================================================
  // PLATFORM ENGINEER
  // ==========================================================================

  [ORGANIZATION_ROLES.PLATFORM_ENGINEER]:
    frozenUnique([
      P.ORGANIZATION_READ,

      P.MEMBER_READ,

      P.TEAM_READ,

      P.ENVIRONMENT_READ,
      P.ENVIRONMENT_MANAGE,
P.NOTIFICATION_ROUTE_READ,

P.HUMAN_TASK_READ,
P.HUMAN_TASK_CREATE,
P.HUMAN_TASK_ASSIGN,
P.HUMAN_TASK_MANAGE,
P.HUMAN_TASK_RESOLVE,
      /**
       * Deliberately NO ENVIRONMENT_ARCHIVE.
       */
P.ONBOARDING_READ,
P.ONBOARDING_MANAGE,
      P.INCIDENT_READ,
      P.INCIDENT_MANAGE,
      P.INCIDENT_ACKNOWLEDGE,
      P.INCIDENT_ASSIGN,

      P.EXECUTION_READ,
      P.EXECUTION_EXECUTE,

      P.RECOVERY_READ,
      P.RECOVERY_EXECUTE,
      P.RECOVERY_ROLLBACK,
      P.TENANT_SETTINGS_READ,
P.AUTONOMY_READ,

P.INTEGRATION_CREDENTIALS_MANAGE,
P.INTEGRATION_GOVERNANCE_READ,
P.INTEGRATION_GOVERNANCE_MANAGE,
      P.PLAYBOOK_READ,
      P.PLAYBOOK_CREATE,
      P.PLAYBOOK_UPDATE,

      P.RUNBOOK_READ,
      P.RUNBOOK_CREATE,
      P.RUNBOOK_UPDATE,

      P.POLICY_READ,

      P.INTEGRATION_READ,
      P.INTEGRATION_MANAGE,
      P.INTEGRATION_TEST,

      P.MONITOR_READ,
      P.MONITOR_MANAGE,

      P.RESOURCE_READ,
      P.RESOURCE_MANAGE,

      P.KNOWLEDGE_READ,

      P.NOTIFICATION_READ,
    ]),


  // ==========================================================================
  // DEVELOPER
  //
  // May initiate/request execution.
  // Cannot approve privileged execution.
  // ==========================================================================

  [ORGANIZATION_ROLES.DEVELOPER]:
    frozenUnique([
      P.ORGANIZATION_READ,

      P.MEMBER_READ,
P.HUMAN_TASK_READ,
      P.TEAM_READ,

      P.ENVIRONMENT_READ,

      P.INCIDENT_READ,
      P.INCIDENT_ACKNOWLEDGE,

      P.EXECUTION_READ,
      P.EXECUTION_EXECUTE,

      /**
       * Deliberately NO EXECUTION_APPROVE.
       */

      P.RECOVERY_READ,

      P.PLAYBOOK_READ,

      P.RUNBOOK_READ,

      P.POLICY_READ,

      P.INTEGRATION_READ,

      P.MONITOR_READ,

      P.RESOURCE_READ,

      P.KNOWLEDGE_READ,

      P.NOTIFICATION_READ,
    ]),


  // ==========================================================================
  // SECURITY ANALYST
  //
  // Can approve.
  // Cannot initiate execution.
  // ==========================================================================

  [ORGANIZATION_ROLES.SECURITY_ANALYST]:
    frozenUnique([
      P.ORGANIZATION_READ,

      P.MEMBER_READ,

      P.TEAM_READ,

      P.ENVIRONMENT_READ,

      P.INCIDENT_READ,

      P.EXECUTION_READ,
      P.EXECUTION_APPROVE,
      P.IDENTITY_PROVIDER_READ,
P.AUDIT_VERIFY,
P.AUDIT_EXPORT,
P.SSO_POLICY_READ,
P.ONBOARDING_READ,
P.DOMAIN_READ,
P.NOTIFICATION_ROUTE_READ,

P.HUMAN_TASK_READ,
P.HUMAN_TASK_CREATE,
P.HUMAN_TASK_ASSIGN,
P.HUMAN_TASK_MANAGE,
P.HUMAN_TASK_RESOLVE,
      /**
       * Deliberately NO EXECUTION_EXECUTE.
       */

      P.RECOVERY_READ,

      P.PLAYBOOK_READ,

      P.RUNBOOK_READ,

      P.POLICY_READ,
      P.POLICY_MANAGE,
      P.TENANT_SETTINGS_READ,
P.AUTONOMY_READ,
P.AUTONOMY_MANAGE,

P.INTEGRATION_GOVERNANCE_READ,
      P.INTEGRATION_READ,

      P.SERVICE_ACCOUNT_READ,

      P.API_KEY_READ,

      P.AUDIT_READ,

      P.SECURITY_READ,
      P.SECURITY_MANAGE,

      P.MONITOR_READ,

      P.RESOURCE_READ,
    ]),


  // ==========================================================================
  // AUDITOR
  // ==========================================================================

  [ORGANIZATION_ROLES.AUDITOR]:
    frozenUnique([
      P.ORGANIZATION_READ,

      P.MEMBER_READ,

      P.TEAM_READ,

      P.ENVIRONMENT_READ,
P.NOTIFICATION_ROUTE_READ,
P.HUMAN_TASK_READ,
      P.INCIDENT_READ,
P.AUDIT_VERIFY,
P.AUDIT_EXPORT,
      P.EXECUTION_READ,

      P.RECOVERY_READ,

      P.PLAYBOOK_READ,

      P.RUNBOOK_READ,
P.ONBOARDING_READ,
      P.POLICY_READ,
      P.IDENTITY_PROVIDER_READ,

P.SSO_POLICY_READ,

P.DOMAIN_READ,
      P.INTEGRATION_READ,

      P.TENANT_SETTINGS_READ,
P.AUTONOMY_READ,

P.INTEGRATION_GOVERNANCE_READ,
      P.SERVICE_ACCOUNT_READ,

      P.API_KEY_READ,

      P.AUDIT_READ,

      P.SECURITY_READ,

      P.BILLING_READ,

      P.USAGE_READ,

      P.ENTITLEMENT_READ,

      P.MONITOR_READ,

      P.RESOURCE_READ,

      P.KNOWLEDGE_READ,

      P.NOTIFICATION_READ,
    ]),


  // ==========================================================================
  // VIEWER
  //
  // Strict read-only role.
  // ==========================================================================

  [ORGANIZATION_ROLES.VIEWER]:
    frozenUnique([
      P.ORGANIZATION_READ,

      P.MEMBER_READ,

      P.TEAM_READ,
P.HUMAN_TASK_READ,
      P.ENVIRONMENT_READ,

      P.INCIDENT_READ,

      P.EXECUTION_READ,
P.ONBOARDING_READ,
      P.RECOVERY_READ,
P.TENANT_SETTINGS_READ,
P.AUTONOMY_READ,
      P.PLAYBOOK_READ,

      P.RUNBOOK_READ,

      P.POLICY_READ,

      P.INTEGRATION_READ,

      P.MONITOR_READ,

      P.RESOURCE_READ,

      P.KNOWLEDGE_READ,

      P.NOTIFICATION_READ,
    ]),
};


// ============================================================================
// OPTIONAL BILLING ADMIN
//
// Only add this role when constants/roles.js already defines it.
// ============================================================================

if (
  ORGANIZATION_ROLES
    .BILLING_ADMIN
) {
  rolePermissions[
    ORGANIZATION_ROLES
      .BILLING_ADMIN
  ] =
    frozenUnique([
      P.ORGANIZATION_READ,

      P.BILLING_READ,
      P.BILLING_MANAGE,
P.AUDIT_VERIFY,
P.AUDIT_EXPORT,
      P.USAGE_READ,

      P.ENTITLEMENT_READ,
    ]);
}


// ============================================================================
// FREEZE REGISTRY
// ============================================================================

const ROLE_PERMISSIONS =
  Object.freeze(
    rolePermissions
  );


const ROLE_PERMISSION_BUNDLES =
  ROLE_PERMISSIONS;


// ============================================================================
// RESOLUTION
// ============================================================================

function getPermissionsForRole(
  role
) {
  if (
    typeof role !==
      "string"
  ) {
    return [];
  }

  const normalizedRole =
    role
      .trim()
      .toLowerCase();

  const permissions =
    ROLE_PERMISSIONS[
      normalizedRole
    ];

  if (
    !Array.isArray(
      permissions
    )
  ) {
    return [];
  }

  return [
    ...permissions,
  ];
}


function permissionsForRole(
  role
) {
  return getPermissionsForRole(
    role
  );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ROLE_PERMISSIONS,

  ROLE_PERMISSION_BUNDLES,

  getPermissionsForRole,

  permissionsForRole,
};