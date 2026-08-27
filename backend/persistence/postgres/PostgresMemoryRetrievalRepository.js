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


class PostgresMemoryRetrievalRepository {

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


  mapMemory(
    row
  ) {
    if (
      !row
    ) {
      return null;
    }


    return {
      id:
        row.id,

      publicId:
        row.public_id,

      organizationId:
        row.organization_id,

      environmentId:
        row.environment_id,

      serviceId:
        row.service_id,

      resourceId:
        row.resource_id,

      incidentId:
        row.incident_id,

      memoryType:
        row.memory_type,

      scopeType:
        row.scope_type,

      title:
        row.title,

      summary:
        row.summary,

      content:
        row.content ||
        {},

      confidence:
        Number(
          row.confidence ||
          0
        ),

      trustScore:
        Number(
          row.trust_score ||
          0
        ),

      importance:
        Number(
          row.importance ||
          0
        ),

      status:
        row.status,

      sourceType:
        row.source_type,

      sourceCount:
        Number(
          row.source_count ||
          0
        ),

      evidenceCount:
        Number(
          row.evidence_count ||
          0
        ),

      observationCount:
        Number(
          row.observation_count ||
          1
        ),

      observedAt:
        row.observed_at,

      validFrom:
        row.valid_from,

      validUntil:
        row.valid_until,

      metadata:
        row.metadata ||
        {},

      schemaVersion:
        Number(
          row.schema_version ||
          1
        ),

      createdAt:
        row.created_at,

      updatedAt:
        row.updated_at,
    };
  }


  async resolveEnvironment(
    client,
    organization,
    environmentId
  ) {
    if (
      !environmentId
    ) {
      return null;
    }


    return this
      .identityResolver
      .resolveEnvironment(
        client,
        organization.id,
        environmentId
      );
  }


  async hydrateCandidates({
    organizationId,

    candidateIds,

    environmentId =
      null,

    serviceId =
      null,

    resourceId =
      null,

    incidentId =
      null,

    memoryTypes =
      [],

    scopes =
      [],

    includeGlobal =
      false,
  }) {
    if (
      !Array.isArray(
        candidateIds
      ) ||
      candidateIds.length ===
        0
    ) {
      return [];
    }


    return this
      .runForOrganization(
        organizationId,

        async (
          client,
          organization
        ) => {
          const environment =
            await this
              .resolveEnvironment(
                client,
                organization,
                environmentId
              );


          const values = [
            candidateIds,
            organization.id,
          ];


          const conditions = [
            `id = ANY($1::uuid[])`,
            `status = 'ACTIVE'`,
          ];


          if (
            includeGlobal
          ) {
            conditions.push(
              `
                (
                  organization_id = $2
                  OR (
                    organization_id IS NULL
                    AND scope_type = 'GLOBAL'
                  )
                )
              `
            );
          } else {
            conditions.push(
              `organization_id = $2`
            );
          }


          if (
            environment
          ) {
            values.push(
              environment.id
            );


            /**
             * ENVIRONMENT-specific query still permits broader tenant/global
             * memories.
             */
            conditions.push(
              `
                (
                  environment_id =
                    $${values.length}

                  OR scope_type IN (
                    'TENANT',
                    'GLOBAL'
                  )
                )
              `
            );
          }


          if (
            serviceId
          ) {
            values.push(
              String(
                serviceId
              )
            );


            conditions.push(
              `
                (
                  service_id =
                    $${values.length}

                  OR scope_type IN (
                    'TENANT',
                    'ENVIRONMENT',
                    'GLOBAL'
                  )
                )
              `
            );
          }


          if (
            resourceId
          ) {
            values.push(
              String(
                resourceId
              )
            );


            conditions.push(
              `
                (
                  resource_id::text =
                    $${values.length}

                  OR scope_type IN (
                    'TENANT',
                    'ENVIRONMENT',
                    'GLOBAL'
                  )
                )
              `
            );
          }


          if (
            incidentId
          ) {
            values.push(
              String(
                incidentId
              )
            );


            conditions.push(
              `
                (
                  incident_id IN (
                    SELECT id

                    FROM incidents.incidents

                    WHERE
                      organization_id =
                        $2

                      AND (
                        id::text =
                          $${values.length}

                        OR public_id =
                          $${values.length}

                        OR legacy_mongo_id =
                          $${values.length}
                      )
                  )

                  OR scope_type IN (
                    'TENANT',
                    'ENVIRONMENT',
                    'GLOBAL'
                  )
                )
              `
            );
          }


          if (
            Array.isArray(
              memoryTypes
            ) &&
            memoryTypes.length >
              0
          ) {
            values.push(
              memoryTypes
            );

            conditions.push(
              `memory_type = ANY($${values.length}::text[])`
            );
          }


          if (
            Array.isArray(
              scopes
            ) &&
            scopes.length >
              0
          ) {
            values.push(
              scopes
            );

            conditions.push(
              `scope_type = ANY($${values.length}::text[])`
            );
          }


          const result =
            await client.query(
              `
                SELECT *

                FROM memory.memories

                WHERE
                  ${conditions.join(
                    "\nAND "
                  )}
              `,
              values
            );


          return result.rows
            .map(
              (
                row
              ) =>
                this
                  .mapMemory(
                    row
                  )
            );
        }
      );
  }


