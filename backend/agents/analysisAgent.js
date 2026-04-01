const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const { memoryService } = require("../services/learning");
const {
  deriveBaseSeverity,
  getAdaptiveSeverity,
  getConfidenceScore,
} = require("../utils/severityEngine");

function getIssueProfile(logs, metrics) {
  const errorLogs = logs.filter((log) => log.status === "error");
  const dependencySignalCount = errorLogs.filter((log) =>
    /upstream|database|authentication|queue|timeout/i.test(log.message)
  ).length;

  if (metrics.errorRate >= 35 && metrics.averageResponseTime >= 1100) {
    return {
      issue: "Backend service instability from sustained failures",
      issueType: "stability",
      suggestedAction: "Restart service and validate failing dependencies",
    };
  }

  if (metrics.averageResponseTime >= 1200 && metrics.errorRate < 35) {
    return {
      issue: "Performance bottleneck causing latency degradation",
      issueType: "latency",
      suggestedAction: "Retry delayed requests and profile slow endpoints",
    };
  }

  if (errorLogs.length > 0 && dependencySignalCount >= Math.ceil(errorLogs.length * 0.45)) {
    return {
      issue: "Dependency degradation observed in upstream integrations",
      issueType: "dependency",
      suggestedAction: "Retry with backoff and inspect dependency health",
    };
  }

  return {
    issue: "Intermittent backend anomaly",
    issueType: "mixed",
    suggestedAction: "Continue monitoring while collecting more telemetry",
  };
}

function normalizeAnalysisResult(rawResult, issueProfile) {
  const normalizedSeverity = ["low", "medium", "high"].includes(rawResult?.severity)
    ? rawResult.severity
    : deriveBaseSeverity({
        errorRate: Number(rawResult?.errorRate) || 0,
        averageResponseTime: Number(rawResult?.averageResponseTime) || 0,
      });

  const issueType = ["stability", "latency", "dependency", "mixed"].includes(rawResult?.issueType)
    ? rawResult.issueType
    : issueProfile.issueType;

  return {
    issue: String(rawResult?.issue || issueProfile.issue),
    issueType,
    severity: normalizedSeverity,
    reasoning: String(
      rawResult?.reasoning ||
        "Anomaly detected from recent operational metrics and failure signatures."
    ),
    suggestedAction: String(rawResult?.suggestedAction || issueProfile.suggestedAction),
    confidenceScore: Math.max(0, Math.min(100, Number(rawResult?.confidenceScore) || 55)),
  };
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No valid JSON object found in model response.");
  }

  return text.slice(start, end + 1);
}

function buildRuleBasedAnalysis(logs, metrics, issueProfile, occurrenceCount) {
  const baseSeverity = deriveBaseSeverity(metrics);
  const adaptive = getAdaptiveSeverity({
    baseSeverity,
    metrics,
    occurrenceCount,
  });

  let reasoning =
    "Consistent deviations in service health indicators suggest unstable backend behavior and elevated operational risk.";

  if (issueProfile.issueType === "latency") {
    reasoning =
      "Response latency is trending upward across recent requests, indicating a likely processing bottleneck rather than isolated request failures.";
  }

  if (issueProfile.issueType === "dependency") {
    reasoning =
      "Failure signatures are concentrated around dependency-related operations, suggesting degraded upstream reliability or timeout pressure.";
  }

  if (adaptive.note) {
    reasoning = `${reasoning} ${adaptive.note}`;
  }

  return {
    issue: issueProfile.issue,
    issueType: issueProfile.issueType,
    severity: adaptive.severity,
    reasoning,
    suggestedAction: issueProfile.suggestedAction,
    confidenceScore: getConfidenceScore({
      metrics,
      occurrenceCount,
      baseConfidence: 60,
    }),
  };
}

