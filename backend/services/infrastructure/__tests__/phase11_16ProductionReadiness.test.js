"use strict";

/**
 * ============================================================================
 * PHASE 11.16 — PRODUCTION READINESS CERTIFICATION
 * ============================================================================
 *
 * Certifies that the production-readiness layer:
 *
 * 1. Reports READY only when all required subsystems are healthy.
 * 2. Reports DEGRADED for non-fatal operational warnings.
 * 3. Reports NOT_READY for hard safety failures.
 * 4. Never grants execution authorization.
 * 5. Fails closed when important readiness information is unavailable.
 * 6. Detects SAFE_MODE.
 * 7. Detects startup recovery failure.
 * 8. Detects critical dependency isolation failure.
 * 9. Detects unsafe feature-flag configuration.
 * 10. Handles kill switches independently from execution authorization.
 * 11. Handles SLO degradation without incorrectly killing the service.
 * 12. Preserves internal readiness status.
 */

const {
  ProductionReadinessService,
  READINESS_STATE,
  CHECK_STATE,
} =
  require(
    "../productionReadinessService"
  );


// ============================================================================
// HELPERS
// ============================================================================

function createHealthyInput() {
  return {
    configuration: {
      valid:
        true,

      errors:
        [],
    },


    lifecycle: {
      state:
        "READY",

      ready:
        true,
    },


    replayRecovery: {
      startupRecoveryCompleted:
        true,

      discovered:
        4,

      recovered:
        4,

      failed:
        0,

      lastError:
        null,
    },


    systemHealth: {
      status:
        "healthy",

      safeMode:
        false,
    },


    dependencyIsolation: {
      dependencies: {
        mongodb: {
          dependencyClass:
            "CRITICAL",

          failureMode:
            "FAIL_CLOSED",

          circuit: {
            state:
              "CLOSED",
          },
        },

        redis: {
          dependencyClass:
            "CRITICAL",

          failureMode:
            "FAIL_CLOSED",

          circuit: {
            state:
              "CLOSED",
          },
        },

        rabbitmq: {
          dependencyClass:
            "DEGRADED_ALLOWED",

          failureMode:
            "FAIL_OPEN",

          circuit: {
            state:
              "CLOSED",
          },
        },
      },
    },


    outbox: {
      runtime: {
        running:
          true,

        stopping:
          false,

        failed:
          false,

        lastError:
          null,
      },
    },


    retention: {
      protectedCollections: [
        "AuditEvent",
        "AuthenticationAuditEvent",
      ],

      lastRun: {
        lastError:
          null,
      },
    },


    chaos: {
      environment:
        "production",

      enabled:
        false,

      activeFailures:
        [],
    },


    killSwitches: {
      actionsEnabled:
        true,

      emergencyMode:
        false,

      recoveryExecutionEnabled:
        true,
    },


    featureFlags: {
      safe:
        true,

      warnings:
        [],

      errors:
        [],
    },


    reliability: {
      state:
        "HEALTHY",
    },
  };
}


function createService() {
  return new ProductionReadinessService({
    now: () =>
      Date.parse(
        "2026-08-17T00:00:00.000Z"
      ),
  });
}


// ============================================================================
// TESTS
// ============================================================================

