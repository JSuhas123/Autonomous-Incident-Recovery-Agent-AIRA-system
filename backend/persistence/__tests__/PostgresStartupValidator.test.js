"use strict";

const {
  validatePostgresConfiguration,
} =
  require(
    "../../config/startupValidator"
  );

describe(
  "PostgreSQL startup configuration validation",
  () => {
    test(
      "does nothing while PostgreSQL is disabled",
      () => {
        const errors = [];
        const warnings = [];

        validatePostgresConfiguration({
          env: {
            POSTGRES_ENABLED:
              "false",
          },

          errors,

          warnings,

          production:
            true,
        });

        expect(
          errors
        ).toEqual([]);

        expect(
          warnings
        ).toEqual([]);
      }
    );

    test(
      "accepts enabled development configuration",
      () => {
        const errors = [];
        const warnings = [];

        validatePostgresConfiguration({
          env: {
            POSTGRES_ENABLED:
              "true",

            POSTGRES_HOST:
              "127.0.0.1",

            POSTGRES_PORT:
              "5432",

            POSTGRES_DATABASE:
              "aira",

            POSTGRES_USER:
              "aira",

            POSTGRES_PASSWORD:
              "secret",

            POSTGRES_POOL_MIN:
              "0",

            POSTGRES_POOL_MAX:
              "20",

            POSTGRES_SSL:
              "false",

            POSTGRES_TRANSACTION_ISOLATION:
              "READ COMMITTED",
          },

          errors,

          warnings,

          production:
            false,
        });

        expect(
          errors
        ).toEqual([]);
      }
    );

    test(
      "rejects invalid pool range",
      () => {
        const errors = [];
        const warnings = [];

        validatePostgresConfiguration({
          env: {
            POSTGRES_ENABLED:
              "true",

            POSTGRES_POOL_MIN:
              "30",

            POSTGRES_POOL_MAX:
              "10",
          },

          errors,

          warnings,

          production:
            false,
        });

        expect(
          errors.some(
            (
              error
            ) =>
              error.code ===
              "CONFIG_POSTGRES_POOL_RANGE_INVALID"
          )
        ).toBe(
          true
        );
      }
    );

    test(
      "rejects unsupported transaction isolation",
      () => {
        const errors = [];
        const warnings = [];

        validatePostgresConfiguration({
          env: {
            POSTGRES_ENABLED:
              "true",

            POSTGRES_TRANSACTION_ISOLATION:
              "CHAOS MODE",
          },

          errors,

          warnings,

          production:
            false,
        });

        expect(
          errors.some(
            (
              error
            ) =>
              error.code ===
              "CONFIG_POSTGRES_ISOLATION_INVALID"
          )
        ).toBe(
          true
        );
      }
    );

    test(
      "production requires explicit connection configuration",
      () => {
        const errors = [];
        const warnings = [];

        validatePostgresConfiguration({
          env: {
            POSTGRES_ENABLED:
              "true",
          },

          errors,

          warnings,

          production:
            true,
        });

        expect(
          errors.some(
            (
              error
            ) =>
              error.code ===
              "CONFIG_POSTGRES_HOST_MISSING"
          )
        ).toBe(
          true
        );

        expect(
          errors.some(
            (
              error
            ) =>
              error.code ===
              "CONFIG_POSTGRES_DATABASE_MISSING"
          )
        ).toBe(
          true
        );

        expect(
          errors.some(
            (
              error
            ) =>
              error.code ===
              "CONFIG_POSTGRES_USER_MISSING"
          )
        ).toBe(
          true
        );
      }
    );
  }
);