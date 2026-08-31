"use strict";


const {
  CAPACITY_TEST_MODE,
} =
  require(
    "../../services/reliability/chaos/integrationCapacityRegistry"
  );


const {
  DEFAULT_LIVE_INGRESS_PROVIDERS,

  DEFAULT_SAFE_RATES,

  LiveIntegrationCapacityCertification,

  buildDefaultConnection,

  summarize,

  assertCertificationContext,
} =
  require(
    "../../services/reliability/chaos/liveIntegrationCapacityCertification"
  );


function labContext(
  overrides =
    {}
) {
  return {
    reliabilityLab:
      true,

    safetyClass:
      "LAB_ONLY",

    production:
      false,

    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 21.10B live capacity certification safety",

  () => {
    test(
      "default live ingress matrix contains four deterministic providers",

      () => {
        expect(
          DEFAULT_LIVE_INGRESS_PROVIDERS
        ).toEqual([
          "webhook_incoming",

          "prometheus_alertmanager",

          "grafana_alerting",

          "opentelemetry",
        ]);
      }
    );


    test(
      "default rate ramp is strictly increasing",

      () => {
        expect(
          DEFAULT_SAFE_RATES
        ).toEqual([
          25,
          50,
          100,
          250,
          500,
        ]);
      }
    );


    test(
      "production certification fails closed",

      () => {
        expect(
          () =>
            assertCertificationContext(
              labContext({
                production:
                  true,
              })
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "CAPACITY_CERT_PRODUCTION_FORBIDDEN",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "execution authorization is forbidden",

      () => {
        expect(
          () =>
            assertCertificationContext(
              labContext({
                executionAuthorized:
                  true,
              })
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "CAPACITY_CERT_CANNOT_AUTHORIZE",
          })
        );
      }
    );
  }
);


describe(
  "Phase 21.10B live provider connections",

  () => {
    test(
  "OpenTelemetry requires real tenant and integration identity",

  () => {
    const connection =
      buildDefaultConnection(
        "opentelemetry",

        labContext({
          tenantId:
            "aira-dev-org",

          integrationIds: {
            opentelemetry:
              "integration-otel-lab",
          },
        })
      );


    expect(
      connection.organizationId
    ).toBe(
      "aira-dev-org"
    );


    expect(
      connection.environmentId
    ).toBe(
      "env_aira_development"
    );


    expect(
      connection.tenantId
    ).toBe(
      "aira-dev-org"
    );


    expect(
      connection.integrationId
    ).toBe(
      "integration-otel-lab"
    );


    expect(
      connection.nonSecretConfig
        .transport
    ).toBe(
      "http_json"
    );


    expect(
      connection.executionAuthorized
    ).toBe(
      false
    );
  }
);


test(
  "OpenTelemetry refuses capacity certification without integration identity",

  () => {
    expect(
      () =>
        buildDefaultConnection(
          "opentelemetry",

          labContext()
        )
    ).toThrow(
      expect.objectContaining({
        code:
          "CAPACITY_OTEL_INTEGRATION_REQUIRED",

        executionAuthorized:
          false,
      })
    );
  }
);

  }
);


describe(
  "Phase 21.10B live certification orchestration",

  () => {
    test(
      "certifies providers sequentially and remains non-authorizing",

      async () => {
        const driverExecute =
          jest.fn(
            async () => ({
              success:
                true,

              statusCode:
                200,

              executionAuthorized:
                false,
            })
          );


        const driverFactory =
          jest.fn(
            (
              provider
            ) => ({
              provider,

              mode:
                CAPACITY_TEST_MODE
                  .LIVE,

              execute:
                driverExecute,
            })
          );


        const runnerRun =
          jest.fn(
            async ({
              provider,
            }) => ({
              provider,

              degradationPoint:
                null,

              saturationPoint:
                null,

              breakingPoint:
                null,

              safeSustainedRatePerSecond:
                500,

              recovery: {
                evaluation: {
                  recovered:
                    true,

                  executionAuthorized:
                    false,
                },
              },

              executionAuthorized:
                false,
            })
          );


        const certification =
          new LiveIntegrationCapacityCertification({
            stageDurationSeconds:
              1,

            baselineRatePerSecond:
              1,

            driverFactory,

            runnerFactory:
              () => ({
                run:
                  runnerRun,
              }),
          });


        const result =
          await certification.run({
            providers: [
              "webhook_incoming",

              "prometheus_alertmanager",
            ],

            rates: [
              10,
              20,
            ],

            context:
              labContext(),
          });


        expect(
          result.providerCount
        ).toBe(
          2
        );


        expect(
          result.summary
            .providersRecoveredToBaseline
        ).toBe(
          2
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          runnerRun
        ).toHaveBeenCalledTimes(
          2
        );
      }
    );


    test(
      "non-live provider cannot enter live certification",

      async () => {
        const certification =
          new LiveIntegrationCapacityCertification({
            runnerFactory:
              () => ({
                run:
                  jest.fn(),
              }),
          });


        await expect(
          certification.run({
            providers: [
              "aws_cloudwatch",
            ],

            rates: [
              10,
            ],

            context:
              labContext(),
          })
        ).rejects.toMatchObject({
          code:
            "CAPACITY_PROVIDER_NOT_LIVE",

          executionAuthorized:
            false,
        });
      }
    );
  }
);


describe(
  "Phase 21.10B capacity summary",

  () => {
    test(
      "summary distinguishes degradation breaking and recovery",

      () => {
        const result =
          summarize([
            {
              result: {
                degradationPoint:
                  null,

                breakingPoint:
                  null,

                recovery: {
                  evaluation: {
                    recovered:
                      true,
                  },
                },
              },
            },

            {
              result: {
                degradationPoint: {
                  targetRatePerSecond:
                    500,
                },

                breakingPoint: {
                  targetRatePerSecond:
                    1000,
                },

                recovery: {
                  evaluation: {
                    recovered:
                      true,
                  },
                },
              },
            },
          ]);


        expect(
          result
            .providerCount
        ).toBe(
          2
        );


        expect(
          result
            .providersWithoutObservedDegradation
        ).toBe(
          1
        );


        expect(
          result
            .providersWithObservedDegradation
        ).toBe(
          1
        );


        expect(
          result
            .providersWithObservedBreakingPoint
        ).toBe(
          1
        );


        expect(
          result
            .providersRecoveredToBaseline
        ).toBe(
          2
        );
      }
    );
  }
);