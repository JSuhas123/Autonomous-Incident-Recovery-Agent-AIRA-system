require("dotenv").config();

// CRITICAL: Validate required environment variables before anything else loads.
// This exits the process immediately with a descriptive message if a required
// secret or connection string is missing — preventing silent misconfiguration.
const { validateEnvironment } = require("./config/startupValidator");
validateEnvironment();

const express = require("express");
const cors = require("cors");
const http = require("http");
const mongoose = require("mongoose");

// CRITICAL: Initialize and validate feature flags before any other system starts
const featureFlags = require("./config/featureFlags");

const coreApiRoutes = require("./routes/coreApiRoutes");
const approvalRoutes = require("./routes/approvalRoutes");
const policyManagementRoutes = require("./routes/policyManagementRoutes");
const effectivenessRoutes = require("./routes/effectivenessRoutes");
const confidenceRoutes = require("./routes/confidenceRoutes");
const integrationRoutes = require("./routes/integrationRoutes");
const executionModesRoutes = require("./routes/executionModesRoutes");
const reportingRoutes = require("./routes/reportingRoutes");
const runbookRoutes = require("./routes/runbookRoutes");
const actionLogRoutes = require("./routes/actionLogRoutes");


const { errorHandler } = require("./middleware/errorHandler");

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

const { correlationIdMiddleware } = require("./middleware/correlationIdMiddleware");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Global middleware
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000").split(",").map(s => s.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
  })
);
app.use(express.json());

// CRITICAL AUDIT: Add correlation ID tracking (must be early)
app.use(correlationIdMiddleware);

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

/**
 * Internal-endpoint token guard.
 * Protects /metrics and /health/detailed from unauthenticated access.
 *
 * Callers must supply:  Authorization: Bearer <INTERNAL_API_TOKEN>
 *
 * In production set INTERNAL_API_TOKEN to a strong random secret.
 * In development/test the guard is skipped when the env var is absent so
 * that local tooling continues to work without configuration.
 */
function internalTokenGuard(req, res, next) {
  const token = process.env.INTERNAL_API_TOKEN;
  // If no token is configured (dev / test), allow through.
  if (!token) return next();

  const authHeader = req.headers["authorization"] || "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!provided) {
    return res.status(401).set("WWW-Authenticate", "Bearer").json({
      error: "Missing Authorization header",
      code: "MISSING_AUTH_HEADER",
    });
  }

  // Constant-time comparison to prevent timing attacks.
  let match = false;
  try {
    const crypto = require("crypto");
    match = crypto.timingSafeEqual(
      Buffer.from(provided.padEnd(token.length)),
      Buffer.from(token.padEnd(provided.length))
    ) && provided.length === token.length;
  } catch (_) {
    match = false;
  }

  if (!match) {
    return res.status(403).json({ error: "Forbidden", code: "INVALID_INTERNAL_TOKEN" });
  }
  next();
}

// Metrics endpoint (Prometheus format)
// Protected: requires Authorization: Bearer <INTERNAL_API_TOKEN> when the env var is set.
app.get("/metrics", internalTokenGuard, async (req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  const metrics = await metricsService.getMetrics();
  res.send(metrics);
});

