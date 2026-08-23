"use strict";

const mongoose =
  require(
    "mongoose"
  );

const {
  checkPostgresHealth,
  closePostgresPool,
} =
  require(
    "../../persistence/postgres/postgresPool"
  );


// ============================================================================
// STATE
// ============================================================================

let memoryServer =
  null;

let activeBackend =
  null;


// ============================================================================
// CONFIG
// ============================================================================

function normalizeProvider(
  value
) {
  const provider =
    String(
      value ||
      "mongo"
    )
      .trim()
      .toLowerCase();

  if (
    ![
      "mongo",
      "postgres",
    ].includes(
      provider
    )
  ) {
    throw Object.assign(
      new Error(
        `Unsupported persistence provider: ${provider}`
      ),
      {
        code:
          "PERSISTENCE_PROVIDER_INVALID",
      }
    );
  }

  return provider;
}


function normalizeMigrationMode(
  value
) {
  return String(
    value ||
    "disabled"
  )
    .trim()
    .toLowerCase();
}


function shouldConnectMongo(
  {
    provider,
    migrationMode,
  }
) {
  /*
   * PostgreSQL-primary production runtime must be capable of starting
   * without MongoDB.
   *
   * Migration/backfill/shadow modes still need Mongo because Mongo is
   * either the migration source or the authoritative read side.
   */
  if (
    provider ===
      "mongo"
  ) {
    return true;
  }

  return [
    "backfill",
    "shadow",
    "verify",
  ].includes(
    migrationMode
  );
}


function shouldConnectPostgres(
  {
    provider,
    migrationMode,
  }
) {
  if (
    provider ===
      "postgres"
  ) {
    return true;
  }

  if (
    process.env
      .POSTGRES_ENABLED ===
    "true"
  ) {
    return true;
  }

  return [
    "backfill",
    "shadow",
    "verify",
    "cutover",
  ].includes(
    migrationMode
  );
}


// ============================================================================
// REDACTION
// ============================================================================

function redactUrl(
  url
) {
  try {
    const parsed =
      new URL(
        url
      );

    if (
      parsed.password
    ) {
      parsed.password =
        "***";
    }

    if (
      parsed.username
    ) {
      parsed.username =
        "***";
    }

    return parsed
      .toString();
  } catch {
    return "[redacted]";
  }
}


// ============================================================================
// MONGO
// ============================================================================

async function connectMongo() {
  if (
    mongoose.connection
      .readyState ===
    1
  ) {
    return {
      backend:
        "mongo",

      connected:
        true,

      reused:
        true,

      inMemory:
        Boolean(
          memoryServer
        ),
    };
  }

  const configuredUri =
    process.env
      .MONGODB_URI ||
    "mongodb://127.0.0.1:27017/autonomous_incident_agent";

  try {
    await mongoose
      .connect(
        configuredUri
      );

    console.log(
      `[db] Connected to MongoDB at ${redactUrl(configuredUri)}`
    );

    return {
      backend:
        "mongo",

      connected:
        true,

      reused:
        false,

      uri:
        configuredUri,

      inMemory:
        false,
    };
  } catch (
    error
  ) {
    /*
     * Never silently start an in-memory database in production.
     */
    if (
      process.env
        .NODE_ENV ===
        "production" ||
      process.env
        .DISABLE_MEMORY_DB ===
        "true"
    ) {
      throw error;
    }

    console.warn(
      "[db] Failed to connect to configured MongoDB URI. Falling back to in-memory MongoDB."
    );

    const {
      MongoMemoryServer,
    } =
      require(
        "mongodb-memory-server"
      );

    memoryServer =
      await MongoMemoryServer
        .create();

    const memoryUri =
      memoryServer
        .getUri(
          "autonomous_incident_agent"
        );

    await mongoose
      .connect(
        memoryUri
      );

    console.log(
      "[db] Connected to in-memory MongoDB instance"
    );

    return {
      backend:
        "mongo",

      connected:
        true,

      reused:
        false,

      uri:
        memoryUri,

      inMemory:
        true,
    };
  }
}


