"use strict";


const {
  AdaptiveCapacityRunner,
} =
  require(
    "./adaptiveCapacityRunner"
  );


const {
  createCapacityDriver,

  buildProviderPayload,
} =
  require(
    "./integrationCapacityDriverRegistry"
  );


const {
  requireProvider,

  CAPACITY_TEST_MODE,
} =
  require(
    "./integrationCapacityRegistry"
  );


const LIVE_CAPACITY_CERTIFICATION_VERSION =
  "21.10B-live-v1";


const DEFAULT_LIVE_INGRESS_PROVIDERS =
  Object.freeze([
    "webhook_incoming",

    "prometheus_alertmanager",

    "grafana_alerting",

    "opentelemetry",
  ]);


const DEFAULT_SAFE_RATES =
  Object.freeze([
    25,
    50,
    100,
    250,
    500,
  ]);


class LiveIntegrationCapacityCertification {
  constructor(
    options =
      {}
  ) {
    this.stageDurationSeconds =
      options.stageDurationSeconds ||
      10;


    this.baselineRatePerSecond =
      options.baselineRatePerSecond ||
      5;


    this.maxConcurrency =
      options.maxConcurrency ||
      256;


    this.driverFactory =
      options.driverFactory ||
      createCapacityDriver;


    this.runnerFactory =
      options.runnerFactory ||
      (
        (
          runnerOptions
        ) =>
          new AdaptiveCapacityRunner(
            runnerOptions
          )
      );
  }


  async run({
    providers =
      DEFAULT_LIVE_INGRESS_PROVIDERS,

    rates =
      DEFAULT_SAFE_RATES,

    context,

    connectionFactory =
      null,
  } = {}) {
    assertCertificationContext(
      context
    );


    validateProviders(
      providers
    );


    const startedAt =
      new Date()
        .toISOString();


    const results =
      [];


    for (
      const provider
      of providers
    ) {
      const providerResult =
        await this
          .runProvider({
            provider,

            rates,

            context,

            connectionFactory,
          });


      results.push(
        providerResult
      );


      /*
       * Deliberate cooling period between providers.
       *
       * One connector's queues/event-loop work must not contaminate the
       * baseline of the next connector.
       */

      await sleep(
        1_000
      );
    }


    return deepFreeze({
      certificationVersion:
        LIVE_CAPACITY_CERTIFICATION_VERSION,

      startedAt,

      completedAt:
        new Date()
          .toISOString(),

      providerCount:
        results.length,

      providers:
        results,

      summary:
        summarize(
          results
        ),

      executionAuthorized:
        false,
    });
  }


  async runProvider({
    provider,

    rates,

    context,

    connectionFactory,
  }) {
    const definition =
      requireProvider(
        provider
      );


    if (
      definition.testMode !==
      CAPACITY_TEST_MODE.LIVE
    ) {
      throw certificationError(
        "CAPACITY_PROVIDER_NOT_LIVE",
        `${provider} is not eligible for LIVE capacity certification`
      );
    }


    const connection =
      typeof connectionFactory ===
        "function"
        ? await connectionFactory(
            provider,
            context
          )
        : buildDefaultConnection(
            provider,
            context
          );


    const driver =
      this.driverFactory(
        provider,
        {
          connection,
        }
      );


    if (
      driver.mode !==
      CAPACITY_TEST_MODE.LIVE
    ) {
      throw certificationError(
        "CAPACITY_DRIVER_NOT_LIVE",
        `${provider} resolved to ${driver.mode} instead of LIVE`
      );
    }


    const runner =
      this.runnerFactory({
        executor:
          async ({
            payload,
          }) =>
            driver.execute({
              payload,

              headers:
                buildHeaders(
                  provider
                ),
            }),

        stageDurationSeconds:
          this.stageDurationSeconds,

        baselineRatePerSecond:
          this.baselineRatePerSecond,

        maxConcurrency:
          this.maxConcurrency,
      });


    const result =
      await runner.run({
        provider,

        context,

        rates,

        stageDurationSeconds:
          this.stageDurationSeconds,

        stopAtBroken:
          true,

        payloadFactory:
          ({
            provider:
              currentProvider,

            sequence,

            rate,

            stage,
          }) => ({
            ...buildProviderPayload(
              currentProvider,
              sequence
            ),

            _airaReliability: {
              phase:
                "21",

              certification:
                "21.10B",

              stage,

              offeredRatePerSecond:
                rate,

              sequence,

              executionAuthorized:
                false,
            },
          }),
      });


    return Object.freeze({
      provider,

      displayName:
        definition.displayName,

      mode:
        definition.testMode,

      capabilities:
        [
          ...definition.capabilities,
        ],

      result,

      executionAuthorized:
        false,
    });
  }
}


