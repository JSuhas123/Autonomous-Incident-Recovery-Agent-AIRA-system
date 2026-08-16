"use strict";

/**
 * ============================================================================
 * PHASE 11.12 — CANONICAL AIRA METRICS SERVICE
 * ============================================================================
 *
 * This is the ONLY service that owns Prometheus metric definitions.
 *
 * Other observability services must delegate here instead of registering
 * duplicate metrics in the default prom-client registry.
 */

const prom =
  require(
    "prom-client"
  );


function finiteNumber(
  value,
  fallback =
    0
) {
  const parsed =
    Number(
      value
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : fallback;
}


function safeLabel(
  value,
  fallback =
    "unknown",
  maxLength =
    100
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return fallback;
  }

  return String(
    value
  )
    .slice(
      0,
      maxLength
    );
}


function getOrCreate(
  MetricType,
  configuration
) {
  const existing =
    prom.register
      .getSingleMetric(
        configuration.name
      );

  if (
    existing
  ) {
    return existing;
  }

  return new MetricType(
    configuration
  );
}


class MetricsService {
  constructor() {
    this.defaultMetricsStarted =
      false;

    this.initialize();
  }


  initialize() {
    if (
      !this.defaultMetricsStarted
    ) {
      try {
        prom
          .collectDefaultMetrics({
            prefix:
              "aira_",
          });

        this.defaultMetricsStarted =
          true;
      } catch {
        /*
         * collectDefaultMetrics may already have been registered
         * in a test/hot-reload environment.
         */
      }
    }


    // ========================================================================
    // EXISTING DECISION METRICS
    // ========================================================================

    this.decisionLatency =
      getOrCreate(
        prom.Histogram,
        {
          name:
            "decision_latency_ms",

          help:
            "Decision processing latency in milliseconds",

          labelNames: [
            "tenantId",
            "severity",
            "status",
          ],

          buckets: [
            50,
            100,
            250,
            500,
            1000,
            2500,
            5000,
            10000,
          ],
        }
      );


    this.queueDepth =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "queue_depth_total",

          help:
            "Total messages in queue",

          labelNames: [
            "tenantId",
            "topic",
          ],
        }
      );


    this.dlqSize =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "dlq_size_total",

          help:
            "Messages in dead letter queue",

          labelNames: [
            "tenantId",
          ],
        }
      );


    this.actionExecutions =
      getOrCreate(
        prom.Counter,
        {
          name:
            "action_executions_total",

          help:
            "Total action executions",

          labelNames: [
            "tenantId",
            "actionType",
            "status",
          ],
        }
      );


    this.actionLatency =
      getOrCreate(
        prom.Histogram,
        {
          name:
            "action_latency_ms",

          help:
            "Action execution latency in milliseconds",

          labelNames: [
            "tenantId",
            "actionType",
            "status",
          ],

          buckets: [
            100,
            500,
            1000,
            2500,
            5000,
            10000,
            30000,
          ],
        }
      );


    this.policyEvaluations =
      getOrCreate(
        prom.Counter,
        {
          name:
            "policy_evaluations_total",

          help:
            "Total policy evaluations",

          labelNames: [
            "tenantId",
            "verdict",
          ],
        }
      );


    this.policyLatency =
      getOrCreate(
        prom.Histogram,
        {
          name:
            "policy_latency_ms",

          help:
            "Policy evaluation latency in milliseconds",

          labelNames: [
            "tenantId",
          ],

          buckets: [
            10,
            25,
            50,
            100,
            250,
            500,
          ],
        }
      );


    this.idempotencyHits =
      getOrCreate(
        prom.Counter,
        {
          name:
            "idempotency_hits_total",

          help:
            "Idempotency duplicate-prevention hits",

          labelNames: [
            "tenantId",
          ],
        }
      );


    this.circuitBreakerState =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "circuit_breaker_state",

          help:
            "Circuit state: 0=CLOSED, 1=OPEN, 2=HALF_OPEN",

          labelNames: [
            "tenantId",
            "service",
          ],
        }
      );


    this.memoryPatterns =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "memory_patterns_count",

          help:
            "Incident memory patterns",

          labelNames: [
            "tenantId",
          ],
        }
      );


    this.decisionTraces =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "decision_traces_count",

          help:
            "Decision traces stored",

          labelNames: [
            "tenantId",
          ],
        }
      );


    this.errors =
      getOrCreate(
        prom.Counter,
        {
          name:
            "errors_total",

          help:
            "Total errors",

          labelNames: [
            "tenantId",
            "component",
            "errorType",
          ],
        }
      );


    this.retries =
      getOrCreate(
        prom.Counter,
        {
          name:
            "retries_total",

          help:
            "Retry attempts",

          labelNames: [
            "tenantId",
            "status",
          ],
        }
      );


    this.lockAcquisitions =
      getOrCreate(
        prom.Histogram,
        {
          name:
            "lock_acquisition_ms",

          help:
            "Distributed lock acquisition latency",

          labelNames: [
            "lockKey",
          ],

          buckets: [
            1,
            5,
            10,
            25,
            50,
            100,
            250,
            500,
            1000,
          ],
        }
      );


    this.tenantIsolationViolations =
      getOrCreate(
        prom.Counter,
        {
          name:
            "tenant_isolation_violations_total",

          help:
            "Tenant isolation violations",

          labelNames: [
            "type",
          ],
        }
      );


    // ========================================================================
    // PHASE 11.12 — AIRA SELF OBSERVABILITY
    // ========================================================================

    this.applicationLifecycleState =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "aira_application_lifecycle_state",

          help:
            "AIRA lifecycle state as bounded numeric value",
        }
      );


    this.applicationReady =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "aira_application_ready",

          help:
            "Whether AIRA is operationally ready",
        }
      );


    this.startupRecoveryRuns =
      getOrCreate(
        prom.Counter,
        {
          name:
            "aira_startup_recovery_runs_total",

          help:
            "Startup recovery runs",

          labelNames: [
            "status",
          ],
        }
      );


    this.startupRecoveryRecords =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "aira_startup_recovery_records",

          help:
            "Records handled by last startup recovery",

          labelNames: [
            "result",
          ],
        }
      );


    this.dependencyState =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "aira_dependency_state",

          help:
            "Dependency state: 0=healthy/closed, 1=degraded/half-open, 2=unavailable/open",

          labelNames: [
            "dependency",
          ],
        }
      );


    this.queueSaturated =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "aira_queue_saturated",

          help:
            "Whether publisher load protection currently reports saturation",
        }
      );


    this.queueInFlightPublishes =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "aira_queue_inflight_publishes",

          help:
            "Current queue publisher in-flight operations",
        }
      );


    this.queueBackpressureEvents =
      getOrCreate(
        prom.Counter,
        {
          name:
            "aira_queue_backpressure_events_total",

          help:
            "Queue publisher backpressure events",
        }
      );


    this.retentionRuns =
      getOrCreate(
        prom.Counter,
        {
          name:
            "aira_retention_runs_total",

          help:
            "Retention cycles",

          labelNames: [
            "status",
            "dryRun",
          ],
        }
      );


    this.retentionDuration =
      getOrCreate(
        prom.Histogram,
        {
          name:
            "aira_retention_duration_ms",

          help:
            "Retention cycle duration",

          buckets: [
            10,
            50,
            100,
            250,
            500,
            1000,
            2500,
            5000,
            10000,
            30000,
            60000,
          ],
        }
      );


    this.retentionRecords =
      getOrCreate(
        prom.Counter,
        {
          name:
            "aira_retention_records_total",

          help:
            "Retention records archived/deleted",

          labelNames: [
            "operation",
          ],
        }
      );


    this.workerState =
      getOrCreate(
        prom.Gauge,
        {
          name:
            "aira_worker_state",

          help:
            "Worker state: 0=stopped, 1=idle, 2=active, 3=degraded",

          labelNames: [
            "worker",
          ],
        }
      );


    this.selfErrors =
      getOrCreate(
        prom.Counter,
        {
          name:
            "aira_self_errors_total",

          help:
            "Internal AIRA platform errors",

          labelNames: [
            "component",
            "errorType",
          ],
        }
      );


    this.shutdownRuns =
      getOrCreate(
        prom.Counter,
        {
          name:
            "aira_shutdown_total",

          help:
            "AIRA shutdown attempts",

          labelNames: [
            "status",
          ],
        }
      );


    this.shutdownDuration =
      getOrCreate(
        prom.Histogram,
        {
          name:
            "aira_shutdown_duration_ms",

          help:
            "Graceful shutdown duration",

          buckets: [
            10,
            50,
            100,
            250,
            500,
            1000,
            2500,
            5000,
            10000,
            30000,
          ],
        }
      );
    
      // ========================================================================
