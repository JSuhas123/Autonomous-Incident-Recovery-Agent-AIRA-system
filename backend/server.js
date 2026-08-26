require("dotenv").config();

/**
 * ============================================================================
 * AIRA STARTUP ENVIRONMENT NORMALIZATION
 * ============================================================================
 *
 * PostgreSQL is the authoritative persistence provider for the current AIRA
 * runtime.
 *
 * Railway and other production platforms inject environment variables directly
 * rather than loading backend/.env.example. Because of that, POSTGRES_ENABLED
 * may legitimately be absent even though PERSISTENCE_PROVIDER=postgres.
 *
 * When PostgreSQL is explicitly selected and POSTGRES_ENABLED is NOT supplied,
 * default it to true.
 *
 * IMPORTANT:
 * - We only default an absent value.
 * - We DO NOT override POSTGRES_ENABLED=false.
 * - startupValidator remains authoritative and will still reject contradictory
 *   or unsafe configurations.
 */

const persistenceProvider =
  String(
    process.env.PERSISTENCE_PROVIDER ||
      "postgres"
  )
    .trim()
    .toLowerCase();

const postgresEnabledWasProvided =
  typeof process.env.POSTGRES_ENABLED ===
    "string" &&
  process.env.POSTGRES_ENABLED.trim() !==
    "";

if (
  persistenceProvider === "postgres" &&
  !postgresEnabledWasProvided
) {
  process.env.POSTGRES_ENABLED =
    "true";

  console.info(
    "[startup] POSTGRES_ENABLED was not provided; defaulting to true because PERSISTENCE_PROVIDER=postgres"
  );
}

/**
 * ============================================================================
 * STARTUP CONFIGURATION VALIDATION
 * ============================================================================
 *
 * Validation intentionally runs before the rest of the application is loaded.
 * This prevents AIRA from partially booting with invalid persistence, security,
 * queue, cache, CORS, or execution configuration.
 */

const {
  validateEnvironment,
  inspectEnvironment,
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

// ============================================================================
// PHASE 12.1 - AUTHORITATIVE AGENT INTELLIGENCE RUNTIME
// ============================================================================

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
const selfObservabilityCollector =
  require(
    "./services/observability/selfObservabilityCollector"
  );

const integrationRoutes =
  require(
    "./routes/integrationRoutes"
  );

const executionModesRoutes =
  require(
    "./routes/executionModesRoutes"
  );

const organizationRoutes =
  require(
    "./routes/organizationRoutes"
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

  const {
  getPostgresConfig,
} =
  require(
    "./config/postgres"
  );

const {
  checkPostgresHealth,
} =
  require(
    "./persistence/postgres"
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
const enterpriseIdentityRoutes =
  require(
    "./routes/enterpriseIdentityRoutes"
  );

const enterpriseAuthRoutes =
  require(
    "./routes/enterpriseAuthRoutes"
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
  getRateLimitService,
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
const onboardingRoutes =
  require(
    "./routes/onboardingRoutes"
  );

const auditCompletenessRoutes =
  require(
    "./routes/auditCompletenessRoutes"
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
// PHASE 11.4 - WORKFLOW REPLAY / RECOVERY
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

const dependencyIsolationService =
  require(
    "./services/infrastructure/dependencyIsolationService"
  );

  const productionReadinessService =
  require(
    "./services/infrastructure/productionReadinessService"
  );

const sloService =
  require(
    "./services/reliability/sloService"
  );

  const serviceAccountRoutes =
  require(
    "./routes/serviceAccountRoutes"
  );

  const tenantSettingsRoutes =
  require(
    "./routes/tenantSettingsRoutes"
  );

const integrationGovernanceRoutes =
  require(
    "./routes/integrationGovernanceRoutes"
  );

  const notificationRoutingRoutes =
  require(
    "./routes/notificationRoutingRoutes"
  );

const humanTaskRoutes =
  require(
    "./routes/humanTaskRoutes"
  );

  const organizationInvitationRoutes =
  require(
    "./routes/organizationInvitationRoutes"
  );
const retentionService =
  require(
    "./services/infrastructure/retentionService"
  );
const paymentWebhookRoutes =
  require(
    "./routes/paymentWebhookRoutes"
  );


const {
  getKillSwitchManager,
} =
  require(
    "./config/killSwitches"
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

// Safe startup log - no secrets
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
      `[server] [WARN]  CORS: missing production origin(s): ${missing.join(", ")}`
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

    // Return controlled false - do NOT throw, which would produce a 500
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

// ============================================================================
// PHASE 15.18 — PAYMENT WEBHOOKS
// ============================================================================
//
// IMPORTANT:
//
// Payment-provider webhooks MUST be mounted before express.json().
//
// Razorpay and Stripe signatures are verified against the original raw HTTP
// request body. paymentWebhookRoutes uses express.raw({ type:
// "application/json" }) internally.
//
// Never move this route below express.json().
// ============================================================================

app.use(
  "/api/billing/webhooks",
  paymentWebhookRoutes
);
// ============================================================================
// GLOBAL JSON BODY PARSER
// ============================================================================
//
// IMPORTANT:
//
// Payment-provider webhooks are intentionally mounted ABOVE this parser.
//
// Razorpay and Stripe webhook signature verification requires the original
// raw HTTP request body. paymentWebhookRoutes owns its own express.raw()
// parser, while all normal AIRA JSON APIs use this global parser.
//
// Never move this middleware above /api/billing/webhooks.
// ============================================================================

app.use(
  express.json()
);

// ============================================================================
// GLOBAL HTTP MIDDLEWARE
// ============================================================================

// 1. CORS headers on every response (including preflight)
app.use(
  cors(
    corsOptions
  )
);


// 2. Respond 204 to all OPTIONS requests immediately — before auth middleware
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

    return next();
  }
);




// 4. Parse cookies.
app.use(
  cookieParser()
);

// CRITICAL AUDIT: Add correlation ID tracking (must be early)
app.use(
  correlationIdMiddleware
);

// ============================================================================
// PHASE 11.10 - STARTUP / SHUTDOWN ADMISSION GATE
// ============================================================================

app.use(
  (
    req,
    res,
    next
  ) => {
    /*
     * Health, authentication and preflight traffic must remain reachable
     * while AIRA is starting, recovering or draining.
     */
    const alwaysAllowed =
      req.path ===
        "/" ||
      req.path.startsWith(
        "/health"
      ) ||
      req.path.startsWith(
        "/api/v1/auth"
      );

    if (
      alwaysAllowed
    ) {
      return next();
    }

    /*
     * Read-only traffic can remain available while startup recovery
     * is incomplete. Any state-changing request is blocked.
     *
     * This also provides a clean admission seam for the later
     * production-hardening phases:
     *
     * 11.11 retention/archival
     * 11.12 self-observability
     * 11.13 SLO state
     * 11.14 configuration validation
     * 11.15 chaos/failure injection
     * 11.16 production E2E
     * 11.17 security/regression freeze
     */
    const readOnly =
      req.method ===
        "GET" ||
      req.method ===
        "HEAD" ||
      req.method ===
        "OPTIONS";

    if (
      readOnly
    ) {
      return next();
    }

    if (
      !isApplicationReady()
    ) {
      const draining =
        applicationLifecycle
          .state ===
          APPLICATION_STATE
            .DRAINING ||
        applicationLifecycle
          .state ===
          APPLICATION_STATE
            .SHUTTING_DOWN;

      return res
        .status(
          503
        )
        .set(
          "Retry-After",
          "5"
        )
        .json({
          error:
            "AIRA is not ready to accept operational work",

          code:
            draining
              ? "APPLICATION_DRAINING"
              : "APPLICATION_NOT_READY",

          lifecycleState:
            applicationLifecycle
              .state,

          startupRecoveryCompleted:
            applicationLifecycle
              .startupRecoveryCompleted,

          retryable:
            true,

          executionAuthorized:
            false,
        });
    }

    return next();
  }
);

app.use(
  "/api",
  recoveryDecisionRoutes
);

app.use(
  "/api/v1/tenant-settings",

  sessionAuthMiddleware,

  organizationContextMiddleware,

  tenantSettingsRoutes
);
app.use(
  "/api/v1/integration-governance",

  sessionAuthMiddleware,

  organizationContextMiddleware,

  browserEnvironmentContext,

  integrationGovernanceRoutes
);
app.use(
  "/api/v1/notification-routing",

  sessionAuthMiddleware,

  organizationContextMiddleware,

  notificationRoutingRoutes
);

app.use(
  "/api/v1/human-tasks",

  sessionAuthMiddleware,

  browserEnvironmentContext,

  humanTaskRoutes
);

app.use(
  "/api/v1/onboarding",

  sessionAuthMiddleware,

  organizationContextMiddleware,

  onboardingRoutes
);
app.use(
  "/api/v1/audit-control",

  sessionAuthMiddleware,

  organizationContextMiddleware,

  auditCompletenessRoutes
);
// Human auth routes mount before sanitization so passwords are not XSS-stripped
app.use(
  "/api/v1/auth",
  authRoutes
);
app.use(
  "/api/v1/enterprise-auth",
  enterpriseAuthRoutes
);
app.use(
  "/api/v1/organizations",
  organizationRoutes
);
app.use(
  "/api/v1/enterprise-identity",

  sessionAuthMiddleware,

  organizationContextMiddleware,

  enterpriseIdentityRoutes
);

app.use(
  "/api/v1/environments",
  environmentRoutes
);

app.use(
  "/api/v1/organization-invitations",
  organizationInvitationRoutes
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
  "/api/v1/service-accounts",

  sessionAuthMiddleware,

  organizationContextMiddleware,

  serviceAccountRoutes
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

// Lightweight liveness probe - always 200 once Express is up
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

        executionAuthorized:
          false,
      });
  }
);

// ============================================================================
// PHASE 11.10 - READINESS PROBE
// ============================================================================

app.get(
  "/health/ready",
  async (
    req,
    res
  ) => {
    let postgres;

    try {
      postgres =
        await refreshPostgresHealth();
    } catch (
      error
    ) {
      postgres = {
        enabled:
          postgresRuntimeStatus
            .enabled,

        required:
          postgresRuntimeStatus
            .enabled,

        initialized:
          true,

        healthy:
          false,

        status:
          "unhealthy",

        error: {
          code:
            error.code ||
            "POSTGRES_READINESS_FAILED",

          message:
            error.message,
        },

        executionAuthorized:
          false,
      };

      postgresRuntimeStatus
        .initialized =
        true;

      postgresRuntimeStatus
        .healthy =
        false;

      postgresRuntimeStatus
        .checkedAt =
        new Date();

      postgresRuntimeStatus
        .lastError =
        error.message;
    }

    const ready =
      isApplicationReady();

    return res
      .status(
        ready
          ? 200
          : 503
      )
      .json({
        status:
          ready
            ? "ready"
            : "not-ready",

        lifecycle:
          getApplicationLifecycleStatus(),

        postgres,

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

          lastError:
            replayRecoveryStatus
              .lastError,
        },

        executionAuthorized:
          false,
      });
  }
);

