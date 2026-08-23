"use strict";

const {
  getPostgresPool,
} =
  require(
    "../postgres/postgresPool"
  );

class ShadowReadObservationStore {
  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      null;
  }

  getPool() {
    return (
      this.pool ||
      getPostgresPool()
    );
  }

  async record({
    scope,
    domain,
    operation,
    identity = null,
    status,
    match = null,
    sourceHash = null,
    targetHash = null,
    durationMs = null,
    differences = [],
    error = null,
    metadata = {},
  } = {}) {
    this.assertInput({
      scope,
      domain,
      operation,
      status,
    });

    const details = {
      operation,

      identity,

      status,

      match,

      sourceHash,

      targetHash,

      durationMs,

      differences:
        Array.isArray(
          differences
        )
          ? differences
              .slice(
                0,
                100
              )
          : [],

      error:
        error
          ? {
              code:
                error.code ||
                null,

              message:
                error.message ||
                String(
                  error
                ),
            }
          : null,

      metadata,

      observedAt:
        new Date()
          .toISOString(),
    };

    await this
      .getPool()
      .query(
        `
          INSERT INTO migration.history (
            organization_id,
            environment_id,
            domain,
            event_type,
            previous_phase,
            next_phase,
            source_backend,
            target_backend,
            details
          )
          VALUES (
            $1,
            $2,
            $3,
            'shadow_read',
            'shadow',
            'shadow',
            'mongo',
            'postgres',
            $4::jsonb
          )
        `,
        [
          scope.organizationId,

          scope.environmentId,

          domain,

          JSON.stringify(
            details
          ),
        ]
      );

    return details;
  }

  async summary(
    scope,
    domain,
    {
      since = null,
    } = {}
  ) {
    const values = [
      scope.organizationId,
      scope.environmentId,
      domain,
    ];

    let sinceClause =
      "";

    if (
      since
    ) {
      values.push(
        since
      );

      sinceClause =
        `AND created_at >= $${values.length}`;
    }

    const result =
      await this
        .getPool()
        .query(
          `
            SELECT
              COUNT(*)::bigint AS total,

              COUNT(*) FILTER (
                WHERE details->>'status' = 'match'
              )::bigint AS matched,

              COUNT(*) FILTER (
                WHERE details->>'status' = 'mismatch'
              )::bigint AS mismatched,

              COUNT(*) FILTER (
                WHERE details->>'status' = 'error'
              )::bigint AS errors,

              MAX(created_at)
                AS last_observed_at

            FROM migration.history

            WHERE organization_id = $1
              AND environment_id = $2
              AND domain = $3
              AND event_type = 'shadow_read'

              ${sinceClause}
          `,
          values
        );

    const row =
      result.rows[0] ||
      {};

    const total =
      Number(
        row.total ||
        0
      );

    const matched =
      Number(
        row.matched ||
        0
      );

    const mismatched =
      Number(
        row.mismatched ||
        0
      );

    const errors =
      Number(
        row.errors ||
        0
      );

    return {
      total,

      matched,

      mismatched,

      errors,

      mismatchRate:
        total >
        0
          ? mismatched /
            total
          : 0,

      errorRate:
        total >
        0
          ? errors /
            total
          : 0,

      lastObservedAt:
        row
          .last_observed_at ||
        null,
    };
  }

  assertInput({
    scope,
    domain,
    operation,
    status,
  }) {
    if (
      !scope
        ?.organizationId ||
      !scope
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Shadow read observation requires organization/environment scope"
        ),
        {
          code:
            "MIGRATION_SHADOW_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !domain
    ) {
      throw Object.assign(
        new Error(
          "Shadow read observation requires domain"
        ),
        {
          code:
            "MIGRATION_SHADOW_DOMAIN_REQUIRED",
        }
      );
    }

    if (
      !operation
    ) {
      throw Object.assign(
        new Error(
          "Shadow read observation requires operation"
        ),
        {
          code:
            "MIGRATION_SHADOW_OPERATION_REQUIRED",
        }
      );
    }

    if (
      ![
        "match",
        "mismatch",
        "error",
      ].includes(
        status
      )
    ) {
      throw Object.assign(
        new Error(
          `Invalid shadow read status: ${status}`
        ),
        {
          code:
            "MIGRATION_SHADOW_STATUS_INVALID",
        }
      );
    }
  }
}

module.exports =
  ShadowReadObservationStore;