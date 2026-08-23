"use strict";

/**
 * AIRA PostgreSQL Optimization Service
 *
 * Phase 13 â€” Mongo Retirement
 *
 * Replaces the historical Mongo collection/index maintenance service.
 *
 * Responsibilities:
 *
 * - install safe PostgreSQL indexes
 * - refresh PostgreSQL planner statistics
 * - expose lightweight database metrics
 * - schedule periodic ANALYZE operations
 *
 * PostgreSQL VACUUM itself remains primarily managed by autovacuum.
 */

const {
  getPostgresPool,
} =
  require(
    "../../persistence/postgres/postgresPool"
  );


class DatabaseOptimizationService {
  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      null;

    this.intervalMs =
      Math.max(
        60000,
        Number(
          options.intervalMs ||
          process.env
            .POSTGRES_OPTIMIZATION_INTERVAL_MS ||
          30 * 60 * 1000
        )
      );

    this.periodicTimer =
      null;

    this.lastOptimizationAt =
      null;

    this.lastOptimizationResult =
      null;
  }


  getPool() {
    return (
      this.pool ||
      getPostgresPool()
    );
  }


  /**
   * Historical signature was:
   *
   *   createIndexes(legacyDatabaseHandle)
   *
   * The argument is deliberately ignored so existing callers remain safe
   * while server.js is migrated.
   */
  async createIndexes(
    _legacyDatabaseHandle = null
  ) {
    const pool =
      this.getPool();

    const statements = [
      `
        CREATE INDEX IF NOT EXISTS
          idx_operational_documents_domain_tenant
        ON operational.documents (
          domain,
          (document ->> 'tenantId')
        )
      `,

      `
        CREATE INDEX IF NOT EXISTS
          idx_operational_documents_domain_correlation
        ON operational.documents (
          domain,
          (document ->> 'correlationId')
        )
      `,

      `
        CREATE INDEX IF NOT EXISTS
          idx_operational_documents_domain_decision
        ON operational.documents (
          domain,
          (document ->> 'decisionId')
        )
      `,

      `
        CREATE INDEX IF NOT EXISTS
          idx_operational_documents_domain_action
        ON operational.documents (
          domain,
          (document ->> 'actionId')
        )
      `,

      `
        CREATE INDEX IF NOT EXISTS
          idx_operational_documents_domain_created
        ON operational.documents (
          domain,
          created_at DESC
        )
      `,

      `
        CREATE INDEX IF NOT EXISTS
          idx_operational_documents_domain_updated
        ON operational.documents (
          domain,
          updated_at DESC
        )
      `,

      `
        CREATE INDEX IF NOT EXISTS
          idx_operational_documents_org_domain_updated
        ON operational.documents (
          organization_id,
          domain,
          updated_at DESC
        )
      `,

      `
        CREATE INDEX IF NOT EXISTS
          idx_operational_documents_env_domain_updated
        ON operational.documents (
          environment_id,
          domain,
          updated_at DESC
        )
      `,
    ];

    const created = [];

    for (
      let index = 0;
      index <
        statements.length;
      index += 1
    ) {
      try {
        await pool.query(
          statements[
            index
          ]
        );

        created.push(
          index +
          1
        );
      } catch (
        error
      ) {
        /*
         * operational.documents may not exist in very early bootstrap
         * environments. Fail the startup optimization operation rather
         * than silently claiming the database was optimized.
         */
        throw Object.assign(
          new Error(
            `PostgreSQL index creation failed: ${error.message}`
          ),
          {
            code:
              error.code ||
              "POSTGRES_INDEX_CREATION_FAILED",

            statementNumber:
              index +
              1,

            cause:
              error,
          }
        );
      }
    }

    await this.analyze();

    console.log(
      `[database-optimization] PostgreSQL indexes verified (${created.length})`
    );

    return {
      provider:
        "postgres",

      indexesVerified:
        created.length,

      analyzed:
        true,

      executionAuthorized:
        false,
    };
  }


  /**
   * Refresh planner statistics.
   *
   * ANALYZE is intentionally used rather than aggressive manual VACUUM.
   * PostgreSQL autovacuum remains responsible for normal tuple cleanup.
   */
  async analyze() {
    const pool =
      this.getPool();

    const tables = [
      "operational.documents",

      "incidents.incidents",

      "incidents.incident_events",

      "agents.intelligence_runs",
    ];

    const analyzed = [];

    for (
      const table
      of tables
    ) {
      try {
        await pool.query(
          `ANALYZE ${table}`
        );

        analyzed.push(
          table
        );
      } catch (
        error
      ) {
        /*
         * Some installations may not yet contain every optional domain.
         *
         * Undefined-table is safe to ignore during rolling migrations.
         */
        if (
          error.code ===
          "42P01"
        ) {
          continue;
        }

        throw error;
      }
    }

    return {
      analyzed,
    };
  }


  /**
   * One complete optimization cycle.
   */
  async optimizeNow() {
    const startedAt =
      Date.now();

    try {
      const analysis =
        await this.analyze();

      const metrics =
        await this.getDatabaseMetrics();

      const result = {
        success:
          true,

        provider:
          "postgres",

        durationMs:
          Date.now() -
          startedAt,

        analyzed:
          analysis.analyzed,

        metrics,

        completedAt:
          new Date(),

        executionAuthorized:
          false,
      };

      this.lastOptimizationAt =
        result.completedAt;

      this.lastOptimizationResult =
        result;

      return result;
    } catch (
      error
    ) {
      const result = {
        success:
          false,

        provider:
          "postgres",

        durationMs:
          Date.now() -
          startedAt,

        completedAt:
          new Date(),

        error: {
          code:
            error.code ||
            "POSTGRES_OPTIMIZATION_FAILED",

          message:
            String(
              error.message ||
              "PostgreSQL optimization failed"
            ),
        },

        executionAuthorized:
          false,
      };

      this.lastOptimizationAt =
        result.completedAt;

      this.lastOptimizationResult =
        result;

      throw Object.assign(
        new Error(
          result.error.message
        ),
        {
          code:
            result.error.code,

          optimizationResult:
            result,
        }
      );
    }
  }


  /**
   * PostgreSQL database metrics.
   */
  async getDatabaseMetrics() {
    const pool =
      this.getPool();

    const [
      databaseResult,
      activityResult,
      tableResult,
    ] =
      await Promise.all([
        pool.query(
          `
            SELECT
              current_database() AS database_name,
              pg_database_size(
                current_database()
              ) AS database_size_bytes
          `
        ),

        pool.query(
          `
            SELECT
              COUNT(*)::int AS total_connections,
              COUNT(*) FILTER (
                WHERE state = 'active'
              )::int AS active_connections,
              COUNT(*) FILTER (
                WHERE state = 'idle'
              )::int AS idle_connections
            FROM pg_stat_activity
            WHERE datname =
              current_database()
          `
        ),

        pool.query(
          `
            SELECT
              schemaname,
              relname AS table_name,
              n_live_tup::bigint AS estimated_live_rows,
              n_dead_tup::bigint AS estimated_dead_rows,
              last_analyze,
              last_autoanalyze,
              last_vacuum,
              last_autovacuum
            FROM pg_stat_user_tables
            ORDER BY n_live_tup DESC
            LIMIT 100
          `
        ),
      ]);

    return {
      provider:
        "postgres",

      database:
        databaseResult.rows[0]
          ?.database_name ||
        null,

      databaseSizeBytes:
        Number(
          databaseResult.rows[0]
            ?.database_size_bytes ||
          0
        ),

      connections: {
        total:
          activityResult.rows[0]
            ?.total_connections ||
          0,

        active:
          activityResult.rows[0]
            ?.active_connections ||
          0,

        idle:
          activityResult.rows[0]
            ?.idle_connections ||
          0,
      },

      tables:
        tableResult.rows,

      collectedAt:
        new Date(),
    };
  }


  /**
   * Compatibility alias for older monitoring consumers.
   */
  async getMetrics() {
    return this.getDatabaseMetrics();
  }


  /**
   * Mongo compact() no longer has a PostgreSQL equivalent that should be
   * routinely invoked by the application.
   *
   * Run ANALYZE and let autovacuum own storage maintenance.
   */
  async compactCollections() {
    const result =
      await this.analyze();

    return {
      provider:
        "postgres",

      compacted:
        false,

      maintenance:
        "postgres-autovacuum",

      analyzed:
        result.analyzed,

      executionAuthorized:
        false,
    };
  }


  /**
   * Compatibility alias.
   */
  async compactDatabase() {
    return this.compactCollections();
  }


  /**
   * Data expiry now belongs to retention services / PostgreSQL retention
   * policies rather than Mongo TTL index behavior.
   */
  async archiveOldData() {
    return {
      provider:
        "postgres",

      archived:
        0,

      delegated:
        true,

      owner:
        "retentionService",

      executionAuthorized:
        false,
    };
  }


  startPeriodicOptimization() {
    if (
      this.periodicTimer
    ) {
      return this.periodicTimer;
    }

    this.periodicTimer =
      setInterval(
        async () => {
          try {
            await this.optimizeNow();

            console.log(
              "[database-optimization] PostgreSQL optimization cycle completed"
            );
          } catch (
            error
          ) {
            console.error(
              "[database-optimization] PostgreSQL optimization cycle failed:",
              error.message
            );
          }
        },
        this.intervalMs
      );

    /*
     * Never keep Node alive solely because of this maintenance timer.
     */
    if (
      typeof this.periodicTimer
        .unref ===
      "function"
    ) {
      this.periodicTimer
        .unref();
    }

    console.log(
      `[database-optimization] PostgreSQL optimization scheduled every ${this.intervalMs}ms`
    );

    return this.periodicTimer;
  }


  stopPeriodicOptimization() {
    if (
      !this.periodicTimer
    ) {
      return false;
    }

    clearInterval(
      this.periodicTimer
    );

    this.periodicTimer =
      null;

    return true;
  }


  getStatus() {
    return {
      provider:
        "postgres",

      periodicOptimization:
        Boolean(
          this.periodicTimer
        ),

      intervalMs:
        this.intervalMs,

      lastOptimizationAt:
        this.lastOptimizationAt,

      lastOptimizationResult:
        this.lastOptimizationResult,

      executionAuthorized:
        false,
    };
  }
}


module.exports =
  new DatabaseOptimizationService();

module.exports
  .DatabaseOptimizationService =
  DatabaseOptimizationService;

