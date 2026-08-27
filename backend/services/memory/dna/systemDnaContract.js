"use strict";

const crypto =
  require(
    "node:crypto"
  );


const SYSTEM_DNA_VERSION =
  "1.0";


const SYSTEM_DNA_SCOPES =
  Object.freeze([
    "TENANT",
    "ENVIRONMENT",
    "SERVICE",
    "RESOURCE",
  ]);


const SYSTEM_DNA_MEMORY_FAMILIES =
  Object.freeze([
    "EPISODIC",
    "OUTCOME",
    "PROCEDURAL",
    "SEMANTIC",
    "HUMAN",
    "BEHAVIOURAL",
  ]);


class SystemDnaContract {

  createError(
    message,
    code,
    status =
      422
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    return error;
  }


  normalizeScope(
    value
  ) {
    const scope =
      String(
        value ||
        ""
      )
        .trim()
        .toUpperCase();


    if (
      !SYSTEM_DNA_SCOPES
        .includes(
          scope
        )
    ) {
      throw this.createError(
        `Unsupported System DNA scope: ${scope}`,
        "SYSTEM_DNA_SCOPE_INVALID"
      );
    }


    return scope;
  }


  normalizeScore(
    value,
    fallback =
      0
  ) {
    const parsed =
      Number(
        value
      );


    if (
      !Number.isFinite(
        parsed
      )
    ) {
      return fallback;
    }


    return Math.max(
      0,
      Math.min(
        1,
        parsed
      )
    );
  }


  createFingerprint(
    value
  ) {
    return crypto
      .createHash(
        "sha256"
      )
      .update(
        JSON.stringify(
          value
        )
      )
      .digest(
        "hex"
      );
  }


