"use strict";

/**
 * Agent Intelligence API Routes
 *
 * Phase 12 canonical incident-intelligence workflow.
 *
 * SECURITY:
 *
 * - caller cannot invoke arbitrary agent tools
 * - tenant + environment isolation required
 * - incident reads use IncidentRepository
 * - intelligence persistence uses AgentIntelligenceRunRepository
 * - canonical diagnosis remains authoritative
 */

const express =
  require(
    "express"
  );

const {
  v4: uuidv4,
} =
  require(
    "uuid"
  );

const {
  incidentRepository,
  agentIntelligenceRunRepository,
} =
  require(
    "../persistence/repositories"
  );

const {
  requestContextMiddleware,
} =
  require(
    "../middleware/requestContextMiddleware"
  );

const {
  environmentContextMiddleware,
} =
  require(
    "../middleware/environmentContextMiddleware"
  );

const {
  getAgentOrchestratorInstance,
} =
  require(
    "../agents/v2"
  );

const diagnosisLifecycleService =
  require(
    "../services/diagnosis/diagnosisLifecycleService"
  );

const router =
  express.Router();

/*
 * server.js already runs sessionAuthMiddleware before this router.
 *
 * Finish canonical context resolution here so every route receives:
 *
 * req.context.organizationId
 * req.context.environmentId
 */
router.use(
  requestContextMiddleware,
  environmentContextMiddleware
);


// ============================================================================
// ANALYZE
// ============================================================================

async function analyzeIncident(
  req,
  res
) {
  try {
    const tenantId =
      req.auth
        ?.tenantId ||
      req.context
        ?.tenantId ||
      null;

    const organizationId =
      req.context
        ?.organizationId;

    const environmentId =
      req.context
        ?.environmentId;

    const incidentId =
      req.params
        .incidentId;

    if (
      !organizationId ||
      !environmentId
    ) {
      return res
        .status(
          400
        )
        .json({
          error:
            "Canonical organization and environment context are required",

          code:
            "AGENT_INTELLIGENCE_SCOPE_REQUIRED",
        });
    }

    const incident =
      await incidentRepository
        .findOne({
          _id:
            incidentId,

          organizationId,

          environmentId,
        });

    if (
      !incident
    ) {
      return res
        .status(
          404
        )
        .json({
          error:
            "Incident not found",
        });
    }

    const effectiveTenantId =
      tenantId ||
      String(
        incident.organizationId ||
        organizationId
      );

    const correlationId =
      req.body
        ?.correlationId ||
      incident
        .correlationGroupId ||
      incident
        .correlationId ||
      uuidv4();

    // ========================================================================
    // CANONICAL DIAGNOSIS
    // ========================================================================

    const diagnosisResult =
      await diagnosisLifecycleService
        .runDiagnosis({
          organizationId,

          environmentId,

          incidentId:
            String(
              incident._id
            ),

          reason:
            req.path
              ?.includes(
                "retry-analysis"
              )
              ? "manual_retry_analysis"
              : "manual_analysis",
        });

    if (
      !diagnosisResult
        ?.canonicalResult
    ) {
      throw new Error(
        "Diagnosis lifecycle completed without canonical result"
      );
    }

    // ========================================================================
    // RECOVERY PLANNING CONTINUATION
    // ========================================================================

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

          tenantId:
            effectiveTenantId,

          organizationId,

          environmentId,

          correlationId,

          environment:
            incident
              .environment ||
            null,

          resource: {
            namespace:
              incident
                .evidence
                ?.namespace ||
              incident
                .signal
                ?.namespace ||
              null,

            pod:
              incident
                .evidence
                ?.pod ||
              incident
                .signal
                ?.pod ||
              null,

            deployment:
              incident
                .evidence
                ?.deployment ||
              incident
                .signal
                ?.deployment ||
              null,

            cluster:
              incident
                .evidence
                ?.cluster ||
              incident
                .signal
                ?.cluster ||
              null,
          },
        });

    if (
      !runRecord
    ) {
      throw new Error(
        "AgentOrchestrator continuation completed without returning a run record"
      );
    }

    // ========================================================================
    // PERSIST TRACE
    // ========================================================================

    await agentIntelligenceRunRepository
      .create({
        runId:
          runRecord
            .runId,

        incidentId:
          runRecord
            .incidentId ||
          incidentId,

        correlationId:
          runRecord
            .correlationId ||
          correlationId,

        correlationGroupId:
          incident
            .correlationGroupId ||
          null,

        tenantId:
          effectiveTenantId,

        organizationId,

        environmentId,

        state:
          runRecord
            .state,

        status:
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
            : 0,

        metadata: {
          diagnosisRunId:
            diagnosisResult
              .runId ||
            null,

          diagnosisId:
            diagnosisResult
              .diagnosisId ||
            null,

          diagnosisRevision:
            diagnosisResult
              .revision ||
            null,
        },
      });

    return res
      .status(
        202
      )
      .json({
        runId:
          runRecord
            .runId,

        diagnosisRunId:
          diagnosisResult
            .runId,

        diagnosisId:
          diagnosisResult
            .diagnosisId,

        diagnosisRevision:
          diagnosisResult
            .revision,

        diagnosisConfidence:
          diagnosisResult
            .confidence,

        diagnosisDecision:
          diagnosisResult
            .decision,

        safetyGateDecision:
          diagnosisResult
            .safetyGateDecision,

        canEvaluatePlaybook:
          diagnosisResult
            .canEvaluatePlaybook,

        incidentId:
          runRecord
            .incidentId,

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
      });
  } catch (
    error
  ) {
    console.error(
      "[agent-intelligence-routes] analyze error:",
      error
    );

    if (
      error.message
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

          details:
            error.message,
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

    return res
      .status(
        error.status ||
        500
      )
      .json({
        error:
          "Agent analysis failed",

        details:
          error.message,
      });
  }
}


