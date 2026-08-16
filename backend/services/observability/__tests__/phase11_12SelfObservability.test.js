"use strict";

const {
  MetricsService,
} =
  require(
    "../../infrastructure/metricsService"
  );

const {
  LoggingService,
  sanitizeContext,
} =
  require(
    "../../infrastructure/loggingService"
  );

const {
  SelfObservabilityCollector,
} =
  require(
    "../selfObservabilityCollector"
  );


describe(
  "Phase 11.12 AIRA Self Observability",
  () => {
    // ========================================================================
    // METRICS
    // ========================================================================

    test(
      "canonical metrics service exposes self-observability status",
      () => {
        const metrics =
          new MetricsService();

        const status =
          metrics
            .getStatus();

        expect(
          status
        )
          .toMatchObject({
            canonical:
              true,

            executionAuthorized:
              false,
          });

        expect(
          status
            .registryMetricCount
        )
          .toBeGreaterThan(
            0
          );
      }
    );


    test(
      "lifecycle state is exported without granting execution authority",
      async () => {
        const metrics =
          new MetricsService();

        metrics
          .updateApplicationLifecycle(
            "READY",
            true
          );

        const output =
          await metrics
            .getMetrics();

        expect(
          output
        )
          .toContain(
            "aira_application_lifecycle_state"
          );

        expect(
          output
        )
          .toContain(
            "aira_application_ready"
          );
      }
    );


    test(
      "worker metrics use bounded worker labels",
      async () => {
        const metrics =
          new MetricsService();

        metrics
          .updateWorkerState(
            "workflow-outbox",
            "ACTIVE"
          );

        const output =
          await metrics
            .getMetrics();

        expect(
          output
        )
          .toContain(
            'worker="workflow-outbox"'
          );
      }
    );


    // ========================================================================
    // LOG REDACTION
    // ========================================================================

    test(
      "structured logger redacts secret material recursively",
      () => {
        const sanitized =
          sanitizeContext({
            tenantId:
              "tenant-a",

            password:
              "secret-password",

            nested: {
              authorization:
                "Bearer abc",

              apiKey:
                "secret-key",

              safe:
                "visible",
            },

            array: [
              {
                token:
                  "secret-token",

                value:
                  123,
              },
            ],
          });


        expect(
          sanitized
        )
          .toEqual({
            tenantId:
              "tenant-a",

            password:
              "[REDACTED]",

            nested: {
              authorization:
                "[REDACTED]",

              apiKey:
                "[REDACTED]",

              safe:
                "visible",
            },

            array: [
              {
                token:
                  "[REDACTED]",

                value:
                  123,
              },
            ],
          });
      }
    );


    test(
      "logging boundary never grants execution authority",
      () => {
        const logger =
          new LoggingService();

        const result =
          logger
            .info(
              "test message",
              {
                component:
                  "phase11-test",
              }
            );

        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // COLLECTOR
    // ========================================================================

    test(
      "collector publishes lifecycle and worker state",
      async () => {
        const metrics = {
          updateApplicationLifecycle:
            jest.fn(),

          startupRecoveryRecords: {
            set:
              jest.fn(),
          },

          updateWorkerState:
            jest.fn(),

          updateDependencyState:
            jest.fn(),

          updateQueueLoad:
            jest.fn(),

          recordQueueBackpressure:
            jest.fn(),

          recordRetentionRun:
            jest.fn(),

          recordSelfError:
            jest.fn(),
        };


        const collector =
          new SelfObservabilityCollector({
            metrics,

            dependencies: {
              getAllStatuses:
                () => ({
                  rabbitmq: {
                    state:
                      "HEALTHY",
                  },
                }),
            },

            retention: {
              getStatus:
                () => ({
                  lastRun:
                    null,
                }),
            },
          });


        const result =
          await collector
            .collect({
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
                  3,

                recovered:
                  3,

                failed:
                  0,
              },

              queue: {
                connected:
                  true,

                getLoadStatus:
                  () => ({
                    connected:
                      true,

                    saturated:
                      false,

                    inFlightPublishes:
                      2,

                    backpressureEvents:
                      0,
                  }),
              },

              workers: {
                workflowOutbox: {
                  running:
                    true,
                },
              },
            });


        expect(
          result
        )
          .toMatchObject({
            collected:
              true,

            executionAuthorized:
              false,
          });


        expect(
          metrics
            .updateApplicationLifecycle
        )
          .toHaveBeenCalledWith(
            "READY",
            true
          );


        expect(
          metrics
            .updateWorkerState
        )
          .toHaveBeenCalled();
      }
    );


    test(
      "collector records queue backpressure only as delta",
      async () => {
        const metrics = {
          updateApplicationLifecycle:
            jest.fn(),

          startupRecoveryRecords: {
            set:
              jest.fn(),
          },

          updateWorkerState:
            jest.fn(),

          updateDependencyState:
            jest.fn(),

          updateQueueLoad:
            jest.fn(),

          recordQueueBackpressure:
            jest.fn(),

          recordRetentionRun:
            jest.fn(),

          recordSelfError:
            jest.fn(),
        };


        const collector =
          new SelfObservabilityCollector({
            metrics,

            dependencies: {
              getAllStatuses:
                () => ({}),
            },

            retention: {
              getStatus:
                () => ({
                  lastRun:
                    null,
                }),
            },
          });


        const queue = {
          connected:
            true,

          getLoadStatus:
            jest.fn()
              .mockReturnValueOnce({
                connected:
                  true,

                backpressureEvents:
                  4,
              })
              .mockReturnValueOnce({
                connected:
                  true,

                backpressureEvents:
                  7,
              }),
        };


        await collector
          .collect({
            queue,
          });


        await collector
          .collect({
            queue,
          });


        expect(
          metrics
            .recordQueueBackpressure
        )
          .toHaveBeenNthCalledWith(
            1,
            4
          );


        expect(
          metrics
            .recordQueueBackpressure
        )
          .toHaveBeenNthCalledWith(
            2,
            3
          );
      }
    );


    test(
      "collector converts dependency states into canonical metrics",
      async () => {
        const metrics = {
          updateApplicationLifecycle:
            jest.fn(),

          startupRecoveryRecords: {
            set:
              jest.fn(),
          },

          updateWorkerState:
            jest.fn(),

          updateDependencyState:
            jest.fn(),

          updateQueueLoad:
            jest.fn(),

          recordQueueBackpressure:
            jest.fn(),

          recordRetentionRun:
            jest.fn(),

          recordSelfError:
            jest.fn(),
        };


        const collector =
          new SelfObservabilityCollector({
            metrics,

            dependencies: {
              getAllStatuses:
                () => ({
                  rabbitmq: {
                    circuit: {
                      state:
                        "OPEN",
                    },
                  },

                  kubernetes: {
                    circuit: {
                      state:
                        "CLOSED",
                    },
                  },
                }),
            },

            retention: {
              getStatus:
                () => ({
                  lastRun:
                    null,
                }),
            },
          });


        await collector
          .collect();


        expect(
          metrics
            .updateDependencyState
        )
          .toHaveBeenCalledWith(
            "rabbitmq",
            "OPEN"
          );


        expect(
          metrics
            .updateDependencyState
        )
          .toHaveBeenCalledWith(
            "kubernetes",
            "CLOSED"
          );
      }
    );


    test(
      "collector records a completed retention run only once",
      async () => {
        const metrics = {
          updateApplicationLifecycle:
            jest.fn(),

          startupRecoveryRecords: {
            set:
              jest.fn(),
          },

          updateWorkerState:
            jest.fn(),

          updateDependencyState:
            jest.fn(),

          updateQueueLoad:
            jest.fn(),

          recordQueueBackpressure:
            jest.fn(),

          recordRetentionRun:
            jest.fn(),

          recordSelfError:
            jest.fn(),
        };


        const completedAt =
          new Date(
            "2026-08-17T00:00:00.000Z"
          );


        const collector =
          new SelfObservabilityCollector({
            metrics,

            dependencies: {
              getAllStatuses:
                () => ({}),
            },

            retention: {
              getStatus:
                () => ({
                  lastRun: {
                    completedAt,

                    durationMs:
                      125,

                    dryRun:
                      false,

                    archived:
                      20,

                    deleted:
                      20,

                    lastError:
                      null,
                  },
                }),
            },
          });


        await collector
          .collect();


        await collector
          .collect();


        expect(
          metrics
            .recordRetentionRun
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          metrics
            .recordRetentionRun
        )
          .toHaveBeenCalledWith({
            status:
              "success",

            dryRun:
              false,

            durationMs:
              125,

            archived:
              20,

            deleted:
              20,
          });
      }
    );


    test(
      "collector failure is contained and never grants authority",
      async () => {
        const metrics = {
          recordSelfError:
            jest.fn(),
        };


        const collector =
          new SelfObservabilityCollector({
            metrics,

            dependencies: {
              getAllStatuses() {
                throw Object.assign(
                  new Error(
                    "dependency status unavailable"
                  ),
                  {
                    code:
                      "STATUS_FAILED",
                  }
                );
              },
            },

            retention:
              null,
          });


        const result =
          await collector
            .collect();


        expect(
          result
        )
          .toMatchObject({
            collected:
              false,

            code:
              "STATUS_FAILED",

            executionAuthorized:
              false,
          });


        expect(
          metrics
            .recordSelfError
        )
          .toHaveBeenCalledWith(
            "self-observability",
            "STATUS_FAILED"
          );
      }
    );


    // ========================================================================
    // SAFETY
    // ========================================================================

    test(
      "self-observability status never grants execution authority",
      () => {
        const collector =
          new SelfObservabilityCollector({
            metrics: {},

            dependencies:
              null,

            retention:
              null,
          });


        expect(
          collector
            .getStatus()
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);