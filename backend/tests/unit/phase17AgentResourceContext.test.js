"use strict";

const AgentResourceContextService =
  require(
    "../../services/topology/AgentResourceContextService"
  );


describe(
  "Phase 17.13 - Agent Resource Context",
  function () {
    const organizationId =
      "aira-dev-org";

    const environmentId =
      "env_aira_development";

    const incidentId =
      "incident-17-13";

    const resourceId =
      "resource-api";

    const incidentAt =
      new Date(
        "2026-08-28T10:00:00.000Z"
      );

    const asOf =
      new Date(
        "2026-08-28T11:00:00.000Z"
      );


    let temporalTopology;
    let incidentTopology;
    let knownGoodComparison;
    let changeCorrelation;
    let service;


    function resource(
      id,
      type
    ) {
      return {
        id,

        resourceType:
          type,

        name:
          id,
      };
    }


    function state(
      id,
      health
    ) {
      return {
        id:
          `state-${id}`,

        resourceId:
          id,

        health,

        lifecycle:
          "RUNNING",
      };
    }


    beforeEach(
      function () {
        temporalTopology = {
          getTopologyAtTime:
            jest.fn(
              async () => ({
                rootResourceId:
                  resourceId,

                reconstructedAt:
                  asOf,

                resources: [
                  resource(
                    resourceId,
                    "application.service"
                  ),

                  resource(
                    "db",
                    "postgres.database"
                  ),
                ],

                states: [
                  state(
                    resourceId,
                    "HEALTHY"
                  ),

                  state(
                    "db",
                    "HEALTHY"
                  ),
                ],

                relationships: [
                  {
                    id:
                      "rel-db",

                    sourceResourceId:
                      resourceId,

                    targetResourceId:
                      "db",

                    relationshipType:
                      "DEPENDS_ON",
                  },
                ],
              })
            ),
        };


        incidentTopology = {
          reconstruct:
            jest.fn(
              async () => ({
                incident: {
                  id:
                    incidentId,

                  publicId:
                    incidentId,

                  severity:
                    "critical",
                },

                rootResourceId:
                  resourceId,

                timeline: {
                  preIncidentAt:
                    new Date(
                      "2026-08-28T09:55:00.000Z"
                    ),

                  incidentAt,

                  postIncidentAt:
                    new Date(
                      "2026-08-28T10:15:00.000Z"
                    ),
                },

                snapshots: {
                  preIncident: {
                    resources: [
                      resource(
                        resourceId,
                        "application.service"
                      ),

                      resource(
                        "db",
                        "postgres.database"
                      ),
                    ],

                    states: [
                      state(
                        resourceId,
                        "HEALTHY"
                      ),
                    ],

                    relationships: [
                      {
                        id:
                          "rel-db",

                        sourceResourceId:
                          resourceId,

                        targetResourceId:
                          "db",

                        relationshipType:
                          "DEPENDS_ON",
                      },
                    ],
                  },

                  atIncident: {
                    resources: [
                      resource(
                        resourceId,
                        "application.service"
                      ),

                      resource(
                        "db",
                        "postgres.database"
                      ),

                      resource(
                        "redis",
                        "redis.instance"
                      ),
                    ],

                    states: [
                      state(
                        resourceId,
                        "DEGRADED"
                      ),
                    ],

                    relationships: [
                      {
                        id:
                          "rel-db",

                        sourceResourceId:
                          resourceId,

                        targetResourceId:
                          "db",

                        relationshipType:
                          "DEPENDS_ON",
                      },

                      {
                        id:
                          "rel-redis",

                        sourceResourceId:
                          resourceId,

                        targetResourceId:
                          "redis",

                        relationshipType:
                          "CONNECTS_TO",
                      },
                    ],
                  },

                  postIncident: {
                    resources: [
                      resource(
                        resourceId,
                        "application.service"
                      ),

                      resource(
                        "db",
                        "postgres.database"
                      ),
                    ],

                    states: [
                      state(
                        resourceId,
                        "HEALTHY"
                      ),
                    ],

                    relationships: [
                      {
                        id:
                          "rel-db",

                        sourceResourceId:
                          resourceId,

                        targetResourceId:
                          "db",

                        relationshipType:
                          "DEPENDS_ON",
                      },
                    ],
                  },
                },

                changes: [
                  {
                    id:
                      "change-redis",

                    relationshipId:
                      "rel-redis",

                    changeType:
                      "RELATIONSHIP_CREATED",

                    changedAt:
                      new Date(
                        "2026-08-28T09:59:00.000Z"
                      ),
                  },
                ],

                summary: {
                  graphChangeCount:
                    1,
                },
              })
            ),
        };


        knownGoodComparison = {
          compareAtTime:
            jest.fn(
              async () => ({
                comparable:
                  true,

                comparisonStatus:
                  "DIFFERENT",

                identical:
                  false,

                knownGood: {
                  id:
                    "known-good-1",

                  confidence:
                    0.98,
                },

                knownGoodState: {
                  id:
                    "state-known-good",

                  resourceId,

                  health:
                    "HEALTHY",

                  configuration: {
                    replicas:
                      4,
                  },
                },

                observedState: {
                  id:
                    "state-incident",

                  resourceId,

                  health:
                    "DEGRADED",

                  configuration: {
                    replicas:
                      2,
                  },
                },

                differences: [
                  {
                    category:
                      "configuration",

                    path:
                      "replicas",

                    before:
                      4,

                    after:
                      2,

                    derived:
                      false,
                  },
                ],

                materialDifferences: [
                  {
                    category:
                      "configuration",

                    path:
                      "replicas",

                    before:
                      4,

                    after:
                      2,

                    derived:
                      false,
                  },
                ],

                summary: {
                  differenceCount:
                    1,

                  materialDifferenceCount:
                    1,

                  changedCategories: [
                    "configuration",
                  ],
                },
              })
            ),
        };


        changeCorrelation = {
          correlateIncident:
            jest.fn(
              async () => ({
                incident: {
                  id:
                    incidentId,
                },

                candidates: [
                  {
                    rank:
                      1,

                    candidateType:
                      "GRAPH_CHANGE",

                    changeId:
                      "change-redis",

                    score:
                      0.84,

                    correlationStrength:
                      "STRONG",

                    causalityEstablished:
                      false,

                    executionAuthorized:
                      false,
                  },
                ],

                strongestCandidate: {
                  rank:
                    1,

                  candidateType:
                    "GRAPH_CHANGE",

                  score:
                    0.84,

                  correlationStrength:
                    "STRONG",

                  causalityEstablished:
                    false,
                },

                summary: {
                  totalCandidates:
                    1,
                },

                causalityEstablished:
                  false,

                executionAuthorized:
                  false,
              })
            ),
        };


        service =
          new AgentResourceContextService({
            temporalTopology,

            incidentTopology,

            knownGoodComparison,

            changeCorrelation,
          });
      }
    );


    test(
      "assembles Resource identity and current state",
      async function () {
        const result =
          await service
            .buildIncidentContext({
              organizationId,

              environmentId,

              incidentId,

              resourceId,

              asOf,
            });


        expect(
          result.resource.id
        ).toBe(
          resourceId
        );


        expect(
          result.state
            .current
            .health
        ).toBe(
          "HEALTHY"
        );
      }
    );


    test(
      "contains pre, incident and post Resource states",
      async function () {
        const result =
          await service
            .buildIncidentContext({
              organizationId,

              environmentId,

              incidentId,

              resourceId,

              asOf,
            });


        expect(
          result.state
            .preIncident
            .health
        ).toBe(
          "HEALTHY"
        );


        expect(
          result.state
            .incident
            .health
        ).toBe(
          "DEGRADED"
        );


        expect(
          result.state
            .postIncident
            .health
        ).toBe(
          "HEALTHY"
        );
      }
    );


    test(
      "contains evidence-backed known-good baseline",
      async function () {
        const result =
          await service
            .buildIncidentContext({
              organizationId,

              environmentId,

              incidentId,

              resourceId,

              asOf,
            });


        expect(
          result.state
            .knownGood
            .id
        ).toBe(
          "state-known-good"
        );


        expect(
          result.state
            .knownGoodDesignation
            .confidence
        ).toBe(
          0.98
        );
      }
    );


    test(
      "contains structured known-good state delta",
      async function () {
        const result =
          await service
            .buildIncidentContext({
              organizationId,

              environmentId,

              incidentId,

              resourceId,

              asOf,
            });


        expect(
          result.stateDelta
            .comparisonStatus
        ).toBe(
          "DIFFERENT"
        );


        expect(
          result.stateDelta
            .materialDifferences
        ).toHaveLength(
          1
        );
      }
    );


    test(
      "contains current and historical topology",
      async function () {
        const result =
          await service
            .buildIncidentContext({
              organizationId,

              environmentId,

              incidentId,

              resourceId,

              asOf,
            });


        expect(
          result.topology
            .current
            .relationships
        ).toHaveLength(
          1
        );


        expect(
          result.topology
            .incident
            .relationships
        ).toHaveLength(
          2
        );
      }
    );


    test(
      "builds directional dependency context",
      async function () {
        const result =
          await service
            .buildIncidentContext({
              organizationId,

              environmentId,

              incidentId,

              resourceId,

              asOf,
            });


        expect(
          result.dependencies
            .current
            .outgoing
        ).toHaveLength(
          1
        );


        expect(
          result.dependencies
            .current
            .outgoing[0]
            .resourceId
        ).toBe(
          "db"
        );
      }
    );


    test(
      "detects dependency topology change around incident",
      async function () {
        const result =
          await service
            .buildIncidentContext({
              organizationId,

              environmentId,

              incidentId,

              resourceId,

              asOf,
            });


        expect(
          result.dependencies
            .topologyChanged
        ).toBe(
          true
        );


        expect(
          result.summary
            .dependencyTopologyChanged
        ).toBe(
          true
        );
      }
    );


    test(
      "contains recent graph changes",
      async function () {
        const result =
          await service
            .buildIncidentContext({
              organizationId,

              environmentId,

              incidentId,

              resourceId,

              asOf,
            });


        expect(
          result.recentChanges
        ).toHaveLength(
          1
        );


        expect(
          result.recentChanges[0]
            .changeType
        ).toBe(
          "RELATIONSHIP_CREATED"
        );
      }
    );


    test(
      "contains ranked correlation evidence without asserting causality",
      async function () {
        const result =
          await service
            .buildIncidentContext({
              organizationId,

              environmentId,

              incidentId,

              resourceId,

              asOf,
            });


        expect(
          result.correlation
            .strongestCandidate
            .correlationStrength
        ).toBe(
          "STRONG"
        );


        expect(
          result.correlation
            .causalityEstablished
        ).toBe(
          false
        );


        expect(
          result.causalityEstablished
        ).toBe(
          false
        );
      }
    );


    test(
      "current context can be built without an incident",
      async function () {
        const result =
          await service
            .buildCurrentContext({
              organizationId,

              environmentId,

              resourceId,

              asOf,
            });


        expect(
          result.resource.id
        ).toBe(
          resourceId
        );


        expect(
          result.state.health
        ).toBe(
          "HEALTHY"
        );


        expect(
          incidentTopology
            .reconstruct
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "Agent Resource Context remains evidence-only",
      async function () {
        const result =
          await service
            .buildIncidentContext({
              organizationId,

              environmentId,

              incidentId,

              resourceId,

              asOf,
            });


        expect(
          result.evidenceOnly
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          service.authorize
        ).toBeUndefined();


        expect(
          service.execute
        ).toBeUndefined();


        expect(
          service.executeRecovery
        ).toBeUndefined();
      }
    );


    test(
      "requires explicit root Resource",
      async function () {
        await expect(
          service
            .buildIncidentContext({
              organizationId,

              environmentId,

              incidentId,

              asOf,
            })
        ).rejects.toMatchObject({
          code:
            "AGENT_RESOURCE_CONTEXT_RESOURCE_ID_REQUIRED",

          executionAuthorized:
            false,
        });
      }
    );
  }
);