"use strict";

require("dotenv").config();

const {
  getPostgresConfig,
  buildPgPoolOptions,
} = require(
  "../config/postgres"
);

const {
  getPostgresPool,
  closePostgresPool,
} = require(
  "../persistence/postgres/postgresPool"
);

async function main() {
  const config =
    getPostgresConfig();

  const options =
    buildPgPoolOptions(
      config
    );

  console.log(
    "\n=============================================="
  );

  console.log(
    "AIRA POSTGRES CONNECTION DIAGNOSTIC"
  );

  console.log(
    "=============================================="
  );

  console.log(
    "\nAIRA resolved configuration:"
  );

  console.log({
    mode:
      config.connectionString
        ? "CONNECTION_STRING"
        : "INDIVIDUAL_FIELDS",

    enabled:
      config.enabled,

    host:
      config.host,

    port:
      config.port,

    database:
      config.database,

    user:
      config.user,

    ssl:
      config.ssl,
  });

  console.log(
    "\nPG pool target:"
  );

  console.log({
    host:
      options.host ||
      null,

    port:
      options.port ||
      null,

    database:
      options.database ||
      null,

    user:
      options.user ||
      null,

    usingConnectionString:
      Boolean(
        options.connectionString
      ),
  });

  const pool =
    getPostgresPool();

  const identity =
    await pool.query(`
      SELECT
        current_database()
          AS database,

        current_user
          AS username,

        inet_server_addr()::text
          AS server_address,

        inet_server_port()
          AS server_port,

        pg_postmaster_start_time()
          AS postmaster_started_at,

        version()
          AS postgres_version
    `);

  console.log(
    "\nActual server identity:"
  );

  console.log(
    identity.rows[0]
  );

  const databases =
    await pool.query(`
      SELECT
        datname
      FROM
        pg_database
      WHERE
        datistemplate = false
      ORDER BY
        datname
    `);

  console.log(
    "\nDatabases visible:"
  );

  console.table(
    databases.rows
  );

  const schemas =
    await pool.query(`
      SELECT
        schema_name
      FROM
        information_schema.schemata
      ORDER BY
        schema_name
    `);

  console.log(
    "\nSchemas BEFORE probe:"
  );

  console.table(
    schemas.rows
  );

  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS
      aira_connection_probe
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS
      aira_connection_probe.identity (
        id INTEGER PRIMARY KEY,
        marker TEXT NOT NULL,
        created_at TIMESTAMPTZ
          NOT NULL
          DEFAULT NOW()
      )
  `);

  await pool.query(`
    INSERT INTO
      aira_connection_probe.identity (
        id,
        marker
      )
    VALUES (
      1,
      'AIRA_NODE_CONNECTED_HERE'
    )
    ON CONFLICT (id)
    DO UPDATE SET
      marker =
        EXCLUDED.marker
  `);

  const probe =
    await pool.query(`
      SELECT
        id,
        marker,
        created_at
      FROM
        aira_connection_probe.identity
      WHERE
        id = 1
    `);

  console.log(
    "\n[OK] Connection probe created"
  );

  console.log(
    probe.rows[0]
  );
}

main()
  .catch(
    (error) => {
      console.error(
        "\n[postgres-target-diagnostic] FAILED:",
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