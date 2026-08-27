"use strict";


const {
  BehaviouralMemoryBuilder,
} =
  require(
    "../../services/memory/behavioural/behaviouralMemoryBuilder"
  );


const {
  BehaviouralMemoryService,
} =
  require(
    "../../services/memory/behavioural/behaviouralMemoryService"
  );


function observation({
  id,

  value,

  healthState =
    "HEALTHY",

  incidentActive =
    false,

  degraded =
    false,

  baselineEligible =
    true,

  qualityScore =
    1,
}) {
  return {
    observationId:
      `obs-${id}`,

    sourceId:
      `obs-${id}`,

    value,

    healthState,

    incidentActive,

    degraded,

    baselineEligible,

    qualityScore,

    observedAt:
      new Date(),
  };
}


describe(
  "Phase 16.13 behavioural memory and baselines",
  () => {

    test(
      "insufficient healthy observations cannot form baseline",
      () => {
        const builder =
          new BehaviouralMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            serviceId:
              "api",

            metricName:
              "cpu_percent",

            observations: [
              observation({
                id:
                  1,

                value:
                  40,
              }),

              observation({
                id:
                  2,

                value:
                  42,
              }),
            ],

            minimumSamples:
              3,
          });


        expect(
          result.eligible
        ).toBe(
          false
        );


        expect(
          result.reason
        ).toBe(
          "INSUFFICIENT_HEALTHY_OBSERVATIONS"
        );
      }
    );


    test(
      "healthy observations create BEHAVIOURAL service baseline",
      () => {
        const builder =
          new BehaviouralMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            serviceId:
              "api",

            metricName:
              "cpu_percent",

            metricUnit:
              "%",

            observations: [
              observation({
                id:
                  1,

                value:
                  40,
              }),

              observation({
                id:
                  2,

                value:
                  45,
              }),

              observation({
                id:
                  3,

                value:
                  50,
              }),
            ],

            minimumSamples:
              3,
          });


        expect(
          result.eligible
        ).toBe(
          true
        );


        expect(
          result.memory.memoryType
        ).toBe(
          "BEHAVIOURAL"
        );


        expect(
          result.memory.scopeType
        ).toBe(
          "SERVICE"
        );


        expect(
          result.memory
            .content
            .baseline
            .mean
        ).toBe(
          45
        );
      }
    );


    test(
      "incident observations are excluded from normal baseline",
      () => {
        const builder =
          new BehaviouralMemoryBuilder();


        const statistics =
          builder
            .calculateStatistics([
              observation({
                id:
                  1,

                value:
                  40,
              }),

              observation({
                id:
                  2,

                value:
                  42,
              }),

              observation({
                id:
                  3,

                value:
                  99,

                healthState:
                  "INCIDENT",

                incidentActive:
                  true,
              }),
            ]);


        expect(
          statistics.eligible
        ).toBe(
          2
        );


        expect(
          statistics.rejected
        ).toBe(
          1
        );


        expect(
          statistics.mean
        ).toBe(
          41
        );
      }
    );


    test(
      "degraded observations are excluded",
      () => {
        const builder =
          new BehaviouralMemoryBuilder();


        const statistics =
          builder
            .calculateStatistics([
              observation({
                id:
                  1,

                value:
                  20,
              }),

              observation({
                id:
                  2,

                value:
                  90,

                healthState:
                  "DEGRADED",

                degraded:
                  true,
              }),
            ]);


        expect(
          statistics.eligible
        ).toBe(
          1
        );


        expect(
          statistics.mean
        ).toBe(
          20
        );
      }
    );


    test(
      "low quality observations are excluded",
      () => {
        const builder =
          new BehaviouralMemoryBuilder();


        const statistics =
          builder
            .calculateStatistics(
              [
                observation({
                  id:
                    1,

                  value:
                    20,

                  qualityScore:
                    1,
                }),

                observation({
                  id:
                    2,

                  value:
                    90,

                  qualityScore:
                    0.2,
                }),
              ],
              0.8
            );


        expect(
          statistics.eligible
        ).toBe(
          1
        );


        expect(
          statistics.mean
        ).toBe(
          20
        );
      }
    );


    test(
      "resource baseline gets RESOURCE scope",
      () => {
        const builder =
          new BehaviouralMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            serviceId:
              "api",

            resourceId:
              "resource-a",

            metricName:
              "memory_percent",

            observations: [
              observation({
                id:
                  1,

                value:
                  50,
              }),

              observation({
                id:
                  2,

                value:
                  55,
              }),

              observation({
                id:
                  3,

                value:
                  60,
              }),
            ],

            minimumSamples:
              3,
          });


        expect(
          result.memory.scopeType
        ).toBe(
          "RESOURCE"
        );
      }
    );


    test(
      "behavioural memory ID is deterministic",
      () => {
        const builder =
          new BehaviouralMemoryBuilder();


        const first =
          builder
            .buildPublicId({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              serviceId:
                "api",

              resourceId:
                null,

              metricName:
                "cpu_percent",
            });


        const second =
          builder
            .buildPublicId({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              serviceId:
                "api",

              resourceId:
                null,

              metricName:
                "cpu_percent",
            });


        expect(
          first
        ).toBe(
          second
        );
      }
    );


    test(
      "behavioural memory cannot suppress alerts or authorize execution",
      () => {
        const builder =
          new BehaviouralMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            metricName:
              "cpu_percent",

            observations: [
              observation({
                id:
                  1,

                value:
                  40,
              }),

              observation({
                id:
                  2,

                value:
                  45,
              }),

              observation({
                id:
                  3,

                value:
                  50,
              }),
            ],

            minimumSamples:
              3,
          });


        expect(
          result.memory
            .metadata
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.memory
            .metadata
            .suppressAlerts
        ).toBe(
          false
        );


        expect(
          result.memory
            .content
            .learningPolicy
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.memory
            .content
            .learningPolicy
            .suppressAlerts
        ).toBe(
          false
        );
      }
    );


    test(
      "existing behavioural baseline is updated rather than duplicated",
      async () => {
        const existing = {
          publicId:
            "mem-behaviour-1",

          sourceCount:
            3,
        };


        const memoryRepository = {
          findByPublicId:
            jest.fn(
              async () =>
                existing
            ),

          updateMemory:
            jest.fn(
              async () => ({
                publicId:
                  "mem-behaviour-1",
              })
            ),

          addSource:
            jest.fn(
              async () => ({})
            ),
        };


        const builder = {
          build:
            jest.fn(
              () => ({
                eligible:
                  true,

                statistics: {
                  eligible:
                    3,
                },

                sources:
                  [],

                memory: {
                  publicId:
                    "mem-behaviour-1",

                  title:
                    "baseline",

                  summary:
                    "baseline",

                  content:
                    {},

                  confidence:
                    0.9,

                  trustScore:
                    0.9,

                  importance:
                    0.8,

                  evidenceCount:
                    3,

                  observationCount:
                    3,

                  observedAt:
                    new Date(),

                  metadata:
                    {},

                  schemaVersion:
                    1,
                },
              })
            ),
        };


        const service =
          new BehaviouralMemoryService({
            memoryRepository,

            builder,

            indexService: {
              indexMemory:
                jest.fn(
                  async () => ({
                    indexed:
                      true,
                  })
                ),
            },
          });


        const result =
          await service
            .synthesize({
              organizationId:
                "org-a",

              metricName:
                "cpu_percent",

              observations:
                [],
            });


        expect(
          result.created
        ).toBe(
          false
        );


        expect(
          result.updated
        ).toBe(
          true
        );


        expect(
          memoryRepository
            .updateMemory
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );
  }
);