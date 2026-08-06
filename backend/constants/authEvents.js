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
