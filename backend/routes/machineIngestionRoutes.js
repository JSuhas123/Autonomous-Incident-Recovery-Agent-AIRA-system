"use strict";

const {
  Incident,
  AgentIntelligenceRun,
} =
  require(
    "../persistence/operational/canonicalModels"
  );

const {
  Service,
} =
  require(
    "../persistence/operational/operationalModels"
  );

/**
 * Machine Ingestion Routes
 *
 * External monitoring and infrastructure systems send machine signals here.
 *
 * SECURITY:
 * - Protected by HMAC machine authentication.
 * - Tenant isolation is enforced by upstream middleware.
 * - Incoming signals cannot directly trigger arbitrary actions.
 * - Every production signal must flow through:
Signal
  ↓
Canonical Incident
  ↓
DiagnosisLifecycleService
  ↓
DiagnosisCoordinator
  ↓
Diagnosis Safety Gate
  ↓
AgentOrchestrator.continueFromDiagnosis()
  ↓
Playbook / Policy / Authorization / Execution
 *
 * Mounted in server.js as:
 *
 *   app.use(
 *     "/api/v1/tenants/:tenantId",
 *     authMiddleware,
 *     tenantIsolationMiddleware,
 *     rateLimitingMiddleware("api"),
 *     machineIngestionRoutes
 *   );
 */

const express = require("express");
const crypto = require("node:crypto");

const router = express.Router();


const { getAgentOrchestratorInstance } = require("../agents/v2");

const diagnosisLifecycleService =
  require(
    "../services/diagnosis/diagnosisLifecycleService"
  );

const {
  getQueueService,
} = require("../services/infrastructure/queueService");

const {
  decisionPipelineObservability,
} = require("../services/observability");

const {
  loggingService,
} = require("../services/infrastructure");

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const OPEN_INCIDENT_STATUSES = [
  "open",
  "acknowledged",
  "investigating",
  "recovering",
];

const SEVERITY_MAP = {
  info: "info",
  low: "info",

  warning: "warning",
  medium: "warning",
  high: "warning",

  critical: "critical",
};

const MAX_SIGNAL_DESCRIPTION_LENGTH = 1800;

