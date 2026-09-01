"use strict";


const crypto =
  require(
    "node:crypto"
  );


const LAB_SERVICE_OWNERSHIP_VERSION =
  "21.13-service-ownership-v1";


function requirePostgresOperationalPersistence() {
  const provider =
    String(
      process.env
        .PERSISTENCE_PROVIDER ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    provider !==
      "postgres"
  ) {
    throw ownershipError(
      "PHASE21_POSTGRES_OPERATIONAL_PERSISTENCE_REQUIRED",
      [
        "Phase 21 live service ownership requires",
        "PERSISTENCE_PROVIDER=postgres.",
        `Received: ${provider || "UNSET"}`,
      ].join(
        " "
      )
    );
  }
}


async function ensurePhase21LabService({
  organizationId,

  environmentId,

  tenantId,

  serviceName =
    "lab-api",

  serviceSlug =
    "lab-api",
} = {}) {
  requireString(
    organizationId,
    "organizationId"
  );


  requireString(
    environmentId,
    "environmentId"
  );


  requireString(
    tenantId,
    "tenantId"
  );


  requireString(
    serviceName,
    "serviceName"
  );


  requireString(
    serviceSlug,
    "serviceSlug"
  );


  requirePostgresOperationalPersistence();


  /*
   * Require only after the provider check.
   *
   * operationalModels chooses its persistence adapter at module load time.
   * Phase 21 must therefore fail closed before this require if PostgreSQL
   * is not the configured operational persistence provider.
   */
  const {
    Service,
  } =
    require(
      "../../persistence/operational/operationalModels"
    );


  const normalizedSlug =
    normalizeSlug(
      serviceSlug
    );


  let service =
    await Service
      .findOne({
        organizationId,

        environmentId,

        slug:
          normalizedSlug,

        status: {
          $ne:
            "archived",
        },
      })
      .lean();


  if (
    service
  ) {
    assertServiceOwnership({
      service,

      organizationId,

      environmentId,

      tenantId,
    });


    return {
      created:
        false,

      service:
        exposeService(
          service
        ),

      version:
        LAB_SERVICE_OWNERSHIP_VERSION,

      canonicalPersistence:
        "POSTGRESQL",

      productionCertified:
        false,

      executionAuthorized:
        false,
    };
  }


  /*
   * Preserve the repository's transitional 24-character application-ID
   * compatibility while keeping the fixture deterministic and idempotent.
   */
  const serviceId =
    deterministicServiceId({
      organizationId,

      environmentId,

      serviceSlug:
        normalizedSlug,
    });


  service =
    await Service
      .create({
        _id:
          serviceId,

        organizationId,

        environmentId,

        tenantId,

        name:
          serviceName,

        slug:
          normalizedSlug,

        description:
          "AIRA Phase 21 Reliability Lab canonical lab-api service",

        type:
          "kubernetes",

        environment:
          "development",

        baseUrl:
          "http://lab-api.aira-reliability-lab.svc.cluster.local",

        status:
          "active",

        verificationStatus:
          "verified",

        monitoringStatus:
          "active",

        ownershipVerification: {
          method:
            "none",

          token:
            null,

          verifiedAt:
            new Date(),

          lastAttemptAt:
            null,

          failureReason:
            null,
        },

        tags: [
          "aira-reliability-lab",
          "phase21",
          "lab-only",
        ],

        /*
         * operational.documents stores this as document data.
         * It is deliberately not a production human/user authority.
         */
        createdBy:
          "phase21-reliability-lab",

        verificationMethod:
          null,

        verifiedAt:
          new Date(),

        archivedAt:
          null,

        metadata: {
          phase:
            21,

          ownershipVersion:
            LAB_SERVICE_OWNERSHIP_VERSION,

          safetyClass:
            "LAB_ONLY",

          production:
            false,

          productionCertified:
            false,

          executionAuthorized:
            false,
        },
      });


  if (
    !service
  ) {
    throw ownershipError(
      "PHASE21_LAB_SERVICE_CREATE_FAILED",
      "Canonical Reliability Lab service could not be created"
    );
  }


  assertServiceOwnership({
    service,

    organizationId,

    environmentId,

    tenantId,
  });


  return {
    created:
      true,

    service:
      exposeService(
        service
      ),

    version:
      LAB_SERVICE_OWNERSHIP_VERSION,

    canonicalPersistence:
      "POSTGRESQL",

    productionCertified:
      false,

    executionAuthorized:
      false,
  };
}


