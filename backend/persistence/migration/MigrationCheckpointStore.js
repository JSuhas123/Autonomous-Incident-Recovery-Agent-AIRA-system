"use strict";

const {
  getPostgresPool,
} =
  require(
    "../postgres/postgresPool"
  );

class MigrationCheckpointStore {
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

  async get(
    scope,
    domain
  ) {
    const result =
      await this
        .getPool()
        .query(
          `
            SELECT *
            FROM migration.checkpoints
            WHERE organization_id = $1
              AND environment_id = $2
              AND domain = $3
            LIMIT 1
          `,
          [
            scope.organizationId,
            scope.environmentId,
            domain,
          ]
        );

    return (
      result.rows[0] ||
      null
    );
  }

  async save(
    scope,
    domain,
    checkpoint
  ) {
    const result =
      await this
        .getPool()
        .query(
          `
            INSERT INTO migration.checkpoints (
              organization_id,
              environment_id,
              domain,
              cursor_value,
              batch_number,
              scanned_count,
              migrated_count,
              skipped_count,
              failed_count,
              source_high_watermark,
              completed,
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

            ON CONFLICT (
              organization_id,
              environment_id,
              domain
            )

            DO UPDATE SET
              cursor_value =
                EXCLUDED.cursor_value,

              batch_number =
                EXCLUDED.batch_number,

              scanned_count =
                EXCLUDED.scanned_count,

              migrated_count =
                EXCLUDED.migrated_count,

              skipped_count =
                EXCLUDED.skipped_count,

              failed_count =
                EXCLUDED.failed_count,

              source_high_watermark =
                EXCLUDED.source_high_watermark,

              completed =
                EXCLUDED.completed,

              metadata =
                migration.checkpoints.metadata ||
                EXCLUDED.metadata

            RETURNING *
          `,
          [
            scope.organizationId,
            scope.environmentId,
            domain,

            checkpoint.cursorValue ??
              null,

            checkpoint.batchNumber ??
              0,

            checkpoint.scannedCount ??
              0,

            checkpoint.migratedCount ??
              0,

            checkpoint.skippedCount ??
              0,

            checkpoint.failedCount ??
              0,

            checkpoint.sourceHighWatermark ??
              null,

            checkpoint.completed ??
              false,

            JSON.stringify(
              checkpoint.metadata ||
              {}
            ),
          ]
        );

    return result.rows[0];
  }

  async reset(
    scope,
    domain
  ) {
    await this
      .getPool()
      .query(
        `
          DELETE FROM migration.checkpoints
          WHERE organization_id = $1
            AND environment_id = $2
            AND domain = $3
        `,
        [
          scope.organizationId,
          scope.environmentId,
          domain,
        ]
      );
  }
}

module.exports =
  MigrationCheckpointStore;