// Health check for orchestration
app.get(
  "/health",
  async (
    req,
    res
  ) => {
    const systemHealth =
      systemHealthService
        .getHealthStatus();

    let postgres;

    try {
      postgres =
        await refreshPostgresHealth();
    } catch (
      error
    ) {
      postgres = {
        enabled:
          postgresRuntimeStatus
            .enabled,

        required:
          postgresRuntimeStatus
            .enabled,

        healthy:
          false,

        status:
          "unhealthy",

        error: {
          code:
            error.code ||
            "POSTGRES_HEALTH_FAILED",

          message:
            error.message,
        },

        executionAuthorized:
          false,
      };

      postgresRuntimeStatus
        .healthy =
        false;

      postgresRuntimeStatus
        .checkedAt =
        new Date();

      postgresRuntimeStatus
        .lastError =
        error.message;
    }

    const applicationReady =
      isApplicationReady();

    const statusCode =
      !applicationReady ||
      systemHealth
        .safeMode
        ? 503
        : 200;

    return res
      .status(
        statusCode
      )
      .json({
        status:
          !applicationReady
            ? "not-ready"
            : systemHealth
                .safeMode
              ? "degraded"
              : "ok",

        timestamp:
          new Date()
            .toISOString(),

        ready:
          applicationReady,

        lifecycleState:
          applicationLifecycle
            .state,

        safeMode:
          systemHealth
            .safeMode,

        postgres,

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

        executionAuthorized:
          false,
      });
  }
);

