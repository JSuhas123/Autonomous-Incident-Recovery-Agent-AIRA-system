"use strict";

const {
  getPostgresPool,
} =
  require(
    "../postgres/postgresPool"
  );

class MigrationStateStore {
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
    domain,
    transaction = null
  ) {
    const executor =
      transaction?.client ||
      this.getPool();

    const result =
      await executor.query(
        `
          SELECT *
          FROM migration.domain_state
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

  async ensure(
    scope,
    domain,
    transaction = null
  ) {
    const executor =
      transaction?.client ||
      this.getPool();

    const result =
      await executor.query(
        `
          INSERT INTO migration.domain_state (
            organization_id,
            environment_id,
            domain
          )
          VALUES (
            $1,
            $2,
            $3
          )

          ON CONFLICT (
            organization_id,
            environment_id,
            domain
          )

          DO UPDATE SET
            domain =
              EXCLUDED.domain

          RETURNING *
        `,
        [
          scope.organizationId,
          scope.environmentId,
          domain,
        ]
      );

    return result.rows[0];
  }

  async transition(
    scope,
    domain,
    nextPhase,
    changes = {}
  ) {
    const client =
      await this
        .getPool()
        .connect();

    try {
      await client.query(
        "BEGIN"
      );

      const currentResult =
        await client.query(
          `
            SELECT *
            FROM migration.domain_state
            WHERE organization_id = $1
              AND environment_id = $2
              AND domain = $3
            FOR UPDATE
          `,
          [
            scope.organizationId,
            scope.environmentId,
            domain,
          ]
        );

      if (
        currentResult
          .rowCount ===
        0
      ) {
        throw Object.assign(
          new Error(
            `Migration state not initialized for domain: ${domain}`
          ),
          {
            code:
              "MIGRATION_STATE_NOT_INITIALIZED",
          }
        );
      }

      const current =
        currentResult.rows[0];

      const result =
        await client.query(
          `
            UPDATE migration.domain_state
            SET
              phase = $4,

              read_backend =
                COALESCE(
                  $5,
                  read_backend
                ),

              shadow_reads_enabled =
                COALESCE(
                  $6,
                  shadow_reads_enabled
                ),

              backfill_complete =
                COALESCE(
                  $7,
                  backfill_complete
                ),

              verification_complete =
                COALESCE(
                  $8,
                  verification_complete
                ),

              cutover_complete =
                COALESCE(
                  $9,
                  cutover_complete
                ),

              rollback_allowed =
                COALESCE(
                  $10,
                  rollback_allowed
                ),

              started_at =
                COALESCE(
                  $11,
                  started_at
                ),

              backfill_completed_at =
                COALESCE(
                  $12,
                  backfill_completed_at
                ),

              verified_at =
                COALESCE(
                  $13,
                  verified_at
                ),

              cutover_at =
                COALESCE(
                  $14,
                  cutover_at
                ),

              rollback_deadline =
                COALESCE(
                  $15,
                  rollback_deadline
                ),

              last_error =
                $16,

              metadata =
                metadata ||
                COALESCE(
                  $17::jsonb,
                  '{}'::jsonb
                )

            WHERE organization_id = $1
              AND environment_id = $2
              AND domain = $3

            RETURNING *
          `,
          [
            scope.organizationId,
            scope.environmentId,
            domain,
            nextPhase,

            changes.readBackend ??
              null,

            changes.shadowReadsEnabled ??
              null,

            changes.backfillComplete ??
              null,

            changes.verificationComplete ??
              null,

            changes.cutoverComplete ??
              null,

            changes.rollbackAllowed ??
              null,

            changes.startedAt ??
              null,

            changes.backfillCompletedAt ??
              null,

            changes.verifiedAt ??
              null,

            changes.cutoverAt ??
              null,

            changes.rollbackDeadline ??
              null,

            changes.lastError ??
              null,

            JSON.stringify(
              changes.metadata ||
              {}
            ),
          ]
        );

      await this
        .appendHistory(
          scope,
          domain,
          {
            eventType:
              "phase_transition",

            previousPhase:
              current.phase,

            nextPhase,

            sourceBackend:
              current.source_backend,

            targetBackend:
              current.target_backend,

            details:
              changes,
          },
          {
            client,
          }
        );

      await client.query(
        "COMMIT"
      );

      return result.rows[0];
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

  async appendHistory(
    scope,
    domain,
    {
      eventType,
      previousPhase = null,
      nextPhase = null,
      sourceBackend = "mongo",
      targetBackend = "postgres",
      details = {},
    } = {},
    transaction = null
  ) {
    if (
      !eventType
    ) {
      throw Object.assign(
        new Error(
          "Migration history eventType is required"
        ),
        {
          code:
            "MIGRATION_HISTORY_EVENT_REQUIRED",
        }
      );
    }

    const executor =
      transaction?.client ||
      this.getPool();

    const result =
      await executor.query(
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
            $4,
            $5,
            $6,
            $7,
            $8,
            $9::jsonb
          )
          RETURNING *
        `,
        [
          scope.organizationId,
          scope.environmentId,
          domain,
          eventType,
          previousPhase,
          nextPhase,
          sourceBackend,
          targetBackend,
          JSON.stringify(
            details ||
            {}
          ),
        ]
      );

    return result.rows[0];
  }
}

module.exports =
  MigrationStateStore;