function applyAdaptiveOverlay(baseAnalysis, metrics, occurrenceCount) {
  const adaptive = getAdaptiveSeverity({
    baseSeverity: baseAnalysis.severity,
    metrics,
    occurrenceCount,
  });

  const confidenceScore = getConfidenceScore({
    metrics,
    occurrenceCount,
    baseConfidence: baseAnalysis.confidenceScore,
  });

  return {
    ...baseAnalysis,
    severity: adaptive.severity,
    reasoning: adaptive.note ? `${baseAnalysis.reasoning} ${adaptive.note}` : baseAnalysis.reasoning,
    confidenceScore,
  };
}

async function callOpenAIAnalysis(logs, metrics, issueProfile, occurrenceCount) {
  const compactLogContext = logs.slice(0, 10).map((log) => ({
    status: log.status,
    responseTime: log.responseTime,
    message: log.message,
    timestamp: log.timestamp,
  }));

  const prompt = {
    metrics,
    issueProfile,
    occurrenceCount,
    recentLogs: compactLogContext,
    responseFormat: {
      issue: "string",
      issueType: "stability | latency | dependency | mixed",
      severity: "low | medium | high",
      reasoning: "string",
      suggestedAction: "string",
      confidenceScore: "0-100",
    },
  };

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an autonomous incident analysis agent. Return JSON only with keys: issue, issueType, severity, reasoning, suggestedAction, confidenceScore.",
        },
        {
          role: "user",
          content: JSON.stringify(prompt),
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${details}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "{}";

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch {
    try {
      parsed = JSON.parse(extractJsonObject(content));
    } catch (parseError) {
      throw new Error(`Could not parse model response as JSON: ${parseError.message}`);
    }
  }

  return normalizeAnalysisResult(parsed, issueProfile);
}

/**
 * REFACTORED: Analyze incident with deterministic fallback
 * 
 * CRITICAL CHANGE: OpenAI is now OPTIONAL via feature flag
 * - Default behavior: Rule-based analysis (deterministic, fast, safe)
 * - Opt-in: OpenAI for enrichment (non-deterministic, not required)
 */
async function analyzeIssue(logs, metrics, tenantId = "default") {
  const featureFlags = require("../config/featureFlags");
  const issueProfile = getIssueProfile(logs, metrics);
  
  // Get occurrence count from memory service
  const memory = await memoryService.find(tenantId, issueProfile.issueType);
  const previousOccurrenceCount = memory?.stats?.totalOccurrences || 0;
  const occurrenceCount = previousOccurrenceCount + 1;

  // CRITICAL FIX: Use rule-based analysis as DEFAULT
  const baseAnalysis = buildRuleBasedAnalysis(logs, metrics, issueProfile, occurrenceCount);
  
  // OPTIONAL: Enrich with OpenAI only if explicitly enabled
  let enhancedAnalysis = baseAnalysis;
  let openaiUsed = false;

  if (featureFlags.isEnabled('ENABLE_OPENAI_ANALYSIS')) {
    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        "[analysis-agent] OpenAI feature enabled but OPENAI_API_KEY not set. Using rule-based only."
      );
    } else {
      try {
        const openAiResult = await callOpenAIAnalysis(logs, metrics, issueProfile, occurrenceCount);
        // Use OpenAI for confidence boost ONLY IF result aligns with rule-based (within 15%)
        const confidenceDelta = Math.abs(openAiResult.confidenceScore - baseAnalysis.confidenceScore);
        if (confidenceDelta <= 15) {
          enhancedAnalysis = applyAdaptiveOverlay(openAiResult, metrics, occurrenceCount);
          openaiUsed = true;
        } else {
          console.warn(
            `[analysis-agent] OpenAI result diverges too much from rules (delta=${confidenceDelta}%). Trusting rule-based.`
          );
        }
      } catch (error) {
        console.warn(
          "[analysis-agent] OpenAI analysis failed. Continuing with rule-based:",
          error.message
        );
        // Fallback to rule-based (already set above)
      }
    }
  }

  return {
    ...enhancedAnalysis,
    occurrenceCount,
    previousOccurrenceCount,
    _analysisMethod: openaiUsed ? 'rule-based+openai' : 'rule-based',
    _deterministic: !openaiUsed, // Flag for audit: is this reproducible?
  };
}

