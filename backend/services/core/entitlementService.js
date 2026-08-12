"use strict";

const Subscription = require("../../models/Subscription");

const {
  PLAN_ENTITLEMENTS,
} = require("../../constants/entitlements");

class EntitlementService {
  static async getSubscription(organizationId) {
    let subscription = await Subscription.findOne({
      organizationId,
    });

    if (!subscription) {
      subscription = await Subscription.create({
        organizationId,
        plan: "developer",
        status: "active",
      });
    }

    return subscription;
  }

  static async getPlan(organizationId) {
    const subscription =
      await this.getSubscription(organizationId);

    return subscription.plan;
  }

  static async getEntitlements(organizationId) {
    const subscription =
      await this.getSubscription(organizationId);

    return (
      PLAN_ENTITLEMENTS[subscription.plan] ||
      PLAN_ENTITLEMENTS.developer
    );
  }

  static async getEntitlement(
    organizationId,
    entitlementKey
  ) {
    const entitlements =
      await this.getEntitlements(organizationId);

    return entitlements[entitlementKey];
  }

  static async isEnabled(
    organizationId,
    entitlementKey
  ) {
    const value = await this.getEntitlement(
      organizationId,
      entitlementKey
    );

    return value === true;
  }

  static async assertEnabled(
    organizationId,
    entitlementKey
  ) {
    const enabled = await this.isEnabled(
      organizationId,
      entitlementKey
    );

    if (!enabled) {
      const error = new Error(
        "This feature is not available on the current plan"
      );

      error.status = 403;
      error.code = "ENTITLEMENT_REQUIRED";
      error.entitlement = entitlementKey;

      throw error;
    }

    return true;
  }

  static async assertWithinLimit(
    organizationId,
    entitlementKey,
    currentUsage,
    requestedIncrease = 1
  ) {
    const limit = await this.getEntitlement(
      organizationId,
      entitlementKey
    );

    if (limit === null || limit === undefined) {
      return true;
    }

    if (typeof limit !== "number") {
      throw new Error(
        `Entitlement ${entitlementKey} is not a numeric limit`
      );
    }

    if (currentUsage + requestedIncrease > limit) {
      const error = new Error(
        "Plan limit reached"
      );

      error.status = 403;
      error.code = "ENTITLEMENT_LIMIT_REACHED";
      error.entitlement = entitlementKey;
      error.limit = limit;
      error.currentUsage = currentUsage;

      throw error;
    }

    return true;
  }
}

module.exports = EntitlementService;