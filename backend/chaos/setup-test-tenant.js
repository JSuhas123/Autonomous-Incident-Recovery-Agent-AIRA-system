#!/usr/bin/env node

/**
 * Setup Test Tenant for Chaos Testing
 * 
 * Creates or updates the test tenant and API credentials required for chaos tests
 * Run this ONCE before running chaos tests: node setup-test-tenant.js
 */

const crypto = require('crypto');
const { connectDatabase, disconnectDatabase } = require('../services/infrastructure/dbService');
const TenantConfig = require('../models/TenantConfig');

const TEST_TENANT_ID = 'chaos-test-tenant';
const TEST_KEY_ID = 'chaos-key';
const TEST_SECRET = 'chaos-secret';

async function setupTestTenant() {
  try {
    console.log('[Setup] Connecting to database...');
    await connectDatabase();

    console.log(`[Setup] Creating/updating test tenant: ${TEST_TENANT_ID}`);
    
    const keyHash = crypto
      .createHmac('sha256', TEST_SECRET || '')
      .update(TEST_KEY_ID)
      .digest('hex');

    const tenantData = {
      tenantId: TEST_TENANT_ID,
      name: 'Chaos Testing Tenant',
      status: 'active',
      apiKeys: [
        {
          keyId: TEST_KEY_ID,
          keyHash,
          active: true,
          createdAt: new Date(),
          description: 'Auto-generated test key for chaos testing',
        },
      ],
      config: {
        maxDecisionsPerHour: 100000,
        enableFeedback: true,
        enableSimulation: true,
        enableCascadeDetection: true,
      },
    };

    const tenant = await TenantConfig.findOneAndUpdate(
      { tenantId: TEST_TENANT_ID },
      tenantData,
      { upsert: true, new: true }
    );

    console.log('\n[Setup] ✓ Test Tenant Created/Updated');
    console.log(`  Tenant ID:  ${tenant.tenantId}`);
    console.log(`  Status:     ${tenant.status}`);
    console.log(`  Key ID:     ${TEST_KEY_ID}`);
    console.log(`  Secret:     ${TEST_SECRET}`);
    console.log(`  Key Hash:   ${keyHash.substring(0, 16)}...`);

    console.log('\n[Setup] Configuration for chaos tests:');
    console.log(`  tenantId: '${TEST_TENANT_ID}'`);
    console.log(`  Authorization: Bearer ${TEST_KEY_ID}:${TEST_SECRET}`);
    console.log(
      `  X-Timestamp: <current timestamp in ms>`
    );
    console.log(`  X-Idempotency-Key: <unique request id>`);

    console.log('\n[Setup] ✓ Ready to run chaos tests!');
    console.log(
      'Run: node run-chaos-tests.js\n'
    );

    await disconnectDatabase();
    process.exit(0);
  } catch (error) {
    console.error('[Setup] ✗ Error setting up test tenant:');
    console.error(error.message);
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  }
}

setupTestTenant();
