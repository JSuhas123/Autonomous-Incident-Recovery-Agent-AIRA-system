"use strict";

const crypto = require("node:crypto");

const PostgresTenantScope = require(
  "./PostgresTenantScope"
);

class PostgresResourceRepository {
  constructor(options = {}) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(options);
  }

  async createResource(
    resource,
    transaction = null
  ) {
    requireScope(resource);

    if (!resource.resourceType) {
      throw Object.assign(
        new Error(
          "Resource resourceType is required"
        ),
        {
          code:
            "POSTGRES_RESOURCE_TYPE_REQUIRED",
        }
      );
    }

    if (!resource.provider) {
      throw Object.assign(
        new Error(
          "Resource provider is required"
        ),
        {
          code:
            "POSTGRES_RESOURCE_PROVIDER_REQUIRED",
        }
      );
    }

    const publicId =
      resource.publicId ||
      "res_" +
        crypto.randomUUID();

    return this.scope.run(
      {
        organizationId:
          resource.organizationId,

        environmentId:
          resource.environmentId,
      },

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
              publicId,

              resolved.organizationUuid,

              resolved.environmentUuid,

              resource.provider,

              resource.resourceType,

              resource.externalId ||
                null,

              resource.name ||
                null,

              resource.displayName ||
                null,

              resource.namespace ||
                null,

              resource.region ||
                null,

              resource.zone ||
                null,

              resource.serviceId ||
                null,

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

              resource.discoveredAt ||
                null,

              resource.firstSeenAt ||
                null,

              resource.lastSeenAt ||
                null,
            ]
          );

        return result.rows[0] || null;
      },

      transaction
    );
  }

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

    if (!resourceId) {
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

        return result.rows[0] || null;
      },

      transaction
    );
  }

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

    if (!publicId) {
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

        return result.rows[0] || null;
      },

      transaction
    );
  }

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

        let providerSql = "";

        if (provider) {
          values.push(provider);

          providerSql =
            " AND provider = $" +
            values.length;
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM resources.resources
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND resource_type = $3
                AND external_id = $4
                ${providerSql}
              ORDER BY created_at ASC
              LIMIT 1
            `,
            values
          );

        return result.rows[0] || null;
      },

      transaction
    );
  }

  async listResources(
    filter,
    transaction = null
  ) {
    requireScope(filter);

    const limit =
      normalizeLimit(
        filter.limit
      );

    const offset =
      normalizeOffset(
        filter.offset
      );

    return this.scope.run(
      {
        organizationId:
          filter.organizationId,

        environmentId:
          filter.environmentId,
      },

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

        if (filter.resourceType) {
          values.push(
            filter.resourceType
          );

          conditions.push(
            "resource_type = $" +
              values.length
          );
        }

        if (filter.provider) {
          values.push(
            filter.provider
          );

          conditions.push(
            "provider = $" +
              values.length
          );
        }

        if (filter.status) {
          values.push(
            filter.status
          );

          conditions.push(
            "status = $" +
              values.length
          );
        }

        if (filter.namespace) {
          values.push(
            filter.namespace
          );

          conditions.push(
            "namespace = $" +
              values.length
          );
        }

        if (filter.region) {
          values.push(
            filter.region
          );

          conditions.push(
            "region = $" +
              values.length
          );
        }

        values.push(limit);

        const limitParameter =
          values.length;

        values.push(offset);

        const offsetParameter =
          values.length;

        const result =
          await client.query(
            `
              SELECT *
              FROM resources.resources
              WHERE
                ${conditions.join(
                  " AND "
                )}
              ORDER BY
                updated_at DESC,
                id ASC
              LIMIT $${limitParameter}
              OFFSET $${offsetParameter}
            `,
            values
          );

        return result.rows;
      },

      transaction
    );
  }

  async updateResourceMetadata(
    update,
    transaction = null
  ) {
    requireScope(update);

    if (!update.resourceId) {
      throw Object.assign(
        new Error(
          "Resource resourceId is required"
        ),
        {
          code:
            "POSTGRES_RESOURCE_ID_REQUIRED",
        }
      );
    }

    return this.scope.run(
      {
        organizationId:
          update.organizationId,

        environmentId:
          update.environmentId,
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

              valueOrNull(
                update.name
              ),

              valueOrNull(
                update.displayName
              ),

              valueOrNull(
                update.namespace
              ),

              valueOrNull(
                update.region
              ),

              valueOrNull(
                update.zone
              ),

              valueOrNull(
                update.serviceId
              ),

              jsonOrNull(
                update.labels
              ),

              jsonOrNull(
                update.attributes
              ),

              jsonOrNull(
                update.metadata
              ),

              valueOrNull(
                update.status
              ),
            ]
          );

        return result.rows[0] || null;
      },

      transaction
    );
  }

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

    if (!resourceId) {
      throw Object.assign(
        new Error(
          "Resource resourceId is required"
        ),
        {
          code:
            "POSTGRES_RESOURCE_ID_REQUIRED",
        }
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

                status =
                  CASE
                    WHEN status = 'DELETED'
                      THEN status
                    ELSE 'ACTIVE'
                  END,

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

        return result.rows[0] || null;
      },

      transaction
    );
  }
}

function requireScope(
  value = {}
) {
  if (
    !value.organizationId ||
    !value.environmentId
  ) {
    throw Object.assign(
      new Error(
        "Resource PostgreSQL operation requires organizationId and environmentId"
      ),
      {
        code:
          "POSTGRES_RESOURCE_SCOPE_REQUIRED",
      }
    );
  }

  return {
    organizationId:
      value.organizationId,

    environmentId:
      value.environmentId,
  };
}

function valueOrNull(
  value
) {
  return value === undefined
    ? null
    : value;
}

function jsonOrNull(
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

module.exports =
  PostgresResourceRepository;