// ─────────────────────────────────────────────────────────────────────────────
// POST /signals
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/signals",
  async (
    req,
    res,
    next
  ) => {
    try {
      const tenantId =
        req.tenant
          ?.id;

      const signal =
        req.body ||
        {};

      if (
        !tenantId
      ) {
        return res
          .status(
            400
          )
          .json({
            error:
              "tenantId not set by authentication middleware",

            code:
              "TENANT_CONTEXT_MISSING",
          });
      }

      if (
        !signal ||
        typeof signal !==
          "object" ||
        Array.isArray(
          signal
        )
      ) {
        return res
          .status(
            400
          )
          .json({
            error:
              "Signal body must be a JSON object",

            code:
              "INVALID_SIGNAL",
          });
      }

      // ======================================================================
      // 1. RESOLVE SIGNAL → TENANT-OWNED SERVICE
      // ======================================================================

      const service =
        await _resolveServiceForSignal(
          tenantId,
          signal
        );

      /*
       * Never guess which service an external alert belongs to.
       */
      if (
        !service
      ) {
        loggingService
          .warn(
            "[machineIngestion] Signal could not be mapped to a tenant service",
            {
              tenantId,

              suppliedServiceId:
                signal
                  .serviceId ||
                null,

              suppliedService:
                signal
                  .service ||
                signal
                  .serviceName ||
                null,

              affectedServices:
                signal
                  .affectedServices ||
                [],
            }
          );

        return res
          .status(
            422
          )
          .json({
            error:
              "Signal could not be mapped to a known tenant service",

            code:
              "SERVICE_RESOLUTION_REQUIRED",

            manualRequired:
              true,

            hint:
              "Include serviceId, service/serviceName, or a resolvable affectedServices entry.",
          });
      }

      /*
       * Phase 12.1:
       *
       * Canonical diagnosis requires an explicit environment boundary.
       *
       * Never derive this from arbitrary external signal text when the
       * tenant-owned Service already defines the environment.
       */
      if (
        !service
          .environmentId
      ) {
        loggingService
          .warn(
            "[machineIngestion] Resolved service has no canonical environmentId",
            {
              tenantId,

              serviceId:
                service
                  ._id
                  .toString(),
            }
          );

        return res
          .status(
            422
          )
          .json({
            error:
              "Resolved service is missing canonical environment scope",

            code:
              "SERVICE_ENVIRONMENT_REQUIRED",

            manualRequired:
              true,
          });
      }

      const organizationId =
        String(
          service
            .organizationId ||
          tenantId
        );

      const environmentId =
        String(
          service
            .environmentId
        );

      const correlationId =
        signal
          .correlationId ||
        req.headers[
          "x-correlation-id"
        ] ||
        crypto
          .randomUUID();

      decisionPipelineObservability
        .recordSignalInjected(
          signal,
          tenantId
        );

      // ======================================================================
      // 2. PUBLISH RAW SIGNAL EVENT
      // ======================================================================

      const queue =
        await getQueueService();

      try {
        await queue
          .publishEvent(
            queue
              .topics
              .SIGNAL_RECEIVED,

            {
              eventId:
                crypto
                  .randomUUID(),

              correlationId,

              tenantId,

              organizationId,

              environmentId,

              payload:
                _stripSensitive(
                  signal
                ),

              timestamp:
                new Date(),
            }
          );
      } catch (
        backpressureError
      ) {
        if (
          backpressureError
            .message
            ?.includes(
              "BACKPRESSURE"
            ) ||
          backpressureError
            .message
            ?.includes(
              "buffer"
            )
        ) {
          return res
            .status(
              503
            )
            .json({
              error:
                "System overloaded — queue depth exceeded",

              code:
                "QUEUE_BACKPRESSURE",

              retryAfter:
                "PT10S",

              correlationId,
            });
        }

        throw backpressureError;
      }

      // ======================================================================
      // 3. CREATE OR UPDATE CANONICAL INCIDENT
      // ======================================================================

      const {
        incident,
        created,
      } =
        await _openOrUpdateMachineIncident({
          tenantId,

          service,

          signal,

          correlationId,
        });

      // ======================================================================
      // 4. CANONICAL DIAGNOSIS LIFECYCLE
      // ======================================================================

      const lifecyclePayload = {
        organizationId,

        environmentId,

        incidentId:
          incident
            ._id
            .toString(),
      };

      const diagnosisResult =
        created
          ? await diagnosisLifecycleService
              .onIncidentDetected(
                lifecyclePayload
              )

          : await diagnosisLifecycleService
              .onSignalAttached(
                lifecyclePayload
              );

      /*
       * A repeated signal may intentionally be diagnosis-debounced.
       *
       * In that case we accept the machine event but do NOT bypass the
       * lifecycle by invoking another diagnosis pipeline.
       */
      if (
        !diagnosisResult
          .triggered
      ) {
        return res
          .status(
            created
              ? 202
              : 200
          )
          .json({
            accepted:
              true,

            incident: {
              id:
                incident
                  ._id
                  .toString(),

              created,

              status:
                incident
                  .status,

              severity:
                incident
                  .severity,

              serviceId:
                service
                  ._id
                  .toString(),

              service:
                service
                  .name,

              environmentId,
            },

            diagnosis: {
              triggered:
                false,

              reason:
                diagnosisResult
                  .reason,
            },

            intelligence: {
              state:
                "DIAGNOSIS_DEBOUNCED",

              manualRequired:
                false,
            },

            message:
              "Signal accepted; duplicate diagnosis suppressed by lifecycle debounce",
          });
      }

      if (
        !diagnosisResult
          .canonicalResult
      ) {
        throw new Error(
          "Diagnosis lifecycle completed without canonical result"
        );
      }

      // ======================================================================
      // 5. CONTINUE FROM CANONICAL DIAGNOSIS
      // ======================================================================

      const orchestrator =
        getAgentOrchestratorInstance();

      const {
        runRecord,
      } =
        await orchestrator
          .continueFromDiagnosis({
            canonicalResult:
              diagnosisResult
                .canonicalResult,

            tenantId,

            organizationId,

            environmentId,

            correlationId,

            environment:
              service
                .environment ||
              null,

            provider:
              signal
                .provider ||
              _inferProvider(
                signal,
                service
              ),

            resource:
              _extractResourceContext(
                signal,
                service
              ),
          });

      if (
        !runRecord
      ) {
        throw new Error(
          "AgentOrchestrator continuation completed without returning a run record"
        );
      }

      // ======================================================================
      // 6. PERSIST POST-DIAGNOSIS INTELLIGENCE RUN
      // ======================================================================

      await _persistAgentRun(
        runRecord,
        tenantId
      );

      // ======================================================================
      // 7. INCIDENT TIMELINE
      // ======================================================================

      await _appendIntelligenceTimeline(
        incident,
        runRecord
      );

      // ======================================================================
      // 8. RESPONSE
      // ======================================================================

      return res
        .status(
          created
            ? 202
            : 200
        )
        .json({
          accepted:
            true,

          incident: {
            id:
              incident
                ._id
                .toString(),

            created,

            status:
              incident
                .status,

            severity:
              incident
                .severity,

            serviceId:
              service
                ._id
                .toString(),

            service:
              service
                .name,

            environmentId,
          },

          diagnosis: {
            runId:
              diagnosisResult
                .runId,

            diagnosisId:
              diagnosisResult
                .diagnosisId,

            revision:
              diagnosisResult
                .revision,

            confidence:
              diagnosisResult
                .confidence,

            decision:
              diagnosisResult
                .decision,

            safetyGateDecision:
              diagnosisResult
                .safetyGateDecision,

            canEvaluatePlaybook:
              diagnosisResult
                .canEvaluatePlaybook,
          },

          intelligence: {
            runId:
              runRecord
                .runId,

            sourceDiagnosisRunId:
              runRecord
                .sourceDiagnosisRunId ||
              diagnosisResult
                .runId,

            correlationId:
              runRecord
                .correlationId,

            state:
              runRecord
                .state,

            manualRequired:
              Boolean(
                runRecord
                  .manualRequired
              ),

            manualReason:
              runRecord
                .manualReason ||
              null,

            outcome:
              runRecord
                .executionResult
                ?.outcome ||
              null,

            playbookExecutionId:
              runRecord
                .executionResult
                ?.execution
                ?.executionId ||
              null,
          },

          message:
            runRecord
              .manualRequired
              ? "Signal diagnosed canonically; manual intervention required"
              : "Signal processed through canonical diagnosis and recovery workflow",
        });
    } catch (
      error
    ) {
      if (
        error
          .message
          ?.includes(
            "AgentOrchestrator has not been initialized"
          )
      ) {
        return res
          .status(
            503
          )
          .json({
            error:
              "Agent intelligence runtime unavailable",

            code:
              "AGENT_RUNTIME_UNAVAILABLE",

            details:
              error
                .message,
          });
      }

      if (
        error.code ===
        "TENANT_BOUNDARY_VIOLATION"
      ) {
        return res
          .status(
            403
          )
          .json({
            error:
              "Tenant boundary violation",

            code:
              error.code,
          });
      }

      return next(
        error
      );
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /actions/:id/dry-run
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/actions/:id/dry-run",
  async (req, res, next) => {
    try {
      const { id } = req.params;

      /**
       * NOTE:
       * This endpoint is still a simulation-only compatibility endpoint.
       *
       * It must NOT be interpreted as proof that an action would succeed.
       * A real dry-run implementation will later delegate to the runbook /
       * playbook execution platform.
       */
      return res.json({
        dryRun: {
          actionId: id,
          status: "simulated",
          outcome: "NOT_EXECUTED",
          expectedResult: null,
          timestamp:
            new Date().toISOString(),
          simulationNote:
            "Simulation only. No production action was executed.",
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Service resolution
// ─────────────────────────────────────────────────────────────────────────────

async function _resolveServiceForSignal(
  tenantId,
  signal
) {
  /**
   * Preferred:
   *
   * signal.serviceId = actual Service Mongo _id
   */
  if (signal.serviceId) {
    const service =
      await Service.findOne({
        _id: signal.serviceId,
        tenantId,
        status: {
          $ne: "archived",
        },
      });

    if (service) {
      return service;
    }
  }

  const candidates = [];

  if (
    typeof signal.service === "string"
  ) {
    candidates.push(
      signal.service
    );
  }

  if (
    typeof signal.serviceName ===
    "string"
  ) {
    candidates.push(
      signal.serviceName
    );
  }

  if (
    Array.isArray(
      signal.affectedServices
    )
  ) {
    candidates.push(
      ...signal.affectedServices
        .filter(
          (value) =>
            typeof value ===
            "string"
        )
    );
  }

  for (
    const rawCandidate
    of candidates
  ) {
    const candidate =
      rawCandidate.trim();

    if (!candidate) {
      continue;
    }

    const service =
      await Service.findOne({
        tenantId,
        status: {
          $ne: "archived",
        },

        $or: [
          {
            slug:
              candidate.toLowerCase(),
          },
          {
            name:
              candidate,
          },
        ],
      });

    if (service) {
      return service;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident creation / deduplication
// ─────────────────────────────────────────────────────────────────────────────

async function _openOrUpdateMachineIncident({
  tenantId,
  service,
  signal,
  correlationId,
}) {
  const now =
    new Date();

  if (
    !service
      ?.environmentId
  ) {
    throw Object.assign(
      new Error(
        "Machine incident creation requires service.environmentId"
      ),
      {
        code:
          "SERVICE_ENVIRONMENT_REQUIRED",
      }
    );
  }

  const organizationId =
    service
      .organizationId;

  const environmentId =
    service
      .environmentId;

  const fingerprint =
    _buildSignalFingerprint({
      tenantId,

      serviceId:
        service
          ._id
          .toString(),

      signal,
    });

  /*
   * Incident deduplication is scoped to organization + environment + tenant.
   *
   * The previous implementation omitted environmentId here, which could cause
   * incidents from different environments to collide if their fingerprint
   * matched.
   */
  const existing =
    await Incident
      .findOne({
        organizationId,

        environmentId,

        tenantId,

        fingerprint,

        status: {
          $in:
            OPEN_INCIDENT_STATUSES,
        },
      });

  if (
    existing
  ) {
    existing
      .lastObservedAt =
      now;

    existing
      .occurrenceCount =
      (
        existing
          .occurrenceCount ||
        0
      ) +
      1;

    existing
      .severity =
      _normaliseIncidentSeverity(
        signal
          .severity
      );

    /*
     * Preserve canonical correlation information where the model supports it.
     */
    if (
      !existing
        .correlationId
    ) {
      existing
        .correlationId =
        correlationId;
    }

    existing
      .timeline
      .push({
        occurredAt:
          now,

        eventType:
          "observed_failure",

        actor:
          "system",

        description:
          "External machine signal observed again.",

        metadata: {
          correlationId,

          source:
            signal
              .source ||
            signal
              .provider ||
            "machine",

          alert:
            signal
              .alert ||
            signal
              .alertName ||
            null,

          environmentId:
            String(
              environmentId
            ),
        },
      });

    await existing
      .save();

    return {
      incident:
        existing,

      created:
        false,
    };
  }

  const incident =
    await Incident
      .create({
        organizationId,

        environmentId,

        tenantId,

        serviceId:
          service
            ._id,

        source:
          "integration",

        sourceEventId:
          signal
            .eventId ||
          signal
            .alertId ||
          correlationId,

        correlationId,

        fingerprint,

        title:
          _buildIncidentTitle(
            signal,
            service
          ),

        description:
          _buildIncidentDescription(
            signal,
            service
          ),

        severity:
          _normaliseIncidentSeverity(
            signal
              .severity
          ),

        status:
          "open",

        impact:
          _buildImpact(
            signal,
            service
          ),

        startedAt:
          _extractSignalTime(
            signal
          ),

        detectedAt:
          now,

        lastObservedAt:
          now,

        occurrenceCount:
          1,

        tags:
          _buildIncidentTags(
            signal,
            service
          ),

        timeline: [
          {
            occurredAt:
              now,

            eventType:
              "opened",

            actor:
              "system",

            description:
              "Incident created from authenticated machine signal.",

            metadata: {
              correlationId,

              source:
                signal
                  .source ||
                signal
                  .provider ||
                "machine",

              serviceId:
                service
                  ._id
                  .toString(),

              environmentId:
                String(
                  environmentId
                ),
            },
          },
        ],
      });

  return {
    incident,

    created:
      true,
  };
}

function _buildSignalFingerprint({
  tenantId,
  serviceId,
  signal,
}) {
  const failureIdentity = [
    signal.alertId,
    signal.alert,
    signal.alertName,
    signal.rule,
    signal.incidentType,
    signal.type,
    signal.errorCode,
    signal.reason,
  ]
    .filter(Boolean)
    .join("|");

  const raw = [
    tenantId,
    serviceId,
    failureIdentity ||
      "generic_machine_signal",
  ].join("::");

  return crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex")
    .slice(0, 32);
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator context
// ─────────────────────────────────────────────────────────────────────────────

function _buildOrchestratorIncident(
  incident,
  signal,
  service
) {
  return {
    id:
      incident._id.toString(),

    type:
      signal.incidentType ||
      signal.type ||
      signal.alertName ||
      signal.alert ||
      "unknown",

    severity:
      incident.severity,

    title:
      incident.title,

    description:
      incident.description,

    serviceId:
      service._id.toString(),

    provider:
      signal.provider ||
      _inferProvider(
        signal,
        service
      ),

    environment:
      signal.environment ||
      service.environment,

    resource:
      _extractResourceContext(
        signal,
        service
      ),

    /**
     * Keep full raw signal available to the V2 reasoning pipeline,
     * but strip obvious credentials first.
     */
    signal:
      _stripSensitive(
        signal
      ),

    evidence:
      _extractEvidenceContext(
        signal
      ),

    tags:
      incident.tags ||
      [],

    createdAt:
      incident.createdAt ||
      new Date(),
  };
}

function _extractResourceContext(
  signal,
  service
) {
  return {
    service:
      service._id.toString(),

    serviceName:
      service.name,

    namespace:
      signal.namespace ||
      signal.kubernetes?.namespace ||
      null,

    pod:
      signal.pod ||
      signal.podName ||
      signal.pod_name ||
      signal.kubernetes?.pod ||
      null,

    deployment:
      signal.deployment ||
      signal.deploymentName ||
      signal.kubernetes?.deployment ||
      null,

    cluster:
      signal.cluster ||
      signal.clusterName ||
      signal.kubernetes?.cluster ||
      null,

    node:
      signal.node ||
      signal.nodeName ||
      signal.kubernetes?.node ||
      null,

    container:
      signal.container ||
      signal.containerName ||
      signal.kubernetes?.container ||
      null,
  };
}

function _extractEvidenceContext(
  signal
) {
  return {
    errorRate:
      _numberOrNull(
        signal.errorRate
      ),

    responseTimeMs:
      _numberOrNull(
        signal.responseTimeMs ??
        signal.responseTime
      ),

    cpuPercent:
      _numberOrNull(
        signal.cpuPercent ??
        signal.cpu
      ),

    memoryPercent:
      _numberOrNull(
        signal.memoryPercent ??
        signal.memory
      ),

    statusCode:
      _numberOrNull(
        signal.statusCode
      ),

    errorCode:
      signal.errorCode ||
      null,

    reason:
      signal.reason ||
      null,

    message:
      signal.message ||
      signal.description ||
      null,

    restartCount:
      _numberOrNull(
        signal.restartCount
      ),
  };
}

function _buildMetricContext(
  signal
) {
  return {
    errorRate:
      _numberOrNull(
        signal.errorRate
      ),

    responseTime:
      _numberOrNull(
        signal.responseTime ??
        signal.responseTimeMs
      ),

    cpu:
      _numberOrNull(
        signal.cpu ??
        signal.cpuPercent
      ),

    memory:
      _numberOrNull(
        signal.memory ??
        signal.memoryPercent
      ),

    requestRate:
      _numberOrNull(
        signal.requestRate
      ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent intelligence persistence
// ─────────────────────────────────────────────────────────────────────────────

async function _persistAgentRun(
  runRecord,
  tenantId
) {
  await AgentIntelligenceRun
    .create({
      runId:
        runRecord
          .runId,

      incidentId:
        runRecord
          .incidentId,

      correlationId:
        runRecord
          .correlationId,

      tenantId,

      /*
       * Phase 12 canonical ownership scope.
       */
      organizationId:
        runRecord
          .organizationId ||
        null,

      environmentId:
        runRecord
          .environmentId ||
        null,

      state:
        runRecord
          .state,

      startedAt:
        runRecord
          .startedAt
          ? new Date(
              runRecord
                .startedAt
            )
          : new Date(),

      completedAt:
        runRecord
          .completedAt
          ? new Date(
              runRecord
                .completedAt
            )
          : null,

      manualRequired:
        Boolean(
          runRecord
            .manualRequired
        ),

      manualReason:
        runRecord
          .manualReason ||
        null,

      error:
        runRecord
          .error ||
        null,

      agentTrace:
        _safeTrace(
          runRecord
            .agentTrace
        ),

      // ======================================================================
      // PHASE 12.12 — BUDGET AUDIT
      // PHASE 12.13 — SECURITY FINDINGS
      // PHASE 12.14 — CANONICAL DECISION TRACE
      // ======================================================================

      decisionTraceSchemaVersion:
        "12.14-v1",

      decisionTrace:
        runRecord
          .decisionTrace ||
        null,

      budgetUsage:
        runRecord
          .budgetUsage ||
        null,

      securityFindings:
        runRecord
          .securityFindings ||
        [],

      // ======================================================================
      // EXISTING EXECUTION SUMMARY
      // ======================================================================

      playbookExecutionId:
        runRecord
          .executionResult
          ?.execution
          ?.executionId ||
        runRecord
          .executionResult
          ?.executionId ||
        null,

      explanationTitle:
        runRecord
          .explanationResult
          ?.title ||
        null,

      finalOutcome:
        runRecord
          .executionResult
          ?.outcome ||
        (
          runRecord
            .manualRequired
            ? "MANUAL_REQUIRED"
            : null
        ),

      learningCount:
        Array.isArray(
          runRecord
            .learningResult
            ?.recommendations
        )
          ? runRecord
              .learningResult
              .recommendations
              .length

          : Array.isArray(
              runRecord
                .learningResult
            )
            ? runRecord
                .learningResult
                .length

            : 0,
    });
}

async function _appendIntelligenceTimeline(
  incident,
  runRecord
) {
  incident.timeline.push({
    occurredAt:
      new Date(),

    eventType:
      runRecord.manualRequired
        ? "agent_manual_required"
        : "agent_analysis_completed",

    actor:
      "system",

    description:
      runRecord.manualRequired
        ? `V2 agent intelligence requires manual intervention: ${
            runRecord.manualReason ||
            "unspecified reason"
          }.`
        : "V2 agent intelligence run completed.",

    metadata: {
      runId:
        runRecord.runId,

      correlationId:
        runRecord.correlationId,

      state:
        runRecord.state,

      manualRequired:
        Boolean(
          runRecord.manualRequired
        ),

      manualReason:
        runRecord.manualReason ||
        null,

      outcome:
        runRecord.executionResult
          ?.outcome ||
        null,

      playbookExecutionId:
        runRecord.executionResult
          ?.execution
          ?.executionId ||
        null,
    },
  });

  /**
   * Reflect active investigation state without prematurely resolving
   * incidents based purely on orchestrator completion.
   *
   * Actual recovery/verification will later own the resolved transition.
   */
  if (
    !runRecord.manualRequired &&
    incident.status === "open"
  ) {
    incident.status =
      "investigating";
  }

  await incident.save();
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident presentation helpers
// ─────────────────────────────────────────────────────────────────────────────

function _buildIncidentTitle(
  signal,
  service
) {
  const alertName =
    signal.alertName ||
    signal.alert ||
    signal.incidentType ||
    signal.type ||
    signal.reason;

  if (alertName) {
    return `${alertName} — ${service.name}`
      .slice(0, 256);
  }

  return `Machine signal detected — ${service.name}`
    .slice(0, 256);
}

function _buildIncidentDescription(
  signal,
  service
) {
  const parts = [
    signal.description,
    signal.message,

    signal.errorRate !== undefined
      ? `errorRate=${signal.errorRate}`
      : null,

    (
      signal.responseTime !== undefined ||
      signal.responseTimeMs !== undefined
    )
      ? `responseTime=${
          signal.responseTime ??
          signal.responseTimeMs
        }ms`
      : null,

    signal.errorCode
      ? `errorCode=${signal.errorCode}`
      : null,

    `service=${service.name}`,
  ].filter(Boolean);

  return parts
    .join(". ")
    .slice(
      0,
      MAX_SIGNAL_DESCRIPTION_LENGTH
    );
}

function _buildImpact(
  signal,
  service
) {
  const affectedServices =
    Array.isArray(
      signal.affectedServices
    )
      ? signal.affectedServices.length
      : 1;

  return (
    `Authenticated external signal reports impact to ` +
    `${affectedServices} service(s); primary service: ${service.name}.`
  ).slice(0, 512);
}

function _buildIncidentTags(
  signal,
  service
) {
  const tags =
    new Set();

  tags.add(
    "machine-ingestion"
  );

  if (service.type) {
    tags.add(
      service.type
    );
  }

  if (signal.provider) {
    tags.add(
      String(
        signal.provider
      ).toLowerCase()
    );
  }

  if (
    signal.namespace ||
    signal.pod ||
    signal.deployment ||
    signal.kubernetes
  ) {
    tags.add(
      "kubernetes"
    );
  }

  if (
    Array.isArray(signal.tags)
  ) {
    for (
      const tag
      of signal.tags
    ) {
      if (
        typeof tag === "string" &&
        tag.trim()
      ) {
        tags.add(
          tag.trim().toLowerCase()
        );
      }
    }
  }

  return Array.from(tags)
    .slice(0, 20);
}

function _normaliseIncidentSeverity(
  severity
) {
  if (!severity) {
    return "warning";
  }

  return (
    SEVERITY_MAP[
      String(severity)
        .toLowerCase()
    ] ||
    "warning"
  );
}

function _extractSignalTime(
  signal
) {
  const raw =
    signal.startedAt ||
    signal.timestamp ||
    signal.occurredAt;

  if (!raw) {
    return new Date();
  }

  const parsed =
    new Date(raw);

  return Number.isNaN(
    parsed.getTime()
  )
    ? new Date()
    : parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider inference
// ─────────────────────────────────────────────────────────────────────────────

function _inferProvider(
  signal,
  service
) {
  if (signal.provider) {
    return String(
      signal.provider
    ).toLowerCase();
  }

  if (
    service.type ===
      "kubernetes" ||
    signal.namespace ||
    signal.pod ||
    signal.deployment ||
    signal.kubernetes
  ) {
    return "kubernetes";
  }

  if (
    service.type ===
    "database"
  ) {
    return "database";
  }

  if (
    service.type ===
    "docker"
  ) {
    return "docker";
  }

  if (
    service.type ===
    "cloud"
  ) {
    return "cloud";
  }

  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Security helpers
// ─────────────────────────────────────────────────────────────────────────────

const SECRET_KEYS =
  /password|secret|token|api[_-]?key|private[_-]?key|credential|authorization|auth[_-]?header|certificate|cert/i;

function _stripSensitive(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(
      _stripSensitive
    );
  }

  if (
    typeof value !==
    "object"
  ) {
    return value;
  }

  const output = {};

  for (
    const [
      key,
      nestedValue,
    ]
    of Object.entries(value)
  ) {
    if (
      SECRET_KEYS.test(key)
    ) {
      output[key] =
        "[REDACTED]";
      continue;
    }

    output[key] =
      _stripSensitive(
        nestedValue
      );
  }

  return output;
}

function _safeTrace(
  trace
) {
  if (!Array.isArray(trace)) {
    return [];
  }

  return trace.map(
    (record) => ({
      agent:
        record.agent ||
        null,

      version:
        record.version ||
        null,

      status:
        record.status ||
        null,

      startedAt:
        record.startedAt ||
        null,

      completedAt:
        record.completedAt ||
        null,

      durationMs:
        typeof record.durationMs ===
        "number"
          ? record.durationMs
          : null,

      confidence:
        typeof record.confidence ===
        "number"
          ? record.confidence
          : null,

      evidenceUsed:
        Array.isArray(
          record.evidenceUsed
        )
          ? record.evidenceUsed
          : [],

      result:
        record.result
          ? _stripSensitive(
              record.result
            )
          : null,

      warnings:
        Array.isArray(
          record.warnings
        )
          ? record.warnings
          : [],

      error:
        typeof record.error ===
        "string"
          ? record.error
          : record.error?.message ||
            null,

      model:
        record.model ||
        null,

      provider:
        record.provider ||
        null,

      fallbackUsed:
        Boolean(
          record.fallbackUsed
        ),

      tokenEstimate:
        typeof record.tokenEstimate ===
        "number"
          ? record.tokenEstimate
          : null,
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function _numberOrNull(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

module.exports = router;