"use strict";


const {
  CATALOGUE,
} =
  require(
    "../../../config/integrationCatalogue"
  );


const INTEGRATION_CAPACITY_REGISTRY_VERSION =
  "21.10B-v1";


const CAPACITY_TEST_MODE =
  Object.freeze({
    LIVE:
      "LIVE",

    LAB_SIMULATED_PROVIDER:
      "LAB_SIMULATED_PROVIDER",

    CONTRACT_ONLY:
      "CONTRACT_ONLY",
  });


function buildIntegrationCapacityRegistry() {
  const entries =
    CATALOGUE.map(
      (
        definition
      ) => {
        const testMode =
          determineTestMode(
            definition
          );


        return Object.freeze({
          provider:
            definition.provider,

          displayName:
            definition.displayName,

          category:
            definition.category,

          availabilityStatus:
            definition
              .availabilityStatus,

          capabilities:
            Object.freeze([
              ...definition
                .capabilities,
            ]),

          testMode,

          externalProviderLimitPossible:
            true,

          measureAiraSide:
            true,

          measureProviderSide:
            testMode ===
            CAPACITY_TEST_MODE
              .LIVE,

          executionAuthorized:
            false,
        });
      }
    );


  return Object.freeze(
    entries
  );
}


function determineTestMode(
  definition
) {
  if (
    definition
      .availabilityStatus ===
      "available"
  ) {
    return CAPACITY_TEST_MODE
      .LIVE;
  }


  if (
    definition
      .availabilityStatus ===
      "beta"
  ) {
    return CAPACITY_TEST_MODE
      .LAB_SIMULATED_PROVIDER;
  }


  return CAPACITY_TEST_MODE
    .CONTRACT_ONLY;
}


function requireProvider(
  provider
) {
  const definition =
    buildIntegrationCapacityRegistry()
      .find(
        (
          item
        ) =>
          item.provider ===
          provider
      );


  if (
    !definition
  ) {
    throw registryError(
      "INTEGRATION_CAPACITY_PROVIDER_UNKNOWN",
      `Unknown integration provider ${provider}`
    );
  }


  return definition;
}


function registryError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "IntegrationCapacityRegistryError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  INTEGRATION_CAPACITY_REGISTRY_VERSION,

  CAPACITY_TEST_MODE,

  buildIntegrationCapacityRegistry,

  requireProvider,

  registryError,
};