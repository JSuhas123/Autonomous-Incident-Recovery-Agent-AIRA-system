"use strict";

jest.mock(
  "../../models/Signal",
  () => ({
    Signal: {
      create:
        jest.fn(),

      findById:
        jest.fn(),

      findOne:
        jest.fn(),

      find:
        jest.fn(),

      updateOne:
        jest.fn(),
    },
  })
);

const {
  Signal,
} =
  require(
    "../../models/Signal"
  );

const MongoSignalRepository =
  require(
    "../mongo/MongoSignalRepository"
  );

describe(
  "MongoSignalRepository",
  () => {
    let repository;

    beforeEach(
      () => {
        jest.clearAllMocks();

        repository =
          new MongoSignalRepository();
      }
    );

    test(
      "create delegates to Signal.create",
      async () => {
        const data = {
          signalId:
            "sig-1",
        };

        Signal
          .create
          .mockResolvedValue(
            data
          );

        expect(
          await repository
            .create(
              data
            )
        ).toBe(
          data
        );

        expect(
          Signal.create
        ).toHaveBeenCalledWith(
          data
        );
      }
    );

    test(
      "findByDatabaseId delegates to Signal.findById",
      async () => {
        await repository
          .findByDatabaseId(
            "mongo-id"
          );

        expect(
          Signal.findById
        ).toHaveBeenCalledWith(
          "mongo-id"
        );
      }
    );

    test(
      "findLatestDuplicate orders by lastSeenAt descending",
      async () => {
        const sort =
          jest
            .fn()
            .mockResolvedValue(
              null
            );

        Signal
          .findOne
          .mockReturnValue({
            sort,
          });

        const filter = {
          organizationId:
            "org-1",

          environmentId:
            "env-1",

          fingerprint:
            "fp",
        };

        await repository
          .findLatestDuplicate(
            filter
          );

        expect(
          Signal.findOne
        ).toHaveBeenCalledWith(
          filter
        );

        expect(
          sort
        ).toHaveBeenCalledWith({
          lastSeenAt:
            -1,
        });
      }
    );

    test(
      "updateOne delegates atomically",
      async () => {
        const filter = {
          _id:
            "id-1",
        };

        const update = {
          $set: {
            processingStatus:
              "failed",
          },
        };

        await repository
          .updateOne(
            filter,
            update
          );

        expect(
          Signal.updateOne
        ).toHaveBeenCalledWith(
          filter,
          update
        );
      }
    );

    test(
      "save requires a Mongoose document",
      async () => {
        await expect(
          repository.save({
            signalId:
              "sig-1",
          })
        ).rejects.toMatchObject({
          code:
            "INVALID_SIGNAL_DOCUMENT",
        });
      }
    );

    test(
      "list caps query size at 500",
      async () => {
        const lean =
          jest
            .fn()
            .mockResolvedValue(
              []
            );

        const limit =
          jest
            .fn()
            .mockReturnValue({
              lean,
            });

        const sort =
          jest
            .fn()
            .mockReturnValue({
              limit,
            });

        Signal
          .find
          .mockReturnValue({
            sort,
          });

        await repository
          .list(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",
            },
            {
              limit:
                5000,
            }
          );

        expect(
          limit
        ).toHaveBeenCalledWith(
          500
        );
      }
    );
  }
);