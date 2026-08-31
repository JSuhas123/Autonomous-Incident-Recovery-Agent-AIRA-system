"use strict";

const {
  LAB_ENVIRONMENT_KIND,
} =
  require(
    "../../constants/reliabilityLab"
  );


const {
  OBSERVABILITY_BASELINE_VERSION,

  BASELINE_MEASUREMENT_STATUS,

  BASELINE_SIGNAL,

  ObservabilityBaselineService,
} =
  require(
    "../../services/reliability/observabilityBaselineService"
  );


const {
  FAILURE_SCENARIO_REGISTRY_VERSION,

  FailureScenarioRegistry,
} =
  require(
    "../../services/reliability/failureScenarioRegistry"
  );


function observed(
  value,
  unit =
    null
) {
  return {
    status:
      BASELINE_MEASUREMENT_STATUS
        .OBSERVED,

    value,

    unit,

    source:
      "unit-test",
  };
}


function buildHealthyMeasurements() {
  return {
    [BASELINE_SIGNAL.CPU]:
      observed(
        0.2,
        "cores"
      ),

    [BASELINE_SIGNAL.MEMORY]:
      observed(
        1000000,
        "bytes"
      ),

    [BASELINE_SIGNAL.LATENCY]:
      observed(
        5,
        "ms_p95"
      ),

    [BASELINE_SIGNAL.ERROR_RATE]:
      observed(
        0,
        "ratio"
      ),

    [BASELINE_SIGNAL.POD_STATE]:
      observed(
        true,
        "boolean"
      ),

    [BASELINE_SIGNAL.RESTART_COUNT]:
      observed(
        0,
        "count"
      ),

    [BASELINE_SIGNAL.DB_CONNECTIONS]:
      observed(
        3,
        "count"
      ),

    [BASELINE_SIGNAL.QUEUE_DEPTH]:
      observed(
        0,
        "messages"
      ),

    [BASELINE_SIGNAL.DEPENDENCY_HEALTH]:
      observed(
        true,
        "boolean"
      ),

    [BASELINE_SIGNAL.HEALTH]:
      observed(
        true,
        "boolean"
      ),

    [BASELINE_SIGNAL.READINESS]:
      observed(
        true,
        "boolean"
      ),
  };
}


