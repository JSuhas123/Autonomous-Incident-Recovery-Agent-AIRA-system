"use strict";

const {
  MetricsVerificationService,
} =
  require(
    "../metricsVerificationService"
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

function metricCheck(
  overrides = {}
) {
  return {
    checkId:
      "metric-1",

    dimension:
      VERIFICATION_DIMENSION
        .METRICS,

    type:
      "cpu_recovery",

    threshold:
      70,

    timeoutMs:
      1000,

    parameters:
      {},

    ...overrides,
  };
}

describe(
  "MetricsVerificationService",
  () => {
    test(
      "passes CPU metric below threshold",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck(),
            ]),

            {
              async getMetricValue() {
                return {
                  value:
                    45,

                  evidence: [
                    {
                      source:
                        "prometheus",
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
      "fails CPU metric above threshold",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck(),
            ]),

            {
              async getMetricValue() {
                return {
                  value:
                    95,
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
      "passes memory metric below threshold",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck({
                type:
                  "memory_recovery",

                threshold:
                  80,
              }),
            ]),

            {
              async getMetricValue() {
                return {
                  value:
                    60,
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
      "passes latency below threshold",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck({
                type:
                  "latency_recovery",

                threshold:
                  200,
              }),
            ]),

            {
              async getMetricValue() {
                return {
                  value:
                    120,
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
      "passes error rate below threshold",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck({
                type:
                  "error_rate_recovery",

                threshold:
                  1,
              }),
            ]),

            {
              async getMetricValue() {
                return {
                  value:
                    0.2,
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
      "throughput requires minimum threshold",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck({
                type:
                  "throughput_recovery",

                threshold:
                  100,
              }),
            ]),

            {
              async getMetricValue() {
                return {
                  value:
                    150,
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
      "throughput below threshold fails",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck({
                type:
                  "throughput_recovery",

                threshold:
                  100,
              }),
            ]),

            {
              async getMetricValue() {
                return {
                  value:
                    50,
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
      "custom metric supports comparison operator",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck({
                type:
                  "custom_metric",

                threshold:
                  500,

                parameters: {
                  metric:
                    "requests_per_second",

                  operator:
                    ">=",
                },
              }),
            ]),

            {
              async getMetricValue() {
                return {
                  value:
                    800,
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
      "baseline recovery threshold may be used when explicit threshold missing",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck({
                threshold:
                  null,
              }),
            ]),

            {
              async getMetricValue() {
                return {
                  value:
                    50,
                };
              },

              async getMetricBaseline() {
                return {
                  value:
                    40,

                  recoveryThreshold:
                    60,
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
            40
          );
      }
    );

    test(
      "missing metric provider becomes inconclusive",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck(),
            ])
          );

        expect(
          result.inconclusiveCount
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
              .INCONCLUSIVE
          );
      }
    );

    test(
      "non-numeric observation becomes inconclusive",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck(),
            ]),

            {
              async getMetricValue() {
                return {
                  value:
                    "unknown",
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
      "metric timeout is surfaced",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck({
                timeoutMs:
                  10,
              }),
            ]),

            {
              async getMetricValue() {
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
                  value:
                    20,
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
      "ignores non-metric checks",
      async () => {
        const service =
          new MetricsVerificationService();

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
      "unsupported metric check becomes inconclusive",
      async () => {
        const service =
          new MetricsVerificationService();

        const result =
          await service.verify(
            baseInput([
              metricCheck({
                type:
                  "something_unknown",
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
      "never accepts execution authorization",
      async () => {
        const service =
          new MetricsVerificationService();

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
              "METRICS_VERIFICATION_UNSAFE_INPUT",
          });
      }
    );
  }
);