/**
 * Internal-endpoint token guard.
 *  */
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

        executionAuthorized:
          false,
      });
  }

  let match =
    false;

  try {
    const crypto =
      require(
        "crypto"
      );

    const providedBuffer =
      Buffer.from(
        provided
      );

    const expectedBuffer =
      Buffer.from(
        token
      );

    if (
      providedBuffer.length ===
      expectedBuffer.length
    ) {
      match =
        crypto
          .timingSafeEqual(
            providedBuffer,
            expectedBuffer
          );
    }
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

        executionAuthorized:
          false,
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
    try {
      const queueStatus =
        queueService ||
        null;


      const outboxStatus =
        workflowOutboxRuntime &&
        typeof workflowOutboxRuntime
          .getStatus ===
        "function"
          ? workflowOutboxRuntime
              .getStatus()
          : null;


      const consumerStatus =
        workflowOutboxConsumers &&
        typeof workflowOutboxConsumers
          .getStatus ===
        "function"
          ? workflowOutboxConsumers
              .getStatus()
          : null;


      await selfObservabilityCollector
        .collect({
          lifecycle:
            getApplicationLifecycleStatus(),

          replayRecovery:
            replayRecoveryStatus,

          queue:
            queueStatus,

          workers: {
            workflowOutbox:
              outboxStatus,

            workflowConsumers:
              consumerStatus,

            monitorScheduler:
              global
                .monitorScheduler
                ? {
                    running:
                      true,
                  }
                : {
                    running:
                      false,
                  },

            memoryCleanup:
              {
                running:
                  memoryCleanupJob
                    .isRunning,

                active:
                  memoryCleanupJob
                    .cleanupInProgress,
              },

            multiInstance:
              global
                .multiInstanceCoordinator
                ? {
                    running:
                      true,
                  }
                : {
                    running:
                      false,
                  },
          },
        });


      res.set(
        "Content-Type",
        metricsService
          .getContentType()
      );


      const metrics =
        await metricsService
          .getMetrics();


      return res
        .status(
          200
        )
        .send(
          metrics
        );
    } catch (
      error
    ) {
      selfObservabilityCollector
        .recordError(
          "metrics-endpoint",
          error
        );


      return res
        .status(
          503
        )
        .json({
          error:
            "Metrics collection unavailable",

          code:
            "METRICS_COLLECTION_FAILED",

          executionAuthorized:
            false,
        });
    }
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


      // ======================================================================
      // SYSTEM HEALTH
      // ======================================================================

      const systemHealth =
        systemHealthService
          .getHealthStatus();


      // ======================================================================
      // PHASE 11.5 - DEPENDENCY ISOLATION HEALTH
      // ======================================================================

      const dependencyIsolationSummary =
        dependencyIsolationService
          .getSummary();


      const dependencyIsolationStatuses =
        dependencyIsolationService
          .getAllStatuses();


      // ======================================================================
      // PHASE 11.6 - ADMISSION / LOAD PROTECTION
      // ======================================================================

      /*
       * Rate limiter status describes API admission capacity.
       *
       * Queue load status describes asynchronous publisher pressure.
       *
       * Neither layer grants execution authority.
       */

      const rateLimitService =
        getRateLimitService();


      const rateLimitStatus =
        rateLimitService &&
        typeof rateLimitService
          .getStatus ===
        "function"
          ? rateLimitService
              .getStatus()
          : null;


      const queueLoadStatus =
        currentQueueService &&
        typeof currentQueueService
          .getLoadStatus ===
        "function"
          ? currentQueueService
              .getLoadStatus()
          : null;


      const admissionDegraded =
        Boolean(
          rateLimitStatus
            ?.fallbackActive
        );


      const queueSaturated =
        Boolean(
          queueLoadStatus
            ?.saturated ||
          queueLoadStatus
            ?.publisherBlocked
        );


      const loadProtection = {
        admission: {
          available:
            Boolean(
              rateLimitStatus
            ),

          degraded:
            admissionDegraded,

          redisConnected:
            rateLimitStatus
              ?.redisConnected ??
            null,

          fallbackActive:
            rateLimitStatus
              ?.fallbackActive ??
            null,

          localCounterCount:
            rateLimitStatus
              ?.localCounterCount ??
            null,

          windowMs:
            rateLimitStatus
              ?.windowMs ??
            null,

          limits:
            rateLimitStatus
              ?.limits ||
            null,

          lastRedisError:
            rateLimitStatus
              ?.lastRedisError ||
            null,

          executionAuthorized:
            false,
        },


        queue: {
          available:
            Boolean(
              queueLoadStatus
            ),

          connected:
            queueLoadStatus
              ?.connected ??
            Boolean(
              currentQueueService
                ?.connected
            ),

          saturated:
            queueSaturated,

          inFlightPublishes:
            queueLoadStatus
              ?.inFlightPublishes ??
            null,

          maxInFlightPublishes:
            queueLoadStatus
              ?.maxInFlightPublishes ??
            null,

          publisherBlocked:
            queueLoadStatus
              ?.publisherBlocked ??
            false,

          publisherBlockedUntil:
            queueLoadStatus
              ?.publisherBlockedUntil ||
            null,

          backpressureEvents:
            queueLoadStatus
              ?.backpressureEvents ??
            0,

          saturationRejects:
            queueLoadStatus
              ?.saturationRejects ??
            0,

          lastBackpressureAt:
            queueLoadStatus
              ?.lastBackpressureAt ||
            null,

          publishDrainTimeoutMs:
            queueLoadStatus
              ?.publishDrainTimeoutMs ??
            null,

          publishRetryAfterMs:
            queueLoadStatus
              ?.publishRetryAfterMs ??
            null,

          defaultConsumerPrefetch:
            queueLoadStatus
              ?.defaultConsumerPrefetch ??
            null,

          maxConsumerPrefetch:
            queueLoadStatus
              ?.maxConsumerPrefetch ??
            null,

          executionAuthorized:
            false,
        },


        /*
         * Redis-backed admission may degrade safely to the bounded
         * local limiter.
         *
         * Queue saturation is reported independently.
         */
        degraded:
          admissionDegraded ||
          queueSaturated,

        executionAuthorized:
          false,
      };


      // ======================================================================
      // WORKFLOW OUTBOX
      // ======================================================================

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


      // ======================================================================
      // FEATURE FLAGS
      // ======================================================================

      const allFeatureFlags =
        featureFlags
          .getAllFlags();


      const enabledFeatureFlags =
        allFeatureFlags
          .filter(
            (
              flag
            ) =>
              flag.enabled
          );


      const disabledFeatureFlags =
        allFeatureFlags
          .filter(
            (
              flag
            ) =>
              !flag.enabled
          );

               // ======================================================================
      // PHASE 11.16 - PRODUCTION READINESS
      // ======================================================================

      /*
       * Production readiness answers:
       *
       *   "Can this AIRA instance safely serve production traffic?"
       *
       * It DOES NOT authorize infrastructure execution.
       *
       * Actual action execution continues through:
       *
       * policy
       * approval
       * execution authorization
       * kill switches
       * idempotency
       * locking
       * execution gates
       */


      // ----------------------------------------------------------------------
      // STARTUP CONFIGURATION
      // ----------------------------------------------------------------------

      const configurationStatus =
        inspectEnvironment({
          env:
            process.env,

          isProduction:
            process.env.NODE_ENV ===
            "production",
        });


      // ----------------------------------------------------------------------
      // APPLICATION LIFECYCLE
      // ----------------------------------------------------------------------

      const applicationLifecycleStatus =
        typeof getApplicationLifecycleStatus ===
        "function"
          ? getApplicationLifecycleStatus()
          : null;


      // ----------------------------------------------------------------------
      // RETENTION
      // ----------------------------------------------------------------------

      const retentionStatus =
        retentionService &&
        typeof retentionService
          .getStatus ===
        "function"
          ? retentionService
              .getStatus()
          : null;


      // ----------------------------------------------------------------------
      // KILL SWITCHES
      // ----------------------------------------------------------------------

      let killSwitchStatus =
        null;


      try {
        const killSwitchManager =
          getKillSwitchManager();


        killSwitchStatus =
          killSwitchManager &&
          typeof killSwitchManager
            .getAllStatuses ===
          "function"
            ? killSwitchManager
                .getAllStatuses()
            : null;
      } catch (
        error
      ) {
        killSwitchStatus = {
          actionsEnabled:
            false,

          emergencyMode:
            true,

          error:
            error.message,

          executionAuthorized:
            false,
        };
      }


      // ----------------------------------------------------------------------
      // FEATURE FLAG SAFETY
      // ----------------------------------------------------------------------

      let featureFlagSafety =
        null;


      try {
        featureFlagSafety =
          featureFlags &&
          typeof featureFlags
            .validateProductionSetup ===
          "function"
            ? featureFlags
                .validateProductionSetup()
            : {
                safe:
                  false,

                warnings: [
                  "Feature flag validation unavailable",
                ],

                errors: [],
              };
      } catch (
        error
      ) {
        featureFlagSafety = {
          safe:
            false,

          warnings:
            [],

          errors: [
            error.message,
          ],
        };
      }


      // ----------------------------------------------------------------------
      // RELIABILITY / SLO
      // ----------------------------------------------------------------------

      let reliabilityStatus =
        null;


      try {
        reliabilityStatus =
          sloService &&
          typeof sloService
            .getStatus ===
          "function"
            ? sloService
                .getStatus()
            : null;
      } catch (
        error
      ) {
        reliabilityStatus = {
          state:
            "INSUFFICIENT_DATA",

          error:
            error.message,

          executionAuthorized:
            false,
        };
      }


      // ----------------------------------------------------------------------
      // CHAOS SAFETY POSTURE
      // ----------------------------------------------------------------------

      /*
       * server.js currently does not own a runtime ChaosTestFramework
       * singleton.
       *
       * Therefore readiness evaluates the configured production
       * chaos posture directly from environment settings.
       *
       * If a runtime chaos coordinator is introduced later,
       * replace activeFailures below with its getStatus().
       */
      const chaosStatus = {
        environment:
          process.env.NODE_ENV ||
          "development",

        enabled:
          String(
            process.env
              .AIRA_CHAOS_ENABLED ||
            ""
          )
            .toLowerCase() ===
          "true",

        productionAllowed:
          String(
            process.env
              .AIRA_CHAOS_PRODUCTION_ALLOWED ||
            ""
          )
            .toLowerCase() ===
          "true",

        activeFailures:
          [],

        executionAuthorized:
          false,
      };


      // ----------------------------------------------------------------------
      // FINAL READINESS EVALUATION
      // ----------------------------------------------------------------------

      const productionReadiness =
        productionReadinessService
          .evaluate({
            configuration:
              configurationStatus,

            lifecycle:
              applicationLifecycleStatus,

            replayRecovery:
              replayRecoveryStatus,

            systemHealth,

            dependencyIsolation: {
              summary:
                dependencyIsolationSummary,

              dependencies:
                dependencyIsolationStatuses,

              executionAuthorized:
                false,
            },

            outbox: {
              runtime:
                outboxRuntimeStatus,

              consumers:
                outboxConsumerStatus,

              executionAuthorized:
                false,
            },

            retention:
              retentionStatus,

            chaos:
              chaosStatus,

            killSwitches:
              killSwitchStatus,

            featureFlags:
              featureFlagSafety,

            reliability:
              reliabilityStatus,
          });
      // ======================================================================
      // FINAL HEALTH RESPONSE
      // ======================================================================

      const health = {
        /*
         * systemHealthService remains the authoritative
         * instance-safety signal.
         *
         * Lifecycle readiness is separate from process liveness.
         */
                status:
          productionReadiness
            .state ===
          "NOT_READY"
            ? "unhealthy"
            : productionReadiness
                .state ===
              "DEGRADED"
              ? "degraded"
              : "healthy",


        applicationLifecycle:
          getApplicationLifecycleStatus(),


        timestamp:
          new Date()
            .toISOString(),


        deploymentMode:
          systemHealth
            .deploymentMode,


        safeMode:
          systemHealth
            .safeMode,
   
                    // ====================================================================
        // PHASE 11.16 - PRODUCTION READINESS
        // ====================================================================

        productionReadiness: {
          state:
            productionReadiness
              .state,

          productionReady:
            productionReadiness
              .productionReady,

          degraded:
            productionReadiness
              .degraded,

          readyToServeTraffic:
            productionReadiness
              .readyToServeTraffic,

          summary:
            productionReadiness
              .summary,

          blockers:
            productionReadiness
              .blockers,

          warnings:
            productionReadiness
              .warnings,

          checks:
            productionReadiness
              .checks,

          evaluatedAt:
            productionReadiness
              .evaluatedAt,

          /*
           * Readiness NEVER authorizes an infrastructure action.
           */
          executionAuthorized:
            false,
        },

        // ====================================================================
        // PHASE 11.5 - DEPENDENCY ISOLATION
        // ====================================================================

        dependencyIsolation: {
          summary:
            dependencyIsolationSummary,

          dependencies:
            dependencyIsolationStatuses,

          executionAuthorized:
            false,
        },


        // ====================================================================
        // PHASE 11.6 - LOAD PROTECTION
        // ====================================================================

        loadProtection,


        // ====================================================================
        // FEATURE FLAGS
        // ====================================================================

        featureFlags: {
          summary:
            `${enabledFeatureFlags.length}/${allFeatureFlags.length} enabled`,

          enabled:
            enabledFeatureFlags
              .map(
                (
                  flag
                ) =>
                  flag.name
              ),

          disabled:
            disabledFeatureFlags
              .map(
                (
                  flag
                ) =>
                  flag.name
              ),
        },


        // ====================================================================
        // COMPONENT HEALTH
        // ====================================================================

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


          rateLimiter: {
            redisConnected:
              rateLimitStatus
                ?.redisConnected ??
              null,

            fallbackActive:
              rateLimitStatus
                ?.fallbackActive ??
              null,

            localCounterCount:
              rateLimitStatus
                ?.localCounterCount ??
              null,
          },


          queueLoad: {
            saturated:
              queueSaturated,

            inFlightPublishes:
              queueLoadStatus
                ?.inFlightPublishes ??
              null,

            maxInFlightPublishes:
              queueLoadStatus
                ?.maxInFlightPublishes ??
              null,

            publisherBlocked:
              queueLoadStatus
                ?.publisherBlocked ??
              false,

            backpressureEvents:
              queueLoadStatus
                ?.backpressureEvents ??
              0,

            saturationRejects:
              queueLoadStatus
                ?.saturationRejects ??
              0,
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


        // ====================================================================
        // WARNINGS
        // ====================================================================

        warnings: [
          ...(
            systemHealth
              .warnings ||
            []
          ),

          ...(
            admissionDegraded
              ? [
                  "Rate limiting is using bounded local fallback because Redis admission storage is unavailable.",
                ]
              : []
          ),

          ...(
            queueSaturated
              ? [
                  "RabbitMQ publisher load protection is active.",
                ]
              : []
          ),

          ...(
            !isApplicationReady()
              ? [
                  `Application lifecycle is ${applicationLifecycle.state}; operational writes are not admitted.`,
                ]
              : []
          ),
        ],


        // ====================================================================
        // EXECUTION SAFETY
        // ====================================================================

        canExecuteActions:
          isApplicationReady() &&
          systemHealthService
            .canExecuteActions(),


        diagnostics:
          systemHealth
            .safeMode
            ? systemHealthService
                .getDiagnostics()
            : undefined,


        /*
         * Health and lifecycle endpoints can never authorize
         * execution.
         */
        executionAuthorized:
          false,
      };

        // ======================================================================
      // RESPONSE
      // ======================================================================

            res
        .status(
          productionReadiness
            .readyToServeTraffic
            ? 200
            : 503
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

          executionAuthorized:
            false,
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

            executionAuthorized:
              false,
          });
      }

      const status =
        await global
          .multiInstanceCoordinator
          .getStatus();

      res.json({
        ...status,

        executionAuthorized:
          false,
      });
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

          executionAuthorized:
            false,
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

  requestContextMiddleware,

  environmentContextMiddleware,

  rateLimitingMiddleware(
    "api"
  ),

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
    "/api/v1/safety/kill-switches/:switchName",
  sessionAuthMiddleware,
  killSwitchControlEndpoint
);

