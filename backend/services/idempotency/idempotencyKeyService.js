"use strict";

/**
 * AIRA Idempotency Key Service
 *
 * Phase 11.1.3
 *
 * Creates deterministic idempotency keys and request fingerprints.
 *
 * SAFETY:
 *
 * - does not authorize execution
 * - does not persist records
 * - does not claim ownership
 * - keys are deterministic for equivalent logical operations
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  IDEMPOTENCY_OPERATION,
  assertValidIdempotencyOperation,
} =
  require(
    "./idempotencyContracts"
  );

const KEY_VERSION =
  "v1";

class IdempotencyKeyService {
  generate(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const identity =
      this.buildIdentity(
        input
      );

    const digest =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          stableStringify(
            identity
          )
        )
        .digest(
          "hex"
        );

    return {
      idempotencyKey:
        `idem_${KEY_VERSION}_${digest}`,

      operation:
        input.operation,

      identity,

      keyVersion:
        KEY_VERSION,

      executionAuthorized:
        false,
    };
  }

  fingerprint(
    payload
  ) {
    const normalized =
      canonicalize(
        payload ===
          undefined
          ? null
          : payload
      );

    return (
      "fingerprint_sha256_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          JSON.stringify(
            normalized
          )
        )
        .digest(
          "hex"
        )
    );
  }

  buildIdentity(
    input
  ) {
    const base = {
      organizationId:
        String(
          input.organizationId
        ),

      environmentId:
        String(
          input.environmentId
        ),

      operation:
        input.operation,
    };

    switch (
      input.operation
    ) {
      case IDEMPOTENCY_OPERATION
        .RECOVERY_DECISION:
        return {
          ...base,

          incidentId:
            requiredString(
              input.incidentId,
              "incidentId"
            ),

          diagnosisId:
            requiredString(
              input.diagnosisId,
              "diagnosisId"
            ),

          diagnosisRevision:
            normalizeRevision(
              input.diagnosisRevision
            ),
        };

      case IDEMPOTENCY_OPERATION
        .EXECUTION:
        return {
          ...base,

          executionRequestId:
            requiredString(
              input.executionRequestId,
              "executionRequestId"
            ),

          executionPlanId:
            requiredString(
              input.executionPlanId,
              "executionPlanId"
            ),

          executionPlanHash:
            requiredString(
              input.executionPlanHash,
              "executionPlanHash"
            ),
        };

      case IDEMPOTENCY_OPERATION
        .VERIFICATION:
        return {
          ...base,

          executionRequestId:
            requiredString(
              input.executionRequestId,
              "executionRequestId"
            ),

          verificationPlanId:
            requiredString(
              input.verificationPlanId,
              "verificationPlanId"
            ),

          verificationPlanHash:
            requiredString(
              input.verificationPlanHash,
              "verificationPlanHash"
            ),
        };

      case IDEMPOTENCY_OPERATION
        .LIFECYCLE:
        return {
          ...base,

          incidentId:
            requiredString(
              input.incidentId,
              "incidentId"
            ),

          verificationId:
            requiredString(
              input.verificationId,
              "verificationId"
            ),

          lifecycleIntent:
            requiredString(
              input.lifecycleIntent,
              "lifecycleIntent"
            ),
        };

      case IDEMPOTENCY_OPERATION
        .QUEUE_EVENT:
        return {
          ...base,

          eventId:
            requiredString(
              input.eventId,
              "eventId"
            ),

          eventType:
            requiredString(
              input.eventType,
              "eventType"
            ),
        };

      case IDEMPOTENCY_OPERATION
        .WEBHOOK:
        return {
          ...base,

          provider:
            requiredString(
              input.provider,
              "provider"
            ),

          webhookEventId:
            requiredString(
              input.webhookEventId,
              "webhookEventId"
            ),
        };

      default:
        throw Object.assign(
          new Error(
            "Unsupported idempotency operation"
          ),
          {
            code:
              "IDEMPOTENCY_OPERATION_UNSUPPORTED",
          }
        );
    }
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
          "Idempotency key input is required"
        ),
        {
          code:
            "IDEMPOTENCY_KEY_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Idempotency key requires organization and environment scope"
        ),
        {
          code:
            "IDEMPOTENCY_KEY_SCOPE_REQUIRED",
        }
      );
    }

    assertValidIdempotencyOperation(
      input.operation
    );

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Idempotency key service cannot authorize execution"
        ),
        {
          code:
            "IDEMPOTENCY_KEY_UNSAFE_INPUT",
        }
      );
    }
  }
}

function requiredString(
  value,
  field
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    String(
      value
    ).trim() ===
      ""
  ) {
    throw Object.assign(
      new Error(
        `Idempotency identity requires ${field}`
      ),
      {
        code:
          "IDEMPOTENCY_IDENTITY_FIELD_REQUIRED",

        field,
      }
    );
  }

  return String(
    value
  );
}

function normalizeRevision(
  value
) {
  const numeric =
    Number(
      value
    );

  if (
    !Number.isInteger(
      numeric
    ) ||
    numeric <
      0
  ) {
    throw Object.assign(
      new Error(
        "Idempotency identity requires valid diagnosisRevision"
      ),
      {
        code:
          "IDEMPOTENCY_IDENTITY_REVISION_INVALID",
      }
    );
  }

  return numeric;
}

function stableStringify(
  value
) {
  return JSON.stringify(
    canonicalize(
      value
    )
  );
}

function canonicalize(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value ??
      null;
  }

  if (
    value instanceof Date
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
      canonicalize
    );
  }

  if (
    typeof value ===
      "object"
  ) {
    const result =
      {};

    for (
      const key
      of Object.keys(
        value
      )
        .sort()
    ) {
      result[key] =
        canonicalize(
          value[key]
        );
    }

    return result;
  }

  if (
    typeof value ===
      "number"
  ) {
    if (
      !Number.isFinite(
        value
      )
    ) {
      return String(
        value
      );
    }

    return value;
  }

  return value;
}

module.exports =
  new IdempotencyKeyService();

module.exports
  .IdempotencyKeyService =
  IdempotencyKeyService;

module.exports
  .KEY_VERSION =
  KEY_VERSION;