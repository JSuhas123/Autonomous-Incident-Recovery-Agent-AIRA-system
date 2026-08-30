"use strict";

/**
 * ============================================================================
 * AIRA PHASE 20.6
 * PROVIDER REGISTRY V2
 * ============================================================================
 *
 * Responsibilities:
 *
 * - combine the product catalogue with actual registered adapters;
 * - expose provider metadata without pretending implementation == certification;
 * - expose canonical Phase 20 capabilities;
 * - resolve provider adapters through the existing adapter registry;
 * - fail explicitly for missing providers/capabilities;
 * - never authorize execution.
 *
 * IMPORTANT:
 *
 * The existing adapterRegistry remains the physical adapter registry during
 * migration. ProviderRegistry is the Phase 20 product/runtime abstraction
 * layered above it.
 *
 * Later Phase 20 provider-certification stages can move adapter loading behind
 * package/module manifests without changing IntegrationRuntime.
 * ============================================================================
 */

const {
  CATALOGUE,
  findDefinition,
} =
  require(
    "../../config/integrationCatalogue"
  );

const adapterRegistry =
  require(
    "./adapterRegistry"
  );

const {
  INTEGRATION_CAPABILITIES,

  INTEGRATION_GROUP,
} =
  require(
    "../../constants/integrationPlatform"
  );

const {
  normalizeCapabilities,
  UnsupportedOperationError,
} =
  require(
    "./adapterInterface"
  );


const PROVIDER_RUNTIME_STATUS =
  Object.freeze({
    REGISTERED:
      "REGISTERED",

    NOT_REGISTERED:
      "NOT_REGISTERED",
  });


const PROVIDER_CERTIFICATION_STATUS =
  Object.freeze({
    UNCERTIFIED:
      "UNCERTIFIED",

    CERTIFIED:
      "CERTIFIED",

    PRODUCTION:
      "PRODUCTION",
  });


class ProviderRegistry {
  constructor(
    options = {}
  ) {
    this.catalogue =
      options.catalogue ||
      CATALOGUE;

    this.adapterRegistry =
      options.adapterRegistry ||
      adapterRegistry;

    /*
     * Certification state is deliberately independent from adapter existence.
     *
     * An adapter can exist without being certified for production.
     */
    this.certification =
      new Map(
        Object.entries(
          options.certification ||
          {}
        )
      );
  }


  getProvider(
    provider
  ) {
    const normalized =
      normalizeProvider(
        provider
      );


    if (
      !normalized
    ) {
      return null;
    }


    const definition =
      this.findDefinition(
        normalized
      );


    if (
      !definition
    ) {
      return null;
    }


    const registered =
      this.hasAdapter(
        normalized
      );


    const adapterCapabilities =
      registered
        ? this.safeAdapterCapabilities(
            normalized
          )
        : [];


    return buildProviderRecord({
      definition,

      registered,

      adapterCapabilities,

      certificationStatus:
        this.getCertificationStatus(
          normalized
        ),
    });
  }


  requireProvider(
    provider
  ) {
    const record =
      this.getProvider(
        provider
      );


    if (
      !record
    ) {
      throw Object.assign(
        new Error(
          `Unknown integration provider "${provider}"`
        ),
        {
          code:
            "INTEGRATION_PROVIDER_UNKNOWN",

          provider,

          executionAuthorized:
            false,
        }
      );
    }


    return record;
  }


  listProviders(
    {
      category =
        null,

      availabilityStatus =
        null,

      runtimeStatus =
        null,

      capability =
        null,
    } = {}
  ) {
    return this.catalogue
      .map(
        (
          definition
        ) =>
          this.getProvider(
            definition.provider
          )
      )
      .filter(
        Boolean
      )
      .filter(
        (
          record
        ) => {
          if (
            category &&
            record.category !==
              category
          ) {
            return false;
          }


          if (
            availabilityStatus &&
            record
              .availabilityStatus !==
              availabilityStatus
          ) {
            return false;
          }


          if (
            runtimeStatus &&
            record.runtimeStatus !==
              runtimeStatus
          ) {
            return false;
          }


          if (
            capability &&
            !record
              .declaredCapabilities
              .includes(
                capability
              )
          ) {
            return false;
          }


          return true;
        }
      );
  }