// PHASE 11.13 — SLO / RELIABILITY METRICS
// ========================================================================

this.sloAvailability =
  getOrCreate(
    prom.Gauge,
    {
      name:
        "aira_slo_availability_ratio",

      help:
        "Observed SLO success/availability ratio",

      labelNames: [
        "objective",
      ],
    }
  );


this.sloTarget =
  getOrCreate(
    prom.Gauge,
    {
      name:
        "aira_slo_target_ratio",

      help:
        "Configured SLO target",

      labelNames: [
        "objective",
      ],
    }
  );


this.sloLatencyCompliance =
  getOrCreate(
    prom.Gauge,
    {
      name:
        "aira_slo_latency_compliance_ratio",

      help:
        "Ratio of successful samples meeting latency objective",

      labelNames: [
        "objective",
      ],
    }
  );


this.sloErrorBudgetRemaining =
  getOrCreate(
    prom.Gauge,
    {
      name:
        "aira_slo_error_budget_remaining_ratio",

      help:
        "Remaining SLO error budget ratio",

      labelNames: [
        "objective",
      ],
    }
  );


this.sloBurnRate =
  getOrCreate(
    prom.Gauge,
    {
      name:
        "aira_slo_burn_rate",

      help:
        "Observed error-rate burn relative to allowed SLO error rate",

      labelNames: [
        "objective",
      ],
    }
  );


