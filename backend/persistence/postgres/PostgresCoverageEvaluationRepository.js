"use strict";

const crypto =
  require("node:crypto");

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );

const {
  COVERAGE_CLASSIFICATIONS,
  COVERAGE_REASON_CODES,
} =
  require(
    "../../constants/coverage"
  );


/*
 * ============================================================================
 * PHASE 19
 * POSTGRES COVERAGE EVALUATION REPOSITORY
 * ============================================================================
 *
 * Canonical persistence boundary for CURRENT recovery coverage evaluations.
 *
 * Evaluation identity:
 *
 *   organization
 *     ×
 *   environment
 *     ×
 *   resource
 *     ×
 *   FailureModeVersion
 *
 * PostgreSQL:
 *
 *   coverage.evaluations
 *
 * This repository:
 *
 *   - persists current evaluations
 *   - retrieves current evaluations
 *   - lists evaluations
 *   - preserves canonical Phase 17/18 identifiers
 *
 * This repository does NOT:
 *
 *   - determine classification
 *   - calculate coverage score
 *   - authorize execution
 *   - resolve Failure Modes
 *   - query Qdrant
 *   - execute recovery
 *
 * ============================================================================
 */


class PostgresCoverageEvaluationRepository {
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
   * UPSERT CURRENT EVALUATION
   * ==========================================================================
   */

  async upsertEvaluation(
    input,
    transaction = null
  ) {
    validateInput(
      input
    );


    return this.scope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const publicId =
          input.publicId ||
          generatePublicId();


        const result =
          await client.query(
            `
              INSERT INTO
                coverage.evaluations (
                  public_id,

                  organization_id,
                  environment_id,

                  resource_id,
                  resource_public_id,
                  resource_type,

                  failure_mode_version_id,
                  failure_mode_key,
                  failure_mode_semver,

                  classification,

                  reason_codes,

                  readiness,

                  confidence,

                  evaluation_basis,

                  evaluator_version,

                  evaluated_at,

                  execution_authorized
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

                $11::text[],

                $12::jsonb,

                $13,

                $14::jsonb,

                $15,

                COALESCE(
                  $16,
                  NOW()
                ),

                false
              )

              ON CONFLICT (
                organization_id,
                environment_id,
                resource_id,
                failure_mode_version_id
              )

              DO UPDATE SET
                resource_public_id =
                  EXCLUDED.resource_public_id,

                resource_type =
                  EXCLUDED.resource_type,

                failure_mode_key =
                  EXCLUDED.failure_mode_key,

                failure_mode_semver =
                  EXCLUDED.failure_mode_semver,

                classification =
                  EXCLUDED.classification,

                reason_codes =
                  EXCLUDED.reason_codes,

                readiness =
                  EXCLUDED.readiness,

                confidence =
                  EXCLUDED.confidence,

                evaluation_basis =
                  EXCLUDED.evaluation_basis,

                evaluator_version =
                  EXCLUDED.evaluator_version,

                evaluated_at =
                  EXCLUDED.evaluated_at,

                execution_authorized =
                  false,

                updated_at =
                  NOW()

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.resourceId,

              input.resourcePublicId,

              input.resourceType,

              input.failureModeVersionId,

              input.failureModeKey,

              input.failureModeSemver,

              input.classification,

              input.reasonCodes ||
                [],

              JSON.stringify(
                input.readiness ||
                {}
              ),

              normalizeConfidence(
                input.confidence
              ),

              JSON.stringify(
                input.evaluationBasis ||
                {}
              ),

              input.evaluatorVersion ||
                "phase19-v1",

              input.evaluatedAt ||
                null,
            ]
          );


        return exposeEvaluation(
          result.rows[0],
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

  async getByPublicId(
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
              FROM
                coverage.evaluations
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND public_id = $3
              LIMIT 1
            `,
            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              publicId,
            ]
          );


