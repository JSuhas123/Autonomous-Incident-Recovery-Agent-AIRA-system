"use strict";

const crypto =
  require("node:crypto");

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );

const {
  COVERAGE_CLASSIFICATIONS,
} =
  require(
    "../../constants/coverage"
  );


/**
 * ============================================================================
 * AIRA PHASE 19.19
 * POSTGRES COVERAGE SNAPSHOT REPOSITORY
 * ============================================================================
 *
 * Canonical persistence boundary for immutable historical recovery posture.
 *
 * Tables:
 *
 *   coverage.snapshots
 *   coverage.snapshot_items
 *
 * Snapshots are append-only.
 *
 * This repository intentionally exposes NO update method.
 *
 * PostgreSQL triggers additionally reject UPDATE operations.
 *
 * Coverage never authorizes execution.
 * ============================================================================
 */


class PostgresCoverageSnapshotRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  /**
   * Creates one immutable snapshot and all forensic snapshot items in one
   * PostgreSQL transaction.
   */
  async createSnapshot(
    input,
    transaction = null
  ) {
    validateSnapshotInput(
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
        const snapshotPublicId =
          input.publicId ||
          generateSnapshotPublicId();


        const snapshotResult =
          await client.query(
            `
              INSERT INTO
                coverage.snapshots (
                  public_id,

                  organization_id,
                  environment_id,

                  resources_count,
                  applicable_failure_modes_count,

                  covered_count,
                  partial_count,
                  human_only_count,
                  unknown_count,

                  coverage_percentage,

                  summary,
                  generation_basis,

                  generated_at,

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

                $11::jsonb,
                $12::jsonb,

                COALESCE(
                  $13,
                  NOW()
                ),

                false
              )

              RETURNING *
            `,
            [
              snapshotPublicId,

              resolved.organizationUuid,
              resolved.environmentUuid,

              input.resourcesCount,
              input.applicableFailureModesCount,

              input.coveredCount,
              input.partialCount,
              input.humanOnlyCount,
              input.unknownCount,

              input.coveragePercentage,

              JSON.stringify(
                input.summary ||
                {}
              ),

              JSON.stringify(
                input.generationBasis ||
                {}
              ),

              input.generatedAt ||
              null,
            ]
          );


        const snapshotRow =
          snapshotResult.rows[0];


        const items =
          [];


        for (
          const item
          of input.items
        ) {
          const itemResult =
            await client.query(
              `
                INSERT INTO
                  coverage.snapshot_items (
                    snapshot_id,

                    organization_id,
                    environment_id,

                    evaluation_id,

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

                  $11,
                  $12::text[],

                  $13::jsonb,
                  $14,
                  $15::jsonb,

                  $16,

                  false
                )

                RETURNING *
              `,
              [
                snapshotRow.id,

                resolved.organizationUuid,
                resolved.environmentUuid,

                item.evaluationId ||
                item.id ||
                null,

                item.resourceId ||
                null,

                item.resourcePublicId,

                item.resourceType,

                item.failureModeVersionId ||
                null,

                item.failureModeKey,

                item.failureModeSemver ||
                item.failureModeVersion,

                item.classification,

                item.reasonCodes ||
                [],

                JSON.stringify(
                  item.readiness ||
                  {}
                ),

                normalizeConfidence(
                  item.confidence
                ),

                JSON.stringify(
                  item.evaluationBasis ||
                  {}
                ),

                item.evaluatedAt ||
                input.generatedAt ||
                new Date(),
              ]
            );


          items.push(
            exposeSnapshotItem(
              itemResult.rows[0],
              resolved
            )
          );
        }


        return {
          ...exposeSnapshot(
            snapshotRow,
            resolved
          ),

          items,
        };
      },

      transaction
    );
  }


  async getLatestSnapshot(
    {
      organizationId,
      environmentId,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


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
                coverage.snapshots
              WHERE
                organization_id = $1
                AND environment_id = $2
              ORDER BY
                generated_at DESC,
                created_at DESC,
                id DESC
              LIMIT 1
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
            ]
          );


        return exposeSnapshot(
          result.rows[0] ||
          null,
          resolved
        );
      },

      transaction
    );
  }


  async getSnapshotByPublicId(
    {
      organizationId,
      environmentId,
      publicId,
      includeItems = true,
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
        const snapshotResult =
          await client.query(
            `
              SELECT *
              FROM
                coverage.snapshots
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


        const row =
          snapshotResult.rows[0];


        if (
          !row
        ) {
          return null;
        }


        const snapshot =
          exposeSnapshot(
            row,
            resolved
          );


        if (
          !includeItems
        ) {
          return snapshot;
        }


        const itemsResult =
          await client.query(
            `
              SELECT *
              FROM
                coverage.snapshot_items
              WHERE
                snapshot_id = $1
                AND organization_id = $2
                AND environment_id = $3
              ORDER BY
                resource_type ASC,
                failure_mode_key ASC,
                failure_mode_semver ASC,
                id ASC
            `,
            [
              row.id,

              resolved.organizationUuid,
              resolved.environmentUuid,
            ]
          );


        return {
          ...snapshot,

          items:
            itemsResult.rows.map(
              (
                item
              ) =>
                exposeSnapshotItem(
                  item,
                  resolved
                )
            ),
        };
      },

      transaction
    );
  }


  async listSnapshots(
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
        const result =
          await client.query(
            `
              SELECT *
              FROM
                coverage.snapshots
              WHERE
                organization_id = $1
                AND environment_id = $2
              ORDER BY
                generated_at DESC,
                created_at DESC,
                id DESC
              LIMIT $3
              OFFSET $4
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
              limit,
              offset,
            ]
          );


        return result.rows.map(
          (
            row
          ) =>
            exposeSnapshot(
              row,
              resolved
            )
        );
      },

      transaction
    );
  }


  async listSnapshotItems(
    {
      organizationId,
      environmentId,
      snapshotId,
      classification = null,
      resourceType = null,
      limit = 100,
      offset = 0,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !snapshotId
    ) {
      throw createError(
        "snapshotId is required",
        "COVERAGE_SNAPSHOT_ID_REQUIRED"
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
        const values = [
          snapshotId,
          resolved.organizationUuid,
          resolved.environmentUuid,
        ];


        const conditions = [
          "snapshot_id = $1",
          "organization_id = $2",
          "environment_id = $3",
        ];


        appendFilter(
          conditions,
          values,
          "classification",
          classification
        );


        appendFilter(
          conditions,
          values,
          "resource_type",
          resourceType
        );


        values.push(
          normalizeLimit(
            limit
          )
        );


        const limitParameter =
          values.length;


        values.push(
          normalizeOffset(
            offset
          )
        );


        const offsetParameter =
          values.length;


        const result =
          await client.query(
            `
              SELECT *
              FROM
                coverage.snapshot_items
              WHERE
                ${conditions.join(
                  "\nAND "
                )}
              ORDER BY
                resource_type ASC,
                failure_mode_key ASC,
                failure_mode_semver ASC,
                id ASC
              LIMIT
                $${limitParameter}
              OFFSET
                $${offsetParameter}
            `,
            values
          );


        return result.rows.map(
          (
            row
          ) =>
            exposeSnapshotItem(
              row,
              resolved
            )
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


function validateSnapshotInput(
  input = {}
) {
  requireScope(
    input
  );


  const integerFields = [
    "resourcesCount",
    "applicableFailureModesCount",
    "coveredCount",
    "partialCount",
    "humanOnlyCount",
    "unknownCount",
  ];


  for (
    const field
    of integerFields
  ) {
    const value =
      Number(
        input[field]
      );


    if (
      !Number.isInteger(
        value
      ) ||
      value <
        0
    ) {
      throw createError(
        `${field} must be a non-negative integer`,
        "COVERAGE_SNAPSHOT_INPUT_INVALID"
      );
    }
  }


  const percentage =
    Number(
      input.coveragePercentage
    );


  if (
    !Number.isFinite(
      percentage
    ) ||
    percentage <
      0 ||
    percentage >
      100
  ) {
    throw createError(
      "coveragePercentage must be between 0 and 100",
      "COVERAGE_SNAPSHOT_PERCENTAGE_INVALID"
    );
  }


  if (
    !Array.isArray(
      input.items
    )
  ) {
    throw createError(
      "items must be an array",
      "COVERAGE_SNAPSHOT_ITEMS_INVALID"
    );
  }


  for (
    const item
    of input.items
  ) {
    validateSnapshotItem(
      item
    );
  }


  if (
    input.executionAuthorized ===
    true
  ) {
    throw createError(
      "Coverage snapshot cannot authorize execution",
      "COVERAGE_EXECUTION_AUTHORIZATION_FORBIDDEN"
    );
  }
}


function validateSnapshotItem(
  item = {}
) {
  const required = [
    "resourcePublicId",
    "resourceType",
    "failureModeKey",
    "classification",
  ];


  for (
    const field
    of required
  ) {
    if (
      !item[field]
    ) {
      throw createError(
        `Snapshot item ${field} is required`,
        "COVERAGE_SNAPSHOT_ITEM_INVALID"
      );
    }
  }


  const semver =
    item.failureModeSemver ||
    item.failureModeVersion;


  if (
    !semver
  ) {
    throw createError(
      "Snapshot item failureModeSemver is required",
      "COVERAGE_SNAPSHOT_ITEM_INVALID"
    );
  }


  if (
    !Object.values(
      COVERAGE_CLASSIFICATIONS
    ).includes(
      item.classification
    )
  ) {
    throw createError(
      `Invalid snapshot classification: ${item.classification}`,
      "COVERAGE_CLASSIFICATION_INVALID"
    );
  }


  normalizeConfidence(
    item.confidence
  );
}


/*
 * ============================================================================
 * DOMAIN EXPOSURE
 * ============================================================================
 */


function exposeSnapshot(
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

    resourcesCount:
      Number(
        row.resources_count ||
        0
      ),

    applicableFailureModesCount:
      Number(
        row.applicable_failure_modes_count ||
        0
      ),

    coveredCount:
      Number(
        row.covered_count ||
        0
      ),

    partialCount:
      Number(
        row.partial_count ||
        0
      ),

    humanOnlyCount:
      Number(
        row.human_only_count ||
        0
      ),

    unknownCount:
      Number(
        row.unknown_count ||
        0
      ),

    coveragePercentage:
      Number(
        row.coverage_percentage ||
        0
      ),

    summary:
      row.summary ||
      {},

    generationBasis:
      row.generation_basis ||
      {},

    generatedAt:
      row.generated_at,

    executionAuthorized:
      false,

    createdAt:
      row.created_at,
  };
}


function exposeSnapshotItem(
  row,
  resolved
) {
  return {
    id:
      row.id,

    snapshotId:
      row.snapshot_id,

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

    evaluationId:
      row.evaluation_id,

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

    evaluatedAt:
      row.evaluated_at,

    executionAuthorized:
      false,

    createdAt:
      row.created_at,
  };
}


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */


function requireScope(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw createError(
      "Coverage snapshot operation requires organizationId and environmentId",
      "COVERAGE_SCOPE_REQUIRED"
    );
  }
}


function appendFilter(
  conditions,
  values,
  column,
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
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


function normalizeConfidence(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
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
    normalized <
      0 ||
    normalized >
      1
  ) {
    throw createError(
      "Coverage confidence must be between 0 and 1",
      "COVERAGE_CONFIDENCE_INVALID"
    );
  }


  return normalized;
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


function generateSnapshotPublicId() {
  return (
    "cov_snapshot_" +
    crypto.randomUUID()
  );
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

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  PostgresCoverageSnapshotRepository;