"use strict";


/*
 * ============================================================================
 * AIRA PHASE 23.3
 * HUMAN ESCALATION NOTIFICATION DOMAIN
 * ============================================================================
 *
 * Notification is transport.
 *
 * It does NOT grant:
 *
 * - execution authorization
 * - approval
 * - human control
 * - takeover
 *
 * ============================================================================
 */


const HUMAN_NOTIFICATION_STATUS =
  Object.freeze({
    PENDING_OUTBOX:
      "PENDING_OUTBOX",

    QUEUED:
      "QUEUED",

    DELIVERING:
      "DELIVERING",

    DELIVERED:
      "DELIVERED",

    FAILED:
      "FAILED",

    DEAD_LETTER:
      "DEAD_LETTER",

    CANCELLED:
      "CANCELLED",
  });


const HUMAN_NOTIFICATION_ATTEMPT_STATUS =
  Object.freeze({
    STARTED:
      "STARTED",

    DELIVERED:
      "DELIVERED",

    FAILED:
      "FAILED",

    SKIPPED:
      "SKIPPED",
  });


const HUMAN_NOTIFICATION_EVENT_TYPE =
  Object.freeze({
    HUMAN_ESCALATION_REQUIRED:
      "HUMAN_ESCALATION_REQUIRED",

    HUMAN_ESCALATION_RETRY:
      "HUMAN_ESCALATION_RETRY",

    HUMAN_ESCALATION_EXHAUSTED:
      "HUMAN_ESCALATION_EXHAUSTED",
  });


const HUMAN_NOTIFICATION_INVARIANTS =
  Object.freeze({
    NEVER_AUTHORIZES_EXECUTION:
      true,

    NOTIFICATION_IS_NOT_CONTROL:
      true,

    NOTIFICATION_IS_NOT_ACKNOWLEDGEMENT:
      true,

    OUTBOX_IS_DURABLE_INTENT:
      true,

    RABBITMQ_IS_TRANSPORT:
      true,

    POSTGRES_IS_NOTIFICATION_STATE_AUTHORITY:
      true,
  });


module.exports = {
  HUMAN_NOTIFICATION_STATUS,

  HUMAN_NOTIFICATION_ATTEMPT_STATUS,

  HUMAN_NOTIFICATION_EVENT_TYPE,

  HUMAN_NOTIFICATION_INVARIANTS,
};