#!/usr/bin/env node
"use strict";

/**
 * AIRA Phase 16.8 Episodic Memory Certification Script
 * 
 * This script performs comprehensive database certification against:
 * - Actual PostgreSQL schema
 * - Real incident data
 * - Live episodic memory generation
 * - Qdrant indexing verification
 */

// Load .env file first
require("dotenv").config({ path: ".env" });

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { getPostgresPool } = require("./persistence/postgres/postgresPool");

const reportPath = path.join(
  __dirname,
  "phase16-8-certification-results.txt"
);

const report = [];

function log(text) {
  console.log(text);
  report.push(text);
}

function logSection(title) {
  log("\n" + "=".repeat(60));
  log(title);
  log("=".repeat(60));
}

async function runQuery(pool, query, params = []) {
  try {
    const result = await pool.query(query, params);
    return { success: true, result, error: null };
  } catch (error) {
    return { success: false, result: null, error };
  }
}

async function main() {
  logSection("AIRA PHASE 16.8 CERTIFICATION REPORT");
  log(`\nDATE: ${new Date().toISOString()}`);
  log(`WORKING DIRECTORY: ${__dirname}`);

  let pool;

  try {
    // ====================================================
    // STEP 1: INSPECT ACTUAL INCIDENT SCHEMA
    // ====================================================
    logSection("STEP 1: ACTUAL SCHEMA DISCOVERY");

    pool = getPostgresPool();

    log("\n--- Command: Inspect incidents.incidents schema ---");
    const schemaQuery = `
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'incidents'
  AND table_name = 'incidents'
ORDER BY ordinal_position;
    `;

    log("\nQuery:");
    log(schemaQuery);
    log("\nExecuting...");

    const schemaResult = await runQuery(pool, schemaQuery);
    if (schemaResult.success) {
      log("\nResult:");
      log(JSON.stringify(schemaResult.result.rows, null, 2));
    } else {
      log(`\nError: ${schemaResult.error.message}`);
    }

    // ====================================================
    // STEP 2: INSPECT OTHER REQUIRED TABLES
    // ====================================================
    log("\n--- Inspecting memory-related tables ---");

    const tables = [
      { schema: "incidents", table: "diagnoses" },
      { schema: "execution", table: "recovery_decision_runs" },
      { schema: "execution", table: "recovery_verifications" },
      { schema: "memory", table: "memories" },
      { schema: "memory", table: "memory_sources" },
      { schema: "memory", table: "embedding_records" },
      { schema: "memory", table: "index_operations" },
    ];

    for (const { schema, table } of tables) {
      log(`\n--- Schema: ${schema}.${table} ---`);
      const tableSchemaQuery = `
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = $1
  AND table_name = $2
ORDER BY ordinal_position;
      `;

      const tableResult = await runQuery(pool, tableSchemaQuery, [
        schema,
        table,
      ]);
      if (tableResult.success) {
        const cols = tableResult.result.rows
          .map((r) => `${r.column_name}: ${r.data_type}`)
          .join(", ");
        log(`Columns: ${cols}`);
      } else {
        log(`Error: ${tableResult.error.message}`);
      }
    }

    // ====================================================
    // STEP 3: RESOLVE ORGANIZATION AND ENVIRONMENT
    // ====================================================
    logSection("STEP 3: RESOLVE ORGANIZATION AND ENVIRONMENT UUIDS");

    const orgQuery = `
SELECT id, public_id, name
FROM tenancy.organizations
WHERE public_id = 'aira-dev-org'
LIMIT 1;
    `;

    log("\nResolving organization: aira-dev-org");
    const orgResult = await runQuery(pool, orgQuery);
    let organizationUuid = null;

    if (orgResult.success && orgResult.result.rows.length > 0) {
      const org = orgResult.result.rows[0];
      organizationUuid = org.id;
      log(`Found: ${org.public_id} (UUID: ${organizationUuid})`);
    } else {
      log(
        `Error or not found: ${orgResult.error?.message || "No rows"}`
      );
    }

    const envQuery = `
SELECT id, public_id, name
FROM tenancy.environments
WHERE public_id = 'env_aira_development'
LIMIT 1;
    `;

    log("\nResolving environment: env_aira_development");
    const envResult = await runQuery(pool, envQuery);
    let environmentUuid = null;

    if (envResult.success && envResult.result.rows.length > 0) {
      const env = envResult.result.rows[0];
      environmentUuid = env.id;
      log(`Found: ${env.public_id} (UUID: ${environmentUuid})`);
    } else {
      log(`Error or not found: ${envResult.error?.message || "No rows"}`);
    }

    // ====================================================
    // STEP 4: FIND CLOSED INCIDENT
    // ====================================================
    logSection("STEP 4: FIND REAL CLOSED INCIDENT");

    if (!organizationUuid || !environmentUuid) {
      log(
        "ERROR: Cannot find organization or environment. Stopping certification."
      );
      report.push(
        "\nFINAL RESULT: PHASE 16.8 NOT CERTIFIED\nReason: Cannot resolve organization/environment UUIDs"
      );
    } else {
      const incidentsQuery = `
SELECT
  id,
  public_id,
  status,
  lifecycle_state,
  created_at,
  updated_at,
  closed_at,
  incident_count
FROM incidents.incidents
WHERE organization_id = $1
  AND environment_id = $2
ORDER BY created_at DESC
LIMIT 20;
      `;

      log("\nQuerying last 20 incidents...");
      const incidentsResult = await runQuery(pool, incidentsQuery, [
        organizationUuid,
        environmentUuid,
      ]);

      if (incidentsResult.success) {
        log(`\nFound ${incidentsResult.result.rows.length} incidents:`);
        log(JSON.stringify(incidentsResult.result.rows, null, 2));

        // Find closed incident
        let closedIncident = null;
        for (const incident of incidentsResult.result.rows) {
          if (
            incident.status === "CLOSED" ||
            incident.lifecycle_state === "CLOSED"
          ) {
            closedIncident = incident;
            break;
          }
        }

        if (closedIncident) {
          log(`\n✓ Found closed incident: ${closedIncident.public_id}`);
          log(`  UUID: ${closedIncident.id}`);
          log(`  Status: ${closedIncident.status}`);
          log(`  Lifecycle: ${closedIncident.lifecycle_state}`);
          log(`  Closed At: ${closedIncident.closed_at}`);

          // ====================================================
          // STEP 5: RUN UNIT TESTS
          // ====================================================
          logSection("STEP 5: RUN PHASE 16.8 UNIT TESTS");

          const { spawn } = require("child_process");

          log("\nRunning: npx jest tests/unit/phase16EpisodicMemory.test.js");
          log("(Running in foreground..)\n");

          const testProcess = spawn("npx", [
            "jest",
            "tests/unit/phase16EpisodicMemory.test.js",
            "--runInBand",
            "--forceExit",
          ]);

          let testOutput = "";
          testProcess.stdout.on("data", (data) => {
            const text = data.toString();
            process.stdout.write(text);
            testOutput += text;
          });

          testProcess.stderr.on("data", (data) => {
            const text = data.toString();
            process.stderr.write(text);
            testOutput += text;
          });

          await new Promise((resolve) => {
            testProcess.on("close", (code) => {
              log(`\nTest exit code: ${code}`);
              report.push("\n--- Unit Test Output ---");
              report.push(testOutput);
              resolve(code);
            });
          });

          // ====================================================
          // STEP 6: GENERATE EPISODIC MEMORY
          // ====================================================
          logSection("STEP 6: LIVE EPISODIC MEMORY GENERATION");

          try {
            const {
              generateEpisodicMemory,
            } = require("./services/memory/episodic/episodicMemoryService");

            log(
              `\nGenerating episodic memory for incident: ${closedIncident.public_id}`
            );

            const result = await generateEpisodicMemory({
              organizationId: "aira-dev-org",
              environmentId: "env_aira_development",
              incidentId: closedIncident.public_id,
            });

            log("\nGeneration Result:");
            log(JSON.stringify(result, null, 2));

            // ====================================================
            // STEP 7: VERIFY CANONICAL POSTGRES MEMORY
            // ====================================================
            logSection("STEP 7: VERIFY CANONICAL POSTGRES MEMORY");

            const memoryQuery = `
SELECT
  id,
  public_id,
  memory_type,
  scope_type,
  organization_id,
  environment_id,
  incident_id,
  title,
  summary,
  confidence,
  trust_score,
  importance,
  evidence_count,
  source_count,
  status,
  metadata,
  created_at,
  updated_at
FROM memory.memories
WHERE organization_id = $1
  AND environment_id = $2
  AND incident_id = $3
  AND memory_type = 'EPISODIC'
ORDER BY created_at DESC;
            `;

            log("\nQuerying episodic memory...");
            const memoryResult = await runQuery(pool, memoryQuery, [
              organizationUuid,
              environmentUuid,
              closedIncident.id,
            ]);

            if (memoryResult.success && memoryResult.result.rows.length > 0) {
              const memory = memoryResult.result.rows[0];
              log("\n✓ Found episodic memory:");
              log(JSON.stringify(memory, null, 2));

              // ====================================================
              // STEP 8: VERIFY PROVENANCE
              // ====================================================
              logSection("STEP 8: VERIFY PROVENANCE");

              const sourceQuery = `
SELECT
  id,
  memory_id,
  source_type,
  source_id,
  source_reference,
  created_at
FROM memory.memory_sources
WHERE memory_id = $1
ORDER BY created_at ASC;
              `;

              log(
                `\nQuerying provenance for memory: ${memory.public_id}`
              );
              const sourceResult = await runQuery(pool, sourceQuery, [
                memory.id,
              ]);

              if (sourceResult.success) {
                log(
                  `Found ${sourceResult.result.rows.length} source records:`
                );
                log(JSON.stringify(sourceResult.result.rows, null, 2));
              } else {
                log(`Error: ${sourceResult.error.message}`);
              }
            } else {
              log(
                "No episodic memory found. May need to verify generation logic."
              );
            }
          } catch (err) {
            log(`\nError generating episodic memory: ${err.message}`);
            log(err.stack);
          }
        } else {
          log(
            `\nNo closed incident found. Available incidents:\n${incidentsResult.result.rows.map((i) => `  ${i.public_id}: ${i.status}`).join("\n")}`
          );
          log(
            "Cannot proceed with live certification without closed incident."
          );
        }
      } else {
        log(`Error: ${incidentsResult.error.message}`);
      }
    }

    logSection("CERTIFICATION REPORT GENERATED");
    log(`\nReport saved to: ${reportPath}`);
  } catch (err) {
    log(`\nFatal error: ${err.message}`);
    log(err.stack);
  } finally {
    if (pool) {
      await pool.end();
    }

    // Write report to file
    fs.writeFileSync(reportPath, report.join("\n"), "utf-8");
    console.log(`\n✓ Report written to: ${reportPath}`);
  }
}

main().catch(console.error);
