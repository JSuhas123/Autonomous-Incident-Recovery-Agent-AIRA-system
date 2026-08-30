"use strict";

const {
  RELIABILITY_LAB_CONTRACT_VERSION,

  LAB_ENVIRONMENT_KIND,

  LAB_ENVIRONMENT_STATUS,

  LAB_SAFETY_CLASS,

  RELIABILITY_AUTHORITY,
} =
  require(
    "../../constants/reliabilityLab"
  );


const RELIABILITY_LAB_ARCHITECTURE_CONTRACT =
  Object.freeze({
    contractVersion:
      RELIABILITY_LAB_CONTRACT_VERSION,

    phase:
      21,

    name:
      "AIRA Reliability Lab",

    purpose:
      "Empirically evaluate AIRA against controlled reproducible infrastructure failures.",

    canonicalEvidenceAuthority:
      RELIABILITY_AUTHORITY
        .EXPERIMENT_EVIDENCE,

    authorities:
      Object.freeze({
        resourceTopology:
          RELIABILITY_AUTHORITY
            .RESOURCE_TOPOLOGY,

        recoveryKnowledge:
          RELIABILITY_AUTHORITY
            .RECOVERY_KNOWLEDGE,

        coverage:
          RELIABILITY_AUTHORITY
            .COVERAGE,

        integrations:
          RELIABILITY_AUTHORITY
            .INTEGRATIONS,

        executionAuthorization:
          RELIABILITY_AUTHORITY
            .EXECUTION_AUTHORIZATION,

        autonomyCertification:
          RELIABILITY_AUTHORITY
            .AUTONOMY_CERTIFICATION,
      }),

    invariants:
      Object.freeze([
        "RELIABILITY_LAB_IS_NOT_PRODUCTION_EXECUTION_PATH",

        "FAILURE_INJECTION_REQUIRES_REGISTERED_LAB_ENVIRONMENT",

        "GROUND_TRUTH_IS_EVALUATOR_ONLY",

        "GROUND_TRUTH_NEVER_ENTERS_AIRA_REASONING",

        "EXPERIMENT_REQUIRES_KNOWN_HEALTHY_BASELINE",

        "EXPERIMENT_DEFINITIONS_ARE_VERSIONED",

        "COMPLETED_RUNS_ARE_IMMUTABLE_AND_RECONSTRUCTIBLE",

        "POSTGRESQL_IS_CANONICAL_EXPERIMENT_EVIDENCE_AUTHORITY",

        "BULK_TELEMETRY_REMAINS_PROVIDER_OWNED",

        "PHASE_17_REMAINS_RESOURCE_TOPOLOGY_AUTHORITY",

        "PHASE_18_REMAINS_RECOVERY_KNOWLEDGE_AUTHORITY",

        "PHASE_19_REMAINS_COVERAGE_AUTHORITY",

        "PHASE_20_REMAINS_INTEGRATION_AUTHORITY",

        "EXISTING_EXECUTION_SUBSYSTEM_REMAINS_AUTHORIZATION_AUTHORITY",

        "PHASE_21_NEVER_GRANTS_EXECUTION_AUTHORIZATION",

        "FAILURE_INJECTION_PROVENANCE_IS_SEPARATE_FROM_RECOVERY_PROVENANCE",

        "COMMAND_SUCCESS_IS_NOT_RECOVERY_SUCCESS",

        "RECOVERY_REQUIRES_INDEPENDENT_VERIFICATION",

        "WRONG_DIAGNOSIS_WITH_LUCKY_RECOVERY_IS_NOT_FULL_SUCCESS",

        "SAFE_REFUSAL_MAY_BE_CORRECT",

        "HUMAN_ESCALATION_MAY_BE_CORRECT",

        "FAILED_RECOVERY_MUST_NOT_BE_RECORDED_AS_RECOVERED",

        "DIRTY_LAB_CANNOT_RUN_EXPERIMENT",

        "RESET_FAILURE_MARKS_ENVIRONMENT_DIRTY",

        "EVALUATOR_MUST_NOT_INFLUENCE_AIRA_REASONING",

        "EVERY_RUN_HAS_END_TO_END_CORRELATION",

        "FAILURE_INJECTOR_CANNOT_TARGET_PRODUCTION",

        "PHASE_21_MEASURES_RELIABILITY_NOT_AUTONOMY",

        "PHASE_22_CONSUMES_PHASE_21_EVIDENCE",

        "SYNTHETIC_UNIT_TESTS_ALONE_CANNOT_PROVE_PRODUCTION_RECOVERY",
      ]),

    executionAuthorized:
      false,
  });


