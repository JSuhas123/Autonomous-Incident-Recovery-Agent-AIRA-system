"use strict";

/**
 * AIRA PostgreSQL Pool
 *
 * Phase 13.2
 *
 * Responsibilities:
 *
 * - lazy connection pool creation
 * - bounded pool configuration
 * - health probing
 * - query execution
 * - connection statistics
 * - graceful shutdown
 *
 * IMPORTANT:
 *
 * Importing this module must NOT automatically connect to PostgreSQL.
 */

const {
  Pool,
} =
  require(
    "pg"
  );

const {
  getPostgresConfig,
  buildPgPoolOptions,
} =
  require(
    "../../config/postgres"
  );

let pool =
  null;

let closing =
  false;

function getPostgresPool() {
  if (
    pool
  ) {
    return pool;
  }

  if (
    closing
  ) {
    throw Object.assign(
      new Error(
        "PostgreSQL pool is shutting down"
      ),
      {
        code:
          "POSTGRES_POOL_CLOSING",
      }
    );
  }

  const config =
    getPostgresConfig();

  if (
    !config.enabled
  ) {
    throw Object.assign(
      new Error(
        "PostgreSQL is not enabled"
      ),
      {
        code:
          "POSTGRES_DISABLED",
      }
    );
  }

  pool =
    new Pool(
      buildPgPoolOptions(
        config
      )
    );

  pool.on(
    "error",
    (
      error
    ) => {
      console.error(
        "[postgres] Unexpected idle client error:",
        error
      );
    }
  );

  return pool;
}

async function query(
  text,
  params = []
) {
  if (
    typeof text !==
      "string" ||
    text.trim() ===
      ""
  ) {
    throw Object.assign(
      new Error(
        "PostgreSQL query text is required"
      ),
      {
        code:
          "POSTGRES_QUERY_REQUIRED",
      }
    );
  }

  const activePool =
    getPostgresPool();

  return activePool
    .query(
      text,
      params
    );
}

async function checkPostgresHealth() {
  const startedAt =
    Date.now();

  try {
    const result =
      await query(
        `
          SELECT
            1 AS ok,
            current_database() AS database,
            current_user AS username,
            version() AS version,
            NOW() AS server_time
        `
      );

    const activePool =
      getPostgresPool();

    return {
      healthy:
        true,

      latencyMs:
        Date.now() -
        startedAt,

      database:
        result.rows[0]
          ?.database ||
        null,

      username:
        result.rows[0]
          ?.username ||
        null,

      serverTime:
        result.rows[0]
          ?.server_time ||
        null,

      version:
        result.rows[0]
          ?.version ||
        null,

      pool:
        getPoolStats(
          activePool
        ),
    };
  } catch (
    error
  ) {
    return {
      healthy:
        false,

      latencyMs:
        Date.now() -
        startedAt,

      error: {
        code:
          error.code ||
          "POSTGRES_HEALTH_FAILED",

        message:
          error.message,
      },

      pool:
        pool
          ? getPoolStats(
              pool
            )
          : null,
    };
  }
}

function getPoolStats(
  targetPool =
    pool
) {
  if (
    !targetPool
  ) {
    return {
      initialized:
        false,

      total:
        0,

      idle:
        0,

      waiting:
        0,
    };
  }

  return {
    initialized:
      true,

    total:
      targetPool
        .totalCount,

    idle:
      targetPool
        .idleCount,

    waiting:
      targetPool
        .waitingCount,
  };
}

async function closePostgresPool() {
  if (
    !pool
  ) {
    return {
      closed:
        false,

      reason:
        "NOT_INITIALIZED",
    };
  }

  if (
    closing
  ) {
    return {
      closed:
        false,

      reason:
        "ALREADY_CLOSING",
    };
  }

  closing =
    true;

  const activePool =
    pool;

  pool =
    null;

  try {
    await activePool
      .end();

    console.log(
      "[postgres] Connection pool closed"
    );

    return {
      closed:
        true,
    };
  } finally {
    closing =
      false;
  }
}

/**
 * Test-only reset.
 */
function resetPostgresPoolForTests() {
  pool =
    null;

  closing =
    false;
}

module.exports = {
  getPostgresPool,

  query,

  checkPostgresHealth,

  getPoolStats,

  closePostgresPool,

  resetPostgresPoolForTests,
};