async function verifyPhase21LabSignalOwnership({
  organizationId,

  environmentId,

  tenantId,

  serviceId,

  serviceName =
    "lab-api",
} = {}) {
  requireString(
    organizationId,
    "organizationId"
  );


  requireString(
    environmentId,
    "environmentId"
  );


  requireString(
    tenantId,
    "tenantId"
  );


  requireString(
    serviceId,
    "serviceId"
  );


  requireString(
    serviceName,
    "serviceName"
  );


  requirePostgresOperationalPersistence();


  const signalEnrichmentService =
    require(
      "../signals/signalEnrichmentService"
    );


  /*
   * Read-only enrichment proof.
   *
   * No signal is persisted.
   * No incident is created.
   * No infrastructure is mutated.
   */
  const enriched =
    await signalEnrichmentService
      .enrich({
        organizationId,

        environmentId,

        tenantId,

        serviceId,

        provider:
          "kubernetes",

        source:
          "integration",

        signalType:
          "event",

        eventType:
          "phase21.ownership.preflight",

        severity:
          "info",

        incidentCandidate:
          false,

        resource: {
          serviceName,

          resourceType:
            "kubernetes.pod",

          namespace:
            "aira-reliability-lab",
        },

        attributes: {
          phase21OwnershipPreflight:
            true,
        },

        executionAuthorized:
          false,
      });


  const resolvedServiceId =
    enriched
      ?.serviceId
      ? String(
          enriched.serviceId
        )
      : null;


  if (
    resolvedServiceId !==
      String(
        serviceId
      )
  ) {
    throw ownershipError(
      "PHASE21_LAB_SERVICE_RESOLUTION_FAILED",
      [
        "Signal enrichment did not resolve the expected canonical lab service.",
        `Expected=${serviceId}`,
        `Actual=${resolvedServiceId || "NONE"}`,
      ].join(
        " "
      )
    );
  }


  if (
    enriched
      ?.attributes
      ?.airaService
      ?.id !==
      String(
        serviceId
      )
  ) {
    throw ownershipError(
      "PHASE21_LAB_SERVICE_ENRICHMENT_FAILED",
      "Signal enrichment did not attach canonical airaService ownership evidence"
    );
  }


  return {
    resolved:
      true,

    serviceId:
      resolvedServiceId,

    serviceName:
      enriched
        ?.attributes
        ?.airaService
        ?.name ||
      serviceName,

    serviceType:
      enriched
        ?.attributes
        ?.airaService
        ?.type ||
      null,

    productionCertified:
      false,

    executionAuthorized:
      false,
  };
}


function assertServiceOwnership({
  service,

  organizationId,

  environmentId,

  tenantId,
}) {
  if (
    !service
  ) {
    throw ownershipError(
      "PHASE21_LAB_SERVICE_REQUIRED",
      "Reliability Lab service is required"
    );
  }


  if (
    String(
      service.organizationId
    ) !==
      String(
        organizationId
      )
  ) {
    throw ownershipError(
      "PHASE21_LAB_SERVICE_ORGANIZATION_MISMATCH",
      "Reliability Lab service belongs to a different organization"
    );
  }


  if (
    String(
      service.environmentId
    ) !==
      String(
        environmentId
      )
  ) {
    throw ownershipError(
      "PHASE21_LAB_SERVICE_ENVIRONMENT_MISMATCH",
      "Reliability Lab service belongs to a different environment"
    );
  }


  if (
    String(
      service.tenantId
    ) !==
      String(
        tenantId
      )
  ) {
    throw ownershipError(
      "PHASE21_LAB_SERVICE_TENANT_MISMATCH",
      "Reliability Lab service belongs to a different tenant"
    );
  }


  if (
    service.status ===
      "archived"
  ) {
    throw ownershipError(
      "PHASE21_LAB_SERVICE_ARCHIVED",
      "Archived service cannot own live Reliability Lab signals"
    );
  }


  if (
    service
      ?.metadata
      ?.executionAuthorized ===
      true
  ) {
    throw ownershipError(
      "PHASE21_LAB_SERVICE_AUTHORITY_VIOLATION",
      "Reliability Lab service metadata cannot authorize execution"
    );
  }


  return true;
}


function exposeService(
  service
) {
  return {
    id:
      String(
        service._id
      ),

    organizationId:
      String(
        service.organizationId
      ),

    environmentId:
      String(
        service.environmentId
      ),

    tenantId:
      String(
        service.tenantId
      ),

    name:
      service.name,

    slug:
      service.slug,

    type:
      service.type,

    status:
      service.status,

    verificationStatus:
      service.verificationStatus,

    monitoringStatus:
      service.monitoringStatus,

    productionCertified:
      false,

    executionAuthorized:
      false,
  };
}


function deterministicServiceId({
  organizationId,

  environmentId,

  serviceSlug,
}) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      [
        "phase21",

        organizationId,

        environmentId,

        serviceSlug,
      ]
        .join(
          ":"
        )
    )
    .digest(
      "hex"
    )
    .slice(
      0,
      24
    );
}


function normalizeSlug(
  value
) {
  const slug =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );


  if (
    !slug
  ) {
    throw ownershipError(
      "PHASE21_LAB_SERVICE_SLUG_INVALID",
      "Reliability Lab service slug is invalid"
    );
  }


  return slug;
}


function requireString(
  value,
  field
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    String(
      value
    )
      .trim() ===
      ""
  ) {
    throw ownershipError(
      "PHASE21_LAB_SERVICE_FIELD_REQUIRED",
      `${field} is required`,
      {
        field,
      }
    );
  }
}


function ownershipError(
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
        "Phase21LabServiceOwnershipError",

      code,

      ...metadata,

      productionCertified:
        false,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  LAB_SERVICE_OWNERSHIP_VERSION,

  ensurePhase21LabService,

  verifyPhase21LabSignalOwnership,

  deterministicServiceId,

  normalizeSlug,

  requirePostgresOperationalPersistence,

  ownershipError,
};