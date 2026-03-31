#!/usr/bin/env node

/**
 * Pre-Chaos Testing Validation Script
 * 
 * Validates that all components are ready for chaos testing:
 * 1. Database connectivity
 * 2. Test tenant exists
 * 3. Required models exist
 * 4. API endpoints respond
 * 5. Authentication works
 * 6. Decision tracing works
 */

const axios = require('axios');
const crypto = require('crypto');
const { connectDatabase, disconnectDatabase } = require('../services/dbService');
const TenantConfig = require('../models/TenantConfig');
const DecisionTrace = require('../models/DecisionTrace');

const TENANT_ID = 'chaos-test-tenant';
const KEY_ID = 'chaos-key';
const SECRET = 'chaos-secret';
const BASE_URL = 'http://localhost:5000';

const CHECKS = {
  passed: [],
  failed: [],
};

function logSuccess(message) {
  console.log(`✓ ${message}`);
  CHECKS.passed.push(message);
}

function logError(message) {
  console.error(`✗ ${message}`);
  CHECKS.failed.push(message);
}

function logWarn(message) {
  console.warn(`⚠ ${message}`);
}

async function check1_DatabaseConnection() {
  console.log('\n[Check 1] Database Connectivity');
  try {
    await connectDatabase();
    logSuccess('MongoDB connection established');
    return true;
  } catch (error) {
    logError(`MongoDB connection failed: ${error.message}`);
    return false;
  }
}

async function check2_TestTenantExists() {
  console.log('\n[Check 2] Test Tenant Exists');
  try {
    const tenant = await TenantConfig.findOne({ tenantId: TENANT_ID });
    if (!tenant) {
      logError(`Test tenant "${TENANT_ID}" not found in database`);
      logWarn('Run setup-test-tenant.js first: node setup-test-tenant.js');
      return false;
    }
    
    logSuccess(`Test tenant "${TENANT_ID}" exists`);
    
    const apiKey = tenant.apiKeys.find(k => k.keyId === KEY_ID);
    if (!apiKey) {
      logError(`API key "${KEY_ID}" not found in tenant`);
      return false;
    }
    
    logSuccess(`API key "${KEY_ID}" exists and is active=${apiKey.active}`);
    return true;
  } catch (error) {
    logError(`Failed to check tenant: ${error.message}`);
    return false;
  }
}

async function check3_DecisionTraceSchema() {
  console.log('\n[Check 3] DecisionTrace Model');
  try {
    const testTrace = new DecisionTrace({
      decisionId: crypto.randomUUID(),
      tenantId: TENANT_ID,
      correlationId: crypto.randomUUID(),
      inputs: {
        signals: {
          errorRate: 0.5,
          responseTime: 1000,
          affectedServices: ['service1'],
          logSample: [],
        },
        severity: 'MEDIUM',
        confidence: 0.8,
      },
      explanation: {
        decision: 'test',
        reasoning: 'validation test',
        confidence: {
          score: 0.8,
          factors: ['test'],
        },
        policiesApplied: [],
      },
    });

    // Validate schema without saving
    await testTrace.validate();
    logSuccess('DecisionTrace schema is valid');
    return true;
  } catch (error) {
    logError(`DecisionTrace schema validation failed: ${error.message}`);
    return false;
  }
}

async function check4_ServerHealthCheck() {
  console.log('\n[Check 4] API Server Health');
  try {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 3000 });
    if (response.status === 200) {
      logSuccess(`API server is healthy at ${BASE_URL}`);
      return true;
    } else {
      logError(`API server health check returned status ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Cannot connect to API server at ${BASE_URL}: ${error.message}`);
    logWarn(`Start server: cd backend && node server.js`);
    return false;
  }
}

function hashWithSecret(value, secret) {
  return crypto
    .createHmac('sha256', secret || '')
    .update(value)
    .digest('hex');
}

