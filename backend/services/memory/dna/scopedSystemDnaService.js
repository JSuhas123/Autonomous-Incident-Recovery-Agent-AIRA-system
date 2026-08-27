"use strict";


const {
  buildAgentMemoryContext,
} =
  require(
    "../context/agentMemoryContextPipeline"
  );


const {
  memorySearchService,
} =
  require(
    "../vector/memorySearchService"
  );


const {
  memoryConflictResolver,
} =
  require(
    "../context/memoryConflictResolver"
  );


const {
  systemDnaAggregator,
} =
  require(
    "./systemDnaAggregator"
  );


const {
  systemDnaSynthesizer,
} =
  require(
    "./systemDnaSynthesizer"
  );


const {
  systemDnaService,
} =
  require(
    "./systemDnaService"
  );


const {
  SYSTEM_DNA_MEMORY_FAMILIES,
} =
  require(
    "./systemDnaContract"
  );


class ScopedSystemDnaService {

  constructor(
    options = {}
  ) {
    this.contextBuilder =
      options.contextBuilder ||
      buildAgentMemoryContext;

    this.searchService =
      options.searchService ||
      memorySearchService;

    this.conflictResolver =
      options.conflictResolver ||
      memoryConflictResolver;

    this.aggregator =
      options.aggregator ||
      systemDnaAggregator;

    this.synthesizer =
      options.synthesizer ||
      systemDnaSynthesizer;

    this.dnaService =
      options.dnaService ||
      systemDnaService;
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


  validateScope({
    scopeType,

    environmentId =
      null,

    serviceId =
      null,

    resourceId =
      null,
  }) {
    const normalized =
      String(
        scopeType ||
        ""
      )
        .trim()
        .toUpperCase();


    if (
      normalized ===
        "TENANT"
    ) {
      return normalized;
    }


    if (
      normalized ===
        "ENVIRONMENT"
    ) {
      if (
        !environmentId
      ) {
        throw this.createError(
          "Environment is required for environment DNA",
          "SYSTEM_DNA_ENVIRONMENT_REQUIRED"
        );
      }


      return normalized;
    }


    if (
      normalized ===
        "SERVICE"
    ) {
      if (
        !environmentId ||
        !serviceId
      ) {
        throw this.createError(
          "Environment and service are required for service DNA",
          "SYSTEM_DNA_SERVICE_IDENTITY_REQUIRED"
        );
      }


      return normalized;
    }


    if (
      normalized ===
        "RESOURCE"
    ) {
      if (
        !environmentId ||
        !serviceId ||
        !resourceId
      ) {
        throw this.createError(
          "Environment service and resource are required for resource DNA",
          "SYSTEM_DNA_RESOURCE_IDENTITY_REQUIRED"
        );
      }


      return normalized;
    }


    throw this.createError(
      `Unsupported System DNA scope: ${normalized}`,
      "SYSTEM_DNA_SCOPE_INVALID"
    );
  }


  retrievalScopes(
    scopeType
  ) {
    switch (
      scopeType
    ) {
      case "RESOURCE":
        return [
          "RESOURCE",
          "SERVICE",
          "ENVIRONMENT",
          "TENANT",
        ];


      case "SERVICE":
        return [
          "SERVICE",
          "ENVIRONMENT",
          "TENANT",
        ];


      case "ENVIRONMENT":
        return [
          "ENVIRONMENT",
          "TENANT",
        ];


      case "TENANT":
        return [
          "TENANT",
        ];


      default:
        return [];
    }
  }


  descendantScopes(
    scopeType
  ) {
    switch (
      scopeType
    ) {
      case "RESOURCE":
        return [
          "INCIDENT",
        ];


      case "SERVICE":
        return [
          "RESOURCE",
          "INCIDENT",
        ];


      case "ENVIRONMENT":
        return [
          "SERVICE",
          "RESOURCE",
          "INCIDENT",
        ];


      case "TENANT":
        return [
          "ENVIRONMENT",
          "SERVICE",
          "RESOURCE",
          "INCIDENT",
        ];


      default:
        return [];
    }
  }


  mergeMemories(
    ...collections
  ) {
    const byId =
      new Map();


    for (
      const collection
      of collections
    ) {
      if (
        !Array.isArray(
          collection
        )
      ) {
        continue;
      }


      for (
        const memory
        of collection
      ) {
        if (
          !memory
        ) {
          continue;
        }


        const id =
          memory.publicId ||
          memory.public_id ||
          memory.id ||
          null;


        if (
          !id
        ) {
          continue;
        }


        /**
         * Only authoritative ACTIVE memory
         * may contribute to current System DNA.
         */
        if (
          String(
            memory.status ||
            ""
          )
            .trim()
            .toUpperCase() !==
          "ACTIVE"
        ) {
          continue;
        }


        if (
          !byId.has(
            String(
              id
            )
          )
        ) {
          byId.set(
            String(
              id
            ),
            memory
          );
        }
      }
    }


    return [
      ...byId.values(),
    ];
  }


  async loadDescendantEvidence({
    organizationId,

    environmentId,

    serviceId,

    resourceId,

    scopeType,

    query,

    includeGlobal,

    limit,
  }) {
    const scopes =
      this.descendantScopes(
        scopeType
      );


    if (
      scopes.length ===
        0
    ) {
      return {
        memories:
          [],

        diagnostics: {
          candidateCount:
            0,

          hydratedCount:
            0,

          rejectedCount:
            0,
        },
      };
    }


    /**
     * IMPORTANT
     *
     * This intentionally uses MemorySearchService,
     * not AgentMemoryContextPipeline.
     *
     * Reason:
     *
     * Agent context asks:
     *   "What memories apply to THIS current scope?"
     *
     * DNA asks:
     *   "What authoritative child-scope history belongs
     *    to this service/environment/tenant?"
     *
     * MemorySearchService still guarantees:
     *
     *   Qdrant = candidate discovery
     *   PostgreSQL = authoritative hydration
     *
     * Therefore System DNA never trusts Qdrant content.
     */
    return this.searchService
      .search({
        organizationId,

        environmentId,

        serviceId,

        resourceId,

        incidentId:
          null,

        query,

        memoryTypes:
          SYSTEM_DNA_MEMORY_FAMILIES,

        scopes,

        includeGlobal:
          Boolean(
            includeGlobal
          ),

        limit,
      });
  }


  async build({
    organizationId,

    canonicalOrganizationId =
      null,

    scopeType,

    environmentId =
      null,

    canonicalEnvironmentId =
      null,

    serviceId =
      null,

    resourceId =
      null,

    query =
      "Build operational System DNA from trusted memory",

    includeGlobal =
      false,

    limit =
      50,
  }) {
    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization is required for System DNA",
        "SYSTEM_DNA_ORGANIZATION_REQUIRED"
      );
    }


