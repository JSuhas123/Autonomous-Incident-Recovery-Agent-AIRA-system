"use strict";

const {
  PostgresUsageMeterRepository,
} =
  require(
    "../../persistence/postgres/PostgresUsageMeterRepository"
  );

const {
  billingRuntimeCacheService,
} =
  require(
    "./billingRuntimeCacheService"
  );

const {
  BILLING_METER_VALUES,
  isKnownBillingMeter,
} =
  require(
    "../../constants/billingMeters"
  );


/**
 * ============================================================================
 * AIRA PHASE 15 — USAGE METER SERVICE
 * ============================================================================
 *
 * Responsibilities:
 *
 * 1. Validate canonical usage events.
 * 2. Persist usage through PostgreSQL.
 * 3. Preserve financial idempotency.
 * 4. Update Redis quota counters only AFTER PostgreSQL commits.
 *
 * PostgreSQL:
 *   authoritative usage ledger.
 *
 * Redis:
 *   best-effort runtime acceleration only.
 *
 * A Redis failure MUST NEVER cause usage loss.
 * ============================================================================
 */


class UsageMeterService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresUsageMeterRepository(
        options
      );

    this.runtimeCache =
      options.runtimeCache ||
      billingRuntimeCacheService;
  }


  // ==========================================================================
  // ERROR
  // ==========================================================================

  createError(
    message,
    code,
    status = 422,
    metadata = {}
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    error.executionAuthorized =
      false;

    Object.assign(
      error,
      metadata
    );

    return error;
  }


  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  validateQuantity(
    quantity
  ) {
    const normalized =
      Number(
        quantity
      );


    if (
      !Number.isFinite(
        normalized
      ) ||
      normalized <=
        0
    ) {
      throw this.createError(
        "Usage quantity must be a positive finite number",
        "USAGE_QUANTITY_INVALID",
        422,
        {
          quantity,
        }
      );
    }


    return normalized;
  }


  validateIdempotencyKey(
    value
  ) {
    if (
      typeof value !==
        "string" ||
      value.trim().length ===
        0
    ) {
      throw this.createError(
        "Usage idempotency key is required",
        "USAGE_IDEMPOTENCY_KEY_REQUIRED"
      );
    }


    const normalized =
      value.trim();


    if (
      normalized.length >
        512
    ) {
      throw this.createError(
        "Usage idempotency key is too long",
        "USAGE_IDEMPOTENCY_KEY_INVALID",
        422,
        {
          maxLength:
            512,
        }
      );
    }


    return normalized;
  }


  validateSourceType(
    value
  ) {
    if (
      typeof value !==
        "string" ||
      value.trim().length ===
        0
    ) {
      throw this.createError(
        "Usage source type is required",
        "USAGE_SOURCE_TYPE_REQUIRED"
      );
    }


    return value
      .trim();
  }


  validateOccurredAt(
    value
  ) {
    const date =
      value instanceof Date
        ? value
        : new Date(
            value
          );


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      throw this.createError(
        "Usage occurredAt value is invalid",
        "USAGE_OCCURRED_AT_INVALID",
        422,
        {
          occurredAt:
            value,
        }
      );
    }


    return date;
  }


  // ==========================================================================
  // PERIOD
  // ==========================================================================

  resolveQuotaPeriodStart(
    occurredAt
  ) {
    const value =
      this
        .validateOccurredAt(
          occurredAt
        );


    return new Date(
      Date.UTC(
        value
          .getUTCFullYear(),

        value
          .getUTCMonth(),

        1,

        0,
        0,
        0,
        0
      )
    );
  }


  // ==========================================================================
  // RECORD USAGE
  // ==========================================================================

  async record({
    organizationId,

    environmentId =
      null,

    meterCode,

    quantity =
      1,

    idempotencyKey,

    sourceType,

    sourceId =
      null,

    correlationId =
      null,

    incidentId =
      null,

    executionRequestId =
      null,

    recoveryDecisionId =
      null,

    agentRunId =
      null,

    integrationId =
      null,

    occurredAt =
      new Date(),

    metadata =
      {},
  }) {

    // ------------------------------------------------------------------------
    // Organization
    // ------------------------------------------------------------------------

    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization is required for usage metering",
        "USAGE_ORGANIZATION_REQUIRED"
      );
    }


    // ------------------------------------------------------------------------
    // Meter
    // ------------------------------------------------------------------------

    if (
      !isKnownBillingMeter(
        meterCode
      )
    ) {
      throw this.createError(
        "Unknown billing meter",
        "BILLING_METER_UNKNOWN",
        422,
        {
          meterCode,

          knownMeters:
            BILLING_METER_VALUES,
        }
      );
    }


    // ------------------------------------------------------------------------
    // Quantity
    // ------------------------------------------------------------------------

    const normalizedQuantity =
      this
        .validateQuantity(
          quantity
        );


    // ------------------------------------------------------------------------
    // Idempotency
    // ------------------------------------------------------------------------

    const normalizedIdempotencyKey =
      this
        .validateIdempotencyKey(
          idempotencyKey
        );


    // ------------------------------------------------------------------------
    // Source
    // ------------------------------------------------------------------------

    const normalizedSourceType =
      this
        .validateSourceType(
          sourceType
        );


    // ------------------------------------------------------------------------
    // Timestamp
    // ------------------------------------------------------------------------

    const normalizedOccurredAt =
      this
        .validateOccurredAt(
          occurredAt
        );


    // ==========================================================================
    // AUTHORITATIVE WRITE
    //
    // PostgreSQL performs:
    //
    // usage_event INSERT
    //       +
    // billing event_outbox INSERT
    //
    // inside one transaction.
    // ==========================================================================

    const result =
      await this.repository
        .recordUsage({
          organizationId,

          environmentId,

          meterCode,

          quantity:
            normalizedQuantity,

          idempotencyKey:
            normalizedIdempotencyKey,

          sourceType:
            normalizedSourceType,

          sourceId,

          correlationId,

          incidentId,

          executionRequestId,

          recoveryDecisionId,

          agentRunId,

          integrationId,

          occurredAt:
            normalizedOccurredAt,

          metadata:
            metadata &&
            typeof metadata ===
              "object"
              ? metadata
              : {},
        });


    // ==========================================================================
    // REDIS ACCELERATION
    //
    // Only increment Redis for a NEW durable usage event.
    //
    // Duplicate events MUST NOT increment the hot quota counter.
    //
    // Redis failure is intentionally ignored here because PostgreSQL already
    // contains the authoritative financial usage event.
    // ==========================================================================

    if (
      result &&
      result.created ===
        true
    ) {
      const periodStart =
        this
          .resolveQuotaPeriodStart(
            normalizedOccurredAt
          );


      try {
        await this.runtimeCache
          .incrementQuotaUsage(
            {
              organizationId,

              meterCode,

              periodStart,
            },

            normalizedQuantity
          );
      } catch (
        _cacheError
      ) {
        /**
         * Best-effort cache update only.
         *
         * PostgreSQL already committed financial truth.
         *
         * BillingQuotaService will fall back to PostgreSQL and repopulate
         * Redis when needed.
         */
      }
    }


    return result;
  }


  // ==========================================================================
  // IDEMPOTENCY LOOKUP
  // ==========================================================================

  async hasRecorded({
    organizationId,

    meterCode,

    idempotencyKey,
  }) {
    const normalizedIdempotencyKey =
      this
        .validateIdempotencyKey(
          idempotencyKey
        );


    const event =
      await this.repository
        .findByIdempotencyKey({
          organizationId,

          meterCode,

          idempotencyKey:
            normalizedIdempotencyKey,
        });


    return Boolean(
      event
    );
  }


  // ==========================================================================
  // USAGE LIST
  // ==========================================================================

  async list(
    options
  ) {
    return this.repository
      .listUsage(
        options
      );
  }
}


// ============================================================================
// SINGLETON
// ============================================================================

const usageMeterService =
  new UsageMeterService();


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  UsageMeterService,

  usageMeterService,

  recordUsage:
    usageMeterService
      .record
      .bind(
        usageMeterService
      ),
};