async function check5_AuthenticationFlow() {
  console.log('\n[Check 5] Authentication Flow');
  try {
    const timestamp = Date.now().toString();
    const testSignal = {
      signalType: 'validation-test',
      errorRate: 0.1,
      responseTime: 100,
      severity: 'MEDIUM',
      confidence: 0.9,
    };

    const bodyString = JSON.stringify(testSignal);
    const messageToSign = bodyString + timestamp;
    const signature = hashWithSecret(messageToSign, SECRET);

    const response = await axios.post(
      `${BASE_URL}/api/v1/tenants/${TENANT_ID}/signals`,
      testSignal,
      {
        headers: {
          Authorization: `Bearer ${KEY_ID}:${SECRET}`,
          'X-Timestamp': timestamp,
          'X-Idempotency-Key': crypto.randomUUID(),
          'X-Signature': signature,
        },
        timeout: 5000,
      }
    );

    if (response.status === 200 && response.data.success) {
      logSuccess('Authentication flow works correctly');
      logSuccess(`Signal accepted with decisionId: ${response.data.decisionId}`);
      return { success: true, decisionId: response.data.decisionId };
    } else {
      logError(`Unexpected response: ${response.status}`);
      return { success: false };
    }
  } catch (error) {
    logError(`Authentication test failed: ${error.message}`);
    if (error.response?.data) {
      logError(`Response data: ${JSON.stringify(error.response.data)}`);
    }
    return { success: false };
  }
}

async function check6_DecisionRetrieval(decisionId) {
  console.log('\n[Check 6] Decision Retrieval');
  if (!decisionId) {
    logWarn('Skipping decision retrieval (no decisionId from auth test)');
    return false;
  }

  try {
    const timestamp = Date.now().toString();
    const messageToSign = '' + timestamp; // Empty body for GET
    const signature = hashWithSecret(messageToSign, SECRET);

    await new Promise(r => setTimeout(r, 100)); // Small delay for persistence

    const response = await axios.get(
      `${BASE_URL}/api/v1/tenants/${TENANT_ID}/decisions/${decisionId}`,
      {
        headers: {
          Authorization: `Bearer ${KEY_ID}:${SECRET}`,
          'X-Timestamp': timestamp,
          'X-Idempotency-Key': crypto.randomUUID(),
          'X-Signature': signature,
        },
        timeout: 5000,
      }
    );

    if (response.status === 200) {
      logSuccess(`Decision retrieved successfully (ID: ${decisionId})`);
      logSuccess(`Decision has reasoning trace: ${!!response.data.explanation}`);
      return true;
    } else {
      logError(`Failed to retrieve decision: ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Decision retrieval test failed: ${error.message}`);
    return false;
  }
}

async function runValidation() {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║              CHAOS TESTING SETUP VALIDATION                           ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  const check1 = await check1_DatabaseConnection();
  if (!check1) {
    logError('Cannot proceed without database connection');
    process.exit(1);
  }

  const check2 = await check2_TestTenantExists();
  const check3 = await check3_DecisionTraceSchema();
  const check4 = await check4_ServerHealthCheck();
  
  let check5Result = { success: false };
  let check6Result = false;
  
  if (check4) {
    check5Result = await check5_AuthenticationFlow();
    if (check5Result.success) {
      check6Result = await check6_DecisionRetrieval(check5Result.decisionId);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(80));
  
  console.log(`\n✓ Passed: ${CHECKS.passed.length}`);
  CHECKS.passed.forEach(check => console.log(`  • ${check}`));
  
  if (CHECKS.failed.length > 0) {
    console.log(`\n✗ Failed: ${CHECKS.failed.length}`);
    CHECKS.failed.forEach(check => console.log(`  • ${check}`));
  }

  const allPassed = CHECKS.failed.length === 0;
  
  console.log('\n' + '─'.repeat(80));
  if (allPassed) {
    console.log('✓ ALL CHECKS PASSED - Ready for chaos testing!');
    console.log('\nNext: Run chaos tests with: node run-chaos-tests.js');
  } else {
    console.log('✗ SOME CHECKS FAILED - Fix issues before running chaos tests');
    console.log('\nFix the failures above and re-run this validation script.');
  }
  console.log('─'.repeat(80) + '\n');

  await disconnectDatabase();
  process.exit(allPassed ? 0 : 1);
}

// Run validation
runValidation().catch(error => {
  console.error('\nFatal error during validation:');
  console.error(error);
  process.exit(1);
});
