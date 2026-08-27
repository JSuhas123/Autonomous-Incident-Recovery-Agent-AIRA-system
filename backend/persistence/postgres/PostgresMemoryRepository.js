"use strict";

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


class PostgresMemoryRepository {

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


  createError(
    message,
    code,
    status = 500,
    metadata = {}
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    Object.assign(
      error,
      metadata
    );

    return error;
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

      supersedesMemoryId:
        row.supersedes_memory_id,

      supersededByMemoryId:
        row.superseded_by_memory_id,

      legacySourceType:
        row.legacy_source_type,

      legacySourceId:
        row.legacy_source_id,

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
    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization is required for tenant memory access",
        "MEMORY_ORGANIZATION_REQUIRED",
        422
      );
    }


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
        rollbackError
      ) {
        error.rollbackError =
          rollbackError;
      }


      throw error;

    } finally {
      client.release();
    }
  }


  async resolveOptionalEnvironment(
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


  async resolveOptionalIncident(
    client,
    {
      organization,
      environment,
      incidentId,
    }
  ) {
    if (
      !incidentId
    ) {
      return null;
    }


    if (
      !environment
    ) {
      throw this.createError(
        "Incident-scoped memory requires environment",
        "MEMORY_INCIDENT_ENVIRONMENT_REQUIRED",
        422
      );
    }


    const incident =
      await this
        .identityResolver
        .resolveIncident(
          client,
          {
            organizationUuid:
              organization.id,

            environmentUuid:
              environment.id,
          },

          incidentId
        );


    if (
      !incident
    ) {
      throw this.createError(
        "Incident not found for memory scope",
        "MEMORY_INCIDENT_NOT_FOUND",
        404
      );
    }


    return incident;
  }


  async resolveOptionalResource(
    client,
    {
      organization,
      environment,
      resourceId,
    }
  ) {
    if (
      !resourceId
    ) {
      return null;
    }


    const normalized =
      String(
        resourceId
      );


    const values = [
      organization.id,
      normalized,
    ];


    let environmentClause =
      "";


    if (
      environment
    ) {
      values.push(
        environment.id
      );

      environmentClause =
        `AND environment_id = $${values.length}`;
    }


    const result =
      await client.query(
        `
          SELECT
            id,
            public_id,
            legacy_mongo_id,
            organization_id,
            environment_id

          FROM resources.resources

          WHERE
            organization_id =
              $1

            AND (
              id::text =
                $2

              OR public_id =
                $2

              OR legacy_mongo_id =
                $2
            )

            ${environmentClause}

          LIMIT 1
        `,
        values
      );


    if (
      !result.rows[0]
    ) {
      throw this.createError(
        "Resource not found for memory scope",
        "MEMORY_RESOURCE_NOT_FOUND",
        404
      );
    }


    return result.rows[0];
  }


  async resolveScope(
    client,
    organization,
    memory
  ) {
    const environment =
      await this
        .resolveOptionalEnvironment(
          client,
          organization,
          memory.environmentId
        );


    const incident =
      await this
        .resolveOptionalIncident(
          client,
          {
            organization,

            environment,

            incidentId:
              memory.incidentId,
          }
        );


    const resource =
      await this
        .resolveOptionalResource(
          client,
          {
            organization,

            environment,

            resourceId:
              memory.resourceId,
          }
        );


    return {
      organizationId:
        organization.id,

      environmentId:
        environment
          ?.id ||
        null,

      incidentId:
        incident
          ?.id ||
        null,

      resourceId:
        resource
          ?.id ||
        null,
    };
  }


  async createMemory(
    memory
  ) {
    return this
      .runForOrganization(
        memory.organizationId,

        async (
          client,
          organization
        ) => {
          const scope =
            await this
              .resolveScope(
                client,
                organization,
                memory
              );


          const result =
            await client.query(
              `
                INSERT INTO memory.memories (
                  public_id,

                  organization_id,

                  environment_id,

                  service_id,

                  resource_id,

                  incident_id,

                  memory_type,

                  scope_type,

                  title,

                  summary,

                  content,

                  confidence,

                  trust_score,

                  importance,

                  status,

                  source_type,

                  source_count,

                  evidence_count,

                  observation_count,

                  observed_at,

                  valid_from,

                  valid_until,

                  supersedes_memory_id,

                  legacy_source_type,

                  legacy_source_id,

                  metadata,

                  schema_version
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
                  $12,
                  $13,
                  $14,
                  $15,
                  $16,
                  $17,
                  $18,
                  $19,
                  $20,
                  $21,
                  $22,
                  $23,
                  $24,
                  $25,
                  $26::jsonb,
                  $27
                )

                RETURNING *
              `,
              [
                memory.publicId,

                scope.organizationId,

                scope.environmentId,

                memory.serviceId ||
                null,

                scope.resourceId,

                scope.incidentId,

                memory.memoryType,

                memory.scopeType,

                memory.title ||
                null,

                memory.summary,

                JSON.stringify(
                  memory.content ||
                  {}
                ),

                memory.confidence,

                memory.trustScore,

                memory.importance,

                memory.status,

                memory.sourceType,

                memory.sourceCount,

                memory.evidenceCount,

                memory.observationCount,

                memory.observedAt ||
                null,

                memory.validFrom ||
                null,

                memory.validUntil ||
                null,

                memory.supersedesMemoryId ||
                null,

                memory.legacySourceType ||
                null,

                memory.legacySourceId ||
                null,

                JSON.stringify(
                  memory.metadata ||
                  {}
                ),

                memory.schemaVersion,
              ]
            );


          return this
            .mapMemory(
              result.rows[0]
            );
        }
      );
  }


  async findByPublicId({
    organizationId,
    publicId,
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
                SELECT *

                FROM memory.memories

                WHERE
                  public_id =
                    $1

                LIMIT 1
              `,
              [
                publicId,
              ]
            );


          return this
            .mapMemory(
              result.rows[0]
            );
        }
      );
  }


  async findByLegacySource({
    organizationId,
    legacySourceType,
    legacySourceId,
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
                SELECT *

                FROM memory.memories

                WHERE
                  legacy_source_type =
                    $1

                  AND legacy_source_id =
                    $2

                ORDER BY
                  created_at DESC

                LIMIT 1
              `,
              [
                legacySourceType,
                legacySourceId,
              ]
            );


          return this
            .mapMemory(
              result.rows[0]
            );
        }
      );
  }


  async listMemories({
    organizationId,

    environmentId =
      null,

    incidentId =
      null,

    memoryTypes =
      [],

    statuses = [
      "ACTIVE",
    ],

    limit =
      100,
  }) {
    return this
      .runForOrganization(
        organizationId,

        async (
          client,
          organization
        ) => {
          const values = [
            organization.id,
          ];


          const conditions = [
            `organization_id = $1`,
          ];


          if (
            environmentId
          ) {
            const environment =
              await this
                .identityResolver
                .resolveEnvironment(
                  client,
                  organization.id,
                  environmentId
                );


            values.push(
              environment.id
            );

            conditions.push(
              `environment_id = $${values.length}`
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
                incident_id IN (
                  SELECT id
                  FROM incidents.incidents
                  WHERE
                    organization_id =
                      $1
                    AND (
                      id::text =
                        $${values.length}
                      OR public_id =
                        $${values.length}
                      OR legacy_mongo_id =
                        $${values.length}
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
              statuses
            ) &&
            statuses.length >
              0
          ) {
            values.push(
              statuses
            );

            conditions.push(
              `status = ANY($${values.length}::text[])`
            );
          }


          values.push(
            Math.min(
              Math.max(
                Number(
                  limit
                ) ||
                100,
                1
              ),
              500
            )
          );


          const result =
            await client.query(
              `
                SELECT *

                FROM memory.memories

                WHERE
                  ${conditions.join(
                    "\nAND "
                  )}

                ORDER BY
                  importance DESC,
                  confidence DESC,
                  updated_at DESC

                LIMIT
                  $${values.length}
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


  async createVersion(
    client,
    memoryRow,
    {
      changeReason,
      changedByType =
        "SYSTEM",
      changedById =
        null,
    }
  ) {
    const versionResult =
      await client.query(
        `
          SELECT
            COALESCE(
              MAX(version),
              0
            ) + 1 AS
              next_version

          FROM memory.memory_versions

          WHERE
            memory_id =
              $1
        `,
        [
          memoryRow.id,
        ]
      );


    const version =
      Number(
        versionResult
          .rows[0]
          .next_version
      );


    await client.query(
      `
        INSERT INTO memory.memory_versions (
          memory_id,

          organization_id,

          version,

          memory_type,

          scope_type,

          title,

          summary,

          content,

          confidence,

          trust_score,

          importance,

          status,

          change_reason,

          changed_by_type,

          changed_by_id,

          snapshot
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::jsonb,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16::jsonb
        )
      `,
      [
        memoryRow.id,

        memoryRow.organization_id,

        version,

        memoryRow.memory_type,

        memoryRow.scope_type,

        memoryRow.title,

        memoryRow.summary,

        JSON.stringify(
          memoryRow.content ||
          {}
        ),

        memoryRow.confidence,

        memoryRow.trust_score,

        memoryRow.importance,

        memoryRow.status,

        changeReason,

        changedByType,

        changedById,

        JSON.stringify(
          memoryRow
        ),
      ]
    );


    return version;
  }


  async updateMemory({
    organizationId,
    publicId,
    patch,
    changeReason,
    changedByType =
      "SYSTEM",
    changedById =
      null,
  }) {
    return this
      .runForOrganization(
        organizationId,

        async (
          client
        ) => {
          const currentResult =
            await client.query(
              `
                SELECT *

                FROM memory.memories

                WHERE
                  public_id =
                    $1

                FOR UPDATE
              `,
              [
                publicId,
              ]
            );


          const current =
            currentResult
              .rows[0];


          if (
            !current
          ) {
            throw this.createError(
              "Memory not found",
              "MEMORY_NOT_FOUND",
              404
            );
          }


          await this
            .createVersion(
              client,
              current,
              {
                changeReason,

                changedByType,

                changedById,
              }
            );


          const result =
            await client.query(
              `
                UPDATE memory.memories

                SET
                  title =
                    COALESCE(
                      $2,
                      title
                    ),

                  summary =
                    COALESCE(
                      $3,
                      summary
                    ),

                  content =
                    COALESCE(
                      $4::jsonb,
                      content
                    ),

                  confidence =
                    COALESCE(
                      $5,
                      confidence
                    ),

                  trust_score =
                    COALESCE(
                      $6,
                      trust_score
                    ),

                  importance =
                    COALESCE(
                      $7,
                      importance
                    ),

                  status =
                    COALESCE(
                      $8,
                      status
                    ),

                  source_count =
                    COALESCE(
                      $9,
                      source_count
                    ),

                  evidence_count =
                    COALESCE(
                      $10,
                      evidence_count
                    ),

                  observation_count =
                    COALESCE(
                      $11,
                      observation_count
                    ),

                  observed_at =
                    COALESCE(
                      $12,
                      observed_at
                    ),

                  valid_from =
                    COALESCE(
                      $13,
                      valid_from
                    ),

                  valid_until =
                    $14,

                  metadata =
                    CASE
                      WHEN $15::jsonb IS NULL
                        THEN metadata
                      ELSE metadata ||
                        $15::jsonb
                    END,

                  schema_version =
                    COALESCE(
                      $16,
                      schema_version
                    ),

                  updated_at =
                    NOW()

                WHERE
                  id =
                    $1

                RETURNING *
              `,
              [
                current.id,

                patch.title ??
                null,

                patch.summary ??
                null,

                patch.content ===
                  undefined
                  ? null
                  : JSON.stringify(
                      patch.content
                    ),

                patch.confidence ??
                null,

                patch.trustScore ??
                null,

                patch.importance ??
                null,

                patch.status ??
                null,

                patch.sourceCount ??
                null,

                patch.evidenceCount ??
                null,

                patch.observationCount ??
                null,

                patch.observedAt ??
                null,

                patch.validFrom ??
                null,

                patch.validUntil ??
                null,

                patch.metadata ===
                  undefined
                  ? null
                  : JSON.stringify(
                      patch.metadata
                    ),

                patch.schemaVersion ??
                null,
              ]
            );


          return this
            .mapMemory(
              result.rows[0]
            );
        }
      );
  }


  async addSource({
    organizationId,

    memoryPublicId,

    sourceType,

    sourceId,

    sourceVersion =
      null,

    sourceUri =
      null,

    evidenceRole =
      "SUPPORTING",

    observedAt =
      null,

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
                INSERT INTO memory.memory_sources (
                  memory_id,

                  organization_id,

                  source_type,

                  source_id,

                  source_version,

                  source_uri,

                  evidence_role,

                  observed_at,

                  metadata
                )

                SELECT
                  id,

                  organization_id,

                  $2,

                  $3,

                  $4,

                  $5,

                  $6,

                  $7,

                  $8::jsonb

                FROM memory.memories

                WHERE
                  public_id =
                    $1

                  AND organization_id =
                    $9

                ON CONFLICT (
                  memory_id,
                  source_type,
                  source_id
                )

                DO NOTHING

                RETURNING *
              `,
              [
                memoryPublicId,

                sourceType,

                String(
                  sourceId
                ),

                sourceVersion,

                sourceUri,

                evidenceRole,

                observedAt,

                JSON.stringify(
                  metadata ||
                  {}
                ),

                organization.id,
              ]
            );


          if (
            result.rows[0]
          ) {
            await client.query(
              `
                UPDATE memory.memories

                SET
                  source_count =
                    (
                      SELECT
                        COUNT(*)

                      FROM memory.memory_sources

                      WHERE
                        memory_id =
                          memory.memories.id
                    ),

                  updated_at =
                    NOW()

                WHERE
                  public_id =
                    $1
              `,
              [
                memoryPublicId,
              ]
            );
          }


          return (
            result.rows[0] ||
            null
          );
        }
      );
  }


  async addRelation({
    organizationId,

    fromMemoryPublicId,

    toMemoryPublicId,

    relationType,

    confidence =
      1,

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
                INSERT INTO memory.memory_relations (
                  organization_id,

                  from_memory_id,

                  to_memory_id,

                  relation_type,

                  confidence,

                  metadata
                )

                SELECT
                  $1,

                  source.id,

                  target.id,

                  $4,

                  $5,

                  $6::jsonb

                FROM memory.memories source

                JOIN memory.memories target
                  ON target.public_id =
                    $3

                WHERE
                  source.public_id =
                    $2

                  AND source.organization_id =
                    $1

                  AND target.organization_id =
                    $1

                ON CONFLICT (
                  from_memory_id,
                  to_memory_id,
                  relation_type
                )

                DO UPDATE SET
                  confidence =
                    EXCLUDED.confidence,

                  metadata =
                    memory.memory_relations.metadata ||
                    EXCLUDED.metadata

                RETURNING *
              `,
              [
                organization.id,

                fromMemoryPublicId,

                toMemoryPublicId,

                relationType,

                confidence,

                JSON.stringify(
                  metadata ||
                  {}
                ),
              ]
            );


          if (
            !result.rows[0]
          ) {
            throw this.createError(
              "Memory relation endpoints not found in organization",
              "MEMORY_RELATION_ENDPOINT_NOT_FOUND",
              404
            );
          }


          return result.rows[0];
        }
      );
  }


  async supersedeMemory({
    organizationId,

    oldPublicId,

    newPublicId,

    changedByType =
      "SYSTEM",

    changedById =
      null,
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

                FOR UPDATE
              `,
              [
                oldPublicId,

                organization.id,
              ]
            );


          const oldMemory =
            result.rows[0];


          if (
            !oldMemory
          ) {
            throw this.createError(
              "Memory to supersede not found",
              "MEMORY_NOT_FOUND",
              404
            );
          }


          const newResult =
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
                newPublicId,

                organization.id,
              ]
            );


          const newMemory =
            newResult.rows[0];


          if (
            !newMemory
          ) {
            throw this.createError(
              "Replacement memory not found",
              "MEMORY_REPLACEMENT_NOT_FOUND",
              404
            );
          }


          await this
            .createVersion(
              client,
              oldMemory,
              {
                changeReason:
                  `Superseded by ${newPublicId}`,

                changedByType,

                changedById,
              }
            );


          await client.query(
            `
              UPDATE memory.memories

              SET
                status =
                  'SUPERSEDED',

                superseded_by_memory_id =
                  $2,

                updated_at =
                  NOW()

              WHERE
                id =
                  $1
            `,
            [
              oldMemory.id,

              newMemory.id,
            ]
          );


          await client.query(
            `
              UPDATE memory.memories

              SET
                supersedes_memory_id =
                  $2,

                updated_at =
                  NOW()

              WHERE
                id =
                  $1
            `,
            [
              newMemory.id,

              oldMemory.id,
            ]
          );


          return true;
        }
      );
  }
}


module.exports =
  PostgresMemoryRepository;