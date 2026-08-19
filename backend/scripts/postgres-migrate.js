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
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );

const PostgresMigrationRunner =
  require(
    "../persistence/postgres/PostgresMigrationRunner"
  );

async function main() {
  const config =
    getPostgresConfig();

  if (
    !config.enabled
  ) {
    throw Object.assign(
      new Error(
        "PostgreSQL migrations require POSTGRES_ENABLED=true"
      ),
      {
        code:
          "POSTGRES_DISABLED",
      }
    );
  }

  const runner =
    new PostgresMigrationRunner();

  const result =
    await runner
      .migrate();

  console.log(
    "[postgres-migration] Complete",
    result
  );
}

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "[postgres-migration] FAILED:",
        {
          code:
            error.code,

          message:
            error.message,

          migration:
            error.migration ||
            null,
        }
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