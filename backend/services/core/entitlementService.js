"use strict";

const {
  subscriptionRepository,
} =
  require(
    "../../persistence/repositories"
  );

const {
  PLAN_ENTITLEMENTS,
} =
  require(
    "../../constants/entitlements"
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
              "developer",

            status:
              "active",

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
      subscription.status ===
        "suspended" ||
      subscription.status ===
        "cancelled"
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

    return subscription
      .plan;
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

    return (
      PLAN_ENTITLEMENTS[
        subscription.plan
      ] ||
      PLAN_ENTITLEMENTS
        .developer
    );
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

    const entitlements =
      PLAN_ENTITLEMENTS[
        subscription.plan
      ] ||
      PLAN_ENTITLEMENTS
        .developer;

    const enabled =
      entitlements[
        entitlementKey
      ] ===
      true;

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
            subscription.plan,
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

    const entitlements =
      PLAN_ENTITLEMENTS[
        subscription.plan
      ] ||
      PLAN_ENTITLEMENTS
        .developer;

    const limit =
      entitlements[
        entitlementKey
      ];

    if (
      limit ===
        null ||
      limit ===
        undefined
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
            subscription.plan,
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
            subscription.plan,

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

    const entitlements =
      PLAN_ENTITLEMENTS[
        subscription.plan
      ] ||
      PLAN_ENTITLEMENTS
        .developer;

    return {
      plan:
        subscription.plan,

      status:
        subscription.status,

      entitlements: {
        ...entitlements,
      },

      startedAt:
        subscription
          .startedAt,

      endsAt:
        subscription
          .endsAt,
    };
  }
}


module.exports =
  EntitlementService;