"use strict";


const {
  getAdapter,

  hasAdapter,
} =
  require(
    "../../integrations/adapterRegistry"
  );


const {
  requireProvider,

  CAPACITY_TEST_MODE,
} =
  require(
    "./integrationCapacityRegistry"
  );


const CAPACITY_DRIVER_VERSION =
  "21.10B-v1";


function createCapacityDriver(
  provider,
  options =
    {}
) {
  const definition =
    requireProvider(
      provider
    );


  if (
    definition.testMode ===
      CAPACITY_TEST_MODE
        .CONTRACT_ONLY
  ) {
    return createContractDriver(
      definition
    );
  }


  if (
    !hasAdapter(
      provider
    )
  ) {
    return createSimulatedDriver(
      definition,

      options
    );
  }


  return createAdapterDriver(
    definition,

    getAdapter(
      provider
    ),

    options
  );
}


function createAdapterDriver(
  definition,
  adapter,
  options =
    {}
) {
  const connection =
    options.connection ||
    {
      provider:
        definition.provider,

      nonSecretConfig:
        {},

      executionAuthorized:
        false,
    };


  return Object.freeze({
    provider:
      definition.provider,

    mode:
      definition.testMode,

    driverVersion:
      CAPACITY_DRIVER_VERSION,

    async execute({
      payload,

      headers =
        {},
    } = {}) {
      const startedAt =
        process.hrtime
          .bigint();


      try {
        let result;


        if (
          typeof adapter
            .receiveEvent ===
            "function" &&

          definition
            .capabilities
            .includes(
              "receive_events"
            )
        ) {
          result =
            await adapter
              .receiveEvent(
                connection,

                payload,

                headers
              );
        }
        else if (
          typeof adapter
            .normalizeEvent ===
            "function" &&

          definition
            .capabilities
            .includes(
              "normalize_events"
            )
        ) {
          result =
            await adapter
              .normalizeEvent(
                payload
              );
        }
        else if (
          typeof adapter
            .getHealth ===
            "function"
        ) {
          result =
            await adapter
              .getHealth(
                connection
              );
        }
        else if (
          typeof adapter
            .healthCheck ===
            "function"
        ) {
          result =
            await adapter
              .healthCheck(
                connection
              );
        }
        else {
          throw driverError(
            "CAPACITY_ADAPTER_OPERATION_UNAVAILABLE",
            `No safe capacity-test operation is available for ${definition.provider}`
          );
        }


        return {
          success:
            true,

          statusCode:
            200,

          provider:
            definition.provider,

          providerResultPresent:
            result !==
            undefined,

          measuredLatencyMs:
            elapsedMs(
              startedAt
            ),

          executionAuthorized:
            false,
        };
      } catch (
        error
      ) {
        return {
          success:
            false,

          statusCode:
            error.status ||
            error.statusCode ||
            null,

          errorCode:
            error.code ||
            "CAPACITY_ADAPTER_FAILED",

          timedOut:
            error.code ===
              "ETIMEDOUT",

          rateLimited:
            error.status ===
              429 ||
            error.statusCode ===
              429,

          rejected:
            false,

          measuredLatencyMs:
            elapsedMs(
              startedAt
            ),

          executionAuthorized:
            false,
        };
      }
    },
  });
}


function createSimulatedDriver(
  definition,
  options =
    {}
) {
  const simulatedLatencyMs =
    Number.isFinite(
      options.simulatedLatencyMs
    )
      ? options.simulatedLatencyMs
      : 1;


  return Object.freeze({
    provider:
      definition.provider,

    mode:
      CAPACITY_TEST_MODE
        .LAB_SIMULATED_PROVIDER,

    driverVersion:
      CAPACITY_DRIVER_VERSION,

    async execute() {
      if (
        simulatedLatencyMs >
        0
      ) {
        await sleep(
          simulatedLatencyMs
        );
      }


      return {
        success:
          true,

        statusCode:
          200,

        simulated:
          true,

        provider:
          definition.provider,

        executionAuthorized:
          false,
      };
    },
  });
}


function createContractDriver(
  definition
) {
  return Object.freeze({
    provider:
      definition.provider,

    mode:
      CAPACITY_TEST_MODE
        .CONTRACT_ONLY,

    driverVersion:
      CAPACITY_DRIVER_VERSION,

    async execute() {
      return {
        success:
          true,

        statusCode:
          200,

        contractOnly:
          true,

        provider:
          definition.provider,

        executionAuthorized:
          false,
      };
    },
  });
}


function buildProviderPayload(
  provider,
  sequence =
    0
) {
  const now =
    new Date()
      .toISOString();


  switch (
    provider
  ) {
    case "prometheus_alertmanager":

      return {
        version:
          "4",

        groupKey:
          `{}/{severity="warning"}`,

        status:
          "firing",

        receiver:
          "aira",

        externalURL:
          "http://reliability-lab.invalid",

        alerts: [
          {
            status:
              "firing",

            labels: {
              alertname:
                "AiraCapacityTest",

              severity:
                "warning",

              service:
                "lab-api",

              sequence:
                String(
                  sequence
                ),
            },

            annotations: {
              summary:
                "AIRA Reliability Lab capacity signal",
            },

            startsAt:
              now,

            fingerprint:
              `capacity-${sequence}`,
          },
        ],
      };


    case "grafana_alerting":

      return {
        receiver:
          "aira",

        status:
          "firing",

        alerts: [
          {
            status:
              "firing",

            labels: {
              alertname:
                "AiraCapacityTest",

              service:
                "lab-api",

              severity:
                "warning",

              sequence:
                String(
                  sequence
                ),
            },

            annotations: {
              summary:
                "AIRA Reliability Lab capacity signal",
            },

            startsAt:
              now,
          },
        ],
      };


    case "webhook_incoming":

      return {
        eventType:
          "reliability.capacity",

        title:
          "AIRA Capacity Test",

        severity:
          "warning",

        service:
          "lab-api",

        sequence,

        timestamp:
          now,
      };


    default:

      return {
        eventType:
          "reliability.capacity",

        provider,

        service:
          "lab-api",

        sequence,

        timestamp:
          now,

        executionAuthorized:
          false,
      };
  }
}


function elapsedMs(
  startedAt
) {
  return Number(
    process.hrtime
      .bigint() -
    startedAt
  ) /
  1_000_000;
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


function driverError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "IntegrationCapacityDriverError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  CAPACITY_DRIVER_VERSION,

  createCapacityDriver,

  createAdapterDriver,

  createSimulatedDriver,

  createContractDriver,

  buildProviderPayload,

  driverError,
};