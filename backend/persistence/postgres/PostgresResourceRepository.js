"use strict";

const crypto = require("node:crypto");

const PostgresTenantScope = require(
  "./PostgresTenantScope"
);

const {
  assertValidResource,
} = require(
  "../../contracts/topology/resourceContract"
);


/*
 * ============================================================================
 * POSTGRES RESOURCE REPOSITORY
 * ============================================================================
 *
 * Phase 17.3
 *
 * Canonical persistence boundary for Resource identity.
 *
 * PostgreSQL:
 *   resources.resources
 *
 * Responsibilities:
 *
 * - create canonical resources
 * - retrieve resources by PostgreSQL UUID
 * - retrieve resources by public ID
 * - resolve provider/external identity
 * - list resources within tenant/environment scope
 * - update mutable descriptive metadata
 * - update discovery last-seen timestamps
 *
 * Explicitly NOT responsible for:
 *
 * - ResourceState snapshots
 * - known-good state
 * - relationships
 * - capabilities
 * - authorization
 * - execution
 * - provider-specific normalization
 *
 * All PostgreSQL work MUST run through PostgresTenantScope.
 * ============================================================================
 */

class PostgresResourceRepository {
  constructor(options = {}) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  /*
   * ==========================================================================
   * CREATE
   * ==========================================================================
   */

  async createResource(
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
    };


    /*
     * Resource contract validation is intentionally done
     * before PostgreSQL interaction.
     *
     * This guarantees provider-specific fields cannot leak
     * into the domain-neutral Resource model.
     */
    const resource =
      assertValidResource(
        candidate
      );


    /*
     * resources.resources.provider is NOT NULL in the
     * canonical PostgreSQL schema.
     */
    if (
      !resource.provider
    ) {
      throw createRepositoryError(
        "Resource provider is required",
        "POSTGRES_RESOURCE_PROVIDER_REQUIRED"
      );
    }


