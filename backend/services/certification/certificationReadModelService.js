"use strict";


const {
  AUTONOMY_LEVEL,
} =
  require(
    "../../constants/recoveryCertification"
  );


class CertificationReadModelService {
  constructor({
    repository,
  } = {}) {
    if (
      !repository
    ) {
      throw readModelError(
        "CERTIFICATION_READ_REPOSITORY_REQUIRED",

        "repository is required"
      );
    }


    this.repository =
      repository;
  }


  async list(
    input = {}
  ) {
    const capabilities =
      await this.repository
        .listCapabilities(
          input
        );


    return Object.freeze({
      summary:
        summarize(
          capabilities
        ),

      capabilities:
        capabilities.map(
          dashboardCapability
        ),

      executionAuthorized:
        false,

      productionCertified:
        false,
    });
  }


  async get(
    input = {}
  ) {
    const capability =
      await this.repository
        .getCapability(
          input
        );


    if (
      !capability
    ) {
      return null;
    }


    return dashboardCapability(
      capability
    );
  }


  async history(
    input = {}
  ) {
    return Object.freeze({
      capabilityKey:
        input.capabilityKey,

      history:
        await this.repository
          .listCapabilityHistory(
            input
          ),

      executionAuthorized:
        false,
    });
  }


  async evidence(
    input = {}
  ) {
    return Object.freeze({
      capabilityKey:
        input.capabilityKey,

      evidence:
        await this.repository
          .listEvidence(
            input
          ),

      executionAuthorized:
        false,
    });
  }
}


function dashboardCapability(
  capability
) {
  const certificate =
    capability.certificate;


  return Object.freeze({
    capabilityKey:
      capability.capabilityKey,

    provider:
      capability.provider,

    resourceType:
      capability.resourceType,

    failureMode:
      capability.failureMode,

    recoveryStrategy:
      capability.recoveryStrategy,

    resourceCapability:
      capability.resourceCapability,

    playbookId:
      capability.playbookId,

    playbookVersion:
      capability.playbookVersion,

    domain:
      capability.domain,

    constraints:
      capability.constraints,

    certification:
      certificate
        ? Object.freeze({
            level:
              certificate
                .qualifiedLevel,

            status:
              certificate.status,

            score:
              certificate.score,

            confidence:
              certificate.confidence,

            issuedAt:
              certificate.issuedAt,

            expiresAt:
              certificate.expiresAt,

            autonomousRecoveryEligible:
              certificate.qualifiedLevel ===
                AUTONOMY_LEVEL.L4 ||

              certificate.qualifiedLevel ===
                AUTONOMY_LEVEL.L5,

            /*
             * Dashboard display must never imply that certification
             * equals execution authority.
             */
            executionAuthorized:
              false,
          })
        : null,

    executionAuthorized:
      false,

    productionCertified:
      false,
  });
}


function summarize(
  capabilities
) {
  const levels = {
    L0:
      0,

    L1:
      0,

    L2:
      0,

    L3:
      0,

    L4:
      0,

    L5:
      0,

    UNCERTIFIED:
      0,
  };


  let suspended =
    0;


  let revoked =
    0;


  for (
    const capability
    of capabilities
  ) {
    if (
      !capability.certificate
    ) {
      levels.UNCERTIFIED +=
        1;

      continue;
    }


    const level =
      capability
        .certificate
        .qualifiedLevel;


    if (
      Object.prototype
        .hasOwnProperty
        .call(
          levels,
          level
        )
    ) {
      levels[level] +=
        1;
    }


    if (
      capability
        .certificate
        .status ===
        "SUSPENDED"
    ) {
      suspended +=
        1;
    }


    if (
      capability
        .certificate
        .status ===
        "REVOKED"
    ) {
      revoked +=
        1;
    }
  }


  return Object.freeze({
    totalCapabilities:
      capabilities.length,

    byLevel:
      Object.freeze(
        levels
      ),

    suspended,

    revoked,

    executionAuthorized:
      false,
  });
}


function readModelError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "CertificationReadModelError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  CertificationReadModelService,

  dashboardCapability,

  summarize,
};