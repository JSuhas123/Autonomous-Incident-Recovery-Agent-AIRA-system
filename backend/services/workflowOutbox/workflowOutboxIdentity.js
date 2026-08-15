"use strict";

const crypto =
  require(
    "crypto"
  );

const {
  OUTBOX_ERROR_CODE,
  isKnownOutboxEventType,
  isKnownOutboxAggregateType,
  assertNoExecutionAuthority,
} =
  require(
    "./workflowOutboxContracts"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.3
 * WORKFLOW OUTBOX IDENTITY
 * ============================================================================
 *
 * Responsibilities:
 *
 * 1. Build deterministic logical event keys.
 * 2. Build deterministic payload fingerprints.
 * 3. Detect conflicting reuse of an existing logical event identity.
 * 4. Reject payloads that attempt to manufacture execution authority.
 *
 * IMPORTANT:
 *
 * eventKey identifies:
 *
 *      "Which logical workflow handoff is this?"
 *
 * payloadFingerprint identifies:
 *
 *      "What exact immutable meaning did that handoff contain?"
 *
 * The same eventKey must never silently represent two different payloads.
 * ============================================================================
 */

class WorkflowOutboxIdentity {
  // ==========================================================================
  // EVENT KEY
  // ==========================================================================

  buildEventKey({
    organizationId,
    environmentId,
    aggregateType,
    aggregateId,
    eventType,
    transitionId = null,
  } = {}) {
    this.assertIdentityInput({
      organizationId,
      environmentId,
      aggregateType,
      aggregateId,
      eventType,
    });

    const parts = [
      this.normalizeKeyPart(
        organizationId
      ),

      this.normalizeKeyPart(
        environmentId
      ),

      this.normalizeKeyPart(
        aggregateType
      ),

      this.normalizeKeyPart(
        aggregateId
      ),

      this.normalizeKeyPart(
        eventType
      ),
    ];

    if (
      transitionId !==
        null &&
      transitionId !==
        undefined &&
      String(
        transitionId
      ).trim()
    ) {
      parts.push(
        this.normalizeKeyPart(
          transitionId
        )
      );
    }

    return parts.join(
      ":"
    );
  }

  // ==========================================================================
  // EVENT ID
  // ==========================================================================

  buildEventId(
    identity = {}
  ) {
    const eventKey =
      this.buildEventKey(
        identity
      );

    const digest =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          eventKey,
          "utf8"
        )
        .digest(
          "hex"
        );

    return [
      "outbox",
      digest.slice(
        0,
        32
      ),
    ].join(
      "-"
    );
  }

  // ==========================================================================
  // PAYLOAD FINGERPRINT
  // ==========================================================================

  fingerprintPayload(
    payload = {}
  ) {
    assertNoExecutionAuthority(
      payload
    );

    const canonical =
      this.canonicalize(
        payload
      );

    return crypto
      .createHash(
        "sha256"
      )
      .update(
        canonical,
        "utf8"
      )
      .digest(
        "hex"
      );
  }

  // ==========================================================================
  // COMPLETE IDENTITY
  // ==========================================================================

  createIdentity({
    organizationId,
    environmentId,
    aggregateType,
    aggregateId,
    eventType,
    transitionId = null,
    payload = {},
  } = {}) {
    assertNoExecutionAuthority(
      payload
    );

    const eventKey =
      this.buildEventKey({
        organizationId,
        environmentId,
        aggregateType,
        aggregateId,
        eventType,
        transitionId,
      });

    const eventId =
      this.buildEventId({
        organizationId,
        environmentId,
        aggregateType,
        aggregateId,
        eventType,
        transitionId,
      });

    const payloadFingerprint =
      this.fingerprintPayload(
        payload
      );

    return {
      eventId,
      eventKey,
      payloadFingerprint,
    };
  }

  // ==========================================================================
  // CONFLICT CHECK
  // ==========================================================================

  assertCompatibleExistingEvent({
    existingEvent,
    expectedIdentity,
  } = {}) {
    if (
      !existingEvent
    ) {
      return true;
    }

    if (
      !expectedIdentity ||
      typeof expectedIdentity !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Expected outbox identity is required"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_REQUIRED,
        }
      );
    }

    if (
      existingEvent.eventKey !==
      expectedIdentity.eventKey
    ) {
      throw Object.assign(
        new Error(
          "Existing outbox event key does not match expected identity"
        ),
        {
          code:
            "OUTBOX_EVENT_IDENTITY_CONFLICT",

          existingEventKey:
            existingEvent.eventKey,

          expectedEventKey:
            expectedIdentity.eventKey,
        }
      );
    }

    if (
      existingEvent.eventId !==
      expectedIdentity.eventId
    ) {
      throw Object.assign(
        new Error(
          "Existing outbox event id does not match deterministic identity"
        ),
        {
          code:
            "OUTBOX_EVENT_IDENTITY_CONFLICT",

          existingEventId:
            existingEvent.eventId,

          expectedEventId:
            expectedIdentity.eventId,
        }
      );
    }

    const existingFingerprint =
      existingEvent
        .payloadFingerprint ||
      this.fingerprintPayload(
        existingEvent.payload ||
          {}
      );

    if (
      existingFingerprint !==
      expectedIdentity
        .payloadFingerprint
    ) {
      throw Object.assign(
        new Error(
          "Outbox event identity was reused with a different payload"
        ),
        {
          code:
            "OUTBOX_EVENT_PAYLOAD_CONFLICT",

          eventKey:
            expectedIdentity
              .eventKey,

          existingFingerprint,

          expectedFingerprint:
            expectedIdentity
              .payloadFingerprint,
        }
      );
    }

    return true;
  }

  // ==========================================================================
  // IDENTITY INPUT VALIDATION
  // ==========================================================================

  assertIdentityInput({
    organizationId,
    environmentId,
    aggregateType,
    aggregateId,
    eventType,
  } = {}) {
    if (
      !organizationId ||
      !environmentId
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox identity requires tenant scope"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .TENANT_SCOPE_REQUIRED,
        }
      );
    }

    if (
      !aggregateType ||
      !aggregateId
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox identity requires aggregate identity"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .AGGREGATE_REQUIRED,
        }
      );
    }

    if (
      !isKnownOutboxAggregateType(
        aggregateType
      )
    ) {
      throw Object.assign(
        new Error(
          `Unknown workflow outbox aggregate type: ${aggregateType}`
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .AGGREGATE_REQUIRED,

          aggregateType,
        }
      );
    }

    if (
      !eventType
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox identity requires event type"
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_TYPE_REQUIRED,
        }
      );
    }

    if (
      !isKnownOutboxEventType(
        eventType
      )
    ) {
      throw Object.assign(
        new Error(
          `Unknown workflow outbox event type: ${eventType}`
        ),
        {
          code:
            OUTBOX_ERROR_CODE
              .EVENT_TYPE_REQUIRED,

          eventType,
        }
      );
    }

    return true;
  }

  // ==========================================================================
  // CANONICALIZATION
  // ==========================================================================

  canonicalize(
    value
  ) {
    return JSON.stringify(
      this.sortValue(
        value
      )
    );
  }

  sortValue(
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
      value instanceof
      Date
    ) {
      return value
        .toISOString();
    }

    if (
      Array.isArray(
        value
      )
    ) {
      return value.map(
        (
          item
        ) =>
          this.sortValue(
            item
          )
      );
    }

    if (
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
              this.sortValue(
                value[key]
              );

            return result;
          },
          {}
        );
    }

    return value;
  }

  // ==========================================================================
  // KEY NORMALIZATION
  // ==========================================================================

  normalizeKeyPart(
    value
  ) {
    return String(
      value
    )
      .trim()
      .replace(
        /\s+/g,
        "_"
      )
      .replace(
        /:/g,
        "_"
      );
  }
}

module.exports =
  new WorkflowOutboxIdentity();

module.exports
  .WorkflowOutboxIdentity =
  WorkflowOutboxIdentity;