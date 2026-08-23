"use strict";

const OperationalDocumentRepository =
  require(
    "../repositories/OperationalDocumentRepository"
  );

const MODEL_LOADERS = {
  failedMessage:
    () =>
      require(
        "../../models/FailedMessage"
      ),

  retentionArchive:
    () =>
      require(
        "../../models/RetentionArchive"
      ),

  decisionTrace:
    () =>
      require(
        "../../models/DecisionTrace"
      ),

  auditEvent:
    () =>
      require(
        "../../models/AuditEvent"
      ),
};


function modelFor(
  domain
) {
  const loader =
    MODEL_LOADERS[
      domain
    ];

  if (
    !loader
  ) {
    throw Object.assign(
      new Error(
        `Unsupported extended operational domain: ${domain}`
      ),
      {
        code:
          "EXTENDED_OPERATIONAL_DOMAIN_UNSUPPORTED",
      }
    );
  }

  return loader();
}


function sessionFrom(
  transaction
) {
  return transaction
    ?.kind ===
    "mongo"
    ? transaction.session
    : null;
}


class MongoExtendedOperationalRepository
  extends OperationalDocumentRepository {
  async findMany(
    domain,
    filter = {},
    options = {},
    transaction = null
  ) {
    let query =
      modelFor(
        domain
      )
        .find(
          filter
        );

    const session =
      sessionFrom(
        transaction
      );

    if (
      session
    ) {
      query =
        query.session(
          session
        );
    }

    if (
      options.sort
    ) {
      query =
        query.sort(
          options.sort
        );
    }

    if (
      options.limit
    ) {
      query =
        query.limit(
          options.limit
        );
    }

    if (
      options.select
    ) {
      query =
        query.select(
          options.select
        );
    }

    return query.lean();
  }


  async findOne(
    domain,
    filter = {},
    options = {},
    transaction = null
  ) {
    let query =
      modelFor(
        domain
      )
        .findOne(
          filter
        );

    const session =
      sessionFrom(
        transaction
      );

    if (
      session
    ) {
      query =
        query.session(
          session
        );
    }

    if (
      options.sort
    ) {
      query =
        query.sort(
          options.sort
        );
    }

    if (
      options.select
    ) {
      query =
        query.select(
          options.select
        );
    }

    return query.lean();
  }


  async create(
    domain,
    data,
    transaction = null
  ) {
    const Model =
      modelFor(
        domain
      );

    const session =
      sessionFrom(
        transaction
      );

    const created =
      session
        ? (
            await Model.create(
              [
                data,
              ],
              {
                session,
              }
            )
          )[0]
        : await Model.create(
            data
          );

    return created
      ?.toObject
      ? created.toObject()
      : created;
  }


  async replace(
    domain,
    filter,
    document,
    transaction = null
  ) {
    const options = {
      new:
        true,

      overwrite:
        true,

      runValidators:
        true,
    };

    const session =
      sessionFrom(
        transaction
      );

    if (
      session
    ) {
      options.session =
        session;
    }

    return modelFor(
      domain
    )
      .findOneAndReplace(
        filter,
        document,
        options
      )
      .lean();
  }


  async updateOne(
    domain,
    filter,
    update,
    options = {},
    transaction = null
  ) {
    const queryOptions = {
      ...options,

      new:
        options.new !==
        false,

      runValidators:
        true,
    };

    const session =
      sessionFrom(
        transaction
      );

    if (
      session
    ) {
      queryOptions.session =
        session;
    }

    return modelFor(
      domain
    )
      .findOneAndUpdate(
        filter,
        update,
        queryOptions
      )
      .lean();
  }


  async updateMany(
    domain,
    filter,
    update,
    options = {},
    transaction = null
  ) {
    const queryOptions = {
      ...options,
    };

    const session =
      sessionFrom(
        transaction
      );

    if (
      session
    ) {
      queryOptions.session =
        session;
    }

    return modelFor(
      domain
    )
      .updateMany(
        filter,
        update,
        queryOptions
      );
  }


  async deleteOne(
    domain,
    filter,
    transaction = null
  ) {
    const options = {};

    const session =
      sessionFrom(
        transaction
      );

    if (
      session
    ) {
      options.session =
        session;
    }

    return modelFor(
      domain
    )
      .deleteOne(
        filter,
        options
      );
  }


  async deleteMany(
    domain,
    filter,
    transaction = null
  ) {
    const options = {};

    const session =
      sessionFrom(
        transaction
      );

    if (
      session
    ) {
      options.session =
        session;
    }

    return modelFor(
      domain
    )
      .deleteMany(
        filter,
        options
      );
  }


  async countDocuments(
    domain,
    filter = {},
    transaction = null
  ) {
    let query =
      modelFor(
        domain
      )
        .countDocuments(
          filter
        );

    const session =
      sessionFrom(
        transaction
      );

    if (
      session
    ) {
      query =
        query.session(
          session
        );
    }

    return query;
  }
}


module.exports =
  MongoExtendedOperationalRepository;