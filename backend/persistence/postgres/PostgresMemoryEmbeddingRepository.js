"use strict";

const crypto =
  require(
    "node:crypto"
  );


const {
  getPostgresPool,
} =
  require(
    "./postgresPool"
  );


const PostgresIdentityResolver =
  require(
    "./PostgresIdentityResolver"
  );


class PostgresMemoryEmbeddingRepository {

  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      getPostgresPool();

    this.identityResolver =
      options.identityResolver ||
      new PostgresIdentityResolver();
  }


  async setOrganizationContext(
    client,
    organizationUuid
  ) {
    await client.query(
      `
        SELECT
          set_config(
            'aira.organization_id',
            $1,
            true
          )
      `,
      [
        String(
          organizationUuid
        ),
      ]
    );
  }


  async runForOrganization(
    organizationId,
    work
  ) {
    const client =
      await this.pool
        .connect();


    try {
      await client.query(
        "BEGIN"
      );


      const organization =
        await this
          .identityResolver
          .resolveOrganization(
            client,
            organizationId
          );


      await this
        .setOrganizationContext(
          client,
          organization.id
        );


      const result =
        await work(
          client,
          organization
        );


      await client.query(
        "COMMIT"
      );


      return result;

    } catch (
      error
    ) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (
        _rollbackError
      ) {
        // Preserve original error.
      }


      throw error;

    } finally {
      client.release();
    }
  }


  async getMemory({
    organizationId,
    publicId,
  }) {
    return this
      .runForOrganization(
        organizationId,

        async (
          client,
          organization
        ) => {
          const result =
            await client.query(
              `
                SELECT *

                FROM memory.memories

                WHERE
                  public_id =
                    $1

                  AND organization_id =
                    $2

                LIMIT 1
              `,
              [
                publicId,

                organization.id,
              ]
            );


          return (
            result.rows[0] ||
            null
          );
        }
      );
  }


  async upsertEmbeddingRecord({
    organizationId,

    memoryId,

    provider,

    model,

    version,

    dimensions,

    contentHash,

    retrievalTextHash,

    collection,

    pointId,

    metadata =
      {},
  }) {
    return this
      .runForOrganization(
        organizationId,

        async (
          client,
          organization
        ) => {
          const result =
            await client.query(
              `
                INSERT INTO memory.embedding_records (
                  memory_id,

                  organization_id,

                  embedding_provider,

                  embedding_model,

                  embedding_version,

                  dimensions,

                  content_hash,

                  retrieval_text_hash,

                  qdrant_collection,

                  qdrant_point_id,

                  status,

                  metadata
                )

                VALUES (
                  $1,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6,
                  $7,
                  $8,
                  $9,
                  $10,
                  'PENDING',
                  $11::jsonb
                )

                ON CONFLICT (
                  memory_id,
                  embedding_provider,
                  embedding_model,
                  embedding_version
                )

                DO UPDATE SET
                  dimensions =
                    EXCLUDED.dimensions,

                  content_hash =
                    EXCLUDED.content_hash,

                  retrieval_text_hash =
                    EXCLUDED.retrieval_text_hash,

                  qdrant_collection =
                    EXCLUDED.qdrant_collection,

                  qdrant_point_id =
                    EXCLUDED.qdrant_point_id,

                  status =
                    CASE
                      WHEN
                        memory.embedding_records.retrieval_text_hash <>
                        EXCLUDED.retrieval_text_hash
                      THEN 'STALE'
                      ELSE memory.embedding_records.status
                    END,

                  metadata =
                    memory.embedding_records.metadata ||
                    EXCLUDED.metadata

                RETURNING *
              `,
              [
                memoryId,

                organization.id,

                provider,

                model,

                version,

                dimensions,

                contentHash,

                retrievalTextHash,

                collection,

                pointId,

                JSON.stringify(
                  metadata ||
                  {}
                ),
              ]
            );


          return result.rows[0];
        }
      );
  }


  async createIndexOperation({
    organizationId,

    memoryId,

    embeddingRecordId,

    operationType,

    collection,

    pointId,

    idempotencyKey,

    metadata =
      {},
  }) {
    return this
      .runForOrganization(
        organizationId,

        async (
          client,
          organization
        ) => {
          const operationCode =
            "mem_index_" +
            crypto
              .randomUUID();


          const result =
            await client.query(
              `
                INSERT INTO memory.index_operations (
                  operation_code,

                  organization_id,

                  memory_id,

                  embedding_record_id,

                  operation_type,

                  qdrant_collection,

                  qdrant_point_id,

                  idempotency_key,

                  metadata
                )

                VALUES (
                  $1,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6,
                  $7,
                  $8,
                  $9::jsonb
                )

                ON CONFLICT (
                  idempotency_key
                )

                DO UPDATE SET
                  metadata =
                    memory.index_operations.metadata ||
                    EXCLUDED.metadata

                RETURNING *
              `,
              [
                operationCode,

                organization.id,

                memoryId,

                embeddingRecordId,

                operationType,

                collection,

                pointId,

                idempotencyKey,

                JSON.stringify(
                  metadata ||
                  {}
                ),
              ]
            );


          return result.rows[0];
        }
      );
  }


  async markOperationProcessing({
    organizationId,
    operationId,
  }) {
    return this
      .runForOrganization(
        organizationId,

        async (
          client
        ) => {
          const result =
            await client.query(
              `
                UPDATE memory.index_operations

                SET
                  status =
                    'PROCESSING',

                  attempt_count =
                    attempt_count +
                    1,

                  processing_started_at =
                    NOW(),

                  failure_code =
                    NULL,

                  failure_message =
                    NULL

                WHERE id =
                  $1

                RETURNING *
              `,
              [
                operationId,
              ]
            );


          return (
            result.rows[0] ||
            null
          );
        }
      );
  }


  async markIndexed({
    organizationId,

    operationId,

    embeddingRecordId,
  }) {
    return this
      .runForOrganization(
        organizationId,

        async (
          client
        ) => {
          await client.query(
            `
              UPDATE memory.embedding_records

              SET
                status =
                  'INDEXED',

                indexed_at =
                  NOW(),

                failed_at =
                  NULL,

                failure_code =
                  NULL,

                failure_message =
                  NULL

              WHERE id =
                $1
            `,
            [
              embeddingRecordId,
            ]
          );


          const result =
            await client.query(
              `
                UPDATE memory.index_operations

                SET
                  status =
                    'COMPLETED',

                  completed_at =
                    NOW(),

                  failure_code =
                    NULL,

                  failure_message =
                    NULL

                WHERE id =
                  $1

                RETURNING *
              `,
              [
                operationId,
              ]
            );


          return (
            result.rows[0] ||
            null
          );
        }
      );
  }


  async markFailed({
    organizationId,

    operationId,

    embeddingRecordId,

    code,

    message,
  }) {
    return this
      .runForOrganization(
        organizationId,

        async (
          client
        ) => {
          await client.query(
            `
              UPDATE memory.embedding_records

              SET
                status =
                  'FAILED',

                failed_at =
                  NOW(),

                failure_code =
                  $2,

                failure_message =
                  $3

              WHERE id =
                $1
            `,
            [
              embeddingRecordId,

              code ||
              "MEMORY_INDEX_FAILED",

              message ||
              "Memory index operation failed",
            ]
          );


          const result =
            await client.query(
              `
                UPDATE memory.index_operations

                SET
                  status =
                    'FAILED',

                  failed_at =
                    NOW(),

                  failure_code =
                    $2,

                  failure_message =
                    $3

                WHERE id =
                  $1

                RETURNING *
              `,
              [
                operationId,

                code ||
                "MEMORY_INDEX_FAILED",

                message ||
                "Memory index operation failed",
              ]
            );


          return (
            result.rows[0] ||
            null
          );
        }
      );
  }
}


module.exports =
  PostgresMemoryEmbeddingRepository;