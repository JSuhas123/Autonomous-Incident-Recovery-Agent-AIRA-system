"use strict";

/**
 * ============================================================================
 * AIRA PHASE 20.11
 * RELATIONSHIP DISCOVERY + PROVIDER CHANGES → PHASE 17
 * ============================================================================
 *
 * Canonical relationship authority:
 *
 *   resources.resource_relationships
 *   resources.relationship_history
 *   resources.graph_change_events
 *
 * through Phase 17 repositories.
 *
 * Phase 20 NEVER creates another topology graph.
 * ============================================================================
 */

const {
  IntegrationRuntime,
} =
  require(
    "./integrationRuntime"
  );

const {
  IntegrationResourceDiscoveryGateway,
} =
  require(
    "./integrationResourceDiscoveryGateway"
  );

const PostgresResourceRepository =
  require(
    "../../persistence/postgres/PostgresResourceRepository"
  );

const PostgresTemporalRelationshipRepository =
  require(
    "../../persistence/postgres/PostgresTemporalRelationshipRepository"
  );

const TemporalTopologyQueryService =
  require(
    "../topology/TemporalTopologyQueryService"
  );

const {
  isValidRelationshipType,
} =
  require(
    "../../constants/relationshipTypes"
  );


const DEFAULT_RELATIONSHIP_BATCH_LIMIT =
  500;


class IntegrationTopologyDiscoveryGateway {
  constructor(
    options = {}
  ) {
    this.runtime =
      options.runtime ||
      new IntegrationRuntime(
        options
      );


    this.resourceRepository =
      options.resourceRepository ||
      new PostgresResourceRepository(
        options
      );


    this.relationshipRepository =
      options.relationshipRepository ||
      new PostgresTemporalRelationshipRepository(
        options
      );


    this.temporalTopologyQueryService =
      options
        .temporalTopologyQueryService ||
      new TemporalTopologyQueryService(
        options
      );


    this.resourceDiscoveryGateway =
      options
        .resourceDiscoveryGateway ||
      new IntegrationResourceDiscoveryGateway(
        options
      );


    this.maxRelationships =
      normalizePositiveInteger(
        options.maxRelationships,
        DEFAULT_RELATIONSHIP_BATCH_LIMIT
      );
  }


  async discoverRelationships({
    organizationId,

    environmentId,

    integrationId,

    provider,

    options =
      {},
  } = {}) {
    requireContext({
      organizationId,

      environmentId,

      integrationId,

      provider,
    });


    const runtimeResult =
      await this.runtime
        .discoverRelationships(
          {
            organizationId,

            environmentId,

            integrationId,

            provider,

            executionAuthorized:
              false,
          },

          options
        );


    assertNonAuthorizing(
      runtimeResult
    );


    const relationships =
      extractRelationships(
        runtimeResult
          ?.data
      );


    return this.persistRelationships({
      organizationId,

      environmentId,

      integrationId,

      provider,

      relationships,

      observedAt:
        runtimeResult
          ?.observedAt ||
        new Date(),

      provenance:
        runtimeResult
          ?.provenance ||
        {},
    });
  }