this.sloSamples =
  getOrCreate(
    prom.Gauge,
    {
      name:
        "aira_slo_samples",

      help:
        "Current rolling SLO sample count",

      labelNames: [
        "objective",
      ],
    }
  );


this.sloFailures =
  getOrCreate(
    prom.Gauge,
    {
      name:
        "aira_slo_failures",

      help:
        "Current rolling SLO failure count",

      labelNames: [
        "objective",
      ],
    }
  );


this.sloState =
  getOrCreate(
    prom.Gauge,
    {
      name:
        "aira_slo_state",

      help:
        "SLO state: 0=insufficient, 1=healthy, 2=at-risk, 3=burning, 4=exhausted",

      labelNames: [
        "objective",
      ],
    }
  );


this.reliabilityOverallState =
  getOrCreate(
    prom.Gauge,
    {
      name:
        "aira_reliability_overall_state",

      help:
        "Overall reliability state: 0=insufficient, 1=healthy, 2=at-risk, 3=burning, 4=exhausted",
    }
  );
    }


  // ========================================================================
  // EXISTING API
  // ========================================================================

  recordDecision(
    tenantId,
    severity,
    status,
    latencyMs
  ) {
    this.decisionLatency
      .observe(
        {
          tenantId:
            safeLabel(
              tenantId,
              "unknown"
            ),

          severity:
            safeLabel(
              severity,
              "UNKNOWN"
            )
              .toUpperCase(),

          status:
            safeLabel(
              status,
              "unknown"
            )
              .toLowerCase(),
        },
        Math.max(
          0,
          finiteNumber(
            latencyMs
          )
        )
      );
  }


  recordDecisionLatency(
    tenantId,
    severity,
    status,
    latencyMs
  ) {
    return this
      .recordDecision(
        tenantId,
        severity,
        status,
        latencyMs
      );
  }


  recordAction(
    tenantId,
    actionType,
    status,
    latencyMs =
      0
  ) {
    const labels = {
      tenantId:
        safeLabel(
          tenantId
        ),

      actionType:
        safeLabel(
          actionType
        ),

      status:
        safeLabel(
          status
        ),
    };


    this.actionExecutions
      .inc(
        labels
      );


    this.actionLatency
      .observe(
        labels,
        Math.max(
          0,
          finiteNumber(
            latencyMs
          )
        )
      );
  }


  recordActionExecution(
    tenantId,
    actionType,
    status,
    latencyMs =
      0
  ) {
    return this
      .recordAction(
        tenantId,
        actionType,
        status,
        latencyMs
      );
  }


  updateQueueDepth(
    tenantId,
    topic,
    depth
  ) {
    this.queueDepth
      .set(
        {
          tenantId:
            safeLabel(
              tenantId
            ),

          topic:
            safeLabel(
              topic
            ),
        },
        Math.max(
          0,
          finiteNumber(
            depth
          )
        )
      );
  }


  updateDLQSize(
    tenantId,
    size
  ) {
    this.dlqSize
      .set(
        {
          tenantId:
            safeLabel(
              tenantId
            ),
        },
        Math.max(
          0,
          finiteNumber(
            size
          )
        )
      );
  }


  recordPolicyEvaluation(
    tenantId,
    verdict,
    latencyMs =
      0
  ) {
    const normalizedTenant =
      safeLabel(
        tenantId
      );


    this.policyEvaluations
      .inc({
        tenantId:
          normalizedTenant,

        verdict:
          safeLabel(
            verdict
          ),
      });


    this.policyLatency
      .observe(
        {
          tenantId:
            normalizedTenant,
        },
        Math.max(
          0,
          finiteNumber(
            latencyMs
          )
        )
      );
  }


  recordIdempotencyHit(
    tenantId
  ) {
    this.idempotencyHits
      .inc({
        tenantId:
          safeLabel(
            tenantId
          ),
      });
  }


  updateCircuitBreakerState(
    tenantId,
    service,
    state
  ) {
    const stateMap = {
      CLOSED:
        0,

      OPEN:
        1,

      HALF_OPEN:
        2,
    };


    this.circuitBreakerState
      .set(
        {
          tenantId:
            safeLabel(
              tenantId
            ),

          service:
            safeLabel(
              service
            ),
        },
        stateMap[
          String(
            state ||
            "CLOSED"
          )
            .toUpperCase()
        ] ??
        0
      );
  }


  recordCircuitBreakerState(
    tenantId,
    service,
    state
  ) {
    this.updateCircuitBreakerState(
      tenantId,
      service,
      state
    );
  }


  updateMemoryMetrics(
    tenantId,
    patternCount,
    traceCount
  ) {
    const label = {
      tenantId:
        safeLabel(
          tenantId
        ),
    };


    this.memoryPatterns
      .set(
        label,
        Math.max(
          0,
          finiteNumber(
            patternCount
          )
        )
      );


    this.decisionTraces
      .set(
        label,
        Math.max(
          0,
          finiteNumber(
            traceCount
          )
        )
      );
  }


  recordError(
    tenantId,
    component,
    errorType
  ) {
    this.errors
      .inc({
        tenantId:
          safeLabel(
            tenantId
          ),

        component:
          safeLabel(
            component
          ),

        errorType:
          safeLabel(
            errorType
          ),
      });
  }


  recordRetry(
    tenantId,
    status
  ) {
    this.retries
      .inc({
        tenantId:
          safeLabel(
            tenantId
          ),

        status:
          safeLabel(
            status
          ),
      });
  }


  recordLockAcquisition(
    lockKey,
    latencyMs =
      0
  ) {
    /*
     * Lock keys can contain incident IDs/resource IDs.
     *
     * Avoid unbounded cardinality by keeping only the first
     * logical namespace.
     */
    const logicalKey =
      safeLabel(
        String(
          lockKey ||
          "unknown"
        )
          .split(
            ":"
          )[0],
        "unknown",
        50
      );


    this.lockAcquisitions
      .observe(
        {
          lockKey:
            logicalKey,
        },
        Math.max(
          0,
          finiteNumber(
            latencyMs
          )
        )
      );
  }


  recordIsolationViolation(
    type
  ) {
    this.tenantIsolationViolations
      .inc({
        type:
          safeLabel(
            type
          ),
      });
  }


  // ========================================================================
  // PHASE 11.12 SELF METRICS
  // ========================================================================

  updateApplicationLifecycle(
    state,
    ready
  ) {
    const states = {
      STARTING:
        0,

      RECOVERING:
        1,

      READY:
        2,

      DRAINING:
        3,

      SHUTTING_DOWN:
        4,

      STOPPED:
        5,

      FAILED:
        6,
    };


    this.applicationLifecycleState
      .set(
        states[
          String(
            state ||
            "STARTING"
          )
            .toUpperCase()
        ] ??
        -1
      );


    this.applicationReady
      .set(
        ready
          ? 1
          : 0
      );
  }


  recordStartupRecovery({
    status,
    discovered =
      0,
    recovered =
      0,
    failed =
      0,
  }) {
    this.startupRecoveryRuns
      .inc({
        status:
          safeLabel(
            status
          ),
      });


    this.startupRecoveryRecords
      .set(
        {
          result:
            "discovered",
        },
        Math.max(
          0,
          finiteNumber(
            discovered
          )
        )
      );


    this.startupRecoveryRecords
      .set(
        {
          result:
            "recovered",
        },
        Math.max(
          0,
          finiteNumber(
            recovered
          )
        )
      );


    this.startupRecoveryRecords
      .set(
        {
          result:
            "failed",
        },
        Math.max(
          0,
          finiteNumber(
            failed
          )
        )
      );
  }


  updateDependencyState(
    dependency,
    state
  ) {
    const map = {
      CLOSED:
        0,

      HEALTHY:
        0,

      HALF_OPEN:
        1,

      DEGRADED:
        1,

      OPEN:
        2,

      UNAVAILABLE:
        2,
    };


    this.dependencyState
      .set(
        {
          dependency:
            safeLabel(
              dependency,
              "unknown",
              50
            ),
        },
        map[
          String(
            state ||
            "UNAVAILABLE"
          )
            .toUpperCase()
        ] ??
        2
      );
  }


  updateQueueLoad({
    saturated =
      false,
    inFlightPublishes =
      0,
  } = {}) {
    this.queueSaturated
      .set(
        saturated
          ? 1
          : 0
      );


    this.queueInFlightPublishes
      .set(
        Math.max(
          0,
          finiteNumber(
            inFlightPublishes
          )
        )
      );
  }


  recordQueueBackpressure(
    count =
      1
  ) {
    this.queueBackpressureEvents
      .inc(
        Math.max(
          1,
          finiteNumber(
            count,
            1
          )
        )
      );
  }


  recordRetentionRun({
    status,
    dryRun =
      false,
    durationMs =
      0,
    archived =
      0,
    deleted =
      0,
  }) {
    this.retentionRuns
      .inc({
        status:
          safeLabel(
            status
          ),

        dryRun:
          dryRun
            ? "true"
            : "false",
      });


    this.retentionDuration
      .observe(
        Math.max(
          0,
          finiteNumber(
            durationMs
          )
        )
      );


    if (
      archived >
      0
    ) {
      this.retentionRecords
        .inc(
          {
            operation:
              "archived",
          },
          finiteNumber(
            archived
          )
        );
    }


    if (
      deleted >
      0
    ) {
      this.retentionRecords
        .inc(
          {
            operation:
              "deleted",
          },
          finiteNumber(
            deleted
          )
        );
    }
  }


  updateWorkerState(
    worker,
    state
  ) {
    const map = {
      STOPPED:
        0,

      IDLE:
        1,

      RUNNING:
        2,

      ACTIVE:
        2,

      DEGRADED:
        3,

      FAILED:
        3,
    };


    this.workerState
      .set(
        {
          worker:
            safeLabel(
              worker,
              "unknown",
              50
            ),
        },
        map[
          String(
            state ||
            "STOPPED"
          )
            .toUpperCase()
        ] ??
        3
      );
  }


  recordSelfError(
    component,
    errorType
  ) {
    this.selfErrors
      .inc({
        component:
          safeLabel(
            component,
            "unknown",
            50
          ),

        errorType:
          safeLabel(
            errorType,
            "unknown",
            80
          ),
      });
  }


  recordShutdown({
    status,
    durationMs =
      0,
  }) {
    this.shutdownRuns
      .inc({
        status:
          safeLabel(
            status
          ),
      });


    this.shutdownDuration
      .observe(
        Math.max(
          0,
          finiteNumber(
            durationMs
          )
        )
      );
  }

