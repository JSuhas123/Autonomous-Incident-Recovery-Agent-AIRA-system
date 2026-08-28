"use strict";

const ChangeCorrelationService =
  require(
    "../../services/topology/ChangeCorrelationService"
  );


describe(
  "Phase 17.12 - Change Correlation",
  function () {
    const organizationId =
      "aira-dev-org";

    const environmentId =
      "env_aira_development";

    const incidentId =
      "incident-1";

    const resourceId =
      "resource-root";

    const incidentAt =
      new Date(
        "2026-08-28T10:00:00.000Z"
      );


    let incidentTopology;
    let knownGoodComparison;
    let service;


    beforeEach(
      function () {
        incidentTopology = {
          reconstruct:
            jest.fn(
              async () => ({
                incident: {
                  id:
                    incidentId,

                  publicId:
                    incidentId,
                },

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

                  preWindowMs:
                    300000,

                  postWindowMs:
                    300000,
                },

                snapshots: {
                  preIncident: {
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
                  },

                  atIncident: {
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
                  },

                  postIncident: {
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
                  },
                },

                changes: [
                  {
                    id:
                      "change-close",

                    relationshipId:
                      "rel-redis",

                    changeType:
                      "RELATIONSHIP_CREATED",

                    changedAt:
                      new Date(
                        "2026-08-28T09:59:00.000Z"
                      ),

                    beforeState:
                      {},

                    afterState: {
                      sourceResourceId:
                        resourceId,

                      targetResourceId:
                        "redis",
                    },

                    source:
                      "kubernetes:test",

                    evidence: {
                      discovery:
                        true,
                    },
                  },

                  {
                    id:
                      "change-late",

                    relationshipId:
                      "rel-other",

                    changeType:
                      "RELATIONSHIP_UPDATED",

                    changedAt:
                      new Date(
                        "2026-08-28T10:20:00.000Z"
                      ),

                    source:
                      "discovery",

                    evidence:
                      {},
                  },
                ],

                summary: {
                  graphChangeCount:
                    2,
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

                knownGood: {
                  id:
                    "known-good",

                  confidence:
                    0.98,
                },

                knownGoodState: {
                  id:
                    "state-good",
                },

                observedState: {
                  id:
                    "state-incident",
                },

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
                  },

                  {
                    category:
                      "version",

                    path:
                      "version",

                    before:
                      "21",

                    after:
                      "22",
                  },

                  {
                    category:
                      "health",

                    path:
                      "health",

                    before:
                      "HEALTHY",

                    after:
                      "DEGRADED",
                  },
                ],
              })
            ),
        };


        service =
          new ChangeCorrelationService({
            incidentTopology,

            knownGoodComparison,
          });
      }
    );


    test(
      "creates candidates from graph changes",
      async function () {
        const result =
          await service
            .correlateIncident({
              organizationId,

              environmentId,

              incidentId,

              resourceId,
            });


        expect(
          result.candidates.some(
            (candidate) =>
              candidate.candidateType ===
              "GRAPH_CHANGE"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "creates candidates from known-good divergence",
      async function () {
        const result =
          await service
            .correlateIncident({
              organizationId,

              environmentId,

              incidentId,

              resourceId,
            });


        expect(
          result.candidates.some(
            (candidate) =>
              candidate.candidateType ===
                "KNOWN_GOOD_DIVERGENCE" &&
              candidate.category ===
                "configuration"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "temporally close pre-incident root relationship change ranks strongly",
      async function () {
        const result =
          await service
            .correlateIncident({
              organizationId,

              environmentId,

              incidentId,

              resourceId,
            });


        const candidate =
          result.candidates.find(
            (item) =>
              item.changeId ===
              "change-close"
          );


        expect(
          candidate
            .occurredBeforeOrAtIncident
        ).toBe(
          true
        );


        expect(
          candidate
            .directlyTouchesRoot
        ).toBe(
          true
        );


        expect(
          candidate.score
        ).toBeGreaterThan(
          0.7
        );
      }
    );


    test(
      "post-incident unrelated change scores lower",
      async function () {
        const result =
          await service
            .correlateIncident({
              organizationId,

              environmentId,

              incidentId,

              resourceId,
            });


        const close =
          result.candidates.find(
            (item) =>
              item.changeId ===
              "change-close"
          );


        const late =
          result.candidates.find(
            (item) =>
              item.changeId ===
              "change-late"
          );


        expect(
          close.score
        ).toBeGreaterThan(
          late.score
        );
      }
    );


    test(
      "configuration divergence receives stronger diagnostic weight than attributes",
      async function () {
        knownGoodComparison
          .compareAtTime
          .mockResolvedValueOnce({
            comparable:
              true,

            knownGood: {
              confidence:
                1,
            },

            knownGoodState: {
              id:
                "good",
            },

            observedState: {
              id:
                "bad",
            },

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
              },

              {
                category:
                  "attributes",

                path:
                  "region",

                before:
                  "a",

                after:
                  "b",
              },
            ],
          });


        const result =
          await service
            .correlateIncident({
              organizationId,

              environmentId,

              incidentId,

              resourceId,
            });


        const configuration =
          result.candidates.find(
            (item) =>
              item.category ===
              "configuration"
          );


        const attributes =
          result.candidates.find(
            (item) =>
              item.category ===
              "attributes"
          );


        expect(
          configuration.score
        ).toBeGreaterThan(
          attributes.score
        );
      }
    );


    test(
      "candidates are ordered highest score first",
      async function () {
        const result =
          await service
            .correlateIncident({
              organizationId,

              environmentId,

              incidentId,

              resourceId,
            });


        for (
          let index = 1;
          index <
          result.candidates.length;
          index +=
          1
        ) {
          expect(
            result.candidates[
              index -
              1
            ].score
          ).toBeGreaterThanOrEqual(
            result.candidates[
              index
            ].score
          );
        }
      }
    );


    test(
      "candidate ranking does not claim causality",
      async function () {
        const result =
          await service
            .correlateIncident({
              organizationId,

              environmentId,

              incidentId,

              resourceId,
            });


        expect(
          result.causalityEstablished
        ).toBe(
          false
        );


        for (
          const candidate
          of result.candidates
        ) {
          expect(
            candidate
              .causalityEstablished
          ).toBe(
            false
          );
        }
      }
    );


    test(
      "correlation never authorizes execution",
      async function () {
        const result =
          await service
            .correlateIncident({
              organizationId,

              environmentId,

              incidentId,

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
          service.execute
        ).toBeUndefined();


        expect(
          service.executeRecovery
        ).toBeUndefined();
      }
    );


    test(
      "works when no known-good baseline exists",
      async function () {
        knownGoodComparison
          .compareAtTime
          .mockResolvedValueOnce({
            comparable:
              false,

            knownGood:
              null,

            knownGoodState:
              null,

            observedState: {
              id:
                "state-current",
            },

            materialDifferences:
              [],
          });


        const result =
          await service
            .correlateIncident({
              organizationId,

              environmentId,

              incidentId,

              resourceId,
            });


        expect(
          result.summary
            .knownGoodBaselineAvailable
        ).toBe(
          false
        );


        expect(
          result.candidates.filter(
            (candidate) =>
              candidate.candidateType ===
              "GRAPH_CHANGE"
          ).length
        ).toBe(
          2
        );
      }
    );
  }
);