#!/usr/bin/env node
"use strict";

/**
 * Create test incident for Phase 16.8 certification
 */

require("dotenv").config({ path: ".env" });

const { getPostgresPool } = require("./persistence/postgres/postgresPool");
const { v4: uuidv4 } = require("uuid");

async function main() {
  const pool = getPostgresPool();

  try {
    console.log("Creating test incident for Phase 16.8 certification...");

    // Get organization and environment
    const orgResult = await pool.query(
      `SELECT id FROM tenancy.organizations WHERE public_id = 'aira-dev-org' LIMIT 1;`
    );

    if (orgResult.rows.length === 0) {
      throw new Error("Organization aira-dev-org not found");
    }

    const orgId = orgResult.rows[0].id;
    console.log(`Organization UUID: ${orgId}`);

    const envResult = await pool.query(
      `SELECT id FROM tenancy.environments WHERE public_id = 'env_aira_development' LIMIT 1;`
    );

    if (envResult.rows.length === 0) {
      throw new Error("Environment env_aira_development not found");
    }

    const envId = envResult.rows[0].id;
    console.log(`Environment UUID: ${envId}`);

    // Create incident
    const incidentId = uuidv4();
    const incidentPublicId = `inc_cert_${Date.now()}`;
    const now = new Date();

    const insertResult = await pool.query(
      `
      INSERT INTO incidents.incidents (
        id,
        public_id,
        organization_id,
        environment_id,
        status,
        severity,
        title,
        description,
        created_at,
        updated_at,
        closed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, public_id, status, closed_at;
      `,
      [
        incidentId,
        incidentPublicId,
        orgId,
        envId,
        "CLOSED",
        "high",
        "Test Incident for Phase 16.8 Certification",
        "This is a test incident created for episodic memory certification",
        now,
        now,
        now, // closed_at
      ]
    );

    const incident = insertResult.rows[0];
    console.log(`\n✓ Test incident created:`);
    console.log(`  id: ${incident.id}`);
    console.log(`  public_id: ${incident.public_id}`);
    console.log(`  status: ${incident.status}`);
    console.log(`  closed_at: ${incident.closed_at}`);

  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
