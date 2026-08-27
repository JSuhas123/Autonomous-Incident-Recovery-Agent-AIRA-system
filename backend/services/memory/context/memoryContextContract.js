"use strict";


const MEMORY_CONTEXT_VERSION =
  "16.14.1";


const AGENT_MEMORY_TYPES =
  Object.freeze([
    "EPISODIC",
    "OUTCOME",
    "PROCEDURAL",
    "SEMANTIC",
    "HUMAN",
    "BEHAVIOURAL",
  ]);


const MEMORY_CONTEXT_SCOPES =
  Object.freeze([
    "INCIDENT",
    "RESOURCE",
    "SERVICE",
    "ENVIRONMENT",
    "TENANT",
    "GLOBAL",
  ]);


const MEMORY_CONTEXT_SAFETY =
  Object.freeze({
    executionAuthorized:
      false,

    grantsExecutionPermission:
      false,

    bypassesPolicy:
      false,

    suppressesAlerts:
      false,

    authoritativeStore:
      "postgresql",

    retrievalStore:
      "qdrant",
  });


class MemoryContextContract {

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


  normalizeString(
    value
  ) {
    if (
      value ===
        null ||
      value ===
        undefined
    ) {
      return null;
    }


    const normalized =
      String(
        value
      ).trim();


    return normalized ||
      null;
  }


  validateRequest({
    organizationId,
    query,
  }) {
    const normalizedOrganizationId =
      this.normalizeString(
        organizationId
      );


    if (
      !normalizedOrganizationId
    ) {
      throw this.createError(
        "Organization is required for memory context",
        "MEMORY_CONTEXT_ORGANIZATION_REQUIRED"
      );
    }


    const normalizedQuery =
      this.normalizeString(
        query
      );


    if (
      !normalizedQuery
    ) {
      throw this.createError(
        "Query is required for memory context",
        "MEMORY_CONTEXT_QUERY_REQUIRED"
      );
    }


    return {
      organizationId:
        normalizedOrganizationId,

      query:
        normalizedQuery,
    };
  }


  normalizeMemory(
    memory
  ) {
    if (
      !memory ||
      typeof memory !==
        "object"
    ) {
      throw this.createError(
        "Invalid memory context item",
        "MEMORY_CONTEXT_ITEM_INVALID"
      );
    }


    const memoryType =
      this
        .normalizeString(
          memory.memoryType ||
          memory.memory_type
        )
        ?.toUpperCase();


    if (
      !AGENT_MEMORY_TYPES.includes(
        memoryType
      )
    ) {
      throw this.createError(
        `Unsupported agent memory type: ${memoryType}`,
        "MEMORY_CONTEXT_TYPE_UNSUPPORTED"
      );
    }


    const scopeType =
      this
        .normalizeString(
          memory.scopeType ||
          memory.scope_type
        )
        ?.toUpperCase();


    if (
      !MEMORY_CONTEXT_SCOPES.includes(
        scopeType
      )
    ) {
      throw this.createError(
        `Unsupported memory scope: ${scopeType}`,
        "MEMORY_CONTEXT_SCOPE_UNSUPPORTED"
      );
    }


    return {
      id:
        memory.id ||
        null,

      publicId:
        memory.publicId ||
        memory.public_id ||
        null,

      memoryType,

      scopeType,

      /**
       * Canonical PostgreSQL organization identity.
       *
       * This may be the internal UUID.
       */
      organizationId:
        memory.organizationId ||
        memory.organization_id ||
        null,

      /**
       * Verified API-facing tenant identity.
       *
       * MemorySearchService is allowed to populate this
       * only after successful PostgreSQL hydration.
       */
      tenantPublicId:
        memory.tenantPublicId ||
        memory.organizationPublicId ||
        memory.organization_public_id ||
        null,

     environmentId:
  memory.environmentId ||
  memory.environment_id ||
  null,

environmentPublicId:
  memory.environmentPublicId ||
  memory.environment_public_id ||
  null,

serviceId:
  memory.serviceId ||
  memory.service_id ||
  null,

servicePublicId:
  memory.servicePublicId ||
  memory.service_public_id ||
  null,

resourceId:
  memory.resourceId ||
  memory.resource_id ||
  null,

resourcePublicId:
  memory.resourcePublicId ||
  memory.resource_public_id ||
  null,

incidentId:
  memory.incidentId ||
  memory.incident_id ||
  null,

incidentPublicId:
  memory.incidentPublicId ||
  memory.incident_public_id ||
  null,

identityVerification:
  memory.identityVerification ||
  null,
      title:
        memory.title ||
        null,

      summary:
        memory.summary ||
        null,

      content:
        memory.content ||
        {},

      confidence:
        Number(
          memory.confidence ??
          0
        ),

      trustScore:
        Number(
          memory.trustScore ??
          memory.trust_score ??
          0
        ),

      importance:
        Number(
          memory.importance ??
          0
        ),

      status:
        String(
          memory.status ||
          "UNKNOWN"
        )
          .trim()
          .toUpperCase(),

      evidenceCount:
        Number(
          memory.evidenceCount ??
          memory.evidence_count ??
          0
        ),

      sourceCount:
        Number(
          memory.sourceCount ??
          memory.source_count ??
          0
        ),

      observationCount:
        Number(
          memory.observationCount ??
          memory.observation_count ??
          0
        ),

      observedAt:
        memory.observedAt ||
        memory.observed_at ||
        null,

      validFrom:
        memory.validFrom ||
        memory.valid_from ||
        null,

      validUntil:
        memory.validUntil ||
        memory.valid_until ||
        null,

      createdAt:
        memory.createdAt ||
        memory.created_at ||
        null,

      updatedAt:
        memory.updatedAt ||
        memory.updated_at ||
        null,

      metadata:
        memory.metadata ||
        {},

      retrieval:
        memory.retrieval ||
        null,
    };
  }


