"use strict";

const PolicyRepository =
  require(
    "../repositories/PolicyRepository"
  );

const PolicyDefinition =
  require(
    "../../models/PolicyDefinition"
  );

function sessionFrom(
  transaction
) {
  return transaction
    ?.kind ===
    "mongo"
    ? transaction.session
    : null;
}

class MongoPolicyRepository
  extends PolicyRepository {
  async findOne(
    filter
  ) {
    return PolicyDefinition
      .findOne(
        filter
      );
  }

  async findActiveForTenant(
    tenantId,
    version = null
  ) {
    const filter = {
      tenantId,

      status:
        "active",
    };

    if (
      version !==
        null &&
      version !==
        undefined
    ) {
      filter.version =
        version;
    }

    return PolicyDefinition
      .findOne(
        filter
      );
  }

  async list(
    filter,
    {
      sort = {
        version:
          -1,
      },

      limit = 100,
    } = {}
  ) {
    const safeLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            limit,
            10
          ) ||
          100,
          1
        ),
        500
      );

    return PolicyDefinition
      .find(
        filter
      )
      .sort(
        sort
      )
      .limit(
        safeLimit
      );
  }

  async create(
    data,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    if (
      !session
    ) {
      return PolicyDefinition
        .create(
          data
        );
    }

    const [
      created,
    ] =
      await PolicyDefinition
        .create(
          [
            data,
          ],
          {
            session,
          }
        );

    return created;
  }

  async save(
    policy,
    transaction = null
  ) {
    if (
      !policy ||
      typeof policy.save !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "MongoPolicyRepository.save() requires a PolicyDefinition document"
        ),
        {
          code:
            "INVALID_POLICY_DOCUMENT",
        }
      );
    }

    const session =
      sessionFrom(
        transaction
      );

    return policy.save(
      session
        ? {
            session,
          }
        : undefined
    );
  }

  async updateOne(
    filter,
    update,
    transaction = null
  ) {
    const session =
      sessionFrom(
        transaction
      );

    let query =
      PolicyDefinition
        .findOneAndUpdate(
          filter,
          update,
          {
            new:
              true,
          }
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
  MongoPolicyRepository;