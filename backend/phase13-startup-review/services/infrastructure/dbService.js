"use strict";

/**
 * AIRA Database Service
 *
 * Phase 13 — PostgreSQL Primary Runtime
 *
 * Production runtime connects only to PostgreSQL.
 *
 * Provider-selection helpers are retained as PURE compatibility/control
 * functions for:
 *
 * - migration tooling
 * - retirement certification
 * - historical provider-selection tests
 *
 * They DO NOT create Mongo connections.
 */

const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../../persistence/postgres/postgresPool"
  );


const SUPPORTED_PROVIDERS =
  new Set([
    "mongo",
    "postgres",
  ]);


const MONGO_REQUIRED_MIGRATION_MODES =
  new Set([
    "shadow",
    "shadow-read",
    "shadow_read",
    "shadow-write",
    "shadow_write",
    "dual-read",
    "dual_read",
    "dual-write",
    "dual_write",
    "backfill-source",
    "backfill_source",
  ]);


const POSTGRES_REQUIRED_MIGRATION_MODES =
  new Set([
    "shadow",
    "shadow-read",
    "shadow_read",
    "shadow-write",
    "shadow_write",
    "dual-read",
    "dual_read",
    "dual-write",
    "dual_write",
    "backfill",
    "backfill-target",
    "backfill_target",
    "verify",
    "verification",
  ]);


let connected =
  false;

let connectedAt =
  null;


// ============================================================================
// PROVIDER / MIGRATION CONTROL HELPERS
// ============================================================================

function normalizeProvider(
  provider
) {
  const normalized =
    String(
      provider ||
      process.env
        .PERSISTENCE_PROVIDER ||
      "postgres"
    )
      .trim()
      .toLowerCase();


  if (
    !SUPPORTED_PROVIDERS
      .has(
        normalized
      )
  ) {
    throw Object.assign(
      new Error(
        `Unsupported persistence provider: ${normalized || "<empty>"}`
      ),
      {
        code:
          "UNSUPPORTED_PERSISTENCE_PROVIDER",

        provider:
          normalized ||
          null,
      }
    );
  }


  return normalized;
}


function normalizeMigrationMode(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      false
  ) {
    return "";
  }


  if (
    value ===
    true
  ) {
    return "shadow";
  }


  return String(
    value
  )
    .trim()
    .toLowerCase();
}


function resolveMigrationMode(
  options = {}
) {
  return normalizeMigrationMode(
    options.migrationMode ??
    options.mode ??
    options.migration ??
    options.shadowMode ??
    process.env
      .PERSISTENCE_MIGRATION_MODE ??
    process.env
      .MIGRATION_MODE ??
    ""
  );
}


/**
 * Determine whether a Mongo connection WOULD be required by the requested
 * provider/migration configuration.
 *
 * IMPORTANT:
 * This function does not import Mongoose and does not connect to MongoDB.
 */
function shouldConnectMongo(
  options = {}
) {
  const provider =
    normalizeProvider(
      options.provider
    );

  const migrationMode =
    resolveMigrationMode(
      options
    );


  if (
    provider ===
    "mongo"
  ) {
    return true;
  }


  if (
    MONGO_REQUIRED_MIGRATION_MODES
      .has(
        migrationMode
      )
  ) {
    return true;
  }


  /*
   * Explicit compatibility switches used by migration scripts.
   */
  if (
    options.requireMongo ===
      true ||
    options.mongoRequired ===
      true ||
    options.shadow ===
      true ||
    options.shadowRead ===
      true
  ) {
    return true;
  }


  return false;
}


/**
 * Determine whether PostgreSQL is required by the requested
 * provider/migration configuration.
 *
 * Pure function. Does not open a database connection.
 */