  async createRetrievalAudit({
    organizationId,

    environmentId =
      null,

    queryHash,

    queryLength,

    embeddingProvider,

    embeddingModel,

    embeddingVersion,

    dimensions,

    qdrantCollection,

    requestedMemoryTypes =
      [],

    requestedScopes =
      [],

    includeGlobal =
      false,

    requestedLimit,

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
          let resolvedEnvironment =
            null;


          if (
            environmentId
          ) {
            resolvedEnvironment =
              await this
                .identityResolver
                .resolveEnvironment(
                  client,
                  organization.id,
                  environmentId
                );
          }


          const retrievalCode =
            "retrieval_" +
            crypto
              .randomUUID();


          const result =
            await client.query(
              `
                INSERT INTO memory.retrieval_audit (
                  retrieval_code,

                  organization_id,

                  environment_id,

                  query_hash,

                  query_length,

                  embedding_provider,

                  embedding_model,

                  embedding_version,

                  dimensions,

                  qdrant_collection,

                  requested_memory_types,

                  requested_scopes,

                  include_global,

                  requested_limit,

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
                  $11::jsonb,
                  $12::jsonb,
                  $13,
                  $14,
                  $15::jsonb
                )

                RETURNING *
              `,
              [
                retrievalCode,

                organization.id,

                resolvedEnvironment
                  ?.id ||
                null,

                queryHash,

                queryLength,

                embeddingProvider,

                embeddingModel,

                embeddingVersion,

                dimensions,

                qdrantCollection,

                JSON.stringify(
                  requestedMemoryTypes
                ),

                JSON.stringify(
                  requestedScopes
                ),

                Boolean(
                  includeGlobal
                ),

                requestedLimit,

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


  async completeRetrievalAudit({
    organizationId,

    auditId,

    candidateCount,

    hydratedCount,
  }) {
    return this
      .runForOrganization(
        organizationId,

        async (
          client
        ) => {
          const rejectedCount =
            Math.max(
              0,

              Number(
                candidateCount
              ) -
              Number(
                hydratedCount
              )
            );


          const result =
            await client.query(
              `
                UPDATE memory.retrieval_audit

                SET
                  candidate_count =
                    $2,

                  hydrated_count =
                    $3,

                  rejected_count =
                    $4,

                  status =
                    'COMPLETED',

                  completed_at =
                    NOW()

                WHERE id =
                  $1

                RETURNING *
              `,
              [
                auditId,

                candidateCount,

                hydratedCount,

                rejectedCount,
              ]
            );


          return (
            result.rows[0] ||
            null
          );
        }
      );
  }


  async failRetrievalAudit({
    organizationId,

    auditId,

    code,

    message,
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
                UPDATE memory.retrieval_audit

                SET
                  status =
                    'FAILED',

                  failure_code =
                    $2,

                  failure_message =
                    $3,

                  completed_at =
                    NOW()

                WHERE id =
                  $1

                RETURNING *
              `,
              [
                auditId,

                code ||
                "MEMORY_RETRIEVAL_FAILED",

                message ||
                "Memory retrieval failed",
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
  PostgresMemoryRetrievalRepository;