function validateReliabilityLabArchitectureContract(
  contract =
    RELIABILITY_LAB_ARCHITECTURE_CONTRACT
) {
  if (
    !contract ||
    typeof contract !==
      "object"
  ) {
    return invalid(
      "CONTRACT_REQUIRED"
    );
  }


  if (
    contract.phase !==
    21
  ) {
    return invalid(
      "PHASE_MUST_BE_21"
    );
  }


  if (
    contract
      .canonicalEvidenceAuthority !==
    RELIABILITY_AUTHORITY
      .EXPERIMENT_EVIDENCE
  ) {
    return invalid(
      "INVALID_EVIDENCE_AUTHORITY"
    );
  }


  if (
    contract
      .executionAuthorized !==
    false
  ) {
    return invalid(
      "RELIABILITY_LAB_CANNOT_AUTHORIZE_EXECUTION"
    );
  }


  const required =
    [
      "GROUND_TRUTH_IS_EVALUATOR_ONLY",

      "GROUND_TRUTH_NEVER_ENTERS_AIRA_REASONING",

      "FAILURE_INJECTOR_CANNOT_TARGET_PRODUCTION",

      "RECOVERY_REQUIRES_INDEPENDENT_VERIFICATION",

      "PHASE_21_MEASURES_RELIABILITY_NOT_AUTONOMY",

      "PHASE_22_CONSUMES_PHASE_21_EVIDENCE",
    ];


  for (
    const invariant
    of required
  ) {
    if (
      !contract
        .invariants
        .includes(
          invariant
        )
    ) {
      return invalid(
        `MISSING_INVARIANT:${invariant}`
      );
    }
  }


  return {
    valid:
      true,

    contractVersion:
      contract
        .contractVersion,

    executionAuthorized:
      false,
  };
}


function assertLabEnvironmentContract(
  environment
) {
  requireNonEmpty(
    environment
      ?.environmentId,
    "environmentId"
  );


  requireNonEmpty(
    environment
      ?.organizationId,
    "organizationId"
  );


  requireNonEmpty(
    environment
      ?.environmentPublicId,
    "environmentPublicId"
  );


  requireEnum(
    environment
      ?.kind,
    LAB_ENVIRONMENT_KIND,
    "kind"
  );


  requireEnum(
    environment
      ?.status,
    LAB_ENVIRONMENT_STATUS,
    "status"
  );


  if (
    environment
      ?.safetyClass !==
    LAB_SAFETY_CLASS
      .LAB_ONLY
  ) {
    throw contractError(
      "LAB_ENVIRONMENT_SAFETY_CLASS_REQUIRED",
      "Reliability Lab environment must be LAB_ONLY"
    );
  }


  if (
    environment
      ?.production ===
    true
  ) {
    throw contractError(
      "PRODUCTION_LAB_FORBIDDEN",
      "Production infrastructure cannot be registered as a Reliability Lab environment"
    );
  }


  if (
    environment
      ?.executionAuthorized ===
    true
  ) {
    throw contractError(
      "LAB_ENVIRONMENT_CANNOT_AUTHORIZE_EXECUTION",
      "Lab environment metadata cannot grant execution authorization"
    );
  }


  return {
    valid:
      true,

    executionAuthorized:
      false,
  };
}


function isEnvironmentRunnable(
  environment
) {
  assertLabEnvironmentContract(
    environment
  );


  return (
    environment.status ===
    LAB_ENVIRONMENT_STATUS
      .AVAILABLE
  );
}


function invalid(
  reason
) {
  return {
    valid:
      false,

    reason,

    executionAuthorized:
      false,
  };
}


function requireNonEmpty(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw contractError(
      "RELIABILITY_FIELD_REQUIRED",
      `${field} is required`,
      {
        field,
      }
    );
  }
}


function requireEnum(
  value,
  enumObject,
  field
) {
  if (
    !Object.values(
      enumObject
    ).includes(
      value
    )
  ) {
    throw contractError(
      "RELIABILITY_ENUM_INVALID",
      `${field} is invalid`,
      {
        field,

        value,
      }
    );
  }
}


function contractError(
  code,
  message,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "ReliabilityLabContractError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  RELIABILITY_LAB_ARCHITECTURE_CONTRACT,

  validateReliabilityLabArchitectureContract,

  assertLabEnvironmentContract,

  isEnvironmentRunnable,

  contractError,
};