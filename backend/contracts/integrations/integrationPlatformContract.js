"use strict";


const {
  INTEGRATION_CONTRACT_VERSION,

  CANONICAL_INTEGRATION_AUTHORITIES,
} =
  require(
    "../../constants/integrationPlatform"
  );


const PHASE_20_ARCHITECTURE_CONTRACT =
  Object.freeze({
    phase:
      20,

    name:
      "Integration Platform",

    version:
      INTEGRATION_CONTRACT_VERSION,

    purpose:
      "Provide one provider-neutral integration boundary for signals, evidence queries, discovery, notifications and already-authorized deterministic capabilities.",

    canonicalAuthorities:
      CANONICAL_INTEGRATION_AUTHORITIES,

    /*
     * AIRA queries the customer's existing observability systems.
     * Phase 20 is not a metrics/logs/traces warehouse.
     */
    telemetryWarehouse:
      false,

    /*
     * Integrations expose technical capabilities.
     *
     * They never decide whether use of that capability is authorized.
     */
    selfAuthorizesExecution:
      false,

    providerSpecificPayloadsAreCoreTruth:
      false,

    newResourceGraph:
      false,

    newRecoveryKnowledgeStore:
      false,

    executionAuthorized:
      false,
  });


const PHASE_20_INVARIANTS =
  Object.freeze([
    "PostgreSQL is canonical integration control-plane truth.",

    "Provider-specific payloads stay outside AIRA Core.",

    "Integrations normalize external data into canonical AIRA contracts.",

    "Integration capability does not imply authorization.",

    "executeCapability() cannot grant authorization.",

    "Policy and approval must precede provider-side execution when required.",

    "Credentials are never returned through normal integration APIs.",

    "Secrets must be redacted from logs, errors and audit payloads.",

    "Every connection belongs to one organization and one environment.",

    "Cross-tenant connector access is forbidden.",

    "Provider failure must fail safely and must not corrupt canonical AIRA state.",

    "Retries must be bounded and idempotent where required.",

    "Incoming signals require provider-appropriate authentication or signature verification.",

    "Resource discovery feeds Phase 17 and must not create a second resource graph.",

    "Relationship and change discovery feed Phase 17 temporal topology.",

    "Phase 20 does not create Phase 18 recovery knowledge.",

    "Phase 20 does not directly mutate Phase 19 coverage classification.",

    "Phase 16 operational memory is not integration configuration truth.",

    "Qdrant is not integration authority.",

    "MongoDB is not canonical AIRA integration persistence.",

    "Customer MongoDB remains a supported external technology.",

    "AIRA consumes existing observability instead of warehousing all telemetry.",

    "Adapters explicitly declare supported capabilities.",

    "Unsupported operations fail explicitly.",

    "Adapter existence does not imply production certification.",

    "Provider and configuration schema versions remain auditable.",

    "Revocation prevents future credential use.",

    "Integration operations retain provenance and audit identity.",

    "New domains such as robotics must fit the SDK without core redesign.",
  ]);


function validatePhase20ArchitectureContract(
  contract =
    PHASE_20_ARCHITECTURE_CONTRACT
) {
  const errors =
    [];


  if (
    contract.phase !==
    20
  ) {
    errors.push(
      "phase must be 20"
    );
  }


  if (
    contract.name !==
    "Integration Platform"
  ) {
    errors.push(
      "name must be Integration Platform"
    );
  }


  if (
    contract
      .canonicalAuthorities
      ?.CONNECTIONS !==
    "POSTGRESQL"
  ) {
    errors.push(
      "PostgreSQL must be canonical connection truth"
    );
  }


  if (
    contract
      .canonicalAuthorities
      ?.GOVERNANCE !==
    "POSTGRESQL"
  ) {
    errors.push(
      "PostgreSQL must be canonical governance truth"
    );
  }


  if (
    contract
      .canonicalAuthorities
      ?.RESOURCE_TRUTH !==
    "PHASE_17_RESOURCE_GRAPH"
  ) {
    errors.push(
      "Phase 17 must remain canonical resource truth"
    );
  }


  if (
    contract
      .telemetryWarehouse !==
    false
  ) {
    errors.push(
      "AIRA must not become a telemetry warehouse"
    );
  }


  if (
    contract
      .selfAuthorizesExecution !==
      false ||
    contract
      .executionAuthorized !==
      false
  ) {
    errors.push(
      "Phase 20 must never authorize execution"
    );
  }


  return {
    valid:
      errors.length ===
      0,

    errors,
  };
}


module.exports = {
  PHASE_20_ARCHITECTURE_CONTRACT,

  PHASE_20_INVARIANTS,

  validatePhase20ArchitectureContract,
};