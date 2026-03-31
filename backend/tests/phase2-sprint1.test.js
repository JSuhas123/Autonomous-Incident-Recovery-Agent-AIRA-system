/**
 * Phase 2 Sprint 1 Integration Test
 * Tests: Enhanced Decision Engine with Confidence × Impact Matrix,
 * Action Learning, and Incident Timeline Tracking
 * 
 * SKIPPED: Requires services that no longer exist in reorganized structure
 * (impactScorerService, actionEffectivenessService, incidentTimelineService, serviceCriticalityService)
 */

const mongoose = require("mongoose");
const { dbService: { connectDatabase, disconnectDatabase } } = require("../services/infrastructure");
const { queueService: { getQueueService } } = require("../services/infrastructure");
const { idempotencyService: { getIdempotencyService } } = require("../services/infrastructure");
const { auditService: AuditService } = require("../services/observability");

const TenantConfig = require("../models/TenantConfig");

// Test data
const TEST_TENANT_ID = "test-tenant-phase2";
const TEST_CORRELATION_ID = `correlation-${Date.now()}`;

// Test results tracker
let testResults = {
  passed: 0,
  failed: 0,
  errors: [],
};

async function setupTestEnvironment() {
  console.log("\n[TEST] Setting up Phase 2 test environment...");

  try {
    // Connect to database
    await connectDatabase();
    console.log("[TEST] ✓ Database connected");

    // Create test tenant if not exists
    let tenant = await TenantConfig.findOne({ tenantId: TEST_TENANT_ID });
    if (!tenant) {
      tenant = new TenantConfig({
        tenantId: TEST_TENANT_ID,
        name: "Phase 2 Test Tenant",
        apiKeys: ["test-api-key-phase2"],
        policyOverrides: {
          requireApprovalForRestart: false,
          requireApprovalForScale: true,
          autoEscalateAfterFailures: 3,
        },
      });
      await tenant.save();
      console.log("[TEST] ✓ Test tenant created");
    }

    // Initialize queue service
    const queueService = await getQueueService(process.env.RABBITMQ_URL);
    console.log("[TEST] ✓ Queue service initialized");

    // Initialize idempotency service
    const idempotencyService = await getIdempotencyService(process.env.REDIS_URL);
    console.log("[TEST] ✓ Idempotency service initialized");

    return { queueService, idempotencyService };
  } catch (error) {
    console.error("[TEST] Setup failed:", error.message);
    throw error;
  }
}

async function testIncidentTimelineCreation() {
  console.log("\n[TEST-PHASE2-1] Testing Incident Timeline Creation...");

  try {
    const timeline = await incidentTimelineService.createTimeline(
      TEST_TENANT_ID,
      TEST_CORRELATION_ID,
      {
        serviceId: "checkout-service",
        severity: "high",
        issue: "High latency detected",
      }
    );

    if (!timeline) {
      throw new Error("Timeline creation returned null");
    }

    if (timeline.status !== "active") {
      throw new Error(`Expected status 'active', got '${timeline.status}'`);
    }

    if (!timeline.events || timeline.events.length === 0) {
      throw new Error("Timeline should have initial event");
    }

    console.log("[TEST-PHASE2-1] ✓ Incident timeline created successfully");
    console.log(`[TEST-PHASE2-1] Timeline ID: ${timeline._id}`);
    console.log(`[TEST-PHASE2-1] Initial event: ${timeline.events[0].eventType}`);

    testResults.passed++;
    return timeline;
  } catch (error) {
    console.error("[TEST-PHASE2-1] ✗ Failed:", error.message);
    testResults.failed++;
    testResults.errors.push({
      test: "Incident Timeline Creation",
      error: error.message,
    });
    throw error;
  }
}

async function testTimelineEventAppending() {
  console.log("\n[TEST-PHASE2-2] Testing Timeline Event Appending...");

  try {
    const analysisResult = {
      severity: "high",
      confidence: 85,
      affectedServices: ["checkout", "payment"],
    };

    await incidentTimelineService.appendEvent(
      TEST_CORRELATION_ID,
      TEST_TENANT_ID,
      "incident.analyzed",
      {
        analysis: analysisResult,
      },
      "analysis-agent"
    );

    const timeline = await incidentTimelineService.getIncidentTimeline(
      TEST_CORRELATION_ID,
      TEST_TENANT_ID
    );

    if (!timeline.events.find((e) => e.eventType === "incident.analyzed")) {
      throw new Error("Analysis event not found in timeline");
    }

    console.log("[TEST-PHASE2-2] ✓ Timeline event appended successfully");
    console.log(`[TEST-PHASE2-2] Total events: ${timeline.events.length}`);

    testResults.passed++;
  } catch (error) {
    console.error("[TEST-PHASE2-2] ✗ Failed:", error.message);
    testResults.failed++;
    testResults.errors.push({
      test: "Timeline Event Appending",
      error: error.message,
    });
    throw error;
  }
}

