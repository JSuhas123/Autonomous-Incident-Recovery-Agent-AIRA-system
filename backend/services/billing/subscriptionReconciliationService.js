"use strict";

const PostgresBillingReconciliationRepository =
  require(
    "../../persistence/postgres/PostgresBillingReconciliationRepository"
  );

const {
  billingRuntimeCacheService,
} =
  require(
    "./billingRuntimeCacheService"
  );

const {
  SUBSCRIPTION_CHANGE_TYPES,
} =
  require(
    "../../constants/billingReconciliation"
  );


class SubscriptionReconciliationService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresBillingReconciliationRepository(
        options
      );
  }


  normalizeStatus(
    providerStatus
  ) {
    const value =
      String(
        providerStatus ||
        ""
      )
        .trim()
        .toLowerCase();


    switch (
      value
    ) {

      case "active":
      case "authenticated":
      case "created":
        return "active";


      case "past_due":
      case "pending":
        return "past_due";


      case "paused":
        return "paused";


      case "cancelled":
      case "canceled":
      case "completed":
        return "cancelled";


      default:
        return null;
    }
  }


  async reconcile({
    organizationId,

    provider =
      null,

    providerSubscriptionId =
      null,

    providerState =
      {},

    sourceType =
      "reconciliation",

    sourceId =
      null,
  }) {
    const subscription =
      await this.repository
        .getSubscription(
          organizationId
        );


    if (
      !subscription
    ) {
      const error =
        new Error(
          "Subscription not found"
        );

      error.code =
        "SUBSCRIPTION_RECONCILIATION_NOT_FOUND";

      error.status =
        404;

      throw error;
    }


    const previousState = {
      status:
        subscription.status,

      currentPeriodStartedAt:
        subscription
          .current_period_started_at,

      currentPeriodEndsAt:
        subscription
          .current_period_ends_at,

      cancelAtPeriodEnd:
        subscription
          .cancel_at_period_end,
    };


    const nextState = {
      status:
        this
          .normalizeStatus(
            providerState
              .status
          ) ||
        subscription.status,

      currentPeriodStartedAt:
        providerState
          .currentPeriodStartedAt ||
        subscription
          .current_period_started_at,

      currentPeriodEndsAt:
        providerState
          .currentPeriodEndsAt ||
        subscription
          .current_period_ends_at,

      cancelAtPeriodEnd:
        typeof providerState
          .cancelAtPeriodEnd ===
          "boolean"
          ? providerState
              .cancelAtPeriodEnd
          : subscription
              .cancel_at_period_end,
    };


    const changed =
      previousState.status !==
        nextState.status ||
      String(
        previousState
          .currentPeriodStartedAt ||
        ""
      ) !==
        String(
          nextState
            .currentPeriodStartedAt ||
          ""
        ) ||
      String(
        previousState
          .currentPeriodEndsAt ||
        ""
      ) !==
        String(
          nextState
            .currentPeriodEndsAt ||
          ""
        ) ||
      Boolean(
        previousState
          .cancelAtPeriodEnd
      ) !==
        Boolean(
          nextState
            .cancelAtPeriodEnd
        );


    if (
      !changed
    ) {
      return {
        changed:
          false,

        subscription,
      };
    }


    const updated =
      await this.repository
        .updateSubscription({
          subscriptionId:
            subscription.id,

          updates: {
            status:
              nextState.status,

            currentPeriodStartedAt:
              nextState
                .currentPeriodStartedAt,

            currentPeriodEndsAt:
              nextState
                .currentPeriodEndsAt,

            cancelAtPeriodEnd:
              nextState
                .cancelAtPeriodEnd,

            metadata: {
              lastReconciledAt:
                new Date()
                  .toISOString(),

              provider:
                provider ||
                null,
            },
          },
        });


    await this.repository
      .recordSubscriptionChange({
        organizationId:
          subscription
            .organization_id,

        subscriptionId:
          subscription.id,

        provider,

        providerSubscriptionId,

        changeType:
          SUBSCRIPTION_CHANGE_TYPES
            .RECONCILED,

        previousState,

        nextState,

        sourceType,

        sourceId,

        metadata: {
          phase:
            "15.19",
        },
      });


    /**
     * Subscription change means cached commercial entitlement decisions may
     * now be stale.
     */
    await billingRuntimeCacheService
      .invalidateEntitlements(
        organizationId
      );


    return {
      changed:
        true,

      previousState,

      nextState,

      subscription:
        updated,
    };
  }
}


const subscriptionReconciliationService =
  new SubscriptionReconciliationService();


module.exports = {
  SubscriptionReconciliationService,

  subscriptionReconciliationService,

  reconcileSubscription:
    subscriptionReconciliationService
      .reconcile
      .bind(
        subscriptionReconciliationService
      ),
};