describe(
  "Phase 11.16 — Production Readiness Certification",
  () => {
    test(
      "READY when all production safety systems are healthy",
      () => {
        const service =
          createService();


        const result =
          service.evaluate(
            createHealthyInput()
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.READY
        );


        expect(
          result.productionReady
        ).toBe(
          true
        );


        expect(
          result.degraded
        ).toBe(
          false
        );


        expect(
          result.readyToServeTraffic
        ).toBe(
          true
        );


        expect(
          result.summary.failed
        ).toBe(
          0
        );


        expect(
          result.summary.warnings
        ).toBe(
          0
        );


        expect(
          result.summary.passed
        ).toBe(
          result.summary.total
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "NOT_READY when startup configuration is invalid",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.configuration = {
          valid:
            false,

          errors: [
            "AUDIT_SECRET missing",
          ],
        };


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.NOT_READY
        );


        expect(
          result.productionReady
        ).toBe(
          false
        );


        expect(
          result.readyToServeTraffic
        ).toBe(
          false
        );


        expect(
          result.blockers.some(
            (
              blocker
            ) =>
              blocker.name ===
              "startup-configuration"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "NOT_READY while application lifecycle is shutting down",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.lifecycle = {
          state:
            "SHUTTING_DOWN",

          ready:
            false,
        };


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.NOT_READY
        );


        expect(
          result.readyToServeTraffic
        ).toBe(
          false
        );


        expect(
          result.blockers.some(
            (
              blocker
            ) =>
              blocker.name ===
              "application-lifecycle"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "NOT_READY when startup recovery has not completed",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.replayRecovery
          .startupRecoveryCompleted =
          false;


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.NOT_READY
        );


        const recoveryCheck =
          result.checks.find(
            (
              check
            ) =>
              check.name ===
              "startup-recovery"
          );


        expect(
          recoveryCheck.state
        ).toBe(
          CHECK_STATE.FAIL
        );
      }
    );


    test(
      "NOT_READY when startup recovery reports an error",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.replayRecovery
          .lastError =
          "replay failed";


        input.replayRecovery
          .failed =
          3;


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.NOT_READY
        );


        expect(
          result.productionReady
        ).toBe(
          false
        );
      }
    );


    test(
      "NOT_READY when AIRA enters SAFE_MODE",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.systemHealth = {
          status:
            "degraded",

          safeMode:
            true,
        };


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.NOT_READY
        );


        const healthCheck =
          result.checks.find(
            (
              check
            ) =>
              check.name ===
              "system-health"
          );


        expect(
          healthCheck.state
        ).toBe(
          CHECK_STATE.FAIL
        );


        expect(
          healthCheck.severity
        ).toBe(
          "CRITICAL"
        );
      }
    );


    test(
      "DEGRADED for non-fatal system health degradation",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.systemHealth = {
          status:
            "degraded",

          safeMode:
            false,
        };


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.DEGRADED
        );


        expect(
          result.productionReady
        ).toBe(
          false
        );


        expect(
          result.readyToServeTraffic
        ).toBe(
          true
        );
      }
    );


    test(
      "NOT_READY when critical fail-closed dependency circuit is OPEN",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.dependencyIsolation
          .dependencies
          .redis
          .circuit
          .state =
          "OPEN";


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.NOT_READY
        );


        const dependencyCheck =
          result.checks.find(
            (
              check
            ) =>
              check.name ===
              "dependency-isolation"
          );


        expect(
          dependencyCheck.state
        ).toBe(
          CHECK_STATE.FAIL
        );
      }
    );


    test(
      "DEGRADED when a fail-open dependency is unavailable",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.dependencyIsolation
          .dependencies
          .rabbitmq
          .circuit
          .state =
          "OPEN";


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.DEGRADED
        );


        expect(
          result.readyToServeTraffic
        ).toBe(
          true
        );
      }
    );


    test(
      "DEGRADED when workflow outbox runtime is not running",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.outbox.runtime.running =
          false;


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.DEGRADED
        );


        const outboxCheck =
          result.checks.find(
            (
              check
            ) =>
              check.name ===
              "workflow-outbox"
          );


        expect(
          outboxCheck.state
        ).toBe(
          CHECK_STATE.WARN
        );
      }
    );


    test(
      "NOT_READY when audit collections are not protected by retention",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.retention
          .protectedCollections = [
            "AuditEvent",
          ];


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.NOT_READY
        );


        const retentionCheck =
          result.checks.find(
            (
              check
            ) =>
              check.name ===
              "retention"
          );


        expect(
          retentionCheck.state
        ).toBe(
          CHECK_STATE.FAIL
        );
      }
    );


    test(
      "NOT_READY when chaos failures are active in production",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.chaos.enabled =
          true;


        input.chaos
          .activeFailures = [
            {
              dependency:
                "redis",

              failure:
                "timeout",
            },
          ];


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.NOT_READY
        );


        const chaosCheck =
          result.checks.find(
            (
              check
            ) =>
              check.name ===
              "chaos"
          );


        expect(
          chaosCheck.state
        ).toBe(
          CHECK_STATE.FAIL
        );
      }
    );


    test(
      "DEGRADED when emergency mode is active",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.killSwitches
          .emergencyMode =
          true;


        input.killSwitches
          .actionsEnabled =
          false;


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.DEGRADED
        );


        expect(
          result.readyToServeTraffic
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "DEGRADED when global action execution is disabled",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.killSwitches
          .actionsEnabled =
          false;


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.DEGRADED
        );


        const killSwitchCheck =
          result.checks.find(
            (
              check
            ) =>
              check.name ===
              "kill-switches"
          );


        expect(
          killSwitchCheck.state
        ).toBe(
          CHECK_STATE.WARN
        );
      }
    );


    test(
      "NOT_READY when feature flag configuration is unsafe",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.featureFlags = {
          safe:
            false,

          warnings:
            [],

          errors: [
            "Unsafe auto-remediation configuration",
          ],
        };


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.NOT_READY
        );


        expect(
          result.blockers.some(
            (
              blocker
            ) =>
              blocker.name ===
              "feature-flags"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "DEGRADED when feature flags contain production warnings",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.featureFlags
          .warnings = [
            "Kubernetes executor enabled",
          ];


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.DEGRADED
        );
      }
    );


    test(
      "DEGRADED when SLO error budget is exhausted",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.reliability = {
          state:
            "EXHAUSTED",

          budgetRemainingRatio:
            0,
        };


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.DEGRADED
        );


        expect(
          result.readyToServeTraffic
        ).toBe(
          true
        );
      }
    );


    test(
      "DEGRADED when reliability state has insufficient data",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.reliability = {
          state:
            "INSUFFICIENT_DATA",
        };


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.DEGRADED
        );
      }
    );


    test(
      "missing critical readiness evidence never produces READY",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        delete input.systemHealth;


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.DEGRADED
        );


        expect(
          result.productionReady
        ).toBe(
          false
        );


        const healthCheck =
          result.checks.find(
            (
              check
            ) =>
              check.name ===
              "system-health"
          );


        expect(
          healthCheck.state
        ).toBe(
          CHECK_STATE.UNKNOWN
        );
      }
    );


    test(
      "readiness evaluation NEVER grants execution authorization",
      () => {
        const service =
          createService();


        const ready =
          service.evaluate(
            createHealthyInput()
          );


        expect(
          ready.state
        ).toBe(
          READINESS_STATE.READY
        );


        expect(
          ready.executionAuthorized
        ).toBe(
          false
        );


        for (
          const check
          of ready.checks
        ) {
          expect(
            check.executionAuthorized
          ).toBe(
            false
          );
        }
      }
    );


    test(
      "getStatus tracks readiness evaluations without granting authorization",
      () => {
        const service =
          createService();


        service.evaluate(
          createHealthyInput()
        );


        service.evaluate(
          createHealthyInput()
        );


        const status =
          service.getStatus();


        expect(
          status.lastState
        ).toBe(
          READINESS_STATE.READY
        );


        expect(
          status.evaluationCount
        ).toBe(
          2
        );


        expect(
          status.lastEvaluationAt
        ).toBe(
          "2026-08-17T00:00:00.000Z"
        );


        expect(
          status.lastFailureReasons
        ).toEqual(
          []
        );


        expect(
          status.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "blockers are remembered in diagnostic status",
      () => {
        const service =
          createService();

        const input =
          createHealthyInput();


        input.systemHealth
          .safeMode =
          true;


        const result =
          service.evaluate(
            input
          );


        expect(
          result.state
        ).toBe(
          READINESS_STATE.NOT_READY
        );


        const status =
          service.getStatus();


        expect(
          status.lastState
        ).toBe(
          READINESS_STATE.NOT_READY
        );


        expect(
          status
            .lastFailureReasons
            .length
        ).toBeGreaterThan(
          0
        );


        expect(
          status.executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);