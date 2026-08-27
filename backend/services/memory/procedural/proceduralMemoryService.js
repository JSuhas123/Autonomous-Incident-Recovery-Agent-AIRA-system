"use strict";


const PostgresMemoryRepository =
  require(
    "../../../persistence/postgres/PostgresMemoryRepository"
  );


const {
  memoryIndexService,
} =
  require(
    "../vector/memoryIndexService"
  );


const {
  proceduralMemoryBuilder,
} =
  require(
    "./proceduralMemoryBuilder"
  );


class ProceduralMemoryService {

  constructor(
    options = {}
  ) {
    this.memoryRepository =
      options.memoryRepository ||
      new PostgresMemoryRepository();

    this.indexService =
      options.indexService ||
      memoryIndexService;

    this.builder =
      options.builder ||
      proceduralMemoryBuilder;
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


  getAction(
    memory
  ) {
    return (
      memory
        ?.content
        ?.recoveryDecision
        ?.action ||
      memory
        ?.content
        ?.recoveryDecision
        ?.decision ||
      null
    );
  }


  getServiceId(
    memory
  ) {
    return (
      memory.serviceId ||
      memory
        ?.content
        ?.incident
        ?.serviceId ||
      null
    );
  }


  async loadOutcomeMemories({
    organizationId,

    environmentId =
      null,

    serviceId =
      null,

    action =
      null,

    limit =
      500,
  }) {
    const outcomes =
      await this
        .memoryRepository
        .listMemories({
          organizationId,

          environmentId,

          memoryTypes: [
            "OUTCOME",
          ],

          statuses: [
            "ACTIVE",
          ],

          limit,
        });


    return outcomes.filter(
      (
        memory
      ) => {
        if (
          serviceId &&
          String(
            this
              .getServiceId(
                memory
              )
          ) !==
          String(
            serviceId
          )
        ) {
          return false;
        }


        if (
          action &&
          String(
            this
              .getAction(
                memory
              )
          ) !==
          String(
            action
          )
        ) {
          return false;
        }


        return true;
      }
    );
  }


  groupByAction(
    outcomes
  ) {
    const groups =
      new Map();


    for (
      const outcome
      of outcomes
    ) {
      const action =
        this
          .getAction(
            outcome
          );


      if (
        !action
      ) {
        continue;
      }


      if (
        !groups.has(
          action
        )
      ) {
        groups.set(
          action,
          []
        );
      }


      groups
        .get(
          action
        )
        .push(
          outcome
        );
    }


    return groups;
  }


  async persistProcedure({
    built,
    organizationId,
  }) {
    const existing =
      await this
        .memoryRepository
        .findByPublicId({
          organizationId,

          publicId:
            built.memory
              .publicId,
        });


    let memory;


    if (
      existing
    ) {
      memory =
        await this
          .memoryRepository
          .updateMemory({
            organizationId,

            publicId:
              existing.publicId,

            patch: {
              title:
                built.memory
                  .title,

              summary:
                built.memory
                  .summary,

              content:
                built.memory
                  .content,

              confidence:
                built.memory
                  .confidence,

              trustScore:
                built.memory
                  .trustScore,

              importance:
                built.memory
                  .importance,

              sourceCount:
                existing
                  .sourceCount,

              evidenceCount:
                built.memory
                  .evidenceCount,

              observationCount:
                built.memory
                  .observationCount,

              observedAt:
                built.memory
                  .observedAt,

              metadata:
                built.memory
                  .metadata,

              schemaVersion:
                built.memory
                  .schemaVersion,
            },

            changeReason:
              "Procedural memory re-synthesized from current outcome evidence",

            changedByType:
              "MEMORY_SYNTHESIS",
          });

    } else {
      memory =
        await this
          .memoryRepository
          .createMemory(
            built.memory
          );
    }


    for (
      const source
      of built.sources
    ) {
      await this
        .memoryRepository
        .addSource({
          organizationId,

          memoryPublicId:
            memory.publicId,

          sourceType:
            source.sourceType,

          sourceId:
            source.sourceId,

          evidenceRole:
            source.evidenceRole,

          observedAt:
            source.observedAt,

          metadata: {
            phase:
              "16.10",
          },
        });
    }


    for (
      const outcome
      of built
        .statistics
        .outcomes
    ) {
      await this
        .memoryRepository
        .addRelation({
          organizationId,

          fromMemoryPublicId:
            memory.publicId,

          toMemoryPublicId:
            outcome.publicId,

          relationType:
            "DERIVED_FROM",

          confidence:
            Math.max(
              0,

              Math.min(
                1,
                outcome.confidence
              )
            ),

          metadata: {
            phase:
              "16.10",

            relation:
              "PROCEDURE_FROM_OUTCOME",
          },
        });
    }


    const canonical =
      await this
        .memoryRepository
        .findByPublicId({
          organizationId,

          publicId:
            memory.publicId,
        });


    let indexing =
      null;


    try {
      indexing =
        await this
          .indexService
          .indexMemory({
            organizationId,

            publicId:
              memory.publicId,
          });

    } catch (
      error
    ) {
      indexing = {
        indexed:
          false,

        error: {
          code:
            error.code ||
            "PROCEDURAL_MEMORY_INDEX_FAILED",

          message:
            error.message,
        },
      };
    }


    return {
      created:
        !existing,

      updated:
        Boolean(
          existing
        ),

      memory:
        canonical ||
        memory,

      indexed:
        indexing
          ?.indexed ===
        true,

      indexing,
    };
  }


  async synthesize({
    organizationId,

    environmentId =
      null,

    serviceId =
      null,

    action =
      null,

    minimumEvidence =
      3,

    minimumSuccessRate =
      0.8,
  }) {
    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization is required for procedural synthesis",
        "PROCEDURAL_MEMORY_ORGANIZATION_REQUIRED"
      );
    }


    const outcomes =
      await this
        .loadOutcomeMemories({
          organizationId,

          environmentId,

          serviceId,

          action,
        });


    if (
      outcomes.length ===
        0
    ) {
      return {
        synthesized:
          false,

        reason:
          "NO_OUTCOME_EVIDENCE",

        procedures:
          [],
      };
    }


    const groups =
      this
        .groupByAction(
          outcomes
        );


    const procedures =
      [];


    const rejected =
      [];


    for (
      const [
        recoveryAction,
        actionOutcomes,
      ]
      of groups.entries()
    ) {
      const built =
        this.builder
          .build({
            organizationId,

            environmentId,

            serviceId,

            action:
              recoveryAction,

            outcomes:
              actionOutcomes,

            minimumEvidence,

            minimumSuccessRate,
          });


      if (
        !built.eligible
      ) {
        rejected.push({
          action:
            recoveryAction,

          reason:
            built.reason,

          statistics:
            built.statistics,
        });


        continue;
      }


      const result =
        await this
          .persistProcedure({
            built,

            organizationId,
          });


      procedures.push({
        action:
          recoveryAction,

        statistics:
          built.statistics,

        ...result,
      });
    }


    return {
      synthesized:
        procedures.length >
        0,

      evidenceCount:
        outcomes.length,

      procedures,

      rejected,
    };
  }
}


const proceduralMemoryService =
  new ProceduralMemoryService();


module.exports = {
  ProceduralMemoryService,

  proceduralMemoryService,

  synthesizeProceduralMemories:
    proceduralMemoryService
      .synthesize
      .bind(
        proceduralMemoryService
      ),
};