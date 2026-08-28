"use strict";

/**
 * AIRA Phase 18
 * Production Knowledge System
 * Live PostgreSQL Certification
 *
 * This script validates the REAL local PostgreSQL environment.
 *
 * It does not:
 * - mock PostgreSQL
 * - authorize execution
 * - fabricate tenant data
 * - mutate production knowledge
 */

require("dotenv").config();

const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../persistence/postgres"
  );


const ORGANIZATION_ID =
  process.env
    .PHASE18_CERT_ORGANIZATION_ID ||
  "aira-dev-org";


const ENVIRONMENT_ID =
  process.env
    .PHASE18_CERT_ENVIRONMENT_ID ||
  "env_aira_development";


const results = [];


function pass(
  name,
  details = null
) {
  results.push({
    name,
    status:
      "PASS",
    details,
  });

  console.log(
    `[PASS] ${name}`
  );

  if (details) {
    console.log(
      "       ",
      details
    );
  }
}


function fail(
  name,
  error
) {
  results.push({
    name,
    status:
      "FAIL",
    error:
      error.message,
  });

  console.error(
    `[FAIL] ${name}`
  );

  console.error(
    `       ${error.message}`
  );
}


async function check(
  name,
  fn
) {
  try {
    const details =
      await fn();

    pass(
      name,
      details
    );

    return details;
  } catch (
    error
  ) {
    fail(
      name,
      error
    );

    throw error;
  }
}


function assertRow(
  condition,
  message
) {
  if (!condition) {
    throw new Error(
      message
    );
  }
}


