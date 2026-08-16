require("dotenv").config();

// CRITICAL: Validate required environment variables before anything else loads.
// This exits the process immediately with a descriptive message if a required
// secret or connection string is missing — preventing silent misconfiguration.
const {
  validateEnvironment,
} = require(
  "./config/startupValidator"
);

validateEnvironment();

const express =
  require(
    "express"
  );

const cors =
  require(
    "cors"
  );

const http =
  require(
    "http"
  );

const mongoose =
  require(
    "mongoose"
  );

// CRITICAL: Initialize and validate feature flags before any other system starts
const featureFlags =
  require(
    "./config/featureFlags"
  );

const coreApiRoutes =
  require(
    "./routes/coreApiRoutes"
  );

const approvalRoutes =
  require(
    "./routes/approvalRoutes"
  );

const policyManagementRoutes =
  require(
    "./routes/policyManagementRoutes"
  );

const effectivenessRoutes =
  require(
    "./routes/effectivenessRoutes"
  );

const confidenceRoutes =
  require(
    "./routes/confidenceRoutes"
  );

const integrationRoutes =
  require(
    "./routes/integrationRoutes"
  );

const executionModesRoutes =
  require(
    "./routes/executionModesRoutes"
  );

const reportingRoutes =
  require(
    "./routes/reportingRoutes"
  );

const dashboardRoutes =
  require(
    "./routes/dashboardRoutes"
  );

const serviceRoutes =
  require(
    "./routes/serviceRoutes"
  );

const {
  topLevelRouter:
    monitorTopLevelRoutes,
} =
  require(
    "./routes/monitorRoutes"
  );

const incidentRoutes =
  require(
    "./routes/incidentRoutes"
  );

const runbookRoutes =
  require(
    "./routes/runbookRoutes"
  );

const playbookRoutes =
  require(
    "./routes/playbookRoutes"
  );

const inventoryRoutes =
  require(
    "./routes/inventoryRoutes"
  );

const actionLogRoutes =
  require(
    "./routes/actionLogRoutes"
  );

const environmentRoutes =
  require(
    "./routes/environmentRoutes"
  );

const developmentRoutes =
  require(
    "./routes/developmentRoutes"
  );

const {
  errorHandler,
} =
  require(
    "./middleware/errorHandler"
  );

const {
  MonitorScheduler,
} =
  require(
    "./services/monitoring/monitorScheduler"
  );

// PHASE 1 SAFETY: Import kill switch and sanitization middleware
const {
  sanitizationMiddleware,
  testXSSPayloads,
} =
  require(
    "./middleware/sanitizationMiddleware"
  );

const {
  killSwitchEnforcementMiddleware,
  killSwitchStatusEndpoint,
  killSwitchControlEndpoint,
} =
  require(
    "./middleware/killSwitchMiddleware"
  );

const {
  confidenceCheckMiddleware,
  confidenceThresholdsEndpoint,
  confidenceThresholdsUpdateEndpoint,
} =
  require(
    "./config/confidenceThresholds"
  );

const recoveryDecisionRoutes =
  require(
    "./routes/recoveryDecisionRoutes"
  );

const executionRoutes =
  require(
    "./routes/executionRoutes"
  );

const {
  dbService,
} =
  require(
    "./services/infrastructure"
  );

const {
  metricsService,
  loggingService,
  distributedLockService,
  systemHealthService,
  memoryCleanupJob,
  retryProcessorJob,
  retryHandler,
} =
  require(
    "./services/infrastructure"
  );

const MultiInstanceCoordinator =
  require(
    "./services/infrastructure/multiInstanceCoordinator"
  );

const authMiddleware =
  require(
    "./middleware/authMiddleware"
  );

const dualAuthMiddleware =
  require(
    "./middleware/dualAuthMiddleware"
  );

const {
  tenantIsolationMiddleware,
  auditDataAccessMiddleware,
} =
  require(
    "./middleware/tenantIsolationMiddleware"
  );

const cookieParser =
  require(
    "cookie-parser"
  );

const authRoutes =
  require(
    "./routes/authRoutes"
  );

const {
  csrfProtection,
} =
  require(
    "./middleware/csrfMiddleware"
  );

const {
  sessionAuthMiddleware,
} =
  require(
    "./middleware/sessionAuthMiddleware"
  );

const {
  requestContextMiddleware,
} =
  require(
    "./middleware/requestContextMiddleware"
  );

const {
  environmentContextMiddleware,
} =
  require(
    "./middleware/environmentContextMiddleware"
  );

const {
  rateLimitingMiddleware,
} =
  require(
    "./middleware/rateLimitingMiddleware"
  );

const {
  validateInput,
} =
  require(
    "./middleware/inputValidationMiddleware"
  );

const {
  browserEnvironmentContext,
} =
  require(
    "./middleware/contextMiddleware"
  );

const {
  connectDatabase,
  disconnectDatabase,
} =
  dbService;

const {
  getQueueService,
} =
  require(
    "./services/infrastructure/queueService"
  );

const {
  getIdempotencyService,
} =
  require(
    "./services/infrastructure/idempotencyService"
  );

const {
  runbookExecutionService,
} =
  require(
    "./services/execution"
  );

const {
  getK8sClient,
} =
  require(
    "./services/k8s"
  );

const signalRoutes =
  require(
    "./routes/signalRoutes"
  );

const diagnosisRoutes =
  require(
    "./routes/diagnosisRoutes"
  );

const {
  correlationIdMiddleware,
} =
  require(
    "./middleware/correlationIdMiddleware"
  );

const diagnosisQueueConsumer =
  require(
    "./services/diagnosis/diagnosisQueueConsumer"
  );

const {
  createWorkflowOutboxComposition,
} =
  require(
    "./services/workflowOutbox/workflowOutboxComposition"
  );

const {
  WorkflowOutboxRuntimeController,
} =
  require(
    "./services/workflowOutbox/workflowOutboxRuntimeController"
  );

