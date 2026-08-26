"use strict";

const crypto =
  require(
    "crypto"
  );

const SubscriptionRepository =
  require(
    "../repositories/SubscriptionRepository"
  );

const Base =
  require(
    "./PostgresIdentityRepositoryBase"
  );

const {
  normalizePlanCode,
} =
  require(
    "../../constants/plans"
  );


function normalizeData(
  data = {},
  {
    create =
      false,
  } = {}
) {
  const result = {
    ...data,
  };


  if (
    result.plan !==
      undefined
  ) {
    const normalizedPlan =
      normalizePlanCode(
        result.plan
      );

    if (
      !normalizedPlan
    ) {
      const error =
        new Error(
          "Invalid commercial plan"
        );

      error.code =
        "SUBSCRIPTION_PLAN_INVALID";

      error.status =
        422;

      throw error;
    }

    result.plan =
      normalizedPlan;
  }


  if (
    create
  ) {
    result._id =
      result._id ||
      result.publicId ||
      crypto.randomUUID();
  }


  return result;
}


class PostgresSubscriptionRepository
  extends SubscriptionRepository {

  constructor(
    options = {}
  ) {
    super();


    this.repository =
      new Base(
        options,
        {
          table:
            "tenancy.subscriptions",


          columns: [
            "public_id",

            "legacy_mongo_id",

            "organization_id",

            "plan",

            "plan_version_id",

            "price_id",

            "status",

            "billing_interval",

            "currency",

            "started_at",

            "ends_at",

            "trial_started_at",

            "trial_ends_at",

            "current_period_started_at",

            "current_period_ends_at",

            "cancel_at_period_end",

            "cancelled_at",

            "cancellation_reason",

            "billing_anchor_at",

            "metadata",

            "created_at",

            "updated_at",
          ],


          jsonColumns: [
            "metadata",
          ],


          foreignKeyColumns: {
            organization_id:
              "tenancy.organizations",

            plan_version_id:
              "billing.plan_versions",

            price_id:
              "billing.prices",
          },
        }
      );
  }


  findOne(
    filter = {},
    ...args
  ) {
    return this.repository
      .findOne(
        filter,
        ...args
      );
  }


  findMany(
    filter = {},
    ...args
  ) {
    return this.repository
      .findMany(
        filter,
        ...args
      );
  }


  create(
    data,
    ...args
  ) {
    return this.repository
      .create(
        normalizeData(
          data,
          {
            create:
              true,
          }
        ),
        ...args
      );
  }


  updateOne(
    filter,
    update,
    ...args
  ) {
    let normalizedUpdate =
      update;


    if (
      update &&
      update.$set &&
      update.$set.plan !==
        undefined
    ) {
      normalizedUpdate = {
        ...update,

        $set: {
          ...update.$set,

          ...normalizeData({
            plan:
              update.$set
                .plan,
          }),
        },
      };
    } else if (
      update &&
      update.plan !==
        undefined
    ) {
      normalizedUpdate =
        normalizeData(
          update
        );
    }


    return this.repository
      .updateOne(
        filter,
        normalizedUpdate,
        ...args
      );
  }


  save(
    subscription,
    ...args
  ) {
    return this.repository
      .save(
        normalizeData(
          subscription
        ),
        ...args
      );
  }
}


module.exports =
  PostgresSubscriptionRepository;