"use strict";


const {
  EpisodicMemoryBuilder,
} =
  require(
    "../../services/memory/episodic/episodicMemoryBuilder"
  );


const {
  EpisodicMemoryService,
} =
  require(
    "../../services/memory/episodic/episodicMemoryService"
  );


describe(
  "Phase 16.8 episodic memory generation",
  () => {

    test(
      "builder creates INCIDENT scoped EPISODIC memory",
      () => {
        const builder =
          new EpisodicMemoryBuilder();


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

              severity:
                "critical",

              serviceId:
                "payments",

              createdAt:
                new Date(),

              closedAt:
                new Date(),
            },

            diagnoses:
              [],

            decisions:
              [],

            verifications:
              [],
          });


        expect(
          result.memory.memoryType
        ).toBe(
          "EPISODIC"
        );


        expect(
          result.memory.scopeType
        ).toBe(
          "INCIDENT"
        );


        expect(
          result.memory.incidentId
        ).toBe(
          "inc-1"
        );


        expect(
          result.memory.status
        ).toBe(
          "ACTIVE"
        );


        expect(
          result.memory.metadata
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "builder creates deterministic memory public ID",
      () => {
        const builder =
          new EpisodicMemoryBuilder();


        expect(
          builder
            .buildPublicId(
              "inc-782"
            )
        ).toBe(
          "mem_episode_incident_inc-782"
        );
      }
    );


    test(
      "builder captures incident diagnosis decision and verification provenance",
      () => {
        const builder =
          new EpisodicMemoryBuilder();


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
            },

            diagnoses: [
              {
                diagnosisId:
                  "diag-1",
              },
            ],

            decisions: [
              {
                decisionId:
                  "decision-1",
              },
            ],

            verifications: [
              {
                verificationId:
                  "verification-1",

                recoveryConfirmed:
                  true,
              },
            ],
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
            "DIAGNOSIS",
            "RECOVERY_DECISION",
            "VERIFICATION",
          ])
        );
      }
    );


    test(
      "service refuses to create final episode before incident closure",
      async () => {
        const service =
          new EpisodicMemoryService({
            incidentRepository: {
              findOne:
                jest.fn(
                  async () => ({
                    _id:
                      "inc-1",

                    status:
                      "RESOLVED",
                  })
                ),
            },

            memoryRepository:
              {},

            diagnosisRepository:
              {},

            decisionRepository:
              {},

            verificationRepository:
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
            "EPISODIC_MEMORY_INCIDENT_NOT_CLOSED",
        });
      }
    );


    test(
      "existing incident episode makes generation idempotent",
      async () => {
        const existing = {
          id:
            "memory-1",

          publicId:
            "mem_episode_incident_inc-1",

          memoryType:
            "EPISODIC",
        };


        const memoryRepository = {
          findByPublicId:
            jest.fn(
              async () =>
                existing
            ),

          createMemory:
            jest.fn(),

          addSource:
            jest.fn(),
        };


        const service =
          new EpisodicMemoryService({
            incidentRepository: {
              findOne:
                jest.fn(
                  async () => ({
                    _id:
                      "inc-1",

                    status:
                      "CLOSED",
                  })
                ),
            },

            memoryRepository,

            diagnosisRepository:
              {},

            decisionRepository:
              {},

            verificationRepository:
              {},

            indexService: {
              indexMemory:
                jest.fn(),
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
      "PostgreSQL memory survives Qdrant indexing failure",
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
                  "mem_episode_incident_inc-1",
              }),

          createMemory:
            jest.fn(
              async () => ({
                id:
                  "memory-1",

                publicId:
                  "mem_episode_incident_inc-1",
              })
            ),

          addSource:
            jest.fn(
              async () => ({})
            ),
        };


        const service =
          new EpisodicMemoryService({
            incidentRepository: {
              findOne:
                jest.fn(
                  async () => ({
                    _id:
                      "inc-1",

                    status:
                      "CLOSED",

                    severity:
                      "high",

                    serviceId:
                      "api",
                  })
                ),
            },

            diagnosisRepository: {
              findHistory:
                jest.fn(
                  async () => []
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
          result.indexing
            .error
            .code
        ).toBe(
          "QDRANT_UNAVAILABLE"
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
      "episodic memory never authorizes infrastructure execution",
      () => {
        const builder =
          new EpisodicMemoryBuilder();


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
            },
          });


        expect(
          result.memory.metadata
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);