        return exposeEvaluation(
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
   * GET RESOURCE × FAILURE MODE VERSION
   * ==========================================================================
   */

  async getEvaluation(
    {
      organizationId,
      environmentId,
      resourceId,
      failureModeVersionId,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !resourceId ||
      !failureModeVersionId
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
              FROM
                coverage.evaluations
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND resource_id = $3
                AND failure_mode_version_id = $4
              LIMIT 1
            `,
            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              resourceId,

              failureModeVersionId,
            ]
          );


        return exposeEvaluation(
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
   * LIST CURRENT EVALUATIONS
   * ==========================================================================
   */

  async listEvaluations(
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
          resolved
            .organizationUuid,

          resolved
            .environmentUuid,
        ];


        const conditions = [
          "organization_id = $1",

          "environment_id = $2",
        ];


        appendFilter(
          conditions,
          values,
          "classification",
          filter.classification
        );


        appendFilter(
          conditions,
          values,
          "resource_type",
          filter.resourceType
        );


        appendFilter(
          conditions,
          values,
          "resource_id",
          filter.resourceId
        );


        appendFilter(
          conditions,
          values,
          "failure_mode_key",
          filter.failureModeKey
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
              FROM
                coverage.evaluations
              WHERE
                ${conditions.join(
                  "\nAND "
                )}
              ORDER BY
                evaluated_at DESC,
                id ASC
              LIMIT
                $${limitParameter}
              OFFSET
                $${offsetParameter}
            `,
            values
          );


        return result.rows.map(
          (row) =>
            exposeEvaluation(
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
   * DELETE STALE EVALUATION
   * ==========================================================================
   *
   * Current evaluations may be replaced/removed.
   *
   * Historical posture belongs in immutable coverage snapshots.
   * ==========================================================================
   */

  async deleteEvaluation(
    {
      organizationId,
      environmentId,
      resourceId,
      failureModeVersionId,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !resourceId ||
      !failureModeVersionId
    ) {
      return false;
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
              DELETE FROM
                coverage.evaluations
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND resource_id = $3
                AND failure_mode_version_id = $4
            `,
            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              resourceId,

              failureModeVersionId,
            ]
          );


        return (
          result.rowCount >
          0
        );
      },

      transaction
    );
  }
}


/*
 * ============================================================================
 * VALIDATION
 * ============================================================================
 */


function validateInput(
  input = {}
) {
  requireScope(
    input
  );


  const required = [
    "resourceId",

    "resourcePublicId",

    "resourceType",

    "failureModeVersionId",

    "failureModeKey",

    "failureModeSemver",

    "classification",
  ];


  for (
    const field
    of required
  ) {
    if (
      !input[field]
    ) {
      throw createError(
        `${field} is required`,
        "COVERAGE_EVALUATION_INPUT_INVALID"
      );
    }
  }


  if (
    !Object.values(
      COVERAGE_CLASSIFICATIONS
    ).includes(
      input.classification
    )
  ) {
    throw createError(
      `Invalid coverage classification: ${input.classification}`,
      "COVERAGE_CLASSIFICATION_INVALID"
    );
  }


  const reasonCodes =
    input.reasonCodes ||
    [];


  if (
    !Array.isArray(
      reasonCodes
    )
  ) {
    throw createError(
      "reasonCodes must be an array",
      "COVERAGE_REASON_CODES_INVALID"
    );
  }


  const validReasonCodes =
    new Set(
      Object.values(
        COVERAGE_REASON_CODES
      )
    );


  for (
    const reasonCode
    of reasonCodes
  ) {
    if (
      !validReasonCodes.has(
        reasonCode
      )
    ) {
      throw createError(
        `Invalid coverage reason code: ${reasonCode}`,
        "COVERAGE_REASON_CODE_INVALID"
      );
    }
  }


  normalizeConfidence(
    input.confidence
  );


  if (
    input.executionAuthorized ===
    true
  ) {
    throw createError(
      "Coverage evaluation cannot authorize execution",
      "COVERAGE_EXECUTION_AUTHORIZATION_FORBIDDEN"
    );
  }


  return input;
}


function requireScope(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw createError(
      "Coverage operation requires organizationId and environmentId",
      "COVERAGE_SCOPE_REQUIRED"
    );
  }


  return input;
}


function normalizeConfidence(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return 0;
  }


  const normalized =
    Number(
      value
    );


  if (
    !Number.isFinite(
      normalized
    ) ||
    normalized < 0 ||
    normalized > 1
  ) {
    throw createError(
      "Coverage confidence must be between 0 and 1",
      "COVERAGE_CONFIDENCE_INVALID"
    );
  }


  return normalized;
}


/*
 * ============================================================================
 * QUERY HELPERS
 * ============================================================================
 */


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


function generatePublicId() {
  return (
    "cov_eval_" +
    crypto.randomUUID()
  );
}


/*
 * ============================================================================
 * DOMAIN EXPOSURE
 * ============================================================================
 */


function exposeEvaluation(
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

    resourceId:
      row.resource_id,

    resourcePublicId:
      row.resource_public_id,

    resourceType:
      row.resource_type,

    failureModeVersionId:
      row.failure_mode_version_id,

    failureModeKey:
      row.failure_mode_key,

    failureModeSemver:
      row.failure_mode_semver,

    classification:
      row.classification,

    reasonCodes:
      row.reason_codes ||
      [],

    readiness:
      row.readiness ||
      {},

    confidence:
      Number(
        row.confidence ||
        0
      ),

    evaluationBasis:
      row.evaluation_basis ||
      {},

    evaluatorVersion:
      row.evaluator_version,

    evaluatedAt:
      row.evaluated_at,

    executionAuthorized:
      false,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
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
  PostgresCoverageEvaluationRepository;