async function main() {
  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    "AIRA PHASE 18 LIVE POSTGRESQL CERTIFICATION"
  );
  console.log(
    "=============================================="
  );

  console.log(
    `Organization: ${ORGANIZATION_ID}`
  );

  console.log(
    `Environment:  ${ENVIRONMENT_ID}`
  );

  console.log("");

  const pool =
    getPostgresPool();

  const client =
    await pool.connect();

  try {
    // ================================================================
    // 1. REAL POSTGRESQL CONNECTION
    // ================================================================

    await check(
      "Real PostgreSQL connection",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                current_database()
                  AS database,
                current_user
                  AS username,
                version()
                  AS version
            `
          );

        assertRow(
          result.rowCount === 1,
          "Unable to read PostgreSQL server identity"
        );

        return {
          database:
            result.rows[0]
              .database,

          username:
            result.rows[0]
              .username,
        };
      }
    );


    // ================================================================
    // 2. RESOLVE ORGANIZATION
    // ================================================================

    const organization =
      await check(
        "Certification organization resolves",
        async () => {
          const result =
            await client.query(
              `
                SELECT
                  id,
                  public_id
                FROM
                  tenancy.organizations
                WHERE
                  public_id = $1
                LIMIT 1
              `,
              [
                ORGANIZATION_ID,
              ]
            );

          assertRow(
            result.rowCount === 1,
            `Organization not found: ${ORGANIZATION_ID}`
          );

          return result.rows[0];
        }
      );


    // ================================================================
    // 3. RESOLVE ENVIRONMENT
    // ================================================================

    const environment =
      await check(
        "Certification environment resolves",
        async () => {
          const result =
            await client.query(
              `
                SELECT
                  id,
                  public_id,
                  organization_id
                FROM
                  tenancy.environments
                WHERE
                  public_id = $1
                LIMIT 1
              `,
              [
                ENVIRONMENT_ID,
              ]
            );

          assertRow(
            result.rowCount === 1,
            `Environment not found: ${ENVIRONMENT_ID}`
          );

          return result.rows[0];
        }
      );


    await check(
      "Environment belongs to certification organization",
      async () => {
        assertRow(
          String(
            environment
              .organization_id
          ) ===
            String(
              organization.id
            ),
          "Certification environment belongs to a different organization"
        );

        return {
          organizationUuid:
            organization.id,

          environmentUuid:
            environment.id,
        };
      }
    );


    // ================================================================
    // 4. KNOWLEDGE SCHEMA
    // ================================================================

    await check(
      "knowledge schema exists",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                to_regnamespace(
                  'knowledge'
                )::text
                  AS schema_name
            `
          );

        assertRow(
          result.rows[0]
            ?.schema_name ===
            "knowledge",
          "knowledge schema does not exist"
        );

        return {
          schema:
            "knowledge",
        };
      }
    );


    // ================================================================
    // 5. CANONICAL KNOWLEDGE TABLES
    // ================================================================

    const knowledgeTables = [
      "knowledge.domains",
      "knowledge.failure_mode_definitions",
      "knowledge.failure_mode_versions",
      "knowledge.playbook_definitions",
      "knowledge.playbook_versions",
      "knowledge.runbook_definitions",
      "knowledge.runbook_versions",
    ];


    for (
      const table
      of knowledgeTables
    ) {
      await check(
        `Canonical table exists: ${table}`,
        async () => {
          const result =
            await client.query(
              `
                SELECT
                  to_regclass(
                    $1
                  )::text
                    AS relation
              `,
              [
                table,
              ]
            );

          assertRow(
            Boolean(
              result.rows[0]
                ?.relation
            ),
            `Missing canonical table: ${table}`
          );

          return {
            relation:
              result.rows[0]
                .relation,
          };
        }
      );
    }


    // ================================================================
    // 6. EXECUTION TABLES
    // ================================================================

    const executionTables = [
      "execution.playbook_executions",
      "execution.runbook_executions",
    ];


    for (
      const table
      of executionTables
    ) {
      await check(
        `Canonical execution table exists: ${table}`,
        async () => {
          const result =
            await client.query(
              `
                SELECT
                  to_regclass(
                    $1
                  )::text
                    AS relation
              `,
              [
                table,
              ]
            );

          assertRow(
            Boolean(
              result.rows[0]
                ?.relation
            ),
            `Missing execution table: ${table}`
          );

          return {
            relation:
              result.rows[0]
                .relation,
          };
        }
      );
    }


    // ================================================================
    // 7. CANONICAL KEYS
    // ================================================================

    await check(
      "Playbook canonical key is playbook_key",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                column_name
              FROM
                information_schema.columns
              WHERE
                table_schema =
                  'knowledge'
                AND
                table_name =
                  'playbook_definitions'
                AND
                column_name =
                  'playbook_key'
            `
          );

        assertRow(
          result.rowCount === 1,
          "knowledge.playbook_definitions.playbook_key missing"
        );

        return {
          column:
            "playbook_key",
        };
      }
    );


    await check(
      "Runbook canonical key is runbook_key",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                column_name
              FROM
                information_schema.columns
              WHERE
                table_schema =
                  'knowledge'
                AND
                table_name =
                  'runbook_definitions'
                AND
                column_name =
                  'runbook_key'
            `
          );

        assertRow(
          result.rowCount === 1,
          "knowledge.runbook_definitions.runbook_key missing"
        );

        return {
          column:
            "runbook_key",
        };
      }
    );


    // ================================================================
    // 8. VERSION CHECKSUMS
    // ================================================================

    for (
      const table
      of [
        "playbook_versions",
        "runbook_versions",
      ]
    ) {
      await check(
        `${table} retains immutable checksum`,
        async () => {
          const result =
            await client.query(
              `
                SELECT
                  column_name
                FROM
                  information_schema.columns
                WHERE
                  table_schema =
                    'knowledge'
                  AND
                  table_name =
                    $1
                  AND
                  column_name =
                    'checksum'
              `,
              [
                table,
              ]
            );

          assertRow(
            result.rowCount === 1,
            `knowledge.${table}.checksum missing`
          );

          return {
            checksum:
              true,
          };
        }
      );
    }


    // ================================================================
    // 9. TENANT OWNERSHIP COLUMNS
    // ================================================================

    for (
      const table
      of [
        "failure_mode_definitions",
        "playbook_definitions",
        "runbook_definitions",
      ]
    ) {
      await check(
        `${table} retains tenant ownership`,
        async () => {
          const result =
            await client.query(
              `
                SELECT
                  column_name
                FROM
                  information_schema.columns
                WHERE
                  table_schema =
                    'knowledge'
                  AND
                  table_name =
                    $1
                  AND
                  column_name IN (
                    'organization_id',
                    'environment_id'
                  )
              `,
              [
                table,
              ]
            );

          const columns =
            new Set(
              result.rows.map(
                (row) =>
                  row.column_name
              )
            );

          assertRow(
            columns.has(
              "organization_id"
            ),
            `${table}.organization_id missing`
          );

          assertRow(
            columns.has(
              "environment_id"
            ),
            `${table}.environment_id missing`
          );

          return {
            organizationScoped:
              true,

            environmentScoped:
              true,
          };
        }
      );
    }


    // ================================================================
    // 10. EXECUTION AUTHORIZATION DEFAULT
    // ================================================================

    await check(
      "Execution history defaults execution_authorized=false",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                table_name,
                column_default
              FROM
                information_schema.columns
              WHERE
                table_schema =
                  'execution'
                AND
                table_name IN (
                  'playbook_executions',
                  'runbook_executions'
                )
                AND
                column_name =
                  'execution_authorized'
              ORDER BY
                table_name
            `
          );

        assertRow(
          result.rowCount === 2,
          "execution_authorized missing from execution tables"
        );

        for (
          const row
          of result.rows
        ) {
          assertRow(
            String(
              row.column_default
            )
              .toLowerCase()
              .includes(
                "false"
              ),
            `${row.table_name}.execution_authorized does not default to false`
          );
        }

        return result.rows;
      }
    );


    // ================================================================
    // 11. PLAYBOOK → RUNBOOK EXECUTION LINEAGE
    // ================================================================

    await check(
      "Runbook execution schema supports parent Playbook lineage",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                column_name
              FROM
                information_schema.columns
              WHERE
                table_schema =
                  'execution'
                AND
                table_name =
                  'runbook_executions'
                AND
                column_name IN (
                  'playbook_execution_id',
                  'parent_playbook_execution_id'
                )
            `
          );

        assertRow(
          result.rowCount >= 1,
          "No parent Playbook execution lineage column found"
        );

        return {
          lineageColumn:
            result.rows[0]
              .column_name,
        };
      }
    );


    // ================================================================
    // 12. IMMUTABILITY TRIGGERS
    // ================================================================

    await check(
      "Knowledge version immutability triggers exist",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                event_object_table,
                trigger_name
              FROM
                information_schema.triggers
              WHERE
                trigger_schema =
                  'knowledge'
                AND
                event_object_table IN (
                  'playbook_versions',
                  'runbook_versions'
                )
            `
          );

        assertRow(
          result.rowCount >= 2,
          "Expected knowledge version integrity triggers were not found"
        );

        return {
          triggerCount:
            result.rowCount,
        };
      }
    );


    // ================================================================
    // 13. RLS PRESENT
    // ================================================================

    await check(
      "Knowledge tenant tables have RLS enabled",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                relname,
                relrowsecurity
              FROM
                pg_class
              JOIN
                pg_namespace
                ON
                  pg_namespace.oid =
                  pg_class.relnamespace
              WHERE
                pg_namespace.nspname =
                  'knowledge'
                AND
                relname IN (
                  'failure_mode_definitions',
                  'playbook_definitions',
                  'runbook_definitions'
                )
            `
          );

        assertRow(
          result.rowCount === 3,
          "Unable to inspect all knowledge definition tables"
        );

        const disabled =
          result.rows.filter(
            (row) =>
              row.relrowsecurity !==
              true
          );

        assertRow(
          disabled.length === 0,
          `RLS disabled on: ${disabled
            .map(
              (row) =>
                row.relname
            )
            .join(", ")}`
        );

        return {
          protectedTables:
            result.rows.map(
              (row) =>
                row.relname
            ),
        };
      }
    );


    // ================================================================
    // 14. CUSTOMER MONGODB DOMAIN SUPPORT
    // ================================================================

    await check(
      "Customer MongoDB knowledge remains supported",
      async () => {
        const result =
          await client.query(
            `
              SELECT
                domain_key
              FROM
                knowledge.domains
              WHERE
                domain_key =
                  'database.mongodb'
              LIMIT 1
            `
          );

        /**
         * Existing deployments may not yet have imported every
         * domain-pack row into PostgreSQL.
         *
         * Absence is reported accurately rather than fabricated.
         */
        if (
          result.rowCount === 0
        ) {
          return {
            imported:
              false,

            note:
              "database.mongodb domain not currently imported; code/domain-pack support remains separate",
          };
        }

        return {
          imported:
            true,

          domain:
            result.rows[0]
              .domain_key,
        };
      }
    );


    console.log("");
    console.log(
      "=============================================="
    );
    console.log(
      "PHASE 18 LIVE POSTGRESQL CERTIFICATION: PASS"
    );
    console.log(
      `Checks passed: ${results.filter(
        (item) =>
          item.status ===
          "PASS"
      ).length}`
    );
    console.log(
      "=============================================="
    );

    process.exitCode =
      0;
  } catch (
    error
  ) {
    console.error("");
    console.error(
      "=============================================="
    );
    console.error(
      "PHASE 18 LIVE POSTGRESQL CERTIFICATION: FAIL"
    );
    console.error(
      "=============================================="
    );

    console.error(
      error
    );

    process.exitCode =
      1;
  } finally {
    client.release();

    await closePostgresPool()
      .catch(
        () => {}
      );
  }
}


main()
  .catch(
    async (
      error
    ) => {
      console.error(
        "Phase 18 certification bootstrap failed:",
        error
      );

      process.exitCode =
        1;

      await closePostgresPool()
        .catch(
          () => {}
        );
    }
  );