const {
  WorkflowOutboxConsumerRegistry,
} =
  require(
    "./services/workflowOutbox/workflowOutboxConsumerRegistry"
  );

 // ============================================================================
// PHASE 11.4 — WORKFLOW REPLAY / RECOVERY
// ============================================================================

const replayRuntimeIntegration =
  require(
    "./services/replayOrchestration/replayRuntimeIntegration"
  );

const recoveryDecisionOutboxHandoffService =
  require(
    "./services/workflowOutbox/recoveryDecisionOutboxHandoffService"
  );

const executionVerificationOutboxHandoffService =
  require(
    "./services/workflowOutbox/executionVerificationOutboxHandoffService"
  );

const verificationLifecycleOutboxHandoffService =
  require(
    "./services/workflowOutbox/verificationLifecycleOutboxHandoffService"
  );

const {
  RUNTIME_STAGE,
} =
  require(
    "./services/recoveryRuntime/recoveryRuntimeContracts"
  );

const app =
  express();

const PORT =
  Number(
    process.env.PORT
  ) ||
  5000;

const verificationRoutes =
  require(
    "./routes/verificationRoutes"
  );

const lifecycleRoutes =
  require(
    "./routes/lifecycleRoutes"
  );

// ---------------------------------------------------------------------------
// CORS configuration
// ---------------------------------------------------------------------------

const PRODUCTION_FRONTENDS = [
  "https://autonomous-incident-recovery-agent-ten.vercel.app",
  "https://autonomous-incident-recovery-agent-aira-system-id1961ym5.vercel.app",
];

const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  ...PRODUCTION_FRONTENDS,
].join(
  ","
);

function parseOrigins(
  raw
) {
  if (
    !raw
  ) {
    return [];
  }

  return raw
    .split(
      ","
    )
    .map(
      (
        value
      ) =>
        value
          .trim()
          .replace(
            /\/+$/,
            ""
          )
    )
    .filter(
      Boolean
    );
}

const allowedOrigins =
  parseOrigins(
    process.env
      .CORS_ORIGINS ||
      DEFAULT_ORIGINS
  );

// Safe startup log — no secrets
console.log(
  `[server] CORS: ${allowedOrigins.length} allowed origin(s) | env=${process.env.NODE_ENV || "development"} | credentials=true`
);

if (
  process.env.NODE_ENV ===
  "production"
) {
  const missing =
    PRODUCTION_FRONTENDS
      .filter(
        (
          origin
        ) =>
          !allowedOrigins
            .includes(
              origin
            )
      );

  if (
    missing.length
  ) {
    console.warn(
      `[server] ⚠️  CORS: missing production origin(s): ${missing.join(", ")}`
    );
  }
}

const corsOptions = {
  origin(
    origin,
    callback
  ) {
    // Allow requests without Origin (server-to-server, curl, health checks)
    if (
      !origin
    ) {
      return callback(
        null,
        true
      );
    }

    const normalized =
      origin.replace(
        /\/+$/,
        ""
      );

    if (
      allowedOrigins
        .includes(
          normalized
        )
    ) {
      return callback(
        null,
        true
      );
    }

    // Return controlled false — do NOT throw, which would produce a 500
    console.warn(
      `[cors] Rejected origin: ${origin}`
    );

    callback(
      null,
      false
    );
  },

  credentials:
    true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Authorization",
    "Content-Type",
    "X-Idempotency-Key",
    "X-Signature",
    "X-Timestamp",
    "X-Request-Id",
    "X-CSRF-Token",
    "X-AIRA-Environment-Id",
    "Accept",
  ],

  exposedHeaders: [
    "X-Request-Id",
    "Retry-After",
    "X-Correlation-ID",
    "X-AIRA-Environment-Id",
  ],

  optionsSuccessStatus:
    204,

  maxAge:
    86400,
};

// 1. CORS headers on every response (including preflight)
app.use(
  cors(
    corsOptions
  )
);

// 2. Respond 204 to all OPTIONS requests immediately — before any auth middleware
app.use(
  (
    req,
    res,
    next
  ) => {
    if (
      req.method ===
      "OPTIONS"
    ) {
      return res
        .status(
          204
        )
        .end();
    }

    next();
  }
);

app.use(
  express.json()
);

app.use(
  cookieParser()
);

// CRITICAL AUDIT: Add correlation ID tracking (must be early)
app.use(
  correlationIdMiddleware
);

app.use(
  "/api",
  recoveryDecisionRoutes
);

// Human auth routes mount before sanitization so passwords are not XSS-stripped
app.use(
  "/api/v1/auth",
  authRoutes
);

app.use(
  "/api/v1/environments",
  environmentRoutes
);

/*
 * LOCAL/DEVELOPMENT tooling.
 *
 * The router independently refuses all access when
 * NODE_ENV === "production".
 */
app.use(
  "/api/v1/dev",
  developmentRoutes
);

app.use(
  "/api",
  sessionAuthMiddleware,
  requestContextMiddleware,
  environmentContextMiddleware,
  executionRoutes,
  verificationRoutes,
  lifecycleRoutes
);

// PHASE 1 SAFETY: Apply sanitization and kill switch enforcement
app.use(
  sanitizationMiddleware(
    null,
    {
      allowRichText:
        false,
    }
  )
);

app.use(
  killSwitchEnforcementMiddleware()
);

app.use(
  confidenceCheckMiddleware
);

app.use(
  "/api/v1/signals",
  sessionAuthMiddleware,
  browserEnvironmentContext,
  signalRoutes
);

const recoveryDecisionQueueConsumer =
  require(
    "./services/recovery/recoveryDecisionQueueConsumer"
  );

// Health check endpoint (no auth required)
app.get(
  "/",
  (
    req,
    res
  ) => {
    res.json({
      message:
        "Lean Incident Response Decision Engine API",

      version:
        "2.0.0",

      status:
        "running",

      note:
        "This system focuses exclusively on safe decision-making. Use external systems for observability.",
    });
  }
);

