"use strict";


const {
  RECOVERY_CERTIFICATION_CONTRACT_VERSION,

  AUTONOMY_LEVEL_DEFINITION,

  DOMAIN_AUTONOMY_CEILING,

  isKnownAutonomyLevel,
  isKnownCertificationDomain,
  capAutonomyForDomain,
} =
  require(
    "../../constants/recoveryCertification"
  );


const RECOVERY_CERTIFICATION_ARCHITECTURE_CONTRACT =
  Object.freeze({
    contractVersion:
      RECOVERY_CERTIFICATION_CONTRACT_VERSION,

    phase:
      22,

    name:
      "AIRA Recovery Certification",

    purpose:
      "Convert empirical recovery evidence into capability-specific autonomy qualification without granting execution authority.",

    authority:
      "AUTONOMY_QUALIFICATION_ONLY",

    autonomyLevels:
      AUTONOMY_LEVEL_DEFINITION,

    domainCeilings:
      DOMAIN_AUTONOMY_CEILING,

    invariants:
      Object.freeze([
        "RESOURCE_CAPABILITY_IS_NOT_CERTIFICATION",

        "CERTIFICATION_IS_NOT_AUTHORIZATION",

        "AUTONOMY_REPUTATION_IS_NOT_AUTHORIZATION",

        "CERTIFICATION_NEVER_GRANTS_EXECUTION_AUTHORIZATION",

        "L3_REQUIRES_CANONICAL_APPROVAL_AND_AUTHORIZATION",

        "L4_IS_BOUNDED_AUTONOMY_ONLY",

        "L5_IS_EXPLICIT_DOMAIN_AUTONOMY_ONLY",

        "L4_AND_L5_STILL_REQUIRE_CANONICAL_RUNTIME_AUTHORIZATION",

        "TENANT_POLICY_CAN_ONLY_REDUCE_EFFECTIVE_AUTONOMY",

        "ENVIRONMENT_POLICY_CAN_ONLY_REDUCE_EFFECTIVE_AUTONOMY",

        "RISK_POLICY_CAN_ONLY_REDUCE_EFFECTIVE_AUTONOMY",

        "KILL_SWITCH_ALWAYS_OVERRIDES_AUTONOMY",

        "REVOKED_CERTIFICATION_FAILS_CLOSED",

        "EXPIRED_CERTIFICATION_FAILS_CLOSED",

        "PHYSICAL_SYSTEMS_HAVE_STRICT_AUTONOMY_CEILING",

        "SAFETY_CRITICAL_SYSTEMS_HAVE_STRICTER_AUTONOMY_CEILING",

        "PHASE_22_CONSUMES_PHASE_21_EVIDENCE",

        "PHASE_22_DOES_NOT_MUTATE_PHASE_21_EVIDENCE",
      ]),

    executionAuthorized:
      false,

    productionCertified:
      false,
  });


function validateRecoveryCertificationArchitectureContract(
  contract =
    RECOVERY_CERTIFICATION_ARCHITECTURE_CONTRACT
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
    22
  ) {
    return invalid(
      "PHASE_MUST_BE_22"
    );
  }


  if (
    contract.authority !==
    "AUTONOMY_QUALIFICATION_ONLY"
  ) {
    return invalid(
      "INVALID_CERTIFICATION_AUTHORITY"
    );
  }


  if (
    contract.executionAuthorized !==
    false
  ) {
    return invalid(
      "CERTIFICATION_CANNOT_AUTHORIZE_EXECUTION"
    );
  }


  if (
    contract.productionCertified !==
    false
  ) {
    return invalid(
      "CERTIFICATION_CONTRACT_CANNOT_CERTIFY_PRODUCTION"
    );
  }


  const required =
    [
      "RESOURCE_CAPABILITY_IS_NOT_CERTIFICATION",

      "CERTIFICATION_IS_NOT_AUTHORIZATION",

      "CERTIFICATION_NEVER_GRANTS_EXECUTION_AUTHORIZATION",

      "L3_REQUIRES_CANONICAL_APPROVAL_AND_AUTHORIZATION",

      "L4_IS_BOUNDED_AUTONOMY_ONLY",

      "L5_IS_EXPLICIT_DOMAIN_AUTONOMY_ONLY",

      "L4_AND_L5_STILL_REQUIRE_CANONICAL_RUNTIME_AUTHORIZATION",

      "PHYSICAL_SYSTEMS_HAVE_STRICT_AUTONOMY_CEILING",

      "SAFETY_CRITICAL_SYSTEMS_HAVE_STRICTER_AUTONOMY_CEILING",

      "PHASE_22_CONSUMES_PHASE_21_EVIDENCE",

      "PHASE_22_DOES_NOT_MUTATE_PHASE_21_EVIDENCE",
    ];


  for (
    const invariant
    of required
  ) {
    if (
      !Array.isArray(
        contract.invariants
      ) ||

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
      contract.contractVersion,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };
}


