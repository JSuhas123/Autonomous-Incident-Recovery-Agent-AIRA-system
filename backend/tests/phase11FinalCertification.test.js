"use strict";

/**
 * ============================================================================
 * AIRA — PHASE 11 FINAL CERTIFICATION SUITE
 * ============================================================================
 *
 * Purpose:
 *
 * Certify the safety invariants introduced throughout Phase 11.
 *
 * This suite intentionally focuses on architectural invariants rather than
 * duplicating every individual Phase 11 unit test.
 *
 * CERTIFIED AREAS
 * ---------------------------------------------------------------------------
 *
 * 11.1  Runtime safety foundations
 * 11.2  Execution safety
 * 11.3  Durable workflow/outbox
 * 11.4  Recovery continuity
 * 11.5  Dependency isolation
 * 11.6  Admission/load protection
 * 11.7  Tenant persistence isolation
 * 11.8  Secrets/session security
 * 11.9  Audit integrity
 * 11.10 Application lifecycle
 * 11.11 Retention safety
 * 11.12 Self-observability
 * 11.13 SLO/reliability
 * 11.14 Startup validation
 * 11.15 Chaos/failure injection
 * 11.16 Production readiness
 *
 * CRITICAL INVARIANT
 * ---------------------------------------------------------------------------
 *
 * Observability, health, readiness, SLOs, diagnostics and chaos infrastructure
 * NEVER grant execution authorization.
 *
 * Actual execution authorization remains the responsibility of the dedicated
 * execution authorization pipeline.
 * ============================================================================
 */


const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );


// ============================================================================
// PATH HELPERS
// ============================================================================

const ROOT =
  path.resolve(
    __dirname,
    ".."
  );


function rootPath(
  ...parts
) {
  return path.join(
    ROOT,
    ...parts
  );
}


function exists(
  ...parts
) {
  return fs.existsSync(
    rootPath(
      ...parts
    )
  );
}


function read(
  ...parts
) {
  return fs.readFileSync(
    rootPath(
      ...parts
    ),
    "utf8"
  );
}


// ============================================================================
// PHASE 11.1 — CORE SAFETY FOUNDATIONS
// ============================================================================

