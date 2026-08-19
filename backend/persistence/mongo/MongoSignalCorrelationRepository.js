"use strict";

const SignalCorrelationRepository =
  require(
    "../repositories/SignalCorrelationRepository"
  );

const {
  SignalCorrelation,
} =
  require(
    "../../models/SignalCorrelation"
  );

class MongoSignalCorrelationRepository
  extends SignalCorrelationRepository {
  async upsertGroup(
    {
      organizationId,
      environmentId,
    },
    correlationGroupId,
    update
  ) {
    const {
      set = {},
      addSignalIds = [],
    } =
      update || {};

    const mongoUpdate = {
      $set:
        set,
    };

    if (
      Array.isArray(
        addSignalIds
      ) &&
      addSignalIds.length >
        0
    ) {
      mongoUpdate
        .$addToSet = {
          signalIds: {
            $each:
              addSignalIds,
          },
        };
    }

    return SignalCorrelation
      .findOneAndUpdate(
        {
          organizationId,

          environmentId,

          correlationGroupId,
        },
        mongoUpdate,
        {
          upsert:
            true,

          new:
            true,

          setDefaultsOnInsert:
            true,
        }
      );
  }

  async findGroup(
    {
      organizationId,
      environmentId,
    },
    correlationGroupId
  ) {
    return SignalCorrelation
      .findOne({
        organizationId,

        environmentId,

        correlationGroupId,
      })
      .lean();
  }

  async updateOne(
    filter,
    update
  ) {
    return SignalCorrelation
      .updateOne(
        filter,
        update
      );
  }
}

module.exports =
  MongoSignalCorrelationRepository;