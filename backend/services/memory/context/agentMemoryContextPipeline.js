"use strict";


const {
  memoryContextService,
} =
  require(
    "./memoryContextService"
  );


const {
  memoryLifecycleService,
} =
  require(
    "./memoryLifecycleService"
  );


const {
  memoryScopeResolver,
} =
  require(
    "./memoryScopeResolver"
  );


const {
  memoryTrustScorer,
} =
  require(
    "./memoryTrustScorer"
  );


const {
  memoryConflictResolver,
} =
  require(
    "./memoryConflictResolver"
  );


const {
  memoryContextContract,
} =
  require(
    "./memoryContextContract"
  );


class AgentMemoryContextPipeline {

  constructor(
    options = {}
  ) {
    this.contextService =
      options.contextService ||
      memoryContextService;

    this.lifecycleService =
      options.lifecycleService ||
      memoryLifecycleService;

    this.scopeResolver =
      options.scopeResolver ||
      memoryScopeResolver;

    this.trustScorer =
      options.trustScorer ||
      memoryTrustScorer;

    this.conflictResolver =
      options.conflictResolver ||
      memoryConflictResolver;

    this.contract =
      options.contract ||
      memoryContextContract;
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


  async build({
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

    memoryTypes =
      [],

    scopes =
      [],

    includeGlobal =
      false,

    limit =
      20,

    now =
      new Date(),
  }) {
    const baseContext =
      await this
        .contextService
        .buildContext({
          organizationId,

          environmentId,

          serviceId,

          resourceId,

          incidentId,

          query,

          memoryTypes,

          scopes,

          includeGlobal,

          limit,
        });


    this.contract
      .assertSafeContext(
        baseContext
      );


    /**
     * ------------------------------------------------------------
     * STEP 1 — LIFECYCLE FILTER
     * ------------------------------------------------------------
     *
     * Only ACTIVE memories are allowed to continue.
     */
    const lifecycle =
      this
        .lifecycleService
        .filterRetrievalEligible(
          baseContext.memories
        );


    /**
     * ------------------------------------------------------------
     * STEP 2 — SCOPE RESOLUTION
     * ------------------------------------------------------------
     */
    const scope =
      this
        .scopeResolver
        .resolveMany({
          memories:
            lifecycle.accepted,

          request:
            baseContext.request,

          includeGlobal,
        });


    /**
     * ------------------------------------------------------------
     * STEP 3 — TRUST SCORING
     * ------------------------------------------------------------
     */
    const scored =
      this
        .trustScorer
        .scoreMany({
          resolvedMemories:
            scope.accepted,

          now,
        });


    /**
     * ------------------------------------------------------------
     * STEP 4 — CONFLICT DETECTION
     * ------------------------------------------------------------
     *
     * Conflict detection operates only on:
     *
     *   ACTIVE
     *   tenant-valid
     *   scope-valid
     *
     * memories.
     */
    const conflicts =
      this
        .conflictResolver
        .resolve(
          scored.map(
            (
              item
            ) =>
              item.memory
          )
        );


    /**
     * ------------------------------------------------------------
     * STEP 5 — AGENT MEMORY PACKAGE
     * ------------------------------------------------------------
     */
    const rankedMemories =
      scored.map(
        (
          item,
          index
        ) => ({
          rank:
            index +
            1,

          memory:
            item.memory,

          scope: {
            type:
              item
                .resolution
                .scopeType,

            score:
              item
                .resolution
                .scopeScore,

            matchLevel:
              item
                .resolution
                .matchLevel,
          },

          trust: {
            score:
              item
                .trust
                .score,

            components:
              item
                .trust
                .components,
          },
        })
      );


    const result = {
      contextVersion:
        baseContext.contextVersion,

      generatedAt:
        new Date(),

      request:
        baseContext.request,

      rankedMemories,

      memories:
        rankedMemories.map(
          (
            item
          ) =>
            item.memory
        ),

      conflicts,

      diagnostics: {
        retrieval:
          baseContext.diagnostics,

        lifecycle: {
          inputCount:
            baseContext
              .memories
              .length,

          acceptedCount:
            lifecycle
              .accepted
              .length,

          rejectedCount:
            lifecycle
              .rejected
              .length,

          rejected:
            lifecycle.rejected.map(
              (
                item
              ) => ({
                publicId:
                  item
                    .memory
                    ?.publicId ||
                  item
                    .memory
                    ?.public_id ||
                  null,

                status:
                  item
                    .memory
                    ?.status ||
                  null,

                reason:
                  item.reason,
              })
            ),
        },

        scope:
          scope.diagnostics,

        ranking: {
          count:
            rankedMemories.length,

          topMemoryPublicId:
            rankedMemories[0]
              ?.memory
              ?.publicId ||
            rankedMemories[0]
              ?.memory
              ?.public_id ||
            null,

          topTrustScore:
            rankedMemories[0]
              ?.trust
              ?.score ??
            null,
        },

        conflicts: {
          count:
            conflicts.conflictCount,

          requiresHumanReview:
            conflicts
              .requiresHumanReview,

          critical:
            conflicts.critical,
        },
      },

      /**
       * ----------------------------------------------------------
       * HARD SAFETY BOUNDARY
       * ----------------------------------------------------------
       *
       * These values are intentionally duplicated here even though
       * lower layers already enforce them.
       *
       * The final agent-facing package must NEVER be interpreted as
       * an authorization object.
       */
      safety: {
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

        suppressesAlerts:
          false,

        automaticConflictResolution:
          false,

        memoryIsEvidenceOnly:
          true,

        requiresPolicyEvaluation:
          true,

        requiresAuthorization:
          true,
      },
    };


    this.assertSafeAgentContext(
      result
    );


    return result;
  }


  assertSafeAgentContext(
    context
  ) {
    if (
      !context ||
      typeof context !==
        "object"
    ) {
      throw this.createError(
        "Agent memory context is required",
        "AGENT_MEMORY_CONTEXT_REQUIRED"
      );
    }


    const safety =
      context.safety ||
      {};


    const forbiddenTrueFields = [
      "executionAuthorized",
      "grantsExecutionPermission",
      "bypassesPolicy",
      "bypassesApproval",
      "bypassesEntitlements",
      "bypassesKillSwitch",
      "suppressesAlerts",
      "automaticConflictResolution",
    ];


    for (
      const field
      of forbiddenTrueFields
    ) {
      if (
        safety[
          field
        ] !==
        false
      ) {
        throw this.createError(
          `Unsafe memory context safety field: ${field}`,
          "AGENT_MEMORY_CONTEXT_SAFETY_VIOLATION",
          403
        );
      }
    }


    if (
      safety.memoryIsEvidenceOnly !==
        true
    ) {
      throw this.createError(
        "Memory context must remain evidence-only",
        "AGENT_MEMORY_CONTEXT_EVIDENCE_ONLY_REQUIRED",
        403
      );
    }


    if (
      safety.requiresPolicyEvaluation !==
        true
    ) {
      throw this.createError(
        "Memory context cannot bypass policy evaluation",
        "AGENT_MEMORY_CONTEXT_POLICY_REQUIRED",
        403
      );
    }


    if (
      safety.requiresAuthorization !==
        true
    ) {
      throw this.createError(
        "Memory context cannot bypass authorization",
        "AGENT_MEMORY_CONTEXT_AUTHORIZATION_REQUIRED",
        403
      );
    }


    return true;
  }
}


const agentMemoryContextPipeline =
  new AgentMemoryContextPipeline();


module.exports = {
  AgentMemoryContextPipeline,

  agentMemoryContextPipeline,

  buildAgentMemoryContext:
    agentMemoryContextPipeline
      .build
      .bind(
        agentMemoryContextPipeline
      ),
};