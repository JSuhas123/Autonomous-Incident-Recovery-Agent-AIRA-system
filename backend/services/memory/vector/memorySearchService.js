"use strict";


const crypto =
  require(
    "node:crypto"
  );


const {
  embeddingProviderService,
} =
  require(
    "../embedding/embeddingProviderService"
  );


const {
  QdrantMemoryClient,
} =
  require(
    "./qdrantMemoryClient"
  );


const {
  memoryHydrationService,
} =
  require(
    "./memoryHydrationService"
  );


const PostgresMemoryRetrievalRepository =
  require(
    "../../../persistence/postgres/PostgresMemoryRetrievalRepository"
  );


const {
  assertQdrantConfig,
} =
  require(
    "./qdrantConfig"
  );


const {
  isKnownMemoryType,
} =
  require(
    "../../../constants/memoryTypes"
  );


const {
  isKnownMemoryScope,
} =
  require(
    "../../../constants/memoryScopes"
  );


class MemorySearchService {

  constructor(
    options = {}
  ) {
    this.embeddingProvider =
      options.embeddingProvider ||
      embeddingProviderService;

    this.qdrant =
      options.qdrant ||
      new QdrantMemoryClient(
        options
      );

    this.hydrationService =
      options.hydrationService ||
      memoryHydrationService;

    this.repository =
      options.repository ||
      new PostgresMemoryRetrievalRepository(
        options
      );
  }


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


  sha256(
    value
  ) {
    return crypto
      .createHash(
        "sha256"
      )
      .update(
        String(
          value
        )
      )
      .digest(
        "hex"
      );
  }


  normalizeLimit(
    value
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
      return 10;
    }


