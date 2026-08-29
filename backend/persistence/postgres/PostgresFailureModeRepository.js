"use strict";

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


/*
 * ============================================================================
 * AIRA PHASE 19
 * POSTGRES FAILURE MODE REPOSITORY
 * ============================================================================
 *
 * Canonical Phase 18 Failure Mode knowledge already exists in:
 *
 *   knowledge.failure_mode_definitions
 *   knowledge.failure_mode_versions
 *
 * Phase 19 needs a read repository so Coverage can determine which
 * Failure Modes apply to an actual Phase 17 resource.
 *
 * PostgreSQL remains authoritative.
 *
 * This repository:
 *
 *   - resolves visible Failure Modes
 *   - respects tenant/environment RLS
 *   - resolves effective scope precedence
 *   - returns the current applicable version per Failure Mode key
 *
 * This repository does NOT:
 *
 *   - classify recovery coverage
 *   - authorize execution
 *   - create recovery knowledge
 *   - use Qdrant as truth
 *
 * Effective scope precedence:
 *
 *   ENVIRONMENT
 *       >
 *   ORGANIZATION
 *       >
 *   GLOBAL
 *
 * ============================================================================
 */


class PostgresFailureModeRepository {
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
   * LIST APPLICABLE FAILURE MODES
   * ==========================================================================
   *
   * Returns one effective visible Failure Mode version per stable
   * failure_mode_key for the supplied resource type.
   *
   * Default knowledge readiness:
   *
   *   ACTIVE
   *   VALIDATED
   *
   * Draft/deprecated/retired knowledge is not considered current coverage
   * knowledge by default.
   * ==========================================================================
   */

  async listApplicableVersions(
    input = {},
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );

    requireText(
      input.resourceType,
      "resourceType is required",
      "FAILURE_MODE_RESOURCE_TYPE_REQUIRED"
    );

    const lifecycles =
      normalizeLifecycles(
        input.lifecycles
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
              SELECT DISTINCT ON (
                d.failure_mode_key
              )
                v.*,

                d.failure_mode_key,
                d.domain_key,

                d.name
                  AS definition_name,

                d.description
                  AS definition_description,

                d.status
                  AS definition_status

              FROM
                knowledge.failure_mode_versions v

              JOIN
                knowledge.failure_mode_definitions d
              ON
                d.id =
                v.failure_mode_definition_id

              WHERE
                d.status <> 'RETIRED'

                AND
                $1 = ANY(
                  v.resource_types
                )

                AND
                v.lifecycle =
                ANY(
                  $2::text[]
                )

              ORDER BY
                d.failure_mode_key,

                CASE
                  WHEN
                    v.scope_type =
                    'ENVIRONMENT'
                    THEN 3

                  WHEN
                    v.scope_type =
                    'ORGANIZATION'
                    THEN 2

                  ELSE 1
                END DESC,

                CASE
                  WHEN
                    v.lifecycle =
                    'ACTIVE'
                    THEN 2

                  WHEN
                    v.lifecycle =
                    'VALIDATED'
                    THEN 1

                  ELSE 0
                END DESC,

                v.published_at DESC
                  NULLS LAST,

                v.created_at DESC
            `,
            [
              input.resourceType,

              lifecycles,
            ]
          );


        return result.rows.map(
          (
            row
          ) =>
            exposeFailureMode(
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
   * LIST VISIBLE FAILURE MODES
   * ==========================================================================
   */

  async listVisibleVersions(
    input = {},
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );

    const lifecycles =
      normalizeLifecycles(
        input.lifecycles
      );


    return this.scope.run(
      runtimeScope(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const values = [
          lifecycles,
        ];

        const predicates = [
          "d.status <> 'RETIRED'",

          "v.lifecycle = ANY($1::text[])",
        ];


        if (
          input.failureModeKey
        ) {
          values.push(
            input.failureModeKey
          );

          predicates.push(
            `d.failure_mode_key = $${values.length}`
          );
        }


        if (
          input.domainKey
        ) {
          values.push(
            input.domainKey
          );

          predicates.push(
            `d.domain_key = $${values.length}`
          );
        }


        const result =
          await client.query(
            `
              SELECT
                v.*,

                d.failure_mode_key,
                d.domain_key,

                d.name
                  AS definition_name,

                d.description
                  AS definition_description,

                d.status
                  AS definition_status

              FROM
                knowledge.failure_mode_versions v

              JOIN
                knowledge.failure_mode_definitions d
              ON
                d.id =
                v.failure_mode_definition_id

              WHERE
                ${predicates.join(
                  "\nAND "
                )}

              ORDER BY
                d.failure_mode_key ASC,

                v.created_at DESC
            `,
            values
          );


        return result.rows.map(
          (
            row
          ) =>
            exposeFailureMode(
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
   * GET EXACT VERSION
   * ==========================================================================
   */

  async getVersionById(
    input = {},
    transaction = null
  ) {
    requireRuntimeScope(
      input
    );

    requireText(
      input.failureModeVersionId,
      "failureModeVersionId is required",
      "FAILURE_MODE_VERSION_ID_REQUIRED"
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
              SELECT
                v.*,

                d.failure_mode_key,
                d.domain_key,

                d.name
                  AS definition_name,

                d.description
                  AS definition_description,

                d.status
                  AS definition_status

              FROM
                knowledge.failure_mode_versions v

              JOIN
                knowledge.failure_mode_definitions d
              ON
                d.id =
                v.failure_mode_definition_id

              WHERE
                v.id = $1

                AND
                d.status <> 'RETIRED'

              LIMIT 1
            `,
            [
              input.failureModeVersionId,
            ]
          );