app.get(
  "/api/v1/safety/confidence-thresholds",
  sessionAuthMiddleware,
  confidenceThresholdsEndpoint
);

app.put(
  "/api/v1/safety/confidence-thresholds",
  sessionAuthMiddleware,
  confidenceThresholdsUpdateEndpoint
);

app.post(
  "/api/v1/safety/test-xss",
  sessionAuthMiddleware,
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
            "XSS test endpoint disabled in production",

          executionAuthorized:
            false,
        });
    }

    const results =
      testXSSPayloads();

    res.json({
      results,

      executionAuthorized:
        false,
    });
  }
);

// ============================================================================
// ERROR HANDLER
// ============================================================================

app.use(
  errorHandler
);

// ============================================================================
// RUNTIME STATE
// ============================================================================

let queueService =
  null;

let idempotencyService =
  null;

let workflowOutboxComposition =
  null;

let workflowOutboxRuntime =
  null;

let workflowOutboxConsumers =
  null;

let serverInstance =
  null;

  const postgresRuntimeStatus = {
  enabled:
    false,

  initialized:
    false,

  healthy:
    null,

  checkedAt:
    null,

  lastError:
    null,

  health:
    null,
};
// ============================================================================
// PHASE 11.4 - REPLAY RECOVERY STATE
// ============================================================================