// Extended health endpoint with dependencies
// CRITICAL FIX #3: Reports detailed system state for debugging
// Protected: same INTERNAL_API_TOKEN guard as /metrics.
app.get("/health/detailed", internalTokenGuard, async (req, res) => {
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
// Protected: same INTERNAL_API_TOKEN guard.
app.get("/health/multi-instance", internalTokenGuard, async (req, res) => {
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

/**
 * PHASE 2: POLICY MANAGEMENT API
 * 
 * Schema validation, dry-run, and automatic rollback
 * - POST /policy/validate - Validate policy against schema
 * - POST /policy/dry-run - Simulate action without executing
 * - POST /policy/create-version - Create new policy version
 * - POST /policy/activate-version - Activate specific version
 * - POST /policy/rollback - Manually rollback to previous version
 * - GET /policy/version-history - Retrieve version history
 * - GET /policy/rollback-history - View rollback events
 */
app.use("/api/v1/policy", policyManagementRoutes);

/**
 * PHASE 3: ACTION EFFECTIVENESS METRICS API
 * 
 * Track and analyze effectiveness of AIRA actions
 * - POST /effectiveness/record-before - Record pre-action metrics
 * - POST /effectiveness/record-after - Record post-action metrics
 * - GET /effectiveness/:traceId - Get metrics for specific decision
 * - GET /effectiveness/compare/actions - Compare actions by effectiveness
 * - GET /effectiveness/pattern/:pattern - Get pattern-specific effectiveness
 * - GET /effectiveness/trends/:action - Get effectiveness trends over time
 */
app.use("/api/v1/effectiveness", effectivenessRoutes);

/**
 * PHASE 4: ADAPTIVE CONFIDENCE CALIBRATION API
 * 
 * Dynamically adjust confidence weights based on historical accuracy
 * - POST /confidence/record-prediction - Record confidence prediction
 * - POST /confidence/record-outcome - Record actual outcome
 * - GET /confidence/weights - Get current calibration weights
 * - POST /confidence/recalibrate - Recalibrate weights
 * - GET /confidence/accuracy/by-action - Accuracy breakdown by action
 * - GET /confidence/accuracy/by-pattern - Accuracy breakdown by pattern
 * - GET /confidence/trends - Confidence trends over time
 * - POST /confidence/adjust-confidence - Apply weight adjustment
 */
app.use("/api/v1/confidence", confidenceRoutes);

/**
 * PHASE 5: INTEGRATIONS API
 * 
 * Slack notifications and webhook ingestion from external monitoring systems
 * - POST /integrations/webhooks/register - Register webhook source
 * - POST /integrations/webhooks/ingest - Receive webhook event
 * - POST /integrations/webhooks/:eventId/decision - Record AIRA decision
 * - GET /integrations/webhooks/history - Webhook event history
 * - GET /integrations/webhooks/stats - Webhook statistics
 * - POST /integrations/slack/notify - Send Slack notification
 * - POST /integrations/webhooks/datadog - Datadog webhook endpoint
 * - POST /integrations/webhooks/prometheus - Prometheus webhook endpoint
 */
app.use("/api/v1/integrations", integrationRoutes);

/**
 * PHASE 8: EXECUTION MODES API
 * 
 * Manage AUTO, APPROVAL, and SUGGEST_ONLY execution modes
 * - POST /execution/config/default-mode - Set default execution mode
 * - POST /execution/config/action-mode - Set mode for specific action
 * - POST /execution/requests - Create execution request
 * - POST /execution/requests/:traceId/approve - Approve request
 * - POST /execution/requests/:traceId/reject - Reject request
 * - POST /execution/requests/:traceId/execute - Start execution
 * - POST /execution/requests/:traceId/complete - Mark as completed
 * - GET /execution/approvals/pending - Get pending approvals
 * - GET /execution/stats - Execution statistics
 */
app.use("/api/v1/execution", executionModesRoutes);

/**
 * PHASE 10: REPORTING API
 * 
 * Generate comprehensive reports on effectiveness, failures, and recommendations
 * - POST /reports/effectiveness - Generate effectiveness report
 * - POST /reports/failure-analysis - Generate failure analysis report
 * - POST /reports/confidence-calibration - Generate calibration report
 * - POST /reports/executive-summary - Generate executive summary
 * - GET /reports - List all reports
 * - GET /reports/:reportId - Get specific report
 * - POST /reports/:reportId/archive - Archive report
 */
app.use("/api/v1/reports", reportingRoutes);

/**
 * RUNBOOK MANAGEMENT API
 *
 * Manage and execute automated runbooks
 * - GET /runbooks - List runbooks (filter by incidentType, enabled)
 * - GET /runbooks/:runbookId - Get specific runbook
 * - POST /runbooks - Create runbook
 * - PUT /runbooks/:runbookId - Update runbook
 */
app.use("/api/v1/tenants/:tenantId/runbooks", runbookRoutes);

/**
 * ACTION LOG API
 *
 * Retrieve action execution history
 * - GET /action-logs - List recent action logs
 */
app.use("/api/v1/tenants/:tenantId/action-logs", actionLogRoutes);

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

// Centralized error handler — must be registered AFTER all routes.
app.use(errorHandler);

// ---------------------------------------------------------------------------
// populateSampleData() HAS BEEN REMOVED FROM SERVER STARTUP.
// To seed a development or demo environment run:
//   node backend/scripts/seed-dev-data.js
// ---------------------------------------------------------------------------

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

    // 3. (Sample data seeding removed from production startup)
    // Run `node backend/scripts/seed-dev-data.js` in development/demo environments.

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
      const { setMockFallback } = require("./services/infrastructure/queueService");
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
      const { setMockFallback } = require("./services/infrastructure/idempotencyService");
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