    const normalizedScope =
      this.validateScope({
        scopeType,

        environmentId,

        serviceId,

        resourceId,
      });


    const ancestorScopes =
      this.retrievalScopes(
        normalizedScope
      );


    /**
     * ----------------------------------------------------------
     * PART 1 — CURRENT / ANCESTOR CONTEXT
     * ----------------------------------------------------------
     *
     * Uses the fully certified 16.14 agent-memory pipeline.
     */
    const context =
      await this.contextBuilder({
        organizationId,

        environmentId,

        serviceId,

        resourceId,

        query,

        memoryTypes:
          SYSTEM_DNA_MEMORY_FAMILIES,

        scopes:
          normalizedScope ===
            "TENANT"
            ? []
            : ancestorScopes,

        includeGlobal,

        limit,
      });


    /**
     * ----------------------------------------------------------
     * PART 2 — DESCENDANT OPERATIONAL HISTORY
     * ----------------------------------------------------------
     *
     * SERVICE DNA needs INCIDENT outcomes.
     *
     * ENVIRONMENT DNA needs service/resource/incident history.
     *
     * TENANT DNA needs the complete operational hierarchy.
     */
    const descendants =
      await this
        .loadDescendantEvidence({
          organizationId,

          environmentId,

          serviceId,

          resourceId,

          scopeType:
            normalizedScope,

          query,

          includeGlobal:
            false,

          limit,
        });


