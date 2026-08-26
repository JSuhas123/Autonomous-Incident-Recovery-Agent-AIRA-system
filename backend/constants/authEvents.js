"use strict";

const AUTH_EVENT_TYPES = {
  REGISTRATION_SUCCEEDED: "registration_succeeded",
  REGISTRATION_FAILED: "registration_failed",
  LOGIN_SUCCEEDED: "login_succeeded",
  LOGIN_FAILED: "login_failed",
  LOGOUT: "logout",
  SESSION_CREATED: "session_created",
  SESSION_REVOKED: "session_revoked",
  EMAIL_VERIFIED: "email_verified",
  PASSWORD_RESET_REQUESTED: "password_reset_requested",
  PASSWORD_CHANGED: "password_changed",
  ACCOUNT_LOCKED: "account_locked",
  PERMISSION_DENIED: "permission_denied",
  SERVICE_CREATED: "service_created",
  SERVICE_UPDATED: "service_updated",
  SERVICE_PAUSED: "service_paused",
  SERVICE_RESTORED: "service_restored",
  SERVICE_ARCHIVED: "service_archived",
  VERIFICATION_CHALLENGE_CREATED: "verification_challenge_created",
  VERIFICATION_SUCCEEDED: "verification_succeeded",
  VERIFICATION_FAILED: "verification_failed",
  VERIFICATION_REGENERATED: "verification_regenerated",
  MONITOR_CREATED: "monitor_created",
  MONITOR_UPDATED: "monitor_updated",
  MONITOR_DELETED: "monitor_deleted",
  MONITOR_PAUSED: "monitor_paused",
  MONITOR_RESUMED: "monitor_resumed",
  INCIDENT_OPENED: "incident_opened",
  INCIDENT_ACKNOWLEDGED: "incident_acknowledged",
  INCIDENT_RESOLVED: "incident_resolved",
  INCIDENT_REOPENED: "incident_reopened",
  INCIDENT_ASSIGNED: "incident_assigned",
  INCIDENT_CLOSED: "incident_closed",

  // Phase 6 — Integration connections
  INTEGRATION_CREATED:        "integration_created",
  INTEGRATION_UPDATED:        "integration_updated",
  INTEGRATION_DISABLED:       "integration_disabled",
  INTEGRATION_DELETED:        "integration_deleted",
  INTEGRATION_SECRET_ROTATED: "integration_secret_rotated",
  INTEGRATION_TEST_RUN:       "integration_test_run",

  // Phase 14.10 — Notification routing
NOTIFICATION_CHANNEL_CREATED:
  "notification_channel_created",

NOTIFICATION_CHANNEL_UPDATED:
  "notification_channel_updated",

NOTIFICATION_RULE_CREATED:
  "notification_rule_created",

NOTIFICATION_RULE_UPDATED:
  "notification_rule_updated",

NOTIFICATION_DELIVERED:
  "notification_delivered",

NOTIFICATION_DELIVERY_FAILED:
  "notification_delivery_failed",


// Phase 14.11 — Human operations
HUMAN_TASK_CREATED:
  "human_task_created",

HUMAN_TASK_ASSIGNED:
  "human_task_assigned",

HUMAN_TASK_ACKNOWLEDGED:
  "human_task_acknowledged",

HUMAN_TASK_RESOLVED:
  "human_task_resolved",

HUMAN_TASK_CANCELLED:
  "human_task_cancelled",

HUMAN_TASK_ESCALATED:
  "human_task_escalated",
  // Phase 14.12 — SaaS onboarding
ONBOARDING_STARTED:
  "onboarding_started",

ONBOARDING_STEP_COMPLETED:
  "onboarding_step_completed",

ONBOARDING_STEP_SKIPPED:
  "onboarding_step_skipped",

ONBOARDING_COMPLETED:
  "onboarding_completed",
  // Phase 14.13 — Audit completeness
AUDIT_INTEGRITY_VERIFIED:
  "audit_integrity_verified",

AUDIT_INTEGRITY_FAILED:
  "audit_integrity_failed",

AUDIT_CERTIFICATION_RUN:
  "audit_certification_run",

AUDIT_EXPORT_CREATED:
  "audit_export_created",
};

const AUTH_EVENT_TYPE_VALUES = Object.values(AUTH_EVENT_TYPES);

const AUTH_EVENT_OUTCOMES = {
  SUCCESS: "success",
  FAILURE: "failure",
  DENIED: "denied",
};

const AUTH_EVENT_OUTCOME_VALUES = Object.values(AUTH_EVENT_OUTCOMES);

module.exports = {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_TYPE_VALUES,
  AUTH_EVENT_OUTCOMES,
  AUTH_EVENT_OUTCOME_VALUES,
};