    return Math.min(
      parsed,
      50
    );
  }


  normalizeMemoryTypes(
    values
  ) {
    if (
      !Array.isArray(
        values
      )
    ) {
      return [];
    }


    const unique =
      [
        ...new Set(
          values
        ),
      ];


    for (
      const value
      of unique
    ) {
      if (
        !isKnownMemoryType(
          value
        )
      ) {
        throw this.createError(
          "Unknown memory type requested",
          "MEMORY_RETRIEVAL_TYPE_UNKNOWN"
        );
      }
    }


    return unique;
  }


  normalizeScopes(
    values
  ) {
    if (
      !Array.isArray(
        values
      )
    ) {
      return [];
    }


    const unique =
      [
        ...new Set(
          values
        ),
      ];


    for (
      const value
      of unique
    ) {
      if (
        !isKnownMemoryScope(
          value
        )
      ) {
        throw this.createError(
          "Unknown memory scope requested",
          "MEMORY_RETRIEVAL_SCOPE_UNKNOWN"
        );
      }
    }


    return unique;
  }


  async search({
    organizationId,

    query,

    environmentId =
      null,

    serviceId =
      null,

    resourceId =
      null,

    incidentId =
      null,

    memoryTypes =
      [],

    scopes =
      [],

    includeGlobal =
      false,

    limit =
      10,
  }) {
    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization is required for memory retrieval",
        "MEMORY_RETRIEVAL_ORGANIZATION_REQUIRED"
      );
    }


    if (
      typeof query !==
        "string" ||
      query.trim().length ===
        0
    ) {
      throw this.createError(
        "Memory retrieval query is required",
        "MEMORY_RETRIEVAL_QUERY_REQUIRED"
      );
    }


    const normalizedQuery =
      query
        .replace(
          /\s+/g,
          " "
        )
        .trim();


    const normalizedTypes =
      this
        .normalizeMemoryTypes(
          memoryTypes
        );


    const normalizedScopes =
      this
        .normalizeScopes(
          scopes
        );


    const normalizedLimit =
      this
        .normalizeLimit(
          limit
        );


    const embedding =
      await this.embeddingProvider
        .embed(
          normalizedQuery
        );


    const config =
      assertQdrantConfig();


    const audit =
      await this.repository
        .createRetrievalAudit({
          organizationId,

          environmentId,

          queryHash:
            this.sha256(
              normalizedQuery
            ),

          queryLength:
            normalizedQuery
              .length,

          embeddingProvider:
            embedding.provider,

          embeddingModel:
            embedding.model,

          embeddingVersion:
            embedding.version,

          dimensions:
            embedding.dimensions,

          qdrantCollection:
            config.collection,

          requestedMemoryTypes:
            normalizedTypes,

          requestedScopes:
            normalizedScopes,

          includeGlobal,

          requestedLimit:
            normalizedLimit,

          metadata: {
            phase:
              "16.14",

            tenantIdentityModel:
              "postgres-verified-public-identities",
          },
        });


    try {
      const candidates =
        await this.qdrant
          .queryMemoryCandidates({
            vector:
              embedding.vector,

            organizationId,

            environmentId,

            serviceId,

            resourceId,

            incidentId,

            memoryTypes:
              normalizedTypes,

            scopes:
              normalizedScopes,

            includeGlobal,

            limit:
              normalizedLimit,
          });


      const hydrated =
        await this.hydrationService
          .hydrate({
            organizationId,

            candidates,

            environmentId,

            serviceId,

            resourceId,

            incidentId,

            memoryTypes:
              normalizedTypes,

            scopes:
              normalizedScopes,

            includeGlobal,
          });


      /**
       * ==========================================================
       * VERIFIED PUBLIC IDENTITIES
       * ==========================================================
       *
       * At this point PostgreSQL hydration has already performed
       * authoritative tenant/scope validation.
       *
       * Canonical *_id fields remain PostgreSQL UUIDs.
       *
       * These *PublicId fields represent the external identities
       * under which PostgreSQL authorized this retrieval.
       *
       * They are NEVER taken from Qdrant payload.
       */
      const verifiedMemories =
        hydrated
          .memories
          .map(
            (
              memory
            ) => {
              const scopeType =
                String(
                  memory.scopeType ||
                  memory.scope_type ||
                  ""
                )
                  .trim()
                  .toUpperCase();


              const isGlobal =
                scopeType ===
                "GLOBAL";


              return {
                ...memory,

                tenantPublicId:
                  isGlobal
                    ? null
                    : String(
                        organizationId
                      ),

                environmentPublicId:
                  !isGlobal &&
                  environmentId
                    ? String(
                        environmentId
                      )
                    : null,

                servicePublicId:
                  !isGlobal &&
                  serviceId
                    ? String(
                        serviceId
                      )
                    : null,

                resourcePublicId:
                  !isGlobal &&
                  resourceId
                    ? String(
                        resourceId
                      )
                    : null,

                incidentPublicId:
                  !isGlobal &&
                  incidentId
                    ? String(
                        incidentId
                      )
                    : null,

                identityVerification: {
                  source:
                    "POSTGRESQL_HYDRATION",

                  tenantVerified:
                    !isGlobal,

                  environmentVerified:
                    Boolean(
                      environmentId
                    ),

                  serviceVerified:
                    Boolean(
                      serviceId
                    ),

                  resourceVerified:
                    Boolean(
                      resourceId
                    ),

                  incidentVerified:
                    Boolean(
                      incidentId
                    ),
                },
              };
            }
          );


      await this.repository
        .completeRetrievalAudit({
          organizationId,

          auditId:
            audit.id,

          candidateCount:
            hydrated.candidateCount,

          hydratedCount:
            hydrated.hydratedCount,
        });


      return {
        query:
          normalizedQuery,

        organizationId,

        count:
          verifiedMemories.length,

        memories:
          verifiedMemories,

        diagnostics: {
          candidateCount:
            hydrated.candidateCount,

          hydratedCount:
            hydrated.hydratedCount,

          rejectedCount:
            hydrated.rejectedCount,

          embeddingProvider:
            embedding.provider,

          embeddingModel:
            embedding.model,

          auditCode:
            audit.retrieval_code,

          identityModel:
            "POSTGRES_VERIFIED_PUBLIC_IDENTITIES",
        },
      };

    } catch (
      error
    ) {
      await this.repository
        .failRetrievalAudit({
          organizationId,

          auditId:
            audit.id,

          code:
            error.code ||
            "MEMORY_RETRIEVAL_FAILED",

          message:
            error.message,
        });


      throw error;
    }
  }
}


const memorySearchService =
  new MemorySearchService();


module.exports = {
  MemorySearchService,

  memorySearchService,

  searchMemories:
    memorySearchService
      .search
      .bind(
        memorySearchService
      ),
};