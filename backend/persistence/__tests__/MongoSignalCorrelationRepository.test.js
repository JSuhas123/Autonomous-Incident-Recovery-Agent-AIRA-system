"use strict";

jest.mock(
  "../../models/SignalCorrelation",
  () => ({
    SignalCorrelation: {
      findOneAndUpdate:
        jest.fn(),

      findOne:
        jest.fn(),

      updateOne:
        jest.fn(),
    },
  })
);

const {
  SignalCorrelation,
} =
  require(
    "../../models/SignalCorrelation"
  );

const MongoSignalCorrelationRepository =
  require(
    "../mongo/MongoSignalCorrelationRepository"
  );

describe(
  "MongoSignalCorrelationRepository",
  () => {
    let repository;

    beforeEach(
      () => {
        jest.clearAllMocks();

        repository =
          new MongoSignalCorrelationRepository();
      }
    );

    test(
      "upsertGroup remains organization/environment scoped",
      async () => {
        await repository
          .upsertGroup(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",
            },
            "corr-1",
            {
              set: {
                status:
                  "active",
              },

              addSignalIds: [
                "sig-1",
              ],
            }
          );

        expect(
          SignalCorrelation
            .findOneAndUpdate
        ).toHaveBeenCalledWith(
          {
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            correlationGroupId:
              "corr-1",
          },
          {
            $set: {
              status:
                "active",
            },

            $addToSet: {
              signalIds: {
                $each: [
                  "sig-1",
                ],
              },
            },
          },
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
    );

    test(
      "updateOne delegates without changing semantics",
      async () => {
        const filter = {
          _id:
            "mongo-id",
        };

        const update = {
          $set: {
            status:
              "routed",
          },
        };

        await repository
          .updateOne(
            filter,
            update
          );

        expect(
          SignalCorrelation
            .updateOne
        ).toHaveBeenCalledWith(
          filter,
          update
        );
      }
    );
  }
);