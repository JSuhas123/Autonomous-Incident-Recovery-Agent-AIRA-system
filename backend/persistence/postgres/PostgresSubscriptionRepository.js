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
            "status",
            "started_at",
            "ends_at",
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
    return this.repository
      .updateOne(
        filter,
        update,
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