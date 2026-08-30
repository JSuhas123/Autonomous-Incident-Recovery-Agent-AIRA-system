"use strict";

const IntegrationConnectionStore =
  require(
    "./integrationConnectionStore"
  );

const {
  ProviderRegistry,
} =
  require(
    "./providerRegistry"
  );

const {
  IntegrationRuntime,
} =
  require(
    "./integrationRuntime"
  );

const {
  getGovernance,
  upsertGovernance,
} =
  require(
    "./integrationGovernanceService"
  );

const PostgresIntegrationInvocationAuditRepository =
  require(
    "../../persistence/postgres/PostgresIntegrationInvocationAuditRepository"
  );

const {
  sanitizeIntegrationValue,
} =
  require(
    "./integrationSecurity"
  );


class IntegrationControlPlaneService {
  constructor(
    options =
      {}
  ) {
    this.connectionStore =
      options.connectionStore ||
      new IntegrationConnectionStore(
        options
      );


    this.providerRegistry =
      options.providerRegistry ||
      new ProviderRegistry(
        options
      );


    this.runtime =
      options.runtime ||
      new IntegrationRuntime(
        options
      );


    this.auditRepository =
      options.auditRepository ||
      new PostgresIntegrationInvocationAuditRepository(
        options
      );


    this.getGovernance =
      options.getGovernance ||
      getGovernance;


    this.upsertGovernance =
      options.upsertGovernance ||
      upsertGovernance;
  }


  listCatalogue(
    filters =
      {}
  ) {
    const providers =
      this.providerRegistry
        .listProviders(
          filters
        );


    return {
      providers,

      summary:
        summarizeProviders(
          providers
        ),

      executionAuthorized:
        false,
    };
  }


  async listConnections({
    organizationId,

    environmentId,

    provider =
      null,

    status =
      null,

    healthStatus =
      null,

    limit =
      100,

    offset =
      0,
  }) {
    const connections =
      await this
        .connectionStore
        .listConnections({
          organizationId,

          environmentId,

          provider,

          status,

          healthStatus,

          limit,

          offset,
        });


    const safe =
      [];


    for (
      const connection
      of connections
    ) {
      safe.push(
        await this
          .serializeConnection({
            organizationId,

            environmentId,

            connection,
          })
      );
    }


    return {
      connections:
        safe,

      count:
        safe.length,

      executionAuthorized:
        false,
    };
  }


  async getConnection({
    organizationId,

    environmentId,

    integrationId,
  }) {
    const connection =
      await this
        .requireConnection({
          organizationId,

          environmentId,

          integrationId,
        });


    return this
      .serializeConnection({
        organizationId,

        environmentId,

        connection,
      });
  }


  async createConnection({
    organizationId,

    environmentId,

    actorUserId =
      null,

    provider,

    name,

    externalAccountId =
      null,

    serviceIds =
      [],

    capabilities =
      null,

    nonSecretConfig =
      {},

    secret =
      null,

    metadata =
      {},
  }) {
    const providerRecord =
      this.providerRegistry
        .requireProvider(
          provider
        );


    if (
      providerRecord
        .runtimeStatus !==
      "REGISTERED"
    ) {
      throw controlPlaneError(
        `Provider "${provider}" is not implemented`,
        409,
        "INTEGRATION_PROVIDER_NOT_IMPLEMENTED"
      );
    }


    const effectiveCapabilities =
      capabilities ===
        null
        ? [
            ...providerRecord
              .runtimeCapabilities,
          ]
        : validateRequestedCapabilities(
            capabilities,

            providerRecord
          );


    const created =
      await this
        .connectionStore
        .createConnection({
          organizationId,

          environmentId,

          provider:
            providerRecord
              .provider,

          name,

          externalAccountId,

          serviceIds,

          capabilities:
            effectiveCapabilities,

          nonSecretConfig,

          secret,

          status:
            "draft",

          healthStatus:
            "unknown",

          createdByUserId:
            actorUserId,

          updatedByUserId:
            actorUserId,

          metadata: {
            ...sanitizeIntegrationValue(
              metadata
            ),

            providerConfigSchemaVersion:
              providerRecord
                .configSchemaVersion,

            createdThrough:
              "phase20-control-plane",
          },
        });


    /*
     * Canonical default governance:
     *
     * safe reads/discovery enabled,
     * provider execution disabled.
     */
    await this
      .upsertGovernance({
        organizationId,

        environmentId,

        integrationId:
          created.publicId,

        provider:
          providerRecord
            .provider,

        actorUserId,

        settings: {
          enabled:
            true,

          allowIngestion:
            true,

          allowQueries:
            true,

          allowResourceDiscovery:
            true,

          allowExecution:
            false,

          credentialAccessMode:
            "managed_only",

          credentialRotationRequired:
            true,

          credentialRotationDays:
            90,

          allowedCapabilities:
            effectiveCapabilities,

          deniedCapabilities:
            [],

          metadata: {
            source:
              "phase20-control-plane",

            executionAuthorized:
              false,
          },
        },
      });


    return this
      .getConnection({
        organizationId,

        environmentId,

        integrationId:
          created.publicId,
      });
  }