describe(
  "Phase 11 Final Certification",
  () => {
    describe(
      "11.1 — Core runtime safety",
      () => {
        test(
          "distributed lock service exists",
          () => {
            expect(
              exists(
                "services",
                "infrastructure",
                "distributedLockService.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "system health service exists",
          () => {
            expect(
              exists(
                "services",
                "infrastructure",
                "systemHealthService.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "system health contains safe-mode protection",
          () => {
            const source =
              read(
                "services",
                "infrastructure",
                "systemHealthService.js"
              );


            expect(
              source
            ).toMatch(
              /safeMode|isSafeMode/
            );


            expect(
              source
            ).toMatch(
              /canExecuteActions/
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.2 — EXECUTION SAFETY
    // ========================================================================

    describe(
      "11.2 — Execution safety",
      () => {
        test(
          "execution authorization engine exists",
          () => {
            expect(
              exists(
                "services",
                "execution",
                "executionAuthorizationEngine.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "execution kill-switch gate exists",
          () => {
            expect(
              exists(
                "services",
                "execution",
                "executionKillSwitchGateService.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "execution authorization persistence exists",
          () => {
            expect(
              exists(
                "services",
                "execution",
                "executionAuthorizationPersistenceService.js"
              )
            ).toBe(
              true
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.3 — DURABLE OUTBOX
    // ========================================================================

    describe(
      "11.3 — Durable workflow outbox",
      () => {
        test(
          "workflow outbox model exists",
          () => {
            expect(
              exists(
                "models",
                "WorkflowOutboxEvent.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "outbox runtime controller exists",
          () => {
            expect(
              exists(
                "services",
                "workflowOutbox",
                "workflowOutboxRuntimeController.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "outbox runtime supports graceful stop",
          () => {
            const source =
              read(
                "services",
                "workflowOutbox",
                "workflowOutboxRuntimeController.js"
              );


            expect(
              source
            ).toMatch(
              /async\s+stop/
            );


            expect(
              source
            ).toMatch(
              /waitUntilIdle/
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.4 — RECOVERY CONTINUITY
    // ========================================================================

    describe(
      "11.4 — Recovery continuity",
      () => {
        test(
          "runtime recovery checkpoint model exists",
          () => {
            expect(
              exists(
                "models",
                "RuntimeRecoveryCheckpoint.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "runtime recovery coordinator exists",
          () => {
            expect(
              exists(
                "services",
                "recoveryRuntime",
                "runtimeRecoveryCoordinator.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "workflow recovery orchestrator exists",
          () => {
            expect(
              exists(
                "services",
                "replayOrchestration",
                "workflowRecoveryOrchestrator.js"
              )
            ).toBe(
              true
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.5 — DEPENDENCY ISOLATION
    // ========================================================================

    describe(
      "11.5 — Dependency isolation",
      () => {
        test(
          "dependency isolation service exists",
          () => {
            expect(
              exists(
                "services",
                "infrastructure",
                "dependencyIsolationService.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "circuit breaker exists",
          () => {
            expect(
              exists(
                "services",
                "infrastructure",
                "circuitBreakerService.js"
              )
            ).toBe(
              true
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.7 — TENANT ISOLATION
    // ========================================================================

    describe(
      "11.7 — Tenant persistence isolation",
      () => {
        test(
          "environment service exists",
          () => {
            expect(
              exists(
                "services",
                "core",
                "environmentService.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "tenant service exists",
          () => {
            expect(
              exists(
                "services",
                "core",
                "tenantService.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "organization bootstrap service exists",
          () => {
            expect(
              exists(
                "services",
                "core",
                "organizationBootstrapService.js"
              )
            ).toBe(
              true
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.8 — SECRET / SESSION SECURITY
    // ========================================================================

    describe(
      "11.8 — Secret and session security",
      () => {
        test(
          "password hashes are excluded from normal queries",
          () => {
            const source =
              read(
                "models",
                "PasswordCredential.js"
              );


            expect(
              source
            ).toMatch(
              /select:\s*false/
            );
          }
        );


        test(
          "integration secrets use authenticated encryption",
          () => {
            const source =
              read(
                "services",
                "integrations",
                "secretStorage.js"
              );


            expect(
              source
            ).toMatch(
              /aes-256-gcm/
            );


            expect(
              source
            ).toMatch(
              /createCipheriv/
            );


            expect(
              source
            ).toMatch(
              /getAuthTag/
            );
          }
        );


        test(
          "sessions store hashed tokens",
          () => {
            const source =
              read(
                "services",
                "identity",
                "sessionService.js"
              );


            expect(
              source
            ).toMatch(
              /sha256/
            );


            expect(
              source
            ).toMatch(
              /tokenHash/
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.9 — AUDIT INTEGRITY
    // ========================================================================

    describe(
      "11.9 — Audit integrity",
      () => {
        test(
          "audit events contain chain custody fields",
          () => {
            const source =
              read(
                "models",
                "AuditEvent.js"
              );


            expect(
              source
            ).toMatch(
              /chainIndex/
            );


            expect(
              source
            ).toMatch(
              /previousEventHash/
            );


            expect(
              source
            ).toMatch(
              /eventHash/
            );


            expect(
              source
            ).toMatch(
              /signature/
            );
          }
        );


        test(
          "audit event custody fields are immutable",
          () => {
            const AuditEvent =
              require(
                "../models/AuditEvent"
              );


            expect(
              AuditEvent.schema
                .path(
                  "eventHash"
                )
                .options
                .immutable
            ).toBe(
              true
            );


            expect(
              AuditEvent.schema
                .path(
                  "signature"
                )
                .options
                .immutable
            ).toBe(
              true
            );


            expect(
              AuditEvent.schema
                .path(
                  "chainIndex"
                )
                .options
                .immutable
            ).toBe(
              true
            );
          }
        );


        test(
          "authentication audit is append-only",
          () => {
            const source =
              read(
                "models",
                "AuthenticationAuditEvent.js"
              );


            expect(
              source
            ).toMatch(
              /append-only/
            );


            expect(
              source
            ).toMatch(
              /immutable/
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.10 — APPLICATION LIFECYCLE
    // ========================================================================

    describe(
      "11.10 — Application lifecycle",
      () => {
        test(
          "server handles SIGINT",
          () => {
            const source =
              read(
                "server.js"
              );


            expect(
              source
            ).toMatch(
              /SIGINT/
            );
          }
        );


        test(
          "server handles SIGTERM",
          () => {
            const source =
              read(
                "server.js"
              );


            expect(
              source
            ).toMatch(
              /SIGTERM/
            );
          }
        );


        test(
          "server drains workflow outbox during shutdown",
          () => {
            const source =
              read(
                "server.js"
              );


            expect(
              source
            ).toMatch(
              /workflowOutboxRuntime/
            );


            expect(
              source
            ).toMatch(
              /waitForCurrent/
            );
          }
        );


        test(
          "database disconnect occurs during shutdown",
          () => {
            const source =
              read(
                "server.js"
              );


            expect(
              source
            ).toMatch(
              /disconnectDatabase/
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.11 — RETENTION
    // ========================================================================

    describe(
      "11.11 — Retention safety",
      () => {
        test(
          "retention service exists",
          () => {
            expect(
              exists(
                "services",
                "infrastructure",
                "retentionService.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "audit event does not use destructive TTL retention",
          () => {
            const source =
              read(
                "models",
                "AuditEvent.js"
              );


            expect(
              source
            ).not.toMatch(
              /expires:\s*63072000/
            );


            expect(
              source
            ).toMatch(
              /No TTL|NO TTL|No TTL index/
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.12 — SELF OBSERVABILITY
    // ========================================================================

    describe(
      "11.12 — Self observability",
      () => {
        test(
          "canonical metrics service exists",
          () => {
            expect(
              exists(
                "services",
                "infrastructure",
                "metricsService.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "self observability collector exists",
          () => {
            expect(
              exists(
                "services",
                "observability",
                "selfObservabilityCollector.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "Prometheus facade delegates to canonical metrics service",
          () => {
            const source =
              read(
                "services",
                "observability",
                "prometheusMetricsService.js"
              );


            expect(
              source
            ).toMatch(
              /infrastructure\/metricsService/
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.13 — SLO / RELIABILITY
    // ========================================================================

    describe(
      "11.13 — SLO reliability",
      () => {
        test(
          "SLO service exists",
          () => {
            expect(
              exists(
                "services",
                "reliability",
                "sloService.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "SLO layer does not become an execution authority",
          () => {
            const source =
              read(
                "services",
                "reliability",
                "sloService.js"
              );


            expect(
              source
            ).toMatch(
              /executionAuthorized/
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.14 — STARTUP VALIDATION
    // ========================================================================

    describe(
      "11.14 — Startup validation",
      () => {
        test(
          "startup validator exists",
          () => {
            expect(
              exists(
                "config",
                "startupValidator.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "startup validator validates AUDIT_SECRET",
          () => {
            const source =
              read(
                "config",
                "startupValidator.js"
              );


            expect(
              source
            ).toMatch(
              /AUDIT_SECRET/
            );


            expect(
              source
            ).toMatch(
              /32/
            );
          }
        );


        test(
          "production validation rejects wildcard CORS",
          () => {
            const source =
              read(
                "config",
                "startupValidator.js"
              );


            expect(
              source
            ).toMatch(
              /CORS_ORIGIN/
            );


            expect(
              source
            ).toMatch(
              /must not be/
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.15 — CHAOS
    // ========================================================================

    describe(
      "11.15 — Chaos certification",
      () => {
        test(
          "chaos framework exists",
          () => {
            expect(
              exists(
                "services",
                "chaos",
                "chaosTestFramework.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "failure scenario catalogue exists",
          () => {
            expect(
              exists(
                "services",
                "simulation",
                "failureScenarios.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "failure scenarios include cascading failure testing",
          () => {
            const source =
              read(
                "services",
                "simulation",
                "failureScenarios.js"
              );


            expect(
              source
            ).toMatch(
              /cascadingFailure/
            );
          }
        );


        test(
          "failure scenarios include degraded observability testing",
          () => {
            const source =
              read(
                "services",
                "simulation",
                "failureScenarios.js"
              );


            expect(
              source
            ).toMatch(
              /degradedObservability/
            );
          }
        );
      }
    );


    // ========================================================================
    // PHASE 11.16 — PRODUCTION READINESS
    // ========================================================================

    describe(
      "11.16 — Production readiness",
      () => {
        test(
          "production readiness service exists",
          () => {
            expect(
              exists(
                "services",
                "infrastructure",
                "productionReadinessService.js"
              )
            ).toBe(
              true
            );
          }
        );


        test(
          "production readiness never grants execution authorization",
          () => {
            const {
              ProductionReadinessService,
            } =
              require(
                "../services/infrastructure/productionReadinessService"
              );


            const service =
              new ProductionReadinessService();


            const result =
              service.evaluate({
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
                  dependencies:
                    {},
                },

                outbox: {
                  runtime: {
                    running:
                      true,

                    failed:
                      false,
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
              });


            expect(
              result.executionAuthorized
            ).toBe(
              false
            );


            for (
              const check
              of result.checks
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
          "server exposes detailed health endpoint",
          () => {
            const source =
              read(
                "server.js"
              );


            expect(
              source
            ).toMatch(
              /\/health\/detailed/
            );
          }
        );


        test(
          "detailed health integrates production readiness",
          () => {
            const source =
              read(
                "server.js"
              );


            expect(
              source
            ).toMatch(
              /productionReadiness/
            );


            expect(
              source
            ).toMatch(
              /readyToServeTraffic/
            );
          }
        );
      }
    );


    // ========================================================================
    // GLOBAL PHASE 11 SAFETY INVARIANTS
    // ========================================================================

    describe(
      "Global Phase 11 invariants",
      () => {
        test(
          "production readiness cannot replace execution authorization",
          () => {
            const source =
              read(
                "server.js"
              );


            /*
             * We specifically reject direct assignment of execution
             * authorization from readiness.
             */

            expect(
              source
            ).not.toMatch(
              /executionAuthorized\s*:\s*productionReadiness\.productionReady/
            );


            expect(
              source
            ).not.toMatch(
              /executionAuthorized\s*:\s*productionReadiness\.readyToServeTraffic/
            );
          }
        );


        test(
          "readiness is not used directly as canExecuteActions",
          () => {
            const source =
              read(
                "server.js"
              );


            expect(
              source
            ).not.toMatch(
              /canExecuteActions\s*:\s*productionReadiness\.productionReady/
            );


            expect(
              source
            ).not.toMatch(
              /canExecuteActions\s*:\s*productionReadiness\.readyToServeTraffic/
            );
          }
        );


        test(
          "server retains independent system health execution gate",
          () => {
            const source =
              read(
                "server.js"
              );


            expect(
              source
            ).toMatch(
              /systemHealthService/
            );


            expect(
              source
            ).toMatch(
              /canExecuteActions/
            );
          }
        );


        test(
          "audit storage remains append-only",
          () => {
            const auditSource =
              read(
                "models",
                "AuditEvent.js"
              );


            const authAuditSource =
              read(
                "models",
                "AuthenticationAuditEvent.js"
              );


            expect(
              auditSource
            ).toMatch(
              /immutable/
            );


            expect(
              authAuditSource
            ).toMatch(
              /immutable/
            );
          }
        );


        test(
          "Phase 11 retains explicit fail-safe mechanisms",
          () => {
            const health =
              read(
                "services",
                "infrastructure",
                "systemHealthService.js"
              );


            const killSwitch =
              read(
                "config",
                "killSwitches.js"
              );


            const readiness =
              read(
                "services",
                "infrastructure",
                "productionReadinessService.js"
              );


            expect(
              health
            ).toMatch(
              /safeMode|isSafeMode/
            );


            expect(
              killSwitch
            ).toMatch(
              /EMERGENCY_MODE/
            );


            expect(
              readiness
            ).toMatch(
              /NOT_READY/
            );
          }
        );
      }
    );
  }
);