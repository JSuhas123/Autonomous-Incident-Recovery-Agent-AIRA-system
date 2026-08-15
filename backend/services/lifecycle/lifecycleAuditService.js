"use strict";

/**
 * AIRA Lifecycle Audit Service
 *
 * Phase 10.11
 *
 * Creates immutable lifecycle audit records.
 *
 * Covers:
 *
 * - lifecycle transitions
 * - stability results
 * - retry requests
 * - rollback handoffs
 * - escalations
 * - resolution
 * - closure
 *
 * SAFETY:
 *
 * - append-only intent
 * - does not mutate incidents
 * - does not execute infrastructure actions
 * - does not authorize execution
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
  LIFECYCLE_ACTION,
  LIFECYCLE_EVENT,
} =
  require(
    "./incidentLifecycleContracts"
  );

const AUDIT_EVENT_TYPE =
  Object.freeze({
    STATE_TRANSITION:
      "STATE_TRANSITION",

    STABILITY_RESULT:
      "STABILITY_RESULT",

    RETRY_REQUEST:
      "RETRY_REQUEST",

    ROLLBACK_REQUEST:
      "ROLLBACK_REQUEST",

    ESCALATION:
      "ESCALATION",

    RESOLUTION:
      "RESOLUTION",

    CLOSURE:
      "CLOSURE",

    NOTIFICATION:
      "NOTIFICATION",

    MANUAL_INTERVENTION:
      "MANUAL_INTERVENTION",
  });

class LifecycleAuditService {
  async record(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const record =
      this.buildRecord(
        input
      );

    let persisted =
      false;

    if (
      typeof dependencies
        .appendAuditRecord ===
      "function"
    ) {
      await dependencies
        .appendAuditRecord(
          record
        );

      persisted =
        true;
    }

    return {
      record,

      persisted,

      incidentMutated:
        false,

      executionAuthorized:
        false,
    };
  }

  buildRecord(
    input
  ) {
    const timestamp =
      new Date();

    const payload =
      this.sanitizePayload(
        input.payload ||
        {}
      );

    return Object.freeze({
      auditId:
        this.generateId(
          input
        ),

      organizationId:
        String(
          input.organizationId
        ),

      environmentId:
        String(
          input.environmentId
        ),

      incidentId:
        String(
          input.incidentId
        ),

      eventType:
        input.eventType,

      lifecycleEvent:
        input.lifecycleEvent ||
        null,

      lifecycleAction:
        input.lifecycleAction ||
        null,

      fromState:
        input.fromState ||
        null,

      toState:
        input.toState ||
        null,

      actor:
        Object.freeze({
          type:
            input.actor
              ?.type ||
            "SYSTEM",

          id:
            input.actor
              ?.id ||
            "aira",
        }),

      source:
        Object.freeze({
          phase:
            input.source
              ?.phase ||
            10,

          component:
            input.source
              ?.component ||
            "lifecycle",

          referenceId:
            input.source
              ?.referenceId ||
            null,
        }),

      verificationId:
        input.verificationId ||
        null,

      recoveryDecisionId:
        input.recoveryDecisionId ||
        null,

      executionRequestId:
        input.executionRequestId ||
        null,

      retryRequestId:
        input.retryRequestId ||
        null,

      rollbackRequestId:
        input.rollbackRequestId ||
        null,

      escalationId:
        input.escalationId ||
        null,

      reason:
        input.reason ||
        null,

      payload,

      /*
       * Hash binds important audit fields together.
       * This is not a digital signature, but provides
       * deterministic tamper-evidence for persisted records.
       */
      integrityHash:
        this.generateIntegrityHash({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          eventType:
            input.eventType,

          lifecycleEvent:
            input.lifecycleEvent ||
            null,

          lifecycleAction:
            input.lifecycleAction ||
            null,

          fromState:
            input.fromState ||
            null,

          toState:
            input.toState ||
            null,

          reason:
            input.reason ||
            null,

          payload,

          timestamp:
            timestamp.toISOString(),
        }),

      executionAuthorized:
        false,

      recordedAt:
        timestamp,
    });
  }

  generateIntegrityHash(
    value
  ) {
    return (
      "auditsha256_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          stableStringify(
            value
          )
        )
        .digest(
          "hex"
        )
    );
  }

  generateId(
    input
  ) {
    return (
      "audit_" +
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

  sanitizePayload(
    payload
  ) {
    /*
     * Clone the payload so callers cannot mutate
     * the audit record through shared references.
     */
    let cloned;

    try {
      cloned =
        JSON.parse(
          JSON.stringify(
            payload
          )
        );
    } catch (
      error
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle audit payload is not serializable"
        ),
        {
          code:
            "LIFECYCLE_AUDIT_SERIALIZATION_FAILED",
        }
      );
    }

    /*
     * Remove fields that should never become
     * execution authorization through audit replay.
     */
    stripUnsafeAuthorization(
      cloned
    );

    return deepFreeze(
      cloned
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
          "Lifecycle audit input is required"
        ),
        {
          code:
            "LIFECYCLE_AUDIT_INPUT_REQUIRED",
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
          "Lifecycle audit requires organization, environment and incident scope"
        ),
        {
          code:
            "LIFECYCLE_AUDIT_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !Object.values(
        AUDIT_EVENT_TYPE
      ).includes(
        input.eventType
      )
    ) {
      throw Object.assign(
        new Error(
          "Valid lifecycle audit event type is required"
        ),
        {
          code:
            "LIFECYCLE_AUDIT_EVENT_INVALID",
        }
      );
    }

    if (
      input.fromState &&
      !Object.values(
        INCIDENT_LIFECYCLE_STATE
      ).includes(
        input.fromState
      )
    ) {
      throw Object.assign(
        new Error(
          "Invalid lifecycle audit fromState"
        ),
        {
          code:
            "LIFECYCLE_AUDIT_FROM_STATE_INVALID",
        }
      );
    }

    if (
      input.toState &&
      !Object.values(
        INCIDENT_LIFECYCLE_STATE
      ).includes(
        input.toState
      )
    ) {
      throw Object.assign(
        new Error(
          "Invalid lifecycle audit toState"
        ),
        {
          code:
            "LIFECYCLE_AUDIT_TO_STATE_INVALID",
        }
      );
    }

    if (
      input.lifecycleAction &&
      !Object.values(
        LIFECYCLE_ACTION
      ).includes(
        input.lifecycleAction
      )
    ) {
      throw Object.assign(
        new Error(
          "Invalid lifecycle audit action"
        ),
        {
          code:
            "LIFECYCLE_AUDIT_ACTION_INVALID",
        }
      );
    }

    if (
      input.lifecycleEvent &&
      !Object.values(
        LIFECYCLE_EVENT
      ).includes(
        input.lifecycleEvent
      )
    ) {
      throw Object.assign(
        new Error(
          "Invalid lifecycle audit event"
        ),
        {
          code:
            "LIFECYCLE_AUDIT_LIFECYCLE_EVENT_INVALID",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle audit service cannot authorize execution"
        ),
        {
          code:
            "LIFECYCLE_AUDIT_UNSAFE_INPUT",
        }
      );
    }
  }
}