function buildDefaultConnection(
  provider,
  context
) {
  const base = {
    provider,

    organizationId:
      context.organizationId,

    environmentId:
      context.environmentId,

    tenantId:
      context.tenantId ||
      context.organizationId,

    integrationId:
      context.integrationId ||
      context
        .integrationIds
        ?.[provider] ||
      null,

    nonSecretConfig:
      {},

    executionAuthorized:
      false,
  };


  if (
    provider ===
    "opentelemetry"
  ) {
    if (
      !base.tenantId
    ) {
      throw certificationError(
        "CAPACITY_OTEL_TENANT_REQUIRED",
        "OpenTelemetry capacity certification requires tenantId"
      );
    }


    if (
      !base.integrationId
    ) {
      throw certificationError(
        "CAPACITY_OTEL_INTEGRATION_REQUIRED",
        "OpenTelemetry capacity certification requires a real integrationId"
      );
    }


    return {
      ...base,

      nonSecretConfig: {
        transport:
          "http_json",

        maxBatchSize:
          10000,
      },
    };
  }


  return base;
}


function buildHeaders(
  provider
) {
  return {
    "content-type":
      "application/json",

    "x-aira-reliability-lab":
      "true",

    "x-aira-capacity-provider":
      provider,
  };
}


function summarize(
  results
) {
  let healthyProviders =
    0;

  let degradedProviders =
    0;

  let brokenProviders =
    0;

  let recoveredProviders =
    0;


  for (
    const provider
    of results
  ) {
    const result =
      provider.result;


    if (
      !result.degradationPoint
    ) {
      healthyProviders +=
        1;
    }
    else {
      degradedProviders +=
        1;
    }


    if (
      result.breakingPoint
    ) {
      brokenProviders +=
        1;
    }


    if (
      result.recovery
        ?.evaluation
        ?.recovered ===
      true
    ) {
      recoveredProviders +=
        1;
    }
  }


  return Object.freeze({
    providerCount:
      results.length,

    providersWithoutObservedDegradation:
      healthyProviders,

    providersWithObservedDegradation:
      degradedProviders,

    providersWithObservedBreakingPoint:
      brokenProviders,

    providersRecoveredToBaseline:
      recoveredProviders,

    executionAuthorized:
      false,
  });
}


function validateProviders(
  providers
) {
  if (
    !Array.isArray(
      providers
    ) ||

    providers.length ===
      0
  ) {
    throw certificationError(
      "CAPACITY_PROVIDERS_REQUIRED",
      "At least one capacity provider is required"
    );
  }


  const duplicates =
    providers.filter(
      (
        provider,
        index
      ) =>
        providers.indexOf(
          provider
        ) !==
        index
    );


  if (
    duplicates.length >
    0
  ) {
    throw certificationError(
      "CAPACITY_PROVIDER_DUPLICATE",
      `Duplicate capacity providers: ${[
        ...new Set(
          duplicates
        ),
      ].join(", ")}`
    );
  }
}


function assertCertificationContext(
  context
) {
  if (
    !context ||

    typeof context !==
      "object"
  ) {
    throw certificationError(
      "CAPACITY_CERT_CONTEXT_REQUIRED",
      "Capacity certification context is required"
    );
  }


  if (
    context.reliabilityLab !==
      true
  ) {
    throw certificationError(
      "CAPACITY_CERT_RELIABILITY_LAB_ONLY",
      "Live capacity certification is Reliability Lab-only"
    );
  }


  if (
    context.safetyClass !==
      "LAB_ONLY"
  ) {
    throw certificationError(
      "CAPACITY_CERT_LAB_ONLY_REQUIRED",
      "Live capacity certification requires LAB_ONLY"
    );
  }


  if (
    context.production ===
      true
  ) {
    throw certificationError(
      "CAPACITY_CERT_PRODUCTION_FORBIDDEN",
      "Production capacity testing is forbidden by Phase 21"
    );
  }


  if (
    context.executionAuthorized ===
      true
  ) {
    throw certificationError(
      "CAPACITY_CERT_CANNOT_AUTHORIZE",
      "Capacity certification cannot authorize execution"
    );
  }


  if (
    !context.organizationId
  ) {
    throw certificationError(
      "CAPACITY_CERT_ORGANIZATION_REQUIRED",
      "organizationId is required"
    );
  }


  if (
    !context.environmentId
  ) {
    throw certificationError(
      "CAPACITY_CERT_ENVIRONMENT_REQUIRED",
      "environmentId is required"
    );
  }
}


function sleep(
  ms
) {
  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function deepFreeze(
  value
) {
  if (
    !value ||

    typeof value !==
      "object" ||

    Object.isFrozen(
      value
    )
  ) {
    return value;
  }


  Object.freeze(
    value
  );


  Object.values(
    value
  ).forEach(
    deepFreeze
  );


  return value;
}


function certificationError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "LiveIntegrationCapacityCertificationError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  LIVE_CAPACITY_CERTIFICATION_VERSION,

  DEFAULT_LIVE_INGRESS_PROVIDERS,

  DEFAULT_SAFE_RATES,

  LiveIntegrationCapacityCertification,

  buildDefaultConnection,

  summarize,

  assertCertificationContext,

  certificationError,
};