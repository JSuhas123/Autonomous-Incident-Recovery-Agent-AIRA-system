"use strict";

jest.mock(
  "../../models/RuntimeRecoveryCheckpoint",
  () => ({
    create:
      jest.fn(),

    findOneAndUpdate:
      jest.fn(),

    findOne:
      jest.fn(),
  })
);

const RuntimeRecoveryCheckpoint =
  require(
    "../../models/RuntimeRecoveryCheckpoint"
  );

const MongoRuntimeRecoveryCheckpointRepository =
  require(
    "../mongo/MongoRuntimeRecoveryCheckpointRepository"
  );

describe(
  "MongoRuntimeRecoveryCheckpointRepository",
  () => {
    beforeEach(
      () => {
        jest.clearAllMocks();
      }
    );

    test(
      "atomic update returns the post-update document",
      async () => {
        const filter = {
          "owner.claimToken":
            "token",

          status:
            "processing",
        };

        const update = {
          $set: {
            "owner.heartbeatAt":
              new Date(),
          },
        };

        await new MongoRuntimeRecoveryCheckpointRepository()
          .findOneAndUpdate(
            filter,
            update
          );

        expect(
          RuntimeRecoveryCheckpoint
            .findOneAndUpdate
        ).toHaveBeenCalledWith(
          filter,
          update,
          {
            new:
              true,
          }
        );
      }
    );

    test(
      "duplicate-key error remains untranslated",
      async () => {
        const error =
          Object.assign(
            new Error(
              "duplicate"
            ),
            {
              code:
                11000,
            }
          );

        RuntimeRecoveryCheckpoint
          .create
          .mockRejectedValue(
            error
          );

        await expect(
          new MongoRuntimeRecoveryCheckpointRepository()
            .create({
              operationKey:
                "x",
            })
        ).rejects.toBe(
          error
        );
      }
    );
  }
);