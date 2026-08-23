"use strict";

require(
  "dotenv"
).config();

const mongoose =
  require(
    "mongoose"
  );

const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );

const OrganizationModule =
  require(
    "../models/Organization"
  );

const EnvironmentModule =
  require(
    "../models/Environment"
  );

function resolveModel(
  moduleValue,
  preferredExport
) {
  if (
    preferredExport &&
    moduleValue?.[
      preferredExport
    ]
  ) {
    return moduleValue[
      preferredExport
    ];
  }

  if (
    typeof moduleValue ===
      "function"
  ) {
    return moduleValue;
  }

  const candidate =
    Object.values(
      moduleValue ||
      {}
    )
      .find(
        (
          value
        ) =>
          typeof value ===
          "function"
      );

  if (
    candidate
  ) {
    return candidate;
  }

  throw Object.assign(
    new Error(
      `Unable to resolve model: ${preferredExport}`
    ),
    {
      code:
        "POSTGRES_BOOTSTRAP_MODEL_RESOLUTION_FAILED",
    }
  );
}

const Organization =
  resolveModel(
    OrganizationModule,
    "Organization"
  );

const Environment =
  resolveModel(
    EnvironmentModule,
    "Environment"
  );

// ============================================================================
// CANONICAL IDS
// ============================================================================

function canonicalTenantPublicId(
  organization
) {
  return String(
    organization.tenantId ||
    `tenant_${organization._id}`
  );
}

function canonicalOrganizationPublicId(
  organization
) {
  /*
   * Prefer existing organization slug because it is already the
   * stable human-facing AIRA organization identifier.
   *
   * NOTE:
   * PostgreSQL does NOT have an organizations.slug column.
   *
   * We store this value only in public_id.
   */
  return String(
    organization.slug ||
    organization.tenantId ||
    organization._id
  );
}

function canonicalEnvironmentPublicId(
  environment
) {
  /*
   * Environment public_id must be globally unique.
   *
   * Mongo environment slugs such as "development" are only meaningful
   * inside an organization, so namespace them using the Mongo
   * organization identity.
   */
  return [
    "env",
    String(
      environment.organizationId
    ),
    String(
      environment.slug ||
      environment._id
    ),
  ]
    .join(
      "_"
    );
}

// ============================================================================
// TENANT
// ============================================================================

async function ensureTenant(
  client,
  organization
) {
  const tenantPublicId =
    canonicalTenantPublicId(
      organization
    );

  const legacyMongoId =
    String(
      organization._id
    );

  const existing =
    await client.query(
      `
        SELECT
          id,
          public_id,
          legacy_mongo_id,
          name,
          status
        FROM tenancy.tenants
        WHERE public_id = $1
           OR legacy_mongo_id = $2
        LIMIT 1
      `,
      [
        tenantPublicId,
        legacyMongoId,
      ]
    );

  if (
    existing.rowCount >
    0
  ) {
    return existing.rows[0];
  }

  const result =
    await client.query(
      `
        INSERT INTO tenancy.tenants (
          public_id,
          legacy_mongo_id,
          name,
          status,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::jsonb
        )
        RETURNING
          id,
          public_id,
          legacy_mongo_id,
          name,
          status
      `,
      [
        tenantPublicId,

        legacyMongoId,

        organization.name ||
        tenantPublicId,

        organization.status ||
        "active",

        JSON.stringify({
          source:
            "mongo-bootstrap",

          phase:
            "13.5B",

          mongoOrganizationId:
            legacyMongoId,

          mongoOrganizationSlug:
            organization.slug ||
            null,

          originalTenantId:
            organization.tenantId ||
            null,
        }),
      ]
    );

  return result.rows[0];
}

// ============================================================================
// ORGANIZATION
// ============================================================================

