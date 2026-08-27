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
  buildMemoryRetrievalText,
} =
  require(
    "../embedding/memoryRetrievalTextBuilder"
  );


const {
  QdrantMemoryClient,
} =
  require(
    "./qdrantMemoryClient"
  );


const {
  assertQdrantConfig,
} =
  require(
    "./qdrantConfig"
  );


const PostgresMemoryEmbeddingRepository =
  require(
    "../../../persistence/postgres/PostgresMemoryEmbeddingRepository"
  );


class MemoryIndexService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresMemoryEmbeddingRepository(
        options
      );

    this.embeddingProvider =
      options.embeddingProvider ||
      embeddingProviderService;

    this.qdrant =
      options.qdrant ||
      new QdrantMemoryClient(
        options
      );
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


  createPointId(
    memoryId
  ) {
    /**
     * Canonical PostgreSQL memory UUID becomes the stable Qdrant point ID.
     */
    return String(
      memoryId
    );
  }


  buildPayload(
  memory,
  organizationPublicId
) {
  return {
    memory_id:
      String(
        memory.id
      ),

    public_id:
      memory.public_id,

    /**
     * Canonical PostgreSQL UUID.
     *
     * Keep this for durable identity and diagnostics.
     */
    organization_id:
      String(
        memory.organization_id
      ),

    /**
     * External/public tenant identity.
     *
     * Qdrant retrieval is invoked with this value.
     */
    organization_public_id:
      String(
        organizationPublicId
      ),

    environment_id:
      memory.environment_id
        ? String(
            memory.environment_id
          )
        : null,

    service_id:
      memory.service_id ||
      null,

    resource_id:
      memory.resource_id
        ? String(
            memory.resource_id
          )
        : null,

    incident_id:
      memory.incident_id
        ? String(
            memory.incident_id
          )
        : null,

    memory_type:
      memory.memory_type,

    scope_type:
      memory.scope_type,

    status:
      memory.status,

    schema_version:
      Number(
        memory.schema_version ||
        1
      ),
  };
}


  async indexMemory({
    organizationId,
    publicId,
  }) {
    const memory =
      await this.repository
        .getMemory({
          organizationId,

          publicId,
        });


    if (
      !memory
    ) {
      const error =
        new Error(
          "Canonical memory not found"
        );

      error.code =
        "MEMORY_NOT_FOUND";

      error.status =
        404;

      throw error;
    }


    if (
      memory.status !==
        "ACTIVE"
    ) {
      const error =
        new Error(
          "Only ACTIVE memories may be indexed"
        );

      error.code =
        "MEMORY_NOT_INDEXABLE";

      error.status =
        422;

      throw error;
    }


    const canonicalMemory = {
      id:
        memory.id,

      memoryType:
        memory.memory_type,

      scopeType:
        memory.scope_type,

      title:
        memory.title,

      summary:
        memory.summary,

      content:
        memory.content,

      serviceId:
        memory.service_id,
    };


    const retrievalText =
      buildMemoryRetrievalText(
        canonicalMemory
      );


    const embedding =
      await this.embeddingProvider
        .embed(
          retrievalText
        );


    await this.qdrant
      .ensureCollection({
        dimensions:
          embedding.dimensions,
      });


    const config =
      assertQdrantConfig();


    const pointId =
      this
        .createPointId(
          memory.id
        );


    const contentHash =
      this
        .sha256(
          JSON.stringify({
            memoryType:
              memory.memory_type,

            scopeType:
              memory.scope_type,

            title:
              memory.title,

            summary:
              memory.summary,

            content:
              memory.content,

            schemaVersion:
              memory.schema_version,
          })
        );


    const retrievalTextHash =
      this
        .sha256(
          retrievalText
        );


    const embeddingRecord =
      await this.repository
        .upsertEmbeddingRecord({
          organizationId,

          memoryId:
            memory.id,

          provider:
            embedding.provider,

          model:
            embedding.model,

          version:
            embedding.version,

          dimensions:
            embedding.dimensions,

          contentHash,

          retrievalTextHash,

          collection:
            config.collection,

          pointId,

          metadata: {
            phase:
              "16.6",
          },
        });


    const QDRANT_PAYLOAD_VERSION =
  "phase16.14-v2";


const idempotencyKey =
  this
    .sha256(
      [
        "UPSERT",

        QDRANT_PAYLOAD_VERSION,

        memory.id,

        embedding.provider,

        embedding.model,

        embedding.version,

        retrievalTextHash,
      ]
        .join(
          "|"
        )
    );


    const operation =
      await this.repository
        .createIndexOperation({
          organizationId,

          memoryId:
            memory.id,

          embeddingRecordId:
            embeddingRecord.id,

          operationType:
            "UPSERT",

          collection:
            config.collection,

          pointId,

          idempotencyKey,

          metadata: {
            phase:
              "16.6",

            publicId:
              memory.public_id,
          },
        });


    /**
     * A completed identical operation is already safe.
     */
    if (
      operation.status ===
        "COMPLETED"
    ) {
      return {
        indexed:
          true,

        duplicate:
          true,

        memoryId:
          memory.id,

        publicId:
          memory.public_id,

        pointId,

        embeddingRecord,
      };
    }


    await this.repository
      .markOperationProcessing({
        organizationId,

        operationId:
          operation.id,
      });


    try {
      await this.qdrant
        .upsertMemoryPoint({
          pointId,

          vector:
            embedding.vector,

          payload:
  this
    .buildPayload(
      memory,
      organizationId
    ),
        });


      await this.repository
        .markIndexed({
          organizationId,

          operationId:
            operation.id,

          embeddingRecordId:
            embeddingRecord.id,
        });


      return {
        indexed:
          true,

        duplicate:
          false,

        memoryId:
          memory.id,

        publicId:
          memory.public_id,

        pointId,

        provider:
          embedding.provider,

        model:
          embedding.model,

        dimensions:
          embedding.dimensions,

        retrievalTextHash,
      };

    } catch (
      error
    ) {
      await this.repository
        .markFailed({
          organizationId,

          operationId:
            operation.id,

          embeddingRecordId:
            embeddingRecord.id,

          code:
            error.code ||
            "MEMORY_INDEX_FAILED",

          message:
            error.message,
        });


      throw error;
    }
  }
}


const memoryIndexService =
  new MemoryIndexService();


module.exports = {
  MemoryIndexService,

  memoryIndexService,

  indexMemory:
    memoryIndexService
      .indexMemory
      .bind(
        memoryIndexService
      ),
};