  assertTenantMemory({
    memory,
    organizationId,
  }) {
    /**
     * GLOBAL knowledge is intentionally not owned
     * by the requesting tenant.
     */
    if (
      memory.scopeType ===
        "GLOBAL"
    ) {
      return true;
    }


    const requestedTenant =
      this.normalizeString(
        organizationId
      );


    const verifiedPublicTenant =
      this.normalizeString(
        memory.tenantPublicId
      );


    /**
     * Preferred comparison:
     *
     * verified public identity established after
     * PostgreSQL hydration.
     */
    if (
      verifiedPublicTenant
    ) {
      if (
        verifiedPublicTenant !==
          requestedTenant
      ) {
        throw this.createError(
          "Cross-tenant memory detected in agent context",
          "MEMORY_CONTEXT_TENANT_VIOLATION",
          403
        );
      }


      return true;
    }


    /**
     * Backward-compatible/raw-context comparison.
     *
     * Unit tests and callers that directly construct
     * memory contexts may supply organizationId using
     * the public identity.
     *
     * Do NOT consider an arbitrary UUID equivalent to
     * a public tenant ID here.
     */
    const rawOrganizationId =
      this.normalizeString(
        memory.organizationId
      );


    if (
      rawOrganizationId !==
        requestedTenant
    ) {
      throw this.createError(
        "Cross-tenant memory detected in agent context",
        "MEMORY_CONTEXT_TENANT_VIOLATION",
        403
      );
    }


    return true;
  }


  createContext({
    organizationId,

    environmentId =
      null,

    serviceId =
      null,

    resourceId =
      null,

    incidentId =
      null,

    query,

    memories =
      [],

    retrieval =
      {},

    diagnostics =
      {},
  }) {
    const request =
      this
        .validateRequest({
          organizationId,
          query,
        });


    if (
      !Array.isArray(
        memories
      )
    ) {
      throw this.createError(
        "Memory context memories must be an array",
        "MEMORY_CONTEXT_MEMORIES_INVALID"
      );
    }


    const normalizedMemories =
      memories.map(
        (
          memory
        ) =>
          this.normalizeMemory(
            memory
          )
      );


    for (
      const memory
      of normalizedMemories
    ) {
      this.assertTenantMemory({
        memory,

        organizationId:
          request.organizationId,
      });
    }


    const byType =
      {};


    for (
      const type
      of AGENT_MEMORY_TYPES
    ) {
      byType[
        type
      ] =
        [];
    }


    for (
      const memory
      of normalizedMemories
    ) {
      byType[
        memory.memoryType
      ].push(
        memory
      );
    }


    return {
      contextVersion:
        MEMORY_CONTEXT_VERSION,

      generatedAt:
        new Date(),

      request: {
        organizationId:
          request.organizationId,

        environmentId:
          this.normalizeString(
            environmentId
          ),

        serviceId:
          this.normalizeString(
            serviceId
          ),

        resourceId:
          this.normalizeString(
            resourceId
          ),

        incidentId:
          this.normalizeString(
            incidentId
          ),

        query:
          request.query,
      },

      memories:
        normalizedMemories,

      byType,

      counts: {
        total:
          normalizedMemories.length,

        episodic:
          byType
            .EPISODIC
            .length,

        outcome:
          byType
            .OUTCOME
            .length,

        procedural:
          byType
            .PROCEDURAL
            .length,

        semantic:
          byType
            .SEMANTIC
            .length,

        human:
          byType
            .HUMAN
            .length,

        behavioural:
          byType
            .BEHAVIOURAL
            .length,
      },

      retrieval: {
        candidateStore:
          "qdrant",

        authoritativeStore:
          "postgresql",

        ...retrieval,
      },

      diagnostics:
        diagnostics ||
        {},

      safety: {
        ...MEMORY_CONTEXT_SAFETY,
      },
    };
  }


  assertSafeContext(
    context
  ) {
    if (
      !context ||
      typeof context !==
        "object"
    ) {
      throw this.createError(
        "Memory context is required",
        "MEMORY_CONTEXT_REQUIRED"
      );
    }


    if (
      context
        ?.safety
        ?.executionAuthorized !==
        false ||

      context
        ?.safety
        ?.grantsExecutionPermission !==
        false ||

      context
        ?.safety
        ?.bypassesPolicy !==
        false ||

      context
        ?.safety
        ?.suppressesAlerts !==
        false
    ) {
      throw this.createError(
        "Unsafe memory context detected",
        "MEMORY_CONTEXT_SAFETY_VIOLATION",
        403
      );
    }


    return true;
  }
}


const memoryContextContract =
  new MemoryContextContract();


module.exports = {
  MEMORY_CONTEXT_VERSION,

  AGENT_MEMORY_TYPES,

  MEMORY_CONTEXT_SCOPES,

  MEMORY_CONTEXT_SAFETY,

  MemoryContextContract,

  memoryContextContract,
};