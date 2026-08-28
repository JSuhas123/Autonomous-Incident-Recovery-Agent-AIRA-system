"use strict";

const IncidentTopologyReconstructionService =
  require(
    "../../services/topology/IncidentTopologyReconstructionService"
  );


describe(
  "Phase 17.10 - Incident-Time Topology Reconstruction",
  function () {
    const organizationId =
      "aira-dev-org";

    const environmentId =
      "env_aira_development";

    const resourceId =
      "resource-root";


    let incidentRepository;
    let temporalTopology;
    let service;


    beforeEach(
      function () {
        incidentRepository = {
          getIncident:
            jest.fn(
              async () => ({
                id:
                  "incident-uuid",

                publicId:
                  "inc_test_17_10",

                organizationId,

                environmentId,

                serviceId:
                  "payments",

                status:
                  "closed",

                severity:
                  "critical",

                startedAt:
                  new Date(
                    "2026-08-28T10:00:00.000Z"
                  ),

                detectedAt:
                  new Date(
                    "2026-08-28T10:01:00.000Z"
                  ),

                firstDetectedAt:
                  new Date(
                    "2026-08-28T10:01:00.000Z"
                  ),

                resolvedAt:
                  new Date(
                    "2026-08-28T10:15:00.000Z"
                  ),

                closedAt:
                  new Date(
                    "2026-08-28T10:20:00.000Z"
                  ),

                createdAt:
                  new Date(
                    "2026-08-28T10:01:00.000Z"
                  ),
              })
            ),
        };


        temporalTopology = {
          getTopologyAtTime:
            jest.fn(
              async ({
                at,
              }) => {
                const timestamp =
                  new Date(
                    at
                  ).getTime();


                const incidentTime =
                  new Date(
                    "2026-08-28T10:00:00.000Z"
                  ).getTime();


                const closedTime =
                  new Date(
                    "2026-08-28T10:20:00.000Z"
                  ).getTime();


                if (
                  timestamp <
                  incidentTime
                ) {
                  return {
                    reconstructedAt:
                      at,

                    resources: [
                      {
                        id:
                          resourceId,
                      },

                      {
                        id:
                          "database",
                      },
                    ],

                    states: [],

                    relationships: [
                      {
                        id:
                          "rel-db",

                        sourceResourceId:
                          resourceId,

                        targetResourceId:
                          "database",
                      },
                    ],
                  };
                }


                if (
                  timestamp >=
                  closedTime
                ) {
                  return {
                    reconstructedAt:
                      at,

                    resources: [
                      {
                        id:
                          resourceId,
                      },

                      {
                        id:
                          "database",
                      },
                    ],

                    states: [],

                    relationships: [
                      {
                        id:
                          "rel-db",

                        sourceResourceId:
                          resourceId,

                        targetResourceId:
                          "database",
                      },
                    ],
                  };
                }


                return {
                  reconstructedAt:
                    at,

                  resources: [
                    {
                      id:
                        resourceId,
                    },

                    {
                      id:
                        "database",
                    },

                    {
                      id:
                        "redis",
                    },
                  ],

                  states: [],

                  relationships: [
                    {
                      id:
                        "rel-db",

                      sourceResourceId:
                        resourceId,

                      targetResourceId:
                        "database",
                    },

                    {
                      id:
                        "rel-redis",

                      sourceResourceId:
                        resourceId,

                      targetResourceId:
                        "redis",
                    },
                  ],
                };
              }
            ),

          getChangesBetween:
            jest.fn(
              async () => [
                {
                  id:
                    "change-1",

                  relationshipId:
                    "rel-redis",

                  changeType:
                    "RELATIONSHIP_CREATED",

                  changedAt:
                    new Date(
                      "2026-08-28T09:59:00.000Z"
                    ),
                },
              ]
            ),
        };


        service =
          new IncidentTopologyReconstructionService({
            incidentRepository,

            temporalTopology,
          });
      }
    );


    test(
      "uses incident startedAt as preferred incident anchor",
      async function () {
        const result =
          await service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "inc_test_17_10",

            resourceId,
          });


        expect(
          result.timeline
            .incidentAt
            .toISOString()
        ).toBe(
          "2026-08-28T10:00:00.000Z"
        );
      }
    );


    test(
      "reconstructs pre-incident topology",
      async function () {
        const result =
          await service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "inc_test_17_10",

            resourceId,
          });


        expect(
          result.snapshots
            .preIncident
            .relationships
        ).toHaveLength(
          1
        );
      }
    );


    test(
      "reconstructs topology at incident time",
      async function () {
        const result =
          await service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "inc_test_17_10",

            resourceId,
          });


        expect(
          result.snapshots
            .atIncident
            .relationships
        ).toHaveLength(
          2
        );


        expect(
          result.summary
            .relationshipsAppearedByIncident
        ).toContain(
          "rel-redis"
        );
      }
    );


    test(
      "uses closedAt for post-incident reconstruction when available",
      async function () {
        const result =
          await service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "inc_test_17_10",

            resourceId,
          });


        expect(
          result.timeline
            .postIncidentAt
            .toISOString()
        ).toBe(
          "2026-08-28T10:20:00.000Z"
        );


        expect(
          result.snapshots
            .postIncident
            .relationships
        ).toHaveLength(
          1
        );
      }
    );


    test(
      "returns graph changes across incident reconstruction window",
      async function () {
        const result =
          await service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "inc_test_17_10",

            resourceId,
          });


        expect(
          result.changes
        ).toHaveLength(
          1
        );


        expect(
          result.summary
            .graphChangeCount
        ).toBe(
          1
        );
      }
    );


    test(
      "default pre-incident window is five minutes",
      async function () {
        const result =
          await service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "inc_test_17_10",

            resourceId,
          });


        expect(
          result.timeline
            .preIncidentAt
            .toISOString()
        ).toBe(
          "2026-08-28T09:55:00.000Z"
        );
      }
    );


    test(
      "supports custom pre-incident window",
      async function () {
        const result =
          await service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "inc_test_17_10",

            resourceId,

            preWindowMs:
              10 *
              60 *
              1000,
          });


        expect(
          result.timeline
            .preIncidentAt
            .toISOString()
        ).toBe(
          "2026-08-28T09:50:00.000Z"
        );
      }
    );


    test(
      "falls back from startedAt to detectedAt",
      async function () {
        incidentRepository
          .getIncident
          .mockResolvedValueOnce({
            id:
              "incident-uuid",

            publicId:
              "inc_test",

            startedAt:
              null,

            detectedAt:
              new Date(
                "2026-08-28T11:00:00.000Z"
              ),

            firstDetectedAt:
              null,

            createdAt:
              new Date(
                "2026-08-28T11:01:00.000Z"
              ),

            resolvedAt:
              null,

            closedAt:
              null,
          });


        const result =
          await service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "inc_test",

            resourceId,
          });


        expect(
          result.timeline
            .incidentAt
            .toISOString()
        ).toBe(
          "2026-08-28T11:00:00.000Z"
        );
      }
    );


    test(
      "requires explicit root Resource rather than guessing from serviceId",
      async function () {
        await expect(
          service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "inc_test_17_10",
          })
        ).rejects.toMatchObject({
          code:
            "INCIDENT_TOPOLOGY_RESOURCE_ID_REQUIRED",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "rejects missing incident",
      async function () {
        incidentRepository
          .getIncident
          .mockResolvedValueOnce(
            null
          );


        await expect(
          service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "missing",

            resourceId,
          })
        ).rejects.toMatchObject({
          code:
            "INCIDENT_TOPOLOGY_INCIDENT_NOT_FOUND",
        });
      }
    );


    test(
      "rejects incident without temporal anchor",
      async function () {
        incidentRepository
          .getIncident
          .mockResolvedValueOnce({
            id:
              "incident-uuid",

            publicId:
              "inc_no_time",

            startedAt:
              null,

            detectedAt:
              null,

            firstDetectedAt:
              null,

            createdAt:
              null,

            resolvedAt:
              null,

            closedAt:
              null,
          });


        await expect(
          service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "inc_no_time",

            resourceId,
          })
        ).rejects.toMatchObject({
          code:
            "INCIDENT_TOPOLOGY_TIME_UNAVAILABLE",
        });
      }
    );


    test(
      "lightweight reconstruction returns only incident-time topology",
      async function () {
        const result =
          await service
            .reconstructAtIncident({
              organizationId,

              environmentId,

              incidentId:
                "inc_test_17_10",

              resourceId,
            });


        expect(
          result.incident
            .publicId
        ).toBe(
          "inc_test_17_10"
        );


        expect(
          result.topology
        ).toBeDefined();


        expect(
          temporalTopology
            .getTopologyAtTime
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          temporalTopology
            .getChangesBetween
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "incident topology remains evidence and never authorizes execution",
      async function () {
        const result =
          await service.reconstruct({
            organizationId,

            environmentId,

            incidentId:
              "inc_test_17_10",

            resourceId,
          });


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          service.authorize
        ).toBeUndefined();


        expect(
          service.authorizeExecution
        ).toBeUndefined();


        expect(
          service.executeRecovery
        ).toBeUndefined();
      }
    );
  }
);