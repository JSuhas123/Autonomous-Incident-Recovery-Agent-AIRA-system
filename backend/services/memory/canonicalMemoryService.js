"use strict";

const {
  randomUUID,
} =
  require(
    "node:crypto"
  );


const PostgresMemoryRepository =
  require(
    "../../persistence/postgres/PostgresMemoryRepository"
  );


const {
  assertValidMemory,
} =
  require(
    "../../contracts/memory/memoryContract"
  );


const {
  MEMORY_STATUSES,
} =
  require(
    "../../constants/memoryLifecycle"
  );


class CanonicalMemoryService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresMemoryRepository(
        options
      );
  }


  createPublicId() {
    return (
      "mem_" +
      randomUUID()
    );
  }


  async create(
    input
  ) {
    const memory =
      assertValidMemory({
        ...input,

        publicId:
          input.publicId ||
          this.createPublicId(),
      });


    return this.repository
      .createMemory(
        memory
      );
  }


  async upsertByPublicId(
    input,
    {
      changeReason =
        "Memory synchronized",
      changedByType =
        "SYSTEM",
      changedById =
        null,
    } = {}
  ) {
    const memory =
      assertValidMemory({
        ...input,

        publicId:
          input.publicId ||
          this.createPublicId(),
      });


    const existing =
      await this.repository
        .findByPublicId({
          organizationId:
            memory.organizationId,

          publicId:
            memory.publicId,
        });


    if (
      !existing
    ) {
      return {
        created:
          true,

        updated:
          false,

        memory:
          await this.repository
            .createMemory(
              memory
            ),
      };
    }


    const updated =
      await this.repository
        .updateMemory({
          organizationId:
            memory.organizationId,

          publicId:
            memory.publicId,

          patch: {
            title:
              memory.title,

            summary:
              memory.summary,

            content:
              memory.content,

            confidence:
              memory.confidence,

            trustScore:
              memory.trustScore,

            importance:
              memory.importance,

            status:
              memory.status,

            sourceCount:
              memory.sourceCount,

            evidenceCount:
              memory.evidenceCount,

            observationCount:
              memory.observationCount,

            observedAt:
              memory.observedAt,

            validFrom:
              memory.validFrom,

            validUntil:
              memory.validUntil,

            metadata:
              memory.metadata,

            schemaVersion:
              memory.schemaVersion,
          },

          changeReason,

          changedByType,

          changedById,
        });


    return {
      created:
        false,

      updated:
        true,

      memory:
        updated,
    };
  }


  async get(
    organizationId,
    publicId
  ) {
    return this.repository
      .findByPublicId({
        organizationId,

        publicId,
      });
  }


  async list(
    options
  ) {
    return this.repository
      .listMemories(
        options
      );
  }


  async addSource(
    input
  ) {
    return this.repository
      .addSource(
        input
      );
  }


  async relate(
    input
  ) {
    return this.repository
      .addRelation(
        input
      );
  }


  async archive({
    organizationId,
    publicId,
    reason =
      "Memory archived",
    changedByType =
      "SYSTEM",
    changedById =
      null,
  }) {
    return this.repository
      .updateMemory({
        organizationId,

        publicId,

        patch: {
          status:
            MEMORY_STATUSES
              .ARCHIVED,
        },

        changeReason:
          reason,

        changedByType,

        changedById,
      });
  }


  async invalidate({
    organizationId,
    publicId,
    reason =
      "Memory invalidated",
    changedByType =
      "SYSTEM",
    changedById =
      null,
  }) {
    return this.repository
      .updateMemory({
        organizationId,

        publicId,

        patch: {
          status:
            MEMORY_STATUSES
              .INVALIDATED,
        },

        changeReason:
          reason,

        changedByType,

        changedById,
      });
  }


  async supersede(
    input
  ) {
    return this.repository
      .supersedeMemory(
        input
      );
  }
}


const canonicalMemoryService =
  new CanonicalMemoryService();


module.exports = {
  CanonicalMemoryService,

  canonicalMemoryService,
};