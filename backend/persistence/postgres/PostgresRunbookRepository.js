"use strict";


const crypto =
  require(
    "node:crypto"
  );


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


const {
  RUNBOOK_API_VERSION,

  RUNBOOK_KIND,

  RUNBOOK_LIFECYCLE,

  RUNBOOK_LIFECYCLE_TRANSITIONS,

  RUNBOOK_OWNER_TYPE,

  RUNBOOK_ID_REGEX,

  LIFECYCLE_VALUES,

  OWNER_TYPE_VALUES,
} =
  require(
    "../../constants/runbook"
  );


const {
  computeChecksum,

  validateNewVersion,

  getLatestVersion:
    getLatestSemver,

  versionRef,
} =
  require(
    "../../runbooks/versioning/runbookVersioning"
  );


const SCOPE_TYPES =
  new Set([
    "GLOBAL",
    "ORGANIZATION",
    "ENVIRONMENT",
  ]);


const SOURCE_TYPES =
  new Set([
    "SYSTEM",
    "YAML",
    "API",
    "MONGO_MIGRATION",
  ]);


/**
 * ============================================================================
 * POSTGRES RUNBOOK REPOSITORY
 * ============================================================================
 *
 * Phase 18.5 / 18.6
 *
 * Canonical persistence:
 *
 * knowledge.runbook_definitions
 * knowledge.runbook_versions
 *
 * Replaces the future canonical role of:
 *
 * models/Runbook.js
 *
 * while preserving:
 *
 * - runbookId + semver identity
 * - exact environment/global resolution
 * - lifecycle transitions
 * - deterministic registered-action procedures
 * - checksum integrity
 * - execution locking
 * - exact historical version reconstruction
 * - registry-visible PostgreSQL retrieval
 *
 * Explicitly does NOT:
 *
 * - execute infrastructure operations
 * - authorize execution
 * - bypass policy
 * - bypass approvals
 * - invent arbitrary shell commands
 * ============================================================================
 */

class PostgresRunbookRepository {

  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  // ==========================================================================
  // CREATE DEFINITION
  // ==========================================================================

  async createDefinition(
    input,
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );


    const scopeType =
      normalizeScopeType(
        input.scopeType
      );


    assertTenantWritableScope(
      scopeType
    );


    assertRunbookId(
      input.runbookId
    );


    requireText(
      input.name,

      "Runbook name is required",

      "POSTGRES_RUNBOOK_NAME_REQUIRED"
    );


    const ownerType =
      input.ownerType ||
      RUNBOOK_OWNER_TYPE
        .TENANT;


    if (
      !OWNER_TYPE_VALUES
        .includes(
          ownerType
        )
    ) {
      throw repositoryError(
        "Invalid Runbook ownerType",

        "POSTGRES_RUNBOOK_OWNER_INVALID"
      );
    }


    if (
      ownerType ===
      RUNBOOK_OWNER_TYPE
        .SYSTEM
    ) {
      throw repositoryError(
        "SYSTEM Runbook definitions must be created through the controlled global knowledge importer",

        "POSTGRES_RUNBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
      );
    }


    const sourceType =
      input.sourceType ||
      "API";


    if (
      !SOURCE_TYPES
        .has(
          sourceType
        )
    ) {
      throw repositoryError(
        "Invalid Runbook sourceType",

        "POSTGRES_RUNBOOK_SOURCE_INVALID"
      );
    }


    const publicId =
      input.publicId ||
      generatePublicId(
        "rbdef"
      );


