"use strict";


const crypto =
  require("crypto");


const {
  assertValidResource,
} =
  require(
    "../../../contracts/topology/resourceContract"
  );


function generatePublicId() {
  return `res_${crypto.randomUUID()}`;
}


function normalizeNullable(value) {
  return value === undefined
    ? null
    : value;
}


function buildResourceValues(resource) {
  const validated =
    assertValidResource(
      resource
    );


  return {
    publicId:
      validated.publicId ||
      generatePublicId(),

    organizationId:
      validated.organizationId,

    environmentId:
      validated.environmentId,

    resourceType:
      validated.resourceType,

    provider:
      normalizeNullable(
        validated.provider
      ),

    externalId:
      normalizeNullable(
        validated.externalId
      ),

    name:
      normalizeNullable(
        validated.name
      ),

    displayName:
      normalizeNullable(
        validated.displayName
      ),

    namespace:
      normalizeNullable(
        validated.namespace
      ),

    region:
      normalizeNullable(
        validated.region
      ),

    zone:
      normalizeNullable(
        validated.zone
      ),

    serviceId:
      normalizeNullable(
        validated.serviceId
      ),

    labels:
      validated.labels || {},

    attributes:
      validated.attributes || {},

    status:
      validated.status || "ACTIVE",

    discoveredAt:
      validated.discoveredAt ||
      new Date(),

    firstSeenAt:
      validated.firstSeenAt ||
      validated.discoveredAt ||
      new Date(),

    lastSeenAt:
      validated.lastSeenAt ||
      validated.discoveredAt ||
      new Date(),

    metadata:
      validated.metadata || {},
  };
}