  async updateConnection({
    organizationId,

    environmentId,

    integrationId,

    actorUserId =
      null,

    patch =
      {},
  }) {
    const existing =
      await this
        .requireConnection({
          organizationId,

          environmentId,

          integrationId,
        });


    if (
      patch.provider !==
      undefined &&
      String(
        patch.provider
      )
        .trim()
        .toLowerCase() !==
      existing.provider
    ) {
      throw controlPlaneError(
        "Integration provider cannot be changed after creation",
        409,
        "INTEGRATION_PROVIDER_IMMUTABLE"
      );
    }


    let capabilities =
      patch.capabilities;


    if (
      capabilities !==
      undefined
    ) {
      const providerRecord =
        this.providerRegistry
          .requireProvider(
            existing.provider
          );


      capabilities =
        validateRequestedCapabilities(
          capabilities,

          providerRecord
        );
    }


    const updated =
      await this
        .connectionStore
        .updateConnection({
          organizationId,

          environmentId,

          connectionId:
            existing.id,

          patch: {
            ...(patch.name !==
            undefined
              ? {
                  name:
                    patch.name,
                }
              : {}),

            ...(patch.externalAccountId !==
            undefined
              ? {
                  externalAccountId:
                    patch
                      .externalAccountId,
                }
              : {}),

            ...(patch.serviceIds !==
            undefined
              ? {
                  serviceIds:
                    patch.serviceIds,
                }
              : {}),

            ...(capabilities !==
            undefined
              ? {
                  capabilities,
                }
              : {}),

            ...(patch.nonSecretConfig !==
            undefined
              ? {
                  nonSecretConfig:
                    sanitizeIntegrationValue(
                      patch
                        .nonSecretConfig
                    ),
                }
              : {}),

            ...(patch.status !==
            undefined
              ? {
                  status:
                    patch.status,
                }
              : {}),

            ...(patch.metadata !==
            undefined
              ? {
                  metadata: {
                    ...(
                      existing.metadata ||
                      {}
                    ),

                    ...sanitizeIntegrationValue(
                      patch.metadata
                    ),
                  },
                }
              : {}),

            updatedByUserId:
              actorUserId,
          },
        });


    if (
      !updated
    ) {
      throw notFoundError();
    }


    return this
      .getConnection({
        organizationId,

        environmentId,

        integrationId:
          existing.publicId,
      });
  }


  async rotateCredential({
    organizationId,

    environmentId,

    integrationId,

    secret,
  }) {
    const connection =
      await this
        .requireConnection({
          organizationId,

          environmentId,

          integrationId,
        });


    if (
      !secret ||
      !String(
        secret
      ).length
    ) {
      throw controlPlaneError(
        "Credential secret is required",
        400,
        "INTEGRATION_CREDENTIAL_REQUIRED"
      );
    }


    await this
      .connectionStore
      .rotateCredential({
        organizationId,

        environmentId,

        connectionId:
          connection.id,

        secret,
      });


    return this
      .getConnection({
        organizationId,

        environmentId,

        integrationId,
      });
  }


  async revokeCredential({
    organizationId,

    environmentId,

    integrationId,
  }) {
    const connection =
      await this
        .requireConnection({
          organizationId,

          environmentId,

          integrationId,
        });


    await this
      .connectionStore
      .revokeCredential({
        organizationId,

        environmentId,

        connectionId:
          connection.id,
      });


    return {
      integrationId:
        connection.publicId,

      credentialRevoked:
        true,

      executionAuthorized:
        false,
    };
  }


  async healthCheck({
    organizationId,

    environmentId,

    integrationId,
  }) {
    const connection =
      await this
        .requireConnection({
          organizationId,

          environmentId,

          integrationId,
        });


    return this.runtime
      .healthCheck({
        organizationId,

        environmentId,

        integrationId:
          connection.publicId,

        provider:
          connection.provider,

        executionAuthorized:
          false,
      });
  }