  async persistRelationships({
    organizationId,

    environmentId,

    integrationId,

    provider,

    relationships =
      [],

    observedAt =
      new Date(),

    provenance =
      {},
  } = {}) {
    requireContext({
      organizationId,

      environmentId,

      integrationId,

      provider,
    });


    if (
      !Array.isArray(
        relationships
      )
    ) {
      throw topologyError(
        "Discovered relationships must be an array",
        "INTEGRATION_RELATIONSHIPS_INVALID"
      );
    }


    if (
      relationships.length >
      this.maxRelationships
    ) {
      throw topologyError(
        `Relationship discovery returned ${relationships.length} relationships; maximum is ${this.maxRelationships}`,
        "INTEGRATION_RELATIONSHIP_BATCH_TOO_LARGE"
      );
    }


    const results =
      [];


    let persisted =
      0;

    let skipped =
      0;

    let failed =
      0;


    for (
      let index = 0;
      index <
      relationships.length;
      index++
    ) {
      const relationship =
        relationships[
          index
        ];


      try {
        const normalized =
          normalizeRelationshipObservation({
            relationship,

            provider,

            observedAt,
          });


        const [
          sourceResource,
          targetResource,
        ] =
          await Promise.all([
            this.resolveEndpoint({
              organizationId,

              environmentId,

              defaultProvider:
                provider,

              endpoint:
                normalized.source,
            }),

            this.resolveEndpoint({
              organizationId,

              environmentId,

              defaultProvider:
                provider,

              endpoint:
                normalized.target,
            }),
          ]);


        if (
          !sourceResource ||
          !targetResource
        ) {
          skipped +=
            1;


          results.push({
            index,

            status:
              "SKIPPED",

            reason:
              "RELATIONSHIP_ENDPOINT_NOT_FOUND",

            sourceResolved:
              Boolean(
                sourceResource
              ),

            targetResolved:
              Boolean(
                targetResource
              ),

            executionAuthorized:
              false,
          });


          continue;
        }


        const created =
          await this
            .relationshipRepository
            .createRelationship({
              organizationId,

              environmentId,

              sourceResourceId:
                sourceResource.id,

              targetResourceId:
                targetResource.id,

              relationshipType:
                normalized
                  .relationshipType,

              attributes:
                normalized
                  .attributes,

              source:
                buildRelationshipSource(
                  provider,
                  integrationId
                ),

              confidence:
                normalized
                  .confidence,

              metadata: {
                ...normalized
                  .metadata,

                integrationId:
                  String(
                    integrationId
                  ),

                provider,
              },

              validFrom:
                normalized
                  .observedAt,

              evidence: {
                ...normalized
                  .evidence,

                provider,

                integrationId:
                  String(
                    integrationId
                  ),

                invocationId:
                  provenance
                    ?.invocationId ||
                  null,
              },
            });


        persisted +=
          1;


        results.push({
          index,

          status:
            "PERSISTED",

          relationship:
            created,

          executionAuthorized:
            false,
        });
      } catch (
        error
      ) {
        failed +=
          1;


        results.push({
          index,

          status:
            "FAILED",

          error: {
            code:
              error?.code ||
              "INTEGRATION_RELATIONSHIP_PERSISTENCE_FAILED",

            message:
              safeErrorMessage(
                error
              ),
          },

          executionAuthorized:
            false,
        });
      }
    }


    return {
      provider,

      integrationId,

      discovered:
        relationships.length,

      persisted,

      skipped,

      failed,

      relationships:
        results,

      canonicalAuthority:
        "PHASE_17_TEMPORAL_RESOURCE_GRAPH",

      executionAuthorized:
        false,
    };
  }


  async getChanges({
    organizationId,

    environmentId,

    integrationId,

    provider,

    from =
      null,

    to =
      null,

    options =
      {},
  } = {}) {
    requireContext({
      organizationId,

      environmentId,

      integrationId,

      provider,
    });


    const runtimeResult =
      await this.runtime
        .getChanges(
          {
            organizationId,

            environmentId,

            integrationId,

            provider,

            executionAuthorized:
              false,
          },

          {
            ...options,

            ...(from
              ? {
                  from,
                }
              : {}),

            ...(to
              ? {
                  to,
                }
              : {}),
          }
        );


    assertNonAuthorizing(
      runtimeResult
    );


    const providerChanges =
      extractChanges(
        runtimeResult
          ?.data
      );


    const resourceObservations =
      [];


    const relationshipObservations =
      [];


    for (
      const change
      of providerChanges
    ) {
      const kind =
        normalizeChangeKind(
          change
        );


      if (
        kind ===
        "RESOURCE"
      ) {
        if (
          change.resource
        ) {
          resourceObservations.push(
            change.resource
          );
        } else {
          resourceObservations.push(
            change
          );
        }
      }


      if (
        kind ===
        "RELATIONSHIP"
      ) {
        if (
          change.relationship
        ) {
          relationshipObservations.push(
            change.relationship
          );
        } else {
          relationshipObservations.push(
            change
          );
        }
      }
    }


    /*
     * Providers may also return direct top-level resource/relationship arrays.
     */
    resourceObservations.push(
      ...extractResourcesFromChanges(
        runtimeResult
          ?.data
      )
    );


    relationshipObservations.push(
      ...extractRelationships(
        runtimeResult
          ?.data
      )
    );


    const resourceResult =
      await this
        .resourceDiscoveryGateway
        .persistProviderResources({
          organizationId,

          environmentId,

          integrationId,

          provider,

          rawResources:
            dedupeReferences(
              resourceObservations
            ),

          observedAt:
            runtimeResult
              ?.observedAt ||
            new Date(),

          provenance:
            runtimeResult
              ?.provenance ||
            {},
        });


    const relationshipResult =
      await this
        .persistRelationships({
          organizationId,

          environmentId,

          integrationId,

          provider,

          relationships:
            dedupeReferences(
              relationshipObservations
            ),

          observedAt:
            runtimeResult
              ?.observedAt ||
            new Date(),

          provenance:
            runtimeResult
              ?.provenance ||
            {},
        });


    let canonicalChanges =
      [];


    /*
     * Phase 17 already owns the immutable graph change ledger.
     *
     * If the caller supplied a concrete time window, return that canonical
     * change evidence after provider observations have been applied.
     */
    if (
      from &&
      to
    ) {
      canonicalChanges =
        await this
          .temporalTopologyQueryService
          .getChangesBetween({
            organizationId,

            environmentId,

            from,

            to,

            limit:
              normalizePositiveInteger(
                options.limit,
                500
              ),

            offset:
              Math.max(
                Number(
                  options.offset
                ) ||
                0,
                0
              ),
          });
    }


    return {
      provider,

      integrationId,

      providerChangesReceived:
        providerChanges.length,

      resourceObservations:
        resourceResult,

      relationshipObservations:
        relationshipResult,

      canonicalChanges,

      canonicalAuthority:
        "PHASE_17_GRAPH_CHANGE_EVENTS",

      providerProvenance:
        safeProvenance(
          runtimeResult
            ?.provenance
        ),

      executionAuthorized:
        false,
    };
  }