    return this.scope.run(
      runtimeScope(
        input
      ),

      async (
        client,
        resolved
      ) => {

        const storedEnvironmentId =
          scopeType ===
          "ENVIRONMENT"
            ? resolved.environmentUuid
            : null;


        const result =
          await client.query(
            `
              INSERT INTO knowledge.runbook_definitions (
                public_id,
                runbook_key,
                legacy_mongo_id,
                scope_type,
                organization_id,
                environment_id,
                name,
                description,
                owner_type,
                source_type,
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
                $11,
                $12::jsonb
              )
              RETURNING *
            `,
            [
              publicId,

              input.runbookId,

              input.legacyMongoId ||
                null,

              scopeType,

              resolved.organizationUuid,

              storedEnvironmentId,

              input.name,

              input.description ||
                null,

              ownerType,

              sourceType,

              input.status ||
                "ACTIVE",

              JSON.stringify(
                input.metadata ||
                  {}
              ),
            ]
          );


        return exposeDefinition(
          result.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }


  // ==========================================================================
  // RESOLVE DEFINITION
  //
  // Visibility precedence:
  //
  // ENVIRONMENT
  //   ↓
  // ORGANIZATION
  //   ↓
  // GLOBAL
  // ==========================================================================

  async getDefinitionByKey(
    input,
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );


    assertRunbookId(
      input.runbookId
    );


    return this.scope.run(
      runtimeScope(
        input
      ),

      async (
        client,
        resolved
      ) => {

        const result =
          await client.query(
            `
              SELECT *
              FROM knowledge.runbook_definitions

              WHERE
                runbook_key = $1

                AND status <>
                  'RETIRED'

              ORDER BY
                CASE scope_type
                  WHEN 'ENVIRONMENT'
                    THEN 1

                  WHEN 'ORGANIZATION'
                    THEN 2

                  WHEN 'GLOBAL'
                    THEN 3

                  ELSE 4
                END,

                created_at DESC

              LIMIT 1
            `,
            [
              input.runbookId,
            ]
          );


        return exposeDefinition(
          result.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }


  // ==========================================================================
  // CREATE VERSION
  // ==========================================================================

  async createVersion(
    input,
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );


    const runbook =
      normalizeRunbook(
        input.runbook
      );


    assertRunbookId(
      runbook.runbookId
    );


    assertSemver(
      runbook.semver
    );


    return this.scope.run(
      runtimeScope(
        input
      ),

      async (
        client,
        resolved
      ) => {

        const definition =
          await findDefinitionOnClient(
            client,
            runbook.runbookId
          );


        if (
          !definition
        ) {
          throw repositoryError(
            `Runbook definition ${runbook.runbookId} was not found`,

            "POSTGRES_RUNBOOK_DEFINITION_NOT_FOUND"
          );
        }


        if (
          definition.scope_type ===
          "GLOBAL"
        ) {
          throw repositoryError(
            "GLOBAL Runbook versions must be created through the controlled global knowledge importer",

            "POSTGRES_RUNBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
          );
        }


        const existing =
          await client.query(
            `
              SELECT semver
              FROM knowledge.runbook_versions
              WHERE
                runbook_definition_id = $1
            `,
            [
              definition.id,
            ]
          );


        const existingVersions =
          existing.rows
            .map(
              (
                row
              ) =>
                row.semver
            );


        if (
          existingVersions.length >
          0
        ) {
          const validation =
            validateNewVersion(
              runbook.semver,

              existingVersions
            );


          if (
            !validation.valid
          ) {
            throw repositoryError(
              validation.reason,

              "POSTGRES_RUNBOOK_VERSION_NOT_NEWER"
            );
          }
        }


        const checksum =
          computeChecksum(
            runbook
          );


        const publicId =
          input.publicId ||
          generatePublicId(
            "rbver"
          );


        const result =
          await client.query(
            `
              INSERT INTO knowledge.runbook_versions (
                public_id,
                runbook_definition_id,
                scope_type,
                organization_id,
                environment_id,
                semver,
                lifecycle,
                checksum,
                definition,
                provenance,
                safety,
                immutable,
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
                $9::jsonb,
                $10::jsonb,
                $11::jsonb,
                false,
                $12::jsonb
              )
              RETURNING *
            `,
            [
              publicId,

              definition.id,

              definition.scope_type,

              definition.organization_id,

              definition.environment_id,

              runbook.semver,

              runbook.lifecycle,

              checksum,

              JSON.stringify(
                runbook
              ),

              JSON.stringify(
                input.provenance ||
                  {
                    source:
                      input.source ||
                      "aira",
                  }
              ),

              JSON.stringify(
                nonAuthorizingSafety(
                  input.safety
                )
              ),

              JSON.stringify(
                input.metadata ||
                  {}
              ),
            ]
          );


        return exposeVersion(
          result.rows[0] ||
            null,

          definition,

          resolved
        );
      },

      transaction
    );
  }


  // ==========================================================================
  // GET EXACT VERSION
  // ==========================================================================

  async getVersion(
    input,
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );


    assertRunbookId(
      input.runbookId
    );


    assertSemver(
      input.semver
    );


    return this.scope.run(
      runtimeScope(
        input
      ),

      async (
        client,
        resolved
      ) => {

        const row =
          await findVersionOnClient(
            client,

            input.runbookId,

            input.semver
          );


        return exposeJoinedVersion(
          row,

          resolved
        );
      },

      transaction
    );
  }


  // ==========================================================================
  // LIST VERSIONS
  // ==========================================================================

  async listVersions(
    input,
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );


    assertRunbookId(
      input.runbookId
    );


    return this.scope.run(
      runtimeScope(
        input
      ),

      async (
        client,
        resolved
      ) => {

        const definition =
          await findDefinitionOnClient(
            client,

            input.runbookId
          );


        if (
          !definition
        ) {
          return [];
        }


        const params = [
          definition.id,
        ];


        let lifecycleFilter =
          "";


        if (
          input.lifecycle
        ) {
          assertLifecycle(
            input.lifecycle
          );


          params.push(
            input.lifecycle
          );


          lifecycleFilter =
            `AND lifecycle = $${params.length}`;
        }


        const result =
          await client.query(
            `
              SELECT *
              FROM knowledge.runbook_versions

              WHERE
                runbook_definition_id = $1

                ${lifecycleFilter}

              ORDER BY
                created_at ASC
            `,
            params
          );


        return result.rows
          .map(
            (
              row
            ) =>
              exposeVersion(
                row,

                definition,

                resolved
              )
          );
      },

      transaction
    );
  }


  // ==========================================================================
  // GET LATEST VERSION
  // ==========================================================================

  async getLatestVersion(
    input,
    transaction = null
  ) {
    const versions =
      await this.listVersions(
        input,

        transaction
      );


    if (
      versions.length ===
      0
    ) {
      return null;
    }


    const latestSemver =
      getLatestSemver(
        versions.map(
          (
            version
          ) =>
            version.semver
        )
      );


    return versions.find(
      (
        version
      ) =>
        version.semver ===
        latestSemver
    ) ||
      null;
  }


  // ==========================================================================
  // LIFECYCLE TRANSITION
  // ==========================================================================

  async transitionVersionLifecycle(
    input,
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );


    assertRunbookId(
      input.runbookId
    );


    assertSemver(
      input.semver
    );


    assertLifecycle(
      input.targetLifecycle
    );


    return this.scope.run(
      runtimeScope(
        input
      ),

      async (
        client,
        resolved
      ) => {

        const row =
          await findVersionOnClient(
            client,

            input.runbookId,

            input.semver
          );


        if (
          !row
        ) {
          throw repositoryError(
            `Runbook ${input.runbookId}@${input.semver} was not found`,

            "POSTGRES_RUNBOOK_VERSION_NOT_FOUND"
          );
        }


        if (
          row.scope_type ===
          "GLOBAL"
        ) {
          throw repositoryError(
            "GLOBAL Runbooks cannot be mutated through a tenant-scoped repository",

            "POSTGRES_RUNBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
          );
        }


        const allowed =
          RUNBOOK_LIFECYCLE_TRANSITIONS[
            row.lifecycle
          ] ||
          [];


        if (
          !allowed.includes(
            input.targetLifecycle
          )
        ) {
          throw repositoryError(
            `Cannot transition ${input.runbookId}@${input.semver} from ${row.lifecycle} to ${input.targetLifecycle}`,

            "POSTGRES_RUNBOOK_INVALID_TRANSITION"
          );
        }


        let definition =
          row.definition ||
          {};


        let checksum =
          row.checksum;


        if (
          !row.immutable
        ) {
          definition = {
            ...definition,

            lifecycle:
              input.targetLifecycle,
          };


          checksum =
            computeChecksum(
              definition
            );
        }


        const result =
          await client.query(
            `
              UPDATE knowledge.runbook_versions

              SET
                lifecycle = $2,

                definition =
                  CASE
                    WHEN immutable
                      THEN definition

                    ELSE $3::jsonb
                  END,

                checksum =
                  CASE
                    WHEN immutable
                      THEN checksum

                    ELSE $4
                  END,

                published_at =
                  CASE
                    WHEN $2 = 'ACTIVE'
                      THEN COALESCE(
                        published_at,
                        NOW()
                      )

                    ELSE published_at
                  END

              WHERE id = $1

              RETURNING *
            `,
            [
              row.id,

              input.targetLifecycle,

              JSON.stringify(
                definition
              ),

              checksum,
            ]
          );


        return exposeVersion(
          result.rows[0] ||
            null,

          row,

          resolved
        );
      },

      transaction
    );
  }