// Lightweight liveness probe — always 200 once Express is up
app.get(
  "/health/live",
  (
    req,
    res
  ) => {
    res
      .status(
        200
      )
      .json({
        status:
          "ok",
      });
  }
);

// Health check for orchestration
app.get(
  "/health",
  (
    req,
    res
  ) => {
    const systemHealth =
      systemHealthService
        .getHealthStatus();

    const statusCode =
      systemHealth
        .safeMode
        ? 503
        : 200;

    res
      .status(
        statusCode
      )
      .json({
        status:
          systemHealth
            .safeMode
            ? "degraded"
            : "ok",

        timestamp:
          new Date()
            .toISOString(),

        safeMode:
          systemHealth
            .safeMode,

        redis: {
          connected:
            systemHealth
              .redis
              .connected,
        },

        warnings:
          systemHealth
            .warnings
            .length >
          0
            ? systemHealth
                .warnings
            : undefined,
      });
  }
);

/**
 * Internal-endpoint token guard.
 */
function internalTokenGuard(
  req,
  res,
  next
) {
  const token =
    process.env
      .INTERNAL_API_TOKEN;

  if (
    !token
  ) {
    return next();
  }

  const authHeader =
    req.headers[
      "authorization"
    ] ||
    "";

  const provided =
    authHeader
      .startsWith(
        "Bearer "
      )
      ? authHeader.slice(
          7
        )
      : "";

  if (
    !provided
  ) {
    return res
      .status(
        401
      )
      .set(
        "WWW-Authenticate",
        "Bearer"
      )
      .json({
        error:
          "Missing Authorization header",

        code:
          "MISSING_AUTH_HEADER",
      });
  }

  let match =
    false;

  try {
    const crypto =
      require(
        "crypto"
      );

    match =
      crypto
        .timingSafeEqual(
          Buffer.from(
            provided.padEnd(
              token.length
            )
          ),

          Buffer.from(
            token.padEnd(
              provided.length
            )
          )
        ) &&
      provided.length ===
        token.length;
  } catch (
    error
  ) {
    match =
      false;
  }

  if (
    !match
  ) {
    return res
      .status(
        403
      )
      .json({
        error:
          "Forbidden",

        code:
          "INVALID_INTERNAL_TOKEN",
      });
  }

  next();
}

