"use strict";

describe(
  "dbService provider selection",
  () => {
    let dbService;

    beforeEach(
      () => {
        jest
          .resetModules();

        dbService =
          require(
            "../dbService"
          );
      }
    );

    test(
      "mongo provider requires Mongo",
      () => {
        expect(
          dbService
            .shouldConnectMongo({
              provider:
                "mongo",

              migrationMode:
                "disabled",
            })
        )
          .toBe(
            true
          );
      }
    );

    test(
      "postgres provider does not require Mongo in normal runtime",
      () => {
        expect(
          dbService
            .shouldConnectMongo({
              provider:
                "postgres",

              migrationMode:
                "disabled",
            })
        )
          .toBe(
            false
          );
      }
    );

    test(
      "postgres provider requires PostgreSQL",
      () => {
        expect(
          dbService
            .shouldConnectPostgres({
              provider:
                "postgres",

              migrationMode:
                "disabled",
            })
        )
          .toBe(
            true
          );
      }
    );

    test(
      "shadow migration requires Mongo",
      () => {
        expect(
          dbService
            .shouldConnectMongo({
              provider:
                "mongo",

              migrationMode:
                "shadow",
            })
        )
          .toBe(
            true
          );
      }
    );

    test(
      "backfill migration requires PostgreSQL",
      () => {
        expect(
          dbService
            .shouldConnectPostgres({
              provider:
                "mongo",

              migrationMode:
                "backfill",
            })
        )
          .toBe(
            true
          );
      }
    );

    test(
      "invalid persistence provider fails closed",
      () => {
        expect(
          () =>
            dbService
              .normalizeProvider(
                "sqlite"
              )
        )
          .toThrow(
            "Unsupported persistence provider"
          );
      }
    );
  }
);