// Queue service integration
const { getQueueService } = require("../services/infrastructure/queueService");
const { auditService, getStructuredLoggingService, getPrometheusMetricsService } = require("../services/observability");

let isConsumingAnalysis = false;

async function processAnalysisEvent(message) {
  try {
    const { eventId, correlationId, tenantId, payload } = message;
    
    console.log(`[analysis-agent] Processing incident ${eventId}`);

    // Perform analysis on logs and metrics
    const startTime = Date.now();
    const analysisResult = await analyzeIssue(payload.logs, payload.metrics, tenantId);
    const analysisTime = Date.now() - startTime;

    // Add affectedServices from original signal/payload for cascade detection
    if (payload.affectedServices && payload.affectedServices.length > 0) {
      analysisResult.affectedServices = payload.affectedServices;
    }

    // Record structured log for analysis
    try {
      const loggingService = getStructuredLoggingService();
      loggingService.log('info', 'incident_analyzed', {
        eventId,
        correlationId,
        tenantId,
        severity: analysisResult.severity,
        issueType: analysisResult.issueType,
        durationMs: analysisTime,
        context: {
          issue: analysisResult.issue,
          confidence: analysisResult.confidenceScore
        }
      });
    } catch (logError) {
      console.warn('[analysis-agent] Structured logging failed:', logError.message);
    }

    // Record Prometheus metrics for analysis
    try {
      const prometheusMetrics = getPrometheusMetricsService();
      prometheusMetrics.recordPerformance('analysis-agent', 'analyze_issue', analysisTime, { tenantId });
    } catch (metricsError) {
      console.warn('[analysis-agent] Prometheus metrics recording failed:', metricsError.message);
    }

    // Record audit event for analysis
    await AuditService.recordEvent(
      tenantId,
      "incident.analyzed",
      {
        eventId,
        correlationId,
        analysis: analysisResult,
        originalIncidentId: payload.incidentId,
      },
      { correlationId }
    );

    // Publish analysis result to queue
    const queue = await getQueueService();
    await queue.publishEvent(
      queue.topics.INCIDENT_ANALYZED,
      {
        eventId: `analyzed-${eventId}`,
        correlationId,
        tenantId,
        status: "analyzed",
        analysis: analysisResult,
        originalIncidentId: payload.incidentId,
        processedAt: new Date().toISOString(),
      },
      { tenantId, correlationId }
    );

    console.log(`[analysis-agent] ✓ Incident ${eventId} analyzed and published`);
    message.ack();
  } catch (error) {
    console.error("[analysis-agent] Error processing analysis event:", error.message);
    message.nack(true); // Requeue on error
  }
}

async function startAnalysisAgent() {
  if (isConsumingAnalysis) {
    console.log("[analysis-agent] Already running");
    return;
  }

  try {
    const queue = await getQueueService();
    isConsumingAnalysis = true;

    console.log("[analysis-agent] Starting consumption of incident.detected events (parallel mode)...");
    
    // CRITICAL FIX #1: Enable parallel processing instead of serial
    // Process up to 10 signals concurrently instead of one at a time
    // This was causing the 98.3% rejection rate in Scenario 4
    const parallelism = parseInt(process.env.ANALYSIS_AGENT_PARALLELISM || '10');
    
    console.log(`[analysis-agent] Parallelism level: ${parallelism} concurrent signals`);
    
    await queue.consumeEvents(
      queue.topics.INCIDENT_DETECTED,
      "durable-analysis-agent",
      processAnalysisEvent,
      { prefetch: parallelism } // Set RabbitMQ prefetch to enable parallel consumption
    );
  } catch (error) {
    console.error("[analysis-agent] Failed to start:", error.message);
    isConsumingAnalysis = false;
  }
}

async function stopAnalysisAgent() {
  isConsumingAnalysis = false;
  console.log("[analysis-agent] Stopped");
}

module.exports = {
  analyzeIssue,
  startAnalysisAgent,
  stopAnalysisAgent,
};
