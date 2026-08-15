"use strict";

/**
 * AIRA Lifecycle Notification Service
 *
 * Phase 10.10
 *
 * Normalizes incident lifecycle events into provider-neutral
 * notification payloads.
 *
 * SAFETY:
 *
 * - does not send infrastructure commands
 * - does not mutate incidents
 * - does not authorize execution
 * - provider-specific delivery remains outside this service
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  LIFECYCLE_EVENT,
  INCIDENT_LIFECYCLE_STATE,
} =
  require(
    "./incidentLifecycleContracts"
  );

const NOTIFICATION_SEVERITY =
  Object.freeze({
    CRITICAL:
      "CRITICAL",

    HIGH:
      "HIGH",

    MEDIUM:
      "MEDIUM",

    LOW:
      "LOW",

    INFO:
      "INFO",
  });

class LifecycleNotificationService {
  async notify(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const notification =
      this.buildNotification(
        input
      );

    let delivered =
      false;

    if (
      typeof dependencies
        .publishNotification ===
      "function"
    ) {
      await dependencies
        .publishNotification(
          notification
        );

      delivered =
        true;
    }

    return {
      notification,

      delivered,

      incidentMutated:
        false,

      executionAuthorized:
        false,
    };
  }

  buildNotification(
    input
  ) {
    const severity =
      input.severity ||
      this.resolveSeverity(
        input
      );

    return {
      notificationId:
        this.generateId(
          input
        ),

      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      eventType:
        input.eventType,

      lifecycleState:
        input.lifecycleState ||
        null,

      severity,

      title:
        input.title ||
        this.defaultTitle(
          input
        ),

      message:
        input.message ||
        this.defaultMessage(
          input
        ),

      verificationId:
        input.verificationId ||
        null,

      recoveryDecisionId:
        input.recoveryDecisionId ||
        null,

      executionRequestId:
        input.executionRequestId ||
        null,

      escalationId:
        input.escalationId ||
        null,

      metadata:
        input.metadata ||
        {},

      channels:
        Array.isArray(
          input.channels
        )
          ? input.channels
          : [],

      requiresAcknowledgement:
        severity ===
          NOTIFICATION_SEVERITY
            .CRITICAL ||
        severity ===
          NOTIFICATION_SEVERITY
            .HIGH,

      executionAuthorized:
        false,

      createdAt:
        new Date(),
    };
  }

  resolveSeverity(
    input
  ) {
    switch (
      input.eventType
    ) {
      case LIFECYCLE_EVENT
        .ROLLBACK_REQUESTED:

      case LIFECYCLE_EVENT
        .ESCALATED:

      case LIFECYCLE_EVENT
        .STABILITY_FAILED:
        return NOTIFICATION_SEVERITY
          .CRITICAL;

      case LIFECYCLE_EVENT
        .RETRY_REQUESTED:

      case LIFECYCLE_EVENT
        .MANUAL_INTERVENTION_REQUIRED:
        return NOTIFICATION_SEVERITY
          .HIGH;

      case LIFECYCLE_EVENT
        .VERIFICATION_FAILED:

      case LIFECYCLE_EVENT
        .VERIFICATION_INCONCLUSIVE:
        return NOTIFICATION_SEVERITY
          .MEDIUM;

      case LIFECYCLE_EVENT
        .STABILITY_STARTED:
        return NOTIFICATION_SEVERITY
          .LOW;

      default:
        return NOTIFICATION_SEVERITY
          .INFO;
    }
  }

  defaultTitle(
    input
  ) {
    switch (
      input.eventType
    ) {
      case LIFECYCLE_EVENT
        .INCIDENT_CLOSED:
        return "Incident closed";

      case LIFECYCLE_EVENT
        .INCIDENT_RESOLVED:
        return "Incident resolved";

      case LIFECYCLE_EVENT
        .INCIDENT_REOPENED:
        return "Incident regressed";

      case LIFECYCLE_EVENT
        .RETRY_REQUESTED:
        return "Recovery retry requested";

      case LIFECYCLE_EVENT
        .ROLLBACK_REQUESTED:
        return "Rollback requested";

      case LIFECYCLE_EVENT
        .ESCALATED:
        return "Incident escalated";

      case LIFECYCLE_EVENT
        .STABILITY_STARTED:
        return "Stability observation started";

      case LIFECYCLE_EVENT
        .STABILITY_PASSED:
        return "Recovery stability confirmed";

      case LIFECYCLE_EVENT
        .STABILITY_FAILED:
        return "Recovery regression detected";

      default:
        return "AIRA lifecycle update";
    }
  }

  defaultMessage(
    input
  ) {
    const state =
      input.lifecycleState ||
      "UNKNOWN";

    return (
      `Incident ${input.incidentId} lifecycle event ` +
      `${input.eventType} occurred. Current state: ${state}.`
    );
  }

  generateId(
    input
  ) {
    return (
      "notification_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            input.organizationId,
            input.environmentId,
            input.incidentId,
            input.eventType,
            Date.now(),
            crypto.randomUUID(),
          ]
            .join(
              ":"
            )
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          24
        )
    );
  }

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object" ||
      Object.keys(
        input
      ).length ===
        0
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle notification input is required"
        ),
        {
          code:
            "LIFECYCLE_NOTIFICATION_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId ||
      !input.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle notification requires organization, environment and incident scope"
        ),
        {
          code:
            "LIFECYCLE_NOTIFICATION_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !Object.values(
        LIFECYCLE_EVENT
      ).includes(
        input.eventType
      )
    ) {
      throw Object.assign(
        new Error(
          "Valid lifecycle event is required"
        ),
        {
          code:
            "LIFECYCLE_NOTIFICATION_EVENT_INVALID",
        }
      );
    }

    if (
      input.lifecycleState &&
      !Object.values(
        INCIDENT_LIFECYCLE_STATE
      ).includes(
        input.lifecycleState
      )
    ) {
      throw Object.assign(
        new Error(
          "Invalid lifecycle state"
        ),
        {
          code:
            "LIFECYCLE_NOTIFICATION_STATE_INVALID",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle notification service cannot authorize execution"
        ),
        {
          code:
            "LIFECYCLE_NOTIFICATION_UNSAFE_INPUT",
        }
      );
    }
  }
}

module.exports =
  new LifecycleNotificationService();

module.exports
  .LifecycleNotificationService =
  LifecycleNotificationService;

module.exports
  .NOTIFICATION_SEVERITY =
  NOTIFICATION_SEVERITY;