function stripUnsafeAuthorization(
  value
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return;
  }

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        value,
        "executionAuthorized"
      )
  ) {
    value.executionAuthorized =
      false;
  }

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        value,
        "authorizationGranted"
      )
  ) {
    value.authorizationGranted =
      false;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    for (
      const item
      of value
    ) {
      stripUnsafeAuthorization(
        item
      );
    }

    return;
  }

  for (
    const child
    of Object.values(
      value
    )
  ) {
    stripUnsafeAuthorization(
      child
    );
  }
}

function deepFreeze(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value
    )
  ) {
    return value;
  }

  Object.freeze(
    value
  );

  for (
    const child
    of Object.values(
      value
    )
  ) {
    deepFreeze(
      child
    );
  }

  return value;
}

function stableStringify(
  value
) {
  return JSON.stringify(
    sortObject(
      value
    )
  );
}

function sortObject(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      sortObject
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.keys(
      value
    )
      .sort()
      .reduce(
        (
          result,
          key
        ) => {
          result[key] =
            sortObject(
              value[key]
            );

          return result;
        },
        {}
      );
  }

  return value;
}

module.exports =
  new LifecycleAuditService();

module.exports
  .LifecycleAuditService =
  LifecycleAuditService;

module.exports
  .AUDIT_EVENT_TYPE =
  AUDIT_EVENT_TYPE;