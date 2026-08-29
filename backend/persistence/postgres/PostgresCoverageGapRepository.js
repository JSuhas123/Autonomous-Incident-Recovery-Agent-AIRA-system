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
  COVERAGE_REASON_CODES,
} =
  require(
    "../../constants/coverage"
  );


/**
 * ============================================================================
 * AIRA PHASE 19.20
 * POSTGRES COVERAGE GAP REPOSITORY
 * ============================================================================
 *
 * Current mutable posture:
 *
 *   coverage.gaps
 *
 * Historical immutable posture:
 *
 *   coverage.snapshot_gaps
 *
 * Current gaps may:
 *
 *   - appear
 *   - change priority
 *   - be resolved
 *   - reappear
 *
 * Historical snapshot gaps NEVER change.
 *
 * Coverage NEVER authorizes execution.
 * ============================================================================
 */


class PostgresCoverageGapRepository {
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
   * SYNCHRONIZE CURRENT GAPS
   * ==========================================================================
   */

  async syncCurrentGaps(
    {
      organizationId,
      environmentId,
      snapshotId = null,
      gaps = [],
      detectedAt = null,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !Array.isArray(
        gaps
      )
    ) {
      throw createError(
        "gaps must be an array",
        "COVERAGE_GAPS_INVALID"
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
        const now =
          detectedAt ||
          new Date();


        const normalized =
          gaps.map(
            (
              gap
            ) =>
              normalizeGap(
                gap,
                now
              )
          );


        const activeKeys =
          normalized.map(
            (
              gap
            ) =>
              gap.gapKey
          );


        /*
         * Resolve gaps no longer present in the newly-evaluated posture.
         */

        if (
          activeKeys.length >
          0
        ) {
          await client.query(
            `
              UPDATE
                coverage.gaps

              SET
                resolved_at =
                  COALESCE(
                    resolved_at,
                    $3
                  ),

                updated_at =
                  NOW()

              WHERE
                organization_id = $1

                AND environment_id = $2

                AND resolved_at IS NULL

                AND NOT (
                  gap_key =
                  ANY(
                    $4::text[]
                  )
                )
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              now,

              activeKeys,
            ]
          );
        } else {
          await client.query(
            `
              UPDATE
                coverage.gaps

              SET
                resolved_at =
                  COALESCE(
                    resolved_at,
                    $3
                  ),

                updated_at =
                  NOW()

              WHERE
                organization_id = $1

                AND environment_id = $2

                AND resolved_at IS NULL
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              now,
            ]
          );
        }


        const persisted =
          [];


        for (
          const gap
          of normalized
        ) {
          const result =
            await client.query(
              `
                INSERT INTO
                  coverage.gaps (
                    public_id,

                    organization_id,
                    environment_id,

                    gap_key,

                    evaluation_id,

                    resource_id,
                    resource_public_id,
                    resource_type,

                    failure_mode_key,
                    failure_mode_semver,

                    classification,

                    reason_code,

                    severity,

                    priority_score,

                    explanation,

                    evidence,

                    detected_at,
                    last_detected_at,

                    resolved_at,

                    latest_snapshot_id,

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

                  $12,

                  $13,

                  $14,

                  $15,

                  $16::jsonb,

                  $17,
                  $17,

                  NULL,

                  $18,

                  false
                )

                ON CONFLICT (
                  organization_id,
                  environment_id,
                  gap_key
                )

                DO UPDATE SET
                  evaluation_id =
                    EXCLUDED.evaluation_id,

                  resource_id =
                    EXCLUDED.resource_id,

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

                  reason_code =
                    EXCLUDED.reason_code,

                  severity =
                    EXCLUDED.severity,

                  priority_score =
                    EXCLUDED.priority_score,

                  explanation =
                    EXCLUDED.explanation,

                  evidence =
                    EXCLUDED.evidence,

                  last_detected_at =
                    EXCLUDED.last_detected_at,

                  resolved_at =
                    NULL,

                  latest_snapshot_id =
                    EXCLUDED.latest_snapshot_id,

                  execution_authorized =
                    false,

                  updated_at =
                    NOW()

                RETURNING *
              `,
              [
                gap.publicId,

                resolved.organizationUuid,

                resolved.environmentUuid,

                gap.gapKey,

                gap.evaluationId,

                gap.resourceId,

                gap.resourcePublicId,

                gap.resourceType,

                gap.failureModeKey,

                gap.failureModeSemver,

                gap.classification,

                gap.reasonCode,

                gap.severity,

                gap.priorityScore,

                gap.explanation,

                JSON.stringify(
                  gap.evidence
                ),

                now,

                snapshotId,
              ]
            );


          persisted.push(
            exposeGap(
              result.rows[0],
              resolved
            )
          );
        }


        return persisted;
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * PERSIST IMMUTABLE SNAPSHOT GAPS
   * ==========================================================================
   */

  async createSnapshotGaps(
    {
      organizationId,
      environmentId,
      snapshotId,
      gaps = [],
      detectedAt = null,
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


    if (
      !Array.isArray(
        gaps
      )
    ) {
      throw createError(
        "gaps must be an array",
        "COVERAGE_GAPS_INVALID"
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
        const now =
          detectedAt ||
          new Date();


        const persisted =
          [];


        for (
          const rawGap
          of gaps
        ) {
          const gap =
            normalizeGap(
              rawGap,
              now
            );


          const result =
            await client.query(
              `
                INSERT INTO
                  coverage.snapshot_gaps (
                    snapshot_id,

                    organization_id,
                    environment_id,

                    gap_key,

                    evaluation_id,

                    resource_id,
                    resource_public_id,
                    resource_type,

                    failure_mode_key,
                    failure_mode_semver,

                    classification,

                    reason_code,

                    severity,

                    priority_score,

                    explanation,

                    evidence,

                    detected_at,

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

                  $12,

                  $13,

                  $14,

                  $15,

                  $16::jsonb,

                  $17,

                  false
                )

                RETURNING *
              `,
              [
                snapshotId,

                resolved.organizationUuid,

                resolved.environmentUuid,

                gap.gapKey,

                gap.evaluationId,

                gap.resourceId,

                gap.resourcePublicId,

                gap.resourceType,

                gap.failureModeKey,

                gap.failureModeSemver,

                gap.classification,

                gap.reasonCode,

                gap.severity,

                gap.priorityScore,

                gap.explanation,

                JSON.stringify(
                  gap.evidence
                ),

                now,
              ]
            );


          persisted.push(
            exposeSnapshotGap(
              result.rows[0],
              resolved
            )
          );
        }


        return persisted;
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * LIST CURRENT GAPS
   * ==========================================================================
   */

  async listCurrentGaps(
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
          resolved.organizationUuid,

          resolved.environmentUuid,
        ];


        const conditions = [
          "organization_id = $1",

          "environment_id = $2",
        ];


        if (
          filter.includeResolved !==
          true
        ) {
          conditions.push(
            "resolved_at IS NULL"
          );
        }


        appendFilter(
          conditions,
          values,
          "severity",
          filter.severity
        );


        appendFilter(
          conditions,
          values,
          "reason_code",
          filter.reasonCode
        );


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
                coverage.gaps

              WHERE
                ${conditions.join(
                  "\nAND "
                )}

              ORDER BY
                priority_score DESC,
                last_detected_at DESC,
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
            exposeGap(
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
   * LIST IMMUTABLE SNAPSHOT GAPS
   * ==========================================================================
   */

  async listSnapshotGaps(
    {
      organizationId,
      environmentId,
      snapshotId,
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
        const result =
          await client.query(
            `
              SELECT *
              FROM
                coverage.snapshot_gaps

              WHERE
                organization_id = $1

                AND environment_id = $2

                AND snapshot_id = $3

              ORDER BY
                priority_score DESC,
                reason_code ASC,
                id ASC

              LIMIT $4
              OFFSET $5
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              snapshotId,

              normalizeLimit(
                limit
              ),

              normalizeOffset(
                offset
              ),
            ]
          );


        return result.rows.map(
          (
            row
          ) =>
            exposeSnapshotGap(
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
 * GAP NORMALIZATION
 * ============================================================================
 */


function normalizeGap(
  gap = {},
  detectedAt
) {
  const reasonCode =
    resolveReasonCode(
      gap
    );


  validateReasonCode(
    reasonCode
  );


  const classification =
    normalizeClassification(
      gap.classification
    );


  const severity =
    normalizeSeverity(
      gap.severity ||
      gap.priority ||
      gap.priorityLevel
    );


  const gapKey =
    gap.gapKey ||
    generateGapKey({
      resourcePublicId:
        gap.resourcePublicId ||
        null,

      resourceId:
        gap.resourceId ||
        null,

      resourceType:
        gap.resourceType ||
        null,

      failureModeKey:
        gap.failureModeKey ||
        null,

      failureModeSemver:
        gap.failureModeSemver ||
        gap.failureModeVersion ||
        null,

      incidentId:
        gap.incidentId ||
        null,

      reasonCode,
    });


  return {
    publicId:
      gap.publicId ||
      generatePublicId(),

    gapKey,

    evaluationId:
      normalizeUuid(
        gap.evaluationId
      ),

    resourceId:
      normalizeUuid(
        gap.resourceId
      ),

    resourcePublicId:
      gap.resourcePublicId ||
      (
        normalizeUuid(
          gap.resourceId
        )
          ? null
          : gap.resourceId ||
            null
      ),

    resourceType:
      gap.resourceType ||
      null,

    failureModeKey:
      gap.failureModeKey ||
      null,

    failureModeSemver:
      gap.failureModeSemver ||
      gap.failureModeVersion ||
      null,

    classification,

    reasonCode,

    severity,

    priorityScore:
      normalizePriorityScore(
        gap.priorityScore ??
        gap.score ??
        0
      ),

    explanation:
      gap.explanation ||
      gap.description ||
      null,

    evidence:
      buildEvidence(
        gap
      ),

    detectedAt:
      gap.detectedAt ||
      detectedAt,
  };
}


/*
 * ============================================================================
 * EXPOSURE
 * ============================================================================
 */


function exposeGap(
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

    gapKey:
      row.gap_key,

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

    failureModeKey:
      row.failure_mode_key,

    failureModeSemver:
      row.failure_mode_semver,

    classification:
      row.classification,

    reasonCode:
      row.reason_code,

    severity:
      row.severity,

    priorityScore:
      Number(
        row.priority_score ||
        0
      ),

    explanation:
      row.explanation,

    evidence:
      row.evidence ||
      {},

    detectedAt:
      row.detected_at,

    lastDetectedAt:
      row.last_detected_at,

    resolvedAt:
      row.resolved_at,

    latestSnapshotId:
      row.latest_snapshot_id,

    executionAuthorized:
      false,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


function exposeSnapshotGap(
  row,
  resolved
) {
  return {
    id:
      row.id,

    snapshotId:
      row.snapshot_id,

    gapKey:
      row.gap_key,

    organizationId:
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,

    evaluationId:
      row.evaluation_id,

    resourceId:
      row.resource_id,

    resourcePublicId:
      row.resource_public_id,

    resourceType:
      row.resource_type,

    failureModeKey:
      row.failure_mode_key,

    failureModeSemver:
      row.failure_mode_semver,

    classification:
      row.classification,

    reasonCode:
      row.reason_code,

    severity:
      row.severity,

    priorityScore:
      Number(
        row.priority_score ||
        0
      ),

    explanation:
      row.explanation,

    evidence:
      row.evidence ||
      {},

    detectedAt:
      row.detected_at,

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


function resolveReasonCode(
  gap
) {
  if (
    gap.reasonCode
  ) {
    return gap.reasonCode;
  }


  if (
    Array.isArray(
      gap.reasonCodes
    ) &&
    gap.reasonCodes.length >
      0
  ) {
    return gap.reasonCodes[0];
  }


  if (
    gap.reason
  ) {
    return gap.reason;
  }


  return "NO_FAILURE_MODE";
}


function validateReasonCode(
  value
) {
  const valid =
    new Set(
      Object.values(
        COVERAGE_REASON_CODES
      )
    );


  if (
    !valid.has(
      value
    )
  ) {
    throw createError(
      `Invalid coverage reason code: ${value}`,
      "COVERAGE_REASON_CODE_INVALID"
    );
  }
}


function normalizeClassification(
  value
) {
  if (
    value ===
      "PARTIAL" ||
    value ===
      "HUMAN_ONLY" ||
    value ===
      "UNKNOWN"
  ) {
    return value;
  }


  return "UNKNOWN";
}


function normalizeSeverity(
  value
) {
  const normalized =
    String(
      value ||
      "MEDIUM"
    )
      .trim()
      .toUpperCase();


  if (
    [
      "LOW",
      "MEDIUM",
      "HIGH",
      "CRITICAL",
    ].includes(
      normalized
    )
  ) {
    return normalized;
  }


  return "MEDIUM";
}


function normalizePriorityScore(
  value
) {
  const number =
    Number(
      value
    );


  if (
    !Number.isFinite(
      number
    ) ||
    number <
      0
  ) {
    return 0;
  }


  return number;
}


function normalizeUuid(
  value
) {
  if (
    !value
  ) {
    return null;
  }


  const stringValue =
    String(
      value
    );


  return UUID_PATTERN.test(
    stringValue
  )
    ? stringValue
    : null;
}


function buildEvidence(
  gap
) {
  return {
    ...(
      gap.evidence &&
      typeof gap.evidence ===
        "object"
        ? gap.evidence
        : {}
    ),

    topology:
      gap.topology ||
      gap.blastRadius ||
      undefined,

    source:
      "PHASE_19_KNOWLEDGE_COVERAGE",

    correlationIsCausation:
      false,

    executionAuthorized:
      false,
  };
}


function generateGapKey(
  input
) {
  const material =
    [
      input.resourcePublicId ||
        input.resourceId ||
        input.resourceType ||
        "NO_RESOURCE",

      input.failureModeKey ||
        "NO_FAILURE_MODE",

      input.failureModeSemver ||
        "NO_VERSION",

      input.incidentId ||
        "NO_INCIDENT",

      input.reasonCode,
    ].join(
      "|"
    );


  const digest =
    crypto
      .createHash(
        "sha256"
      )
      .update(
        material
      )
      .digest(
        "hex"
      );


  return (
    "cov_gap_" +
    digest.slice(
      0,
      40
    )
  );
}


function generatePublicId() {
  return (
    "cov_gap_" +
    crypto.randomUUID()
  );
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
      null ||
    value ===
      ""
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


function requireScope(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw createError(
      "Coverage gap operation requires organizationId and environmentId",
      "COVERAGE_SCOPE_REQUIRED"
    );
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

      executionAuthorized:
        false,
    }
  );
}


const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


module.exports =
  PostgresCoverageGapRepository;