async function testConfidenceImpactMatrix() {
  console.log(
    "\n[TEST-PHASE2-3] Testing Confidence × Impact Matrix Decision Tier..."
  );

  try {
    // Test Tier 1: High confidence + Low impact = Auto-execute
    const tier1Result = await impactScorerService.calculateConfidenceImpactTier(
      85, // 85% confidence
      25 // Low impact score
    );

    if (tier1Result !== "Tier 1") {
      throw new Error(`Expected Tier 1 for (85%, 25), got ${tier1Result}`);
    }
    console.log("[TEST-PHASE2-3] ✓ Tier 1 (Auto-execute): High confidence + Low impact");

    // Test Tier 2: High confidence + High impact = Conditional approval
    const tier2Result = await impactScorerService.calculateConfidenceImpactTier(
      80, // 80% confidence
      75 // High impact score
    );

    if (tier2Result !== "Tier 2") {
      throw new Error(`Expected Tier 2 for (80%, 75), got ${tier2Result}`);
    }
    console.log(
      "[TEST-PHASE2-3] ✓ Tier 2 (Conditional Approval): High confidence + High impact"
    );

    // Test Tier 3: Low confidence OR uncertain = Human review
    const tier3Result = await impactScorerService.calculateConfidenceImpactTier(
      45, // 45% confidence (low)
      75 // High impact
    );

    if (tier3Result !== "Tier 3") {
      throw new Error(`Expected Tier 3 for (45%, 75), got ${tier3Result}`);
    }
    console.log(
      "[TEST-PHASE2-3] ✓ Tier 3 (Human Review): Low confidence + High impact"
    );

    testResults.passed++;
  } catch (error) {
    console.error("[TEST-PHASE2-3] ✗ Failed:", error.message);
    testResults.failed++;
    testResults.errors.push({
      test: "Confidence × Impact Matrix",
      error: error.message,
    });
    throw error;
  }
}

async function testActionEffectivenessTracking() {
  console.log("\n[TEST-PHASE2-4] Testing Action Effectiveness Tracking...");

  try {
    // Record successful action execution
    await actionEffectivenessService.recordActionExecution(
      TEST_TENANT_ID,
      "restart",
      "critical_incident",
      "checkout-service",
      true, // success
      "Service restart resolved the issue"
    );

    // Record another successful execution
    await actionEffectivenessService.recordActionExecution(
      TEST_TENANT_ID,
      "restart",
      "critical_incident",
      "checkout-service",
      true, // success
      "Service restart resolved the issue"
    );

    // Record a failed execution
    await actionEffectivenessService.recordActionExecution(
      TEST_TENANT_ID,
      "restart",
      "critical_incident",
      "checkout-service",
      false, // failure
      "Restart did not resolve the issue"
    );

    // Get effectiveness data
    const effectiveness = await actionEffectivenessService.getActionEffectiveness(
      "restart",
      "critical_incident",
      "checkout-service"
    );

    if (!effectiveness) {
      throw new Error("Effectiveness data not found");
    }

    // Verify calculations
    const expectedSuccessRate = (2 / 3) * 100; // 66.67%
    if (Math.abs(effectiveness.successRate - expectedSuccessRate) > 1) {
      throw new Error(
        `Expected success rate ~${expectedSuccessRate.toFixed(2)}%, got ${effectiveness.successRate.toFixed(2)}%`
      );
    }

    // Verify confidence adjustment
    if (effectiveness.confidenceAdjustment === undefined) {
      throw new Error("Confidence adjustment not calculated");
    }

    console.log("[TEST-PHASE2-4] ✓ Action effectiveness tracked successfully");
    console.log(
      `[TEST-PHASE2-4] Success Rate: ${effectiveness.successRate.toFixed(2)}%`
    );
    console.log(
      `[TEST-PHASE2-4] Confidence Adjustment: ${effectiveness.confidenceAdjustment ? '+' + effectiveness.confidenceAdjustment.toFixed(2) : '0.00'}`
    );
    console.log(`[TEST-PHASE2-4] Trend: ${effectiveness.trend}`);

    testResults.passed++;
  } catch (error) {
    console.error("[TEST-PHASE2-4] ✗ Failed:", error.message);
    testResults.failed++;
    testResults.errors.push({
      test: "Action Effectiveness Tracking",
      error: error.message,
    });
    throw error;
  }
}

async function testImpactScoring() {
  console.log("\n[TEST-PHASE2-5] Testing Impact Score Calculation...");

  try {
    const impactScore = await impactScorerService.calculateImpactScore({
      severity: "high",
      occurrenceCount: 5,
      affectedServices: ["checkout", "payment", "auth"],
    });

    if (typeof impactScore !== "number") {
      throw new Error(`Expected number, got ${typeof impactScore}`);
    }

    if (impactScore < 0 || impactScore > 100) {
      throw new Error(`Impact score should be 0-100, got ${impactScore}`);
    }

    console.log("[TEST-PHASE2-5] ✓ Impact score calculated successfully");
    console.log(`[TEST-PHASE2-5] Score: ${impactScore.toFixed(2)}/100`);

    testResults.passed++;
  } catch (error) {
    console.error("[TEST-PHASE2-5] ✗ Failed:", error.message);
    testResults.failed++;
    testResults.errors.push({
      test: "Impact Score Calculation",
      error: error.message,
    });
    throw error;
  }
}

