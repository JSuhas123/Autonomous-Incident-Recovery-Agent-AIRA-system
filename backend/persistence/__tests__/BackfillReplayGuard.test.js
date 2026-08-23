"use strict";

const BackfillReplayGuard =
  require(
    "../migration/BackfillReplayGuard"
  );

describe(
  "BackfillReplayGuard",
  () => {
    test(
      "existing equivalent record is skipped",
      async () => {
        const guard =
          new BackfillReplayGuard({
            logger: {
              log:
                jest.fn(),
            },
          });

        const existing = {
          id:
            "target-1",

          publicId:
            "record-1",
        };

        const result =
          await guard.execute({
            domain:
              "incidents",

            document: {
              _id:
                "mongo-1",

              publicId:
                "record-1",
            },

            findExisting:
              async () =>
                existing,

            compareIdentity:
              (
                target,
                source
              ) =>
                target.publicId ===
                source.publicId,

            write:
              jest.fn(),
          });

        expect(
          result.status
        ).toBe(
          "skipped"
        );

        expect(
          result.reason
        ).toBe(
          "already-exists"
        );
      }
    );

    test(
      "new record is written",
      async () => {
        const write =
          jest.fn(
            async () => ({
              id:
                "created",
            })
          );

        const guard =
          new BackfillReplayGuard();

        const result =
          await guard.execute({
            domain:
              "incidents",

            document: {
              _id:
                "mongo-1",
            },

            findExisting:
              async () =>
                null,

            write,
          });

        expect(
          write
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          result.status
        ).toBe(
          "migrated"
        );
      }
    );

    test(
      "unique race with equivalent winner becomes skipped",
      async () => {
        let lookupCount =
          0;

        const guard =
          new BackfillReplayGuard({
            logger: {
              log:
                jest.fn(),
            },
          });

        const result =
          await guard.execute({
            domain:
              "signals",

            document: {
              signalId:
                "signal-1",
            },

            findExisting:
              async () => {
                lookupCount +=
                  1;

                if (
                  lookupCount ===
                  1
                ) {
                  return null;
                }

                return {
                  signalId:
                    "signal-1",
                };
              },

            compareIdentity:
              (
                target,
                source
              ) =>
                target.signalId ===
                source.signalId,

            write:
              async () => {
                throw Object.assign(
                  new Error(
                    "duplicate"
                  ),
                  {
                    code:
                      "23505",
                  }
                );
              },
          });

        expect(
          result.status
        ).toBe(
          "skipped"
        );

        expect(
          result.reason
        ).toBe(
          "duplicate-replay"
        );
      }
    );

    test(
      "unexpected unique identity conflict fails closed",
      async () => {
        let lookupCount =
          0;

        const guard =
          new BackfillReplayGuard();

        await expect(
          guard.execute({
            domain:
              "signals",

            document: {
              signalId:
                "signal-1",
            },

            findExisting:
              async () => {
                lookupCount +=
                  1;

                if (
                  lookupCount ===
                  1
                ) {
                  return null;
                }

                return {
                  signalId:
                    "different-signal",
                };
              },

            compareIdentity:
              (
                target,
                source
              ) =>
                target.signalId ===
                source.signalId,

            write:
              async () => {
                throw Object.assign(
                  new Error(
                    "duplicate"
                  ),
                  {
                    code:
                      "23505",
                  }
                );
              },
          })
        )
          .rejects
          .toMatchObject({
            code:
              "MIGRATION_IDENTITY_CONFLICT",
          });
      }
    );

    test(
      "unique violation without verification capability is not swallowed",
      async () => {
        const guard =
          new BackfillReplayGuard();

        const error =
          Object.assign(
            new Error(
              "duplicate"
            ),
            {
              code:
                "23505",
            }
          );

        await expect(
          guard.execute({
            domain:
              "incidents",

            document: {
              _id:
                "mongo-1",
            },

            write:
              async () => {
                throw error;
              },
          })
        )
          .rejects
          .toBe(
            error
          );
      }
    );
  }
);