"use strict";

const {
  HealthVerificationService,
} =
  require(
    "../healthVerificationService"
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

        namespace:
          "production",
      },
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "HealthVerificationService",
  () => {
    test(
      "passes healthy service check",
      async () => {
        const service =
          new HealthVerificationService();

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

                expectedValue:
                  "healthy",

                timeoutMs:
                  1000,

                parameters:
                  {},
              },
            ]),

            {
              async getServiceHealth() {
                return {
                  healthy:
                    true,

                  status:
                    "healthy",

                  evidence: [
                    {
                      source:
                        "health-endpoint",
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
      "fails unhealthy service check",
      async () => {
        const service =
          new HealthVerificationService();

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

                timeoutMs:
                  1000,

                parameters:
                  {},
              },
            ]),

            {
              async getServiceHealth() {
                return {
                  healthy:
                    false,

                  status:
                    "unhealthy",

                  reason:
                    "Service still returning 503.",
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
      "passes deployment readiness check",
      async () => {
        const service =
          new HealthVerificationService();

        const result =
          await service.verify(
            baseInput([
              {
                checkId:
                  "deployment",

                dimension:
                  VERIFICATION_DIMENSION
                    .RESOURCE_STATE,

                type:
                  "deployment_ready",

                timeoutMs:
                  1000,

                parameters: {
                  resourceId:
                    "payment-api",

                  namespace:
                    "production",
                },
              },
            ]),

            {
              async getResourceReadiness() {
                return {
                  ready:
                    true,

                  status:
                    "ready",
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
      }
    );

    test(
      "passes liveness check",
      async () => {
        const service =
          new HealthVerificationService();

        const result =
          await service.verify(
            baseInput([
              {
                checkId:
                  "live",

                dimension:
                  VERIFICATION_DIMENSION
                    .HEALTH,

                type:
                  "liveness",

                timeoutMs:
                  1000,

                parameters:
                  {},
              },
            ]),

            {
              async getLiveness() {
                return {
                  alive:
                    true,
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
      "passes readiness check",
      async () => {
        const service =
          new HealthVerificationService();

        const result =
          await service.verify(
            baseInput([
              {
                checkId:
                  "ready",

                dimension:
                  VERIFICATION_DIMENSION
                    .HEALTH,

                type:
                  "readiness",

                timeoutMs:
                  1000,

                parameters:
                  {},
              },
            ]),

            {
              async getReadiness() {
                return {
                  ready:
                    true,
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
      "passes dependency health check",
      async () => {
        const service =
          new HealthVerificationService();

        const result =
          await service.verify(
            baseInput([
              {
                checkId:
                  "db",

                dimension:
                  VERIFICATION_DIMENSION
                    .DEPENDENCY_STATE,

                type:
                  "dependency_health",

                timeoutMs:
                  1000,

                parameters: {
                  dependencyId:
                    "postgres",
                },
              },
            ]),

            {
              async getDependencyHealth() {
                return {
                  healthy:
                    true,

                  reachable:
                    true,
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
      "missing provider returns inconclusive",
      async () => {
        const service =
          new HealthVerificationService();

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

                timeoutMs:
                  1000,

                parameters:
                  {},
              },
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
      "health verification timeout is surfaced",
      async () => {
        const service =
          new HealthVerificationService();

        const result =
          await service.verify(
            baseInput([
              {
                checkId:
                  "slow-health",

                dimension:
                  VERIFICATION_DIMENSION
                    .HEALTH,

                type:
                  "service_health",

                timeoutMs:
                  10,

                parameters:
                  {},
              },
            ]),

            {
              async getServiceHealth() {
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
                  healthy:
                    true,
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
      "ignores metric and log checks",
      async () => {
        const service =
          new HealthVerificationService();

        const result =
          await service.verify(
            baseInput([
              {
                checkId:
                  "cpu",

                dimension:
                  VERIFICATION_DIMENSION
                    .METRICS,

                type:
                  "cpu_recovery",
              },

              {
                checkId:
                  "logs",

                dimension:
                  VERIFICATION_DIMENSION
                    .LOGS,

                type:
                  "error_rate_recovery",
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
      "unsupported health check becomes inconclusive",
      async () => {
        const service =
          new HealthVerificationService();

        const result =
          await service.verify(
            baseInput([
              {
                checkId:
                  "custom",

                dimension:
                  VERIFICATION_DIMENSION
                    .HEALTH,

                type:
                  "some_unknown_health_check",
              },
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
          new HealthVerificationService();

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
              "HEALTH_VERIFICATION_UNSAFE_INPUT",
          });
      }
    );
  }
);