function shouldConnectPostgres(
  options = {}
) {
  const provider =
    normalizeProvider(
      options.provider
    );

  const migrationMode =
    resolveMigrationMode(
      options
    );


  if (
    provider ===
    "postgres"
  ) {
    return true;
  }


  if (
    POSTGRES_REQUIRED_MIGRATION_MODES
      .has(
        migrationMode
      )
  ) {
    return true;
  }


  if (
    options.requirePostgres ===
      true ||
    options.postgresRequired ===
      true ||
    options.backfill ===
      true ||
    options.verify ===
      true
  ) {
    return true;
  }


  return false;
}


// ============================================================================
// POSTGRESQL RUNTIME
// ============================================================================

async function connectDatabase() {
  if (
    connected ===
    true
  ) {
    return {
      provider:
        "postgres",

      connected:
        true,

      connectedAt,

      reused:
        true,
    };
  }


  /*
   * Phase 13 production runtime is PostgreSQL-only.
   *
   * Provider-selection helpers above remain only for migration certification
   * and tooling. They must never cause normal runtime Mongo startup.
   */
  const pool =
    getPostgresPool();


  try {
    const result =
      await pool.query(
        `
          SELECT
            current_database() AS database_name,
            current_user AS database_user,
            NOW() AS connected_at,
            version() AS server_version
        `
      );


    const row =
      result.rows[0] ||
      {};


    connected =
      true;

    connectedAt =
      row.connected_at ||
      new Date();


    console.log(
      [
        "[db]",
        "Connected to PostgreSQL",
        `database=${row.database_name || "unknown"}`,
        `user=${row.database_user || "unknown"}`,
      ].join(
        " | "
      )
    );


    return {
      provider:
        "postgres",

      connected:
        true,

      connectedAt,

      database:
        row.database_name ||
        null,

      user:
        row.database_user ||
        null,

      serverVersion:
        row.server_version ||
        null,

      reused:
        false,
    };
  } catch (
    error
  ) {
    connected =
      false;

    connectedAt =
      null;


    throw Object.assign(
      new Error(
        `PostgreSQL connection failed: ${error.message}`
      ),
      {
        code:
          error.code ||
          "POSTGRES_CONNECTION_FAILED",

        cause:
          error,
      }
    );
  }
}


async function disconnectDatabase() {
  if (
    connected !==
      true
  ) {
    return {
      provider:
        "postgres",

      disconnected:
        true,

      wasConnected:
        false,
    };
  }


  await closePostgresPool();


  connected =
    false;

  connectedAt =
    null;


  console.log(
    "[db] PostgreSQL connection pool closed"
  );


  return {
    provider:
      "postgres",

    disconnected:
      true,

    wasConnected:
      true,
  };
}


async function getDatabaseHealth() {
  try {
    const pool =
      getPostgresPool();

    const startedAt =
      Date.now();


    const result =
      await pool.query(
        `
          SELECT
            1 AS healthy,
            NOW() AS checked_at,
            current_database() AS database_name
        `
      );


    return {
      healthy:
        result.rows[0]
          ?.healthy ===
        1,

      provider:
        "postgres",

      database:
        result.rows[0]
          ?.database_name ||
        null,

      checkedAt:
        result.rows[0]
          ?.checked_at ||
        new Date(),

      latencyMs:
        Date.now() -
        startedAt,

      connected:
        true,
    };
  } catch (
    error
  ) {
    return {
      healthy:
        false,

      provider:
        "postgres",

      database:
        null,

      checkedAt:
        new Date(),

      latencyMs:
        null,

      connected:
        false,

      error: {
        code:
          error.code ||
          "POSTGRES_HEALTH_CHECK_FAILED",

        message:
          String(
            error.message ||
            "PostgreSQL health check failed"
          ),
      },
    };
  }
}


function isDatabaseConnected() {
  return (
    connected ===
    true
  );
}


function getDatabaseProvider() {
  return "postgres";
}


module.exports = {
  // Runtime
  connectDatabase,

  disconnectDatabase,

  getDatabaseHealth,

  isDatabaseConnected,

  getDatabaseProvider,


  // Migration/control compatibility
  normalizeProvider,

  normalizeMigrationMode,

  resolveMigrationMode,

  shouldConnectMongo,

  shouldConnectPostgres,
};