"use strict";

const {
  subscriptionRepository,
} =
  require(
    "../../persistence/repositories"
  );
const {
  billingRuntimeCacheService,
} =
  require(
    "../billing/billingRuntimeCacheService"
  );

const PostgresBillingCatalogueRepository =
  require(
    "../../persistence/postgres/PostgresBillingCatalogueRepository"
  );

const {
  PLAN_CODES,
  normalizePlanCode,
} =
  require(
    "../../constants/plans"
  );


class EntitlementService {

  static createError(
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

    Object.assign(
      error,
      metadata
    );

    return error;
  }


  static getBillingRepository() {
    if (
      !this
        .billingRepository
    ) {
      this.billingRepository =
        new PostgresBillingCatalogueRepository();
    }

    return this
      .billingRepository;
  }


  static normalizeSubscriptionPlan(
    subscription
  ) {
    return (
      normalizePlanCode(
        subscription
          ?.plan
      ) ||
      PLAN_CODES
        .DEVELOPER
    );
  }


  static async getSubscription(
    organizationId
  ) {
    let subscription =
      await subscriptionRepository
        .findOne({
          organizationId,
        });


    if (
      !subscription
    ) {
      subscription =
        await subscriptionRepository
          .create({
            organizationId,

            plan:
              PLAN_CODES
                .DEVELOPER,

            status:
              "active",

            billingInterval:
              "monthly",

            currency:
              "USD",

            startedAt:
              new Date(),

            metadata:
              {},
          });
    }


    return subscription;
  }


  static assertSubscriptionUsable(
    subscription
  ) {
    if (
      !subscription
    ) {
      throw this.createError(
        "Subscription unavailable",
        "SUBSCRIPTION_NOT_FOUND",
        403
      );
    }


    if (
      [
        "suspended",
        "cancelled",
      ].includes(
        subscription.status
      )
    ) {
      throw this.createError(
        "Subscription is not active",
        "SUBSCRIPTION_INACTIVE",
        403,
        {
          subscriptionStatus:
            subscription.status,
        }
      );
    }


    return true;
  }


  static deserializeEntitlement(
    row
  ) {
    switch (
      row.value_type
    ) {

      case "BOOLEAN":
        return row
          .boolean_value;


      case "INTEGER":
        return Number(
          row.integer_value
        );


      case "STRING":
        return row
          .text_value;


      case "JSON":
        return row
          .json_value;


      case "UNLIMITED":
        return null;


      default:
        throw this.createError(
          "Unsupported entitlement value type",
          "INVALID_ENTITLEMENT_CONFIGURATION",
          500,
          {
            entitlement:
              row.entitlement_key,

            valueType:
              row.value_type,
          }
        );
    }
  }


  static async resolveDatabaseEntitlements(
  organizationId
) {
  /**
   * Redis is only an acceleration layer.
   *
   * Cache failure or cache miss always falls back to PostgreSQL.
   */
  const cached =
    await billingRuntimeCacheService
      .getEntitlements(
        organizationId
      );


  if (
    cached &&
    cached.entitlements &&
    typeof cached.entitlements ===
      "object"
  ) {
    return {
      entitlements:
        cached.entitlements,

      overrides:
        cached.overrides ||
        {},

      source:
        "redis",
    };
  }


  const rows =
    await this
      .getBillingRepository()
      .getEffectiveEntitlements(
        organizationId
      );


  const entitlements =
    {};


  const overrides =
    {};


  for (
    const row
    of rows
  ) {
    entitlements[
      row.entitlement_key
    ] =
      this
        .deserializeEntitlement(
          row
        );


    if (
      row.overridden
    ) {
      overrides[
        row.entitlement_key
      ] =
        true;
    }
  }


  const snapshot = {
    entitlements,
    overrides,
  };


  /**
   * Best effort only.
   *
   * A Redis write failure MUST NOT turn a valid PostgreSQL entitlement
   * decision into an application failure.
   */
  await billingRuntimeCacheService
    .setEntitlements(
      organizationId,
      snapshot
    );


  return {
    ...snapshot,

    source:
      "postgres",
  };
}


  static async getPlan(
    organizationId
  ) {
    const subscription =
      await this
        .getSubscription(
          organizationId
        );


    this
      .assertSubscriptionUsable(
        subscription
      );


    return this
      .normalizeSubscriptionPlan(
        subscription
      );
  }


  static async getEntitlements(
    organizationId
  ) {
    const subscription =
      await this
        .getSubscription(
          organizationId
        );


    this
      .assertSubscriptionUsable(
        subscription
      );


    const {
      entitlements,
    } =
      await this
        .resolveDatabaseEntitlements(
          organizationId
        );


    if (
      Object.keys(
        entitlements
      ).length ===
      0
    ) {
      throw this.createError(
        "No database-backed entitlements resolved for subscription",
        "ENTITLEMENT_CONFIGURATION_MISSING",
        500,
        {
          organizationId,

          plan:
            this
              .normalizeSubscriptionPlan(
                subscription
              ),
        }
      );
    }


    return entitlements;
  }


