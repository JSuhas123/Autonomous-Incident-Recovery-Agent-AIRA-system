"use strict";

const EntitlementService =
  require(
    "../core/entitlementService"
  );

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


class BillingQuotaService {

  constructor(
    options = {}
  ) {
    this.usageRepository =
      options.usageRepository ||
      new PostgresUsageMeterRepository(
        options
      );
  }


  createError(
    message,
    code,
    status = 403,
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


  resolveDefaultPeriod(
    date =
      new Date()
  ) {
    const value =
      new Date(
        date
      );


    const periodStart =
      new Date(
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


    const periodEnd =
      new Date(
        Date.UTC(
          value
            .getUTCFullYear(),

          value
            .getUTCMonth() +
            1,

          1,
          0,
          0,
          0,
          0
        )
      );


    return {
      periodStart,
      periodEnd,
    };
  }


  async resolveBillingPeriod(
    organizationId,
    date =
      new Date()
  ) {
    const subscription =
      await EntitlementService
        .getSubscription(
          organizationId
        );


    if (
      subscription
        ?.currentPeriodStartedAt &&
      subscription
        ?.currentPeriodEndsAt
    ) {
      return {
        periodStart:
          new Date(
            subscription
              .currentPeriodStartedAt
          ),

        periodEnd:
          new Date(
            subscription
              .currentPeriodEndsAt
          ),
      };
    }


    return this
      .resolveDefaultPeriod(
        date
      );
  }


  async getUsage({
    organizationId,
    meterCode,
    periodStart,
    periodEnd,
  }) {
    const cached =
      await billingRuntimeCacheService
        .getQuotaUsage({
          organizationId,

          meterCode,

          periodStart,
        });


    if (
      cached !==
        null
    ) {
      return {
        quantity:
          cached,

        source:
          "redis",
      };
    }


    const quantity =
      await this
        .usageRepository
        .getPeriodQuantity({
          organizationId,

          meterCode,

          periodStart,

          periodEnd,
        });


    await billingRuntimeCacheService
      .setQuotaUsage(
        {
          organizationId,

          meterCode,

          periodStart,
        },

        quantity
      );


    return {
      quantity,

      source:
        "postgres",
    };
  }


  async evaluate({
    organizationId,

    meterCode,

    entitlementKey,

    requestedQuantity =
      1,

    mode =
      "METERED",

    at =
      new Date(),
  }) {
    const limit =
      await EntitlementService
        .getEntitlement(
          organizationId,
          entitlementKey
        );


    const {
      periodStart,
      periodEnd,
    } =
      await this
        .resolveBillingPeriod(
          organizationId,
          at
        );


    const usage =
      await this
        .getUsage({
          organizationId,

          meterCode,

          periodStart,

          periodEnd,
        });


    /**
     * null means unlimited.
     */
    if (
      limit ===
        null
    ) {
      return {
        allowed:
          true,

        unlimited:
          true,

        mode,

        limit:
          null,

        used:
          usage.quantity,

        requested:
          requestedQuantity,

        projected:
          usage.quantity +
          requestedQuantity,

        includedRemaining:
          null,

        overageQuantity:
          0,

        periodStart,

        periodEnd,

        source:
          usage.source,
      };
    }


    if (
      typeof limit !==
        "number"
    ) {
      throw this.createError(
        "Commercial quota entitlement is not numeric",
        "COMMERCIAL_QUOTA_CONFIGURATION_INVALID",
        500,
        {
          entitlementKey,

          meterCode,
        }
      );
    }


    const projected =
      usage.quantity +
      Number(
        requestedQuantity
      );


    const overageQuantity =
      Math.max(
        0,

        projected -
        limit
      );


    const includedRemaining =
      Math.max(
        0,

        limit -
        usage.quantity
      );


    /**
     * METERED:
     *
     * Exceeding the included allowance does NOT deny the operation.
     * It creates overage usage later.
     *
     * HARD:
     *
     * Used for true commercial caps.
     */
    const allowed =
      mode ===
        "HARD"
        ? projected <=
          limit
        : true;


    return {
      allowed,

      unlimited:
        false,

      mode,

      limit,

      used:
        usage.quantity,

      requested:
        Number(
          requestedQuantity
        ),

      projected,

      includedRemaining,

      overageQuantity,

      withinIncluded:
        overageQuantity ===
        0,

      periodStart,

      periodEnd,

      source:
        usage.source,
    };
  }


  async assertAllowed(
    options
  ) {
    const decision =
      await this
        .evaluate(
          options
        );


    if (
      !decision.allowed
    ) {
      throw this.createError(
        "Commercial quota exceeded",
        "COMMERCIAL_QUOTA_EXCEEDED",
        403,
        {
          meterCode:
            options.meterCode,

          entitlementKey:
            options.entitlementKey,

          decision,
        }
      );
    }


    return decision;
  }
}


const billingQuotaService =
  new BillingQuotaService();


module.exports = {
  BillingQuotaService,

  billingQuotaService,
};