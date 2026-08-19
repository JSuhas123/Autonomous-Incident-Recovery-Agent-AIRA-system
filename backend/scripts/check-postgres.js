"use strict";

require(
  "dotenv"
)
  .config();

const {
  getPostgresConfig,
} =
  require(
    "../config/postgres"
  );

const {
  checkPostgresHealth,
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );

async function main() {
  const config =
    getPostgresConfig();

  if (
    !config.enabled
  ) {
    console.error(
      "[postgres-check] PostgreSQL is disabled. Set POSTGRES_ENABLED=true."
    );

    process.exitCode =
      1;

    return;
  }

  const health =
    await checkPostgresHealth();

  if (
    !health.healthy
  ) {
    console.error(
      "[postgres-check] PostgreSQL unhealthy",
      health
    );

    process.exitCode =
      1;

    return;
  }

  console.log(
    "[postgres-check] ✓ PostgreSQL healthy",
    {
      database:
        health.database,

      username:
        health.username,

      latencyMs:
        health.latencyMs,

      pool:
        health.pool,
    }
  );
}

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "[postgres-check] FAILED:",
        error
      );

      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      await closePostgresPool()
        .catch(
          () => {}
        );
    }
  );