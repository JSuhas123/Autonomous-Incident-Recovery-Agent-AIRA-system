"use strict";

const SubscriptionRepository =
  require(
    "../repositories/SubscriptionRepository"
  );

const Subscription =
  require(
    "../../models/Subscription"
  );

const support =
  require(
    "./MongoIdentityRepositorySupport"
  );

class MongoSubscriptionRepository
  extends SubscriptionRepository {
  findOne(
    filter = {},
    options = {},
    transaction = null
  ) {
    const parsed =
      support
        .mutationOptions(
          options,
          transaction
        );

    return support
      .applySession(
        Subscription
          .findOne(
            filter,
            parsed.options
          ),
        parsed.transaction
      );
  }

  findMany(
    filter = {},
    options = {},
    transaction = null
  ) {
    const parsed =
      support
        .mutationOptions(
          options,
          transaction
        );

    return support
      .applySession(
        Subscription
          .find(
            filter,
            parsed.options
          ),
        parsed.transaction
      );
  }

  create(
    data,
    transaction = null
  ) {
    return support
      .create(
        Subscription,
        data,
        transaction
      );
  }

  updateOne(
    filter,
    update,
    options = {},
    transaction = null
  ) {
    return support
      .updateOne(
        Subscription,
        filter,
        update,
        options,
        transaction
      );
  }

  save(
    subscription,
    transaction = null
  ) {
    return support
      .save(
        subscription,
        transaction,
        "MongoSubscriptionRepository"
      );
  }
}

module.exports =
  MongoSubscriptionRepository;