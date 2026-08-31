"use strict";


const {
  CORRELATION_HARNESS_VERSION,

  AiraCorrelationHarness,

  assertNoGroundTruth,

  normalizeIngestionResult,
} =
  require(
    "../../services/reliability/airaCorrelationHarness"
  );


const {
  ORCHESTRATOR_VERSION,

  ExperimentOrchestrator,

  publicDefinition,

  findForbiddenGroundTruthField,
} =
  require(
    "../../services/reliability/experimentOrchestrator"
  );


describe(
  "Phase 21.11 + 21.12 Experiment Orchestrator and AIRA Correlation Harness",

  () => {
    test(
      "contracts are versioned",

      () => {
        expect(
          ORCHESTRATOR_VERSION
        )
          .toBe(
            "21.11-v1"
          );


        expect(
          CORRELATION_HARNESS_VERSION
        )
          .toBe(
            "21.12-v1"
          );
      }
    );


    test(
      "ground truth is blocked recursively from AIRA correlation input",

      () => {
        expect(
          () =>
            assertNoGroundTruth({
              payload: {
                groundTruth: {
                  failure:
                    "REDIS_UNAVAILABLE",
                },
              },
            })
        )
          .toThrow(
            "Ground-truth field cannot enter AIRA reasoning path"
          );
      }
    );


    test(
      "observable infrastructure symptoms are allowed",

      () => {
        expect(
          assertNoGroundTruth({
            provider:
              "prometheus",

            eventType:
              "dependency_unreachable",

            severity:
              "critical",

            labels: {
              service:
                "lab-api",
            },

            metrics: {
              errorRate:
                1,
            },
          })
        )
          .toBe(
            true
          );
      }
    );


    test(
      "public experiment definition excludes evaluator ground truth",

      () => {
        const result =
          publicDefinition({
            publicId:
              "expdef-1",

            experimentKey:
              "redis.unavailable",

            version:
              1,

            name:
              "Redis unavailable",

            targetResourceType:
              "redis.instance",

            groundTruth: {
              failureType:
                "REDIS_UNAVAILABLE",
            },

            configuration: {
              timeoutMs:
                1000,
            },
          });


        expect(
          result.groundTruth
        )
          .toBeUndefined();


        expect(
          JSON.stringify(
            result
          )
        )
          .not
          .toContain(
            "REDIS_UNAVAILABLE"
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "forbidden evaluator field can be located",

      () => {
        expect(
          findForbiddenGroundTruthField({
            nested: {
              expectedDiagnosis:
                "POSTGRES_FAILURE",
            },
          })
        )
          .toBe(
            "$.nested.expectedDiagnosis"
          );
      }
    );


    test(
      "canonical ingestion result is normalized without evaluating correctness",

      () => {
        const result =
          normalizeIngestionResult({
            accepted:
              true,

            duplicate:
              false,

            signal: {
              signalId:
                "sig-1",

              incidentCandidate:
                true,

              correlationGroupId:
                "corr-group-1",
            },

            correlation: {
              correlated:
                true,

              correlationGroupId:
                "corr-group-1",
            },

            routing: {
              routed:
                true,

              incidentCandidate:
                true,

              incidentResult: {
                incidentId:
                  "inc-1",
              },
            },
          });


        expect(
          result
        )
          .toEqual({
            accepted:
              true,

            duplicate:
              false,

            signalId:
              "sig-1",

            correlationGroupId:
              "corr-group-1",

            correlationObserved:
              true,

            incidentCandidate:
              true,

            incidentId:
              "inc-1",

            routed:
              true,

            routingReason:
              null,
          });
      }
    );


    test(
      "correlation harness uses canonical ingestion and persists observation",

      async () => {
        const appendObservation =
          jest.fn(
            async (
              input
            ) => ({
              ...input,

              executionAuthorized:
                false,
            })
          );


        const ingest =
          jest.fn(
            async (
              input,
              context
            ) => {
              expect(
                context.organizationId
              )
                .toBe(
                  "org-a"
                );


              expect(
                context.environmentId
              )
                .toBe(
                  "env-a"
                );


              expect(
                context.correlationId
              )
                .toBe(
                  "corr-run-1"
                );


              expect(
                context
                  .reliabilityLab
                  .executionAuthorized
              )
                .toBe(
                  false
                );


              expect(
                JSON.stringify(
                  {
                    input,
                    context,
                  }
                )
              )
                .not
                .toContain(
                  "expectedFailureMode"
                );


              return {
                accepted:
                  true,

                duplicate:
                  false,

                signal: {
                  signalId:
                    "sig-1",

                  incidentCandidate:
                    true,
                },

                correlation: {
                  correlated:
                    true,

                  correlationGroupId:
                    "group-1",
                },

                correlationGroup: {
                  correlationGroupId:
                    "group-1",
                },

                routing: {
                  routed:
                    true,

                  incidentCandidate:
                    true,

                  incidentResult: {
                    incidentId:
                      "inc-1",
                  },
                },
              };
            }
          );


        const harness =
          new AiraCorrelationHarness({
            signalIngestionService: {
              ingest,
            },

            repository: {
              appendObservation,
            },

            now:
              () =>
                new Date(
                  "2026-08-31T12:00:00.000Z"
                ),
          });


        const result =
          await harness.observe({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            tenantId:
              "tenant-a",

            experimentRunId:
              "exprun-1",

            correlationId:
              "corr-run-1",

            observableSignal: {
              provider:
                "prometheus",

              severity:
                "critical",

              eventType:
                "dependency_unreachable",
            },
          });


        expect(
          ingest
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          appendObservation
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          result.incidentId
        )
          .toBe(
            "inc-1"
          );


        expect(
          result.correlationObserved
        )
          .toBe(
            true
          );


        expect(
          result.detectionCorrect
        )
          .toBeNull();


        expect(
          result.diagnosisCorrect
        )
          .toBeNull();


        expect(
          result.groundTruthConsumed
        )
          .toBe(
            false
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "orchestrator runs baseline injection and canonical correlation without exposing ground truth",

      async () => {
        const states = [];


        const repository = {
          getExperimentDefinition:
            jest.fn(
              async () => ({
                publicId:
                  "expdef-1",

                experimentKey:
                  "redis.unavailable",

                version:
                  1,

                name:
                  "Redis unavailable",

                enabled:
                  true,

                targetResourceType:
                  "redis.instance",

                groundTruth: {
                  expectedFailureMode:
                    "REDIS_UNAVAILABLE",
                },

                configuration:
                  {},
              })
            ),


          createExperimentRun:
            jest.fn(
              async (
                input
              ) => ({
                publicId:
                  "exprun-1",

                ...input,

                status:
                  "CREATED",

                executionAuthorized:
                  false,
              })
            ),


          updateExperimentRunState:
            jest.fn(
              async (
                input
              ) => {
                states.push(
                  input.status
                );


                return {
                  ...input,

                  executionAuthorized:
                    false,
                };
              }
            ),


          appendObservation:
            jest.fn(
              async (
                input
              ) => ({
                ...input,

                executionAuthorized:
                  false,
              })
            ),
        };


        const lifecycle = {
          assertRunnable:
            jest.fn(
              async () => ({
                runnable:
                  true,

                environment: {
                  production:
                    false,

                  status:
                    "AVAILABLE",
                },

                executionAuthorized:
                  false,
              })
            ),


          beginExperiment:
            jest.fn(
              async () => ({
                status:
                  "RUNNING_EXPERIMENT",

                executionAuthorized:
                  false,
              })
            ),


          requireEnvironment:
            jest.fn(
              async () => ({
                status:
                  "RUNNING_EXPERIMENT",
              })
            ),


          markDirty:
            jest.fn(),
        };


        const baselineProvider = {
          capture:
            jest.fn(
              async (
                input
              ) => {
                expect(
                  input
                    .evaluatorGroundTruth
                )
                  .toBeUndefined();


                return {
                  healthy:
                    true,

                  readiness:
                    true,

                  executionAuthorized:
                    false,
                };
              }
            ),
        };


        const failureInjector = {
          inject:
            jest.fn(
              async (
                input
              ) => {
                /*
                 * Injector/evaluator boundary IS allowed to know
                 * the injected definition.
                 */
                expect(
                  input
                    .evaluatorGroundTruth
                    .expectedFailureMode
                )
                  .toBe(
                    "REDIS_UNAVAILABLE"
                  );


                return {
                  injectionId:
                    "inj-1",

                  injected:
                    true,

                  injectedAt:
                    "2026-08-31T12:00:01.000Z",

                  observableSignal: {
                    provider:
                      "prometheus",

                    eventType:
                      "dependency_unreachable",

                    severity:
                      "critical",
                  },

                  executionAuthorized:
                    false,
                };
              }
            ),
        };


        const correlationHarness = {
          observe:
            jest.fn(
              async (
                input
              ) => {
                const serialized =
                  JSON.stringify(
                    input
                  );


                expect(
                  serialized
                )
                  .not
                  .toContain(
                    "REDIS_UNAVAILABLE"
                  );


                expect(
                  serialized
                )
                  .not
                  .toContain(
                    "expectedFailureMode"
                  );


                return {
                  incidentId:
                    "inc-1",

                  signalId:
                    "sig-1",

                  correlationGroupId:
                    "group-1",

                  correlationObserved:
                    true,

                  detectionCorrect:
                    null,

                  diagnosisCorrect:
                    null,

                  groundTruthConsumed:
                    false,

                  executionAuthorized:
                    false,
                };
              }
            ),
        };


        const orchestrator =
          new ExperimentOrchestrator({
            repository,

            lifecycle,

            baselineProvider,

            failureInjector,

            correlationHarness,

            now:
              () =>
                new Date(
                  "2026-08-31T12:00:00.000Z"
                ),
          });


        const result =
          await orchestrator
            .runToCorrelation({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              tenantId:
                "tenant-a",

              labEnvironmentId:
                "lab-1",

              experimentKey:
                "redis.unavailable",

              experimentVersion:
                1,
            });


        expect(
          result.status
        )
          .toBe(
            "WAITING_FOR_DIAGNOSIS"
          );


        expect(
          result
            .evaluator
            .groundTruthAvailable
        )
          .toBe(
            true
          );


        expect(
          result
            .evaluator
            .groundTruthPassedToAira
        )
          .toBe(
            false
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          states
        )
          .toEqual(
            expect.arrayContaining([
              "PREPARING",
              "BASELINING",
              "INJECTING",
              "FAILURE_ACTIVE",
              "WAITING_FOR_DETECTION",
              "WAITING_FOR_DIAGNOSIS",
            ])
          );


        expect(
          lifecycle
            .beginExperiment
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          correlationHarness
            .observe
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    test(
      "orchestrator rejects production experiment input",

      async () => {
        const orchestrator =
          new ExperimentOrchestrator({
            repository:
              {},

            lifecycle:
              {},

            baselineProvider: {
              capture:
                jest.fn(),
            },

            failureInjector: {
              inject:
                jest.fn(),
            },

            correlationHarness:
              {},
          });


        await expect(
          orchestrator
            .runToCorrelation({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              tenantId:
                "tenant-a",

              labEnvironmentId:
                "lab-1",

              experimentKey:
                "redis.unavailable",

              production:
                true,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_PRODUCTION_ENVIRONMENT_FORBIDDEN",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "orchestrator rejects execution authorization input",

      async () => {
        const orchestrator =
          new ExperimentOrchestrator({
            repository:
              {},

            lifecycle:
              {},

            baselineProvider: {
              capture:
                jest.fn(),
            },

            failureInjector: {
              inject:
                jest.fn(),
            },

            correlationHarness:
              {},
          });


        await expect(
          orchestrator
            .runToCorrelation({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              tenantId:
                "tenant-a",

              labEnvironmentId:
                "lab-1",

              experimentKey:
                "redis.unavailable",

              executionAuthorized:
                true,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_AUTHORITY_VIOLATION",

            executionAuthorized:
              false,
          });
      }
    );
  }
);