function createResourceRepository({
  pool,
}) {
  if (!pool) {
    throw new Error(
      "RESOURCE_REPOSITORY_POOL_REQUIRED"
    );
  }


  async function createResource(
    resource
  ) {
    const values =
      buildResourceValues(
        resource
      );


    const query = {
      text: `
        INSERT INTO resources.resources (
          public_id,
          organization_id,
          environment_id,
          resource_type,
          provider,
          external_id,
          name,
          display_name,
          namespace,
          region,
          zone,
          service_id,
          labels,
          attributes,
          status,
          discovered_at,
          first_seen_at,
          last_seen_at,
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
          $11,
          $12,
          $13::jsonb,
          $14::jsonb,
          $15,
          $16,
          $17,
          $18,
          $19::jsonb
        )
        RETURNING *
      `,
      values: [
        values.publicId,
        values.organizationId,
        values.environmentId,
        values.resourceType,
        values.provider,
        values.externalId,
        values.name,
        values.displayName,
        values.namespace,
        values.region,
        values.zone,
        values.serviceId,
        JSON.stringify(
          values.labels
        ),
        JSON.stringify(
          values.attributes
        ),
        values.status,
        values.discoveredAt,
        values.firstSeenAt,
        values.lastSeenAt,
        JSON.stringify(
          values.metadata
        ),
      ],
    };


    const result =
      await pool.query(
        query
      );


    return result.rows[0];
  }


  async function getResourceById({
    organizationId,
    environmentId,
    resourceId,
  }) {
    const result =
      await pool.query(
        {
          text: `
            SELECT *
            FROM resources.resources
            WHERE id = $1
              AND organization_id = $2
              AND environment_id = $3
            LIMIT 1
          `,

          values: [
            resourceId,
            organizationId,
            environmentId,
          ],
        }
      );


    return result.rows[0] || null;
  }


  async function getResourceByPublicId({
    organizationId,
    environmentId,
    publicId,
  }) {
    const result =
      await pool.query(
        {
          text: `
            SELECT *
            FROM resources.resources
            WHERE public_id = $1
              AND organization_id = $2
              AND environment_id = $3
            LIMIT 1
          `,

          values: [
            publicId,
            organizationId,
            environmentId,
          ],
        }
      );


    return result.rows[0] || null;
  }


  async function findResourceByExternalId({
    organizationId,
    environmentId,
    resourceType,
    externalId,
  }) {
    if (
      externalId === null ||
      externalId === undefined
    ) {
      return null;
    }


    const result =
      await pool.query(
        {
          text: `
            SELECT *
            FROM resources.resources
            WHERE organization_id = $1
              AND environment_id = $2
              AND resource_type = $3
              AND external_id = $4
            LIMIT 1
          `,

          values: [
            organizationId,
            environmentId,
            resourceType,
            externalId,
          ],
        }
      );


    return result.rows[0] || null;
  }


  async function listResources({
    organizationId,
    environmentId,
    resourceType = null,
    status = null,
    limit = 100,
    offset = 0,
  }) {
    const values = [
      organizationId,
      environmentId,
    ];


    const conditions = [
      "organization_id = $1",
      "environment_id = $2",
    ];


    if (resourceType) {
      values.push(
        resourceType
      );

      conditions.push(
        `resource_type = $${values.length}`
      );
    }


    if (status) {
      values.push(
        status
      );

      conditions.push(
        `status = $${values.length}`
      );
    }


    const safeLimit =
      Math.min(
        Math.max(
          Number(limit) || 100,
          1
        ),
        500
      );


    const safeOffset =
      Math.max(
        Number(offset) || 0,
        0
      );


    values.push(
      safeLimit
    );

    const limitParameter =
      values.length;


    values.push(
      safeOffset
    );

    const offsetParameter =
      values.length;


    const result =
      await pool.query(
        {
          text: `
            SELECT *
            FROM resources.resources
            WHERE ${conditions.join(
              " AND "
            )}
            ORDER BY created_at DESC
            LIMIT $${limitParameter}
            OFFSET $${offsetParameter}
          `,

          values,
        }
      );


    return result.rows;
  }


  async function updateResourceMetadata({
    organizationId,
    environmentId,
    resourceId,
    name,
    displayName,
    labels,
    attributes,
    metadata,
    status,
  }) {
    const result =
      await pool.query(
        {
          text: `
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

              labels =
                COALESCE(
                  $6::jsonb,
                  labels
                ),

              attributes =
                COALESCE(
                  $7::jsonb,
                  attributes
                ),

              metadata =
                COALESCE(
                  $8::jsonb,
                  metadata
                ),

              status =
                COALESCE(
                  $9,
                  status
                ),

              updated_at =
                now()

            WHERE id = $1
              AND organization_id = $2
              AND environment_id = $3

            RETURNING *
          `,

          values: [
            resourceId,
            organizationId,
            environmentId,
            name === undefined
              ? null
              : name,
            displayName === undefined
              ? null
              : displayName,
            labels === undefined
              ? null
              : JSON.stringify(labels),
            attributes === undefined
              ? null
              : JSON.stringify(attributes),
            metadata === undefined
              ? null
              : JSON.stringify(metadata),
            status === undefined
              ? null
              : status,
          ],
        }
      );


    return result.rows[0] || null;
  }


  async function markResourceSeen({
    organizationId,
    environmentId,
    resourceId,
    seenAt = new Date(),
  }) {
    const result =
      await pool.query(
        {
          text: `
            UPDATE resources.resources
            SET
              last_seen_at = $4,
              status = 'ACTIVE',
              updated_at = now()

            WHERE id = $1
              AND organization_id = $2
              AND environment_id = $3

            RETURNING *
          `,

          values: [
            resourceId,
            organizationId,
            environmentId,
            seenAt,
          ],
        }
      );


    return result.rows[0] || null;
  }


  return Object.freeze({
    createResource,

    getResourceById,

    getResourceByPublicId,

    findResourceByExternalId,

    listResources,

    updateResourceMetadata,

    markResourceSeen,
  });
  
}


module.exports = {
  createResourceRepository,
};