function assertAutonomyLevel(
  level
) {
  if (
    !isKnownAutonomyLevel(
      level
    )
  ) {
    throw certificationContractError(
      "AUTONOMY_LEVEL_UNKNOWN",
      `Unknown autonomy level ${level}`
    );
  }


  return level;
}


function assertCertificationDomain(
  domain
) {
  if (
    !isKnownCertificationDomain(
      domain
    )
  ) {
    throw certificationContractError(
      "CERTIFICATION_DOMAIN_UNKNOWN",
      `Unknown certification domain ${domain}`
    );
  }


  return domain;
}


function evaluateDomainAutonomyCeiling({
  requestedLevel,
  domain,
} = {}) {
  assertAutonomyLevel(
    requestedLevel
  );

  assertCertificationDomain(
    domain
  );


  const maximumLevel =
    DOMAIN_AUTONOMY_CEILING[
      domain
    ];

  const effectiveLevel =
    capAutonomyForDomain(
      requestedLevel,
      domain
    );


  return Object.freeze({
    requestedLevel,

    domain,

    maximumLevel,

    effectiveLevel,

    capped:
      requestedLevel !==
      effectiveLevel,

    executionAuthorized:
      false,
  });
}


/**
 * Validate a certification result.
 *
 * This intentionally checks only architectural invariants.
 * Statistical qualification comes later in Phase 22.
 */
function assertCertificationResult(
  result
) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    throw certificationContractError(
      "CERTIFICATION_RESULT_REQUIRED",
      "Certification result is required"
    );
  }


  assertAutonomyLevel(
    result.qualifiedLevel
  );

  assertCertificationDomain(
    result.domain
  );


  if (
    result.executionAuthorized !==
    false
  ) {
    throw certificationContractError(
      "CERTIFICATION_RESULT_CANNOT_AUTHORIZE_EXECUTION",
      "Recovery certification can qualify autonomy but cannot authorize execution"
    );
  }


  const capped =
    evaluateDomainAutonomyCeiling({
      requestedLevel:
        result.qualifiedLevel,

      domain:
        result.domain,
    });


  if (
    capped.effectiveLevel !==
    result.qualifiedLevel
  ) {
    throw certificationContractError(
      "CERTIFICATION_LEVEL_EXCEEDS_DOMAIN_CEILING",
      `Certification level ${result.qualifiedLevel} exceeds ${result.domain} ceiling ${capped.maximumLevel}`
    );
  }


  return Object.freeze({
    valid:
      true,

    qualifiedLevel:
      result.qualifiedLevel,

    domain:
      result.domain,

    executionAuthorized:
      false,
  });
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

    productionCertified:
      false,
  };
}


function certificationContractError(
  code,
  message
) {
  const error =
    new Error(
      message
    );

  error.name =
    "RecoveryCertificationContractError";

  error.code =
    code;

  error.executionAuthorized =
    false;

  error.productionCertified =
    false;

  return error;
}


module.exports = {
  RECOVERY_CERTIFICATION_ARCHITECTURE_CONTRACT,

  validateRecoveryCertificationArchitectureContract,

  assertAutonomyLevel,

  assertCertificationDomain,

  evaluateDomainAutonomyCeiling,

  assertCertificationResult,
};