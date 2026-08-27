"use strict";


const {
  MemoryConflictResolver,
} =
  require(
    "../../services/memory/context/memoryConflictResolver"
  );


describe(
  "Phase 16.14F memory conflict resolution",
  () => {

    let resolver;


    beforeEach(
      () => {
        resolver =
          new MemoryConflictResolver();
      }
    );


    test(
      "human rejection conflicts with matching procedure",
      () => {
        const result =
          resolver.resolve([
            {
              publicId:
                "procedure-1",

              memoryType:
                "PROCEDURAL",

              status:
                "ACTIVE",

              content: {
                procedure: {
                  action:
                    "restart-service",
                },
              },
            },

            {
              publicId:
                "human-1",

              memoryType:
                "HUMAN",

              status:
                "ACTIVE",

              content: {
                humanAction: {
                  actionType:
                    "REJECTED",

                  recommendation:
                    "restart-service",
                },
              },
            },
          ]);


        expect(
          result.hasConflicts
        ).toBe(
          true
        );


        expect(
          result.conflicts[0]
            .type
        ).toBe(
          "HUMAN_OVERRIDE_CONFLICT"
        );


        expect(
          result.requiresHumanReview
        ).toBe(
          true
        );
      }
    );


    test(
      "human modification is surfaced as action conflict",
      () => {
        const result =
          resolver.resolve([
            {
              publicId:
                "procedure",

              memoryType:
                "PROCEDURAL",

              status:
                "ACTIVE",

              content: {
                procedure: {
                  action:
                    "restart-service",
                },
              },
            },

            {
              publicId:
                "human",

              memoryType:
                "HUMAN",

              status:
                "ACTIVE",

              content: {
                humanAction: {
                  actionType:
                    "MODIFIED",

                  recommendation:
                    "restart-service",

                  finalAction:
                    "drain-traffic-then-restart",
                },
              },
            },
          ]);


        expect(
          result.conflicts[0]
            .type
        ).toBe(
          "ACTION_CONFLICT"
        );
      }
    );


    test(
      "success and failure for same action become outcome conflict",
      () => {
        const result =
          resolver.resolve([
            {
              publicId:
                "outcome-success",

              memoryType:
                "OUTCOME",

              status:
                "ACTIVE",

              content: {
                recoveryDecision: {
                  action:
                    "restart-service",
                },

                outcome: {
                  classification:
                    "SUCCESS",
                },
              },
            },

            {
              publicId:
                "outcome-failed",

              memoryType:
                "OUTCOME",

              status:
                "ACTIVE",

              content: {
                recoveryDecision: {
                  action:
                    "restart-service",
                },

                outcome: {
                  classification:
                    "FAILED",
                },
              },
            },
          ]);


        expect(
          result.hasConflicts
        ).toBe(
          true
        );


        expect(
          result.conflicts[0]
            .type
        ).toBe(
          "OUTCOME_CONFLICT"
        );
      }
    );


    test(
      "different semantic causes for same symptom are surfaced",
      () => {
        const result =
          resolver.resolve([
            {
              publicId:
                "semantic-a",

              memoryType:
                "SEMANTIC",

              status:
                "ACTIVE",

              content: {
                knowledge: {
                  symptom:
                    "high latency",

                  cause:
                    "database saturation",
                },
              },
            },

            {
              publicId:
                "semantic-b",

              memoryType:
                "SEMANTIC",

              status:
                "ACTIVE",

              content: {
                knowledge: {
                  symptom:
                    "high latency",

                  cause:
                    "network packet loss",
                },
              },
            },
          ]);


        expect(
          result.conflicts[0]
            .type
        ).toBe(
          "SEMANTIC_CONTRADICTION"
        );
      }
    );


    test(
      "matching semantic memories do not conflict",
      () => {
        const result =
          resolver.resolve([
            {
              memoryType:
                "SEMANTIC",

              status:
                "ACTIVE",

              content: {
                knowledge: {
                  symptom:
                    "high latency",

                  cause:
                    "database saturation",
                },
              },
            },

            {
              memoryType:
                "SEMANTIC",

              status:
                "ACTIVE",

              content: {
                knowledge: {
                  symptom:
                    "high latency",

                  cause:
                    "database saturation",
                },
              },
            },
          ]);


        expect(
          result.hasConflicts
        ).toBe(
          false
        );
      }
    );


    test(
      "revoked memory entering evaluation creates critical lifecycle conflict",
      () => {
        const result =
          resolver.resolve([
            {
              publicId:
                "active",

              memoryType:
                "SEMANTIC",

              status:
                "ACTIVE",

              content:
                {},
            },

            {
              publicId:
                "revoked",

              memoryType:
                "SEMANTIC",

              status:
                "REVOKED",

              content:
                {},
            },
          ]);


        expect(
          result.critical
        ).toBe(
          true
        );


        expect(
          result.conflicts[0]
            .type
        ).toBe(
          "LIFECYCLE_CONFLICT"
        );
      }
    );


    test(
      "unrelated memories do not create conflict",
      () => {
        const result =
          resolver.resolve([
            {
              memoryType:
                "PROCEDURAL",

              status:
                "ACTIVE",

              content: {
                procedure: {
                  action:
                    "restart-service",
                },
              },
            },

            {
              memoryType:
                "HUMAN",

              status:
                "ACTIVE",

              content: {
                humanAction: {
                  actionType:
                    "APPROVED",

                  recommendation:
                    "scale-service",
                },
              },
            },
          ]);


        expect(
          result.hasConflicts
        ).toBe(
          false
        );
      }
    );


    test(
      "conflict resolver never automatically resolves execution decisions",
      () => {
        const result =
          resolver.resolve([
            {
              memoryType:
                "PROCEDURAL",

              status:
                "ACTIVE",

              content: {
                procedure: {
                  action:
                    "restart-service",
                },
              },
            },

            {
              memoryType:
                "HUMAN",

              status:
                "ACTIVE",

              content: {
                humanAction: {
                  actionType:
                    "REJECTED",

                  recommendation:
                    "restart-service",
                },
              },
            },
          ]);


        expect(
          result
            .safety
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result
            .safety
            .grantsExecutionPermission
        ).toBe(
          false
        );


        expect(
          result
            .safety
            .automaticConflictResolution
        ).toBe(
          false
        );
      }
    );


    test(
      "empty context contains no conflicts",
      () => {
        const result =
          resolver.resolve(
            []
          );


        expect(
          result.hasConflicts
        ).toBe(
          false
        );


        expect(
          result.conflictCount
        ).toBe(
          0
        );
      }
    );
  }
);