  // ==========================================================================
  // EXECUTION READINESS
  // ==========================================================================

  async isExecutable(
    input,
    transaction = null
  ) {
    try {

      const version =
        await this.getVersion(
          input,

          transaction
        );


      return (
        version?.lifecycle ===
        RUNBOOK_LIFECYCLE
          .ACTIVE
      );

    } catch {

      return false;
    }
  }


  // ==========================================================================
  // LOCK EXECUTION DEFINITION
  // ==========================================================================

  async lockExecutionDefinition(
    input,
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );


    assertRunbookId(
      input.runbookId
    );


    assertSemver(
      input.semver
    );


    return this.scope.run(
      runtimeScope(
        input
      ),

      async (
        client,
        resolved
      ) => {

        const row =
          await findVersionOnClient(
            client,

            input.runbookId,

            input.semver
          );


        if (
          !row
        ) {
          throw repositoryError(
            `Runbook ${input.runbookId}@${input.semver} was not found`,

            "POSTGRES_RUNBOOK_VERSION_NOT_FOUND"
          );
        }


        if (
          row.lifecycle !==
          RUNBOOK_LIFECYCLE
            .ACTIVE
        ) {
          throw repositoryError(
            `Runbook ${input.runbookId}@${input.semver} is ${row.lifecycle}, not ACTIVE`,

            "POSTGRES_RUNBOOK_NOT_EXECUTABLE"
          );
        }


        const result =
          await client.query(
            `
              UPDATE knowledge.runbook_versions

              SET
                immutable = true,

                locked_at =
                  COALESCE(
                    locked_at,
                    NOW()
                  ),

                first_executed_at =
                  COALESCE(
                    first_executed_at,
                    NOW()
                  )

              WHERE id = $1

              RETURNING *
            `,
            [
              row.id,
            ]
          );


        if (
          result.rows.length ===
          0
        ) {
          throw repositoryError(
            `Runbook ${input.runbookId}@${input.semver} could not be locked`,

            "POSTGRES_RUNBOOK_EXECUTION_LOCK_CONFLICT"
          );
        }


        const exposed =
          exposeVersion(
            result.rows[0],

            row,

            resolved
          );


        const executionDefinition = {
          ...exposed,

          versionRef:
            versionRef(
              input.runbookId,

              input.semver
            ),
        };


        return deepFreeze(
          JSON.parse(
            JSON.stringify(
              executionDefinition
            )
          )
        );
      },

      transaction
    );
  }


  // ==========================================================================
  // GET EXACT OWNED DEFINITION
  //
  // Unlike getDefinitionByKey(), this intentionally does not fall back to
  // GLOBAL knowledge.
  // ==========================================================================

  async getOwnedDefinitionByKey(
    input,
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );


    assertRunbookId(
      input.runbookId
    );


    const scopeType =
      normalizeScopeType(
        input.scopeType ||
        "ENVIRONMENT"
      );


    if (
      scopeType ===
      "GLOBAL"
    ) {
      throw repositoryError(
        "GLOBAL Runbook definitions require the controlled global importer",

        "POSTGRES_RUNBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
      );
    }


    return this.scope.run(
      runtimeScope(
        input
      ),

      async (
        client,
        resolved
      ) => {

        const params = [
          input.runbookId,

          scopeType,

          resolved.organizationUuid,
        ];


        let environmentPredicate =
          "environment_id IS NULL";


        if (
          scopeType ===
          "ENVIRONMENT"
        ) {
          params.push(
            resolved.environmentUuid
          );


          environmentPredicate =
            `environment_id = $${params.length}`;
        }


        const result =
          await client.query(
            `
              SELECT *
              FROM knowledge.runbook_definitions

              WHERE
                runbook_key = $1

                AND scope_type = $2

                AND organization_id = $3

                AND ${environmentPredicate}

                AND status <> 'RETIRED'

              LIMIT 1
            `,
            params
          );


        return exposeDefinition(
          result.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }


  // ==========================================================================
  // LIST VISIBLE VERSION DOCUMENTS
  //
  // PostgreSQL RLS decides visibility.
  // ==========================================================================

  async listVisibleVersions(
    input,
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );


    return this.scope.run(
      runtimeScope(
        input
      ),

      async (
        client,
        resolved
      ) => {

        const params =
          [];


        const predicates = [
          "d.status <> 'RETIRED'",
        ];


        if (
          input.runbookId
        ) {
          assertRunbookId(
            input.runbookId
          );


          params.push(
            input.runbookId
          );


          predicates.push(
            `d.runbook_key = $${params.length}`
          );
        }


        if (
          input.lifecycle
        ) {
          assertLifecycle(
            input.lifecycle
          );


          params.push(
            input.lifecycle
          );


          predicates.push(
            `v.lifecycle = $${params.length}`
          );
        }


        if (
          input.ownerType
        ) {
          params.push(
            input.ownerType
          );


          predicates.push(
            `d.owner_type = $${params.length}`
          );
        }


        if (
          input.category
        ) {
          params.push(
            input.category
          );


          predicates.push(
            `(v.definition ->> 'category') = $${params.length}`
          );
        }


        if (
          input.query
        ) {
          params.push(
            `%${input.query}%`
          );


          predicates.push(
            `(
              d.name ILIKE $${params.length}
              OR
              d.runbook_key ILIKE $${params.length}
            )`
          );
        }


        const result =
          await client.query(
            `
              SELECT
                v.*,

                d.runbook_key,

                d.owner_type,

                d.source_type,

                d.name
                  AS definition_name,

                d.description
                  AS definition_description,

                d.status
                  AS definition_status

              FROM knowledge.runbook_versions v

              JOIN knowledge.runbook_definitions d
                ON d.id =
                  v.runbook_definition_id

              WHERE
                ${predicates.join(
                  "\nAND "
                )}

              ORDER BY
                d.runbook_key ASC,

                v.created_at ASC
            `,
            params
          );


        return result.rows
          .map(
            (
              row
            ) =>
              exposeJoinedVersion(
                row,

                resolved
              )
          );
      },

      transaction
    );
  }
}