describe(
  "Phase 21.7 Observability baseline",
  () => {
    test(
      "builds a complete non-authorizing healthy baseline",
      () => {
        const service =
          new ObservabilityBaselineService({
            now:
              () =>
                new Date(
                  "2026-08-31T00:00:00.000Z"
                ),
          });


        const baseline =
          service.buildBaseline({
            labEnvironmentId:
              "lab_kind_primary",

            labKind:
              LAB_ENVIRONMENT_KIND
                .KIND,

            measurements:
              buildHealthyMeasurements(),

            sourceReferences: [
              {
                type:
                  "PROMETHEUS",

                ref:
                  "http://localhost:19090",
              },
            ],
          });


        expect(
          baseline
            .baselineVersion
        ).toBe(
          OBSERVABILITY_BASELINE_VERSION
        );


        expect(
          baseline.healthy
        ).toBe(
          true
        );


        expect(
          baseline
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          baseline
            .bulkTelemetryStored
        ).toBe(
          false
        );


        expect(
          baseline
            .measurements
            .CPU
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "Docker treats Kubernetes-only measurements as not applicable",
      () => {
        const service =
          new ObservabilityBaselineService();


        const measurements =
          buildHealthyMeasurements();


        delete measurements
          .POD_STATE;


        delete measurements
          .RESTART_COUNT;


        const baseline =
          service.buildBaseline({
            labEnvironmentId:
              "lab_docker_primary",

            labKind:
              LAB_ENVIRONMENT_KIND
                .DOCKER,

            measurements,
          });


        expect(
          baseline
            .measurements
            .POD_STATE
            .status
        ).toBe(
          BASELINE_MEASUREMENT_STATUS
            .NOT_APPLICABLE
        );


        expect(
          baseline
            .measurements
            .RESTART_COUNT
            .status
        ).toBe(
          BASELINE_MEASUREMENT_STATUS
            .NOT_APPLICABLE
        );


        expect(
          baseline.healthy
        ).toBe(
          true
        );
      }
    );


    test(
      "missing required observable measurement makes baseline unhealthy",
      () => {
        const service =
          new ObservabilityBaselineService();


        const measurements =
          buildHealthyMeasurements();


        delete measurements
          .MEMORY;


        const baseline =
          service.buildBaseline({
            labEnvironmentId:
              "lab_kind_primary",

            labKind:
              LAB_ENVIRONMENT_KIND
                .KIND,

            measurements,
          });


        expect(
          baseline.healthy
        ).toBe(
          false
        );


        expect(
          baseline
            .healthReasons
        ).toContain(
          "MEMORY_UNAVAILABLE"
        );
      }
    );


    test(
      "unhealthy dependency prevents healthy baseline",
      () => {
        const service =
          new ObservabilityBaselineService();


        const measurements =
          buildHealthyMeasurements();


        measurements
          .DEPENDENCY_HEALTH =
          observed(
            false,
            "boolean"
          );


        const baseline =
          service.buildBaseline({
            labEnvironmentId:
              "lab_kind_primary",

            labKind:
              LAB_ENVIRONMENT_KIND
                .KIND,

            measurements,
          });


        expect(
          baseline.healthy
        ).toBe(
          false
        );


        expect(
          baseline
            .healthReasons
        ).toContain(
          "DEPENDENCY_HEALTH_NOT_HEALTHY"
        );
      }
    );
  }
);


describe(
  "Phase 21.8 Failure Scenario Registry",
  () => {
    test(
      "loads the data-driven certification scenario registry",
      () => {
        const registry =
          new FailureScenarioRegistry();


        const scenarios =
          registry.list();


        expect(
          FAILURE_SCENARIO_REGISTRY_VERSION
        ).toBe(
          "21.8-v1"
        );


        expect(
          scenarios.length
        ).toBeGreaterThanOrEqual(
          12
        );


        expect(
          scenarios.some(
            (
              scenario
            ) =>
              scenario.failureKey ===
              "kubernetes.pod.crash"
          )
        ).toBe(
          true
        );


        expect(
          scenarios.some(
            (
              scenario
            ) =>
              scenario.failureKey ===
              "postgres.unavailable"
          )
        ).toBe(
          true
        );


        expect(
          scenarios.some(
            (
              scenario
            ) =>
              scenario.failureKey ===
              "dns.failure"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "ordinary scenario descriptor never exposes evaluator ground truth or injector",
      () => {
        const registry =
          new FailureScenarioRegistry();


        const scenario =
          registry.requireScenario(
            "kubernetes.pod.crash",
            1
          );


        expect(
          scenario.groundTruth
        ).toBeUndefined();


        expect(
          scenario.injector
        ).toBeUndefined();


        expect(
          scenario
            .evaluatorGroundTruthIncluded
        ).toBe(
          false
        );


        expect(
          scenario
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "evaluator can explicitly obtain ground truth without granting authorization",
      () => {
        const registry =
          new FailureScenarioRegistry();


        const scenario =
          registry.getEvaluatorScenario(
            "kubernetes.pod.crash",
            1
          );


        expect(
          scenario.groundTruth
        ).toEqual(
          expect.objectContaining({
            expectedFailureModeKey:
              "kubernetes.pod.crash",
          })
        );


        expect(
          scenario.injector
        ).toBe(
          "KUBERNETES_POD_TERMINATION"
        );


        expect(
          scenario.visibility
        ).toBe(
          "EVALUATOR_ONLY"
        );


        expect(
          scenario
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "Docker cannot run Kubernetes-only pod crash scenario",
      () => {
        const registry =
          new FailureScenarioRegistry();


        expect(
          () =>
            registry
              .assertSupportedByLab({
                failureKey:
                  "kubernetes.pod.crash",

                version:
                  1,

                labKind:
                  LAB_ENVIRONMENT_KIND
                    .DOCKER,
              })
        ).toThrow(
          expect.objectContaining({
            code:
              "FAILURE_SCENARIO_LAB_KIND_UNSUPPORTED",
          })
        );
      }
    );


    test(
      "kind supports Kubernetes pod crash scenario",
      () => {
        const registry =
          new FailureScenarioRegistry();


        expect(
          registry
            .assertSupportedByLab({
              failureKey:
                "kubernetes.pod.crash",

              version:
                1,

              labKind:
                LAB_ENVIRONMENT_KIND
                  .KIND,
            })
        ).toEqual(
          expect.objectContaining({
            supported:
              true,

            executionAuthorized:
              false,
          })
        );
      }
    );
  }
);