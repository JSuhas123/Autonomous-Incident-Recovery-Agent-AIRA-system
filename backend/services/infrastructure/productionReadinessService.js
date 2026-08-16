"use strict";

/**
 * ============================================================================
 * PHASE 11.16 — PRODUCTION READINESS / OPERATIONAL SAFETY SERVICE
 * ============================================================================
 *
 * PURPOSE
 *
 * Aggregate the safety and operational contracts introduced across Phase 11
 * into ONE read-only production-readiness decision.
 *
 * This service answers:
 *
 *   "Is this AIRA instance fit to serve production traffic?"
 *
 * It DOES NOT answer:
 *
 *   "May this recovery action execute?"
 *
 * Readiness NEVER grants execution authority.
 *
 * ============================================================================
 */

const READINESS_STATE =
  Object.freeze({
    READY:
      "READY",

    DEGRADED:
      "DEGRADED",

    NOT_READY:
      "NOT_READY",
  });


const CHECK_STATE =
  Object.freeze({
    PASS:
      "PASS",

    WARN:
      "WARN",

    FAIL:
      "FAIL",

    UNKNOWN:
      "UNKNOWN",
  });


const SEVERITY =
  Object.freeze({
    INFO:
      "INFO",

    WARNING:
      "WARNING",

    CRITICAL:
      "CRITICAL",
  });


function safeBoolean(
  value
) {
  return value ===
    true;
}


function safeNumber(
  value,
  fallback =
    0
) {
  const number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )
    ? number
    : fallback;
}


function createCheck({
  name,
  state,
  severity =
    SEVERITY.INFO,
  message =
    null,
  details =
    null,
}) {
  return {
    name,

    state,

    severity,

    message,

    details,

    executionAuthorized:
      false,
  };
}


function normalizeLifecycleState(
  lifecycle
) {
  if (
    !lifecycle
  ) {
    return null;
  }


  return String(
    lifecycle.state ||
    lifecycle.lifecycleState ||
    ""
  )
    .trim()
    .toUpperCase();
}


function normalizeReliabilityState(
  reliability
) {
  if (
    !reliability
  ) {
    return null;
  }


  return String(
    reliability.state ||
    ""
  )
    .trim()
    .toUpperCase();
}


class ProductionReadinessService {
  constructor(
    options =
      {}
  ) {
    this.now =
      typeof options.now ===
      "function"
        ? options.now
        : () =>
            Date.now();


    this.lastEvaluationAt =
      null;

    this.lastState =
      null;

    this.evaluationCount =
      0;

    this.lastFailureReasons =
      [];
  }


  // ==========================================================================
  // COMPLETE EVALUATION
  // ==========================================================================

