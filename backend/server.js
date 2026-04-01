require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const mongoose = require("mongoose");

// CRITICAL: Initialize and validate feature flags before any other system starts
const featureFlags = require("./config/featureFlags");

const coreApiRoutes = require("./routes/coreApiRoutes");
const approvalRoutes = require("./routes/approvalRoutes");


// PHASE 1 SAFETY: Import kill switch and sanitization middleware
const { sanitizationMiddleware, testXSSPayloads } = require("./middleware/sanitizationMiddleware");
const { 
  killSwitchEnforcementMiddleware,
  killSwitchStatusEndpoint,
  killSwitchControlEndpoint,
} = require("./middleware/killSwitchMiddleware");
const { 
  confidenceCheckMiddleware,
  confidenceThresholdsEndpoint,
  confidenceThresholdsUpdateEndpoint,
} = require("./config/confidenceThresholds");

const { dbService } = require("./services/infrastructure");
const { 
  metricsService, 
  loggingService, 
  distributedLockService,
  systemHealthService,
  memoryCleanupJob,
  retryProcessorJob,
  retryHandler
} = require("./services/infrastructure");
const MultiInstanceCoordinator = require("./services/infrastructure/multiInstanceCoordinator");
const { startAnalysisAgent, stopAnalysisAgent } = require("./agents/analysisAgent");
const { startDecisionAgent, stopDecisionAgent } = require("./agents/decisionAgent");
const { startActionAgent, stopActionAgent } = require("./agents/actionAgent");
const authMiddleware = require("./middleware/authMiddleware");
const { tenantIsolationMiddleware, auditDataAccessMiddleware } = require("./middleware/tenantIsolationMiddleware");
const { rateLimitingMiddleware } = require("./middleware/rateLimitingMiddleware");
const { validateInput } = require("./middleware/inputValidationMiddleware");

const { connectDatabase, disconnectDatabase } = dbService;
const { getQueueService } = require("./services/infrastructure/queueService");
const { getIdempotencyService } = require("./services/infrastructure/idempotencyService");
const { runbookExecutionService } = require("./services/execution");
const { getK8sClient } = require("./services/k8s");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Global middleware
app.use(
  cors({
    origin: "http://localhost:3000",
  })
);
app.use(express.json());

// PHASE 1 SAFETY: Apply sanitization and kill switch enforcement
// These must be applied early, before any handlers
app.use(sanitizationMiddleware(null, { allowRichText: false })); // Sanitize ALL string fields
app.use(killSwitchEnforcementMiddleware()); // Attach kill switch manager to requests
app.use(confidenceCheckMiddleware); // Attach confidence enforcer to requests


// Health check endpoint (no auth required)
app.get("/", (req, res) => {
  res.json({
    message: "Lean Incident Response Decision Engine API",
    version: "2.0.0",
    status: "running",
    note: "This system focuses exclusively on safe decision-making. Use external systems for observability.",
  });
});

// Health check for orchestration
// CRITICAL FIX #3: Reports system health status including Redis availability
app.get("/health", (req, res) => {
  const systemHealth = systemHealthService.getHealthStatus();
  const statusCode = systemHealth.safeMode ? 503 : 200;
  res.status(statusCode).json({
    status: systemHealth.safeMode ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    safeMode: systemHealth.safeMode,
    redis: {
      connected: systemHealth.redis.connected,
    },
    warnings: systemHealth.warnings.length > 0 ? systemHealth.warnings : undefined,
  });
});

// Metrics endpoint (Prometheus format)
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  const metrics = await metricsService.getMetrics();
  res.send(metrics);
});