  resolveAdapter(
    provider
  ) {
    const record =
      this.requireProvider(
        provider
      );


    if (
      record.runtimeStatus !==
      PROVIDER_RUNTIME_STATUS
        .REGISTERED
    ) {
      throw Object.assign(
        new Error(
          `Integration provider "${record.provider}" has no registered runtime adapter`
        ),
        {
          code:
            "INTEGRATION_PROVIDER_NOT_IMPLEMENTED",

          provider:
            record.provider,

          executionAuthorized:
            false,
        }
      );
    }


    return this
      .adapterRegistry
      .getAdapter(
        record.provider
      );
  }


  supportsDeclaredCapability(
    provider,
    capability
  ) {
    const record =
      this.getProvider(
        provider
      );


    return Boolean(
      record &&
      record
        .declaredCapabilities
        .includes(
          capability
        )
    );
  }


  supportsRuntimeCapability(
    provider,
    capability
  ) {
    const record =
      this.getProvider(
        provider
      );


    return Boolean(
      record &&
      record.runtimeStatus ===
        PROVIDER_RUNTIME_STATUS
          .REGISTERED &&
      record
        .runtimeCapabilities
        .includes(
          capability
        )
    );
  }


  requireRuntimeCapability(
    provider,
    capability
  ) {
    const record =
      this.requireProvider(
        provider
      );


    if (
      !INTEGRATION_CAPABILITIES
        .includes(
          capability
        )
    ) {
      throw Object.assign(
        new Error(
          `Unknown integration capability "${capability}"`
        ),
        {
          code:
            "INTEGRATION_CAPABILITY_UNKNOWN",

          provider:
            record.provider,

          capability,

          executionAuthorized:
            false,
        }
      );
    }


    const adapter =
      this.resolveAdapter(
        record.provider
      );


    if (
      !record
        .runtimeCapabilities
        .includes(
          capability
        )
    ) {
      throw new UnsupportedOperationError(
        record.provider,
        capability
      );
    }


    return {
      provider:
        record,

      adapter,

      capability,

      executionAuthorized:
        false,
    };
  }


  getCertificationStatus(
    provider
  ) {
    const status =
      this.certification
        .get(
          provider
        );


    if (
      Object.values(
        PROVIDER_CERTIFICATION_STATUS
      )
        .includes(
          status
        )
    ) {
      return status;
    }


    return PROVIDER_CERTIFICATION_STATUS
      .UNCERTIFIED;
  }


  setCertificationStatus(
    provider,
    status
  ) {
    const normalized =
      normalizeProvider(
        provider
      );


    this.requireProvider(
      normalized
    );


    if (
      !Object.values(
        PROVIDER_CERTIFICATION_STATUS
      )
        .includes(
          status
        )
    ) {
      throw Object.assign(
        new Error(
          `Invalid provider certification status "${status}"`
        ),
        {
          code:
            "INTEGRATION_CERTIFICATION_STATUS_INVALID",

          executionAuthorized:
            false,
        }
      );
    }


    this.certification
      .set(
        normalized,
        status
      );


    return this.getProvider(
      normalized
    );
  }


  validateRegistry() {
    const results =
      [];


    for (
      const definition
      of this.catalogue
    ) {
      const record =
        this.getProvider(
          definition.provider
        );


      const errors =
        [];


      if (
        !record
      ) {
        errors.push(
          "provider definition could not be resolved"
        );
      }


      if (
        definition
          .availabilityStatus ===
          "available" &&
        record?.runtimeStatus !==
          PROVIDER_RUNTIME_STATUS
            .REGISTERED
      ) {
        errors.push(
          "available provider has no registered adapter"
        );
      }


      if (
        record?.runtimeStatus ===
          PROVIDER_RUNTIME_STATUS
            .REGISTERED &&
        definition
          .availabilityStatus ===
          "available"
      ) {
        const declared =
          [
            ...record
              .declaredCapabilities,
          ].sort();


        const runtime =
          [
            ...record
              .runtimeCapabilities,
          ].sort();


        if (
          JSON.stringify(
            declared
          ) !==
          JSON.stringify(
            runtime
          )
        ) {
          errors.push(
            "available provider catalogue/runtime capabilities differ"
          );
        }
      }


      results.push({
        provider:
          definition.provider,

        valid:
          errors.length ===
          0,

        errors,

        runtimeStatus:
          record
            ?.runtimeStatus ||
          PROVIDER_RUNTIME_STATUS
            .NOT_REGISTERED,

        availabilityStatus:
          definition
            .availabilityStatus,

        certificationStatus:
          record
            ?.certificationStatus ||
          PROVIDER_CERTIFICATION_STATUS
            .UNCERTIFIED,

        executionAuthorized:
          false,
      });
    }


    return results;
  }