  evaluate(
    input =
      {}
  ) {
    const checks =
      [];


    // ========================================================================
    // 1. STARTUP CONFIGURATION
    // ========================================================================

    checks.push(
      this.evaluateConfiguration(
        input.configuration
      )
    );


    // ========================================================================
    // 2. APPLICATION LIFECYCLE
    // ========================================================================

    checks.push(
      this.evaluateLifecycle(
        input.lifecycle
      )
    );


    // ========================================================================
    // 3. STARTUP REPLAY / RECOVERY
    // ========================================================================

    checks.push(
      this.evaluateStartupRecovery(
        input.replayRecovery
      )
    );


    // ========================================================================
    // 4. SYSTEM HEALTH / SAFE MODE
    // ========================================================================

    checks.push(
      this.evaluateSystemHealth(
        input.systemHealth
      )
    );


    // ========================================================================
    // 5. DEPENDENCY ISOLATION
    // ========================================================================

    checks.push(
      this.evaluateDependencies(
        input.dependencyIsolation
      )
    );


    // ========================================================================
    // 6. OUTBOX
    // ========================================================================

    checks.push(
      this.evaluateOutbox(
        input.outbox
      )
    );


    // ========================================================================
    // 7. RETENTION
    // ========================================================================

    checks.push(
      this.evaluateRetention(
        input.retention
      )
    );


    // ========================================================================
    // 8. CHAOS
    // ========================================================================

    checks.push(
      this.evaluateChaos(
        input.chaos
      )
    );


    // ========================================================================
    // 9. KILL SWITCH
    // ========================================================================

    checks.push(
      this.evaluateKillSwitches(
        input.killSwitches
      )
    );


    // ========================================================================
    // 10. FEATURE FLAGS
    // ========================================================================

    checks.push(
      this.evaluateFeatureFlags(
        input.featureFlags
      )
    );


    // ========================================================================
    // 11. RELIABILITY / SLO
    // ========================================================================

    checks.push(
      this.evaluateReliability(
        input.reliability
      )
    );


    // ========================================================================
    // FINAL CLASSIFICATION
    // ========================================================================

    const failedChecks =
      checks
        .filter(
          (
            check
          ) =>
            check.state ===
            CHECK_STATE.FAIL
        );


    const warningChecks =
      checks
        .filter(
          (
            check
          ) =>
            check.state ===
              CHECK_STATE.WARN ||
            check.state ===
              CHECK_STATE.UNKNOWN
        );


    let state =
      READINESS_STATE
        .READY;


    if (
      failedChecks.length >
      0
    ) {
      state =
        READINESS_STATE
          .NOT_READY;
    } else if (
      warningChecks.length >
      0
    ) {
      state =
        READINESS_STATE
          .DEGRADED;
    }


    const evaluatedAt =
      new Date(
        this.now()
      );


    this.lastEvaluationAt =
      evaluatedAt;

    this.lastState =
      state;

    this.evaluationCount +=
      1;

    this.lastFailureReasons =
      failedChecks
        .map(
          (
            check
          ) =>
            check.message ||
            check.name
        );


    return {
      state,

      productionReady:
        state ===
        READINESS_STATE
          .READY,

      degraded:
        state ===
        READINESS_STATE
          .DEGRADED,

      readyToServeTraffic:
        state !==
        READINESS_STATE
          .NOT_READY,

      summary: {
        total:
          checks.length,

        passed:
          checks.filter(
            (
              check
            ) =>
              check.state ===
              CHECK_STATE.PASS
          ).length,

        warnings:
          warningChecks.length,

        failed:
          failedChecks.length,
      },

      checks,

      blockers:
        failedChecks.map(
          (
            check
          ) => ({
            name:
              check.name,

            message:
              check.message,

            severity:
              check.severity,
          })
        ),

      warnings:
        warningChecks.map(
          (
            check
          ) => ({
            name:
              check.name,

            message:
              check.message,

            severity:
              check.severity,
          })
        ),

      evaluatedAt:
        evaluatedAt
          .toISOString(),

      /*
       * CRITICAL INVARIANT
       *
       * Readiness is observational only.
       */
      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  evaluateConfiguration(
    configuration
  ) {
    if (
      !configuration
    ) {
      return createCheck({
        name:
          "startup-configuration",

        state:
          CHECK_STATE.UNKNOWN,

        severity:
          SEVERITY.WARNING,

        message:
          "Startup configuration validation status is unavailable.",
      });
    }


    if (
      configuration.valid ===
      false
    ) {
      return createCheck({
        name:
          "startup-configuration",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          "Startup configuration is invalid.",

        details: {
          errorCount:
            Array.isArray(
              configuration.errors
            )
              ? configuration.errors.length
              : 0,
        },
      });
    }


    return createCheck({
      name:
        "startup-configuration",

      state:
        CHECK_STATE.PASS,

      message:
        "Startup configuration passed validation.",
    });
  }


  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  evaluateLifecycle(
    lifecycle
  ) {
    const state =
      normalizeLifecycleState(
        lifecycle
      );


    if (
      !state
    ) {
      return createCheck({
        name:
          "application-lifecycle",

        state:
          CHECK_STATE.UNKNOWN,

        severity:
          SEVERITY.WARNING,

        message:
          "Application lifecycle state is unavailable.",
      });
    }


    if (
      [
        "FAILED",
        "STOPPED",
        "SHUTTING_DOWN",
        "DRAINING",
      ].includes(
        state
      )
    ) {
      return createCheck({
        name:
          "application-lifecycle",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          `Application lifecycle state is ${state}.`,
      });
    }


    if (
      state !==
      "READY"
    ) {
      return createCheck({
        name:
          "application-lifecycle",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          `Application lifecycle state is ${state}.`,
      });
    }


    if (
      lifecycle.ready ===
      false
    ) {
      return createCheck({
        name:
          "application-lifecycle",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          "Lifecycle reports READY state but readiness flag is false.",
      });
    }


    return createCheck({
      name:
        "application-lifecycle",

      state:
        CHECK_STATE.PASS,

      message:
        "Application lifecycle is READY.",
    });
  }


  // ==========================================================================
  // STARTUP RECOVERY
  // ==========================================================================

  evaluateStartupRecovery(
    recovery
  ) {
    if (
      !recovery
    ) {
      return createCheck({
        name:
          "startup-recovery",

        state:
          CHECK_STATE.UNKNOWN,

        severity:
          SEVERITY.WARNING,

        message:
          "Startup recovery status is unavailable.",
      });
    }


    if (
      recovery
        .lastError
    ) {
      return createCheck({
        name:
          "startup-recovery",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          "Startup recovery encountered an error.",

        details: {
          failed:
            safeNumber(
              recovery.failed
            ),
        },
      });
    }


    if (
      recovery
        .startupRecoveryCompleted !==
      true
    ) {
      return createCheck({
        name:
          "startup-recovery",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          "Startup recovery has not completed.",
      });
    }


    if (
      safeNumber(
        recovery.failed
      ) >
      0
    ) {
      return createCheck({
        name:
          "startup-recovery",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          "Startup recovery completed with failed records.",

        details: {
          discovered:
            safeNumber(
              recovery.discovered
            ),

          recovered:
            safeNumber(
              recovery.recovered
            ),

          failed:
            safeNumber(
              recovery.failed
            ),
        },
      });
    }


    return createCheck({
      name:
        "startup-recovery",

      state:
        CHECK_STATE.PASS,

      message:
        "Startup recovery completed successfully.",
    });
  }


  // ==========================================================================
  // SYSTEM HEALTH
  // ==========================================================================

  evaluateSystemHealth(
    health
  ) {
    if (
      !health
    ) {
      return createCheck({
        name:
          "system-health",

        state:
          CHECK_STATE.UNKNOWN,

        severity:
          SEVERITY.WARNING,

        message:
          "System health status is unavailable.",
      });
    }


    if (
      health.safeMode ===
      true
    ) {
      return createCheck({
        name:
          "system-health",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          "AIRA is in SAFE_MODE.",
      });
    }


    if (
      health.status ===
      "unhealthy"
    ) {
      return createCheck({
        name:
          "system-health",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          "System health is unhealthy.",
      });
    }


    if (
      health.status ===
      "degraded"
    ) {
      return createCheck({
        name:
          "system-health",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          "System health is degraded.",
      });
    }


    return createCheck({
      name:
        "system-health",

      state:
        CHECK_STATE.PASS,

      message:
        "System health is operational.",
    });
  }


  // ==========================================================================
  // DEPENDENCY ISOLATION
  // ==========================================================================

  evaluateDependencies(
    dependencyIsolation
  ) {
    if (
      !dependencyIsolation
    ) {
      return createCheck({
        name:
          "dependency-isolation",

        state:
          CHECK_STATE.UNKNOWN,

        severity:
          SEVERITY.WARNING,

        message:
          "Dependency isolation status is unavailable.",
      });
    }


    const dependencies =
      dependencyIsolation.dependencies ||
      dependencyIsolation;


    const entries =
      Array.isArray(
        dependencies
      )
        ? dependencies
        : Object.entries(
            dependencies ||
            {}
          )
            .map(
              (
                [
                  name,
                  value,
                ]
              ) => ({
                name,

                ...(
                  value ||
                  {}
                ),
              })
            );


    let criticalFailures =
      0;

    let degraded =
      0;


    for (
      const dependency
      of entries
    ) {
      const state =
        String(
          dependency
            .circuit
            ?.state ||
          dependency.state ||
          ""
        )
          .toUpperCase();


      const failureMode =
        String(
          dependency.failureMode ||
          ""
        )
          .toUpperCase();


      const dependencyClass =
        String(
          dependency.dependencyClass ||
          dependency.class ||
          ""
        )
          .toUpperCase();


      if (
        state ===
          "OPEN" &&
        (
          failureMode ===
            "FAIL_CLOSED" ||
          dependencyClass ===
            "CRITICAL"
        )
      ) {
        criticalFailures +=
          1;
      } else if (
        [
          "OPEN",
          "HALF_OPEN",
          "DEGRADED",
          "UNAVAILABLE",
        ].includes(
          state
        )
      ) {
        degraded +=
          1;
      }
    }


    if (
      criticalFailures >
      0
    ) {
      return createCheck({
        name:
          "dependency-isolation",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          `${criticalFailures} critical dependency boundary is unavailable.`,

        details: {
          criticalFailures,

          degraded,
        },
      });
    }


    if (
      degraded >
      0
    ) {
      return createCheck({
        name:
          "dependency-isolation",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          `${degraded} dependency boundary is degraded.`,

        details: {
          degraded,
        },
      });
    }


    return createCheck({
      name:
        "dependency-isolation",

      state:
        CHECK_STATE.PASS,

      message:
        "Dependency isolation boundaries are operational.",
    });
  }


  // ==========================================================================
  // OUTBOX
  // ==========================================================================

  evaluateOutbox(
    outbox
  ) {
    if (
      !outbox
    ) {
      return createCheck({
        name:
          "workflow-outbox",

        state:
          CHECK_STATE.UNKNOWN,

        severity:
          SEVERITY.WARNING,

        message:
          "Workflow outbox status is unavailable.",
      });
    }


    const runtime =
      outbox.runtime ||
      outbox;


    if (
      runtime.failed ===
        true ||
      runtime.lastError
    ) {
      return createCheck({
        name:
          "workflow-outbox",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          "Workflow outbox runtime reports failure.",
      });
    }


    if (
      runtime.running ===
        false &&
      runtime.stopping !==
        true
    ) {
      return createCheck({
        name:
          "workflow-outbox",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          "Workflow outbox runtime is not running.",
      });
    }


    return createCheck({
      name:
        "workflow-outbox",

      state:
        CHECK_STATE.PASS,

      message:
        "Workflow outbox is operational.",
    });
  }


  // ==========================================================================
  // RETENTION
  // ==========================================================================

  evaluateRetention(
    retention
  ) {
    if (
      !retention
    ) {
      return createCheck({
        name:
          "retention",

        state:
          CHECK_STATE.UNKNOWN,

        severity:
          SEVERITY.WARNING,

        message:
          "Retention status is unavailable.",
      });
    }


    const lastRun =
      retention.lastRun ||
      null;


    if (
      lastRun
        ?.lastError
    ) {
      return createCheck({
        name:
          "retention",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          "Last retention cycle failed.",
      });
    }


    if (
      Array.isArray(
        retention
          .protectedCollections
      ) &&
      (
        !retention
          .protectedCollections
          .includes(
            "AuditEvent"
          ) ||
        !retention
          .protectedCollections
          .includes(
            "AuthenticationAuditEvent"
          )
      )
    ) {
      return createCheck({
        name:
          "retention",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          "Audit chain collections are not fully protected from retention deletion.",
      });
    }


    return createCheck({
      name:
        "retention",

      state:
        CHECK_STATE.PASS,

      message:
        "Retention subsystem is operational.",
    });
  }


  // ==========================================================================
  // CHAOS
  // ==========================================================================

  evaluateChaos(
    chaos
  ) {
    if (
      !chaos
    ) {
      /*
       * Missing chaos service is safe because chaos is not
       * required for production serving.
       */
      return createCheck({
        name:
          "chaos",

        state:
          CHECK_STATE.PASS,

        message:
          "Chaos framework is not active.",
      });
    }


    const environment =
      String(
        chaos.environment ||
        chaos.nodeEnv ||
        ""
      )
        .toLowerCase();


    const activeFailures =
      Array.isArray(
        chaos.activeFailures
      )
        ? chaos.activeFailures
        : [];


    if (
      environment ===
        "production" &&
      activeFailures.length >
        0
    ) {
      return createCheck({
        name:
          "chaos",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          "Active chaos failures are present in production.",

        details: {
          activeFailureCount:
            activeFailures.length,
        },
      });
    }


    if (
      environment ===
        "production" &&
      chaos.enabled ===
        true
    ) {
      return createCheck({
        name:
          "chaos",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          "Chaos framework is enabled in production.",
      });
    }


    return createCheck({
      name:
        "chaos",

      state:
        CHECK_STATE.PASS,

      message:
        "Chaos posture is safe.",
    });
  }


  // ==========================================================================
  // KILL SWITCHES
  // ==========================================================================

  evaluateKillSwitches(
    killSwitches
  ) {
    if (
      !killSwitches
    ) {
      return createCheck({
        name:
          "kill-switches",

        state:
          CHECK_STATE.UNKNOWN,

        severity:
          SEVERITY.WARNING,

        message:
          "Kill-switch state is unavailable.",
      });
    }


    const emergencyMode =
      killSwitches
        .emergencyMode ===
        true ||
      killSwitches
        .EMERGENCY_MODE ===
        true;


    const actionsEnabled =
      killSwitches
        .actionsEnabled !==
      false;


    if (
      emergencyMode
    ) {
      return createCheck({
        name:
          "kill-switches",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          "Emergency mode is active; automatic execution is blocked.",
      });
    }


    if (
      !actionsEnabled
    ) {
      return createCheck({
        name:
          "kill-switches",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          "Global action execution is disabled.",
      });
    }


    return createCheck({
      name:
        "kill-switches",

      state:
        CHECK_STATE.PASS,

      message:
        "Kill-switch manager is available and not in emergency mode.",
    });
  }


  // ==========================================================================
  // FEATURE FLAGS
  // ==========================================================================

  evaluateFeatureFlags(
    featureFlags
  ) {
    if (
      !featureFlags
    ) {
      return createCheck({
        name:
          "feature-flags",

        state:
          CHECK_STATE.UNKNOWN,

        severity:
          SEVERITY.WARNING,

        message:
          "Feature flag validation status is unavailable.",
      });
    }


    if (
      featureFlags.safe ===
      false
    ) {
      return createCheck({
        name:
          "feature-flags",

        state:
          CHECK_STATE.FAIL,

        severity:
          SEVERITY.CRITICAL,

        message:
          "Feature flag configuration is unsafe.",

        details: {
          errors:
            Array.isArray(
              featureFlags.errors
            )
              ? featureFlags.errors
              : [],
        },
      });
    }


    if (
      Array.isArray(
        featureFlags.warnings
      ) &&
      featureFlags
        .warnings
        .length >
      0
    ) {
      return createCheck({
        name:
          "feature-flags",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          "Feature flag configuration contains production warnings.",

        details: {
          warningCount:
            featureFlags
              .warnings
              .length,
        },
      });
    }


    return createCheck({
      name:
        "feature-flags",

      state:
        CHECK_STATE.PASS,

      message:
        "Feature flag posture is safe.",
    });
  }


  // ==========================================================================
  // RELIABILITY / SLO
  // ==========================================================================

  evaluateReliability(
    reliability
  ) {
    const state =
      normalizeReliabilityState(
        reliability
      );


    if (
      !state
    ) {
      return createCheck({
        name:
          "reliability",

        state:
          CHECK_STATE.UNKNOWN,

        severity:
          SEVERITY.WARNING,

        message:
          "SLO reliability state is unavailable.",
      });
    }


    if (
      state ===
      "EXHAUSTED"
    ) {
      return createCheck({
        name:
          "reliability",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          "One or more reliability error budgets are exhausted.",
      });
    }


    if (
      state ===
        "BURNING" ||
      state ===
        "AT_RISK"
    ) {
      return createCheck({
        name:
          "reliability",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.WARNING,

        message:
          `Reliability state is ${state}.`,
      });
    }


    if (
      state ===
      "INSUFFICIENT_DATA"
    ) {
      return createCheck({
        name:
          "reliability",

        state:
          CHECK_STATE.WARN,

        severity:
          SEVERITY.INFO,

        message:
          "Reliability SLOs do not yet have sufficient samples.",
      });
    }


    return createCheck({
      name:
        "reliability",

      state:
        CHECK_STATE.PASS,

      message:
        "Reliability objectives are healthy.",
    });
  }


  // ==========================================================================
  // STATUS
  // ==========================================================================

  getStatus() {
    return {
      lastEvaluationAt:
        this.lastEvaluationAt
          ? this.lastEvaluationAt
              .toISOString()
          : null,

      lastState:
        this.lastState,

      evaluationCount:
        this.evaluationCount,

      lastFailureReasons:
        [
          ...this
            .lastFailureReasons,
        ],

      executionAuthorized:
        false,
    };
  }
}


// ============================================================================
// SINGLETON
// ============================================================================

module.exports =
  new ProductionReadinessService();


module.exports
  .ProductionReadinessService =
  ProductionReadinessService;


module.exports
  .READINESS_STATE =
  READINESS_STATE;


module.exports
  .CHECK_STATE =
  CHECK_STATE;