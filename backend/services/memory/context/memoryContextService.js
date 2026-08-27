"use strict";


const {
  memorySearchService,
} =
  require(
    "../vector/memorySearchService"
  );


const {
  memoryContextContract,
} =
  require(
    "./memoryContextContract"
  );


class MemoryContextService {

  constructor(
    options = {}
  ) {
    this.searchService =
      options.searchService ||
      memorySearchService;

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
      return 20;
    }


    return Math.min(
      parsed,
      100
    );
  }


  async buildContext({
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
  }) {
    const validated =
      this.contract
        .validateRequest({
          organizationId,
          query,
        });


    const normalizedLimit =
      this
        .normalizeLimit(
          limit
        );


    const search =
      await this.searchService
        .search({
          organizationId:
            validated.organizationId,

          environmentId,

          serviceId,

          resourceId,

          incidentId,

          query:
            validated.query,

          memoryTypes,

          scopes,

          includeGlobal,

          limit:
            normalizedLimit,
        });


    const context =
      this.contract
        .createContext({
          organizationId:
            validated.organizationId,

          environmentId,

          serviceId,

          resourceId,

          incidentId,

          query:
            validated.query,

          memories:
            search.memories ||
            [],

          retrieval: {
            candidateStore:
              "qdrant",

            authoritativeStore:
              "postgresql",

            includeGlobal:
              Boolean(
                includeGlobal
              ),

            requestedTypes:
              memoryTypes,

            requestedScopes:
              scopes,

            requestedLimit:
              normalizedLimit,
          },

          diagnostics: {
            candidateCount:
              search
                ?.diagnostics
                ?.candidateCount ??
              0,

            hydratedCount:
              search
                ?.diagnostics
                ?.hydratedCount ??
              0,

            rejectedCount:
              search
                ?.diagnostics
                ?.rejectedCount ??
              0,

            embeddingProvider:
              search
                ?.diagnostics
                ?.embeddingProvider ||
              null,

            embeddingModel:
              search
                ?.diagnostics
                ?.embeddingModel ||
              null,

            retrievalAuditCode:
              search
                ?.diagnostics
                ?.auditCode ||
              null,
          },
        });


    this.contract
      .assertSafeContext(
        context
      );


    return context;
  }
}


const memoryContextService =
  new MemoryContextService();


module.exports = {
  MemoryContextService,

  memoryContextService,

  buildMemoryContext:
    memoryContextService
      .buildContext
      .bind(
        memoryContextService
      ),
};