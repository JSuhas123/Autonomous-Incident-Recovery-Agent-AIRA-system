"use strict";

const {
  getPostgresPool,
} =
  require(
    "../postgres/postgresPool"
  );

class MigrationVerificationStore {
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

  async record(
    scope,
    domain,
    {
      verificationType,

      sourceCount =
        null,

      targetCount =
        null,

      checkedCount =
        0,

      mismatchCount =
        0,

      passed =
        false,

      details =
        {},
    } = {}
  ) {
    if (
      !verificationType
    ) {
      throw Object.assign(
        new Error(
          "verificationType is required"
        ),
        {
          code:
            "MIGRATION_VERIFICATION_TYPE_REQUIRED",
        }
      );
    }

    const result =
      await this
        .getPool()
        .query(
          `
            INSERT INTO migration.verification_results (
              organization_id,
              environment_id,
              domain,
              verification_type,
              source_count,
              target_count,
              checked_count,
              mismatch_count,
              passed,
              details
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
              $10::jsonb
            )

            RETURNING *
          `,
          [
            scope.organizationId,

            scope.environmentId,

            domain,

            verificationType,

            sourceCount,

            targetCount,

            checkedCount,

            mismatchCount,

            passed ===
              true,

            JSON.stringify(
              details ||
              {}
            ),
          ]
        );

    return result.rows[0];
  }

  async latest(
    scope,
    domain,
    verificationType =
      null
  ) {
    const parameters = [
      scope.organizationId,
      scope.environmentId,
      domain,
    ];

    let typeClause =
      "";

    if (
      verificationType
    ) {
      parameters.push(
        verificationType
      );

      typeClause =
        "AND verification_type = $4";
    }

    const result =
      await this
        .getPool()
        .query(
          `
            SELECT *
            FROM migration.verification_results
            WHERE organization_id = $1
              AND environment_id = $2
              AND domain = $3
              ${typeClause}
            ORDER BY verified_at DESC
            LIMIT 1
          `,
          parameters
        );

    return (
      result.rows[0] ||
      null
    );
  }

  async list(
    scope,
    domain
  ) {
    const result =
      await this
        .getPool()
        .query(
          `
            SELECT *
            FROM migration.verification_results
            WHERE organization_id = $1
              AND environment_id = $2
              AND domain = $3
            ORDER BY verified_at DESC
          `,
          [
            scope.organizationId,
            scope.environmentId,
            domain,
          ]
        );

    return result.rows;
  }
}

module.exports =
  MigrationVerificationStore;