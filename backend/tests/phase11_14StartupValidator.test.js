"use strict";

const {
  validateEnvironment,
  inspectEnvironment,
  getSafeConfigurationSnapshot,
  StartupConfigurationError,
} =
  require(
    "../config/startupValidator"
  );


describe(
  "Phase 11.14 Production Configuration Validation",
  () => {
    // ========================================================================
    // HELPERS
    // ========================================================================

    function validProductionEnv() {
      return {
        NODE_ENV:
          "production",

        AUDIT_SECRET:
          "AIRA-Audit-Secret-2026-Strong-Value-!@#$-123456789",

        AUTH_AUDIT_SECRET:
          "AIRA-Auth-Audit-Secret-2026-Strong-Value-!@#$-987654321",

        INTEGRATION_SECRET_KEY:
          "AIRA-Integration-Secret-2026-Strong-Value-!@#$-123456789",

        IP_HASH_SALT:
          "AIRA-IP-Hash-Salt-2026-Strong-Value-!@#$-123456789",

        MONGODB_URI:
          "mongodb+srv://user:password@example.mongodb.net/aira",

        REDIS_URL:
          "rediss://redis.example.com:6379",

        RABBITMQ_URL:
          "amqps://rabbitmq.example.com:5671",

        CORS_ORIGINS:
          "https://autonomous-incident-recovery-agent-ten.vercel.app,https://autonomous-incident-recovery-agent-aira-system-id1961ym5.vercel.app",

        NODE_INSTANCE_ID:
          "aira-prod-01",

        PORT:
          "5000",

        SESSION_IDLE_TIMEOUT_MS:
          "1800000",

        SESSION_ABSOLUTE_TIMEOUT_MS:
          "28800000",

        SESSION_REMEMBER_ME_TIMEOUT_MS:
          "2592000000",

        SESSION_ACTIVITY_THROTTLE_MS:
          "60000",

        SERVER_SHUTDOWN_TIMEOUT_MS:
          "30000",

        WORKFLOW_OUTBOX_SHUTDOWN_TIMEOUT_MS:
          "10000",

        QUEUE_MAX_IN_FLIGHT_PUBLISHES:
          "100",

        QUEUE_PUBLISH_DRAIN_TIMEOUT_MS:
          "5000",

        QUEUE_PUBLISH_RETRY_AFTER_MS:
          "1000",

        RETENTION_JOB_INTERVAL_MINUTES:
          "5",

        RETENTION_MAX_PATTERN_OCCURRENCES:
          "100",

        LOG_LEVEL:
          "info",

        LOG_TO_FILE:
          "false",
      };
    }


    // ========================================================================
    // VALID PRODUCTION
    // ========================================================================

    test(
      "valid production configuration passes",
      () => {
        const report =
          inspectEnvironment({
            env:
              validProductionEnv(),

            isProduction:
              true,
          });


        expect(
          report.valid
        )
          .toBe(
            true
          );


        expect(
          report.errors
        )
          .toEqual(
            []
          );


        expect(
          report.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "validateEnvironment returns report for valid configuration",
      () => {
        const report =
          validateEnvironment({
            env:
              validProductionEnv(),

            isProduction:
              true,

            silent:
              true,
          });


        expect(
          report
        )
          .toMatchObject({
            valid:
              true,

            production:
              true,

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // REQUIRED SECRETS
    // ========================================================================

    test(
      "missing AUDIT_SECRET fails closed",
      () => {
        const env =
          validProductionEnv();


        delete env
          .AUDIT_SECRET;


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.valid
        )
          .toBe(
            false
          );


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_SECRET_MISSING",

                variable:
                  "AUDIT_SECRET",
              }),
            ])
          );
      }
    );


    test(
      "short production integration secret is rejected",
      () => {
        const env =
          validProductionEnv();


        env
          .INTEGRATION_SECRET_KEY =
          "too-short";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_SECRET_TOO_SHORT",

                variable:
                  "INTEGRATION_SECRET_KEY",
              }),
            ])
          );
      }
    );


    test(
      "placeholder secrets are rejected in production",
      () => {
        const env =
          validProductionEnv();


        env
          .AUDIT_SECRET =
          "changeme-changeme-changeme-changeme-changeme-changeme";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_PLACEHOLDER_SECRET",

                variable:
                  "AUDIT_SECRET",
              }),
            ])
          );
      }
    );


    // ========================================================================
    // DEPENDENCY URLS
    // ========================================================================

    test(
      "malformed MongoDB URL is rejected",
      () => {
        const env =
          validProductionEnv();


        env
          .MONGODB_URI =
          "not-a-mongodb-url";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_DEPENDENCY_URL_INVALID",

                variable:
                  "MONGODB_URI",
              }),
            ])
          );
      }
    );


    test(
      "RabbitMQ URL must use amqp or amqps",
      () => {
        const env =
          validProductionEnv();


        env
          .RABBITMQ_URL =
          "https://rabbitmq.example.com";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_DEPENDENCY_URL_INVALID",

                variable:
                  "RABBITMQ_URL",
              }),
            ])
          );
      }
    );


    // ========================================================================
    // CORS
    // ========================================================================

    test(
      "wildcard CORS is rejected in production",
      () => {
        const env =
          validProductionEnv();


        env
          .CORS_ORIGINS =
          "*";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_CORS_WILDCARD_FORBIDDEN",

                variable:
                  "CORS_ORIGINS",
              }),
            ])
          );
      }
    );


    test(
      "non-HTTPS production CORS origin is rejected",
      () => {
        const env =
          validProductionEnv();


        env
          .CORS_ORIGINS =
          "http://example.com";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_CORS_HTTPS_REQUIRED",

                variable:
                  "CORS_ORIGINS",
              }),
            ])
          );
      }
    );


    // ========================================================================
    // DEPLOYMENT MODE
    // ========================================================================

    test(
      "multi-instance mode requires Redis",
      () => {
        const env =
          validProductionEnv();


        delete env
          .REDIS_URL;


        env
          .NODE_INSTANCE_ID =
          "aira-01";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_MULTI_INSTANCE_REDIS_REQUIRED",

                variable:
                  "REDIS_URL",
              }),
            ])
          );
      }
    );


    test(
      "invalid NODE_INSTANCE_ID is rejected",
      () => {
        const env =
          validProductionEnv();


        env
          .NODE_INSTANCE_ID =
          "instance id with spaces";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_NODE_INSTANCE_ID_INVALID",
              }),
            ])
          );
      }
    );


    // ========================================================================
    // NUMERIC BOUNDS
    // ========================================================================

    test(
      "invalid numeric configuration is rejected",
      () => {
        const env =
          validProductionEnv();


        env
          .QUEUE_MAX_IN_FLIGHT_PUBLISHES =
          "not-a-number";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_INTEGER_INVALID",

                variable:
                  "QUEUE_MAX_IN_FLIGHT_PUBLISHES",
              }),
            ])
          );
      }
    );


    test(
      "out-of-range numeric configuration is rejected",
      () => {
        const env =
          validProductionEnv();


        env
          .PORT =
          "99999";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_INTEGER_OUT_OF_RANGE",

                variable:
                  "PORT",
              }),
            ])
          );
      }
    );


    // ========================================================================
    // CROSS FIELD RULES
    // ========================================================================

    test(
      "session idle timeout cannot exceed absolute timeout",
      () => {
        const env =
          validProductionEnv();


        env
          .SESSION_IDLE_TIMEOUT_MS =
          "30000000";


        env
          .SESSION_ABSOLUTE_TIMEOUT_MS =
          "10000000";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_SESSION_IDLE_EXCEEDS_ABSOLUTE",
              }),
            ])
          );
      }
    );


    test(
      "outbox shutdown timeout must remain below global shutdown timeout",
      () => {
        const env =
          validProductionEnv();


        env
          .SERVER_SHUTDOWN_TIMEOUT_MS =
          "10000";


        env
          .WORKFLOW_OUTBOX_SHUTDOWN_TIMEOUT_MS =
          "15000";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_OUTBOX_SHUTDOWN_EXCEEDS_GLOBAL",
              }),
            ])
          );
      }
    );


    // ========================================================================
    // UNSAFE PRODUCTION FLAGS
    // ========================================================================

    test(
      "unsafe execution bypass is forbidden in production",
      () => {
        const env =
          validProductionEnv();


        env
          .ALLOW_UNSAFE_EXECUTION =
          "true";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_UNSAFE_EXECUTION_ENABLED",
              }),
            ])
          );
      }
    );


    test(
      "startup recovery cannot be disabled in production",
      () => {
        const env =
          validProductionEnv();


        env
          .SKIP_STARTUP_RECOVERY =
          "true";


        const report =
          inspectEnvironment({
            env,

            isProduction:
              true,
          });


        expect(
          report.errors
        )
          .toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  "CONFIG_STARTUP_RECOVERY_DISABLED",
              }),
            ])
          );
      }
    );


    // ========================================================================
    // DEVELOPMENT BEHAVIOR
    // ========================================================================

    test(
      "development does not require production dependency URLs",
      () => {
        const env = {
          NODE_ENV:
            "development",

          AUDIT_SECRET:
            "Development-Audit-Secret-Strong-Value-1234567890-!@#",
        };


        const report =
          inspectEnvironment({
            env,

            isProduction:
              false,
          });


        expect(
          report.valid
        )
          .toBe(
            true
          );


        expect(
          report.production
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // STRUCTURED FAILURE
    // ========================================================================

    test(
      "validateEnvironment throws structured startup configuration error",
      () => {
        const env =
          validProductionEnv();


        delete env
          .MONGODB_URI;


        expect(
          () =>
            validateEnvironment({
              env,

              isProduction:
                true,

              silent:
                true,
            })
        )
          .toThrow(
            StartupConfigurationError
          );


        try {
          validateEnvironment({
            env,

            isProduction:
              true,

            silent:
              true,
          });
        } catch (
          error
        ) {
          expect(
            error
          )
            .toMatchObject({
              code:
                "AIRA_STARTUP_CONFIGURATION_INVALID",

              executionAuthorized:
                false,
            });


          expect(
            error.report.valid
          )
            .toBe(
              false
            );
        }
      }
    );


    // ========================================================================
    // SAFE SNAPSHOT
    // ========================================================================

    test(
      "configuration snapshot never exposes secrets or dependency credentials",
      () => {
        const env =
          validProductionEnv();


        const snapshot =
          getSafeConfigurationSnapshot(
            env
          );


        expect(
          snapshot
            .AUDIT_SECRET
        )
          .toBe(
            "[REDACTED]"
          );


        expect(
          snapshot
            .INTEGRATION_SECRET_KEY
        )
          .toBe(
            "[REDACTED]"
          );


        expect(
          snapshot
            .MONGODB_URI
        )
          .toBe(
            "[REDACTED]"
          );


        expect(
          snapshot
            .REDIS_URL
        )
          .toBe(
            "[REDACTED]"
          );


        expect(
          JSON.stringify(
            snapshot
          )
        )
          .not
          .toContain(
            "password@example"
          );
      }
    );


    // ========================================================================
    // SAFETY CONTRACT
    // ========================================================================

    test(
      "configuration validation can never grant execution authority",
      () => {
        const valid =
          inspectEnvironment({
            env:
              validProductionEnv(),

            isProduction:
              true,
          });


        expect(
          valid
            .executionAuthorized
        )
          .toBe(
            false
          );


        const invalidEnv =
          validProductionEnv();


        delete invalidEnv
          .AUDIT_SECRET;


        const invalid =
          inspectEnvironment({
            env:
              invalidEnv,

            isProduction:
              true,
          });


        expect(
          invalid
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);