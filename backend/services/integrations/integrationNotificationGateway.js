"use strict";

/**
 * ============================================================================
 * AIRA PHASE 20.12
 * INTEGRATION NOTIFICATION GATEWAY
 * ============================================================================
 *
 * Canonical provider notification boundary.
 *
 * Examples:
 *
 * - Slack
 * - Microsoft Teams
 * - Email
 * - PagerDuty
 * - ServiceNow
 * - outgoing webhook
 *
 * Responsibilities:
 *
 * - validate notification requests;
 * - prevent secret-bearing notification metadata;
 * - route through IntegrationRuntime.sendNotification();
 * - preserve provider provenance;
 * - never grant execution authorization;
 * - never treat notification success as operational recovery success.
 *
 * Notification delivery is an integration side effect, not an execution
 * authorization mechanism.
 * ============================================================================
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  IntegrationRuntime,
} =
  require(
    "./integrationRuntime"
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


const NOTIFICATION_TYPE =
  Object.freeze({
    INCIDENT:
      "INCIDENT",

    APPROVAL_REQUIRED:
      "APPROVAL_REQUIRED",

    EXECUTION_STARTED:
      "EXECUTION_STARTED",

    EXECUTION_SUCCEEDED:
      "EXECUTION_SUCCEEDED",

    EXECUTION_FAILED:
      "EXECUTION_FAILED",

    RECOVERY_VERIFICATION:
      "RECOVERY_VERIFICATION",

    SYSTEM:
      "SYSTEM",

    CUSTOM:
      "CUSTOM",
  });


const MAX_NOTIFICATION_TITLE_LENGTH =
  300;


const MAX_NOTIFICATION_BODY_LENGTH =
  10_000;


class IntegrationNotificationGateway {
  constructor(
    options = {}
  ) {
    this.runtime =
      options.runtime ||
      new IntegrationRuntime(
        options
      );


    this.randomUUID =
      options.randomUUID ||
      (() =>
        crypto.randomUUID());


    this.now =
      options.now ||
      (() =>
        new Date());
  }


  async send({
    organizationId,

    environmentId,

    integrationId,

    provider,

    notification,
  } = {}) {
    requireContext({
      organizationId,

      environmentId,

      integrationId,

      provider,
    });


    const canonical =
      normalizeNotification({
        notification,

        notificationId:
          "ntf_" +
          this.randomUUID(),

        createdAt:
          this.now(),
      });


    const runtimeResult =
      await this.runtime
        .sendNotification(
          {
            organizationId,

            environmentId,

            integrationId,

            provider,

            executionAuthorized:
              false,
          },

          canonical
        );


    if (
      runtimeResult
        ?.executionAuthorized ===
      true
    ) {
      throw notificationError(
        "Notification provider attempted to grant execution authorization",
        "INTEGRATION_NOTIFICATION_AUTHORITY_VIOLATION"
      );
    }


    return {
      notificationId:
        canonical
          .notificationId,

      provider,

      integrationId,

      type:
        canonical.type,

      severity:
        canonical.severity,

      delivered:
        isSuccessfulRuntimeResult(
          runtimeResult
        ),

      providerResult:
        runtimeResult
          ?.data ??
        null,

      provenance: {
        invocationId:
          runtimeResult
            ?.provenance
            ?.invocationId ||
          null,

        provider,

        integrationId,

        createdAt:
          canonical
            .createdAt,

        observedAt:
          runtimeResult
            ?.observedAt ||
          null,

        executionAuthorized:
          false,
      },

      executionAuthorized:
        false,
    };
  }


  async sendIncident(
    context,
    {
      incidentId,

      title,

      message,

      severity =
        NOTIFICATION_SEVERITY
          .HIGH,

      metadata =
        {},
    }
  ) {
    return this.send({
      ...context,

      notification: {
        type:
          NOTIFICATION_TYPE
            .INCIDENT,

        severity,

        title,

        message,

        incidentId,

        metadata,
      },
    });
  }


  async sendApprovalRequired(
    context,
    {
      approvalId,

      incidentId,

      title,

      message,

      metadata =
        {},
    }
  ) {
    return this.send({
      ...context,

      notification: {
        type:
          NOTIFICATION_TYPE
            .APPROVAL_REQUIRED,

        severity:
          NOTIFICATION_SEVERITY
            .HIGH,

        title,

        message,

        approvalId,

        incidentId,

        metadata,
      },
    });
  }


  async sendExecutionResult(
    context,
    {
      executionRequestId,

      success,

      title,

      message,

      metadata =
        {},
    }
  ) {
    return this.send({
      ...context,

      notification: {
        type:
          success ===
          true
            ? NOTIFICATION_TYPE
                .EXECUTION_SUCCEEDED
            : NOTIFICATION_TYPE
                .EXECUTION_FAILED,

        severity:
          success ===
          true
            ? NOTIFICATION_SEVERITY
                .INFO
            : NOTIFICATION_SEVERITY
                .HIGH,

        title,

        message,

        executionRequestId,

        metadata,
      },
    });
  }
}


function normalizeNotification({
  notification,

  notificationId,

  createdAt,
}) {
  if (
    !notification ||
    typeof notification !==
      "object" ||
    Array.isArray(
      notification
    )
  ) {
    throw notificationError(
      "Notification payload is required",
      "INTEGRATION_NOTIFICATION_INVALID"
    );
  }


  const type =
    String(
      notification.type ||
      NOTIFICATION_TYPE
        .CUSTOM
    )
      .trim()
      .toUpperCase();


  if (
    !Object.values(
      NOTIFICATION_TYPE
    )
      .includes(
        type
      )
  ) {
    throw notificationError(
      `Unsupported notification type "${type}"`,
      "INTEGRATION_NOTIFICATION_TYPE_INVALID"
    );
  }


  const severity =
    String(
      notification.severity ||
      NOTIFICATION_SEVERITY
        .INFO
    )
      .trim()
      .toUpperCase();


  if (
    !Object.values(
      NOTIFICATION_SEVERITY
    )
      .includes(
        severity
      )
  ) {
    throw notificationError(
      `Unsupported notification severity "${severity}"`,
      "INTEGRATION_NOTIFICATION_SEVERITY_INVALID"
    );
  }


  const title =
    String(
      notification.title ||
      ""
    )
      .trim();


  const message =
    String(
      notification.message ||
      notification.body ||
      ""
    )
      .trim();


  if (
    !title
  ) {
    throw notificationError(
      "Notification title is required",
      "INTEGRATION_NOTIFICATION_TITLE_REQUIRED"
    );
  }


  if (
    !message
  ) {
    throw notificationError(
      "Notification message is required",
      "INTEGRATION_NOTIFICATION_MESSAGE_REQUIRED"
    );
  }


  if (
    title.length >
    MAX_NOTIFICATION_TITLE_LENGTH
  ) {
    throw notificationError(
      "Notification title exceeds maximum length",
      "INTEGRATION_NOTIFICATION_TITLE_TOO_LARGE"
    );
  }


  if (
    message.length >
    MAX_NOTIFICATION_BODY_LENGTH
  ) {
    throw notificationError(
      "Notification message exceeds maximum length",
      "INTEGRATION_NOTIFICATION_MESSAGE_TOO_LARGE"
    );
  }


  const metadata =
    sanitizeMetadata(
      notification.metadata ||
      {}
    );


  return {
    notificationId,

    type,

    severity,

    title,

    message,

    incidentId:
      nullableString(
        notification.incidentId
      ),

    approvalId:
      nullableString(
        notification.approvalId
      ),

    executionRequestId:
      nullableString(
        notification
          .executionRequestId
      ),

    resourceId:
      nullableString(
        notification.resourceId
      ),

    correlationId:
      nullableString(
        notification.correlationId
      ),

    metadata,

    createdAt:
      createdAt
        instanceof Date
        ? createdAt
            .toISOString()
        : new Date(
            createdAt
          )
            .toISOString(),

    executionAuthorized:
      false,
  };
}


function sanitizeMetadata(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      sanitizeMetadata
    );
  }


  if (
    typeof value !==
      "object"
  ) {
    return value;
  }


  const safe =
    {};


  for (
    const [
      key,
      nestedValue,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      isSensitiveField(
        key
      )
    ) {
      safe[
        key
      ] =
        "[REDACTED]";

      continue;
    }


    safe[
      key
    ] =
      sanitizeMetadata(
        nestedValue
      );
  }


  if (
    Object.prototype
      .hasOwnProperty
      .call(
        safe,
        "executionAuthorized"
      )
  ) {
    safe.executionAuthorized =
      false;
  }


  return safe;
}


function isSensitiveField(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .replace(
        /[-_\s]/g,
        ""
      )
      .toLowerCase();


  return SENSITIVE_FIELDS
    .has(
      normalized
    );
}


const SENSITIVE_FIELDS =
  new Set([
    "password",

    "secret",

    "clientsecret",

    "webhooksecret",

    "signingsecret",

    "token",

    "accesstoken",

    "refreshtoken",

    "apikey",

    "privatekey",

    "credential",

    "credentials",

    "authorization",

    "authorizationheader",

    "authheader",
  ]);


function isSuccessfulRuntimeResult(
  result
) {
  if (
    !result
  ) {
    return false;
  }


  const status =
    String(
      result.status ||
      ""
    )
      .trim()
      .toUpperCase();


  return (
    status ===
      "SUCCESS" ||
    status ===
      "OK" ||
    result.data
      ?.delivered ===
      true ||
    result.data
      ?.success ===
      true
  );
}


function requireContext(
  value
) {
  for (
    const field
    of [
      "organizationId",

      "environmentId",

      "integrationId",

      "provider",
    ]
  ) {
    if (
      !value[
        field
      ]
    ) {
      throw notificationError(
        `${field} is required`,
        "INTEGRATION_NOTIFICATION_CONTEXT_REQUIRED",
        {
          field,
        }
      );
    }
  }
}


function nullableString(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }


  const normalized =
    String(
      value
    )
      .trim();


  return normalized ||
    null;
}


function notificationError(
  message,
  code,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "IntegrationNotificationError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  IntegrationNotificationGateway,

  NOTIFICATION_TYPE,

  NOTIFICATION_SEVERITY,

  MAX_NOTIFICATION_TITLE_LENGTH,

  MAX_NOTIFICATION_BODY_LENGTH,

  normalizeNotification,

  sanitizeMetadata,
};