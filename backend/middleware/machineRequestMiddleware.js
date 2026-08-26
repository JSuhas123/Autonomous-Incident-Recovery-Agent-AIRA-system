"use strict";

const serviceAccountAuthMiddleware =
  require(
    "./serviceAccountAuthMiddleware"
  );

const {
  requireMachineOrganizationScope,
  requireMachineEnvironmentScope,
  optionalMachineEnvironmentScope,
} =
  require(
    "./machineAuthorizationMiddleware"
  );


// ============================================================================
// EXPRESS MIDDLEWARE CHAINS
// ============================================================================

const machineOrganizationRequest = [
  serviceAccountAuthMiddleware,

  requireMachineOrganizationScope,
];


const machineEnvironmentRequest = [
  serviceAccountAuthMiddleware,

  requireMachineOrganizationScope,

  requireMachineEnvironmentScope,
];


const machineOptionalEnvironmentRequest = [
  serviceAccountAuthMiddleware,

  requireMachineOrganizationScope,

  optionalMachineEnvironmentScope,
];


module.exports = {
  machineOrganizationRequest,

  machineEnvironmentRequest,

  machineOptionalEnvironmentRequest,
};