const replayRecoveryStatus = {
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
// PHASE 11.10 - APPLICATION LIFECYCLE
// ============================================================================

const APPLICATION_STATE =
  Object.freeze({
    STARTING:
      "STARTING",

    RECOVERING:
      "RECOVERING",

    READY:
      "READY",

    DRAINING:
      "DRAINING",

    SHUTTING_DOWN:
      "SHUTTING_DOWN",

    STOPPED:
      "STOPPED",

    FAILED:
      "FAILED",
  });

const applicationLifecycle = {
  state:
    APPLICATION_STATE
      .STARTING,

  startedAt:
    new Date(),

  readyAt:
    null,

  drainingAt:
    null,

  shutdownStartedAt:
    null,

  stoppedAt:
    null,

  startupRecoveryCompleted:
    false,

  startupRecoveryFailed:
    false,

  lastTransitionAt:
    new Date(),

  lastReason:
    "process_start",

  lastError:
    null,
};

function transitionApplicationState(
  state,
  reason =
    null,
  error =
    null
) {
  applicationLifecycle
    .state =
    state;

  applicationLifecycle
    .lastTransitionAt =
    new Date();

  applicationLifecycle
    .lastReason =
    reason;

  applicationLifecycle
    .lastError =
    error
      ? (
          error.message ||
          String(
            error
          )
        )
      : null;

  if (
    state ===
    APPLICATION_STATE
      .READY
  ) {
    applicationLifecycle
      .readyAt =
      new Date();
  }

  if (
    state ===
    APPLICATION_STATE
      .DRAINING
  ) {
    applicationLifecycle
      .drainingAt =
      new Date();
  }

  if (
    state ===
    APPLICATION_STATE
      .SHUTTING_DOWN
  ) {
    applicationLifecycle
      .shutdownStartedAt =
      new Date();
  }

  if (
    state ===
    APPLICATION_STATE
      .STOPPED
  ) {
    applicationLifecycle
      .stoppedAt =
      new Date();
  }

  console.log(
    `[lifecycle] state=${state}` +
    (
      reason
        ? ` reason=${reason}`
        : ""
    )
  );
}

async function refreshPostgresHealth() {
  const config =
    getPostgresConfig();

  postgresRuntimeStatus
    .enabled =
    config.enabled;

  if (
    !config.enabled
  ) {
    postgresRuntimeStatus
      .initialized =
      true;

    postgresRuntimeStatus
      .healthy =
      null;

    postgresRuntimeStatus
      .checkedAt =
      new Date();

    postgresRuntimeStatus
      .lastError =
      null;

    postgresRuntimeStatus
      .health =
      null;

    return {
      enabled:
        false,

      required:
        false,

      initialized:
        true,

      healthy:
        null,

      status:
        "disabled",

      executionAuthorized:
        false,
    };
  }

  const health =
    await checkPostgresHealth();

  postgresRuntimeStatus
    .initialized =
    true;

  postgresRuntimeStatus
    .healthy =
    health.healthy ===
    true;

  postgresRuntimeStatus
    .checkedAt =
    new Date();

  postgresRuntimeStatus
    .lastError =
    health.healthy
      ? null
      : (
          health.error
            ?.message ||
          "PostgreSQL health check failed"
        );

  postgresRuntimeStatus
    .health =
    health;

  return {
    enabled:
      true,

    required:
      true,

    initialized:
      true,

    healthy:
      health.healthy ===
      true,

    status:
      health.healthy
        ? "healthy"
        : "unhealthy",

    latencyMs:
      health.latencyMs ??
      null,

    database:
      health.database ||
      null,

    username:
      health.username ||
      null,

    pool:
      health.pool ||
      null,

    error:
      health.error ||
      null,

    checkedAt:
      postgresRuntimeStatus
        .checkedAt,

    executionAuthorized:
      false,
  };
}

async function initializePostgresFoundation() {
  const config =
    getPostgresConfig();

  postgresRuntimeStatus
    .enabled =
    config.enabled;

  /*
   * PHASE 13 FINAL ARCHITECTURE
   *
   * PostgreSQL is not an optional migration-sidecar anymore.
   *
   * It is AIRA's authoritative transactional persistence layer.
   *
   * Therefore normal runtime startup must fail closed when
   * PostgreSQL is disabled or unhealthy.
   */
  if (
    !config.enabled
  ) {
    postgresRuntimeStatus
      .initialized =
      true;

    postgresRuntimeStatus
      .healthy =
      false;

    postgresRuntimeStatus
      .checkedAt =
      new Date();

    postgresRuntimeStatus
      .lastError =
      "PostgreSQL is required for AIRA runtime";

    postgresRuntimeStatus
      .health =
      null;

    throw Object.assign(
      new Error(
        "PostgreSQL is required for AIRA runtime"
      ),
      {
        code:
          "POSTGRES_REQUIRED",
      }
    );
  }

  console.log(
    "[postgres] Initializing authoritative PostgreSQL persistence..."
  );

  const health =
    await refreshPostgresHealth();

  if (
    health.healthy !==
    true
  ) {
    throw Object.assign(
      new Error(
        health.error
          ?.message ||
        "PostgreSQL health check failed during startup"
      ),
      {
        code:
          health.error
            ?.code ||
          "POSTGRES_STARTUP_HEALTH_FAILED",
      }
    );
  }

  console.log(
    `[postgres] ✓ PostgreSQL authoritative store healthy database=${health.database || "unknown"} latency=${health.latencyMs ?? "unknown"}ms`
  );

  return health;
}


function isApplicationReady() {
  /*
   * PHASE 13 FINAL ARCHITECTURE
   *
   * PostgreSQL readiness is mandatory.
   *
   * AIRA must never advertise operational readiness when
   * the authoritative transactional store is unavailable.
   */
  const postgresReady =
    postgresRuntimeStatus
      .enabled ===
      true &&
    postgresRuntimeStatus
      .initialized ===
      true &&
    postgresRuntimeStatus
      .healthy ===
      true;

  return (
    applicationLifecycle
      .state ===
      APPLICATION_STATE
        .READY &&

    applicationLifecycle
      .startupRecoveryCompleted ===
      true &&

    applicationLifecycle
      .startupRecoveryFailed !==
      true &&

    postgresReady
  );
}


function getApplicationLifecycleStatus() {
  return {
    state:
      applicationLifecycle
        .state,

    startedAt:
      applicationLifecycle
        .startedAt,

    readyAt:
      applicationLifecycle
        .readyAt,

    drainingAt:
      applicationLifecycle
        .drainingAt,

    shutdownStartedAt:
      applicationLifecycle
        .shutdownStartedAt,

    stoppedAt:
      applicationLifecycle
        .stoppedAt,

    startupRecoveryCompleted:
      applicationLifecycle
        .startupRecoveryCompleted,

    startupRecoveryFailed:
      applicationLifecycle
        .startupRecoveryFailed,

    lastTransitionAt:
      applicationLifecycle
        .lastTransitionAt,

    lastReason:
      applicationLifecycle
        .lastReason,

    lastError:
      applicationLifecycle
        .lastError,

    postgres: {
      required:
        true,

      enabled:
        postgresRuntimeStatus
          .enabled,

      initialized:
        postgresRuntimeStatus
          .initialized,

      healthy:
        postgresRuntimeStatus
          .healthy,

      checkedAt:
        postgresRuntimeStatus
          .checkedAt,

      lastError:
        postgresRuntimeStatus
          .lastError,
    },

    ready:
      isApplicationReady(),

    executionAuthorized:
      false,
  };
}


// ============================================================================
// START HTTP SERVER
// ============================================================================

async function startHttpServer() {
  if (
    serverInstance
  ) {
    return serverInstance;
  }

  return new Promise(
    (
      resolve,
      reject
    ) => {
      const httpServer =
        http.createServer(
          app
        );

      const handleError =
        (
          error
        ) => {
          reject(
            error
          );
        };

      httpServer.once(
        "error",
        handleError
      );

      httpServer.listen(
        PORT,
        () => {
          httpServer.removeListener(
            "error",
            handleError
          );

          serverInstance =
            httpServer;

          console.log(
            `[server] HTTP listener active on port ${PORT}`
          );

          console.log(
            "[server] Process is live; operational readiness depends on authoritative persistence and startup recovery"
          );

          resolve(
            httpServer
          );
        }
      );
    }
  );
}


// ============================================================================
// MAIN STARTUP
// ============================================================================

async function startServer() {
  const startupStartedAt = Date.now();

  transitionApplicationState(
    APPLICATION_STATE.STARTING,
    "initializing_services"
  );

  console.log(
    `[startup] AIRA starting env=${process.env.NODE_ENV || "development"} persistence=${process.env.PERSISTENCE_PROVIDER || "postgres"}`
  );

  try {
    const httpStartedAt = Date.now();
    await startHttpServer();
    console.log(
      `[startup] [OK] HTTP listener ready port=${PORT} ${elapsedMs(httpStartedAt)}ms`
    );

    await initializeServices();

    const postgresStartedAt = Date.now();
    await initializePostgresFoundation();
    console.log(
      `[startup] [OK] PostgreSQL readiness verified ${elapsedMs(postgresStartedAt)}ms`
    );

    const agentStartedAt = Date.now();
    initializeAgentOrchestrator(
      { incidentPlaybookService, memoryService },
      {
        dryRun:
          String(process.env.AGENT_DRY_RUN || "false")
            .trim()
            .toLowerCase() === "true",
      }
    );
    console.log(
      `[startup] [OK] Agent intelligence runtime initialized ${elapsedMs(agentStartedAt)}ms`
    );

    await runStartupRecovery();

    if (!isApplicationReady()) {
      throw Object.assign(
        new Error(
          "Startup completed but application readiness conditions were not satisfied"
        ),
        { code: "APPLICATION_STARTUP_NOT_READY" }
      );
    }

    const totalMs = elapsedMs(startupStartedAt);
    console.log(
      `[startup] [READY] AIRA operationally ready port=${PORT} startup=${totalMs}ms`
    );

    return {
      started: true,
      ready: true,
      port: PORT,
      startupDurationMs: totalMs,
      lifecycle: getApplicationLifecycleStatus(),
      executionAuthorized: false,
    };
  } catch (error) {
    transitionApplicationState(
      APPLICATION_STATE.FAILED,
      "startup_failed",
      error
    );

    console.error(
      `[startup] [FAIL] AIRA startup failed after ${elapsedMs(startupStartedAt)}ms:`,
      error
    );

    try {
      await shutdown(
        "STARTUP_FAILURE",
        { exitProcess: false, exitCode: 1 }
      );
    } catch (shutdownError) {
      console.error(
        "[startup] [WARN] Startup cleanup failed:",
        shutdownError.message
      );
    }

    process.exitCode = 1;
    throw error;
  }
}

// ============================================================================
// PHASE 11.10 - SHUTDOWN HELPERS
// ============================================================================

function sleep(
  milliseconds
) {
  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

async function withTimeout(
  operation,
  timeoutMs,
  timeoutCode
) {
  let timer =
    null;

  try {
    return await Promise.race([
      Promise.resolve()
        .then(
          operation
        ),

      new Promise(
        (
          _resolve,
          reject
        ) => {
          timer =
            setTimeout(
              () => {
                reject(
                  Object.assign(
                    new Error(
                      `Operation timed out after ${timeoutMs}ms`
                    ),
                    {
                      code:
                        timeoutCode ||
                        "OPERATION_TIMEOUT",
                    }
                  )
                );
              },
              timeoutMs
            );

          /*
           * Do not keep Node alive solely because of
           * a shutdown timeout timer.
           */
          if (
            typeof timer
              .unref ===
            "function"
          ) {
            timer
              .unref();
          }
             }
      ),
    ]);
  } finally {
    if (
      timer
    ) {
      clearTimeout(
        timer
      );
    }
  }
}

async function safeShutdownStep(
  name,
  operation,
  timeoutMs =
    10000
) {
  try {
    await withTimeout(
      operation,
      timeoutMs,
      `${name
        .toUpperCase()
        .replace(
          /[^A-Z0-9]+/g,
          "_"
        )}_SHUTDOWN_TIMEOUT`
    );

    console.log(
      `[shutdown] [OK] ${name}`
    );

    return {
      ok:
        true,
    };
  } catch (
    error
  ) {
    console.warn(
      `[shutdown] [WARN] ${name}:`,
      error.message
    );

    return {
      ok:
        false,

      error:
        error.message,

      code:
        error.code ||
        null,
    };
  }
}

// ============================================================================
// INITIALIZE SERVICES
// ============================================================================

function isPostgresPersistence() {
  return String(
    process.env.PERSISTENCE_PROVIDER ||
    "postgres"
  )
    .trim()
    .toLowerCase() === "postgres";
}

function elapsedMs(startedAt) {
  return Date.now() - startedAt;
}

async function initializeServices() {
  const servicesStartedAt = Date.now();

  console.log("[startup] Initializing backend services...");

  {
    const startedAt = Date.now();
    await connectDatabase();
    console.log(
      `[startup] [OK] PostgreSQL database connected ${elapsedMs(startedAt)}ms`
    );
  }

  {
    const startedAt = Date.now();
    try {
      if (typeof systemHealthService.initialize === "function") {
        await systemHealthService.initialize();
      }
      console.log(
        `[startup] [OK] System health initialized ${elapsedMs(startedAt)}ms`
      );
    } catch (error) {
      console.warn(
        `[startup] [WARN] System health initialization failed ${elapsedMs(startedAt)}ms:`,
        error.message
      );
    }
  }

  await Promise.all([
    (async () => {
      const startedAt = Date.now();
      try {
        queueService = await getQueueService();
        if (queueService?.connected) {
          console.log(
            `[startup] [OK] RabbitMQ queue connected ${elapsedMs(startedAt)}ms`
          );
        } else {
          console.warn(
            `[startup] [WARN] RabbitMQ queue unavailable ${elapsedMs(startedAt)}ms`
          );
        }
      } catch (error) {
        queueService = null;
        console.warn(
          `[startup] [WARN] RabbitMQ initialization failed ${elapsedMs(startedAt)}ms:`,
          error.message
        );
      }
    })(),

    (async () => {
      const startedAt = Date.now();
      try {
        idempotencyService = await getIdempotencyService();
        if (idempotencyService?.connected) {
          console.log(
            `[startup] [OK] Idempotency Redis connected ${elapsedMs(startedAt)}ms`
          );
        } else {
          console.warn(
            `[startup] [WARN] Idempotency Redis unavailable ${elapsedMs(startedAt)}ms`
          );
        }
      } catch (error) {
        idempotencyService = null;
        console.warn(
          `[startup] [WARN] Idempotency Redis initialization failed ${elapsedMs(startedAt)}ms:`,
          error.message
        );
      }
    })(),

    (async () => {
      const startedAt = Date.now();
      try {
        if (
          distributedLockService &&
          typeof distributedLockService.connect === "function" &&
          !distributedLockService.connected
        ) {
          await distributedLockService.connect();
        }
        if (distributedLockService?.connected) {
          console.log(
            `[startup] [OK] Distributed-lock Redis connected ${elapsedMs(startedAt)}ms`
          );
        } else {
          console.warn(
            `[startup] [WARN] Distributed-lock Redis unavailable ${elapsedMs(startedAt)}ms`
          );
        }
      } catch (error) {
        console.warn(
          `[startup] [WARN] Distributed-lock Redis initialization failed ${elapsedMs(startedAt)}ms:`,
          error.message
        );
      }
    })(),
  ]);

  {
    const startedAt = Date.now();
    try {
      workflowOutboxComposition = createWorkflowOutboxComposition({
        queueService,
        idempotencyService,
        dependencyIsolationService,
      });

      workflowOutboxConsumers = new WorkflowOutboxConsumerRegistry({
        queueService,
        composition: workflowOutboxComposition,
      });

      workflowOutboxRuntime = new WorkflowOutboxRuntimeController({
        worker: workflowOutboxComposition.worker,
        queueService,
      });

      if (typeof workflowOutboxConsumers.start === "function") {
        await workflowOutboxConsumers.start();
      }
      console.log("[workflow-outbox] [OK] Durable outbox consumers started");

      if (isPostgresPersistence()) {
        console.log(
          "[workflow-outbox] [SKIP] Global dispatcher disabled for PostgreSQL; scoped/privileged worker required"
        );
      } else if (typeof workflowOutboxRuntime.start === "function") {
        await workflowOutboxRuntime.start();
        console.log("[workflow-outbox] [OK] Global dispatcher started");
      }

      console.log(
        `[startup] [OK] Workflow outbox initialized ${elapsedMs(startedAt)}ms`
      );
    } catch (error) {
      console.warn(
        `[workflow-outbox] [WARN] Initialization failed ${elapsedMs(startedAt)}ms:`,
        error.message
      );
    }
  }

  {
    const startedAt = Date.now();
    try {
      if (workflowOutboxComposition) {
        if (typeof recoveryDecisionOutboxHandoffService.initialize === "function") {
          await recoveryDecisionOutboxHandoffService.initialize({
            composition: workflowOutboxComposition,
          });
        }
        if (typeof executionVerificationOutboxHandoffService.initialize === "function") {
          await executionVerificationOutboxHandoffService.initialize({
            composition: workflowOutboxComposition,
          });
        }
        if (typeof verificationLifecycleOutboxHandoffService.initialize === "function") {
          await verificationLifecycleOutboxHandoffService.initialize({
            composition: workflowOutboxComposition,
          });
        }
      }
      console.log(
        `[startup] [OK] Outbox handoffs registered ${elapsedMs(startedAt)}ms`
      );
    } catch (error) {
      console.warn(
        `[workflow-outbox] [WARN] Handoff initialization failed ${elapsedMs(startedAt)}ms:`,
        error.message
      );
    }
  }

  await Promise.all([
    (async () => {
      const startedAt = Date.now();
      try {
        if (typeof diagnosisQueueConsumer.start === "function") {
          await diagnosisQueueConsumer.start();
        }
        console.log(
          `[startup] [OK] Diagnosis consumer started ${elapsedMs(startedAt)}ms`
        );
      } catch (error) {
        console.warn(
          `[diagnosis] [WARN] Consumer startup failed ${elapsedMs(startedAt)}ms:`,
          error.message
        );
      }
    })(),
    (async () => {
      const startedAt = Date.now();
      try {
        if (typeof recoveryDecisionQueueConsumer.start === "function") {
          await recoveryDecisionQueueConsumer.start();
        }
        console.log(
          `[startup] [OK] Recovery-decision consumer started ${elapsedMs(startedAt)}ms`
        );
      } catch (error) {
        console.warn(
          `[recovery] [WARN] Consumer startup failed ${elapsedMs(startedAt)}ms:`,
          error.message
        );
      }
    })(),
  ]);

  {
    const startedAt = Date.now();
    try {
      const k8sClient = getK8sClient();
      if (
        k8sClient &&
        runbookExecutionService &&
        typeof runbookExecutionService.registerHandler === "function"
      ) {
        runbookExecutionService.registerHandler("kubernetes", k8sClient);
        console.log(
          `[startup] [OK] Kubernetes execution handler registered ${elapsedMs(startedAt)}ms`
        );
      } else {
        console.log(
          `[startup] [SKIP] Kubernetes execution handler unavailable ${elapsedMs(startedAt)}ms`
        );
      }
    } catch (error) {
      console.warn(
        `[startup] [WARN] Kubernetes initialization failed ${elapsedMs(startedAt)}ms:`,
        error.message
      );
    }
  }

  {
    const startedAt = Date.now();
    try {
      if (systemHealthService.isMultiInstance) {
        const coordinatorRedisClient = distributedLockService?.getRedisClient?.();
        if (!coordinatorRedisClient || !distributedLockService?.connected) {
          throw Object.assign(
            new Error("Multi-instance coordination requires a connected Redis client"),
            { code: "MULTI_INSTANCE_REDIS_REQUIRED" }
          );
        }
        global.multiInstanceCoordinator =
          new MultiInstanceCoordinator(coordinatorRedisClient);
        if (typeof global.multiInstanceCoordinator.start === "function") {
          await global.multiInstanceCoordinator.start();
        }
        console.log(
          `[startup] [OK] Multi-instance coordinator started ${elapsedMs(startedAt)}ms`
        );
      } else {
        global.multiInstanceCoordinator = null;
        console.log(
          `[startup] [SKIP] Multi-instance coordinator (SINGLE_INSTANCE) ${elapsedMs(startedAt)}ms`
        );
      }
    } catch (error) {
      console.warn(
        `[startup] [WARN] Multi-instance coordinator failed ${elapsedMs(startedAt)}ms:`,
        error.message
      );
    }
  }

  if (isPostgresPersistence()) {
    global.monitorScheduler = null;
    console.log(
      "[monitor-scheduler] [SKIP] Global PostgreSQL monitor scanner disabled; scoped scheduler required"
    );
    console.log(
      "[memory-cleanup] [SKIP] Global PostgreSQL retention scanner disabled; scoped cleanup worker required"
    );
    console.log(
      "[retry-processor] [SKIP] Global PostgreSQL retry scanner disabled; scoped retry worker required"
    );
  } else {
    try {
      global.monitorScheduler = new MonitorScheduler();
      if (typeof global.monitorScheduler.start === "function") {
        await global.monitorScheduler.start();
      }
      console.log("[monitor-scheduler] [OK] Monitor scheduler started");
    } catch (error) {
      console.warn("[monitor-scheduler] [WARN] Startup failed:", error.message);
    }

    try {
      if (typeof memoryCleanupJob.start === "function") {
        memoryCleanupJob.start();
      }
      console.log("[memory-cleanup] [OK] Memory cleanup job started");
    } catch (error) {
      console.warn("[memory-cleanup] [WARN] Startup failed:", error.message);
    }

    try {
      if (typeof retryProcessorJob.start === "function") {
        retryProcessorJob.start();
      }
      console.log("[retry-processor] [OK] Retry processor started");
    } catch (error) {
      console.warn("[retry-processor] [WARN] Startup failed:", error.message);
    }
  }

  console.log(
    `[startup] [OK] Backend service initialization complete ${elapsedMs(servicesStartedAt)}ms`
  );
}

// ============================================================================
// PHASE 11.4 / 11.10 - STARTUP REPLAY RECOVERY
// ============================================================================

async function runStartupRecovery() {
  const startedAt = Date.now();

  transitionApplicationState(
    APPLICATION_STATE.RECOVERING,
    "startup_replay_recovery"
  );

  replayRecoveryStatus.initialized = true;
  replayRecoveryStatus.startupRecoveryCompleted = false;
  replayRecoveryStatus.lastRunAt = new Date();
  replayRecoveryStatus.lastError = null;
  applicationLifecycle.startupRecoveryCompleted = false;
  applicationLifecycle.startupRecoveryFailed = false;

  try {
    if (typeof replayRuntimeIntegration.recoverInterrupted !== "function") {
      throw Object.assign(
        new Error("Replay runtime integration does not expose recoverInterrupted()"),
        { code: "STARTUP_RECOVERY_METHOD_MISSING" }
      );
    }

    let result;

if (
  isPostgresPersistence()
) {
  /*
   * PostgreSQL operational persistence is strictly
   * organization/environment scoped.
   *
   * Startup recovery therefore cannot perform the old
   * Mongo-style global operational scan.
   *
   * Identity/tenancy repositories are allowed to enumerate
   * environments globally. Recovery is then executed once
   * for each concrete tenant/environment scope.
   */
  const PostgresEnvironmentRepository =
    require(
      "./persistence/postgres/PostgresEnvironmentRepository"
    );

  const environmentRepository =
    new PostgresEnvironmentRepository();

  const environments =
    await environmentRepository
      .findMany({});

  const totals = {
    discovered:
      0,

    recovered:
      0,

    failed:
      0,

    results:
      [],
  };

  for (
    const environment
    of environments
  ) {
    const organizationId =
      environment
        .organizationId;

    const environmentId =
      environment._id ||
      environment.publicId ||
      environment.id;

    /*
     * Identity data with incomplete canonical scope
     * must never be allowed to trigger an operational
     * global read.
     */
    if (
      !organizationId ||
      !environmentId
    ) {
      console.warn(
        "[replay-recovery] [WARN] Skipping environment with incomplete tenant scope"
      );

      continue;
    }

    const scopedResult =
      await replayRuntimeIntegration
        .recoverInterrupted(
          {},
          {
            organizationId,
            environmentId,
          }
        );

    totals.discovered +=
      Number(
        scopedResult
          ?.discovered ??
        scopedResult
          ?.discoveredCount ??
        scopedResult
          ?.total ??
        0
      );

    totals.recovered +=
      Number(
        scopedResult
          ?.recovered ??
        scopedResult
          ?.recoveredCount ??
        scopedResult
          ?.successful ??
        0
      );

    totals.failed +=
      Number(
        scopedResult
          ?.failed ??
        scopedResult
          ?.failedCount ??
        0
      );

    if (
      Array.isArray(
        scopedResult
          ?.results
      )
    ) {
      totals
        .results
        .push(
          ...scopedResult
            .results
        );
    }
  }

  result =
    totals;
} else {
  /*
   * Legacy Mongo runtime can retain its existing
   * global startup-recovery behaviour.
   */
  result =
    await replayRuntimeIntegration
      .recoverInterrupted();
}

replayRecoveryStatus.discovered =
  Number(
    result?.discovered ??
    result?.discoveredCount ??
    result?.total ??
    0
  );

replayRecoveryStatus.recovered =
  Number(
    result?.recovered ??
    result?.recoveredCount ??
    result?.successful ??
    0
  );

replayRecoveryStatus.failed =
  Number(
    result?.failed ??
    result?.failedCount ??
    0
  );

    if (replayRecoveryStatus.failed > 0) {
      throw Object.assign(
        new Error(
          `Startup replay recovery completed with ${replayRecoveryStatus.failed} failed workflow(s)`
        ),
        { code: "STARTUP_RECOVERY_INCOMPLETE" }
      );
    }

    replayRecoveryStatus.startupRecoveryCompleted = true;
    applicationLifecycle.startupRecoveryCompleted = true;
    applicationLifecycle.startupRecoveryFailed = false;

    transitionApplicationState(
      APPLICATION_STATE.READY,
      "startup_recovery_completed"
    );

    console.log(
      `[replay-recovery] [OK] Startup recovery completed discovered=${replayRecoveryStatus.discovered} recovered=${replayRecoveryStatus.recovered} failed=${replayRecoveryStatus.failed} ${elapsedMs(startedAt)}ms`
    );

    return result;
  } catch (error) {
    replayRecoveryStatus.startupRecoveryCompleted = false;
    replayRecoveryStatus.lastError = error.message;
    applicationLifecycle.startupRecoveryCompleted = false;
    applicationLifecycle.startupRecoveryFailed = true;

    transitionApplicationState(
      APPLICATION_STATE.FAILED,
      "startup_recovery_failed",
      error
    );

    console.error(
      `[replay-recovery] [FAIL] Startup recovery failed ${elapsedMs(startedAt)}ms:`,
      error.message
    );

    throw error;
  }
}

// ============================================================================
// PHASE 11.10 - GRACEFUL SHUTDOWN
// ============================================================================

async function shutdown(
  signal =
    "UNKNOWN",
  options = {}
) {
  if (
    shutdown.inProgress
  ) {
    return shutdown.promise;
  }

  shutdown.inProgress =
    true;

  const shutdownStartedAt =
    Date.now();

  const exitProcess =
    options.exitProcess !==
    false;

  const exitCode =
    Number.isInteger(
      options.exitCode
    )
      ? options.exitCode
      : 0;

  const shutdownTimeoutMs =
    Number(
      process.env
        .SERVER_SHUTDOWN_TIMEOUT_MS
    ) ||
    30000;

  const outboxShutdownTimeoutMs =
    Number(
      process.env
        .WORKFLOW_OUTBOX_SHUTDOWN_TIMEOUT_MS
    ) ||
    10000;

  shutdown.promise =
    (async () => {
      console.log(
        `\n[shutdown] AIRA graceful shutdown started signal=${signal}`
      );

      transitionApplicationState(
        APPLICATION_STATE
          .DRAINING,
        `signal_${signal}`
      );

      // ======================================================================
      // 1. STOP ACCEPTING NEW HTTP CONNECTIONS
      // ======================================================================

      if (
        serverInstance
      ) {
        await safeShutdownStep(
          "HTTP admission stopped",
          async () => {
            await new Promise(
              (
                resolve,
                reject
              ) => {
                let settled =
                  false;

                const finish =
                  (
                    error
                  ) => {
                    if (
                      settled
                    ) {
                      return;
                    }

                    settled =
                      true;

                    if (
                      error
                    ) {
                      reject(
                        error
                      );
                    } else {
                      resolve();
                    }
                  };

                try {
                  serverInstance
                    .close(
                      finish
                    );

                  if (
                    typeof serverInstance
                      .closeIdleConnections ===
                    "function"
                  ) {
                    serverInstance
                      .closeIdleConnections();
                  }
                } catch (
                  error
                ) {
                  finish(
                    error
                  );
                }
              }
            );
          },
          Math.min(
            shutdownTimeoutMs,
            10000
          )
        );

        serverInstance =
          null;
      }

      transitionApplicationState(
        APPLICATION_STATE
          .SHUTTING_DOWN,
        `draining_${signal}`
      );

      // ======================================================================
      // 2. STOP DURABLE OUTBOX
      // ======================================================================

      if (
        workflowOutboxRuntime
      ) {
        await safeShutdownStep(
          "Durable workflow outbox runtime stopped",
          async () => {
            await workflowOutboxRuntime
              .stop({
                waitForCurrent:
                  true,

                timeoutMs:
                  outboxShutdownTimeoutMs,
              });
          },
          outboxShutdownTimeoutMs +
            1000
        );
      }

      // ======================================================================
      // 3. STOP OUTBOX CONSUMERS
      // ======================================================================

      if (
        workflowOutboxConsumers &&
        typeof workflowOutboxConsumers
          .stop ===
        "function"
      ) {
        await safeShutdownStep(
          "Workflow outbox consumers stopped",
          async () => {
            await workflowOutboxConsumers
              .stop();
          }
        );
      }

      // ======================================================================
      // 4. STOP QUEUE CONSUMERS
      // ======================================================================

      if (
        diagnosisQueueConsumer &&
        typeof diagnosisQueueConsumer
          .stop ===
        "function"
      ) {
        await safeShutdownStep(
          "Diagnosis consumer stopped",
          async () => {
            await diagnosisQueueConsumer
              .stop();
          }
        );
      }

      if (
        recoveryDecisionQueueConsumer &&
        typeof recoveryDecisionQueueConsumer
          .stop ===
        "function"
      ) {
        await safeShutdownStep(
          "Recovery decision consumer stopped",
          async () => {
            await recoveryDecisionQueueConsumer
              .stop();
          }
        );
      }

      // ======================================================================
      // 5. STOP MULTI-INSTANCE COORDINATION
      // ======================================================================

      if (
        global
          .multiInstanceCoordinator
      ) {
        await safeShutdownStep(
          "Multi-instance coordinator stopped",
          async () => {
            if (
              typeof global
                .multiInstanceCoordinator
                .stop ===
              "function"
            ) {
              await global
                .multiInstanceCoordinator
                .stop();
            }
          }
        );
      }

      // ======================================================================
      // 6. STOP MONITOR SCHEDULER
      // ======================================================================

      if (
        global
          .monitorScheduler
      ) {
        await safeShutdownStep(
          "Monitor scheduler stopped",
          async () => {
            if (
              typeof global
                .monitorScheduler
                .stop ===
              "function"
            ) {
              await global
                .monitorScheduler
                .stop();
            }
          }
        );
      }

      // ======================================================================
      // 7. STOP BACKGROUND JOBS
      // ======================================================================

      await safeShutdownStep(
        "Memory cleanup job stopped",
        async () => {
          if (
            typeof memoryCleanupJob
              .stop ===
            "function"
          ) {
            await memoryCleanupJob
              .stop();
          }
        }
      );

      await safeShutdownStep(
        "Retry processor job stopped",
        async () => {
          if (
            typeof retryProcessorJob
              .stop ===
            "function"
          ) {
            await retryProcessorJob
              .stop();
          }
        }
      );

      // ======================================================================
      // 8. RELEASE DISTRIBUTED LOCKS
      // ======================================================================

      if (
        distributedLockService
      ) {
        if (
          typeof distributedLockService
            .releaseAll ===
          "function"
        ) {
          await safeShutdownStep(
            "Distributed locks released",
            async () => {
              await distributedLockService
                .releaseAll();
            }
          );
        }

        if (
          typeof distributedLockService
            .disconnect ===
          "function"
        ) {
          await safeShutdownStep(
            "Distributed lock service disconnected",
            async () => {
              await distributedLockService
                .disconnect();
            }
          );
        }
      }

      // ======================================================================
      // 9. DISCONNECT RABBITMQ
      // ======================================================================

      if (
        queueService &&
        typeof queueService
          .disconnect ===
        "function"
      ) {
        await safeShutdownStep(
          "Queue service disconnected",
          async () => {
            await queueService
              .disconnect();
          }
        );
      }

      // ======================================================================
      // 10. DISCONNECT REDIS-BASED SERVICES
      // ======================================================================

      if (
        idempotencyService &&
        typeof idempotencyService
          .disconnect ===
        "function"
      ) {
        await safeShutdownStep(
          "Idempotency service disconnected",
          async () => {
            await idempotencyService
              .disconnect();
          }
        );
      }

      try {
        const rateLimitService =
          getRateLimitService();

        if (
          rateLimitService &&
          typeof rateLimitService
            .disconnect ===
          "function"
        ) {
          await safeShutdownStep(
            "Rate limit service disconnected",
            async () => {
              await rateLimitService
                .disconnect();
            }
          );
        }
      } catch (
        error
      ) {
        console.warn(
          "[server] Rate limit shutdown warning:",
          error.message
        );
      }

      // ======================================================================
      // 11. DISCONNECT AUTHORITATIVE DATABASE
      // ======================================================================

      /*
       * Phase 13 final architecture:
       *
       * PostgreSQL is the authoritative transactional database.
       * dbService owns its lifecycle.
       *
       * There is no normal-runtime MongoDB connection to close.
       */
      await safeShutdownStep(
        "PostgreSQL database disconnected",
        async () => {
          await disconnectDatabase();

          postgresRuntimeStatus
            .initialized =
            false;

          postgresRuntimeStatus
            .healthy =
            null;

          postgresRuntimeStatus
            .health =
            null;
        }
      );
      transitionApplicationState(
        APPLICATION_STATE
          .STOPPED,
        `shutdown_complete_${signal}`
      );

      console.log(
        `[shutdown] [STOPPED] Graceful shutdown complete duration=${elapsedMs(shutdownStartedAt)}ms`
      );

      if (
        exitProcess
      ) {
        process.exit(
          exitCode
        );
      }

      return {
        stopped:
          true,

        signal,

        exitCode,

        executionAuthorized:
          false,
      };
    })();

  /*
   * Hard shutdown deadline.
   */
  if (
    exitProcess
  ) {
    const forceTimer =
      setTimeout(
        () => {
          console.error(
            `[server] Graceful shutdown exceeded ${shutdownTimeoutMs}ms; forcing process exit`
          );

          process.exit(
            exitCode ===
              0
              ? 1
              : exitCode
          );
        },
        shutdownTimeoutMs
      );

    if (
      typeof forceTimer
        .unref ===
      "function"
    ) {
      forceTimer
        .unref();
    }

    shutdown.promise
      .finally(
        () => {
          clearTimeout(
            forceTimer
          );
        }
      );
  }

  return shutdown.promise;
}

shutdown.inProgress =
  false;

shutdown.promise =
  null;

// ============================================================================
// PROCESS SIGNAL HANDLERS
// ============================================================================

function registerProcessSignalHandlers() {
  process.on(
    "SIGINT",
    () => {
      void shutdown(
        "SIGINT"
      );
    }
  );

  process.on(
    "SIGTERM",
    () => {
      void shutdown(
        "SIGTERM"
      );
    }
  );
}


// ============================================================================
// DIRECT PROCESS ENTRYPOINT
// ============================================================================

/*
 * Importing server.js must NOT automatically start AIRA.
 *
 * This prevents Jest from connecting Redis, RabbitMQ,
 * Kubernetes, schedulers and background jobs just because
 * the Express app was imported.
 *
 * AIRA starts normally only when we run:
 *
 *   node server.js
 */

if (
  require.main ===
  module
) {
  registerProcessSignalHandlers();

  startServer()
    .catch(
      (
        error
      ) => {
        console.error(
          "[server] Fatal startup failure:",
          error
        );

        applicationLifecycle
          .state =
          APPLICATION_STATE
            .FAILED;

        applicationLifecycle
          .lastError =
          error.message;

        process.exitCode =
          1;
      }
    );
}


// ============================================================================
// TESTABLE LIFECYCLE EXPORTS
// ============================================================================

app.applicationLifecycle =
  applicationLifecycle;

app.APPLICATION_STATE =
  APPLICATION_STATE;

app.getApplicationLifecycleStatus =
  getApplicationLifecycleStatus;

app.isApplicationReady =
  isApplicationReady;

app.transitionApplicationState =
  transitionApplicationState;

app.startServer =
  startServer;

app.shutdown =
  shutdown;

app.registerProcessSignalHandlers =
  registerProcessSignalHandlers;


// ============================================================================
// EXPRESS APP EXPORT
// ============================================================================

module.exports =
  app;