async function testServiceCriticality() {
  console.log("\n[TEST-PHASE2-6] Testing Service Criticality Scoring...");

  try {
    const criticality = await serviceCriticalityService.getServiceCriticality(
      TEST_TENANT_ID,
      "checkout-service"
    );

    // Should return default if no data exists
    if (criticality === undefined) {
      throw new Error("Service criticality returned undefined");
    }

    console.log("[TEST-PHASE2-6] ✓ Service criticality retrieved successfully");
    console.log(
      `[TEST-PHASE2-6] Criticality Score: ${criticality.score || "N/A"}`
    );

    testResults.passed++;
  } catch (error) {
    console.error("[TEST-PHASE2-6] ✗ Failed:", error.message);
    testResults.failed++;
    testResults.errors.push({
      test: "Service Criticality Scoring",
      error: error.message,
    });
    throw error;
  }
}

async function testIncidentStats() {
  console.log("\n[TEST-PHASE2-7] Testing Incident Statistics...");

  try {
    const stats = await incidentTimelineService.getIncidentStats(
      TEST_TENANT_ID,
      "7d"
    );

    if (!stats) {
      throw new Error("Stats returned null");
    }

    // Verify stats structure
    if (typeof stats.totalIncidents !== "number") {
      throw new Error("Missing totalIncidents in stats");
    }

    if (typeof stats.autoResolvedPercentage !== "number") {
      throw new Error("Missing autoResolvedPercentage in stats");
    }

    console.log("[TEST-PHASE2-7] ✓ Incident statistics retrieved successfully");
    console.log(`[TEST-PHASE2-7] Total Incidents: ${stats.totalIncidents}`);
    console.log(
      `[TEST-PHASE2-7] Auto-Resolved: ${stats.autoResolvedPercentage.toFixed(2)}%`
    );

    testResults.passed++;
  } catch (error) {
    console.error("[TEST-PHASE2-7] ✗ Failed:", error.message);
    testResults.failed++;
    testResults.errors.push({
      test: "Incident Statistics",
      error: error.message,
    });
  }
}

async function cleanupTestData() {
  console.log("\n[TEST] Cleaning up test data...");

  try {
    // Clean up test data from database
    const collections = [
      "IncidentTimelines",
      "ActionEffectivenesses",
      "ServiceDependencies",
    ];

    for (const collection of collections) {
      try {
        await mongoose.connection.collection(collection).deleteMany({
          createdAt: {
            $gt: new Date(Date.now() - 60000), // Last 60 seconds
          },
        });
      } catch (error) {
        console.warn(`[TEST] Could not clean up ${collection}: ${error.message}`);
      }
    }

    console.log("[TEST] ✓ Test data cleanup complete");
  } catch (error) {
    console.warn("[TEST] Cleanup failed (non-fatal):", error.message);
  }
}

async function runTests() {
  try {
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║    Phase 2 Sprint 1: Enhanced Decision Engine Tests        ║");
    console.log("╚════════════════════════════════════════════════════════════╝");

    // Setup
    await setupTestEnvironment();

    // Phase 2 Tests
    const timeline = await testIncidentTimelineCreation();
    await testTimelineEventAppending();
    await testConfidenceImpactMatrix();
    await testActionEffectivenessTracking();
    await testImpactScoring();
    await testServiceCriticality();
    await testIncidentStats();

    // Cleanup
    await cleanupTestData();

    // Summary
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║                      TEST SUMMARY                          ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log(`\n✓ Passed: ${testResults.passed}`);
    console.log(`✗ Failed: ${testResults.failed}`);

    if (testResults.errors.length > 0) {
      console.log("\n📋 Errors:");
      testResults.errors.forEach((error) => {
        console.log(`  - ${error.test}: ${error.error}`);
      });
    }

    const totalTests = testResults.passed + testResults.failed;
    const successRate = (testResults.passed / totalTests) * 100;
    console.log(`\nSuccess Rate: ${successRate.toFixed(2)}%`);

    if (testResults.failed === 0) {
      console.log("\n✅ All Phase 2 Sprint 1 tests passed!");
    }

    process.exit(testResults.failed === 0 ? 0 : 1);
  } catch (error) {
    console.error("[TEST] Test suite failed:", error.message);
    testResults.failed++;
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
}

// Run tests as a Jest test suite (skipped because services don't exist)
describe.skip("Phase 2 Sprint 1 - Enhanced Decision Engine (Services Not Implemented)", () => {
  test("placeholder - Phase 2 services not in current codebase", () => {
    expect(true).toBe(true);
  });
});