  static async getEntitlement(
    organizationId,
    entitlementKey
  ) {
    const entitlements =
      await this
        .getEntitlements(
          organizationId
        );


    return entitlements[
      entitlementKey
    ];
  }


  static async isEnabled(
    organizationId,
    entitlementKey
  ) {
    const value =
      await this
        .getEntitlement(
          organizationId,
          entitlementKey
        );


    return value ===
      true;
  }


  static async assertEnabled(
    organizationId,
    entitlementKey
  ) {
    const subscription =
      await this
        .getSubscription(
          organizationId
        );


    this
      .assertSubscriptionUsable(
        subscription
      );


    const enabled =
      await this
        .isEnabled(
          organizationId,
          entitlementKey
        );


    if (
      !enabled
    ) {
      throw this.createError(
        "This feature is not available on the current plan",
        "ENTITLEMENT_REQUIRED",
        403,
        {
          entitlement:
            entitlementKey,

          plan:
            this
              .normalizeSubscriptionPlan(
                subscription
              ),
        }
      );
    }


    return true;
  }


  static async assertWithinLimit(
    organizationId,
    entitlementKey,
    currentUsage,
    requestedIncrease = 1
  ) {
    const subscription =
      await this
        .getSubscription(
          organizationId
        );


    this
      .assertSubscriptionUsable(
        subscription
      );


    const limit =
      await this
        .getEntitlement(
          organizationId,
          entitlementKey
        );


    if (
      limit ===
        null
    ) {
      return true;
    }


    if (
      typeof limit !==
      "number"
    ) {
      throw this.createError(
        `Entitlement ${entitlementKey} is not a numeric limit`,
        "INVALID_ENTITLEMENT_CONFIGURATION",
        500,
        {
          entitlement:
            entitlementKey,

          plan:
            this
              .normalizeSubscriptionPlan(
                subscription
              ),
        }
      );
    }


    const normalizedCurrentUsage =
      Number(
        currentUsage
      );


    const normalizedRequestedIncrease =
      Number(
        requestedIncrease
      );


    if (
      !Number.isFinite(
        normalizedCurrentUsage
      ) ||
      normalizedCurrentUsage <
        0
    ) {
      throw this.createError(
        "Invalid current usage value",
        "INVALID_USAGE_VALUE",
        500,
        {
          entitlement:
            entitlementKey,
        }
      );
    }


    if (
      !Number.isFinite(
        normalizedRequestedIncrease
      ) ||
      normalizedRequestedIncrease <
        0
    ) {
      throw this.createError(
        "Invalid requested increase value",
        "INVALID_USAGE_INCREMENT",
        500,
        {
          entitlement:
            entitlementKey,
        }
      );
    }


    const projectedUsage =
      normalizedCurrentUsage +
      normalizedRequestedIncrease;


    if (
      projectedUsage >
        limit
    ) {
      throw this.createError(
        "Plan limit reached",
        "ENTITLEMENT_LIMIT_REACHED",
        403,
        {
          entitlement:
            entitlementKey,

          plan:
            this
              .normalizeSubscriptionPlan(
                subscription
              ),

          limit,

          currentUsage:
            normalizedCurrentUsage,

          requestedIncrease:
            normalizedRequestedIncrease,

          projectedUsage,
        }
      );
    }


    return true;
  }


  static async getEntitlementSnapshot(
    organizationId
  ) {
    const subscription =
      await this
        .getSubscription(
          organizationId
        );


    this
      .assertSubscriptionUsable(
        subscription
      );


    const {
      entitlements,
      overrides,
    } =
      await this
        .resolveDatabaseEntitlements(
          organizationId
        );


    return {
      plan:
        this
          .normalizeSubscriptionPlan(
            subscription
          ),

      storedPlan:
        subscription.plan,

      planVersionId:
        subscription
          .planVersionId ||
        null,

      priceId:
        subscription
          .priceId ||
        null,

      status:
        subscription.status,

      billingInterval:
        subscription
          .billingInterval ||
        null,

      currency:
        subscription
          .currency ||
        null,

      entitlements,

      overrides,

      startedAt:
        subscription
          .startedAt,

      endsAt:
        subscription
          .endsAt,

      trialStartedAt:
        subscription
          .trialStartedAt ||
        null,

      trialEndsAt:
        subscription
          .trialEndsAt ||
        null,

      currentPeriodStartedAt:
        subscription
          .currentPeriodStartedAt ||
        null,

      currentPeriodEndsAt:
        subscription
          .currentPeriodEndsAt ||
        null,

      cancelAtPeriodEnd:
        subscription
          .cancelAtPeriodEnd ===
        true,

      cancelledAt:
        subscription
          .cancelledAt ||
        null,
    };
  }
}


module.exports =
  EntitlementService;