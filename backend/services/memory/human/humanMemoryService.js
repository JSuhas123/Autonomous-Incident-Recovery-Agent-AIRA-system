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
  humanMemoryBuilder,
} =
  require(
    "./humanMemoryBuilder"
  );


class HumanMemoryService {

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
      humanMemoryBuilder;
  }


  async record(
    input
  ) {
    const built =
      this.builder
        .build(
          input
        );


    const organizationId =
      built
        .memory
        .organizationId;


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


    if (
      existing
    ) {
      return {
        created:
          false,

        duplicate:
          true,

        memory:
          existing,

        indexed:
          false,
      };
    }


    let memory;


    try {
      memory =
        await this
          .memoryRepository
          .createMemory(
            built.memory
          );

    } catch (
      error
    ) {
      if (
        error.code ===
          "23505"
      ) {
        const concurrent =
          await this
            .memoryRepository
            .findByPublicId({
              organizationId,

              publicId:
                built
                  .memory
                  .publicId,
            });


        if (
          concurrent
        ) {
          return {
            created:
              false,

            duplicate:
              true,

            memory:
              concurrent,

            indexed:
              false,
          };
        }
      }


      throw error;
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
              "16.12",
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
            "HUMAN_MEMORY_INDEX_FAILED",

          message:
            error.message,
        },
      };
    }


    return {
      created:
        true,

      duplicate:
        false,

      memory:
        canonical ||
        memory,

      sourceCount:
        built
          .sources
          .length,

      indexed:
        indexing
          ?.indexed ===
        true,

      indexing,
    };
  }
}


const humanMemoryService =
  new HumanMemoryService();


module.exports = {
  HumanMemoryService,

  humanMemoryService,

  recordHumanMemory:
    humanMemoryService
      .record
      .bind(
        humanMemoryService
      ),
};