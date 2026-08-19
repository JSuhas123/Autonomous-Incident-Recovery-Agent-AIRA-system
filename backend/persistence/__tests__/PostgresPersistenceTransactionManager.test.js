"use strict";

const PostgresPersistenceTransactionManager =
  require(
    "../transactions/PostgresPersistenceTransactionManager"
  );

describe(
  "PostgresPersistenceTransactionManager",
  () => {
    test(
      "commits successful transaction and releases client",
      async () => {
        const client = {
          query:
            jest.fn()
              .mockResolvedValue(
                {}
              ),

          release:
            jest.fn(),
        };

        const pool = {
          connect:
            jest.fn()
              .mockResolvedValue(
                client
              ),
        };

        const manager =
          new PostgresPersistenceTransactionManager({
            pool,

            isolationLevel:
              "READ COMMITTED",
          });

        const result =
          await manager
            .run(
              async (
                transaction
              ) => {
                expect(
                  transaction.kind
                ).toBe(
                  "postgres"
                );

                expect(
                  transaction.client
                ).toBe(
                  client
                );

                return {
                  ok:
                    true,
                };
              }
            );

        expect(
          result
        ).toEqual({
          ok:
            true,
        });

        expect(
          client.query
        ).toHaveBeenNthCalledWith(
          1,
          "BEGIN ISOLATION LEVEL READ COMMITTED"
        );

        expect(
          client.query
        ).toHaveBeenNthCalledWith(
          2,
          "COMMIT"
        );

        expect(
          client.release
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );

    test(
      "rolls back failure and releases client",
      async () => {
        const client = {
          query:
            jest.fn()
              .mockResolvedValue(
                {}
              ),

          release:
            jest.fn(),
        };

        const pool = {
          connect:
            jest.fn()
              .mockResolvedValue(
                client
              ),
        };

        const manager =
          new PostgresPersistenceTransactionManager({
            pool,
          });

        await expect(
          manager.run(
            async () => {
              throw new Error(
                "boom"
              );
            }
          )
        ).rejects.toThrow(
          "boom"
        );

        expect(
          client.query
        ).toHaveBeenCalledWith(
          "ROLLBACK"
        );

        expect(
          client.release
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );

    test(
      "rejects unsupported isolation level",
      () => {
        expect(
          () =>
            new PostgresPersistenceTransactionManager({
              pool:
                {},

              isolationLevel:
                "CHAOS MODE",
            })
        ).toThrow(
          "Unsupported PostgreSQL transaction isolation level"
        );
      }
    );
  }
);