  validateIdentity({
    organizationId,

    scopeType,

    environmentId =
      null,

    serviceId =
      null,

    resourceId =
      null,
  }) {
    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization is required for System DNA",
        "SYSTEM_DNA_ORGANIZATION_REQUIRED"
      );
    }


    const scope =
      this.normalizeScope(
        scopeType
      );


    if (
      scope ===
        "ENVIRONMENT" &&
      !environmentId
    ) {
      throw this.createError(
        "Environment is required for ENVIRONMENT System DNA",
        "SYSTEM_DNA_ENVIRONMENT_REQUIRED"
      );
    }


    if (
      scope ===
        "SERVICE" &&
      (
        !environmentId ||
        !serviceId
      )
    ) {
      throw this.createError(
        "Environment and service are required for SERVICE System DNA",
        "SYSTEM_DNA_SERVICE_IDENTITY_REQUIRED"
      );
    }


    if (
      scope ===
        "RESOURCE" &&
      (
        !environmentId ||
        !serviceId ||
        !resourceId
      )
    ) {
      throw this.createError(
        "Environment, service and resource are required for RESOURCE System DNA",
        "SYSTEM_DNA_RESOURCE_IDENTITY_REQUIRED"
      );
    }


    return {
      organizationId,

      scopeType:
        scope,

      environmentId,

      serviceId,

      resourceId,
    };
  }


  normalizeMemoryFamilyCounts(
    counts =
      {}
  ) {
    const normalized =
      {};


    for (
      const family
      of SYSTEM_DNA_MEMORY_FAMILIES
    ) {
      const value =
        Number(
          counts[
            family
          ] ||
          0
        );


      normalized[
        family
      ] =
        Number.isInteger(
          value
        ) &&
        value >
          0
          ? value
          : 0;
    }


    return normalized;
  }


  createDna({
    organizationId,

    tenantPublicId =
      null,

    scopeType,

    environmentId =
      null,

    environmentPublicId =
      null,

    serviceId =
      null,

    servicePublicId =
      null,

    resourceId =
      null,

    resourcePublicId =
      null,

    memoryFamilyCounts =
      {},

    traits =
      [],

    patterns =
      [],

    procedures =
      [],

    outcomes =
      [],

    humanGuidance =
      [],

    behaviouralBaselines =
      [],

    evidenceMemoryIds =
      [],

    confidence =
      0,

    trustScore =
      0,

    generatedAt =
      new Date(),

    metadata =
      {},
  }) {
    const identity =
      this.validateIdentity({
        organizationId,

        scopeType,

        environmentId,

        serviceId,

        resourceId,
      });


    const familyCounts =
      this
        .normalizeMemoryFamilyCounts(
          memoryFamilyCounts
        );


    const evidenceIds =
      [
        ...new Set(
          Array.isArray(
            evidenceMemoryIds
          )
            ? evidenceMemoryIds
                .filter(
                  Boolean
                )
            : []
        ),
      ];


    const fingerprintInput = {
      version:
        SYSTEM_DNA_VERSION,

      organizationId:
        identity.organizationId,

      scopeType:
        identity.scopeType,

      environmentId:
        identity.environmentId,

      serviceId:
        identity.serviceId,

      resourceId:
        identity.resourceId,

      evidenceMemoryIds:
        [
          ...evidenceIds,
        ].sort(),

      memoryFamilyCounts:
        familyCounts,
    };


    return {
      version:
        SYSTEM_DNA_VERSION,

      fingerprint:
        this
          .createFingerprint(
            fingerprintInput
          ),

      organizationId:
        identity.organizationId,

      tenantPublicId,

      scopeType:
        identity.scopeType,

      environmentId:
        identity.environmentId,

      environmentPublicId,

      serviceId:
        identity.serviceId,

      servicePublicId,

      resourceId:
        identity.resourceId,

      resourcePublicId,

      memoryFamilyCounts:
        familyCounts,

      traits:
        Array.isArray(
          traits
        )
          ? traits
          : [],

      patterns:
        Array.isArray(
          patterns
        )
          ? patterns
          : [],

      procedures:
        Array.isArray(
          procedures
        )
          ? procedures
          : [],

      outcomes:
        Array.isArray(
          outcomes
        )
          ? outcomes
          : [],

      humanGuidance:
        Array.isArray(
          humanGuidance
        )
          ? humanGuidance
          : [],

      behaviouralBaselines:
        Array.isArray(
          behaviouralBaselines
        )
          ? behaviouralBaselines
          : [],

      evidenceMemoryIds:
        evidenceIds,

      evidenceCount:
        evidenceIds.length,

      confidence:
        this
          .normalizeScore(
            confidence
          ),

      trustScore:
        this
          .normalizeScore(
            trustScore
          ),

      generatedAt:
        generatedAt instanceof Date
          ? generatedAt
              .toISOString()
          : new Date(
              generatedAt
            )
              .toISOString(),

      safety: {
        evidenceOnly:
          true,

        executionAuthorized:
          false,

        grantsExecutionPermission:
          false,

        bypassesPolicy:
          false,

        bypassesApproval:
          false,

        bypassesEntitlements:
          false,

        bypassesKillSwitch:
          false,
      },

      metadata: {
        ...metadata,

        phase:
          "16.15",

        authoritativeStore:
          "postgresql",

        retrievalStore:
          "qdrant",

        executionAuthorized:
          false,
      },
    };
  }


  assertSafeDna(
    dna
  ) {
    if (
      !dna ||
      !dna.safety
    ) {
      throw this.createError(
        "System DNA safety contract is missing",
        "SYSTEM_DNA_SAFETY_MISSING",
        500
      );
    }


    const unsafe =
      dna.safety
        .evidenceOnly !==
          true ||
      dna.safety
        .executionAuthorized !==
          false ||
      dna.safety
        .grantsExecutionPermission !==
          false ||
      dna.safety
        .bypassesPolicy !==
          false ||
      dna.safety
        .bypassesApproval !==
          false ||
      dna.safety
        .bypassesEntitlements !==
          false ||
      dna.safety
        .bypassesKillSwitch !==
          false;


    if (
      unsafe
    ) {
      throw this.createError(
        "System DNA violated the execution safety boundary",
        "SYSTEM_DNA_SAFETY_VIOLATION",
        500
      );
    }


    return true;
  }
}


const systemDnaContract =
  new SystemDnaContract();


module.exports = {
  SYSTEM_DNA_VERSION,

  SYSTEM_DNA_SCOPES,

  SYSTEM_DNA_MEMORY_FAMILIES,

  SystemDnaContract,

  systemDnaContract,
};