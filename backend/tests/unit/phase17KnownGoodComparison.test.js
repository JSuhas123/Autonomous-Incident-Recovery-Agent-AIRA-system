"use strict";

const KnownGoodComparisonService =
  require(
    "../../services/topology/KnownGoodComparisonService"
  );


describe(
  "Phase 17.11 - Known-Good Comparison",
  function () {
    const organizationId =
      "aira-dev-org";

    const environmentId =
      "env_aira_development";

    const resourceId =
      "resource-1";

    const at =
      new Date(
        "2026-08-28T10:00:00.000Z"
      );


    function knownGoodState() {
      return {
        id:
          "state-good",

        resourceId,

        observedAt:
          new Date(
            "2026-08-28T09:00:00.000Z"
          ),

        health:
          "HEALTHY",

        lifecycle:
          "RUNNING",

        configuration: {
          replicas:
            4,

          image:
            "payments:v21",

          limits: {
            memory:
              "512Mi",
          },
        },

        runtime: {
          readyReplicas:
            4,
        },

        metrics: {
          errorRate:
            0.01,
        },

        attributes: {
          region:
            "ap-south-1",
        },

        version:
          "21",

        fingerprint:
          "fingerprint-good",
      };
    }


    function incidentState() {
      return {
        id:
          "state-incident",

        resourceId,

        observedAt:
          at,

        health:
          "DEGRADED",

        lifecycle:
          "RUNNING",

        configuration: {
          replicas:
            2,

          image:
            "payments:v22",

          limits: {
            memory:
              "512Mi",
          },
        },

        runtime: {
          readyReplicas:
            1,
        },

        metrics: {
          errorRate:
            0.42,
        },

        attributes: {
          region:
            "ap-south-1",
        },

        version:
          "22",

        fingerprint:
          "fingerprint-incident",
      };
    }


    test(
      "detects nested state differences",
      async function () {
        const repository = {
          getComparisonStatesAtTime:
            jest.fn(
              async () => ({
                knownGood: {
                  id:
                    "known-good-1",

                  resourceStateId:
                    "state-good",

                  confidence:
                    0.98,
                },

                knownGoodState:
                  knownGoodState(),

                observedState:
                  incidentState(),
              })
            ),
        };


        const service =
          new KnownGoodComparisonService({
            repository,

            incidentTopology:
              {},
          });


        const result =
          await service.compareAtTime({
            organizationId,

            environmentId,

            resourceId,

            at,
          });


        expect(
          result.comparable
        ).toBe(
          true
        );


        expect(
          result.comparisonStatus
        ).toBe(
          "DIFFERENT"
        );


        expect(
          result.materialDifferences
            .some(
              (difference) =>
                difference.category ===
                  "configuration" &&
                difference.path ===
                  "replicas" &&
                difference.before ===
                  4 &&
                difference.after ===
                  2
            )
        ).toBe(
          true
        );
      }
    );


    test(
      "detects version change",
      async function () {
        const repository = {
          getComparisonStatesAtTime:
            jest.fn(
              async () => ({
                knownGood: {
                  id:
                    "known-good",
                },

                knownGoodState:
                  knownGoodState(),

                observedState:
                  incidentState(),
              })
            ),
        };


        const service =
          new KnownGoodComparisonService({
            repository,
            incidentTopology:
              {},
          });


        const result =
          await service.compareAtTime({
            organizationId,
            environmentId,
            resourceId,
            at,
          });


        expect(
          result.materialDifferences
            .find(
              (difference) =>
                difference.category ===
                "version"
            )
        ).toMatchObject({
          before:
            "21",

          after:
            "22",
        });
      }
    );


    test(
      "detects health degradation",
      async function () {
        const repository = {
          getComparisonStatesAtTime:
            jest.fn(
              async () => ({
                knownGood: {
                  id:
                    "known-good",
                },

                knownGoodState:
                  knownGoodState(),

                observedState:
                  incidentState(),
              })
            ),
        };


        const service =
          new KnownGoodComparisonService({
            repository,
            incidentTopology:
              {},
          });


        const result =
          await service.compareAtTime({
            organizationId,
            environmentId,
            resourceId,
            at,
          });


        expect(
          result.materialDifferences
            .find(
              (difference) =>
                difference.category ===
                "health"
            )
        ).toMatchObject({
          before:
            "HEALTHY",

          after:
            "DEGRADED",
        });
      }
    );


    test(
      "fingerprint difference is derived evidence",
      async function () {
        const repository = {
          getComparisonStatesAtTime:
            jest.fn(
              async () => ({
                knownGood: {
                  id:
                    "known-good",
                },

                knownGoodState:
                  knownGoodState(),

                observedState:
                  incidentState(),
              })
            ),
        };


        const service =
          new KnownGoodComparisonService({
            repository,
            incidentTopology:
              {},
          });


        const result =
          await service.compareAtTime({
            organizationId,
            environmentId,
            resourceId,
            at,
          });


        const fingerprint =
          result.differences.find(
            (difference) =>
              difference.category ===
              "fingerprint"
          );


        expect(
          fingerprint.derived
        ).toBe(
          true
        );


        expect(
          result.materialDifferences
        ).not.toContain(
          fingerprint
        );
      }
    );


    test(
      "returns MATCH when baseline and observed state are equal",
      async function () {
        const state =
          knownGoodState();


        const repository = {
          getComparisonStatesAtTime:
            jest.fn(
              async () => ({
                knownGood: {
                  id:
                    "known-good",
                },

                knownGoodState:
                  state,

                observedState: {
                  ...state,
                },
              })
            ),
        };


        const service =
          new KnownGoodComparisonService({
            repository,
            incidentTopology:
              {},
          });


        const result =
          await service.compareAtTime({
            organizationId,
            environmentId,
            resourceId,
            at,
          });


        expect(
          result.comparisonStatus
        ).toBe(
          "MATCH"
        );


        expect(
          result.differences
        ).toHaveLength(
          0
        );
      }
    );


    test(
      "does not invent known-good state when none exists",
      async function () {
        const repository = {
          getComparisonStatesAtTime:
            jest.fn(
              async () => ({
                knownGood:
                  null,

                knownGoodState:
                  null,

                observedState:
                  incidentState(),
              })
            ),
        };


        const service =
          new KnownGoodComparisonService({
            repository,
            incidentTopology:
              {},
          });


        const result =
          await service.compareAtTime({
            organizationId,
            environmentId,
            resourceId,
            at,
          });


        expect(
          result.comparable
        ).toBe(
          false
        );


        expect(
          result.comparisonStatus
        ).toBe(
          "NO_KNOWN_GOOD"
        );
      }
    );


    test(
      "incident comparison uses incident temporal anchor",
      async function () {
        const repository = {
          getComparisonStatesAtTime:
            jest.fn(
              async () => ({
                knownGood: {
                  id:
                    "known-good",
                },

                knownGoodState:
                  knownGoodState(),

                observedState:
                  incidentState(),
              })
            ),
        };


        const incidentTopology = {
          reconstructAtIncident:
            jest.fn(
              async () => ({
                incident: {
                  id:
                    "incident-1",
                },

                incidentAt:
                  at,

                topology: {
                  resources: [
                    {
                      id:
                        resourceId,
                    },
                  ],
                },
              })
            ),
        };


        const service =
          new KnownGoodComparisonService({
            repository,
            incidentTopology,
          });


        const result =
          await service.compareIncident({
            organizationId,

            environmentId,

            incidentId:
              "incident-1",

            resourceId,
          });


        expect(
          result.incidentAt
        ).toBe(
          at
        );


        expect(
          repository
            .getComparisonStatesAtTime
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            at,
          }),
          null
        );
      }
    );


    test(
      "comparison cannot authorize execution",
      function () {
        const service =
          new KnownGoodComparisonService({
            repository:
              {},

            incidentTopology:
              {},
          });


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
  }
);