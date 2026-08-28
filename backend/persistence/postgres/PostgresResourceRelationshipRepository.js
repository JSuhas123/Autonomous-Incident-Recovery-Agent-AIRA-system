"use strict";

const crypto = require(
  "node:crypto"
);

const PostgresTenantScope = require(
  "./PostgresTenantScope"
);

const {
  assertValidRelationship,
} = require(
  "../../contracts/topology/relationshipContract"
);


/*
 * ============================================================================
 * POSTGRES RESOURCE RELATIONSHIP REPOSITORY
 * ============================================================================
 *
 * Phase 17.6
 *
 * Canonical persistence boundary for the CURRENT Resource Graph.
 *
 * PostgreSQL:
 *
 *   resources.resource_relationships
 *
 * This repository handles:
 *
 *   - creating current relationships
 *   - relationship identity lookup
 *   - outgoing relationships
 *   - incoming relationships
 *   - neighborhood queries
 *   - discovery heartbeat / last_seen_at
 *
 * This repository deliberately does NOT write:
 *
 *   resources.relationship_history
 *   resources.graph_change_events
 *
 * Those temporal/change-history responsibilities begin in Phase 17.7.
 *
 * Relationship knowledge is topology evidence.
 * It never grants execution authorization.
 * ============================================================================
 */

class PostgresResourceRelationshipRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  /*
   * ==========================================================================
   * CREATE CURRENT RELATIONSHIP
   * ==========================================================================
   */

  async createRelationship(
    input,
    transaction = null
  ) {
    requireScope(
      input
    );


    const candidate = {
      ...input,

      publicId:
        input.publicId ||
        generatePublicId(),

      validFrom:
        input.validFrom ||
        new Date(),
    };


    const relationship =
      assertValidRelationship(
        candidate
      );


    return this.scope.run(
      buildScope(
        relationship
      ),

      async (
        client,
        resolved
      ) => {
        /*
         * Confirm both endpoints exist inside the canonical scope.
         *
         * PostgreSQL migration 0068 repeats this validation at DB level.
         */
        await verifyResource(
          client,
          resolved,
          relationship.sourceResourceId,
          "SOURCE"
        );


        await verifyResource(
          client,
          resolved,
          relationship.targetResourceId,
          "TARGET"
        );


        /*
         * Idempotency for current live edges.
         *
         * Discovery can observe the same relationship repeatedly.
         *
         * We do not create duplicate graph edges.
         */
        if (
          relationship.validTo ===
          null
        ) {
          const existing =
            await client.query(
              `
                SELECT *
                FROM resources.resource_relationships
                WHERE
                  organization_id = $1
                  AND environment_id = $2
                  AND source_resource_id = $3
                  AND target_resource_id = $4
                  AND relationship_type = $5
                  AND status = 'ACTIVE'
                  AND valid_to IS NULL
                ORDER BY
                  valid_from DESC,
                  created_at DESC
                LIMIT 1
              `,
              [
                resolved.organizationUuid,

                resolved.environmentUuid,

                relationship.sourceResourceId,

                relationship.targetResourceId,

                relationship.relationshipType,
              ]
            );


          if (
            existing.rows[0]
          ) {
            return exposeRelationship(
              existing.rows[0],
              resolved
            );
          }
        }


        const status =
          relationship.validTo
            ? "INACTIVE"
            : "ACTIVE";


        const result =
          await client.query(
            `
              INSERT INTO resources.resource_relationships (
                public_id,
                organization_id,
                environment_id,
                source_resource_id,
                target_resource_id,
                relationship_type,
                source,
                confidence,
                metadata,
                valid_from,
                valid_to,
                discovered_at,
                attributes,
                status,
                last_seen_at
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
                $9::jsonb,
                $10,
                $11,
                NOW(),
                $12::jsonb,
                $13,
                NOW()
              )
              RETURNING *
            `,
            [
              relationship.publicId,

              resolved.organizationUuid,

              resolved.environmentUuid,

              relationship.sourceResourceId,

              relationship.targetResourceId,

              relationship.relationshipType,

              relationship.source,

              relationship.confidence,

              JSON.stringify(
                relationship.metadata ||
                {}
              ),

              relationship.validFrom,

              relationship.validTo,

              JSON.stringify(
                relationship.attributes ||
                {}
              ),

              status,
            ]
          );


        return exposeRelationship(
          result.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * GET BY POSTGRESQL UUID
   * ==========================================================================
   */

  async getRelationshipById(
    {
      organizationId,
      environmentId,
      relationshipId,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !relationshipId
    ) {
      return null;
    }


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM resources.resource_relationships
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              relationshipId,
            ]
          );


        return exposeRelationship(
          result.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * GET BY PUBLIC ID
   * ==========================================================================
   */

  async getRelationshipByPublicId(
    {
      organizationId,
      environmentId,
      publicId,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !publicId
    ) {
      return null;
    }


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM resources.resource_relationships
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND public_id = $3
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              publicId,
            ]
          );


        return exposeRelationship(
          result.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * FIND CURRENT SEMANTIC EDGE
   * ==========================================================================
   */

  async findActiveRelationship(
    {
      organizationId,
      environmentId,
      sourceResourceId,
      targetResourceId,
      relationshipType,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !sourceResourceId ||
      !targetResourceId ||
      !relationshipType
    ) {
      return null;
    }


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM resources.resource_relationships
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND source_resource_id = $3
                AND target_resource_id = $4
                AND relationship_type = $5
                AND status = 'ACTIVE'
                AND valid_to IS NULL
              ORDER BY
                valid_from DESC,
                created_at DESC
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              sourceResourceId,

              targetResourceId,

              relationshipType,
            ]
          );


        return exposeRelationship(
          result.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * OUTGOING EDGES
   * ==========================================================================
   */

  async listOutgoingRelationships(
    {
      organizationId,
      environmentId,
      resourceId,
      relationshipType = null,
      activeOnly = true,
      limit = 100,
      offset = 0,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    requireResourceId(
      resourceId
    );


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const {
          sql,
          values,
        } =
          buildDirectionalListQuery({
            direction:
              "source",

            organizationUuid:
              resolved.organizationUuid,

            environmentUuid:
              resolved.environmentUuid,

            resourceId,

            relationshipType,

            activeOnly,

            limit,

            offset,
          });


        const result =
          await client.query(
            sql,
            values
          );


        return result.rows.map(
          (row) =>
            exposeRelationship(
              row,
              resolved
            )
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * INCOMING EDGES
   * ==========================================================================
   */

  async listIncomingRelationships(
    {
      organizationId,
      environmentId,
      resourceId,
      relationshipType = null,
      activeOnly = true,
      limit = 100,
      offset = 0,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    requireResourceId(
      resourceId
    );


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const {
          sql,
          values,
        } =
          buildDirectionalListQuery({
            direction:
              "target",

            organizationUuid:
              resolved.organizationUuid,

            environmentUuid:
              resolved.environmentUuid,

            resourceId,

            relationshipType,

            activeOnly,

            limit,

            offset,
          });


        const result =
          await client.query(
            sql,
            values
          );


        return result.rows.map(
          (row) =>
            exposeRelationship(
              row,
              resolved
            )
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * IMMEDIATE GRAPH NEIGHBORHOOD
   *
   * This is deliberately one-hop only.
   *
   * Multi-hop temporal traversal belongs to Phase 17.9.
   * ==========================================================================
   */

  async listRelationshipsForResource(
    {
      organizationId,
      environmentId,
      resourceId,
      relationshipType = null,
      activeOnly = true,
      limit = 200,
      offset = 0,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    requireResourceId(
      resourceId
    );


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const values = [
          resolved.organizationUuid,

          resolved.environmentUuid,

          resourceId,
        ];


        const conditions = [
          "organization_id = $1",

          "environment_id = $2",

          "(source_resource_id = $3 OR target_resource_id = $3)",
        ];


        if (
          relationshipType
        ) {
          values.push(
            relationshipType
          );


          conditions.push(
            `relationship_type = $${values.length}`
          );
        }


        if (
          activeOnly
        ) {
          conditions.push(
            "status = 'ACTIVE'"
          );


          conditions.push(
            "valid_to IS NULL"
          );
        }


        values.push(
          normalizeLimit(
            limit,
            200
          )
        );


        const limitParameter =
          values.length;


        values.push(
          normalizeOffset(
            offset
          )
        );


        const offsetParameter =
          values.length;


        const result =
          await client.query(
            `
              SELECT *
              FROM resources.resource_relationships
              WHERE
                ${conditions.join(
                  "\nAND "
                )}
              ORDER BY
                valid_from DESC,
                created_at DESC,
                id ASC
              LIMIT $${limitParameter}
              OFFSET $${offsetParameter}
            `,
            values
          );


        return result.rows.map(
          (row) =>
            exposeRelationship(
              row,
              resolved
            )
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * DISCOVERY HEARTBEAT
   *
   * This does NOT change topology semantics.
   *
   * It merely records that discovery observed the same edge again.
   * ==========================================================================
   */

  async markRelationshipSeen(
    {
      organizationId,
      environmentId,
      relationshipId,
      seenAt = new Date(),
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !relationshipId
    ) {
      throw createRepositoryError(
        "Relationship ID is required",
        "POSTGRES_RELATIONSHIP_ID_REQUIRED"
      );
    }


    const timestamp =
      requireTimestamp(
        seenAt
      );


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              UPDATE resources.resource_relationships
              SET
                last_seen_at = $4
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3
              RETURNING *
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              relationshipId,

              timestamp,
            ]
          );


        return exposeRelationship(
          result.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }
}


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

async function verifyResource(
  client,
  resolved,
  resourceId,
  endpoint
) {
  const result =
    await client.query(
      `
        SELECT id
        FROM resources.resources
        WHERE
          organization_id = $1
          AND environment_id = $2
          AND id = $3
        LIMIT 1
      `,
      [
        resolved.organizationUuid,

        resolved.environmentUuid,

        resourceId,
      ]
    );


  if (
    result.rows.length ===
    0
  ) {
    throw createRepositoryError(
      `${endpoint} Resource was not found inside the requested scope`,

      `RELATIONSHIP_${endpoint}_RESOURCE_NOT_FOUND`
    );
  }
}


function buildDirectionalListQuery({
  direction,
  organizationUuid,
  environmentUuid,
  resourceId,
  relationshipType,
  activeOnly,
  limit,
  offset,
}) {
  const column =
    direction ===
    "target"
      ? "target_resource_id"
      : "source_resource_id";


  const values = [
    organizationUuid,

    environmentUuid,

    resourceId,
  ];


  const conditions = [
    "organization_id = $1",

    "environment_id = $2",

    `${column} = $3`,
  ];


  if (
    relationshipType
  ) {
    values.push(
      relationshipType
    );


    conditions.push(
      `relationship_type = $${values.length}`
    );
  }


  if (
    activeOnly
  ) {
    conditions.push(
      "status = 'ACTIVE'"
    );


    conditions.push(
      "valid_to IS NULL"
    );
  }


  values.push(
    normalizeLimit(
      limit
    )
  );


  const limitParameter =
    values.length;


  values.push(
    normalizeOffset(
      offset
    )
  );


  const offsetParameter =
    values.length;


  return {
    sql:
      `
        SELECT *
        FROM resources.resource_relationships
        WHERE
          ${conditions.join(
            "\nAND "
          )}
        ORDER BY
          valid_from DESC,
          created_at DESC,
          id ASC
        LIMIT $${limitParameter}
        OFFSET $${offsetParameter}
      `,

    values,
  };
}


function requireScope(
  value = {}
) {
  if (
    !value.organizationId ||
    !value.environmentId
  ) {
    throw createRepositoryError(
      "Relationship PostgreSQL operation requires organizationId and environmentId",
      "POSTGRES_RELATIONSHIP_SCOPE_REQUIRED"
    );
  }


  return value;
}


function requireResourceId(
  resourceId
) {
  if (
    !resourceId
  ) {
    throw createRepositoryError(
      "Relationship operation requires resourceId",
      "POSTGRES_RELATIONSHIP_RESOURCE_ID_REQUIRED"
    );
  }


  return resourceId;
}


function requireTimestamp(
  value
) {
  const timestamp =
    value instanceof Date
      ? value
      : new Date(
          value
        );


  if (
    Number.isNaN(
      timestamp.getTime()
    )
  ) {
    throw createRepositoryError(
      "Relationship timestamp is invalid",
      "POSTGRES_RELATIONSHIP_TIMESTAMP_INVALID"
    );
  }


  return timestamp;
}


function buildScope(
  value
) {
  return {
    organizationId:
      value.organizationId,

    environmentId:
      value.environmentId,
  };
}


function generatePublicId() {
  return (
    "rel_" +
    crypto.randomUUID()
  );
}


function normalizeLimit(
  value,
  defaultValue = 100
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return defaultValue;
  }


  return Math.min(
    Math.max(
      parsed,
      1
    ),
    1000
  );
}


function normalizeOffset(
  value
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 0;
  }


  return Math.max(
    parsed,
    0
  );
}


function exposeRelationship(
  row,
  resolved
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
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,

    canonicalOrganizationId:
      row.organization_id,

    canonicalEnvironmentId:
      row.environment_id,

    sourceResourceId:
      row.source_resource_id,

    targetResourceId:
      row.target_resource_id,

    relationshipType:
      row.relationship_type,

    attributes:
      row.attributes ||
      {},

    source:
      row.source ||
      null,

    confidence:
      row.confidence ===
        null ||
      row.confidence ===
        undefined
        ? null
        : Number(
            row.confidence
          ),

    validFrom:
      row.valid_from,

    validTo:
      row.valid_to ||
      null,

    status:
      row.status ||
      "ACTIVE",

    metadata:
      row.metadata ||
      {},

    discoveredAt:
      row.discovered_at ||
      null,

    lastSeenAt:
      row.last_seen_at ||
      null,

    createdAt:
      row.created_at ||
      null,
  };
}


function createRepositoryError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,
    }
  );
}


module.exports =
  PostgresResourceRelationshipRepository;