  async getGovernanceRecord({
    organizationId,

    environmentId,

    integrationId,
  }) {
    await this
      .requireConnection({
        organizationId,

        environmentId,

        integrationId,
      });


    return {
      governance:
        await this
          .getGovernance({
            organizationId,

            environmentId,

            integrationId,
          }),

      executionAuthorized:
        false,
    };
  }


  async updateGovernance({
    organizationId,

    environmentId,

    integrationId,

    actorUserId =
      null,

    settings =
      {},
  }) {
    const connection =
      await this
        .requireConnection({
          organizationId,

          environmentId,

          integrationId,
        });


    const governance =
      await this
        .upsertGovernance({
          organizationId,

          environmentId,

          integrationId:
            connection.publicId,

          provider:
            connection.provider,

          actorUserId,

          settings: {
            ...settings,

            metadata: {
              ...(
                settings.metadata ||
                {}
              ),

              updatedThrough:
                "phase20-control-plane",

              executionAuthorized:
                false,
            },
          },
        });


    return {
      governance,

      executionAuthorized:
        false,
    };
  }


  async listInvocationAudit({
    organizationId,

    environmentId,

    integrationId,

    limit =
      100,

    offset =
      0,
  }) {
    const connection =
      await this
        .requireConnection({
          organizationId,

          environmentId,

          integrationId,
        });


    const audit =
      await this
        .auditRepository
        .list({
          organizationId,

          environmentId,

          integrationPublicId:
            connection.publicId,

          limit,

          offset,
        });


    return {
      integrationId:
        connection.publicId,

      audit,

      count:
        audit.length,

      executionAuthorized:
        false,
    };
  }


  async deleteConnection({
  organizationId,

  environmentId,

  integrationId,

  actorUserId =
    null,
}) {
  const connection =
    await this
      .requireConnection({
        organizationId,

        environmentId,

        integrationId,
      });


  /*
   * Phase 20 connections with historical invocation audit must remain
   * addressable as immutable provenance.
   *
   * Therefore the product-facing "delete" operation performs deterministic
   * retirement rather than destructive deletion:
   *
   *   1. revoke future credential access
   *   2. disable integration governance
   *   3. mark canonical connection disabled
   *
   * Physical deletion is not part of the normal Phase 20 control plane once
   * operational history exists.
   */


  await this
    .connectionStore
    .revokeCredential({
      organizationId,

      environmentId,

      connectionId:
        connection.id,
    })
    .catch(
      () => null
    );


  await this
    .upsertGovernance({
      organizationId,

      environmentId,

      integrationId:
        connection.publicId,

      provider:
        connection.provider,

      actorUserId,

      settings: {
        enabled:
          false,

        allowIngestion:
          false,

        allowQueries:
          false,

        allowResourceDiscovery:
          false,

        allowExecution:
          false,

        credentialAccessMode:
          "disabled",

        metadata: {
          retired:
            true,

          retiredThrough:
            "phase20-control-plane",

          executionAuthorized:
            false,
        },
      },
    });


  await this
    .connectionStore
    .updateConnection({
      organizationId,

      environmentId,

      connectionId:
        connection.id,

      patch: {
        status:
          "disabled",

        disabledAt:
          new Date(),

        disabledReason:
          "retired",

        updatedByUserId:
          actorUserId,

        metadata: {
          ...(
            connection.metadata ||
            {}
          ),

          retired:
            true,

          retiredAt:
            new Date()
              .toISOString(),

          executionAuthorized:
            false,
        },
      },
    });


  return {
    integrationId:
      connection.publicId,

    retired:
      true,

    deleted:
      false,

    credentialRevoked:
      true,

    governanceDisabled:
      true,

    historicalAuditPreserved:
      true,

    executionAuthorized:
      false,
  };
}


  async requireConnection({
    organizationId,

    environmentId,

    integrationId,
  }) {
    const connection =
      await this
        .connectionStore
        .getConnection({
          organizationId,

          environmentId,

          publicId:
            integrationId,
        });


    if (
      !connection
    ) {
      throw notFoundError();
    }


    return connection;
  }


