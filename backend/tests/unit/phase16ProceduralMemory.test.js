"use strict";


const {
  ProceduralMemoryBuilder,
} =
  require(
    "../../services/memory/procedural/proceduralMemoryBuilder"
  );


const {
  ProceduralMemoryService,
} =
  require(
    "../../services/memory/procedural/proceduralMemoryService"
  );


function outcome({
  id,
  action =
    "restart-service",
  classification =
    "SUCCESS",
  confidence =
    0.9,
  trustScore =
    0.9,
}) {
  return {
    id:
      `uuid-${id}`,

    publicId:
      `mem_outcome_${id}`,

    organizationId:
      "org-a",

    environmentId:
      "env-a",

    serviceId:
      "api",

    memoryType:
      "OUTCOME",

    confidence,

    trustScore,

    content: {
      incident: {
        serviceId:
          "api",
      },

      recoveryDecision: {
        action,
      },

      outcome: {
        classification,

        successful:
          classification ===
          "SUCCESS",

        failed:
          classification ===
          "FAILED",

        inconclusive:
          classification ===
          "INCONCLUSIVE",
      },
    },
  };
}


describe(
  "Phase 16.10 procedural memory synthesis",
  () => {

    test(
      "one successful outcome is insufficient evidence",
      () => {
        const builder =
          new ProceduralMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            serviceId:
              "api",

            action:
              "restart-service",

            outcomes: [
              outcome({
                id:
                  1,
              }),
            ],
          });


        expect(
          result.eligible
        ).toBe(
          false
        );


        expect(
          result.reason
        ).toBe(
          "INSUFFICIENT_EVIDENCE"
        );
      }
    );


    test(
      "repeated successful outcomes create procedure",
      () => {
        const builder =
          new ProceduralMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            serviceId:
              "api",

            action:
              "restart-service",

            outcomes: [
              outcome({
                id:
                  1,
              }),

              outcome({
                id:
                  2,
              }),

              outcome({
                id:
                  3,
              }),
            ],
          });


        expect(
          result.eligible
        ).toBe(
          true
        );


        expect(
          result.memory.memoryType
        ).toBe(
          "PROCEDURAL"
        );


        expect(
          result.memory.scopeType
        ).toBe(
          "SERVICE"
        );


        expect(
          result.memory
            .content
            .evidence
            .successRate
        ).toBe(
          1
        );
      }
    );


    test(
      "low success rate does not become procedure",
      () => {
        const builder =
          new ProceduralMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            action:
              "restart-service",

            outcomes: [
              outcome({
                id:
                  1,
                classification:
                  "SUCCESS",
              }),

              outcome({
                id:
                  2,
                classification:
                  "FAILED",
              }),

              outcome({
                id:
                  3,
                classification:
                  "FAILED",
              }),
            ],
          });


        expect(
          result.eligible
        ).toBe(
          false
        );


        expect(
          result.reason
        ).toBe(
          "SUCCESS_RATE_BELOW_THRESHOLD"
        );
      }
    );


    test(
      "inconclusive outcomes do not count as conclusive failures",
      () => {
        const builder =
          new ProceduralMemoryBuilder();


        const statistics =
          builder
            .calculateStatistics([
              outcome({
                id:
                  1,
              }),

              outcome({
                id:
                  2,
              }),

              outcome({
                id:
                  3,
              }),

              outcome({
                id:
                  4,
                classification:
                  "INCONCLUSIVE",
              }),
            ]);


        expect(
          statistics.conclusive
        ).toBe(
          3
        );


        expect(
          statistics.successes
        ).toBe(
          3
        );


        expect(
          statistics.inconclusive
        ).toBe(
          1
        );


        expect(
          statistics.successRate
        ).toBe(
          1
        );
      }
    );


    test(
      "procedure ID is deterministic",
      () => {
        const builder =
          new ProceduralMemoryBuilder();


        const first =
          builder
            .buildPublicId({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              serviceId:
                "api",

              action:
                "restart-service",
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

              action:
                "restart-service",
            });


        expect(
          first
        ).toBe(
          second
        );
      }
    );


    test(
      "procedural memory never grants execution authority",
      () => {
        const builder =
          new ProceduralMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            serviceId:
              "api",

            action:
              "restart-service",

            outcomes: [
              outcome({
                id:
                  1,
              }),

              outcome({
                id:
                  2,
              }),

              outcome({
                id:
                  3,
              }),
            ],
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
            .content
            .procedure
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "service groups outcomes by recovery action",
      () => {
        const service =
          new ProceduralMemoryService({
            memoryRepository:
              {},

            indexService:
              {},
          });


        const groups =
          service
            .groupByAction([
              outcome({
                id:
                  1,

                action:
                  "restart",
              }),

              outcome({
                id:
                  2,

                action:
                  "restart",
              }),

              outcome({
                id:
                  3,

                action:
                  "scale",
              }),
            ]);


        expect(
          groups
            .get(
              "restart"
            )
            .length
        ).toBe(
          2
        );


        expect(
          groups
            .get(
              "scale"
            )
            .length
        ).toBe(
          1
        );
      }
    );


    test(
      "service returns no synthesis when no outcome evidence exists",
      async () => {
        const service =
          new ProceduralMemoryService({
            memoryRepository: {
              listMemories:
                jest.fn(
                  async () => []
                ),
            },

            indexService:
              {},
          });


        const result =
          await service
            .synthesize({
              organizationId:
                "org-a",
            });


        expect(
          result.synthesized
        ).toBe(
          false
        );


        expect(
          result.reason
        ).toBe(
          "NO_OUTCOME_EVIDENCE"
        );
      }
    );
  }
);