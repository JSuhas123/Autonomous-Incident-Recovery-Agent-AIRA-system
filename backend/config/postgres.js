"use strict";

/**
 * AIRA PostgreSQL Configuration
 *
 * Phase 13.2 — PostgreSQL Foundation
 *
 * PostgreSQL is intentionally disabled by default during the
 * migration foundation stage.
 *
 * Enable with:
 *
 * POSTGRES_ENABLED=true
 *
 * Supported connection modes:
 *
 * 1. DATABASE_URL / POSTGRES_URL
 *
 * OR
 *
 * 2. POSTGRES_HOST
 *    POSTGRES_PORT
 *    POSTGRES_DATABASE
 *    POSTGRES_USER
 *    POSTGRES_PASSWORD
 */

function parseBoolean(
  value,
  fallback = false
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  return [
    "1",
    "true",
    "yes",
    "on",
  ].includes(
    String(
      value
    )
      .trim()
      .toLowerCase()
  );
}

function parseInteger(
  value,
  fallback,
  {
    minimum = 0,
    maximum =
      Number.MAX_SAFE_INTEGER,
  } = {}
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
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      parsed
    )
  );
}

function getPostgresConfig(
  env = process.env
) {
  const enabled =
    parseBoolean(
      env.POSTGRES_ENABLED,
      false
    );

  const connectionString =
    env.DATABASE_URL ||
    env.POSTGRES_URL ||
    null;

  const sslEnabled =
    parseBoolean(
      env.POSTGRES_SSL,
      env.NODE_ENV ===
        "production"
    );

  const sslRejectUnauthorized =
    parseBoolean(
      env
        .POSTGRES_SSL_REJECT_UNAUTHORIZED,
      true
    );

  const config = {
    enabled,

    connectionString,

    host:
      env.POSTGRES_HOST ||
      "127.0.0.1",

    port:
      parseInteger(
        env.POSTGRES_PORT,
        5432,
        {
          minimum:
            1,

          maximum:
            65535,
        }
      ),

    database:
      env.POSTGRES_DATABASE ||
      "aira",

    user:
      env.POSTGRES_USER ||
      "aira",

    password:
      env.POSTGRES_PASSWORD ||
      "",

    applicationName:
      env
        .POSTGRES_APPLICATION_NAME ||
      "aira-backend",

    pool: {
      min:
        parseInteger(
          env.POSTGRES_POOL_MIN,
          0,
          {
            minimum:
              0,

            maximum:
              100,
          }
        ),

      max:
        parseInteger(
          env.POSTGRES_POOL_MAX,
          20,
          {
            minimum:
              1,

            maximum:
              200,
          }
        ),

      idleTimeoutMs:
        parseInteger(
          env.POSTGRES_IDLE_TIMEOUT_MS,
          30000,
          {
            minimum:
              1000,
          }
        ),

      connectionTimeoutMs:
        parseInteger(
          env
            .POSTGRES_CONNECTION_TIMEOUT_MS,
          5000,
          {
            minimum:
              100,
          }
        ),

      statementTimeoutMs:
        parseInteger(
          env.POSTGRES_STATEMENT_TIMEOUT_MS,
          30000,
          {
            minimum:
              100,
          }
        ),

      queryTimeoutMs:
        parseInteger(
          env.POSTGRES_QUERY_TIMEOUT_MS,
          30000,
          {
            minimum:
              100,
          }
        ),
    },

    ssl: {
      enabled:
        sslEnabled,

      rejectUnauthorized:
        sslRejectUnauthorized,
    },

    migration: {
      lockId:
        parseInteger(
          env.POSTGRES_MIGRATION_LOCK_ID,
          1302001,
          {
            minimum:
              1,

            maximum:
              2147483647,
          }
        ),
    },
  };

  validatePostgresConfig(
    config
  );

  return config;
}

function validatePostgresConfig(
  config
) {
  if (
    !config.enabled
  ) {
    return true;
  }

  if (
    !config.connectionString
  ) {
    const required = [
      [
        "host",
        config.host,
      ],

      [
        "database",
        config.database,
      ],

      [
        "user",
        config.user,
      ],
    ];

    for (
      const [
        field,
        value,
      ]
      of required
    ) {
      if (!value) {
        throw Object.assign(
          new Error(
            `PostgreSQL configuration requires ${field}`
          ),
          {
            code:
              "POSTGRES_CONFIG_INVALID",

            field,
          }
        );
      }
    }
  }

  if (
    config.pool.min >
    config.pool.max
  ) {
    throw Object.assign(
      new Error(
        "POSTGRES_POOL_MIN cannot exceed POSTGRES_POOL_MAX"
      ),
      {
        code:
          "POSTGRES_POOL_CONFIG_INVALID",
      }
    );
  }

  return true;
}

function buildPgPoolOptions(
  config =
    getPostgresConfig()
) {
  const common = {
    application_name:
      config.applicationName,

    max:
      config.pool.max,

    idleTimeoutMillis:
      config.pool
        .idleTimeoutMs,

    connectionTimeoutMillis:
      config.pool
        .connectionTimeoutMs,

    statement_timeout:
      config.pool
        .statementTimeoutMs,

    query_timeout:
      config.pool
        .queryTimeoutMs,

    ssl:
      config.ssl.enabled
        ? {
            rejectUnauthorized:
              config.ssl
                .rejectUnauthorized,
          }
        : false,
  };

  if (
    config.connectionString
  ) {
    return {
      ...common,

      connectionString:
        config.connectionString,
    };
  }

  return {
    ...common,

    host:
      config.host,

    port:
      config.port,

    database:
      config.database,

    user:
      config.user,

    password:
      config.password,
  };
}

module.exports = {
  getPostgresConfig,

  validatePostgresConfig,

  buildPgPoolOptions,

  parseBoolean,

  parseInteger,
};