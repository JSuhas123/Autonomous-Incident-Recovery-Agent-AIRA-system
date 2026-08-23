"use strict";

const {
  getPostgresPool,
} =
  require(
    "../postgres/postgresPool"
  );

const PostgresIdentityResolver =
  require(
    "../postgres/PostgresIdentityResolver"
  );

/**
 * Phase 13.5B
 *
 * Verifies that PostgreSQL tenancy identities required by a migration
 * already exist.
 *
 * This component NEVER creates tenancy records.
 */
class BackfillIdentityBootstrapper {
  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      null;

    this.identityResolver =
      options.identityResolver ||
      new PostgresIdentityResolver();
  }

  getPool() {
    return (
      this.pool ||
      getPostgresPool()
    );
  }

  async resolve({
    organizationId,
    environmentId,
    tenantId = null,
  } = {}) {
    if (
      !organizationId
    ) {
      throw Object.assign(
        new Error(
          "Backfill requires organizationId"
        ),
        {
          code:
            "MIGRATION_ORGANIZATION_REQUIRED",
        }
      );
    }

    if (
      !environmentId
    ) {
      throw Object.assign(
        new Error(
          "Backfill requires environmentId"
        ),
        {
          code:
            "MIGRATION_ENVIRONMENT_REQUIRED",
        }
      );
    }

    const client =
      await this
        .getPool()
        .connect();

    try {
      const resolved =
        await this
          .identityResolver
          .resolveScope(
            client,
            {
              organizationId,
              environmentId,
            }
          );

      const organization =
        await this
          .identityResolver
          .resolveOrganization(
            client,
            organizationId
          );

      const environment =
        await this
          .identityResolver
          .resolveEnvironment(
            client,
            resolved.organizationUuid,
            environmentId
          );

      const tenant =
        await this.resolveTenant(
          client,
          organization,
          environment,
          tenantId
        );

      return {
        /*
         * Used when reading Mongo.
         *
         * Keep the identifiers the caller supplied because those may be
         * legacy Mongo identifiers used by Mongo ownership fields.
         */
        sourceScope: {
          organizationId:
            String(
              organizationId
            ),

          environmentId:
            String(
              environmentId
            ),

          tenantId:
            tenant.publicId,
        },

        /*
         * Existing PostgreSQL repositories can resolve public / legacy IDs.
         */
        repositoryScope: {
          organizationId:
            organization.public_id ||
            String(
              organizationId
            ),

          environmentId:
            environment.public_id ||
            String(
              environmentId
            ),

          tenantId:
            tenant.publicId,
        },

        /*
         * Migration control tables store actual PostgreSQL UUID FKs.
         */
        controlScope: {
          organizationId:
            resolved.organizationUuid,

          environmentId:
            resolved.environmentUuid,
        },

        organization: {
          uuid:
            resolved.organizationUuid,

          publicId:
            organization.public_id,

          legacyMongoId:
            organization.legacy_mongo_id,

          tenantUuid:
            organization.tenant_id,
        },

        environment: {
          uuid:
            resolved.environmentUuid,

          publicId:
            environment.public_id,

          legacyMongoId:
            environment.legacy_mongo_id,

          tenantUuid:
            environment.tenant_id,
        },

        tenant,
      };
    } finally {
      client.release();
    }
  }

  async resolveTenant(
    client,
    organization,
    environment,
    requestedTenantId
  ) {
    const tenantUuid =
      organization.tenant_id ||
      environment.tenant_id;

    if (
      !tenantUuid
    ) {
      throw Object.assign(
        new Error(
          "PostgreSQL organization/environment does not resolve to a tenant"
        ),
        {
          code:
            "MIGRATION_TENANT_NOT_RESOLVED",
        }
      );
    }

    const result =
      await client.query(
        `
          SELECT
            id,
            public_id,
            legacy_mongo_id
          FROM tenancy.tenants
          WHERE id = $1
          LIMIT 1
        `,
        [
          tenantUuid,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      throw Object.assign(
        new Error(
          `PostgreSQL tenant not found: ${tenantUuid}`
        ),
        {
          code:
            "MIGRATION_TENANT_NOT_FOUND",
        }
      );
    }

    const row =
      result.rows[0];

    if (
      requestedTenantId &&
      ![
        String(
          row.id
        ),

        row.public_id,

        row.legacy_mongo_id,
      ]
        .filter(
          Boolean
        )
        .includes(
          String(
            requestedTenantId
          )
        )
    ) {
      throw Object.assign(
        new Error(
          "Requested tenant does not match PostgreSQL organization ownership"
        ),
        {
          code:
            "MIGRATION_TENANT_MISMATCH",
        }
      );
    }

    if (
      organization.tenant_id &&
      environment.tenant_id &&
      String(
        organization.tenant_id
      ) !==
        String(
          environment.tenant_id
        )
    ) {
      throw Object.assign(
        new Error(
          "Organization and environment resolve to different PostgreSQL tenants"
        ),
        {
          code:
            "MIGRATION_TENANCY_INTEGRITY_FAILURE",
        }
      );
    }

    return {
      uuid:
        row.id,

      publicId:
        row.public_id,

      legacyMongoId:
        row.legacy_mongo_id,
    };
  }
}

module.exports =
  BackfillIdentityBootstrapper;