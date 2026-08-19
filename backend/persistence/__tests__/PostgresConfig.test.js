"use strict";

const {
  getPostgresConfig,
  buildPgPoolOptions,
} =
  require(
    "../../config/postgres"
  );

describe(
  "PostgreSQL configuration",
  () => {
    test(
      "is disabled by default",
      () => {
        const config =
          getPostgresConfig({
            NODE_ENV:
              "test",
          });

        expect(
          config.enabled
        ).toBe(
          false
        );
      }
    );

    test(
      "builds bounded local configuration",
      () => {
        const config =
          getPostgresConfig({
            NODE_ENV:
              "test",

            POSTGRES_ENABLED:
              "true",

            POSTGRES_HOST:
              "localhost",

            POSTGRES_DATABASE:
              "aira_test",

            POSTGRES_USER:
              "aira",

            POSTGRES_PASSWORD:
              "secret",

            POSTGRES_POOL_MAX:
              "25",

            POSTGRES_SSL:
              "false",
          });

        expect(
          config.enabled
        ).toBe(
          true
        );

        expect(
          config.pool.max
        ).toBe(
          25
        );

        const options =
          buildPgPoolOptions(
            config
          );

        expect(
          options.database
        ).toBe(
          "aira_test"
        );

        expect(
          options.ssl
        ).toBe(
          false
        );
      }
    );

    test(
      "rejects pool min greater than max",
      () => {
        expect(
          () =>
            getPostgresConfig({
              POSTGRES_ENABLED:
                "true",

              POSTGRES_POOL_MIN:
                "20",

              POSTGRES_POOL_MAX:
                "10",
            })
        ).toThrow(
          "POSTGRES_POOL_MIN cannot exceed POSTGRES_POOL_MAX"
        );
      }
    );
  }
);