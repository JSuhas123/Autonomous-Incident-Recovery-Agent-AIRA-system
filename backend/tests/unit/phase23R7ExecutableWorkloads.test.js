"use strict";

const {
  REALITY_EXECUTABLE_WORKLOAD_VERSION,

  CANONICAL_RELIABILITY_NAMESPACE,

  EXECUTABLE_WORKLOADS,

  getExecutableWorkload,

  buildExecutableWorkloadPlan,
} =
  require(
    "../../services/reality/realityExecutableWorkloadRegistry"
  );

describe(
  "AIRA Phase 23R.7 — executable realistic workloads",
  () => {
    test(
      "freezes the 23R.7 workload contract",
      () => {
        expect(
          REALITY_EXECUTABLE_WORKLOAD_VERSION
        ).toBe(
          "23R.7.0"
        );

        expect(
          CANONICAL_RELIABILITY_NAMESPACE
        ).toBe(
          "aira-reliability-lab"
        );
      }
    );

    test(
      "catalogues realistic failure dynamics",
      () => {
        const workload =
          getExecutableWorkload(
            "AIRA_MICROSERVICES_LAB_V1"
          );

        expect(
          workload.dynamics
        ).toEqual(
          expect.arrayContaining([
            "DEPENDENCY_DEGRADATION",
            "LATENCY_PROPAGATION",
            "RETRY_AMPLIFICATION",
            "QUEUE_BUILDUP",
            "DATABASE_BOTTLENECK",
            "CASCADING_FAILURE",
          ])
        );

        expect(
          workload.evidenceGrade
        ).toBe(
          "E1"
        );
      }
    );

    test(
      "builds LAB_ONLY non-authorizing execution plan",
      () => {
        const plan =
          buildExecutableWorkloadPlan({
            workloadId:
              "AIRA_MICROSERVICES_LAB_V1",

            failureFamily:
              "DEPENDENCY_LATENCY",
          });

        expect(
          plan.namespace
        ).toBe(
          "aira-reliability-lab"
        );

        expect(
          plan.targetLabels
        ).toEqual({
          "aira.reliability-lab":
            "true",

          "aira.safety-class":
            "LAB_ONLY",
        });

        expect(
          plan.mutationOwner
        ).toBe(
          "PHASE_21_FAILURE_INJECTION_ENGINE"
        );

        expect(
          plan.executionAuthorized
        ).toBe(
          false
        );

        expect(
          plan.production
        ).toBe(
          false
        );
      }
    );

    test(
      "rejects non-lab namespace",
      () => {
        expect(
          () =>
            buildExecutableWorkloadPlan({
              workloadId:
                "AIRA_MICROSERVICES_LAB_V1",

              failureFamily:
                "POD_CRASH",

              namespace:
                "production",
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_EXECUTABLE_WORKLOAD_NAMESPACE_FORBIDDEN",
          })
        );
      }
    );

    test(
      "rejects authority injection",
      () => {
        expect(
          () =>
            buildExecutableWorkloadPlan({
              workloadId:
                "AIRA_MICROSERVICES_LAB_V1",

              failureFamily:
                "POD_CRASH",

              executionAuthorized:
                true,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_EXECUTABLE_WORKLOAD_AUTHORITY_FORBIDDEN",

            executionAuthorized:
              false,
          })
        );
      }
    );

    test(
      "rejects unsupported failure family",
      () => {
        expect(
          () =>
            buildExecutableWorkloadPlan({
              workloadId:
                "AIRA_MICROSERVICES_LAB_V1",

              failureFamily:
                "DELETE_CLUSTER",
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_EXECUTABLE_WORKLOAD_FAILURE_UNSUPPORTED",
          })
        );
      }
    );

    test(
      "registry itself carries no execution authority",
      () => {
        for (
          const workload
          of Object.values(
            EXECUTABLE_WORKLOADS
          )
        ) {
          expect(
            workload.executionAuthorized
          ).toBe(
            false
          );

          expect(
            workload.production
          ).toBe(
            false
          );

          expect(
            workload.safetyClass
          ).toBe(
            "LAB_ONLY"
          );
        }
      }
    );
  }
);