// Metrics endpoint
app.get(
  "/metrics",
  internalTokenGuard,
  async (
    req,
    res
  ) => {
    res.set(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    const metrics =
      await metricsService
        .getMetrics();

    res.send(
      metrics
    );
  }
);

// Extended health endpoint
app.get(
  "/health/detailed",
  internalTokenGuard,
  async (
    req,
    res
  ) => {
    try {
      const currentQueueService =
        await getQueueService();

      const currentIdempotencyService =
        await getIdempotencyService();

      const systemHealth =
        systemHealthService
          .getHealthStatus();

      const outboxRuntimeStatus =
        workflowOutboxRuntime
          ? workflowOutboxRuntime
              .getStatus()
          : null;

      const outboxConsumerStatus =
        workflowOutboxConsumers
          ? workflowOutboxConsumers
              .getStatus()
          : null;

      const health = {
        status:
          systemHealth
            .safeMode
            ? "degraded"
            : "healthy",

        timestamp:
          new Date()
            .toISOString(),

        deploymentMode:
          systemHealth
            .deploymentMode,

        safeMode:
          systemHealth
            .safeMode,

        featureFlags: {
          summary:
            `${featureFlags.getAllFlags().filter(flag => flag.enabled).length}/${featureFlags.getAllFlags().length} enabled`,

          enabled:
            featureFlags
              .getAllFlags()
              .filter(
                (
                  flag
                ) =>
                  flag.enabled
              )
              .map(
                (
                  flag
                ) =>
                  flag.name
              ),

          disabled:
            featureFlags
              .getAllFlags()
              .filter(
                (
                  flag
                ) =>
                  !flag.enabled
              )
              .map(
                (
                  flag
                ) =>
                  flag.name
              ),
        },

        components: {
          database:
            "connected",

          queue:
            currentQueueService
              ? currentQueueService
                  .connected
                ? "connected"
                : "disconnected"
              : "not-initialized",

          idempotency:
            currentIdempotencyService
              ? currentIdempotencyService
                  .connected
                ? "connected"
                : "disconnected"
              : "not-initialized",

          redis: {
            connected:
              systemHealth
                .redis
                .connected,

            failureStartTime:
              systemHealth
                .redis
                .failureStartTime,
          },

          memoryCleanup:
            memoryCleanupJob
              .isRunning
              ? "running"
              : "stopped",

          workflowOutbox: {
            composition:
              workflowOutboxComposition
                ? "initialized"
                : "not-initialized",

            runtime:
              outboxRuntimeStatus,

            consumers:
              outboxConsumerStatus,
          },

          replayRecovery: {
  initialized:
    replayRecoveryStatus
      .initialized,

  startupRecoveryCompleted:
    replayRecoveryStatus
      .startupRecoveryCompleted,

  discovered:
    replayRecoveryStatus
      .discovered,

  recovered:
    replayRecoveryStatus
      .recovered,

  failed:
    replayRecoveryStatus
      .failed,

  lastRunAt:
    replayRecoveryStatus
      .lastRunAt,

  lastError:
    replayRecoveryStatus
      .lastError,
},
        },

        warnings:
          systemHealth
            .warnings,

        canExecuteActions:
          systemHealthService
            .canExecuteActions(),

        diagnostics:
          systemHealth
            .safeMode
            ? systemHealthService
                .getDiagnostics()
            : undefined,
      };

      res
        .status(
          systemHealth
            .safeMode
            ? 503
            : 200
        )
        .json(
          health
        );
    } catch (
      error
    ) {
      res
        .status(
          503
        )
        .json({
          status:
            "unhealthy",

          error:
            error.message,
        });
    }
  }
);

// Multi-instance coordination endpoint
app.get(
  "/health/multi-instance",
  internalTokenGuard,
  async (
    req,
    res
  ) => {
    try {
      if (
        !global
          .multiInstanceCoordinator
      ) {
        return res
          .status(
            503
          )
          .json({
            error:
              "Multi-instance coordinator not initialized",
          });
      }

      const status =
        await global
          .multiInstanceCoordinator
          .getStatus();

      res.json(
        status
      );
    } catch (
      error
    ) {
      res
        .status(
          503
        )
        .json({
          error:
            error.message,
        });
    }
  }
);

// ---------------------------------------------------------------------------
// MACHINE INGESTION ROUTES
// ---------------------------------------------------------------------------

const machineIngestionRoutes =
  require(
    "./routes/machineIngestionRoutes"
  );

app.post(
  "/api/v1/tenants/:tenantId/signals",
  authMiddleware,
  tenantIsolationMiddleware,
  rateLimitingMiddleware(
    "api"
  ),
  (
    req,
    res,
    next
  ) =>
    machineIngestionRoutes(
      req,
      res,
      next
    )
);

app.post(
  "/api/v1/tenants/:tenantId/actions/:id/dry-run",
  authMiddleware,
  tenantIsolationMiddleware,
  rateLimitingMiddleware(
    "api"
  ),
  (
    req,
    res,
    next
  ) =>
    machineIngestionRoutes(
      req,
      res,
      next
    )
);

// ---------------------------------------------------------------------------
// BROWSER SESSION AUTH
// ---------------------------------------------------------------------------

const {
  requireOrgAccess,
} =
  require(
    "./middleware/orgAuthMiddleware"
  );

const browserTenantAuth = [
  sessionAuthMiddleware,

  requireOrgAccess(),

  requestContextMiddleware,

  environmentContextMiddleware,

  rateLimitingMiddleware(
    "api"
  ),
];

app.use(
  "/api/v1/tenants/:tenantId",
  browserTenantAuth,
  coreApiRoutes
);

app.use(
  "/api/v1/tenants/:tenantId/approvals",
  browserTenantAuth,
  approvalRoutes
);

app.use(
  "/api/v1/policy",
  sessionAuthMiddleware,
  policyManagementRoutes
);

app.use(
  "/api/v1/effectiveness",
  sessionAuthMiddleware,
  effectivenessRoutes
);

app.use(
  "/api/v1/confidence",
  sessionAuthMiddleware,
  confidenceRoutes
);

app.use(
  "/api/v1/integrations",
  integrationRoutes
);

app.use(
  "/api/v1/execution",
  sessionAuthMiddleware,
  executionModesRoutes
);

app.use(
  "/api/v1/reports",
  sessionAuthMiddleware,
  reportingRoutes
);

app.use(
  "/api/v1/dashboard",
  sessionAuthMiddleware,
  dashboardRoutes
);

app.use(
  "/api/v1/services",
  sessionAuthMiddleware,
  browserEnvironmentContext,
  serviceRoutes
);

app.use(
  "/api/v1/inventory",
  sessionAuthMiddleware,
  requestContextMiddleware,
  environmentContextMiddleware,
  inventoryRoutes
);

app.use(
  "/api/v1/monitors",
  sessionAuthMiddleware,
  monitorTopLevelRoutes
);

app.use(
  "/api/v1/incidents",
  sessionAuthMiddleware,
  browserEnvironmentContext,
  incidentRoutes
);

// AGENT INTELLIGENCE PLATFORM
const agentIntelligenceRoutes =
  require(
    "./routes/agentIntelligenceRoutes"
  );

app.use(
  "/api/v1/agent-intelligence",
  sessionAuthMiddleware,
  agentIntelligenceRoutes
);

app.use(
  "/api/v1/integration-definitions",
  (
    req,
    res,
    next
  ) => {
    req.url =
      "/definitions" +
      req.url
        .replace(
          /^\/?/,
          "/"
        )
        .replace(
          /^\/\//,
          "/"
        );

    integrationRoutes(
      req,
      res,
      next
    );
  }
);

app.use(
  "/api/v1/tenants/:tenantId/runbooks",
  browserTenantAuth,
  runbookRoutes
);

app.use(
  "/api/v1/tenants/:tenantId/playbooks",
  browserTenantAuth,
  playbookRoutes
);

app.use(
  "/api/v1/tenants/:tenantId/action-logs",
  browserTenantAuth,
  actionLogRoutes
);

// ============================================================================
// PHASE 1 SAFETY CONTROL ENDPOINTS
// ============================================================================

app.get(
  "/api/v1/safety/kill-switches",
  sessionAuthMiddleware,
  killSwitchStatusEndpoint
);

app.post(
  "/api/v1/safety/kill-switches",
  authMiddleware,
  killSwitchControlEndpoint
);

app.get(
  "/api/v1/safety/thresholds",
  sessionAuthMiddleware,
  confidenceThresholdsEndpoint
);

app.post(
  "/api/v1/safety/thresholds",
  authMiddleware,
  confidenceThresholdsUpdateEndpoint
);

app.get(
  "/api/v1/safety/xss-test",
  (
    req,
    res
  ) => {
    if (
      process.env.NODE_ENV ===
      "production"
    ) {
      return res
        .status(
          403
        )
        .json({
          error:
            "XSS testing not available in production",
        });
    }

    const results =
      testXSSPayloads(
        false
      );

    res.json({
      timestamp:
        new Date()
          .toISOString(),

      environment:
        process.env.NODE_ENV,

      summary: {
        totalTests:
          results.total,

        passed:
          results.passed,

        failed:
          results.total -
          results.passed,
      },

      details:
        results.results,
    });
  }
);

// Centralized error handler — must be registered AFTER all routes.
app.use(
  errorHandler
);

// ---------------------------------------------------------------------------
// RUNTIME REFERENCES
// ---------------------------------------------------------------------------

let serverInstance;
let queueService;
let idempotencyService;
let apolloServer;
let lockService;
let rateLimitService;

// ============================================================================
// PHASE 11.3 DURABLE WORKFLOW RUNTIME
// ============================================================================

let workflowOutboxComposition =
  null;

let workflowOutboxRuntime =
  null;

let workflowOutboxConsumers =
  null;

  // ============================================================================
// PHASE 11.4 REPLAY RECOVERY STATE
// ============================================================================

let replayRecoveryStatus = {
  initialized:
    false,

  startupRecoveryCompleted:
    false,

  discovered:
    0,

  recovered:
    0,

  failed:
    0,

  lastRunAt:
    null,

  lastError:
    null,
};

// ============================================================================
// PHASE 11.4 DURABLE REPLAY DISPATCH
// ============================================================================

async function dispatchDurableReplay({
  stage,
  job,
} = {}) {
  if (
    !stage ||
    !job
  ) {
    throw Object.assign(
      new Error(
        "Replay durable dispatch requires stage and job"
      ),
      {
        code:
          "REPLAY_DURABLE_DISPATCH_INPUT_REQUIRED",

        retryable:
          false,
      }
    );
  }

  if (
    job.executionAuthorized ===
    true
  ) {
    throw Object.assign(
      new Error(
        "Replay durable dispatch cannot carry execution authority"
      ),
      {
        code:
          "REPLAY_EXECUTION_AUTHORITY_FORBIDDEN",

        retryable:
          false,
      }
    );
  }

  let result;


  // --------------------------------------------------------------------------
  // RECOVERY DECISION → EXECUTION
  // --------------------------------------------------------------------------

  if (
    stage ===
    RUNTIME_STAGE
      .EXECUTION
  ) {
    result =
      await recoveryDecisionOutboxHandoffService
        .createExecutionRequestReady({
          ...job,

          executionAuthorized:
            false,
        });
  }


  // --------------------------------------------------------------------------
  // EXECUTION → VERIFICATION
  // --------------------------------------------------------------------------

  else if (
    stage ===
    RUNTIME_STAGE
      .VERIFICATION
  ) {
    result =
      await executionVerificationOutboxHandoffService
        .createVerificationRequested({
          ...job,

          executionAuthorized:
            false,
        });
  }


  // --------------------------------------------------------------------------
  // VERIFICATION → LIFECYCLE
  // --------------------------------------------------------------------------

  else if (
    stage ===
    RUNTIME_STAGE
      .LIFECYCLE
  ) {
    result =
      await verificationLifecycleOutboxHandoffService
        .createLifecycleRequested({
          ...job,

          executionAuthorized:
            false,
        });
  }


  else {
    throw Object.assign(
      new Error(
        `Unsupported replay durable stage: ${stage}`
      ),
      {
        code:
          "REPLAY_DURABLE_STAGE_UNSUPPORTED",

        stage,

        retryable:
          false,
      }
    );
  }


  if (
    result
      ?.executionAuthorized ===
    true
  ) {
    throw Object.assign(
      new Error(
        "Workflow outbox handoff returned forbidden execution authority"
      ),
      {
        code:
          "REPLAY_EXECUTION_AUTHORITY_FORBIDDEN",

        retryable:
          false,
      }
    );
  }


  /*
   * Normalize the durable event identity for DurableReplayService.
   *
   * Different handoff implementations may expose the persisted event
   * either directly or under an event/outboxEvent property.
   */
  return {
    ...(
      result ||
      {}
    ),

    eventId:
      result
        ?.eventId ||
      result
        ?.outboxEventId ||
      result
        ?.event
        ?.eventId ||
      result
        ?.outboxEvent
        ?.eventId ||
      null,

    executionAuthorized:
      false,
  };
}


// ============================================================================
// START SERVER
// ============================================================================

async function startServer() {
  try {
    console.log(
      "[server] Starting backend services..."
    );

    const startTime =
      Date.now();

    // =========================================================================
    // 1. DISTRIBUTED LOCK SERVICE
    // =========================================================================

    try {
      lockService =
        await distributedLockService
          .connect(
            process.env
              .REDIS_URL
          );

      console.log(
        "[server] ✓ Distributed lock service initialized"
      );
    } catch (
      error
    ) {
      console.warn(
        "[server] Lock service failed (non-fatal):",
        error.message
      );
    }

    // =========================================================================
    // 2. DATABASE
    // =========================================================================

    await connectDatabase();

    console.log(
      "[server] ✓ Database connected"
    );

    // =========================================================================
    // 2.5 DATABASE OPTIMIZATION
    // =========================================================================

    try {
      const databaseOptimization =
        require(
          "./services/infrastructure/databaseOptimization"
        );

      await databaseOptimization
        .createIndexes(
          mongoose
            .connection
            .db
        );

      databaseOptimization
        .startPeriodicOptimization();

      console.log(
        "[server] ✓ Database indexes created and optimization scheduled"
      );
    } catch (
      error
    ) {
      console.warn(
        "[server] Database optimization failed (non-fatal):",
        error.message
      );
    }

    // =========================================================================
    // 4. QUEUE SERVICE
    // =========================================================================

    let realQueueTransportAvailable =
      false;

    try {
      queueService =
        await getQueueService(
          process.env
            .RABBITMQ_URL
        );

      if (
        !queueService ||
        queueService
          .connected !==
          true
      ) {
        throw new Error(
          "RabbitMQ not connected"
        );
      }

      realQueueTransportAvailable =
        true;

      console.log(
        "[server] ✓ Queue service initialized"
      );
    } catch (
      error
    ) {
      console.warn(
        "[server] Queue service failed, using mock service:",
        error.message
      );

      const {
        setMockFallback,
      } =
        require(
          "./services/infrastructure/queueService"
        );

      setMockFallback();

      queueService =
        await getQueueService();

      realQueueTransportAvailable =
        false;

      console.log(
        "[server] ✓ Mock queue service initialized"
      );
    }

    // =========================================================================
    // 5. IDEMPOTENCY SERVICE
    // =========================================================================

    try {
      idempotencyService =
        await getIdempotencyService(
          process.env
            .REDIS_URL
        );

      if (
        !idempotencyService
          .connected
      ) {
        throw new Error(
          "Redis not connected"
        );
      }

      console.log(
        "[server] ✓ Idempotency service initialized"
      );
    } catch (
      error
    ) {
      console.warn(
        "[server] Idempotency service failed, using mock service:",
        error.message
      );

      const {
        setMockFallback,
      } =
        require(
          "./services/infrastructure/idempotencyService"
        );

      setMockFallback();

      idempotencyService =
        await getIdempotencyService();

      console.log(
        "[server] ✓ Mock idempotency service initialized"
      );
    }

    // =========================================================================
    // 5.1 EXISTING RABBITMQ CONSUMERS
    // =========================================================================

    if (
      realQueueTransportAvailable
    ) {
      try {
        await recoveryDecisionQueueConsumer
          .start();

        console.log(
          "[recovery] ✓ Recovery decision consumer ready"
        );
      } catch (
        error
      ) {
        console.error(
          "[recovery] Could not start recovery decision consumer:",
          error.message
        );
      }

      try {
        await diagnosisQueueConsumer
          .start();

        console.log(
          "[diagnosis] ✓ Async diagnosis consumer ready"
        );
      } catch (
        error
      ) {
        console.error(
          "[diagnosis] Failed to start diagnosis consumer:",
          error.message
        );
      }
    } else {
      console.warn(
        "[server] RabbitMQ unavailable — durable consumers disabled"
      );

      console.warn(
        "[server] Durable workflow records will remain persisted until transport recovers"
      );
    }

    // =========================================================================
    // 5.2 PHASE 11.3 DURABLE WORKFLOW CONSUMERS
    // =========================================================================

    if (
      realQueueTransportAvailable
    ) {
      try {
        workflowOutboxConsumers =
          new WorkflowOutboxConsumerRegistry({
            queueService,

            prefetch:
              Number(
                process.env
                  .WORKFLOW_OUTBOX_CONSUMER_PREFETCH
              ) ||
              1,

            logger:
              console,
          });

        const consumerResult =
          await workflowOutboxConsumers
            .start();

        console.log(
          `[workflow-outbox] ✓ Durable consumers ready count=${consumerResult.registrations.length}`
        );
      } catch (
        error
      ) {
        workflowOutboxConsumers =
          null;

        console.error(
          "[workflow-outbox] Durable consumer registration failed:",
          error.message
        );
      }
    }

    // =========================================================================
    // 5.3 PHASE 11.3 OUTBOX COMPOSITION
    // =========================================================================

    if (
      realQueueTransportAvailable &&
      workflowOutboxConsumers
    ) {
      try {
        workflowOutboxComposition =
          createWorkflowOutboxComposition({
            queueService,
          });

        console.log(
          "[workflow-outbox] ✓ Durable composition created"
        );
      } catch (
        error
      ) {
        workflowOutboxComposition =
          null;

        console.error(
          "[workflow-outbox] Composition failed:",
          error.message
        );
      }
    }

    // =========================================================================
    // 5.4 PHASE 11.3 OUTBOX RUNTIME
    // =========================================================================

    if (
      realQueueTransportAvailable &&
      workflowOutboxConsumers &&
      workflowOutboxComposition
    ) {
      try {
        const outboxWorker =
          workflowOutboxComposition
            .worker ||
          workflowOutboxComposition
            .workflowOutboxWorker;

        if (
          !outboxWorker
        ) {
          throw Object.assign(
            new Error(
              "Workflow outbox composition does not expose worker"
            ),
            {
              code:
                "WORKFLOW_OUTBOX_WORKER_MISSING",
            }
          );
        }

        workflowOutboxRuntime =
          new WorkflowOutboxRuntimeController({
            worker:
              outboxWorker,

            queueService,

            intervalMs:
              Number(
                process.env
                  .WORKFLOW_OUTBOX_POLL_INTERVAL_MS
              ) ||
              1000,

            logger:
              console,
          });

        const runtimeResult =
          workflowOutboxRuntime
            .start();

        if (
          runtimeResult
            .started !==
          true
        ) {
          throw Object.assign(
            new Error(
              `Workflow outbox runtime did not start: ${
                runtimeResult
                  .reason ||
                "UNKNOWN"
              }`
            ),
            {
              code:
                "WORKFLOW_OUTBOX_RUNTIME_NOT_STARTED",
            }
          );
        }

        console.log(
          `[workflow-outbox] ✓ Durable runtime started intervalMs=${runtimeResult.intervalMs}`
        );
      } catch (
        error
      ) {
        workflowOutboxRuntime =
          null;

        console.error(
          "[workflow-outbox] Runtime failed to start:",
          error.message
        );
      }
    }

    // =========================================================================
// 5.5 PHASE 11.4 — DURABLE REPLAY STARTUP RECOVERY
// =========================================================================

if (
  realQueueTransportAvailable &&
  workflowOutboxConsumers &&
  workflowOutboxComposition &&
  workflowOutboxRuntime
) {
  try {
    replayRecoveryStatus
      .initialized =
      true;

    const replayRecoveryResult =
      await replayRuntimeIntegration
        .recoverInterrupted({
          dispatchReplay:
            dispatchDurableReplay,
        });

    replayRecoveryStatus = {
      initialized:
        true,

      startupRecoveryCompleted:
        true,

      discovered:
        replayRecoveryResult
          .discovered ||
        0,

      recovered:
        replayRecoveryResult
          .recovered ||
        0,

      failed:
        replayRecoveryResult
          .failed ||
        0,

      lastRunAt:
        new Date(),

      lastError:
        null,
    };

    console.log(
      `[replay-recovery] ✓ Startup scan complete discovered=${replayRecoveryStatus.discovered} recovered=${replayRecoveryStatus.recovered} failed=${replayRecoveryStatus.failed}`
    );
  } catch (
    error
  ) {
    replayRecoveryStatus = {
      ...replayRecoveryStatus,

      initialized:
        true,

      startupRecoveryCompleted:
        false,

      lastRunAt:
        new Date(),

      lastError: {
        code:
          error.code ||
          "REPLAY_STARTUP_RECOVERY_FAILED",

        message:
          String(
            error.message ||
            "Replay startup recovery failed"
          )
            .slice(
              0,
              1024
            ),
      },
    };

    /*
     * Fail open for API availability, but fail CLOSED for replay.
     *
     * No replay action occurs here after an error.
     * Durable records remain persisted for future recovery.
     */
    console.error(
      "[replay-recovery] Startup recovery failed:",
      error.message
    );
  }
} else {
  replayRecoveryStatus = {
    ...replayRecoveryStatus,

    initialized:
      false,

    startupRecoveryCompleted:
      false,

    lastRunAt:
      new Date(),

    lastError: {
      code:
        "REPLAY_DURABLE_TRANSPORT_UNAVAILABLE",

      message:
        "Startup replay recovery skipped because durable workflow transport is unavailable.",
    },
  };

  console.warn(
    "[replay-recovery] Startup recovery skipped — durable workflow transport unavailable"
  );
}
    // =========================================================================
    // 6. MEMORY CLEANUP
    // =========================================================================

    memoryCleanupJob
      .start();

    console.log(
      "[server] ✓ Memory cleanup job started"
    );

    // =========================================================================
    // 7. RETRY PROCESSOR
    // =========================================================================

    retryProcessorJob
      .start();

    console.log(
      "[server] ✓ Retry processor job started"
    );

    // =========================================================================
    // 8. AGENT INTELLIGENCE PLATFORM
    // =========================================================================

    const {
      initializeAgentOrchestrator,
    } =
      require(
        "./agents/v2"
      );

    const {
      incidentPlaybookService,
    } =
      require(
        "./services/incidents"
      );

    const {
      memoryService,
    } =
      require(
        "./services/learning"
      );

    const {
      kubernetesInvestigationTools,
    } =
      require(
        "./agents/v2/tools"
      );

    initializeAgentOrchestrator({
      incidentPlaybookService,

      memoryService,

      kubernetesInvestigationTools,
    });

    console.log(
      "[server] ✓ V2 AgentOrchestrator initialized as authoritative runtime"
    );

    // =========================================================================
    // 8.5 FEATURE FLAGS
    // =========================================================================

    console.log(
      "\n[server] ═══════════════════════════════════════"
    );

    featureFlags
      .logStartupStatus(
        console
      );

    console.log(
      "[server] ═══════════════════════════════════════\n"
    );

    // =========================================================================
    // 8.75 MULTI-INSTANCE COORDINATION
    // =========================================================================

    try {
      const redisClient =
        distributedLockService
          .getRedisClient();

      const coordinator =
        new MultiInstanceCoordinator(
          redisClient
        );

      await coordinator
        .start();

      global
        .multiInstanceCoordinator =
        coordinator;

      console.log(
        "[server] ✓ Multi-instance coordinator started (heartbeat + leader election)"
      );
    } catch (
      error
    ) {
      console.warn(
        "[server] ⚠️  Multi-instance coordination failed:",
        error.message
      );

      console.log(
        "[server]    Continuing in single-instance mode"
      );
    }

    // =========================================================================
    // 8.9 KUBERNETES INTEGRATION
    // =========================================================================

    try {
      const k8sClient =
        getK8sClient();

      try {
        const connectivity =
          await k8sClient
            .verifyConnectivity();

        console.log(
          "[server] ✓ Kubernetes cluster connected:",
          {
            version:
              connectivity
                .version,
          }
        );
      } catch (
        k8sError
      ) {
        console.warn(
          "[server] ⚠️  Kubernetes connectivity check failed:",
          k8sError.message
        );

        console.log(
          "[server]    K8s operations will fail if attempted"
        );
      }

      runbookExecutionService
        .registerHandler(
          "kubernetes",
          async (
            step,
            context
          ) => {
            console.log(
              "[server] Executing Kubernetes step:",
              {
                stepName:
                  step.name,

                action:
                  step.action,

                resource:
                  step.params
                    ?.resource,
              }
            );

            const actionType =
              step.action;

            const params =
              step.params ||
              {};

            const correlationId =
              context
                .correlationId ||
              step
                .correlationId ||
              "unknown";

            try {
              const result =
                await k8sClient
                  .executeAction(
                    actionType,
                    params,
                    {
                      correlationId,
                    }
                  );

              return {
                status:
                  "SUCCESS",

                stepName:
                  step.name,

                action:
                  step.action,

                result,

                timestamp:
                  new Date(),
              };
            } catch (
              error
            ) {
              console.error(
                "[server] K8s action failed:",
                {
                  stepName:
                    step.name,

                  action:
                    step.action,

                  error:
                    error.message,

                  correlationId,
                }
              );

              return {
                status:
                  "FAILED",

                error:
                  error.message,

                stepName:
                  step.name,

                action:
                  step.action,

                timestamp:
                  new Date(),
              };
            }
          }
        );

      console.log(
        "[server] ✓ Kubernetes handler registered with runbook execution"
      );
    } catch (
      error
    ) {
      console.warn(
        "[server] ⚠️  Kubernetes integration failed:",
        error.message
      );

      console.log(
        "[server]    Kubernetes operations will not be available"
      );
    }

    // =========================================================================
    // 9. AUTONOMOUS MONITOR SCHEDULER
    // =========================================================================

    try {
      global.monitorScheduler =
        new MonitorScheduler({
          pollIntervalMs:
            Number(
              process.env
                .MONITOR_POLL_INTERVAL_MS
            ) ||
            5000,

          lockTimeoutMs:
            Number(
              process.env
                .MONITOR_LOCK_TIMEOUT_MS
            ) ||
            120000,

          maxConcurrency:
            Number(
              process.env
                .MONITOR_MAX_CONCURRENCY
            ) ||
            5,
        });

      await global
        .monitorScheduler
        .start();

      console.log(
        "[server] ✓ Monitor scheduler started"
      );
    } catch (
      error
    ) {
      console.error(
        "[server] Monitor scheduler failed to start:",
        error.message
      );

      global.monitorScheduler =
        null;
    }

    // =========================================================================
    // 10. HTTP SERVER
    // =========================================================================

    serverInstance =
      http
        .createServer(
          app
        );

    serverInstance
      .listen(
        PORT,
        "0.0.0.0",
        () => {
          const duration =
            Date.now() -
            startTime;

          console.log(
            `[server] ✓ Backend running on port ${PORT} (startup: ${duration}ms)`
          );

          console.log(
            "[server] Core API available at /api/v1/tenants/:tenantId/*"
          );

          console.log(
            "[server] Metrics available at /metrics (Prometheus format)"
          );

          console.log(
            "[server] Health endpoint at /health/detailed"
          );

          console.log(
            "[server] ✓ Decision Engine initialized"
          );

          console.log(
            "[server] Ready to accept requests"
          );
        }
      );
  } catch (
    error
  ) {
    console.error(
      "[server] Failed to start backend:",
      error
    );

    process.exit(
      1
    );
  }
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

async function shutdown(
  signal =
    "UNKNOWN"
) {
  if (
    shutdown.inProgress
  ) {
    return;
  }

  shutdown.inProgress =
    true;

  console.log(
    `\n[server] Shutting down signal=${signal}...`
  );

  // =========================================================================
  // 1. STOP DURABLE OUTBOX DRAINING FIRST
  // =========================================================================

  if (
    workflowOutboxRuntime
  ) {
    try {
      await workflowOutboxRuntime
        .stop({
          waitForCurrent:
            true,

          timeoutMs:
            Number(
              process.env
                .WORKFLOW_OUTBOX_SHUTDOWN_TIMEOUT_MS
            ) ||
            10000,
        });

      console.log(
        "[workflow-outbox] ✓ Durable runtime stopped"
      );
    } catch (
      error
    ) {
      console.warn(
        "[workflow-outbox] Runtime shutdown warning:",
        error.message
      );
    }
  }

  // =========================================================================
  // 2. STOP MULTI-INSTANCE COORDINATION
  // =========================================================================

  if (
    global
      .multiInstanceCoordinator
  ) {
    try {
      await global
        .multiInstanceCoordinator
        .stop();

      console.log(
        "[server] ✓ Multi-instance coordinator stopped"
      );
    } catch (
      error
    ) {
      console.warn(
        "[server] Multi-instance coordinator shutdown warning:",
        error.message
      );
    }
  }

  // =========================================================================
  // 3. STOP MONITOR SCHEDULER
  // =========================================================================

  if (
    global
      .monitorScheduler
  ) {
    try {
      await global
        .monitorScheduler
        .stop();

      console.log(
        "[server] ✓ Monitor scheduler stopped"
      );
    } catch (
      error
    ) {
      console.warn(
        "[server] Monitor scheduler shutdown warning:",
        error.message
      );
    }
  }

  // =========================================================================
  // 4. STOP BACKGROUND JOBS
  // =========================================================================

  try {
    memoryCleanupJob
      .stop();

    console.log(
      "[server] ✓ Memory cleanup job stopped"
    );
  } catch (
    error
  ) {
    console.warn(
      "[server] Memory cleanup shutdown warning:",
      error.message
    );
  }

  try {
    retryProcessorJob
      .stop();

    console.log(
      "[server] ✓ Retry processor job stopped"
    );
  } catch (
    error
  ) {
    console.warn(
      "[server] Retry processor shutdown warning:",
      error.message
    );
  }

  // =========================================================================
  // 5. STOP HTTP SERVER
  // =========================================================================

  if (
    serverInstance
  ) {
    try {
      await new Promise(
        (
          resolve
        ) => {
          serverInstance
            .close(
              resolve
            );
        }
      );

      console.log(
        "[server] ✓ HTTP server stopped"
      );
    } catch (
      error
    ) {
      console.warn(
        "[server] HTTP shutdown warning:",
        error.message
      );
    }
  }

  // =========================================================================
  // 6. DISCONNECT RABBITMQ
  // =========================================================================

  if (
    queueService &&
    typeof queueService
      .disconnect ===
      "function"
  ) {
    try {
      await queueService
        .disconnect();

      console.log(
        "[server] ✓ Queue service disconnected"
      );
    } catch (
      error
    ) {
      console.warn(
        "[server] Error disconnecting queue service:",
        error.message
      );
    }
  }

  // =========================================================================
  // 7. DISCONNECT IDEMPOTENCY SERVICE
  // =========================================================================

  if (
    idempotencyService &&
    typeof idempotencyService
      .disconnect ===
      "function"
  ) {
    try {
      await idempotencyService
        .disconnect();

      console.log(
        "[server] ✓ Idempotency service disconnected"
      );
    } catch (
      error
    ) {
      console.warn(
        "[server] Error disconnecting idempotency service:",
        error.message
      );
    }
  }

  // =========================================================================
  // 8. DISCONNECT DATABASE LAST
  // =========================================================================

  try {
    await disconnectDatabase();

    console.log(
      "[server] ✓ Database disconnected"
    );
  } catch (
    error
  ) {
    console.warn(
      "[server] Database shutdown warning:",
      error.message
    );
  }

  console.log(
    "[server] ✓ Shutdown complete"
  );

  process.exit(
    0
  );
}

shutdown.inProgress =
  false;

process.on(
  "SIGINT",
  () =>
    shutdown(
      "SIGINT"
    )
);

process.on(
  "SIGTERM",
  () =>
    shutdown(
      "SIGTERM"
    )
);

/* eslint-disable-next-line unicorn/prefer-top-level-await */
startServer();

module.exports =
  app;