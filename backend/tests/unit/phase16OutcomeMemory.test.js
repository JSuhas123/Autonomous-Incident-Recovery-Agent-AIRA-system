"use strict";


const {
  OutcomeMemoryBuilder,
} =
  require(
    "../../services/memory/outcome/outcomeMemoryBuilder"
  );


const {
  OutcomeMemoryService,
} =
  require(
    "../../services/memory/outcome/outcomeMemoryService"
  );


describe(
  "Phase 16.9 outcome memory",
  () => {

    test(
      "confirmed recovery creates SUCCESS outcome",
      () => {
        const builder =
          new OutcomeMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            incident: {
              _id:
                "inc-1",

              status:
                "CLOSED",

              serviceId:
                "api",
            },

            decision: {
              decisionId:
                "decision-1",

              action:
                "restart-service",

              status:
                "APPROVED",
            },

            verification: {
              verificationId:
                "verification-1",

              recoveryConfirmed:
                true,

              incidentClosureEligible:
                true,

              confidence:
                0.94,
            },
          });


        expect(
          result.memory.memoryType
        ).toBe(
          "OUTCOME"
        );


        expect(
          result.memory.scopeType
        ).toBe(
          "INCIDENT"
        );


        expect(
          result.memory
            .content
            .outcome
            .classification
        ).toBe(
          "SUCCESS"
        );


        expect(
          result.memory
            .metadata
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "uncertain verification remains INCONCLUSIVE",
      () => {
        const builder =
          new OutcomeMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            incident: {
              _id:
                "inc-1",
            },

            verification: {
              verificationId:
                "verification-1",

              recoveryConfirmed:
                false,

              decision:
                "RETRY_REQUIRED",
            },
          });


        expect(
          result.memory
            .content
            .outcome
            .classification
        ).toBe(
          "INCONCLUSIVE"
        );
      }
    );


    test(
      "public id is deterministic per incident verification",
      () => {
        const builder =
          new OutcomeMemoryBuilder();


        expect(
          builder.buildPublicId({
            incidentId:
              "inc-1",

            verificationId:
              "ver-1",
          })
        ).toBe(
          "mem_outcome_inc-1_ver-1"
        );
      }
    );


    test(
      "builder captures incident decision and verification provenance",
      () => {
        const builder =
          new OutcomeMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            incident: {
              _id:
                "inc-1",
            },

            decision: {
              decisionId:
                "decision-1",
            },

            verification: {
              verificationId:
                "verification-1",
            },
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
            "INCIDENT",
            "RECOVERY_DECISION",
            "VERIFICATION",
          ])
        );
      }
    );


    test(
      "service refuses outcome without verification",
      async () => {
        const service =
          new OutcomeMemoryService({
            incidentRepository: {
              findOne:
                jest.fn(
                  async () => ({
                    _id:
                      "inc-1",
                  })
                ),
            },

            decisionRepository: {
              findHistory:
                jest.fn(
                  async () => []
                ),
            },

            verificationRepository: {
              findHistory:
                jest.fn(
                  async () => []
                ),
            },

            memoryRepository:
              {},

            indexService:
              {},
          });


        await expect(
          service.generate({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            incidentId:
              "inc-1",
          })
        ).rejects.toMatchObject({
          code:
            "OUTCOME_MEMORY_VERIFICATION_REQUIRED",
        });
      }
    );


    test(
      "existing outcome remains idempotent",
      async () => {
        const existing = {
          publicId:
            "mem_outcome_inc-1_ver-1",

          memoryType:
            "OUTCOME",
        };


        const memoryRepository = {
          findByPublicId:
            jest
              .fn()
              .mockResolvedValue(
                existing
              ),

          createMemory:
            jest.fn(),
        };


        const service =
          new OutcomeMemoryService({
            incidentRepository: {
              findOne:
                jest.fn(
                  async () => ({
                    _id:
                      "inc-1",
                  })
                ),
            },

            decisionRepository: {
              findHistory:
                jest.fn(
                  async () => []
                ),
            },

            verificationRepository: {
              findHistory:
                jest.fn(
                  async () => [
                    {
                      verificationId:
                        "ver-1",
                    },
                  ]
                ),
            },

            memoryRepository,

            indexService:
              {},
          });


        const result =
          await service.generate({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            incidentId:
              "inc-1",
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
      "PostgreSQL outcome survives Qdrant failure",
      async () => {
        const memoryRepository = {
          findByPublicId:
            jest
              .fn()
              .mockResolvedValueOnce(
                null
              )
              .mockResolvedValueOnce(
                null
              )
              .mockResolvedValueOnce({
                id:
                  "memory-id",

                publicId:
                  "mem_outcome_inc-1_ver-1",
              }),

          createMemory:
            jest.fn(
              async (
                input
              ) => ({
                id:
                  "memory-id",

                publicId:
                  input.publicId,

                confidence:
                  input.confidence,
              })
            ),

          addSource:
            jest.fn(
              async () => ({})
            ),

          addRelation:
            jest.fn(
              async () => ({})
            ),
        };


        const service =
          new OutcomeMemoryService({
            incidentRepository: {
              findOne:
                jest.fn(
                  async () => ({
                    _id:
                      "inc-1",

                    serviceId:
                      "api",
                  })
                ),
            },

            decisionRepository: {
              findHistory:
                jest.fn(
                  async () => [
                    {
                      decisionId:
                        "decision-1",

                      action:
                        "restart",
                    },
                  ]
                ),
            },

            verificationRepository: {
              findHistory:
                jest.fn(
                  async () => [
                    {
                      verificationId:
                        "ver-1",

                      recoveryConfirmed:
                        true,

                      confidence:
                        0.9,
                    },
                  ]
                ),
            },

            memoryRepository,

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
          await service.generate({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            incidentId:
              "inc-1",
          });


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


    test(
      "outcome memory never authorizes execution",
      () => {
        const builder =
          new OutcomeMemoryBuilder();


        const result =
          builder.build({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            incident: {
              _id:
                "inc-1",
            },

            verification: {
              verificationId:
                "ver-1",
            },
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
            .recoveryDecision
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);