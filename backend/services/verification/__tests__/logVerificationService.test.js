"use strict";

const {
  LogVerificationService,
} =
  require(
    "../logVerificationService"
  );

const {
  VERIFICATION_DIMENSION,
  VERIFICATION_CHECK_STATUS,
} =
  require(
    "../verificationContracts"
  );

function baseInput(
  checks,
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    executionRequestId:
      "request-1",

    verificationPlan: {
      checks,
    },

    incident: {
      errorFingerprint:
        "ECONNREFUSED postgres:5432",
    },

    context: {
      service: {
        id:
          "payment-api",
      },
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

function logCheck(
  overrides = {}
) {
  return {
    checkId:
      "logs-1",

    dimension:
      VERIFICATION_DIMENSION
        .LOGS,

    type:
      "error_rate_recovery",

    threshold:
      5,

    timeoutMs:
      1000,

    parameters:
      {},

    ...overrides,
  };
}

describe(
  "LogVerificationService",
  () => {
    test(
      "passes when post-recovery error volume is below threshold",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck(),
            ]),

            {
              async getErrorVolume() {
                return {
                  current:
                    2,

                  baseline:
                    1,

                  evidence: [
                    {
                      source:
                        "loki",
                    },
                  ],
                };
              },
            }
          );

        expect(
          result.passedCount
        )
          .toBe(
            1
          );

        expect(
          result.checks[0]
            .status
        )
          .toBe(
            VERIFICATION_CHECK_STATUS
              .PASSED
          );
      }
    );

    test(
      "fails when error volume remains above threshold",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck(),
            ]),

            {
              async getErrorVolume() {
                return {
                  current:
                    50,

                  baseline:
                    1,
                };
              },
            }
          );

        expect(
          result.failedCount
        )
          .toBe(
            1
          );
      }
    );

    test(
      "uses baseline when explicit threshold is unavailable",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck({
                threshold:
                  null,
              }),
            ]),

            {
              async getErrorVolume() {
                return {
                  current:
                    3,

                  baseline:
                    5,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .passed
        )
          .toBe(
            true
          );

        expect(
          result.checks[0]
            .baselineValue
        )
          .toBe(
            5
          );
      }
    );

    test(
      "passes when incident fingerprint is absent",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck({
                type:
                  "error_fingerprint_cleared",

                threshold:
                  0,
              }),
            ]),

            {
              async searchLogs() {
                return {
                  matchCount:
                    0,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .passed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "fails when incident fingerprint remains present",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck({
                type:
                  "error_fingerprint_cleared",

                threshold:
                  0,
              }),
            ]),

            {
              async searchLogs() {
                return {
                  matchCount:
                    4,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .failed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "passes when HTTP 5xx signatures are absent",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck({
                type:
                  "http_5xx_cleared",

                threshold:
                  0,
              }),
            ]),

            {
              async searchLogs() {
                return {
                  count:
                    0,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .passed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "detects CrashLoop signatures",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck({
                type:
                  "crashloop_cleared",

                threshold:
                  0,
              }),
            ]),

            {
              async searchLogs() {
                return {
                  matchCount:
                    2,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .failed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "detects OOM signatures",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck({
                type:
                  "oom_cleared",

                threshold:
                  0,
              }),
            ]),

            {
              async searchLogs() {
                return {
                  matchCount:
                    1,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .status
        )
          .toBe(
            VERIFICATION_CHECK_STATUS
              .FAILED
          );
      }
    );

    test(
      "passes when connection failure signatures disappear",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck({
                type:
                  "connection_errors_cleared",

                threshold:
                  0,
              }),
            ]),

            {
              async searchLogs() {
                return {
                  matches:
                    [],
                };
              },
            }
          );

        expect(
          result.checks[0]
            .passed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "missing log provider becomes inconclusive",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck({
                type:
                  "http_5xx_cleared",
              }),
            ])
          );

        expect(
          result.inconclusiveCount
        )
          .toBe(
            1
          );
      }
    );

    test(
      "missing fingerprint becomes inconclusive",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput(
              [
                logCheck({
                  type:
                    "error_fingerprint_cleared",
                }),
              ],
              {
                incident: {},
              }
            ),

            {
              async searchLogs() {
                return {
                  matchCount:
                    0,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .status
        )
          .toBe(
            VERIFICATION_CHECK_STATUS
              .INCONCLUSIVE
          );
      }
    );

    test(
      "log timeout is surfaced",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck({
                type:
                  "http_5xx_cleared",

                timeoutMs:
                  10,
              }),
            ]),

            {
              async searchLogs() {
                await new Promise(
                  (
                    resolve
                  ) =>
                    setTimeout(
                      resolve,
                      100
                    )
                );

                return {
                  matchCount:
                    0,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .status
        )
          .toBe(
            VERIFICATION_CHECK_STATUS
              .TIMED_OUT
          );
      }
    );

    test(
      "unsupported log verifier becomes inconclusive",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              logCheck({
                type:
                  "unknown_log_check",
              }),
            ])
          );

        expect(
          result.checks[0]
            .status
        )
          .toBe(
            VERIFICATION_CHECK_STATUS
              .INCONCLUSIVE
          );
      }
    );

    test(
      "ignores non-log verification checks",
      async () => {
        const service =
          new LogVerificationService();

        const result =
          await service.verify(
            baseInput([
              {
                checkId:
                  "health",

                dimension:
                  VERIFICATION_DIMENSION
                    .HEALTH,

                type:
                  "service_health",
              },
            ])
          );

        expect(
          result.checkCount
        )
          .toBe(
            0
          );
      }
    );

    test(
      "never accepts execution authorization",
      async () => {
        const service =
          new LogVerificationService();

        await expect(
          service.verify({
            ...baseInput(
              []
            ),

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "LOG_VERIFICATION_UNSAFE_INPUT",
          });
      }
    );
  }
);