    return this.scope.run(
      buildScope(
        resource
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO resources.resources (
                public_id,
                organization_id,
                environment_id,
                provider,
                resource_type,
                external_id,
                name,
                display_name,
                namespace,
                region,
                zone,
                service_id,
                labels,
                attributes,
                metadata,
                status,
                discovered_at,
                first_seen_at,
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
                $9,
                $10,
                $11,
                $12,
                $13::jsonb,
                $14::jsonb,
                $15::jsonb,
                $16,
                COALESCE($17, NOW()),
                COALESCE($18, NOW()),
                COALESCE($19, NOW())
              )
              RETURNING *
            `,
            [
              resource.publicId,

              resolved.organizationUuid,

              resolved.environmentUuid,

              resource.provider,

              resource.resourceType,

              resource.externalId,

              resource.name,

              resource.displayName,

              resource.namespace,

              resource.region,

              resource.zone,

              resource.serviceId,

              JSON.stringify(
                resource.labels || {}
              ),

              JSON.stringify(
                resource.attributes || {}
              ),

              JSON.stringify(
                resource.metadata || {}
              ),

              resource.status ||
                "ACTIVE",

              resource.discoveredAt,

              resource.firstSeenAt,

              resource.lastSeenAt,
            ]
          );


        return exposeResource(
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
   * READ BY CANONICAL POSTGRESQL UUID
   * ==========================================================================
   */

  async getResourceById(
    {
      organizationId,
      environmentId,
      resourceId,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !resourceId
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


        return exposeResource(
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
   * READ BY PUBLIC ID
   * ==========================================================================
   */

  async getResourceByPublicId(
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
              FROM resources.resources
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


        return exposeResource(
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
   * EXTERNAL IDENTITY LOOKUP
   * ==========================================================================
   */

  async findResourceByExternalId(
    {
      organizationId,
      environmentId,
      resourceType,
      externalId,
      provider = null,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !resourceType ||
      !externalId
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
        const values = [
          resolved.organizationUuid,

          resolved.environmentUuid,

          resourceType,

          externalId,
        ];


        const conditions = [
          "organization_id = $1",

          "environment_id = $2",

          "resource_type = $3",

          "external_id = $4",
        ];


        if (
          provider
        ) {
          values.push(
            provider
          );


          conditions.push(
            `provider = $${values.length}`
          );
        }


        const result =
          await client.query(
            `
              SELECT *
              FROM resources.resources
              WHERE
                ${conditions.join(
                  "\nAND "
                )}
              ORDER BY
                created_at ASC,
                id ASC
              LIMIT 1
            `,
            values
          );


        return exposeResource(
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
   * LIST
   * ==========================================================================
   */

  async listResources(
    filter = {},
    transaction = null
  ) {
    requireScope(
      filter
    );


    const limit =
      normalizeLimit(
        filter.limit
      );


    const offset =
      normalizeOffset(
        filter.offset
      );


    return this.scope.run(
      buildScope(
        filter
      ),

      async (
        client,
        resolved
      ) => {
        const values = [
          resolved.organizationUuid,

          resolved.environmentUuid,
        ];


        const conditions = [
          "organization_id = $1",

          "environment_id = $2",
        ];


        appendFilter(
          conditions,
          values,
          "resource_type",
          filter.resourceType
        );


        appendFilter(
          conditions,
          values,
          "provider",
          filter.provider
        );


        appendFilter(
          conditions,
          values,
          "status",
          filter.status
        );


        appendFilter(
          conditions,
          values,
          "namespace",
          filter.namespace
        );


        appendFilter(
          conditions,
          values,
          "region",
          filter.region
        );


        values.push(
          limit
        );


        const limitParameter =
          values.length;


        values.push(
          offset
        );


        const offsetParameter =
          values.length;


        const result =
          await client.query(
            `
              SELECT *
              FROM resources.resources
              WHERE
                ${conditions.join(
                  "\nAND "
                )}
              ORDER BY
                updated_at DESC,
                created_at DESC,
                id ASC
              LIMIT $${limitParameter}
              OFFSET $${offsetParameter}
            `,
            values
          );


        return result.rows.map(
          (row) =>
            exposeResource(
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
   * MUTABLE RESOURCE METADATA
   * ==========================================================================
   *
   * Identity fields are intentionally excluded:
   *
   * - public_id
   * - organization_id
   * - environment_id
   * - provider
   * - resource_type
   * - external_id
   *
   * Those fields must not silently mutate through this method.
   * ==========================================================================
   */

  async updateResourceMetadata(
    update,
    transaction = null
  ) {
    requireScope(
      update
    );


    if (
      !update.resourceId
    ) {
      throw createRepositoryError(
        "Resource resourceId is required",
        "POSTGRES_RESOURCE_ID_REQUIRED"
      );
    }


    return this.scope.run(
      buildScope(
        update
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              UPDATE resources.resources
              SET
                name =
                  COALESCE(
                    $4,
                    name
                  ),

                display_name =
                  COALESCE(
                    $5,
                    display_name
                  ),

                namespace =
                  COALESCE(
                    $6,
                    namespace
                  ),

                region =
                  COALESCE(
                    $7,
                    region
                  ),

                zone =
                  COALESCE(
                    $8,
                    zone
                  ),

                service_id =
                  COALESCE(
                    $9,
                    service_id
                  ),

                labels =
                  COALESCE(
                    $10::jsonb,
                    labels
                  ),

                attributes =
                  COALESCE(
                    $11::jsonb,
                    attributes
                  ),

                metadata =
                  COALESCE(
                    $12::jsonb,
                    metadata
                  ),

                status =
                  COALESCE(
                    $13,
                    status
                  ),

                updated_at =
                  NOW()

              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3

              RETURNING *
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              update.resourceId,

              nullableValue(
                update.name
              ),

              nullableValue(
                update.displayName
              ),

              nullableValue(
                update.namespace
              ),

              nullableValue(
                update.region
              ),

              nullableValue(
                update.zone
              ),

              nullableValue(
                update.serviceId
              ),

              nullableJson(
                update.labels
              ),

              nullableJson(
                update.attributes
              ),

              nullableJson(
                update.metadata
              ),

              nullableValue(
                update.status
              ),
            ]
          );


        return exposeResource(
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
   * DISCOVERY HEARTBEAT
   * ==========================================================================
   */

  async markResourceSeen(
    {
      organizationId,
      environmentId,
      resourceId,
      seenAt = null,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !resourceId
    ) {
      throw createRepositoryError(
        "Resource resourceId is required",
        "POSTGRES_RESOURCE_ID_REQUIRED"
      );
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
              UPDATE resources.resources
              SET
                last_seen_at =
                  COALESCE(
                    $4,
                    NOW()
                  ),

                updated_at =
                  NOW()

              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3

              RETURNING *
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              resourceId,

              seenAt,
            ]
          );


        return exposeResource(
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

function requireScope(
  value = {}
) {
  if (
    !value.organizationId ||
    !value.environmentId
  ) {
    throw createRepositoryError(
      "Resource PostgreSQL operation requires organizationId and environmentId",
      "POSTGRES_RESOURCE_SCOPE_REQUIRED"
    );
  }


  return value;
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
    "res_" +
    crypto.randomUUID()
  );
}


function appendFilter(
  conditions,
  values,
  column,
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return;
  }


  values.push(
    value
  );


  conditions.push(
    `${column} = $${values.length}`
  );
}


function nullableValue(
  value
) {
  return value === undefined
    ? null
    : value;
}


function nullableJson(
  value
) {
  if (
    value === undefined
  ) {
    return null;
  }


  return JSON.stringify(
    value
  );
}


function normalizeLimit(
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
    return 100;
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


function exposeResource(
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

    legacyMongoId:
      row.legacy_mongo_id ||
      null,

    tenantId:
      row.tenant_id ||
      null,

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

    provider:
      row.provider,

    resourceType:
      row.resource_type,

    externalId:
      row.external_id ||
      null,

    name:
      row.name ||
      null,

    displayName:
      row.display_name ||
      null,

    namespace:
      row.namespace ||
      null,

    region:
      row.region ||
      null,

    zone:
      row.zone ||
      null,

    serviceId:
      row.service_id ||
      null,

    labels:
      row.labels ||
      {},

    attributes:
      row.attributes ||
      {},

    currentState:
      row.current_state ||
      {},

    metadata:
      row.metadata ||
      {},

    status:
      row.status ||
      "ACTIVE",

    discoveredAt:
      row.discovered_at ||
      null,

    firstSeenAt:
      row.first_seen_at ||
      null,

    lastSeenAt:
      row.last_seen_at ||
      null,

    createdAt:
      row.created_at ||
      null,

    updatedAt:
      row.updated_at ||
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
  PostgresResourceRepository;