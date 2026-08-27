"use strict";


const {
  HUMAN_ACTION_TYPES,

  HumanMemoryBuilder,
} =
  require(
    "../../services/memory/human/humanMemoryBuilder"
  );


const {
  HumanMemoryService,
} =
  require(
    "../../services/memory/human/humanMemoryService"
  );


describe(
  "Phase 16.12 human operational memory",
  () => {

    test(
      "approved recovery creates HUMAN memory",
      () => {
        const builder =
          new HumanMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            incidentId:
              "inc-1",

            eventId:
              "approval-event-1",

            actionType:
              "APPROVED",

            actorId:
              "user-1",

            actorDisplay:
              "SRE",

            recommendation:
              "restart-service",
          });


        expect(
          result.memory.memoryType
        ).toBe(
          "HUMAN"
        );


        expect(
          result.memory.scopeType
        ).toBe(
          "INCIDENT"
        );


        expect(
          result.memory
            .content
            .humanAction
            .actionType
        ).toBe(
          HUMAN_ACTION_TYPES
            .APPROVED
        );
      }
    );


    test(
      "rejected action retains the rejection reason",
      () => {
        const builder =
          new HumanMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            eventId:
              "event-2",

            actionType:
              "REJECTED",

            recommendation:
              "database failover",

            reason:
              "Reporting workload depends on this replica",
          });


        expect(
          result.memory
            .content
            .humanAction
            .reason
        ).toBe(
          "Reporting workload depends on this replica"
        );


        expect(
          result.memory.summary
        ).toContain(
          "rejected"
        );
      }
    );


    test(
      "modified recommendation captures proposed and final action",
      () => {
        const builder =
          new HumanMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            serviceId:
              "payments",

            eventId:
              "event-3",

            actionType:
              "MODIFIED",

            recommendation:
              "restart deployment",

            finalAction:
              "drain traffic then restart deployment",
          });


        expect(
          result.memory.scopeType
        ).toBe(
          "SERVICE"
        );


        expect(
          result.memory
            .content
            .humanAction
            .finalAction
        ).toBe(
          "drain traffic then restart deployment"
        );
      }
    );


    test(
      "manual action can be remembered without recommendation",
      () => {
        const builder =
          new HumanMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            eventId:
              "event-4",

            actionType:
              "MANUAL_ACTION",

            finalAction:
              "scaled worker replicas from 3 to 6",
          });


        expect(
          result.memory
            .content
            .humanAction
            .recommendation
        ).toBeNull();


        expect(
          result.memory
            .content
            .humanAction
            .finalAction
        ).toBe(
          "scaled worker replicas from 3 to 6"
        );
      }
    );


    test(
      "unknown human action type fails closed",
      () => {
        const builder =
          new HumanMemoryBuilder();


        expect(
          () =>
            builder.build({
              organizationId:
                "org-a",

              eventId:
                "event-5",

              actionType:
                "AUTO_APPROVE_FOREVER",
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "HUMAN_MEMORY_ACTION_TYPE_UNKNOWN",
          })
        );
      }
    );


    test(
      "human memory ID is deterministic from tenant and event",
      () => {
        const builder =
          new HumanMemoryBuilder();


        const first =
          builder
            .buildPublicId({
              organizationId:
                "org-a",

              eventId:
                "event-1",
            });


        const second =
          builder
            .buildPublicId({
              organizationId:
                "org-a",

              eventId:
                "event-1",
            });


        expect(
          first
        ).toBe(
          second
        );
      }
    );


    test(
      "human approval never becomes reusable execution authority",
      () => {
        const builder =
          new HumanMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            eventId:
              "event-6",

            actionType:
              "APPROVED",

            recommendation:
              "restart-service",
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
            .reusableAuthorization
        ).toBe(
          false
        );


        expect(
          result.memory
            .content
            .interpretation
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.memory
            .content
            .interpretation
            .reusableAuthorization
        ).toBe(
          false
        );
      }
    );


    test(
      "incident, decision and execution become provenance",
      () => {
        const builder =
          new HumanMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            incidentId:
              "inc-1",

            eventId:
              "event-7",

            actionType:
              "MODIFIED",

            recoveryDecisionId:
              "decision-1",

            executionRequestId:
              "execution-1",
          });


        expect(
          result.sources
            .map(
              (
                source
              ) =>
                source.sourceType
            )
        ).toEqual(
          expect.arrayContaining([
            "HUMAN_EVENT",
            "INCIDENT",
            "RECOVERY_DECISION",
            "EXECUTION_REQUEST",
          ])
        );
      }
    );


    test(
      "service is idempotent for same human event",
      async () => {
        const existing = {
          publicId:
            "mem_human_existing",

          memoryType:
            "HUMAN",
        };


        const memoryRepository = {
          findByPublicId:
            jest.fn(
              async () =>
                existing
            ),

          createMemory:
            jest.fn(),
        };


        const builder = {
          build:
            jest.fn(
              () => ({
                memory: {
                  publicId:
                    "mem_human_existing",

                  organizationId:
                    "org-a",
                },

                sources:
                  [],
              })
            ),
        };


        const service =
          new HumanMemoryService({
            memoryRepository,

            builder,

            indexService:
              {},
          });


        const result =
          await service
            .record({
              organizationId:
                "org-a",
            });


        expect(
          result.duplicate
        ).toBe(
          true
        );


        expect(
          memoryRepository
            .createMemory
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "PostgreSQL human memory survives Qdrant failure",
      async () => {
        const memoryRepository = {
          findByPublicId:
            jest
              .fn()
              .mockResolvedValueOnce(
                null
              )
              .mockResolvedValueOnce({
                id:
                  "memory-1",

                publicId:
                  "mem-human-1",
              }),

          createMemory:
            jest.fn(
              async () => ({
                id:
                  "memory-1",

                publicId:
                  "mem-human-1",
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
                memory: {
                  publicId:
                    "mem-human-1",

                  organizationId:
                    "org-a",
                },

                sources: [
                  {
                    sourceType:
                      "HUMAN_EVENT",

                    sourceId:
                      "event-1",

                    evidenceRole:
                      "HUMAN_CONFIRMED",

                    observedAt:
                      new Date(),
                  },
                ],
              })
            ),
        };


        const service =
          new HumanMemoryService({
            memoryRepository,

            builder,

            indexService: {
              indexMemory:
                jest.fn(
                  async () => {
                    throw Object.assign(
                      new Error(
                        "Qdrant unavailable"
                      ),
                      {
                        code:
                          "QDRANT_UNAVAILABLE",
                      }
                    );
                  }
                ),
            },
          });


        const result =
          await service
            .record({});


        expect(
          result.created
        ).toBe(
          true
        );


        expect(
          result.indexed
        ).toBe(
          false
        );


        expect(
          memoryRepository
            .createMemory
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );
  }
);