// ========================================================================
// PHASE 11.13 — SLO SNAPSHOT
// ========================================================================

updateSloReliability(
  reliability
) {
  if (
    !reliability ||
    typeof reliability !==
      "object"
  ) {
    return {
      updated:
        false,

      executionAuthorized:
        false,
    };
  }


  const stateMap = {
    INSUFFICIENT_DATA:
      0,

    HEALTHY:
      1,

    AT_RISK:
      2,

    BURNING:
      3,

    EXHAUSTED:
      4,
  };


  const objectives =
    reliability.objectives ||
    {};


  for (
    const [
      objectiveName,
      result,
    ]
    of Object.entries(
      objectives
    )
  ) {
    const labels = {
      objective:
        safeLabel(
          objectiveName,
          "unknown",
          50
        ),
    };


    this.sloAvailability
      .set(
        labels,
        finiteNumber(
          result
            .availability,
          0
        )
      );


    this.sloTarget
      .set(
        labels,
        finiteNumber(
          result
            .target,
          0
        )
      );


    this.sloLatencyCompliance
      .set(
        labels,
        finiteNumber(
          result
            .latencyCompliance,
          0
        )
      );


    this.sloErrorBudgetRemaining
      .set(
        labels,
        finiteNumber(
          result
            .budgetRemainingRatio,
          0
        )
      );


    this.sloBurnRate
      .set(
        labels,
        finiteNumber(
          result
            .burnRate,
          0
        )
      );


    this.sloSamples
      .set(
        labels,
        Math.max(
          0,
          finiteNumber(
            result
              .sampleCount,
            0
          )
        )
      );


    this.sloFailures
      .set(
        labels,
        Math.max(
          0,
          finiteNumber(
            result
              .failures,
            0
          )
        )
      );


    this.sloState
      .set(
        labels,
        stateMap[
          result.state
        ] ??
        0
      );
  }


  this.reliabilityOverallState
    .set(
      stateMap[
        reliability.state
      ] ??
      0
    );


  return {
    updated:
      true,

    executionAuthorized:
      false,
  };
}

  // ========================================================================
  // EXPORT
  // ========================================================================

  async getMetrics() {
  /*
   * Reliability metrics are updated by the SLO bridge before
   * scrape. This method remains a pure Prometheus export.
   */
  return prom
    .register
    .metrics();
}


  async getMetricsJSON() {
    return prom
      .register
      .getMetricsAsJSON();
  }


  getContentType() {
    return prom
      .register
      .contentType;
  }


  reset() {
    prom
      .register
      .resetMetrics();
  }


  getStatus() {
    return {
      registryMetricCount:
        prom
          .register
          .getMetricsAsArray()
          .length,

      contentType:
        prom
          .register
          .contentType,

      canonical:
        true,

      executionAuthorized:
        false,
    };
  }
}


module.exports =
  new MetricsService();

module.exports
  .MetricsService =
  MetricsService;