  async resolveEndpoint({
    organizationId,

    environmentId,

    defaultProvider,

    endpoint,
  }) {
    if (
      endpoint.resourceId
    ) {
      return this
        .resourceRepository
        .getResourceById({
          organizationId,

          environmentId,

          resourceId:
            endpoint
              .resourceId,
        });
    }


    return this
      .resourceRepository
      .findResourceByExternalId({
        organizationId,

        environmentId,

        provider:
          endpoint.provider ||
          defaultProvider,

        resourceType:
          endpoint.resourceType,

        externalId:
          endpoint.externalId,
      });
  }
}


function normalizeRelationshipObservation({
  relationship,

  provider,

  observedAt,
}) {
  if (
    !relationship ||
    typeof relationship !==
      "object" ||
    Array.isArray(
      relationship
    )
  ) {
    throw topologyError(
      "Relationship observation must be an object",
      "INTEGRATION_RELATIONSHIP_INVALID"
    );
  }


  const relationshipType =
    String(
      relationship
        .relationshipType ||
      relationship
        .type ||
      ""
    )
      .trim()
      .toUpperCase();


  if (
    !isValidRelationshipType(
      relationshipType
    )
  ) {
    throw topologyError(
      `Invalid relationship type "${relationshipType}"`,
      "INTEGRATION_RELATIONSHIP_TYPE_INVALID"
    );
  }


  const source =
    normalizeEndpoint(
      relationship.source ||
      {
        resourceId:
          relationship
            .sourceResourceId,

        externalId:
          relationship
            .sourceExternalId,

        resourceType:
          relationship
            .sourceResourceType,

        provider:
          relationship
            .sourceProvider,
      },
      provider
    );


  const target =
    normalizeEndpoint(
      relationship.target ||
      {
        resourceId:
          relationship
            .targetResourceId,

        externalId:
          relationship
            .targetExternalId,

        resourceType:
          relationship
            .targetResourceType,

        provider:
          relationship
            .targetProvider,
      },
      provider
    );


  return {
    source,

    target,

    relationshipType,

    confidence:
      normalizeConfidence(
        relationship
          .confidence
      ),

    attributes:
      safeObject(
        relationship
          .attributes
      ),

    evidence:
      safeObject(
        relationship
          .evidence
      ),

    metadata:
      safeObject(
        relationship
          .metadata
      ),

    observedAt:
      relationship
        .observedAt ||
      observedAt ||
      new Date(),
  };
}


function normalizeEndpoint(
  endpoint,
  defaultProvider
) {
  if (
    !endpoint ||
    typeof endpoint !==
      "object"
  ) {
    throw topologyError(
      "Relationship endpoint is required",
      "INTEGRATION_RELATIONSHIP_ENDPOINT_REQUIRED"
    );
  }


  if (
    endpoint.resourceId
  ) {
    return {
      resourceId:
        String(
          endpoint.resourceId
        ),

      provider:
        null,

      resourceType:
        null,

      externalId:
        null,
    };
  }


  if (
    !endpoint.externalId ||
    !endpoint.resourceType
  ) {
    throw topologyError(
      "Relationship endpoint requires resourceId or resourceType + externalId",
      "INTEGRATION_RELATIONSHIP_ENDPOINT_IDENTITY_REQUIRED"
    );
  }


  return {
    resourceId:
      null,

    provider:
      String(
        endpoint.provider ||
        defaultProvider
      )
        .trim()
        .toLowerCase(),

    resourceType:
      String(
        endpoint.resourceType
      )
        .trim()
        .toLowerCase(),

    externalId:
      String(
        endpoint.externalId
      ),
  };
}