router.post(
  "/:incidentId/analyze",
  analyzeIncident
);


// ============================================================================
// INTELLIGENCE
// ============================================================================

router.get(
  "/:incidentId/intelligence",
  async (
    req,
    res
  ) => {
    try {
      const incidentId =
        req.params
          .incidentId;

      const run =
        await agentIntelligenceRunRepository
          .findLatestForIncident(
            _resolveScope(
              req,
              incidentId
            )
          );

      if (
        !run
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "No intelligence run found for this incident",
          });
      }

      return res.json(
        _serialiseRun(
          run
        )
      );
    } catch (
      error
    ) {
      console.error(
        "[agent-intelligence-routes] intelligence retrieval error:",
        error
      );

      return res
        .status(
          error.status ||
          500
        )
        .json({
          error:
            "Failed to retrieve intelligence",

          details:
            error.message,
        });
    }
  }
);


// ============================================================================
// EVIDENCE
// ============================================================================

router.get(
  "/:incidentId/evidence",
  async (
    req,
    res
  ) => {
    try {
      const incidentId =
        req.params
          .incidentId;

      const run =
        await agentIntelligenceRunRepository
          .findLatestForIncident(
            _resolveScope(
              req,
              incidentId
            )
          );

      if (
        !run
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "No intelligence run found",
          });
      }

      const investigationRecord =
        (
          run.agentTrace ||
          []
        )
          .find(
            (
              record
            ) =>
              record.agent ===
              "InvestigationAgent"
          );

      const evidence =
        investigationRecord
          ?.result
          ?.evidencePackage ||
        investigationRecord
          ?.result
          ?.evidence ||
        null;

      return res.json({
        incidentId,

        evidence,
      });
    } catch (
      error
    ) {
      console.error(
        "[agent-intelligence-routes] evidence retrieval error:",
        error
      );

      return res
        .status(
          error.status ||
          500
        )
        .json({
          error:
            "Failed to retrieve evidence",

          details:
            error.message,
        });
    }
  }
);


// ============================================================================
// DIAGNOSIS
// ============================================================================

router.get(
  "/:incidentId/diagnosis",
  async (
    req,
    res
  ) => {
    try {
      const incidentId =
        req.params
          .incidentId;

      const run =
        await agentIntelligenceRunRepository
          .findLatestForIncident(
            _resolveScope(
              req,
              incidentId
            )
          );

      if (
        !run
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "No intelligence run found",
          });
      }

      const diagnosisRecord =
        (
          run.agentTrace ||
          []
        )
          .find(
            (
              record
            ) =>
              record.agent ===
              "DiagnosisAgent"
          );

      const diagnosis =
        diagnosisRecord
          ?.result
          ?.diagnosisResult ||
        diagnosisRecord
          ?.result
          ?.diagnosis ||
        null;

      return res.json({
        incidentId,

        diagnosis,
      });
    } catch (
      error
    ) {
      console.error(
        "[agent-intelligence-routes] diagnosis retrieval error:",
        error
      );

      return res
        .status(
          error.status ||
          500
        )
        .json({
          error:
            "Failed to retrieve diagnosis",

          details:
            error.message,
        });
    }
  }
);


// ============================================================================
// AGENT TRACE
// ============================================================================

