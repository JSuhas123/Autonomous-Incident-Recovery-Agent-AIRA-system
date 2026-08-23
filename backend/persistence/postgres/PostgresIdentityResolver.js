"use strict";

class PostgresIdentityResolver {
  normalizeIdentifier(
    value
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }

    if (
      typeof value.toHexString ===
      "function"
    ) {
      return value.toHexString();
    }

    return String(
      value
    );
  }

  async resolveOrganization(
    client,
    identifier
  ) {
    const normalized =
      this.normalizeIdentifier(
        identifier
      );

    if (!normalized) {
      throw createError(
        "organizationId is required",
        "POSTGRES_ORGANIZATION_REQUIRED"
      );
    }

    const result =
      await client.query(
        `
          SELECT
            id,
            public_id,
            legacy_mongo_id,
            tenant_id
          FROM tenancy.organizations
          WHERE
            public_id = $1
            OR legacy_mongo_id = $1
            OR id::text = $1
          LIMIT 1
        `,
        [
          normalized,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      throw createError(
        `PostgreSQL organization not found: ${normalized}`,
        "POSTGRES_ORGANIZATION_NOT_FOUND"
      );
    }

    return result.rows[0];
  }

  async resolveEnvironment(
    client,
    organizationUuid,
    identifier
  ) {
    const normalized =
      this.normalizeIdentifier(
        identifier
      );

    if (!normalized) {
      throw createError(
        "environmentId is required",
        "POSTGRES_ENVIRONMENT_REQUIRED"
      );
    }

    const result =
      await client.query(
        `
          SELECT
            id,
            public_id,
            legacy_mongo_id,
            tenant_id,
            organization_id
          FROM tenancy.environments
          WHERE
            organization_id = $1
            AND (
              public_id = $2
              OR legacy_mongo_id = $2
              OR id::text = $2
            )
          LIMIT 1
        `,
        [
          organizationUuid,
          normalized,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      throw createError(
        `PostgreSQL environment not found: ${normalized}`,
        "POSTGRES_ENVIRONMENT_NOT_FOUND"
      );
    }

    return result.rows[0];
  }

  async resolveIncident(
    client,
    {
      organizationUuid,
      environmentUuid,
    },
    identifier
  ) {
    const normalized =
      this.normalizeIdentifier(
        identifier
      );

    if (!normalized) {
      throw createError(
        "incidentId is required",
        "POSTGRES_INCIDENT_REQUIRED"
      );
    }

    const result =
      await client.query(
        `
          SELECT
            id,
            public_id,
            legacy_mongo_id
          FROM incidents.incidents
          WHERE
            organization_id = $1
            AND environment_id = $2
            AND (
              public_id = $3
              OR legacy_mongo_id = $3
              OR id::text = $3
            )
          LIMIT 1
        `,
        [
          organizationUuid,
          environmentUuid,
          normalized,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      return null;
    }

    return result.rows[0];
  }

  async resolveScope(
    client,
    {
      organizationId,
      environmentId,
    }
  ) {
    const organization =
      await this.resolveOrganization(
        client,
        organizationId
      );

    const environment =
      await this.resolveEnvironment(
        client,
        organization.id,
        environmentId
      );

    return {
      organization,

      environment,

      organizationUuid:
        organization.id,

      environmentUuid:
        environment.id,

      applicationOrganizationId:
        this.normalizeIdentifier(
          organizationId
        ),

      applicationEnvironmentId:
        this.normalizeIdentifier(
          environmentId
        ),
    };
  }
}

function createError(
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
  PostgresIdentityResolver;