async function ensureOrganization(
  client,
  organization,
  tenant
) {
  const publicId =
    canonicalOrganizationPublicId(
      organization
    );

  const legacyMongoId =
    String(
      organization._id
    );

  const existing =
    await client.query(
      `
        SELECT
          id,
          tenant_id,
          public_id,
          legacy_mongo_id,
          name,
          status
        FROM tenancy.organizations
        WHERE public_id = $1
           OR legacy_mongo_id = $2
        LIMIT 1
      `,
      [
        publicId,
        legacyMongoId,
      ]
    );

  if (
    existing.rowCount >
    0
  ) {
    const row =
      existing.rows[0];

    if (
      row.tenant_id &&
      String(
        row.tenant_id
      ) !==
      String(
        tenant.id
      )
    ) {
      throw Object.assign(
        new Error(
          `Existing organization ${publicId} belongs to a different PostgreSQL tenant`
        ),
        {
          code:
            "POSTGRES_BOOTSTRAP_TENANT_CONFLICT",
        }
      );
    }

    return row;
  }

  /*
   * IMPORTANT:
   *
   * tenancy.organizations does NOT have a slug column.
   *
   * Mongo slug is preserved inside metadata and public_id.
   */
  const result =
    await client.query(
      `
        INSERT INTO tenancy.organizations (
          public_id,
          legacy_mongo_id,
          tenant_id,
          name,
          status,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb
        )
        RETURNING
          id,
          tenant_id,
          public_id,
          legacy_mongo_id,
          name,
          status
      `,
      [
        publicId,

        legacyMongoId,

        tenant.id,

        organization.name ||
        publicId,

        organization.status ||
        "active",

        JSON.stringify({
          source:
            "mongo-bootstrap",

          phase:
            "13.5B",

          mongoOrganizationId:
            legacyMongoId,

          mongoSlug:
            organization.slug ||
            null,

          mongoTenantId:
            organization.tenantId ||
            null,
        }),
      ]
    );

  return result.rows[0];
}

// ============================================================================
// ENVIRONMENT
// ============================================================================

async function ensureEnvironment(
  client,
  environment,
  organizationRow,
  tenant
) {
  const publicId =
    canonicalEnvironmentPublicId(
      environment
    );

  const legacyMongoId =
    String(
      environment._id
    );

  const existing =
    await client.query(
      `
        SELECT
          id,
          tenant_id,
          organization_id,
          public_id,
          legacy_mongo_id,
          name,
          environment_type,
          status
        FROM tenancy.environments
        WHERE public_id = $1
           OR legacy_mongo_id = $2
        LIMIT 1
      `,
      [
        publicId,
        legacyMongoId,
      ]
    );

  if (
    existing.rowCount >
    0
  ) {
    const row =
      existing.rows[0];

    if (
      String(
        row.organization_id
      ) !==
      String(
        organizationRow.id
      )
    ) {
      throw Object.assign(
        new Error(
          `Existing environment ${publicId} belongs to a different PostgreSQL organization`
        ),
        {
          code:
            "POSTGRES_BOOTSTRAP_ORGANIZATION_CONFLICT",
        }
      );
    }

    if (
      row.tenant_id &&
      String(
        row.tenant_id
      ) !==
      String(
        tenant.id
      )
    ) {
      throw Object.assign(
        new Error(
          `Existing environment ${publicId} belongs to a different PostgreSQL tenant`
        ),
        {
          code:
            "POSTGRES_BOOTSTRAP_TENANT_CONFLICT",
        }
      );
    }

    return row;
  }

  /*
   * IMPORTANT:
   *
   * PostgreSQL uses:
   *
   * environment_type
   *
   * NOT:
   *
   * type
   *
   * It also has no required slug column.
   */
  const result =
    await client.query(
      `
        INSERT INTO tenancy.environments (
          public_id,
          legacy_mongo_id,
          organization_id,
          tenant_id,
          name,
          environment_type,
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
          $8::jsonb
        )
        RETURNING
          id,
          tenant_id,
          organization_id,
          public_id,
          legacy_mongo_id,
          name,
          environment_type,
          status
      `,
      [
        publicId,

        legacyMongoId,

        organizationRow.id,

        tenant.id,

        environment.name ||
        publicId,

        environment.type ||
        "custom",

        environment.status ||
        "active",

        JSON.stringify({
          source:
            "mongo-bootstrap",

          phase:
            "13.5B",

          mongoEnvironmentId:
            legacyMongoId,

          mongoOrganizationId:
            String(
              environment.organizationId
            ),

          mongoSlug:
            environment.slug ||
            null,

          mongoType:
            environment.type ||
            null,
        }),
      ]
    );

  return result.rows[0];
}