// Extended health endpoint with dependencies
// CRITICAL FIX #3: Reports detailed system state for debugging
app.get("/health/detailed", async (req, res) => {
  try {
    const queueService = await getQueueService();
    const idempotencyService = await getIdempotencyService();
    const systemHealth = systemHealthService.getHealthStatus();
    
    const health = {
      status: systemHealth.safeMode ? "degraded" : "healthy",
      timestamp: new Date().toISOString(),
      deploymentMode: systemHealth.deploymentMode,
      safeMode: systemHealth.safeMode,
      featureFlags: {
        summary: `${featureFlags.getAllFlags().filter(f => f.enabled).length}/${featureFlags.getAllFlags().length} enabled`,
        enabled: featureFlags.getAllFlags().filter(f => f.enabled).map(f => f.name),
        disabled: featureFlags.getAllFlags().filter(f => !f.enabled).map(f => f.name),
      },
      components: {
        database: "connected",
        queue: queueService ? (queueService.connected ? "connected" : "disconnected") : "not-initialized",
        idempotency: idempotencyService ? (idempotencyService.connected ? "connected" : "disconnected") : "not-initialized",
        redis: {
          connected: systemHealth.redis.connected,
          failureStartTime: systemHealth.redis.failureStartTime,
        },
        memoryCleanup: memoryCleanupJob.isRunning ? "running" : "stopped",
      },
      warnings: systemHealth.warnings,
      canExecuteActions: systemHealthService.canExecuteActions(),
      diagnostics: systemHealth.safeMode ? systemHealthService.getDiagnostics() : undefined,
    };
    res.status(systemHealth.safeMode ? 503 : 200).json(health);
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

// Multi-instance coordination endpoint (for monitoring cluster health)
app.get("/health/multi-instance", async (req, res) => {
  try {
    if (!global.multiInstanceCoordinator) {
      return res.status(503).json({
        error: 'Multi-instance coordinator not initialized',
      });
    }
    const status = await global.multiInstanceCoordinator.getStatus();
    res.json(status);
  } catch (error) {
    res.status(503).json({
      error: error.message,
    });
  }
});

// API endpoints require authentication and tenant isolation
app.use("/api/v1/tenants/:tenantId", authMiddleware);
app.use("/api/v1/tenants/:tenantId", rateLimitingMiddleware('api'));
app.use("/api/v1/tenants/:tenantId", tenantIsolationMiddleware);
app.use("/api/v1/tenants/:tenantId", auditDataAccessMiddleware);

/**
 * CORE DECISION ENGINE API (6 endpoints only)
 * 
 * This system acts as a safe automation brain that:
 * - Analyzes signals from external systems
 * - Makes decisions using policies and safety checks
 * - Executes actions with full traceability
 * - Never competes with observability tools
 */
app.use("/api/v1/tenants/:tenantId", coreApiRoutes);

/**
 * APPROVAL WORKFLOW API
 * 
 * Implements human-in-the-loop approval for mid-confidence decisions (0.6-0.85)
 * - GET /approvals - List pending approvals
 * - POST /approvals/:approvalId/approve - Approve and queue for execution
 * - POST /approvals/:approvalId/reject - Reject with reason
 * - GET /approvals/queue/stats - Monitor approval queue
 */
app.use("/api/v1/tenants/:tenantId/approvals", approvalRoutes);

// ============================================================================
// PHASE 1: SAFETY CONTROL ENDPOINTS (Kill Switches & Confidence Thresholds)
// ============================================================================

/**
 * Kill Switch Status Endpoint
 * GET /api/v1/safety/kill-switches
 * Returns current state of all kill switches (actions enabled, learning enabled, emergency mode, etc)
 */
app.get("/api/v1/safety/kill-switches", killSwitchStatusEndpoint);

/**
 * Kill Switch Control Endpoint
 * POST /api/v1/safety/kill-switches
 * Requires authentication - updates kill switch state
 * Body: { enabled: boolean, component: "ACTIONS"|"LEARNING"|"EMERGENCY", reason: string }
 */
app.post("/api/v1/safety/kill-switches", authMiddleware, killSwitchControlEndpoint);

/**
 * Confidence Thresholds Endpoint (GET)
 * GET /api/v1/safety/thresholds
 * Returns current confidence-based decision thresholds
 */
app.get("/api/v1/safety/thresholds", confidenceThresholdsEndpoint);

/**
 * Confidence Thresholds Endpoint (UPDATE)
 * POST /api/v1/safety/thresholds
 * Requires authentication - updates confidence thresholds
 * Body: { AUTO_EXECUTE_THRESHOLD: number, ESCALATION_THRESHOLD: number }
 */
app.post("/api/v1/safety/thresholds", authMiddleware, confidenceThresholdsUpdateEndpoint);

/**
 * XSS Test Endpoint (Development Only)
 * GET /api/v1/safety/xss-test
 * Runs XSS payload tests and reports results
 * SHOULD BE DISABLED IN PRODUCTION - requires auth in production
 */
app.get("/api/v1/safety/xss-test", (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'XSS testing not available in production',
    });
  }

  const results = testXSSPayloads(false);
  res.json({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    summary: {
      totalTests: results.total,
      passed: results.passed,
      failed: results.total - results.passed,
    },
    details: results.results,
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error("[api-error]", error);
  res.status(500).json({
    message: "Internal server error",
  });
});

async function populateSampleData() {
  try {
    const Log = require("./models/Log");
    const IncidentMemory = require("./models/IncidentMemory");
    const DecisionTrace = require("./models/DecisionTrace");
    const tenantId = "default";
    const crypto = require("crypto");

    // Clear existing data to avoid duplicates
    await Log.deleteMany({ tenantId });
    await IncidentMemory.deleteMany({ tenantId });
    await DecisionTrace.deleteMany({ tenantId });

    // 1. Create sample logs
    const sampleLogs = [
      {
        tenantId,
        message: "High memory usage detected in API gateway",
        status: "error",
        level: "warn",
        responseTime: 2350,
        timestamp: new Date(Date.now() - 60000),
      },
      {
        tenantId,
        message: "Request timeout on payment service",
        status: "error",
        level: "error",
        responseTime: 5000,
        timestamp: new Date(Date.now() - 120000),
      },
      {
        tenantId,
        message: "Database connection pool exhausted",
        status: "error",
        level: "error",
        responseTime: 3200,
        timestamp: new Date(Date.now() - 180000),
      },
      {
        tenantId,
        message: "Cache invalidation completed successfully",
        status: "success",
        level: "info",
        responseTime: 450,
        timestamp: new Date(Date.now() - 240000),
      },
      {
        tenantId,
        message: "Circuit breaker opened for downstream service",
        status: "error",
        level: "warn",
        responseTime: 1200,
        timestamp: new Date(Date.now() - 300000),
      },
      {
        tenantId,
        message: "Auto-scaling triggered - 5 new instances launched",
        status: "success",
        level: "info",
        responseTime: 890,
        timestamp: new Date(Date.now() - 360000),
      },
    ];

    await Log.insertMany(sampleLogs);

    // 2. Create sample incident memory
    const sampleIncidents = [
      {
        tenantId,
        patternId: crypto.randomUUID(),
        patternType: "high-error-rate",
        patternName: "Payment Service Error Spike",
        description: "Unusual spike in payment processing errors",
        occurrences: [
          {
            incidentId: crypto.randomUUID(),
            decisionId: crypto.randomUUID(),
            timestamp: new Date(Date.now() - 120000),
            resolvedWith: "Restart payment service pods",
            success: true,
            failureReason: null,
            recoveryTimeMs: 45000,
            confidence: 0.92,
            severity: "HIGH",
          },
        ],
        stats: {
          totalOccurrences: 3,
          lastOccurrence: new Date(Date.now() - 120000),
          firstOccurrence: new Date(Date.now() - 864000000),
          frequency: "1-2 times per week",
          actions: new Map([
            [
              "Restart payment service pods",
              {
                successes: 3,
                failures: 0,
                totalAttempts: 3,
                successRate: 100,
                avgRecoveryTimeMs: 45000,
                lastUsed: new Date(Date.now() - 120000),
              },
            ],
          ]),
          severityTrend: {
            avgSeverity: "HIGH",
            escalationPattern: false,
          },
        },
      },
      {
        tenantId,
        patternId: crypto.randomUUID(),
        patternType: "high-latency",
        patternName: "Database Query Timeout",
        description: "Database queries exceeding timeout thresholds",
        occurrences: [
          {
            incidentId: crypto.randomUUID(),
            decisionId: crypto.randomUUID(),
            timestamp: new Date(Date.now() - 180000),
            resolvedWith: "Optimize slow queries and clear cache",
            success: true,
            failureReason: null,
            recoveryTimeMs: 32000,
            confidence: 0.85,
            severity: "MEDIUM",
          },
        ],
        stats: {
          totalOccurrences: 5,
          lastOccurrence: new Date(Date.now() - 180000),
          firstOccurrence: new Date(Date.now() - 2592000000),
          frequency: "2-3 times per week",
          actions: new Map([
            [
              "Optimize slow queries and clear cache",
              {
                successes: 4,
                failures: 1,
                totalAttempts: 5,
                successRate: 80,
                avgRecoveryTimeMs: 32000,
                lastUsed: new Date(Date.now() - 180000),
              },
            ],
          ]),
          severityTrend: {
            avgSeverity: "MEDIUM",
            escalationPattern: false,
          },
        },
      },
      {
        tenantId,
        patternId: crypto.randomUUID(),
        patternType: "circuit-breaker-open",
        patternName: "Downstream Service Unavailable",
        description: "Circuit breaker open due to downstream service failures",
        occurrences: [
          {
            incidentId: crypto.randomUUID(),
            decisionId: crypto.randomUUID(),
            timestamp: new Date(Date.now() - 30000),
            resolvedWith: "Wait for circuit breaker recovery",
            success: true,
            failureReason: null,
            recoveryTimeMs: 15000,
            confidence: 0.88,
            severity: "MEDIUM",
          },
        ],
        stats: {
          totalOccurrences: 2,
          lastOccurrence: new Date(Date.now() - 30000),
          firstOccurrence: new Date(Date.now() - 432000000),
          frequency: "Once per week",
          actions: new Map([
            [
              "Wait for circuit breaker recovery",
              {
                successes: 2,
                failures: 0,
                totalAttempts: 2,
                successRate: 100,
                avgRecoveryTimeMs: 15000,
                lastUsed: new Date(Date.now() - 30000),
              },
            ],
          ]),
          severityTrend: {
            avgSeverity: "MEDIUM",
            escalationPattern: false,
          },
        },
      },
    ];

    await IncidentMemory.insertMany(sampleIncidents);

    // 3. Create sample decision traces
    const sampleDecisions = [
      {
        decisionId: crypto.randomUUID(),
        tenantId,
        correlationId: crypto.randomUUID(),
        inputs: {
          signals: {
            errorRate: 42.5,
            responseTime: 2500,
            affectedServices: ["payment-service"],
          },
          severity: "HIGH",
          confidence: 0.92,
          incidentMemory: {
            previousOccurrences: 3,
            lastResolution: "Restart payment service pods",
            successRate: 100,
            pattern: "high-error-rate",
          },
        },
        reasoning: {
          hypothesis: "Payment service pod is unhealthy and rejecting requests",
          evidenceFor: [
            "Error rate jumped from 2% to 42% in 30 seconds",
            "Same service had 3 similar incidents previously",
            "Last 3 recovery attempts using pod restart were successful",
          ],
          evidenceAgainst: ["No recent code deploy detected"],
        },
        decisionRationale: "High confidence (92%) in pod restart based on pattern history",
        recommendedAction: "Restart payment service pods in kubernetes cluster",
        confidence: 0.92,
        timestamp: new Date(Date.now() - 120000),
      },
      {
        decisionId: crypto.randomUUID(),
        tenantId,
        correlationId: crypto.randomUUID(),
        inputs: {
          signals: {
            errorRate: 12.3,
            responseTime: 4200,
            affectedServices: ["search-service"],
          },
          severity: "MEDIUM",
          confidence: 0.85,
          incidentMemory: {
            previousOccurrences: 5,
            lastResolution: "Optimize slow queries and clear cache",
            successRate: 80,
            pattern: "high-latency",
          },
        },
        reasoning: {
          hypothesis: "Search database facing query performance issues",
          evidenceFor: [
            "Response times increased from 300ms to 4200ms",
            "Pattern repeats 2-3 times weekly with consistent symptoms",
            "Cache size indicator suggests potential overflow",
          ],
          evidenceAgainst: ["No recent traffic spike detected"],
        },
        decisionRationale:
          "Moderate confidence (85%) - pattern matches previous successful queries optimization",
        recommendedAction: "Optimize slow database queries and clear search cache",
        confidence: 0.85,
        timestamp: new Date(Date.now() - 180000),
      },
      {
        decisionId: crypto.randomUUID(),
        tenantId,
        correlationId: crypto.randomUUID(),
        inputs: {
          signals: {
            errorRate: 8.1,
            responseTime: 1800,
            affectedServices: ["api-gateway"],
          },
          severity: "LOW",
          confidence: 0.78,
          incidentMemory: {
            previousOccurrences: 2,
            lastResolution: "Scale API gateway instances",
            successRate: 100,
            pattern: "resource-exhaustion",
          },
        },
        reasoning: {
          hypothesis: "API gateway approaching resource limits under normal load",
          evidenceFor: [
            "Memory usage at 85% threshold",
            "CPU at 72% on multiple nodes",
            "Scaling previously resolved similar situations",
          ],
          evidenceAgainst: ["Traffic volume still within expected ranges"],
        },
        decisionRationale: "Low-moderate confidence (78%) - proactive scaling recommended",
        recommendedAction: "Scale API gateway instances from 3 to 5 replicas",
        confidence: 0.78,
        timestamp: new Date(Date.now() - 10000),
      },
    ];

    await DecisionTrace.insertMany(sampleDecisions);

    // 4. Create sample runbooks
    const Runbook = require("./models/Runbook");
    const RunbookExecution = require("./models/RunbookExecution");
    
    // Clear existing runbook data
    await Runbook.deleteMany({ tenantId });
    await RunbookExecution.deleteMany({ tenantId });

    const sampleRunbooks = [
      {
        tenantId,
        name: "Payment Service Recovery",
        incidentType: "high-error-rate",
        description: "Automated recovery for payment service failures",
        enabled: true,
        steps: [
          { stepNumber: 1, name: "Check pod status", type: "kubernetes", action: "check_pod_health", timeout: 30000 },
          { stepNumber: 2, name: "Restart unhealthy pods", type: "kubernetes", action: "restart_pods", timeout: 60000 },
          { stepNumber: 3, name: "Verify service health", type: "api", action: "health_check", timeout: 45000 },
          { stepNumber: 4, name: "Monitor error rates", type: "wait", action: "wait_for_recovery", timeout: 120000 },
        ],
      },
      {
        tenantId,
        name: "Database Query Optimization",
        incidentType: "high-latency",
        description: "Optimize database queries and clear caches",
        enabled: true,
        steps: [
          { stepNumber: 1, name: "Identify slow queries", type: "shell", action: "analyze_queries", timeout: 45000 },
          { stepNumber: 2, name: "Clear query cache", type: "api", action: "clear_cache", timeout: 30000 },
          { stepNumber: 3, name: "Clear application cache", type: "shell", action: "flush_cache", timeout: 30000 },
          { stepNumber: 4, name: "Verify response times", type: "api", action: "performance_check", timeout: 60000 },
        ],
      },
      {
        tenantId,
        name: "API Gateway Scaling",
        incidentType: "resource-exhaustion",
        description: "Scale API gateway to handle increased load",
        enabled: true,
        steps: [
          { stepNumber: 1, name: "Assess resource usage", type: "shell", action: "check_resources", timeout: 30000 },
          { stepNumber: 2, name: "Scale up replicas", type: "kubernetes", action: "scale_replicas", timeout: 120000 },
          { stepNumber: 3, name: "Monitor scaling", type: "wait", action: "monitor_scaling", timeout: 90000 },
          { stepNumber: 4, name: "Verify load distribution", type: "api", action: "verify_distribution", timeout: 60000 },
        ],
      },
    ];

    const createdRunbooks = await Runbook.insertMany(sampleRunbooks);

    // 5. Create sample runbook executions
    const sampleExecutions = [
      {
        tenantId,
        runbookId: createdRunbooks[0]._id,
        correlationId: crypto.randomUUID(),
        status: "success",
        startTime: new Date(Date.now() - 300000),
        endTime: new Date(Date.now() - 255000),
        result: {
          stepsCompleted: 4,
          totalSteps: 4,
          notes: "Payment service successfully recovered",
        },
      },
      {
        tenantId,
        runbookId: createdRunbooks[1]._id,
        correlationId: crypto.randomUUID(),
        status: "success",
        startTime: new Date(Date.now() - 200000),
        endTime: new Date(Date.now() - 125000),
        result: {
          stepsCompleted: 4,
          totalSteps: 4,
          notes: "Database optimization completed, response times normalized",
        },
      },
      {
        tenantId,
        runbookId: createdRunbooks[0]._id,
        correlationId: crypto.randomUUID(),
        status: "running",
        startTime: new Date(Date.now() - 60000),
        endTime: null,
        result: {
          stepsCompleted: 2,
          totalSteps: 4,
          notes: "Currently checking pod status and restarting unhealthy pods",
        },
      },
    ];

    await RunbookExecution.insertMany(sampleExecutions);

    // 6. Create test tenant for chaos testing
    const TenantConfig = require("./models/TenantConfig");
    const testTenantId = "chaos-test-tenant";
    const testKeyId = "chaos-key";
    const testSecret = "chaos-secret";

    const keyHash = crypto
      .createHmac("sha256", testSecret || "")
      .update(testKeyId)
      .digest("hex");

    const testTenant = {
      tenantId: testTenantId,
      name: "Chaos Testing Tenant",
      status: "active",
      apiKeys: [
        {
          keyId: testKeyId,
          keyHash,
          active: true,
          createdAt: new Date(),
          description: "Auto-generated test key for chaos testing",
        },
      ],
      config: {
        maxDecisionsPerHour: 100000,
        enableFeedback: true,
        enableSimulation: true,
        enableCascadeDetection: true,
      },
    };

    await TenantConfig.findOneAndUpdate(
      { tenantId: testTenantId },
      testTenant,
      { upsert: true, new: true }
    );

    console.log("[sample-data] ✓ Sample data created successfully");
    console.log("[sample-data] ✓ Test tenant 'chaos-test-tenant' created for chaos testing");
  } catch (error) {
    console.warn("[sample-data] Failed to populate sample data:", error.message);
    // Continue even if sample data fails
  }
}

let serverInstance;
let queueService;
let idempotencyService;
let apolloServer;
let lockService;
let rateLimitService;

async function startServer() {
  try {
    console.log("[server] Starting backend services...");
    const startTime = Date.now();

    // 1. Initialize distributed lock service (Redis)
    try {
      lockService = await distributedLockService.connect(process.env.REDIS_URL);
      console.log("[server] ✓ Distributed lock service initialized");
    } catch (error) {
      console.warn("[server] Lock service failed (non-fatal):", error.message);
    }

    // 2. Connect to database
    await connectDatabase();
    console.log("[server] ✓ Database connected");

    // 2.5 CRITICAL: Create indexes and optimize database for production
    try {
      const databaseOptimization = require("./services/infrastructure/databaseOptimization");
      await databaseOptimization.createIndexes(mongoose.connection.db);
      databaseOptimization.startPeriodicOptimization();
      console.log("[server] ✓ Database indexes created and optimization scheduled");
    } catch (error) {
      console.warn("[server] Database optimization failed (non-fatal):", error.message);
    }

    // 3. Populate sample data
    await populateSampleData();
    console.log("[server] ✓ Sample data populated");

    // 4. Initialize queue service (RabbitMQ)
    try {
      queueService = await getQueueService(process.env.RABBITMQ_URL);
      if (!queueService.connected) {
        throw new Error("RabbitMQ not connected");
      }
      console.log("[server] ✓ Queue service initialized");
    } catch (error) {
      console.warn("[server] Queue service failed, using mock service:", error.message);
      // Fall back to mock queue service
      const { setMockFallback } = require("./services/queueService");
      setMockFallback();
      queueService = await getQueueService();
      console.log("[server] ✓ Mock queue service initialized");
    }

    // 5. Initialize idempotency service (Redis)
    try {
      idempotencyService = await getIdempotencyService(process.env.REDIS_URL);
      if (!idempotencyService.connected) {
        throw new Error("Redis not connected");
      }
      console.log("[server] ✓ Idempotency service initialized");
    } catch (error) {
      console.warn("[server] Idempotency service failed, using mock service:", error.message);
      // Fall back to mock idempotency service
      const { setMockFallback } = require("./services/idempotencyService");
      setMockFallback();
      idempotencyService = await getIdempotencyService();
      console.log("[server] ✓ Mock idempotency service initialized");
    }

    // 6. Start memory cleanup job
    memoryCleanupJob.start();
    console.log("[server] ✓ Memory cleanup job started");

    // 7. Start retry processor job (FIX #2: CRITICAL - processes messages due for retry)
    retryProcessorJob.start();
    console.log("[server] ✓ Retry processor job started");

    // 7.5 DISABLED: Batch processing pipeline commented out pending module dependency fixes
    // TODO: Re-enable once batchProcessingPipeline module is properly integrated
    // batchProcessingPipeline would go here

    // 8. Start event processing agents (core decision loop)
    await startAnalysisAgent();
    await startDecisionAgent();
    await startActionAgent();
    console.log("[server] ✓ Core agents started (analysis, decision, action)");

    // 8.5 CRITICAL: Log all feature flags and validate production setup
    console.log("\n[server] ═══════════════════════════════════════");
    featureFlags.logStartupStatus(console);
    console.log("[server] ═══════════════════════════════════════\n");

    // 8.75 CRITICAL: Start multi-instance coordination (for failover safety)
    try {
      const redisClient = distributedLockService.getRedisClient(); // Get Redis client
      const coordinator = new MultiInstanceCoordinator(redisClient);
      await coordinator.start();
      global.multiInstanceCoordinator = coordinator; // Make available globally
      console.log("[server] ✓ Multi-instance coordinator started (heartbeat + leader election)");
    } catch (error) {
      console.warn("[server] ⚠️  Multi-instance coordination failed:", error.message);
      console.log("[server]    Continuing in single-instance mode");
    }

    // 8.9 KUBERNETES INTEGRATION: Register K8s handler with runbook execution
    try {
      const k8sClient = getK8sClient();
      
      // Verify K8s connectivity
      try {
        const connectivity = await k8sClient.verifyConnectivity();
        console.log("[server] ✓ Kubernetes cluster connected:", {
          version: connectivity.version,
        });
      } catch (k8sError) {
        console.warn("[server] ⚠️  Kubernetes connectivity check failed:", k8sError.message);
        console.log("[server]    K8s operations will fail if attempted");
      }

      // Register Kubernetes handler with runbook execution service
      runbookExecutionService.registerHandler('kubernetes', async (step, context) => {
        console.log('[server] Executing Kubernetes step:', {
          stepName: step.name,
          action: step.action,
          resource: step.params?.resource,
        });

        const actionType = step.action; // e.g., 'restart_pod', 'restart_deployment', 'scale_deployment'
        const params = step.params || {};
        const correlationId = context.correlationId || step.correlationId || 'unknown';

        try {
          const result = await k8sClient.executeAction(actionType, params, { correlationId });
          
          return {
            status: 'SUCCESS',
            stepName: step.name,
            action: step.action,
            result,
            timestamp: new Date(),
          };
        } catch (error) {
          console.error('[server] K8s action failed:', {
            stepName: step.name,
            action: step.action,
            error: error.message,
            correlationId,
          });
          
          return {
            status: 'FAILED',
            error: error.message,
            stepName: step.name,
            action: step.action,
            timestamp: new Date(),
          };
        }
      });

      console.log("[server] ✓ Kubernetes handler registered with runbook execution");
    } catch (error) {
      console.warn("[server] ⚠️  Kubernetes integration failed:", error.message);
      console.log("[server]    Kubernetes operations will not be available");
    }

    // 9. Start HTTP server (REST API only)
    serverInstance = require("http").createServer(app);
    
    // Pipeline endpoints disabled pending module integration fixes
    
    serverInstance.listen(PORT, () => {
      const duration = Date.now() - startTime;
      console.log(`[server] ✓ Backend running on http://localhost:${PORT} (startup: ${duration}ms)`);
      console.log(`[server] Core API available at /api/v1/tenants/:tenantId/*`);

      console.log(`[server] Metrics available at /metrics (Prometheus format)`);
      console.log(`[server] Health endpoint at /health/detailed`);
      console.log(`[server] ✓ Decision Engine initialized`);
      console.log("[server] Ready to accept requests");
    });
  } catch (error) {
    console.error("[server] Failed to start backend:", error);
    process.exit(1);
  }
}

async function shutdown() {
  console.log("\n[server] Shutting down...");

  // Shutdown multi-instance coordinator
  if (global.multiInstanceCoordinator) {
    await global.multiInstanceCoordinator.stop();
    console.log("[server] ✓ Multi-instance coordinator stopped");
  }

  // Batch pipeline disabled pending module integration fixes

  stopAnalysisAgent();
  stopDecisionAgent();
  stopActionAgent();

  // Shutdown background jobs
  memoryCleanupJob.stop();
  console.log("[server] ✓ Memory cleanup job stopped");

  retryProcessorJob.stop();
  console.log("[server] ✓ Retry processor job stopped");

  if (serverInstance) {
    await new Promise((resolve) => {
      serverInstance.close(resolve);
    });
  }

  if (queueService) {
    try {
      await queueService.disconnect();
    } catch (error) {
      console.warn("[server] Error disconnecting queue service:", error.message);
    }
  }

  if (idempotencyService) {
    try {
      await idempotencyService.disconnect();
    } catch (error) {
      console.warn("[server] Error disconnecting idempotency service:", error.message);
    }
  }

  await disconnectDatabase();
  console.log("[server] ✓ Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/* eslint-disable-next-line unicorn/prefer-top-level-await */
startServer();

module.exports = app;