// ============================================================================
// PRIVATE SQL HELPERS
// ============================================================================

async function findDefinitionOnClient(
  client,
  runbookId
) {
  const result =
    await client.query(
      `
        SELECT *
        FROM knowledge.runbook_definitions

        WHERE
          runbook_key = $1

          AND status <>
            'RETIRED'

        ORDER BY
          CASE scope_type
            WHEN 'ENVIRONMENT'
              THEN 1

            WHEN 'ORGANIZATION'
              THEN 2

            WHEN 'GLOBAL'
              THEN 3

            ELSE 4
          END,

          created_at DESC

        LIMIT 1
      `,
      [
        runbookId,
      ]
    );


  return result.rows[0] ||
    null;
}


async function findVersionOnClient(
  client,
  runbookId,
  semver
) {
  const result =
    await client.query(
      `
        SELECT
          v.*,

          d.runbook_key,

          d.owner_type,

          d.source_type,

          d.name
            AS definition_name,

          d.description
            AS definition_description,

          d.status
            AS definition_status

        FROM knowledge.runbook_versions v

        JOIN knowledge.runbook_definitions d
          ON d.id =
            v.runbook_definition_id

        WHERE
          d.runbook_key = $1

          AND v.semver = $2

          AND d.status <>
            'RETIRED'

        ORDER BY
          CASE d.scope_type
            WHEN 'ENVIRONMENT'
              THEN 1

            WHEN 'ORGANIZATION'
              THEN 2

            WHEN 'GLOBAL'
              THEN 3

            ELSE 4
          END

        LIMIT 1
      `,
      [
        runbookId,

        semver,
      ]
    );


  return result.rows[0] ||
    null;
}