// ============================================================================
// POSTGRESQL
// ============================================================================

async function connectPostgres() {
  const health =
    await checkPostgresHealth();

  if (
    health?.healthy !==
    true
  ) {
    throw Object.assign(
      new Error(
        health?.error?.message ||
        "PostgreSQL health check failed"
      ),
      {
        code:
          health?.error?.code ||
          "POSTGRES_HEALTH_FAILED",

        health,
      }
    );
  }

  console.log(
    "[db] Connected to PostgreSQL"
  );

  return {
    backend:
      "postgres",

    connected:
      true,

    health,
  };
}


// ============================================================================
// MAIN CONNECT
// ============================================================================

async function connectDatabase() {
  const provider =
    normalizeProvider(
      process.env
        .PERSISTENCE_PROVIDER
    );

  const migrationMode =
    normalizeMigrationMode(
      process.env
        .MIGRATION_MODE
    );

  const mongoRequired =
    shouldConnectMongo({
      provider,
      migrationMode,
    });

  const postgresRequired =
    shouldConnectPostgres({
      provider,
      migrationMode,
    });

  const result = {
    provider,

    migrationMode,

    mongo: {
      required:
        mongoRequired,

      connected:
        false,
    },

    postgres: {
      required:
        postgresRequired,

      connected:
        false,
    },
  };

  /*
   * PostgreSQL-primary mode validates PostgreSQL first.
   *
   * AIRA must fail closed rather than quietly reverting to Mongo.
   */
  if (
    postgresRequired
  ) {
    result.postgres =
      {
        required:
          true,

        ...(
          await connectPostgres()
        ),
      };
  }

  if (
    mongoRequired
  ) {
    result.mongo =
      {
        required:
          true,

        ...(
          await connectMongo()
        ),
      };
  }

  activeBackend = {
    provider,

    migrationMode,

    mongoRequired,

    postgresRequired,
  };

  console.log(
    "[db] Persistence runtime:",
    {
      provider,

      migrationMode,

      mongo:
        result.mongo
          .connected,

      postgres:
        result.postgres
          .connected,
    }
  );

  return result;
}


// ============================================================================
// DISCONNECT
// ============================================================================

async function disconnectDatabase() {
  const errors = [];

  if (
    mongoose.connection
      .readyState !==
    0
  ) {
    try {
      await mongoose
        .disconnect();

      console.log(
        "[db] MongoDB disconnected"
      );
    } catch (
      error
    ) {
      errors.push(
        error
      );
    }
  }

  if (
    memoryServer
  ) {
    try {
      await memoryServer
        .stop();
    } catch (
      error
    ) {
      errors.push(
        error
      );
    } finally {
      memoryServer =
        null;
    }
  }

  /*
   * It is safe for server.js to also call closePostgresPool().
   * postgresPool.close is idempotent.
   */
  try {
    await closePostgresPool();
  } catch (
    error
  ) {
    errors.push(
      error
    );
  }

  activeBackend =
    null;

  if (
    errors.length >
    0
  ) {
    const error =
      new Error(
        "One or more database shutdown operations failed"
      );

    error.code =
      "DATABASE_SHUTDOWN_FAILED";

    error.causes =
      errors;

    throw error;
  }
}


// ============================================================================
// STATUS
// ============================================================================

function getDatabaseRuntimeStatus() {
  return {
    active:
      activeBackend
        ? {
            ...activeBackend,
          }
        : null,

    mongoReadyState:
      mongoose.connection
        .readyState,

    mongoConnected:
      mongoose.connection
        .readyState ===
      1,
  };
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  connectDatabase,

  disconnectDatabase,

  getDatabaseRuntimeStatus,

  normalizeProvider,

  normalizeMigrationMode,

  shouldConnectMongo,

  shouldConnectPostgres,
};