function extractRelationships(
  value
) {
  if (
    !value
  ) {
    return [];
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return value;
  }


  if (
    typeof value !==
      "object"
  ) {
    return [];
  }


  if (
    Array.isArray(
      value.relationships
    )
  ) {
    return value.relationships;
  }


  if (
    Array.isArray(
      value.canonicalRelationships
    )
  ) {
    return value
      .canonicalRelationships;
  }


  return [];
}


function extractChanges(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return [];
  }


  return Array.isArray(
    value.changes
  )
    ? value.changes
    : [];
}


function extractResourcesFromChanges(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return [];
  }


  if (
    Array.isArray(
      value.resources
    )
  ) {
    return value.resources;
  }


  return [];
}


function normalizeChangeKind(
  change
) {
  const value =
    String(
      change?.kind ||
      change?.changeKind ||
      change?.entityType ||
      ""
    )
      .trim()
      .toUpperCase();


  if (
    value ===
      "RESOURCE" ||
    value ===
      "RESOURCE_OBSERVED" ||
    value ===
      "RESOURCE_CHANGED"
  ) {
    return "RESOURCE";
  }


  if (
    value ===
      "RELATIONSHIP" ||
    value ===
      "RELATIONSHIP_OBSERVED" ||
    value ===
      "RELATIONSHIP_CHANGED"
  ) {
    return "RELATIONSHIP";
  }


  return "UNKNOWN";
}


function normalizeConfidence(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return 1;
  }


  const parsed =
    Number(
      value
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <
      0 ||
    parsed >
      1
  ) {
    throw topologyError(
      "Relationship confidence must be between 0 and 1",
      "INTEGRATION_RELATIONSHIP_CONFIDENCE_INVALID"
    );
  }


  return parsed;
}


function buildRelationshipSource(
  provider,
  integrationId
) {
  return `integration:${String(
    provider
  )}:${String(
    integrationId
  )}`.slice(
    0,
    255
  );
}


function requireContext(
  input
) {
  for (
    const field
    of [
      "organizationId",

      "environmentId",

      "integrationId",

      "provider",
    ]
  ) {
    if (
      !input[
        field
      ]
    ) {
      throw topologyError(
        `${field} is required`,
        "INTEGRATION_TOPOLOGY_CONTEXT_REQUIRED",
        {
          field,
        }
      );
    }
  }
}


function assertNonAuthorizing(
  result
) {
  if (
    result
      ?.executionAuthorized ===
    true
  ) {
    throw topologyError(
      "Integration topology operation cannot grant execution authorization",
      "INTEGRATION_TOPOLOGY_AUTHORITY_VIOLATION"
    );
  }
}


function dedupeReferences(
  values
) {
  const seen =
    new Set();


  return values.filter(
    (
      value
    ) => {
      if (
        !value ||
        typeof value !==
          "object"
      ) {
        return false;
      }


      /*
       * Object identity dedupe is enough here because the same array entries
       * may be collected from both `changes` and direct resources/relationships.
       */
      if (
        seen.has(
          value
        )
      ) {
        return false;
      }


      seen.add(
        value
      );


      return true;
    }
  );
}


function normalizePositiveInteger(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <=
      0
  ) {
    return fallback;
  }


  return parsed;
}


function safeObject(
  value
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  )
    ? {
        ...value,
      }
    : {};
}


function safeProvenance(
  value
) {
  return {
    invocationId:
      value
        ?.invocationId ||
      null,

    provider:
      value
        ?.provider ||
      null,

    integrationPublicId:
      value
        ?.integrationPublicId ||
      null,

    integrationCanonicalId:
      value
        ?.integrationCanonicalId ||
      null,

    executionAuthorized:
      false,
  };
}


function safeErrorMessage(
  error
) {
  return String(
    error?.message ||
    "Topology discovery failed"
  )
    .replace(
      /(?:password|secret|token|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi,
      "[REDACTED]"
    )
    .slice(
      0,
      1000
    );
}


function topologyError(
  message,
  code,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "IntegrationTopologyDiscoveryError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  IntegrationTopologyDiscoveryGateway,

  DEFAULT_RELATIONSHIP_BATCH_LIMIT,

  normalizeRelationshipObservation,

  extractRelationships,

  extractChanges,
};