// ============================================================================
// NORMALIZATION
// ============================================================================

function normalizeRunbook(
  input
) {
  if (
    !input ||

    typeof input !==
      "object" ||

    Array.isArray(
      input
    )
  ) {
    throw repositoryError(
      "Runbook definition is required",

      "POSTGRES_RUNBOOK_DEFINITION_REQUIRED"
    );
  }


  const value = {
    ...input,

    apiVersion:
      input.apiVersion ||
      RUNBOOK_API_VERSION,

    kind:
      input.kind ||
      RUNBOOK_KIND,

    lifecycle:
      input.lifecycle ||
      RUNBOOK_LIFECYCLE
        .DRAFT,
  };


  if (
    value.apiVersion !==
      RUNBOOK_API_VERSION

    ||

    value.kind !==
      RUNBOOK_KIND
  ) {
    throw repositoryError(
      "Invalid Runbook apiVersion/kind",

      "POSTGRES_RUNBOOK_CONTRACT_INVALID"
    );
  }


  assertLifecycle(
    value.lifecycle
  );


  requireText(
    value.name,

    "Runbook name is required",

    "POSTGRES_RUNBOOK_NAME_REQUIRED"
  );


  if (
    !Array.isArray(
      value.steps
    )

    ||

    value.steps.length ===
      0
  ) {
    throw repositoryError(
      "Runbook steps are required",

      "POSTGRES_RUNBOOK_STEPS_REQUIRED"
    );
  }


  return value;
}


