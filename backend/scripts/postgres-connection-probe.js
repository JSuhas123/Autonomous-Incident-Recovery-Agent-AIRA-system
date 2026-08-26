"use strict";

require("dotenv").config();

const {
  getPostgresPool,
  closePostgresPool,
} = require(
  "../persistence/postgres"
);

async function main() {
  const pool =
    getPostgresPool();

  const result =
    await pool.query(`
      SELECT
        current_database() AS database,
        current_user AS username,
        inet_server_addr() AS server_address,
        inet_server_port() AS server_port
    `);

  console.log(
    "[postgres-probe] Node connected to:"
  );

  console.log(
    result.rows[0]
  );

  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS aira_connection_probe
  `);

  console.log(
    "[postgres-probe] PROBE CREATED"
  );
}

main()
  .catch(
    (error) => {
      console.error(
        "[postgres-probe] FAILED:",
        {
          code:
            error.code,

          message:
            error.message,

          stack:
            error.stack,
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