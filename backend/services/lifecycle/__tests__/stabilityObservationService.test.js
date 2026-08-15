"use strict";

const {
  StabilityObservationService,
} =
  require(
    "../stabilityObservationService"
  );

const {
  STABILITY_RESULT,
} =
  require(
    "../incidentLifecycleContracts"
  );

function baseInput(
  overrides = {}
) {
  const startedAt =
    new Date(
      "2026-01-01T00:00:00.000Z"
    );

  const now =
    new Date(
      "2026-01-01T00:06:00.000Z"
    );

  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    startedAt,

    now,

    windowMs:
      300000,

    minimumSamples:
      3,

    maximumFailureRatio:
      0,

    samples: [
      {
        healthy:
          true,

        healthScore:
          1,
      },

      {
        healthy:
          true,

        healthScore:
          0.95,
      },

      {
        healthy:
          true,

        healthScore:
          0.9,
      },
    ],

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "StabilityObservationService",
  () => {
    test(
      "declares recovery stable after full healthy observation window",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput()
          );

        expect(
          result.result
        )
          .toBe(
            STABILITY_RESULT
              .STABLE
          );

        expect(
          result.completed
        )
          .toBe(
            true
          );

        expect(
          result.stable
        )
          .toBe(
            true
          );
      }
    );

    test(
      "remains inconclusive while window is still active",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput({
              now:
                new Date(
                  "2026-01-01T00:02:00.000Z"
                ),
            })
          );

        expect(
          result.result
        )
          .toBe(
            STABILITY_RESULT
              .INCONCLUSIVE
          );

        expect(
          result.completed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "insufficient samples remain inconclusive before window expiry",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput({
              now:
                new Date(
                  "2026-01-01T00:02:00.000Z"
                ),

              samples: [
                {
                  healthy:
                    true,
                },
              ],
            })
          );

        expect(
          result.result
        )
          .toBe(
            STABILITY_RESULT
              .INCONCLUSIVE
          );
      }
    );

    test(
      "window expires when insufficient samples were collected",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput({
              samples: [
                {
                  healthy:
                    true,
                },
              ],
            })
          );

        expect(
          result.result
        )
          .toBe(
            STABILITY_RESULT
              .EXPIRED
          );

        expect(
          result.completed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "single unhealthy sample fails zero-tolerance observation",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput({
              samples: [
                {
                  healthy:
                    true,
                },

                {
                  healthy:
                    false,
                },

                {
                  healthy:
                    true,
                },
              ],
            })
          );

        expect(
          result.result
        )
          .toBe(
            STABILITY_RESULT
              .UNSTABLE
          );
      }
    );

    test(
      "configured failure ratio may tolerate limited failure",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput({
              maximumFailureRatio:
                0.4,

              samples: [
                {
                  healthy:
                    true,
                },

                {
                  healthy:
                    false,
                },

                {
                  healthy:
                    true,
                },
              ],
            })
          );

        expect(
          result.result
        )
          .toBe(
            STABILITY_RESULT
              .STABLE
          );
      }
    );

    test(
      "failure ratio above threshold is unstable",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput({
              maximumFailureRatio:
                0.2,

              samples: [
                {
                  healthy:
                    true,
                },

                {
                  healthy:
                    false,
                },

                {
                  healthy:
                    true,
                },
              ],
            })
          );

        expect(
          result.result
        )
          .toBe(
            STABILITY_RESULT
              .UNSTABLE
          );
      }
    );

    test(
      "explicit regression immediately marks observation unstable",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput({
              samples: [
                {
                  healthy:
                    true,
                },

                {
                  healthy:
                    true,

                  regressionDetected:
                    true,
                },

                {
                  healthy:
                    true,
                },
              ],
            })
          );

        expect(
          result.result
        )
          .toBe(
            STABILITY_RESULT
              .UNSTABLE
          );
      }
    );

    test(
      "invalid samples are counted as inconclusive",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput({
              samples: [
                {
                  healthy:
                    true,
                },

                {
                  value:
                    "unknown",
                },

                {
                  healthy:
                    true,
                },
              ],
            })
          );

        expect(
          result.inconclusiveCount
        )
          .toBe(
            1
          );

        expect(
          result.result
        )
          .toBe(
            STABILITY_RESULT
              .EXPIRED
          );
      }
    );

    test(
      "calculates failure ratio",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput({
              maximumFailureRatio:
                1,

              samples: [
                {
                  healthy:
                    true,
                },

                {
                  healthy:
                    false,
                },

                {
                  healthy:
                    true,
                },

                {
                  healthy:
                    false,
                },
              ],
            })
          );

        expect(
          result.failureRatio
        )
          .toBe(
            0.5
          );
      }
    );

    test(
      "never closes incident or starts recovery actions",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput()
          );

        expect(
          result.incidentClosed
        )
          .toBe(
            false
          );

        expect(
          result.rollbackStarted
        )
          .toBe(
            false
          );

        expect(
          result.retryStarted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "never authorizes execution",
      () => {
        const service =
          new StabilityObservationService();

        const result =
          service.evaluate(
            baseInput()
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
      "rejects unsafe execution authorization input",
      () => {
        const service =
          new StabilityObservationService();

        expect(
          () =>
            service.evaluate(
              baseInput({
                executionAuthorized:
                  true,
              })
            )
        )
          .toThrow(
            "cannot authorize execution"
          );
      }
    );
  }
);