function normalizeScopeType(
  value
) {
  const normalized =
    value ||
    "ENVIRONMENT";


  if (
    !SCOPE_TYPES
      .has(
        normalized
      )
  ) {
    throw repositoryError(
      "Invalid knowledge scopeType",

      "POSTGRES_RUNBOOK_SCOPE_INVALID"
    );
  }


  return normalized;
}


function assertTenantWritableScope(
  scopeType
) {
  if (
    scopeType ===
    "GLOBAL"
  ) {
    throw repositoryError(
      "GLOBAL Runbook knowledge requires the controlled global importer",

      "POSTGRES_RUNBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
    );
  }
}


function assertRunbookId(
  value
) {
  if (
    typeof value !==
      "string"

    ||

    !RUNBOOK_ID_REGEX
      .test(
        value
      )
  ) {
    throw repositoryError(
      "Invalid Runbook ID",

      "POSTGRES_RUNBOOK_ID_INVALID"
    );
  }
}


function assertSemver(
  value
) {
  const result =
    validateNewVersion(
      value,

      []
    );


  if (
    !result.valid
  ) {
    throw repositoryError(
      result.reason,

      "POSTGRES_RUNBOOK_SEMVER_INVALID"
    );
  }
}


function assertLifecycle(
  value
) {
  if (
    !LIFECYCLE_VALUES
      .includes(
        value
      )
  ) {
    throw repositoryError(
      "Invalid Runbook lifecycle",

      "POSTGRES_RUNBOOK_LIFECYCLE_INVALID"
    );
  }
}