  async serializeConnection({
    organizationId,

    environmentId,

    connection,
  }) {
    const credential =
      await this
        .connectionStore
        .getCredentialMetadata({
          organizationId,

          environmentId,

          connectionId:
            connection.id,
        })
        .catch(
          () => null
        );


    const provider =
      this.providerRegistry
        .getProvider(
          connection.provider
        );


    const governance =
      await this
        .getGovernance({
          organizationId,

          environmentId,

          integrationId:
            connection.publicId,
        })
        .catch(
          () => null
        );


    return {
      id:
        connection.publicId,

      canonicalId:
        connection.id,

      provider:
        connection.provider,

      providerDefinition:
        provider,

      name:
        connection.name,

      externalAccountId:
        connection.externalAccountId,

      serviceIds:
        connection.serviceIds,

      capabilities:
        connection.capabilities,

      nonSecretConfig:
        sanitizeIntegrationValue(
          connection
            .nonSecretConfig
        ),

      status:
        connection.status,

      healthStatus:
        connection.healthStatus,

      lastHealthCheckAt:
        connection
          .lastHealthCheckAt,

      lastEventAt:
        connection.lastEventAt,

      lastSuccessfulEventAt:
        connection
          .lastSuccessfulEventAt,

      lastErrorAt:
        connection.lastErrorAt,

      consecutiveFailures:
        connection
          .consecutiveFailures,

      lastLatencyMs:
        connection.lastLatencyMs,

      errorSummary:
        connection.errorSummary,

      connectedAt:
        connection.connectedAt,

      disconnectedAt:
        connection.disconnectedAt,

      disabledAt:
        connection.disabledAt,

      disabledReason:
        connection.disabledReason,

      metadata:
        sanitizeIntegrationValue(
          connection.metadata
        ),

      credential: credential
        ? {
            configured:
              true,

            providerType:
              credential
                .providerType,

            secretVersion:
              credential
                .secretVersion,

            status:
              credential.status,

            rotatedAt:
              credential.rotatedAt,

            revokedAt:
              credential.revokedAt,
          }
        : {
            configured:
              false,
          },

      governance,

      createdAt:
        connection.createdAt,

      updatedAt:
        connection.updatedAt,

      executionAuthorized:
        false,
    };
  }
}


function validateRequestedCapabilities(
  requested,
  providerRecord
) {
  if (
    !Array.isArray(
      requested
    )
  ) {
    throw controlPlaneError(
      "capabilities must be an array",
      400,
      "INTEGRATION_CAPABILITIES_INVALID"
    );
  }


  const unique =
    [
      ...new Set(
        requested.map(
          (
            value
          ) =>
            String(
              value
            )
              .trim()
        )
      ),
    ]
      .filter(
        Boolean
      );


  for (
    const capability
    of unique
  ) {
    if (
      !providerRecord
        .declaredCapabilities
        .includes(
          capability
        )
    ) {
      throw controlPlaneError(
        `Provider "${providerRecord.provider}" does not declare capability "${capability}"`,
        400,
        "INTEGRATION_CAPABILITY_NOT_DECLARED"
      );
    }


    if (
      !providerRecord
        .runtimeCapabilities
        .includes(
          capability
        )
    ) {
      throw controlPlaneError(
        `Provider runtime does not implement capability "${capability}"`,
        409,
        "INTEGRATION_CAPABILITY_NOT_IMPLEMENTED"
      );
    }
  }


  return unique;
}


function summarizeProviders(
  providers
) {
  return {
    total:
      providers.length,

    implemented:
      providers.filter(
        (
          provider
        ) =>
          provider.implemented
      ).length,

    certified:
      providers.filter(
        (
          provider
        ) =>
          provider.certified
      ).length,

    production:
      providers.filter(
        (
          provider
        ) =>
          provider.production
      ).length,

    available:
      providers.filter(
        (
          provider
        ) =>
          provider
            .availabilityStatus ===
          "available"
      ).length,

    beta:
      providers.filter(
        (
          provider
        ) =>
          provider
            .availabilityStatus ===
          "beta"
      ).length,

    comingSoon:
      providers.filter(
        (
          provider
        ) =>
          provider
            .availabilityStatus ===
          "coming_soon"
      ).length,

    executionAuthorized:
      false,
  };
}


function notFoundError() {
  return controlPlaneError(
    "Integration not found",
    404,
    "INTEGRATION_NOT_FOUND"
  );
}


function controlPlaneError(
  message,
  status,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "IntegrationControlPlaneError",

      status,

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  IntegrationControlPlaneService,

  validateRequestedCapabilities,

  summarizeProviders,
};