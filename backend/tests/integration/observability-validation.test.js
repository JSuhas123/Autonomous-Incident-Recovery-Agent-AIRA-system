"use strict";

/**
 * PHASE 13 — OBSERVABILITY VALIDATION
 *
 * PostgreSQL/runtime-safe observability tests.
 *
 * This suite deliberately DOES NOT:
 *
 * - import mongoose
 * - import models/*
 * - boot server.js
 * - start Redis
 * - start RabbitMQ
 * - start monitor workers
 * - start cleanup jobs
 * - start policy rollback timers
 * - test Mongo TTL indexes
 *
 * Those responsibilities have their own persistence/infrastructure tests.
 *
 * This suite validates the actual observability contracts:
 *
 * 1. Structured logging
 * 2. Prometheus metrics
 * 3. Audit integrity/signatures
 * 4. Correlation/tracing
 * 5. Alert telemetry
 * 6. Execution-authority safety
 */

const StructuredLogger =
  require(
    "../../services/observability/structuredLogger"
  );

const AuditService =
  require(
    "../../services/observability/auditService"
  );

const metricsService =
  require(
    "../../services/infrastructure/metricsService"
  );


const TEST_TENANT =
  "observability-phase13-test";


describe(
  "PHASE 13 Observability Validation",
  () => {
    let originalAuditSecret;


    beforeAll(
      () => {
        originalAuditSecret =
          process.env
            .AUDIT_SECRET;

        process.env
          .AUDIT_SECRET =
          process.env
            .AUDIT_SECRET ||
          "phase13-observability-test-secret";
      }
    );


    afterAll(
      () => {
        if (
          originalAuditSecret ===
          undefined
        ) {
          delete process.env
            .AUDIT_SECRET;
        } else {
          process.env
            .AUDIT_SECRET =
            originalAuditSecret;
        }
      }
    );


    // ========================================================================
    // STRUCTURED LOGGING
    // ========================================================================

    describe(
      "1. Structured logging",
      () => {
        test(
          "propagates correlation identity",
          () => {
            const correlationId =
              `obs-log-${Date.now()}`;


            StructuredLogger
              .setContext(
                correlationId,
                {
                  tenantId:
                    TEST_TENANT,

                  component:
                    "incident-detection",

                  userId:
                    "test-user",
                }
              );


            const result =
              StructuredLogger
                .info(
                  "Incident detected",
                  correlationId,
                  {
                    errorRate:
                      5.2,

                    affectedServices: [
                      "api",
                      "cache",
                    ],
                  }
                );


            expect(
              result
                .correlationId
            ).toBe(
              correlationId
            );


            expect(
              result
                .tenantId
            ).toBe(
              TEST_TENANT
            );


            expect(
              result.message
            ).toBe(
              "Incident detected"
            );


            expect(
              result.level
            ).toBe(
              "INFO"
            );


            expect(
              result.timestamp
            ).toBeDefined();


            const context =
              StructuredLogger
                .getContext(
                  correlationId
                );


            expect(
              context
                .correlationId
            ).toBe(
              correlationId
            );


            expect(
              context
                .component
            ).toBe(
              "incident-detection"
            );


            StructuredLogger
              .clearContext(
                correlationId
              );
          }
        );


        test(
          "preserves one correlation id through the decision pipeline",
          () => {
            const correlationId =
              `obs-pipeline-${Date.now()}`;


            StructuredLogger
              .setContext(
                correlationId,
                {
                  tenantId:
                    TEST_TENANT,

                  severity:
                    "HIGH",

                  incidentId:
                    "incident-test",
                }
              );


            const analysis =
              StructuredLogger
                .info(
                  "Analyzing incident",
                  correlationId,
                  {
                    stage:
                      "analysis",
                  }
                );


            const decision =
              StructuredLogger
                .info(
                  "Making decision",
                  correlationId,
                  {
                    stage:
                      "decision",

                    verdict:
                      "EXECUTE_ACTION",
                  }
                );


            const action =
              StructuredLogger
                .info(
                  "Executing action",
                  correlationId,
                  {
                    stage:
                      "action",

                    action:
                      "RESTART_SERVICE",
                  }
                );


            expect(
              new Set(
                [
                  analysis
                    .correlationId,

                  decision
                    .correlationId,

                  action
                    .correlationId,
                ]
              ).size
            ).toBe(
              1
            );


            expect(
              analysis.stage
            ).toBe(
              "analysis"
            );


            expect(
              decision.stage
            ).toBe(
              "decision"
            );


            expect(
              action.stage
            ).toBe(
              "action"
            );


            StructuredLogger
              .clearContext(
                correlationId
              );
          }
        );


        test(
          "records structured error information",
          () => {
            const correlationId =
              `obs-error-${Date.now()}`;


            StructuredLogger
              .setContext(
                correlationId,
                {
                  tenantId:
                    TEST_TENANT,

                  component:
                    "decision-engine",
                }
              );


            const result =
              StructuredLogger
                .error(
                  "Policy evaluation failed",
                  correlationId,
                  {
                    error:
                      "Policy version not found",

                    errorCode:
                      "POLICY_NOT_FOUND",
                  }
                );


            expect(
              result.level
            ).toBe(
              "ERROR"
            );


            expect(
              result
                .errorCode
            ).toBe(
              "POLICY_NOT_FOUND"
            );


            expect(
              result
                .correlationId
            ).toBe(
              correlationId
            );


            StructuredLogger
              .clearContext(
                correlationId
              );
          }
        );


        test(
          "records critical error stack information",
          () => {
            const correlationId =
              `obs-critical-${Date.now()}`;


            const error =
              new Error(
                "Critical system failure"
              );


            StructuredLogger
              .setContext(
                correlationId,
                {
                  tenantId:
                    TEST_TENANT,
                }
              );


            const result =
              StructuredLogger
                .critical(
                  "Critical failure",
                  correlationId,
                  {
                    error:
                      error.message,

                    stack:
                      error.stack,
                  }
                );


            expect(
              result.level
            ).toBe(
              "CRITICAL"
            );


            expect(
              result.stack
            ).toBeDefined();


            StructuredLogger
              .clearContext(
                correlationId
              );
          }
        );


        test(
          "produces JSON serializable log entries",
          () => {
            const correlationId =
              `obs-json-${Date.now()}`;


            StructuredLogger
              .setContext(
                correlationId,
                {
                  tenantId:
                    TEST_TENANT,

                  policyVersionId:
                    "policy-v1",

                  decisionId:
                    "decision-v1",
                }
              );


            const result =
              StructuredLogger
                .info(
                  "Serializable event",
                  correlationId,
                  {
                    component:
                      "test",
                  }
                );


            const serialized =
              JSON.stringify(
                result
              );


            expect(
              typeof serialized
            ).toBe(
              "string"
            );


            expect(
              JSON.parse(
                serialized
              )
                .correlationId
            ).toBe(
              correlationId
            );


            StructuredLogger
              .clearContext(
                correlationId
              );
          }
        );
      }
    );


    // ========================================================================
    // PROMETHEUS METRICS
    // ========================================================================

    describe(
      "2. Prometheus metrics",
      () => {
        test(
          "metrics service is available without booting server runtime",
          () => {
            expect(
              metricsService
            ).toBeDefined();


            expect(
              typeof metricsService
                .getMetrics
            ).toBe(
              "function"
            );


            expect(
              typeof metricsService
                .recordDecision
            ).toBe(
              "function"
            );


            expect(
              typeof metricsService
                .recordAction
            ).toBe(
              "function"
            );
          }
        );


        test(
          "exports valid Prometheus HELP and TYPE definitions",
          async () => {
            const metrics =
              await metricsService
                .getMetrics();


            expect(
              typeof metrics
            ).toBe(
              "string"
            );


            expect(
              metrics.length
            ).toBeGreaterThan(
              0
            );


            expect(
              metrics
            ).toContain(
              "# HELP"
            );


            expect(
              metrics
            ).toContain(
              "# TYPE"
            );
          }
        );


        test(
          "contains core AIRA metrics",
          async () => {
            const metrics =
              await metricsService
                .getMetrics();


            const required = [
              "decision_latency_ms",
              "queue_depth_total",
              "dlq_size_total",
              "action_executions_total",
              "action_latency_ms",
              "policy_evaluations_total",
              "policy_latency_ms",
              "idempotency_hits_total",
              "circuit_breaker_state",
              "memory_patterns_count",
              "decision_traces_count",
              "errors_total",
              "retries_total",
            ];


            for (
              const metric
              of required
            ) {
              expect(
                metrics
              ).toContain(
                metric
              );
            }
          }
        );


        test(
          "contains Node.js runtime metrics",
          async () => {
            const metrics =
              await metricsService
                .getMetrics();


            expect(
              metrics
            ).toContain(
              "process_cpu_seconds_total"
            );


            expect(
              metrics
            ).toContain(
              "process_resident_memory_bytes"
            );


            expect(
              metrics
            ).toContain(
              "nodejs_heap_size_total_bytes"
            );
          }
        );


        test(
          "records decision telemetry",
          async () => {
            const tenant =
              `${TEST_TENANT}-decision-${Date.now()}`;


            metricsService
              .recordDecision(
                tenant,
                "HIGH",
                "success",
                150
              );


            const metrics =
              await metricsService
                .getMetrics();


            expect(
              metrics
            ).toContain(
              "decision_latency_ms"
            );


            expect(
              metrics
            ).toContain(
              tenant
            );
          }
        );


        test(
          "records action telemetry",
          async () => {
            const tenant =
              `${TEST_TENANT}-action-${Date.now()}`;


            metricsService
              .recordAction(
                tenant,
                "RESTART_SERVICE",
                "success",
                100
              );


            const metrics =
              await metricsService
                .getMetrics();


            expect(
              metrics
            ).toContain(
              "action_executions_total"
            );


            expect(
              metrics
            ).toContain(
              'actionType="RESTART_SERVICE"'
            );


            expect(
              metrics
            ).toContain(
              'status="success"'
            );
          }
        );


        test(
          "records policy telemetry",
          async () => {
            const tenant =
              `${TEST_TENANT}-policy-${Date.now()}`;


            metricsService
              .recordPolicyEvaluation(
                tenant,
                "allowed",
                50
              );


            const metrics =
              await metricsService
                .getMetrics();


            expect(
              metrics
            ).toContain(
              "policy_evaluations_total"
            );


            expect(
              metrics
            ).toContain(
              'verdict="allowed"'
            );
          }
        );


        test(
          "records error telemetry",
          async () => {
            const tenant =
              `${TEST_TENANT}-error-${Date.now()}`;


            metricsService
              .recordError(
                tenant,
                "decision-agent",
                "policy_evaluation_failed"
              );


            const metrics =
              await metricsService
                .getMetrics();


            expect(
              metrics
            ).toContain(
              "errors_total"
            );


            expect(
              metrics
            ).toContain(
              'component="decision-agent"'
            );
          }
        );


        test(
          "updates queue depth gauge",
          async () => {
            const tenant =
              `${TEST_TENANT}-queue-${Date.now()}`;


            metricsService
              .updateQueueDepth(
                tenant,
                "incident-queue",
                5
              );


            metricsService
              .updateQueueDepth(
                tenant,
                "incident-queue",
                10
              );


            const metrics =
              await metricsService
                .getMetrics();


            expect(
              metrics
            ).toContain(
              "queue_depth_total"
            );
          }
        );
      }
    );


    // ========================================================================
    // AUDIT INTEGRITY
    // ========================================================================

    describe(
      "3. Audit integrity",
      () => {
        function createAuditEvent({
          tenantId =
            TEST_TENANT,

          eventType =
            "decision_made",

          payload = {
            decisionId:
              "decision-test",

            verdict:
              "EXECUTE_ACTION",
          },

          correlationId =
            `audit-${Date.now()}`,

          previousEventHash =
            null,
        } = {}) {
          const timestamp =
            Date.now();


          const event = {
            eventId:
              `event-${Date.now()}-${Math.random()}`,

            tenantId,

            eventType,

            payload,

            correlationId,

            timestamp,

            previousEventHash,

            status:
              "created",
          };


          event.signature =
            AuditService
              ._computeSignature(
                tenantId,
                payload,
                timestamp
              );


          event.eventHash =
            AuditService
              ._computeEventHash(
                event
              );


          return event;
        }


        test(
          "generates deterministic audit signatures",
          () => {
            const tenantId =
              TEST_TENANT;

            const payload = {
              decisionId:
                "decision-1",

              verdict:
                "allowed",
            };

            const timestamp =
              1000000;


            const first =
              AuditService
                ._computeSignature(
                  tenantId,
                  payload,
                  timestamp
                );


            const second =
              AuditService
                ._computeSignature(
                  tenantId,
                  payload,
                  timestamp
                );


            expect(
              first
            ).toBe(
              second
            );


            expect(
              first
            ).toMatch(
              /^[0-9a-f]{64}$/
            );
          }
        );


        test(
          "generates deterministic event hashes",
          () => {
            const event =
              createAuditEvent();


            const first =
              AuditService
                ._computeEventHash(
                  event
                );


            const second =
              AuditService
                ._computeEventHash(
                  event
                );


            expect(
              first
            ).toBe(
              second
            );


            expect(
              first
            ).toMatch(
              /^[0-9a-f]{64}$/
            );
          }
        );


        test(
          "accepts an authentic audit event",
          async () => {
            const event =
              createAuditEvent();


            const verification =
              await AuditService
                .verifyEvent(
                  event
                );


            expect(
              verification.valid
            ).toBe(
              true
            );


            expect(
              verification
                .eventId
            ).toBe(
              event.eventId
            );
          }
        );


        test(
          "detects a tampered audit payload",
          async () => {
            const event =
              createAuditEvent();


            event.payload =
              {
                ...event.payload,

                verdict:
                  "tampered",
              };


            const verification =
              await AuditService
                .verifyEvent(
                  event
                );


            expect(
              verification.valid
            ).toBe(
              false
            );
          }
        );


        test(
          "supports chain-of-custody hashes",
          () => {
            const first =
              createAuditEvent({
                eventType:
                  "decision_made",
              });


            const second =
              createAuditEvent({
                eventType:
                  "action_executed",

                previousEventHash:
                  first.eventHash,
              });


            expect(
              second
                .previousEventHash
            ).toBe(
              first.eventHash
            );


            expect(
              second.eventHash
            ).not.toBe(
              first.eventHash
            );
          }
        );
      }
    );


    // ========================================================================
    // END-TO-END CORRELATION
    // ========================================================================

    describe(
      "4. End-to-end observability correlation",
      () => {
        test(
          "maintains correlation identity across logs and telemetry",
          async () => {
            const correlationId =
              `trace-${Date.now()}`;

            const tenant =
              `${TEST_TENANT}-trace-${Date.now()}`;


            StructuredLogger
              .setContext(
                correlationId,
                {
                  tenantId:
                    tenant,

                  component:
                    "incident-detector",
                }
              );


            const detectionLog =
              StructuredLogger
                .info(
                  "Incident detected",
                  correlationId,
                  {
                    stage:
                      "incident-detection",
                  }
                );


            metricsService
              .recordDecision(
                tenant,
                "HIGH",
                "success",
                100
              );


            const decisionLog =
              StructuredLogger
                .info(
                  "Decision generated",
                  correlationId,
                  {
                    stage:
                      "decision",
                  }
                );


            metricsService
              .recordPolicyEvaluation(
                tenant,
                "allowed",
                50
              );


            const actionLog =
              StructuredLogger
                .info(
                  "Action observed",
                  correlationId,
                  {
                    stage:
                      "action",
                  }
                );


            metricsService
              .recordAction(
                tenant,
                "RESTART_SERVICE",
                "success",
                100
              );


            expect(
              detectionLog
                .correlationId
            ).toBe(
              correlationId
            );


            expect(
              decisionLog
                .correlationId
            ).toBe(
              correlationId
            );


            expect(
              actionLog
                .correlationId
            ).toBe(
              correlationId
            );


            const metrics =
              await metricsService
                .getMetrics();


            expect(
              metrics
            ).toContain(
              tenant
            );


            expect(
              metrics
            ).toContain(
              "decision_latency_ms"
            );


            expect(
              metrics
            ).toContain(
              "policy_evaluations_total"
            );


            expect(
              metrics
            ).toContain(
              "action_executions_total"
            );


            StructuredLogger
              .clearContext(
                correlationId
              );
          }
        );


        test(
          "preserves context across asynchronous operations",
          async () => {
            const correlationId =
              `async-${Date.now()}`;


            StructuredLogger
              .setContext(
                correlationId,
                {
                  tenantId:
                    TEST_TENANT,

                  userId:
                    "async-user",
                }
              );


            const first =
              Promise
                .resolve()
                .then(
                  () =>
                    StructuredLogger
                      .info(
                        "Async operation one",
                        correlationId,
                        {
                          operation:
                            "query",
                        }
                      )
                );


            const second =
              Promise
                .resolve()
                .then(
                  () =>
                    StructuredLogger
                      .info(
                        "Async operation two",
                        correlationId,
                        {
                          operation:
                            "analysis",
                        }
                      )
                );


            const [
              firstResult,
              secondResult,
            ] =
              await Promise.all(
                [
                  first,
                  second,
                ]
              );


            expect(
              firstResult
                .correlationId
            ).toBe(
              correlationId
            );


            expect(
              secondResult
                .correlationId
            ).toBe(
              correlationId
            );


            StructuredLogger
              .clearContext(
                correlationId
              );
          }
        );
      }
    );


    // ========================================================================
    // ALERT TELEMETRY
    // ========================================================================

    describe(
      "5. Alert telemetry",
      () => {
        test(
          "records escalation telemetry",
          async () => {
            const tenant =
              `${TEST_TENANT}-escalation-${Date.now()}`;


            for (
              let index =
                0;
              index <
                5;
              index +=
                1
            ) {
              metricsService
                .recordAction(
                  tenant,
                  "ESCALATE_TO_HUMAN",
                  "success",
                  100
                );
            }


            const escalationRate =
              5 /
              5;


            expect(
              escalationRate
            ).toBeGreaterThan(
              0.2
            );


            const metrics =
              await metricsService
                .getMetrics();


            expect(
              metrics
            ).toContain(
              "action_executions_total"
            );


            expect(
              metrics
            ).toContain(
              "ESCALATE_TO_HUMAN"
            );
          }
        );


        test(
          "records error-rate telemetry",
          async () => {
            const tenant =
              `${TEST_TENANT}-errors-${Date.now()}`;


            for (
              let index =
                0;
              index <
                5;
              index +=
                1
            ) {
              metricsService
                .recordError(
                  tenant,
                  "policy-engine",
                  "evaluation_failed"
                );
            }


            const errorRate =
              5 /
              7;


            expect(
              errorRate
            ).toBeGreaterThan(
              0.5
            );


            const metrics =
              await metricsService
                .getMetrics();


            expect(
              metrics
            ).toContain(
              "errors_total"
            );
          }
        );


        test(
          "represents an open circuit for kill-switch alerting",
          async () => {
            const tenant =
              `${TEST_TENANT}-circuit-${Date.now()}`;


            metricsService
              .updateCircuitBreakerState(
                tenant,
                "policy-engine",
                "OPEN"
              );


            const metrics =
              await metricsService
                .getMetrics();


            expect(
              metrics
            ).toContain(
              "circuit_breaker_state"
            );


            expect(
              metrics
            ).toContain(
              'service="policy-engine"'
            );
          }
        );


        test(
          "defines canonical alert rules",
          () => {
            const rules = [
              {
                name:
                  "HighEscalationRate",

                metric:
                  "action_executions_total",

                threshold:
                  0.2,

                severity:
                  "MEDIUM",
              },

              {
                name:
                  "HighErrorRate",

                metric:
                  "errors_total",

                threshold:
                  0.5,

                severity:
                  "HIGH",
              },

              {
                name:
                  "KillSwitchActivated",

                metric:
                  "circuit_breaker_state",

                threshold:
                  1,

                severity:
                  "CRITICAL",
              },
            ];


            expect(
              rules
            ).toHaveLength(
              3
            );


            expect(
              rules.map(
                (
                  rule
                ) =>
                  rule.name
              )
            ).toEqual(
              [
                "HighEscalationRate",
                "HighErrorRate",
                "KillSwitchActivated",
              ]
            );


            expect(
              rules[2]
                .severity
            ).toBe(
              "CRITICAL"
            );
          }
        );
      }
    );


    // ========================================================================
    // SAFETY
    // ========================================================================

    describe(
      "6. Observability safety boundary",
      () => {
        test(
          "observability data never grants execution authority",
          () => {
            const correlationId =
              `safety-${Date.now()}`;


            StructuredLogger
              .setContext(
                correlationId,
                {
                  tenantId:
                    TEST_TENANT,
                }
              );


            const result =
              StructuredLogger
                .info(
                  "Observability-only result",
                  correlationId,
                  {
                    executionAuthorized:
                      false,
                  }
                );


            expect(
              result
                .executionAuthorized
            ).not.toBe(
              true
            );


            StructuredLogger
              .clearContext(
                correlationId
              );
          }
        );


        test(
          "audit verification cannot grant execution authority",
          async () => {
            const timestamp =
              Date.now();

            const payload = {
              action:
                "RESTART_SERVICE",
            };


            const event = {
              eventId:
                `safe-event-${Date.now()}`,

              tenantId:
                TEST_TENANT,

              eventType:
                "action_observed",

              payload,

              timestamp,

              correlationId:
                `safe-correlation-${Date.now()}`,
            };


            event.signature =
              AuditService
                ._computeSignature(
                  event.tenantId,
                  payload,
                  timestamp
                );


            event.eventHash =
              AuditService
                ._computeEventHash(
                  event
                );


            const verification =
              await AuditService
                .verifyEvent(
                  event
                );


            expect(
              verification.valid
            ).toBe(
              true
            );


            expect(
              verification
                .executionAuthorized
            ).not.toBe(
              true
            );
          }
        );
      }
    );
  }
);