function requireRuntimeScope(
  input
) {
  requireText(
    input?.organizationId,

    "organizationId is required",

    "POSTGRES_RUNBOOK_ORGANIZATION_REQUIRED"
  );


  requireText(
    input?.environmentId,

    "environmentId is required",

    "POSTGRES_RUNBOOK_ENVIRONMENT_REQUIRED"
  );
}


function runtimeScope(
  input
) {
  return {
    organizationId:
      input.organizationId,

    environmentId:
      input.environmentId,
  };
}


// ============================================================================
// SAFETY
// ============================================================================

function nonAuthorizingSafety(
  input = {}
) {
  return {
    ...input,

    executionAuthorized:
      false,

    grantsExecutionPermission:
      false,

    bypassesPolicy:
      false,

    bypassesAuthorization:
      false,

    bypassesApproval:
      false,

    bypassesEntitlements:
      false,

    bypassesKillSwitch:
      false,
  };
}


// ============================================================================
// EXPOSURE
// ============================================================================

function exposeDefinition(
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

    runbookId:
      row.runbook_key,

    legacyMongoId:
      row.legacy_mongo_id ||
      null,

    scopeType:
      row.scope_type,

    organizationId:
      row.scope_type ===
      "GLOBAL"
        ? null
        : (
            resolved
              ?.applicationOrganizationId ||
            row.organization_id
          ),

    environmentId:
      row.scope_type ===
      "ENVIRONMENT"
        ? (
            resolved
              ?.applicationEnvironmentId ||
            row.environment_id
          )
        : null,

    canonicalOrganizationId:
      row.organization_id ||
      null,

    canonicalEnvironmentId:
      row.environment_id ||
      null,

    name:
      row.name,

    description:
      row.description ||
      null,

    ownerType:
      row.owner_type,

    sourceType:
      row.source_type,

    status:
      row.status,

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at ||
      null,

    updatedAt:
      row.updated_at ||
      null,
  };
}


function exposeVersion(
  row,
  definition,
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

    runbookDefinitionId:
      row.runbook_definition_id,

    runbookId:
      definition.runbook_key,

    scopeType:
      row.scope_type,

    organizationId:
      row.scope_type ===
      "GLOBAL"
        ? null
        : (
            resolved
              ?.applicationOrganizationId ||
            row.organization_id
          ),

    environmentId:
      row.scope_type ===
      "ENVIRONMENT"
        ? (
            resolved
              ?.applicationEnvironmentId ||
            row.environment_id
          )
        : null,

    canonicalOrganizationId:
      row.organization_id ||
      null,

    canonicalEnvironmentId:
      row.environment_id ||
      null,

    semver:
      row.semver,

    lifecycle:
      row.lifecycle,

    checksum:
      row.checksum ||
      null,

    definition:
      row.definition ||
      {},

    provenance:
      row.provenance ||
      {},

    safety:
      row.safety ||
      nonAuthorizingSafety(),

    immutable:
      Boolean(
        row.immutable
      ),

    lockedAt:
      row.locked_at ||
      null,

    firstExecutedAt:
      row.first_executed_at ||
      null,

    publishedAt:
      row.published_at ||
      null,

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at ||
      null,
  };
}


function exposeJoinedVersion(
  row,
  resolved
) {
  if (
    !row
  ) {
    return null;
  }


  return exposeVersion(
    row,

    row,

    resolved
  );
}


// ============================================================================
// MISC
// ============================================================================

function generatePublicId(
  prefix
) {
  return `${prefix}_${crypto.randomUUID()}`;
}


function requireText(
  value,
  message,
  code
) {
  if (
    typeof value !==
      "string"

    ||

    value.trim() ===
      ""
  ) {
    throw repositoryError(
      message,

      code
    );
  }
}


function repositoryError(
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


function deepFreeze(
  value
) {
  if (
    !value

    ||

    typeof value !==
      "object"

    ||

    Object.isFrozen(
      value
    )
  ) {
    return value;
  }


  Object.freeze(
    value
  );


  for (
    const child
    of Object.values(
      value
    )
  ) {
    deepFreeze(
      child
    );
  }


  return value;
}


module.exports =
  PostgresRunbookRepository;