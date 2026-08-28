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
  PLAYBOOK_ID_REGEX,

  PLAYBOOK_API_VERSION,

  PLAYBOOK_KIND,

  PLAYBOOK_LIFECYCLE,

  PLAYBOOK_LIFECYCLE_TRANSITIONS,

  LIFECYCLE_VALUES,

  PLAYBOOK_OWNER_TYPE,

  OWNER_TYPE_VALUES,
} =
  require(
    "../../constants/playbook"
  );


const {
  computePlaybookChecksum,

  validateNewVersion,

  getLatestVersion:
    getLatestSemver,
} =
  require(
    "../../playbooks/versioning/playbookVersioning"
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


/*
 * ============================================================================
 * POSTGRES PLAYBOOK REPOSITORY
 * ============================================================================
 *
 * Phase 18.4 / 18.6
 *
 * Canonical persistence:
 *
 * knowledge.playbook_definitions
 * knowledge.playbook_versions
 *
 * Responsibilities:
 *
 * - create stable tenant-owned PlaybookDefinitions
 * - create immutable-version candidates
 * - retrieve environment/org/global Playbooks
 * - deterministic scope precedence
 * - lifecycle transitions
 * - execution locking
 * - exact historical version retrieval
 * - registry-visible PostgreSQL version listing
 * - exact tenant-owned definition resolution
 *
 * Explicitly NOT responsible for:
 *
 * - policy authorization
 * - approval authorization
 * - infrastructure execution
 * - arbitrary command generation
 * - global system catalogue publishing
 *
 * GLOBAL writes are intentionally reserved for the controlled
 * Phase 18 global knowledge importer.
 * ============================================================================
 */

class PostgresPlaybookRepository {

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


    assertPlaybookId(
      input.playbookId
    );


    requireText(
      input.name,
      "Playbook name is required",
      "POSTGRES_PLAYBOOK_NAME_REQUIRED"
    );


    const ownerType =
      input.ownerType ||
      PLAYBOOK_OWNER_TYPE
        .TENANT;


    if (
      !OWNER_TYPE_VALUES
        .includes(
          ownerType
        )
    ) {
      throw repositoryError(
        "Invalid Playbook ownerType",
        "POSTGRES_PLAYBOOK_OWNER_INVALID"
      );
    }


    if (
      ownerType ===
      PLAYBOOK_OWNER_TYPE
        .SYSTEM
    ) {
      throw repositoryError(
        "SYSTEM Playbook definitions must be created through the controlled global knowledge importer",
        "POSTGRES_PLAYBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
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
        "Invalid Playbook sourceType",
        "POSTGRES_PLAYBOOK_SOURCE_INVALID"
      );
    }


    const publicId =
      input.publicId ||
      generatePublicId(
        "pbdef"
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
              INSERT INTO knowledge.playbook_definitions (
                public_id,
                playbook_key,
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

              input.playbookId,

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
  // Precedence:
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


    assertPlaybookId(
      input.playbookId
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
              FROM knowledge.playbook_definitions
              WHERE
                playbook_key = $1
                AND status <> 'RETIRED'
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
              input.playbookId,
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


    const playbook =
      normalizePlaybook(
        input.playbook
      );


    assertPlaybookId(
      playbook.playbookId
    );


    assertSemver(
      playbook.semver
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
            playbook.playbookId
          );


        if (
          !definition
        ) {
          throw repositoryError(
            `Playbook definition ${playbook.playbookId} was not found`,
            "POSTGRES_PLAYBOOK_DEFINITION_NOT_FOUND"
          );
        }


        if (
          definition.scope_type ===
          "GLOBAL"
        ) {
          throw repositoryError(
            "GLOBAL Playbook versions must be created through the controlled global knowledge importer",
            "POSTGRES_PLAYBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
          );
        }


        const existing =
          await client.query(
            `
              SELECT semver
              FROM knowledge.playbook_versions
              WHERE
                playbook_definition_id = $1
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
              playbook.semver,
              existingVersions
            );


          if (
            !validation.valid
          ) {
            throw repositoryError(
              validation.reason,
              "POSTGRES_PLAYBOOK_VERSION_NOT_NEWER"
            );
          }
        }


        const checksum =
          computePlaybookChecksum(
            playbook
          );


        const publicId =
          input.publicId ||
          generatePublicId(
            "pbver"
          );


        const result =
          await client.query(
            `
              INSERT INTO knowledge.playbook_versions (
                public_id,
                playbook_definition_id,
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

              playbook.semver,

              playbook.lifecycle,

              checksum,

              JSON.stringify(
                playbook
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


    assertPlaybookId(
      input.playbookId
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
            input.playbookId,
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


    assertPlaybookId(
      input.playbookId
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
            input.playbookId
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
              FROM knowledge.playbook_versions
              WHERE
                playbook_definition_id = $1
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


    assertPlaybookId(
      input.playbookId
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
            input.playbookId,
            input.semver
          );


        if (
          !row
        ) {
          throw repositoryError(
            `Playbook ${input.playbookId}@${input.semver} was not found`,
            "POSTGRES_PLAYBOOK_VERSION_NOT_FOUND"
          );
        }


        if (
          row.scope_type ===
          "GLOBAL"
        ) {
          throw repositoryError(
            "GLOBAL Playbooks cannot be mutated through a tenant-scoped repository",
            "POSTGRES_PLAYBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
          );
        }


        const allowed =
          PLAYBOOK_LIFECYCLE_TRANSITIONS[
            row.lifecycle
          ] ||
          [];


        if (
          !allowed.includes(
            input.targetLifecycle
          )
        ) {
          throw repositoryError(
            `Cannot transition ${input.playbookId}@${input.semver} from ${row.lifecycle} to ${input.targetLifecycle}`,
            "POSTGRES_PLAYBOOK_INVALID_TRANSITION"
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
            computePlaybookChecksum(
              definition
            );
        }


        const result =
          await client.query(
            `
              UPDATE knowledge.playbook_versions
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
  // LOCK EXECUTION DEFINITION
  // ==========================================================================

  async lockExecutionDefinition(
    input,
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );


    assertPlaybookId(
      input.playbookId
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
            input.playbookId,
            input.semver
          );


        if (
          !row
        ) {
          throw repositoryError(
            `Playbook ${input.playbookId}@${input.semver} was not found`,
            "POSTGRES_PLAYBOOK_VERSION_NOT_FOUND"
          );
        }


        if (
          row.lifecycle !==
          PLAYBOOK_LIFECYCLE
            .ACTIVE
        ) {
          throw repositoryError(
            `Playbook ${input.playbookId}@${input.semver} is not ACTIVE`,
            "POSTGRES_PLAYBOOK_NOT_EXECUTABLE"
          );
        }


        const result =
          await client.query(
            `
              UPDATE knowledge.playbook_versions
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


        const exposed =
          exposeVersion(
            result.rows[0] ||
              null,

            row,

            resolved
          );


        return deepFreeze(
          JSON.parse(
            JSON.stringify(
              exposed
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
  // Unlike getDefinitionByKey(), this deliberately does NOT fall back to
  // GLOBAL knowledge.
  //
  // Used when creating tenant versions so a visible GLOBAL Playbook with the
  // same logical ID cannot accidentally become the tenant definition.
  // ==========================================================================

  async getOwnedDefinitionByKey(
    input,
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );


    assertPlaybookId(
      input.playbookId
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
        "GLOBAL Playbook definitions require the controlled global importer",
        "POSTGRES_PLAYBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
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
          input.playbookId,
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
              FROM knowledge.playbook_definitions

              WHERE
                playbook_key = $1

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
  // PostgreSQL RLS decides tenant/global visibility.
  //
  // Returns one record for each visible Playbook version.
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
          input.playbookId
        ) {
          assertPlaybookId(
            input.playbookId
          );


          params.push(
            input.playbookId
          );


          predicates.push(
            `d.playbook_key = $${params.length}`
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
          input.category
        ) {
          params.push(
            input.category
          );


          predicates.push(
            `(v.definition ->> 'category') = $${params.length}`
          );
        }


        const result =
          await client.query(
            `
              SELECT
                v.*,

                d.playbook_key,

                d.owner_type,

                d.source_type,

                d.name
                  AS definition_name,

                d.description
                  AS definition_description,

                d.status
                  AS definition_status

              FROM knowledge.playbook_versions v

              JOIN knowledge.playbook_definitions d
                ON d.id =
                  v.playbook_definition_id

              WHERE
                ${predicates.join(
                  "\nAND "
                )}

              ORDER BY
                d.playbook_key ASC,

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
  playbookId
) {
  const result =
    await client.query(
      `
        SELECT *
        FROM knowledge.playbook_definitions

        WHERE
          playbook_key = $1

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
        playbookId,
      ]
    );


  return result.rows[0] ||
    null;
}


async function findVersionOnClient(
  client,
  playbookId,
  semver
) {
  const result =
    await client.query(
      `
        SELECT
          v.*,

          d.playbook_key,

          d.owner_type,

          d.source_type,

          d.name
            AS definition_name,

          d.description
            AS definition_description,

          d.status
            AS definition_status

        FROM knowledge.playbook_versions v

        JOIN knowledge.playbook_definitions d
          ON d.id =
            v.playbook_definition_id

        WHERE
          d.playbook_key = $1

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
        playbookId,

        semver,
      ]
    );


  return result.rows[0] ||
    null;
}


// ============================================================================
// NORMALIZATION
// ============================================================================

function normalizePlaybook(
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
      "Playbook definition is required",
      "POSTGRES_PLAYBOOK_DEFINITION_REQUIRED"
    );
  }


  const value = {
    ...input,

    apiVersion:
      input.apiVersion ||
      PLAYBOOK_API_VERSION,

    kind:
      input.kind ||
      PLAYBOOK_KIND,

    lifecycle:
      input.lifecycle ||
      PLAYBOOK_LIFECYCLE
        .DRAFT,
  };


  if (
    value.apiVersion !==
      PLAYBOOK_API_VERSION ||

    value.kind !==
      PLAYBOOK_KIND
  ) {
    throw repositoryError(
      "Invalid Playbook apiVersion/kind",
      "POSTGRES_PLAYBOOK_CONTRACT_INVALID"
    );
  }


  assertLifecycle(
    value.lifecycle
  );


  requireText(
    value.name,
    "Playbook name is required",
    "POSTGRES_PLAYBOOK_NAME_REQUIRED"
  );


  if (
    !Array.isArray(
      value.stages
    ) ||

    value.stages.length ===
      0
  ) {
    throw repositoryError(
      "Playbook stages are required",
      "POSTGRES_PLAYBOOK_STAGES_REQUIRED"
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
      "POSTGRES_PLAYBOOK_SCOPE_INVALID"
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
      "GLOBAL knowledge requires the controlled global knowledge importer",
      "POSTGRES_PLAYBOOK_GLOBAL_WRITE_REQUIRES_CONTROLLED_IMPORT"
    );
  }
}


function assertPlaybookId(
  value
) {
  if (
    typeof value !==
      "string" ||

    !PLAYBOOK_ID_REGEX
      .test(
        value
      )
  ) {
    throw repositoryError(
      "Invalid Playbook ID",
      "POSTGRES_PLAYBOOK_ID_INVALID"
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
      "POSTGRES_PLAYBOOK_SEMVER_INVALID"
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
      "Invalid Playbook lifecycle",
      "POSTGRES_PLAYBOOK_LIFECYCLE_INVALID"
    );
  }
}


function requireRuntimeScope(
  input
) {
  requireText(
    input?.organizationId,
    "organizationId is required",
    "POSTGRES_PLAYBOOK_ORGANIZATION_REQUIRED"
  );


  requireText(
    input?.environmentId,
    "environmentId is required",
    "POSTGRES_PLAYBOOK_ENVIRONMENT_REQUIRED"
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

    playbookId:
      row.playbook_key,

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

    playbookDefinitionId:
      row.playbook_definition_id,

    playbookId:
      definition.playbook_key,

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
      "string" ||

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
    !value ||
    typeof value !==
      "object" ||
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
  PostgresPlaybookRepository;