#!/usr/bin/env node
/**
 * Production Demo Tenant Seeder
 *
 * Creates or updates the demo tenant with credentials supplied via environment
 * variables.  Safe to run multiple times (idempotent).
 *
 * Required env vars:
 *   MONGODB_URI       — Atlas / production MongoDB connection string
 *   DEMO_TENANT_ID    — Tenant ID to create (default: "demo")
 *   DEMO_KEY_ID       — API key ID      (default: "demo-key-1")
 *   DEMO_API_SECRET   — Raw API secret  (REQUIRED — never hardcoded)
 *
 * Usage:
 *   DEMO_API_SECRET=<secret> node scripts/seed-production-demo.js
 *
 * Exits 0 on success, 1 on failure.
 */

"use strict";

require("dotenv").config();

const crypto = require("crypto");

const MONGODB_URI = process.env.MONGODB_URI;
const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID || "demo";
const DEMO_KEY_ID = process.env.DEMO_KEY_ID || "demo-key-1";
const DEMO_API_SECRET = process.env.DEMO_API_SECRET;

if (!MONGODB_URI) {
  process.stderr.write("[seed-production-demo] FATAL: MONGODB_URI is not set.\n");
  process.exit(1);
}
if (!DEMO_API_SECRET) {
  process.stderr.write("[seed-production-demo] FATAL: DEMO_API_SECRET is not set.\n");
  process.stderr.write("  Set it via environment variable — never hardcode it.\n");
  process.exit(1);
}
if (DEMO_API_SECRET.length < 32) {
  process.stderr.write("[seed-production-demo] FATAL: DEMO_API_SECRET must be at least 32 characters.\n");
  process.stderr.write("  Generate one: openssl rand -hex 32\n");
  process.exit(1);
}

const mongoose = require("mongoose");

async function run() {
  console.log("[seed-production-demo] Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  console.log("[seed-production-demo] Connected.");

  const TenantConfig = require("../models/TenantConfig");

  // Hash convention: same as seed-demo-tenant.js and authMiddleware
  const keyHash = crypto.createHmac("sha256", DEMO_API_SECRET).update(DEMO_KEY_ID).digest("hex");
  const secretHash = crypto.createHmac("sha256", DEMO_KEY_ID).update(DEMO_API_SECRET).digest("hex");

  const existing = await TenantConfig.findOne({ tenantId: DEMO_TENANT_ID });
  if (existing) {
    // Update API key hashes only — preserve other settings
    await TenantConfig.updateOne(
      { tenantId: DEMO_TENANT_ID },
      {
        $set: {
          "apiKeys.$[key].keyHash": keyHash,
          "apiKeys.$[key].secretHash": secretHash,
          "apiKeys.$[key].active": true,
          status: "active",
        },
      },
      { arrayFilters: [{ "key.keyId": DEMO_KEY_ID }] }
    );

    // If key didn't exist, push it
    const hasKey = existing.apiKeys.some((k) => k.keyId === DEMO_KEY_ID);
    if (!hasKey) {
      await TenantConfig.updateOne(
        { tenantId: DEMO_TENANT_ID },
        {
          $push: {
            apiKeys: {
              keyId: DEMO_KEY_ID,
              keyHash,
              secretHash,
              active: true,
              createdAt: new Date(),
              scopes: ["read:*", "write:*"],
            },
          },
        }
      );
      console.log("[seed-production-demo] ✓ API key added to existing tenant.");
    } else {
      console.log("[seed-production-demo] ✓ Existing tenant API key updated.");
    }
  } else {
    await TenantConfig.create({
      tenantId: DEMO_TENANT_ID,
      name: "Demo Tenant",
      status: "active",
      apiKeys: [
        {
          keyId: DEMO_KEY_ID,
          keyHash,
          secretHash,
          active: true,
          createdAt: new Date(),
          scopes: ["read:*", "write:*"],
        },
      ],
      settings: {
        maxEventsPerSecond: 1000,
        maxConcurrentIncidents: 50,
        maxConcurrentActions: 5,
        maxActionsPerHour: 20,
        auditRetentionDays: 365,
      },
      policyVersion: 1,
    });
    console.log("[seed-production-demo] ✓ Demo tenant created.");
  }

  console.log(`[seed-production-demo] ✓ Tenant ID : ${DEMO_TENANT_ID}`);
  console.log(`[seed-production-demo] ✓ Key ID    : ${DEMO_KEY_ID}`);
  console.log("[seed-production-demo] ✓ Secret    : [set via DEMO_API_SECRET — not printed]");
  console.log("[seed-production-demo] Done.");
}

run()
  .then(() => {
    mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    process.stderr.write(`[seed-production-demo] FATAL: ${err.message}\n`);
    mongoose.disconnect();
    process.exit(1);
  });