router.get(
  "/:incidentId/agent-trace",
  async (
    req,
    res
  ) => {
    try {
      const incidentId =
        req.params
          .incidentId;

      const run =
        await agentIntelligenceRunRepository
          .findLatestForIncident(
            _resolveScope(
              req,
              incidentId
            )
          );

      if (
        !run
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "No intelligence run found",
          });
      }

      return res.json({
        incidentId,

        runId:
          run.runId,

        correlationId:
          run.correlationId,

        state:
          run.state,

        manualRequired:
          Boolean(
            run.manualRequired
          ),

        manualReason:
          run.manualReason ||
          null,

        agentTrace:
          _safeTrace(
            run.agentTrace ||
            []
          ),
      });
    } catch (
      error
    ) {
      console.error(
        "[agent-intelligence-routes] agent trace retrieval error:",
        error
      );

      return res
        .status(
          error.status ||
          500
        )
        .json({
          error:
            "Failed to retrieve agent trace",

          details:
            error.message,
        });
    }
  }
);


// ============================================================================
// RETRY
// ============================================================================

router.post(
  "/:incidentId/retry-analysis",
  analyzeIncident
);


// ============================================================================
// HELPERS
// ============================================================================

function _resolveScope(
  req,
  incidentId
) {
  const organizationId =
    req.context
      ?.organizationId;

  const environmentId =
    req.context
      ?.environmentId;

  if (
    !organizationId ||
    !environmentId
  ) {
    throw Object.assign(
      new Error(
        "Canonical organization and environment context are required"
      ),
      {
        code:
          "AGENT_INTELLIGENCE_SCOPE_REQUIRED",

        status:
          400,
      }
    );
  }

  return {
    organizationId:
      String(
        organizationId
      ),

    environmentId:
      String(
        environmentId
      ),

    incidentId:
      String(
        incidentId
      ),
  };
}


function _safeIncidentInput(
  doc
) {
  return {
    id:
      doc._id
        ?.toString() ||
      doc.id ||
      null,

    type:
      doc.incidentType ||
      doc.type ||
      "unknown",

    severity:
      doc.severity ||
      "unknown",

    title:
      doc.title ||
      null,

    description:
      doc.description ||
      null,

    serviceId:
      doc.serviceId ||
      null,

    environment:
      doc.environment ||
      null,

    evidence:
      _stripSensitive(
        doc.evidence ||
        {}
      ),

    signal:
      _stripSensitive(
        doc.signal ||
        {}
      ),

    tags:
      Array.isArray(
        doc.tags
      )
        ? doc.tags
        : [],
  };
}


function _safeTrace(
  trace
) {
  if (
    !Array.isArray(
      trace
    )
  ) {
    return [];
  }

  return trace.map(
    (
      record
    ) => ({
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

      warnings:
        Array.isArray(
          record.warnings
        )
          ? record.warnings
          : [],

      result:
        record.result
          ? _stripSensitive(
              record.result
            )
          : null,

      fallbackUsed:
        Boolean(
          record.fallbackUsed
        ),

      error:
        record.error
          ? _stripSensitiveError(
              record.error
            )
          : null,
    })
  );
}


function _serialiseRun(
  run
) {
  return {
    runId:
      run.runId,

    incidentId:
      run.incidentId,

    correlationId:
      run.correlationId,

    state:
      run.state,

    startedAt:
      run.startedAt,

    completedAt:
      run.completedAt,

    manualRequired:
      Boolean(
        run.manualRequired
      ),

    manualReason:
      run.manualReason ||
      null,

    finalOutcome:
      run.finalOutcome ||
      null,

    explanationTitle:
      run.explanationTitle ||
      null,

    learningCount:
      run.learningCount ||
      0,

    agentCount:
      Array.isArray(
        run.agentTrace
      )
        ? run.agentTrace
            .length
        : 0,
  };
}


const SECRET_KEYS =
  /password|secret|token|api[_-]?key|private[_-]?key|credential|authorization|auth[_-]?header|certificate|cert/i;


function _stripSensitive(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }

  if (
    Array.isArray(
      value
    )
  ) {
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

  const out =
    {};

  for (
    const [
      key,
      nestedValue,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      SECRET_KEYS.test(
        key
      )
    ) {
      out[key] =
        "[REDACTED]";

      continue;
    }

    out[key] =
      _stripSensitive(
        nestedValue
      );
  }

  return out;
}


function _stripSensitiveError(
  error
) {
  if (
    typeof error ===
    "string"
  ) {
    return error;
  }

  if (
    error instanceof
      Error
  ) {
    return {
      name:
        error.name,

      message:
        error.message,
    };
  }

  return _stripSensitive(
    error
  );
}


module.exports =
  router;