  assertRegistryValid() {
    const results =
      this.validateRegistry();


    const invalid =
      results.filter(
        (
          result
        ) =>
          !result.valid
      );


    if (
      invalid.length >
      0
    ) {
      throw Object.assign(
        new Error(
          `Provider Registry v2 contains ${invalid.length} invalid provider definition(s)`
        ),
        {
          code:
            "INTEGRATION_PROVIDER_REGISTRY_INVALID",

          providers:
            invalid,

          executionAuthorized:
            false,
        }
      );
    }


    return results;
  }


  findDefinition(
    provider
  ) {
    /*
     * Use the injected catalogue when supplied in tests.
     */
    if (
      this.catalogue ===
      CATALOGUE
    ) {
      return findDefinition(
        provider
      );
    }


    return (
      this.catalogue.find(
        (
          definition
        ) =>
          definition.provider ===
          provider
      ) ||
      null
    );
  }


  hasAdapter(
    provider
  ) {
    try {
      return (
        this.adapterRegistry
          .hasAdapter(
            provider
          ) ===
        true
      );
    } catch {
      return false;
    }
  }


  safeAdapterCapabilities(
    provider
  ) {
    try {
      return normalizeCapabilities(
        this.adapterRegistry
          .getAdapterCapabilities(
            provider
          )
      );
    } catch {
      return [];
    }
  }
}


function buildProviderRecord({
  definition,

  registered,

  adapterCapabilities,

  certificationStatus,
}) {
  return {
    provider:
      definition.provider,

    displayName:
      definition.displayName,

    category:
      definition.category,

    group:
  resolveProviderGroup(
    definition.category
  ),

    description:
      definition.description,

    documentationUrl:
      definition.documentationUrl ||
      null,

    icon:
      definition.icon ||
      null,

    configSchemaVersion:
      definition
        .configSchemaVersion,

    availabilityStatus:
      definition
        .availabilityStatus,

    runtimeStatus:
      registered
        ? PROVIDER_RUNTIME_STATUS
            .REGISTERED
        : PROVIDER_RUNTIME_STATUS
            .NOT_REGISTERED,

    certificationStatus,

    declaredCapabilities:
      Array.isArray(
        definition.capabilities
      )
        ? [
            ...definition
              .capabilities,
          ]
        : [],

    runtimeCapabilities:
      registered
        ? [
            ...adapterCapabilities,
          ]
        : [],

    implemented:
      registered,

    certified:
      certificationStatus ===
        PROVIDER_CERTIFICATION_STATUS
          .CERTIFIED ||
      certificationStatus ===
        PROVIDER_CERTIFICATION_STATUS
          .PRODUCTION,

    production:
      certificationStatus ===
      PROVIDER_CERTIFICATION_STATUS
        .PRODUCTION,

    executionAuthorized:
      false,
  };
}


function normalizeProvider(
  value
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  return (
    normalized ||
    null
  );
}

function resolveProviderGroup(
  category
) {
  const value =
    String(
      category ||
      ""
    );


  if (
    value ===
      "monitoring_alerting" ||
    value ===
      "telemetry_observability"
  ) {
    return INTEGRATION_GROUP
      .OBSERVABILITY;
  }


  if (
    value ===
    "cloud"
  ) {
    return INTEGRATION_GROUP
      .CLOUD;
  }


  if (
    value ===
    "incident_management"
  ) {
    return INTEGRATION_GROUP
      .INCIDENT;
  }


  if (
    value ===
    "communication"
  ) {
    return INTEGRATION_GROUP
      .COMMUNICATION;
  }


  if (
    value ===
    "developer_tools"
  ) {
    return INTEGRATION_GROUP
      .CI_CD;
  }


  if (
    value ===
    "databases_queues"
  ) {
    return INTEGRATION_GROUP
      .DATA;
  }


  if (
    value ===
    "infrastructure"
  ) {
    return INTEGRATION_GROUP
      .INFRA;
  }


  return INTEGRATION_GROUP
    .CUSTOM;
}
module.exports = {
  ProviderRegistry,

  PROVIDER_RUNTIME_STATUS,

  PROVIDER_CERTIFICATION_STATUS,

  resolveProviderGroup,
};