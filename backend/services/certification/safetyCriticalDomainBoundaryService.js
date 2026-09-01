"use strict";


const {
  AUTONOMY_LEVEL,

  CERTIFICATION_DOMAIN,

  autonomyRank,

  lowerAutonomyLevel,

  isKnownCertificationDomain,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  SAFETY_CRITICAL_BOUNDARY_VERSION,

  PHYSICAL_RESOURCE_CAPABILITIES,

  RESTRICTED_DOMAIN_POLICY,

  SAFETY_BOUNDARY_REASON,
} =
  require(
    "../../constants/safetyCriticalCertificationPolicy"
  );


class SafetyCriticalDomainBoundaryService {
  evaluate(
    input = {}
  ) {
    const domain =
      input.domain;


    const resourceCapability =
      input.resourceCapability;


    const requestedLevel =
      input.requestedLevel ||
      AUTONOMY_LEVEL.L0;


    if (
      !isKnownCertificationDomain(
        domain
      )
    ) {
      throw boundaryError(
        "SAFETY_BOUNDARY_DOMAIN_INVALID",

        `Unknown certification domain ${domain}`
      );
    }


    autonomyRank(
      requestedLevel
    );


    if (
      input.executionAuthorized ===
        true
    ) {
      throw boundaryError(
        "SAFETY_BOUNDARY_AUTHORITY_LEAK",

        "Safety-critical certification boundary cannot grant execution authority"
      );
    }


    const reasons =
      [];


    const physicalCapability =
      PHYSICAL_RESOURCE_CAPABILITIES
        .includes(
          resourceCapability
        );


    const restrictedDomain =
      domain ===
        CERTIFICATION_DOMAIN
          .PHYSICAL_SYSTEM ||

      domain ===
        CERTIFICATION_DOMAIN
          .SAFETY_CRITICAL;


    /*
     * A certificate produced for ordinary software infrastructure
     * may NEVER be reused for a physical capability.
     */
    if (
      physicalCapability &&
      !restrictedDomain
    ) {
      reasons.push(
        SAFETY_BOUNDARY_REASON
          .PHYSICAL_CAPABILITY_DOMAIN_MISMATCH,

        SAFETY_BOUNDARY_REASON
          .SOFTWARE_CERTIFICATE_NOT_PORTABLE
      );


      return frozenResult({
        domain,

        resourceCapability,

        physicalCapability,

        requestedLevel,

        maximumLevel:
          AUTONOMY_LEVEL.L0,

        eligible:
          false,

        blocked:
          true,

        requiresSeparateCertification:
          true,

        productionAutonomyEligible:
          false,

        reasons,
      });
    }


    /*
     * Ordinary software/data/security capabilities are unaffected here.
     *
     * Other Phase-22 gates still apply.
     */
    if (
      !restrictedDomain
    ) {
      return frozenResult({
        domain,

        resourceCapability,

        physicalCapability:

          false,

        requestedLevel,

        maximumLevel:
          requestedLevel,

        eligible:
          true,

        blocked:
          false,

        requiresSeparateCertification:
          false,

        productionAutonomyEligible:
          true,

        reasons,
      });
    }


    const policy =
      RESTRICTED_DOMAIN_POLICY[
        domain
      ];


    let maximumLevel =
      lowerAutonomyLevel(
        requestedLevel,

        policy.maximumLevel
      );


    reasons.push(
      SAFETY_BOUNDARY_REASON
        .SEPARATE_CERTIFICATION_REQUIRED
    );


    if (
      domain ===
        CERTIFICATION_DOMAIN
          .PHYSICAL_SYSTEM &&

      autonomyRank(
        requestedLevel
      ) >
      autonomyRank(
        AUTONOMY_LEVEL.L2
      )
    ) {
      reasons.push(
        SAFETY_BOUNDARY_REASON
          .PHYSICAL_DOMAIN_AUTONOMY_PROHIBITED
      );
    }


    if (
      domain ===
        CERTIFICATION_DOMAIN
          .SAFETY_CRITICAL &&

      autonomyRank(
        requestedLevel
      ) >
      autonomyRank(
        AUTONOMY_LEVEL.L1
      )
    ) {
      reasons.push(
        SAFETY_BOUNDARY_REASON
          .SAFETY_CRITICAL_AUTONOMY_PROHIBITED
      );
    }


    if (
      input.production ===
        true
    ) {
      reasons.push(
        SAFETY_BOUNDARY_REASON
          .PRODUCTION_PHYSICAL_AUTONOMY_PROHIBITED
      );
    }


    /*
     * The physical/safety-critical boundary currently allows only
     * observation/diagnosis/recommendation behavior according to the
     * configured domain ceiling.
     *
     * It does not permit Phase-22 autonomous execution.
     */
    return frozenResult({
      domain,

      resourceCapability,

      physicalCapability,

      requestedLevel,

      maximumLevel,

      eligible:
        true,

      blocked:
        false,

      requiresSeparateCertification:
        true,

      productionAutonomyEligible:
        false,

      reasons,
    });
  }
}


function frozenResult({
  domain,

  resourceCapability,

  physicalCapability,

  requestedLevel,

  maximumLevel,

  eligible,

  blocked,

  requiresSeparateCertification,

  productionAutonomyEligible,

  reasons,
}) {
  return Object.freeze({
    boundaryVersion:
      SAFETY_CRITICAL_BOUNDARY_VERSION,

    domain,

    resourceCapability,

    physicalCapability,

    requestedLevel,

    maximumLevel,

    eligible,

    blocked,

    requiresSeparateCertification,

    autonomousRecoveryEligible:
      false,

    productionAutonomyEligible,

    reasons:
      Object.freeze([
        ...new Set(
          reasons
        ),
      ]),

    executionAuthorized:
      false,

    authorizationGranted:
      false,

    productionCertified:
      false,
  });
}


function boundaryError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "SafetyCriticalDomainBoundaryError",

      code,

      executionAuthorized:
        false,

      authorizationGranted:
        false,

      productionCertified:
        false,
    }
  );
}


module.exports = {
  SafetyCriticalDomainBoundaryService,
};