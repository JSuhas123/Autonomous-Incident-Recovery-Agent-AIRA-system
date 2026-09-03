"use strict";


const {
  EXECUTABLE_WORKLOAD_CAPTURE_VERSION,

  WORKLOADS,

  stableHash,

  normalizeDockerComposePs,

  assertLabSafety,

  buildReliabilityLabCapture,

  buildAstronomyShopCapture,

  buildWorkloadManifest,
} =
  require(
    "../../services/reality/realityExecutableWorkloadCaptureService"
  );


function namespaceFixture() {
  return {
    metadata: {
      name:
        "aira-reliability-lab",

      labels: {
        "aira.reliability-lab":
          "true",

        "aira.phase":
          "21",

        "aira.safety-class":
          "LAB_ONLY",
      },
    },
  };
}


describe(
  "Phase 23R.13S.4 real executable workload capture",

  () => {
    test(
      "freezes capture contract version",

      () => {
        expect(
          EXECUTABLE_WORKLOAD_CAPTURE_VERSION
        ).toBe(
          "23R.13S.4.0"
        );
      }
    );


    test(
      "keeps both workload definitions non-production",

      () => {
        expect(
          WORKLOADS
            .AIRA_RELIABILITY_LAB
            .production
        ).toBe(
          false
        );


        expect(
          WORKLOADS
            .OTEL_ASTRONOMY_SHOP
            .production
        ).toBe(
          false
        );
      }
    );


    test(
      "accepts LAB_ONLY namespace",

      () => {
        expect(
          assertLabSafety({
            namespace:
              "aira-reliability-lab",

            namespaceObject:
              namespaceFixture(),
          })
        ).toBe(
          true
        );
      }
    );


    test(
      "rejects namespace escape",

      () => {
        expect(
          () =>
            assertLabSafety({
              namespace:
                "production",

              namespaceObject:
                namespaceFixture(),
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_WORKLOAD_LAB_NAMESPACE_VIOLATION",
          })
        );
      }
    );


    test(
      "rejects missing reliability-lab safety label",

      () => {
        expect(
          () =>
            assertLabSafety({
              namespace:
                "aira-reliability-lab",

              namespaceObject: {
                metadata: {
                  labels:
                    {},
                },
              },
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_WORKLOAD_LAB_LABEL_MISSING",
          })
        );
      }
    );


    test(
      "normalizes array-form Docker Compose output",

      () => {
        const output =
          JSON.stringify([
            {
              Name:
                "frontend",

              State:
                "running",
            },
          ]);


        expect(
          normalizeDockerComposePs(
            output
          )
        ).toEqual([
          {
            Name:
              "frontend",

            State:
              "running",
          },
        ]);
      }
    );


    test(
      "normalizes line-delimited Docker Compose output",

      () => {
        const output = [
          JSON.stringify({
            Name:
              "frontend",

            State:
              "running",
          }),

          JSON.stringify({
            Name:
              "checkout",

            State:
              "running",
          }),
        ].join(
          "\n"
        );


        expect(
          normalizeDockerComposePs(
            output
          )
        ).toHaveLength(
          2
        );
      }
    );


    test(
      "builds deterministic Reliability Lab capture",

      () => {
        const input = {
          context:
            "kind-aira-reliability-lab",

          namespace:
            "aira-reliability-lab",

          namespaceObject:
            namespaceFixture(),

          deployments: {
            items:
              [],
          },

          pods: {
            items:
              [],
          },

          services: {
            items:
              [],
          },

          events: {
            items:
              [],
          },

          capturedAt:
            "2026-09-03T00:00:00.000Z",
        };


        const first =
          buildReliabilityLabCapture(
            input
          );


        const second =
          buildReliabilityLabCapture(
            input
          );


        expect(
          first.captureHash
        ).toBe(
          second.captureHash
        );


        expect(
          first.evidenceGrade
        ).toBe(
          "E1"
        );


        expect(
          first.safetyClass
        ).toBe(
          "LAB_ONLY"
        );
      }
    );


    test(
      "rejects empty Astronomy Shop workload",

      () => {
        expect(
          () =>
            buildAstronomyShopCapture({
              sourceDirectory:
                "fixture",

              containers:
                [],

              capturedAt:
                "2026-09-03T00:00:00.000Z",
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "REALITY_OTEL_WORKLOAD_NOT_RUNNING",
          })
        );
      }
    );


    test(
      "builds real Astronomy Shop capture contract",

      () => {
        const capture =
          buildAstronomyShopCapture({
            sourceDirectory:
              "C:\\fixture",

            containers: [
              {
                Name:
                  "frontend",

                State:
                  "running",
              },

              {
                Name:
                  "checkout",

                State:
                  "running",
              },
            ],

            capturedAt:
              "2026-09-03T00:00:00.000Z",
          });


        expect(
          capture.sourceId
        ).toBe(
          "OTEL_ASTRONOMY_SHOP"
        );


        expect(
          capture.evidenceGrade
        ).toBe(
          "E1"
        );


        expect(
          capture.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "manifest binds both independent workload captures",

      () => {
        const lab =
          buildReliabilityLabCapture({
            context:
              "kind-aira-reliability-lab",

            namespace:
              "aira-reliability-lab",

            namespaceObject:
              namespaceFixture(),

            deployments: {
              items:
                [],
            },

            pods: {
              items:
                [],
            },

            services: {
              items:
                [],
            },

            events: {
              items:
                [],
            },

            capturedAt:
              "2026-09-03T00:00:00.000Z",
          });


        const otel =
          buildAstronomyShopCapture({
            sourceDirectory:
              "fixture",

            containers: [
              {
                Name:
                  "frontend",

                State:
                  "running",
              },
            ],

            capturedAt:
              "2026-09-03T00:00:00.000Z",
          });


        const manifest =
          buildWorkloadManifest({
            reliabilityLab:
              lab,

            astronomyShop:
              otel,
          });


        expect(
          manifest.captureCount
        ).toBe(
          2
        );


        expect(
          manifest.workloads
        ).toHaveLength(
          2
        );


        expect(
          manifest.executionAuthorized
        ).toBe(
          false
        );


        expect(
          manifest.productionCertified
        ).toBe(
          false
        );
      }
    );


    test(
      "stable hash is deterministic",

      () => {
        expect(
          stableHash({
            b:
              2,

            a:
              1,
          })
        ).toBe(
          stableHash({
            a:
              1,

            b:
              2,
          })
        );
      }
    );


    test(
      "capture contracts never expose ground truth or authority",

      () => {
        const lab =
          buildReliabilityLabCapture({
            context:
              "kind-aira-reliability-lab",

            namespace:
              "aira-reliability-lab",

            namespaceObject:
              namespaceFixture(),

            deployments: {
              items:
                [],
            },

            pods: {
              items:
                [],
            },

            services: {
              items:
                [],
            },

            events: {
              items:
                [],
            },

            capturedAt:
              "2026-09-03T00:00:00.000Z",
          });


        expect(
          lab.groundTruthAgentVisible
        ).toBe(
          false
        );


        expect(
          lab.executionAuthorized
        ).toBe(
          false
        );


        expect(
          lab.productionCertified
        ).toBe(
          false
        );
      }
    );
  }
);