    /**
     * ----------------------------------------------------------
     * PART 3 — AUTHORITATIVE MEMORY UNION
     * ----------------------------------------------------------
     */
    const memories =
      this.mergeMemories(
        context.memories,
        descendants.memories
      );


    const aggregation =
      this.aggregator
        .aggregate(
          memories
        );


    const synthesis =
      this.synthesizer
        .synthesize(
          aggregation
        );


    /**
     * Re-evaluate conflicts over the complete DNA evidence set,
     * including descendant incident history.
     */
    const conflicts =
      this.conflictResolver
        .resolve(
          memories
        );


    const coverageRatio =
      aggregation
        .coverage
        .familyCount /
      SYSTEM_DNA_MEMORY_FAMILIES
        .length;


    const confidence =
      Math.min(
        1,
        (
          aggregation
            .averageConfidence *
          0.8
        ) +
        (
          coverageRatio *
          0.2
        )
      );


    const trustScore =
      Math.min(
        1,
        aggregation
          .averageTrust
      );


    const dna =
      this.dnaService
        .build({
          organizationId:
            canonicalOrganizationId ||
            organizationId,

          tenantPublicId:
            organizationId,

          scopeType:
            normalizedScope,

          environmentId:
            normalizedScope ===
              "TENANT"
              ? null
              : (
                  canonicalEnvironmentId ||
                  environmentId
                ),

          environmentPublicId:
            normalizedScope ===
              "TENANT"
              ? null
              : environmentId,

          serviceId:
            (
              normalizedScope ===
                "SERVICE" ||
              normalizedScope ===
                "RESOURCE"
            )
              ? serviceId
              : null,

          servicePublicId:
            (
              normalizedScope ===
                "SERVICE" ||
              normalizedScope ===
                "RESOURCE"
            )
              ? serviceId
              : null,

          resourceId:
            normalizedScope ===
              "RESOURCE"
              ? resourceId
              : null,

          resourcePublicId:
            normalizedScope ===
              "RESOURCE"
              ? resourceId
              : null,

          memoryFamilyCounts:
            aggregation.counts,

          traits:
            synthesis.traits,

          patterns:
            synthesis.patterns,

          procedures:
            synthesis.procedures,

          outcomes:
            synthesis.outcomes,

          humanGuidance:
            synthesis.humanGuidance,

          behaviouralBaselines:
            synthesis
              .behaviouralBaselines,

          evidenceMemoryIds:
            aggregation
              .evidenceMemoryIds,

          confidence,

          trustScore,

          metadata: {
            generator:
              "ScopedSystemDnaService",

            hierarchyAggregation:
              true,

            memoryCount:
              aggregation.memoryCount,

            familyCoverage:
              aggregation
                .coverage
                .familyCount,

            completeFamilyCoverage:
              aggregation
                .coverage
                .complete,

            contextVersion:
              context.contextVersion,

            ancestorMemoryCount:
              Array.isArray(
                context.memories
              )
                ? context
                    .memories
                    .length
                : 0,

            descendantMemoryCount:
              Array.isArray(
                descendants.memories
              )
                ? descendants
                    .memories
                    .length
                : 0,

            conflictCount:
              conflicts
                .conflictCount,

            requiresHumanReview:
              Boolean(
                conflicts
                  .requiresHumanReview
              ),

            executionAuthorized:
              false,
          },
        });


    return {
      dna,

      aggregation,

      synthesis,

      contextDiagnostics: {
        ancestor:
          context.diagnostics,

        descendants:
          descendants.diagnostics,
      },

      conflicts,

      safety: {
        executionAuthorized:
          false,

        evidenceOnly:
          true,

        requiresPolicyEvaluation:
          true,

        requiresAuthorization:
          true,
      },
    };
  }
}


const scopedSystemDnaService =
  new ScopedSystemDnaService();


module.exports = {
  ScopedSystemDnaService,

  scopedSystemDnaService,

  buildScopedSystemDna:
    scopedSystemDnaService
      .build
      .bind(
        scopedSystemDnaService
      ),
};