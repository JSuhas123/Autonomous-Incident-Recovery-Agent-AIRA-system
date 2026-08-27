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
  behaviouralMemoryBuilder,
} =
  require(
    "./behaviouralMemoryBuilder"
  );


class BehaviouralMemoryService {

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
      behaviouralMemoryBuilder;
  }


  async synthesize({
    organizationId,

    environmentId =
      null,

    serviceId =
      null,

    resourceId =
      null,

    metricName,

    metricUnit =
      null,

    observations,

    minimumSamples =
      10,

    minimumQuality =
      0.8,
  }) {
    const built =
      this.builder
        .build({
          organizationId,

          environmentId,

          serviceId,

          resourceId,

          metricName,

          metricUnit,

          observations,

          minimumSamples,

          minimumQuality,
        });


    if (
      !built.eligible
    ) {
      return {
        synthesized:
          false,

        reason:
          built.reason,

        statistics:
          built.statistics,
      };
    }


    const existing =
      await this
        .memoryRepository
        .findByPublicId({
          organizationId,

          publicId:
            built
              .memory
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
                built.memory.title,

              summary:
                built.memory.summary,

              content:
                built.memory.content,

              confidence:
                built.memory.confidence,

              trustScore:
                built.memory.trustScore,

              importance:
                built.memory.importance,

              evidenceCount:
                built.memory.evidenceCount,

              observationCount:
                built.memory.observationCount,

              observedAt:
                built.memory.observedAt,

              metadata:
                built.memory.metadata,

              schemaVersion:
                built.memory.schemaVersion,
            },

            changeReason:
              "Behavioural baseline re-synthesized from trusted healthy observations",

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
              "16.13",
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
            "BEHAVIOURAL_MEMORY_INDEX_FAILED",

          message:
            error.message,
        },
      };
    }


    return {
      synthesized:
        true,

      created:
        !existing,

      updated:
        Boolean(
          existing
        ),

      memory:
        canonical ||
        memory,

      statistics:
        built.statistics,

      indexed:
        indexing
          ?.indexed ===
        true,

      indexing,
    };
  }
}


const behaviouralMemoryService =
  new BehaviouralMemoryService();


module.exports = {
  BehaviouralMemoryService,

  behaviouralMemoryService,

  synthesizeBehaviouralMemory:
    behaviouralMemoryService
      .synthesize
      .bind(
        behaviouralMemoryService
      ),
};