// ============================================================================
// ORGANIZATION BOOTSTRAP TRANSACTION
// ============================================================================

async function bootstrapOrganization(
  pool,
  organization
) {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const tenant =
      await ensureTenant(
        client,
        organization
      );

    const organizationRow =
      await ensureOrganization(
        client,
        organization,
        tenant
      );

    const environments =
      await Environment
        .find({
          organizationId:
            organization._id,

          status: {
            $ne:
              "deleted",
          },
        })
        .lean();

    const environmentRows =
      [];

    for (
      const environment
      of environments
    ) {
      const environmentRow =
        await ensureEnvironment(
          client,
          environment,
          organizationRow,
          tenant
        );

      environmentRows.push(
        environmentRow
      );
    }

    await client.query(
      "COMMIT"
    );

    return {
      tenant,

      organization:
        organizationRow,

      environments:
        environmentRows,
    };
  } catch (
    error
  ) {
    await client
      .query(
        "ROLLBACK"
      )
      .catch(
        () => {}
      );

    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function run() {
  if (
    !process.env
      .MONGODB_URI
  ) {
    throw Object.assign(
      new Error(
        "MONGODB_URI is required"
      ),
      {
        code:
          "MONGODB_URI_REQUIRED",
      }
    );
  }

  if (
    String(
      process.env
        .POSTGRES_ENABLED
    )
      .trim()
      .toLowerCase() !==
    "true"
  ) {
    throw Object.assign(
      new Error(
        "POSTGRES_ENABLED=true is required"
      ),
      {
        code:
          "POSTGRES_DISABLED",
      }
    );
  }

  await mongoose.connect(
    process.env.MONGODB_URI
  );

  console.log(
    "[postgres-bootstrap-tenancy] Connected to MongoDB"
  );

  const pool =
    getPostgresPool();

  const organizations =
    await Organization
      .find({
        status: {
          $ne:
            "deleted",
        },
      })
      .lean();

  console.log(
    `[postgres-bootstrap-tenancy] Found ${organizations.length} organization(s)`
  );

  const summaries =
    [];

  for (
    const organization
    of organizations
  ) {
    console.log(
      `[postgres-bootstrap-tenancy] Bootstrapping ${organization.name || organization._id}`
    );

    const result =
      await bootstrapOrganization(
        pool,
        organization
      );

    summaries.push({
      mongoOrganizationId:
        String(
          organization._id
        ),

      tenantPublicId:
        result.tenant
          .public_id,

      tenantUuid:
        result.tenant
          .id,

      organizationPublicId:
        result.organization
          .public_id,

      organizationUuid:
        result.organization
          .id,

      organizationLegacyMongoId:
        result.organization
          .legacy_mongo_id,

      environmentCount:
        result.environments
          .length,

      environments:
        result.environments
          .map(
            (
              environment
            ) => ({
              uuid:
                environment.id,

              publicId:
                environment.public_id,

              legacyMongoId:
                environment
                  .legacy_mongo_id,

              environmentType:
                environment
                  .environment_type,
            })
          ),
    });
  }

  console.log(
    ""
  );

  console.log(
    "[postgres-bootstrap-tenancy] COMPLETE"
  );

  console.log(
    JSON.stringify(
      summaries,
      null,
      2
    )
  );
}

// ============================================================================
// ENTRYPOINT
// ============================================================================

if (
  require.main ===
  module
) {
  run()
    .catch(
      (
        error
      ) => {
        console.error(
          "[postgres-bootstrap-tenancy] FAILED:",
          {
            code:
              error.code ||
              "POSTGRES_TENANCY_BOOTSTRAP_FAILED",

            message:
              error.message,
          }
        );

        process.exitCode =
          1;
      }
    )
    .finally(
      async () => {
        try {
          await mongoose
            .disconnect();
        } catch (_) {}

        try {
          await closePostgresPool();
        } catch (_) {}
      }
    );
}

module.exports = {
  run,
  bootstrapOrganization,

  ensureTenant,
  ensureOrganization,
  ensureEnvironment,

  canonicalTenantPublicId,
  canonicalOrganizationPublicId,
  canonicalEnvironmentPublicId,
};