        return exposeFailureMode(
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
 * EXPOSURE
 * ============================================================================
 */


function exposeFailureMode(
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

    failureModeDefinitionId:
      row.failure_mode_definition_id,

    failureModeKey:
      row.failure_mode_key,

    domainKey:
      row.domain_key,

    name:
      row.definition_name,

    description:
      row.definition_description ||
      null,

    definitionStatus:
      row.definition_status,

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

    severity:
      row.severity,

    lifecycle:
      row.lifecycle,

    resourceTypes:
      row.resource_types ||
      [],

    triggers:
      row.triggers ||
      [],

    symptoms:
      row.symptoms ||
      [],

    evidenceRequirementIds:
      row.evidence_requirement_ids ||
      [],

    investigationStepIds:
      row.investigation_step_ids ||
      [],

    hypothesisIds:
      row.hypothesis_ids ||
      [],

    playbooks:
      row.playbooks ||
      [],

    requiredCapabilities:
      row.required_capabilities ||
      [],

    risk:
      row.risk ||
      {},

    policyRequirements:
      row.policy_requirements ||
      [],

    rollback:
      row.rollback ||
      {},

    verification:
      row.verification ||
      {},

    escalation:
      row.escalation ||
      {},

    provenance:
      row.provenance ||
      {},

    safety:
      row.safety ||
      {
        evidenceOnly:
          true,

        executionAuthorized:
          false,
      },

    checksum:
      row.checksum ||
      null,

    sourceDocument:
      row.source_document ||
      {},

    metadata:
      row.metadata ||
      {},

    publishedAt:
      row.published_at ||
      null,

    createdAt:
      row.created_at ||
      null,

    executionAuthorized:
      false,
  };
}


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */


function normalizeLifecycles(
  lifecycles
) {
  if (
    !Array.isArray(
      lifecycles
    ) ||
    !lifecycles.length
  ) {
    return [
      "ACTIVE",
      "VALIDATED",
    ];
  }


  const allowed =
    new Set([
      "DRAFT",
      "VALIDATED",
      "ACTIVE",
      "DEPRECATED",
      "RETIRED",
    ]);


  const normalized =
    lifecycles
      .map(
        (
          lifecycle
        ) =>
          String(
            lifecycle
          ).toUpperCase()
      )
      .filter(
        (
          lifecycle
        ) =>
          allowed.has(
            lifecycle
          )
      );


  if (
    !normalized.length
  ) {
    throw repositoryError(
      "No valid Failure Mode lifecycle supplied",
      "FAILURE_MODE_LIFECYCLE_INVALID"
    );
  }


  return [
    ...new Set(
      normalized
    ),
  ];
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


function requireRuntimeScope(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw repositoryError(
      "Failure Mode lookup requires organizationId and environmentId",
      "FAILURE_MODE_SCOPE_REQUIRED"
    );
  }
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

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  PostgresFailureModeRepository;