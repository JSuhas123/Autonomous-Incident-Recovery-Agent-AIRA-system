"use strict";

const TemporalTopologyQueryService =
  require(
    "../../services/topology/TemporalTopologyQueryService"
  );


describe(
  "Phase 17.9 - Temporal Topology Query Engine",
  function () {
    const organizationId =
      "aira-dev-org";

    const environmentId =
      "env_aira_development";

    const at =
      new Date(
        "2026-08-28T10:00:00.000Z"
      );


    let repository;
    let service;


    beforeEach(
      function () {
        const resources = {
          a: {
            id:
              "a",

            resourceType:
              "application.service",

            name:
              "api",
          },

          b: {
            id:
              "b",

            resourceType:
              "postgres.database",

            name:
              "postgres",
          },

          c: {
            id:
              "c",

            resourceType:
              "redis.instance",

            name:
              "redis",
          },
        };


        const states = {
          a: {
            id:
              "sa",

            resourceId:
              "a",

            observedAt:
              at,

            health:
              "HEALTHY",

            lifecycle:
              "RUNNING",
          },

          b: {
            id:
              "sb",

            resourceId:
              "b",

            observedAt:
              at,

            health:
              "HEALTHY",

            lifecycle:
              "RUNNING",
          },

          c: {
            id:
              "sc",

            resourceId:
              "c",

            observedAt:
              at,

            health:
              "DEGRADED",

            lifecycle:
              "RUNNING",
          },
        };


        const edges = [
          {
            id:
              "r1",

            sourceResourceId:
              "a",

            targetResourceId:
              "b",

            relationshipType:
              "DEPENDS_ON",

            status:
              "ACTIVE",

            reconstructionSource:
              "EVENT_HISTORY",
          },

          {
            id:
              "r2",

            sourceResourceId:
              "b",

            targetResourceId:
              "c",

            relationshipType:
              "CONNECTS_TO",

            status:
              "ACTIVE",

            reconstructionSource:
              "EVENT_HISTORY",
          },
        ];


        repository = {
          getResource:
            jest.fn(
              async ({
                resourceId,
              }) =>
                resources[
                  resourceId
                ] ||
                null
            ),

          getResourceStateAtTime:
            jest.fn(
              async ({
                resourceId,
              }) =>
                states[
                  resourceId
                ] ||
                null
            ),

          listRelationshipsAtTime:
            jest.fn(
              async ({
                resourceId,
              }) =>
                edges.filter(
                  (edge) =>
                    edge.sourceResourceId ===
                      resourceId ||
                    edge.targetResourceId ===
                      resourceId
                )
            ),

          listGraphChanges:
            jest.fn(
              async () => [
                {
                  id:
                    "change-1",

                  relationshipId:
                    "r1",

                  changeType:
                    "RELATIONSHIP_CREATED",

                  changedAt:
                    new Date(
                      "2026-08-28T09:00:00.000Z"
                    ),
                },
              ]
            ),
        };


        service =
          new TemporalTopologyQueryService({
            repository,
          });
      }
    );


    test(
      "reconstructs one resource at historical time",
      async function () {
        const result =
          await service
            .getResourceContextAtTime({
              organizationId,

              environmentId,

              resourceId:
                "a",

              at,
            });


        expect(
          result.resource.id
        ).toBe(
          "a"
        );


        expect(
          result.state.resourceId
        ).toBe(
          "a"
        );


        expect(
          result.relationships
        ).toHaveLength(
          1
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "depth zero returns only root resource",
      async function () {
        const result =
          await service
            .getTopologyAtTime({
              organizationId,

              environmentId,

              resourceId:
                "a",

              at,

              depth:
                0,
            });


        expect(
          result.resources
        ).toHaveLength(
          1
        );


        expect(
          result.relationships
        ).toHaveLength(
          0
        );
      }
    );


    test(
      "depth one includes direct dependency",
      async function () {
        const result =
          await service
            .getTopologyAtTime({
              organizationId,

              environmentId,

              resourceId:
                "a",

              at,

              depth:
                1,
            });


        expect(
          result.resources
            .map(
              (resource) =>
                resource.id
            )
            .sort()
        ).toEqual([
          "a",
          "b",
        ]);


        expect(
          result.relationships
            .map(
              (relationship) =>
                relationship.id
            )
        ).toContain(
          "r1"
        );
      }
    );


    test(
      "depth two traverses dependency chain",
      async function () {
        const result =
          await service
            .getTopologyAtTime({
              organizationId,

              environmentId,

              resourceId:
                "a",

              at,

              depth:
                2,
            });


        expect(
          result.resources
            .map(
              (resource) =>
                resource.id
            )
            .sort()
        ).toEqual([
          "a",
          "b",
          "c",
        ]);


        expect(
          result.relationships
        ).toHaveLength(
          2
        );


        expect(
          result.counts
            .resources
        ).toBe(
          3
        );
      }
    );


    test(
      "graph traversal deduplicates resources and relationships",
      async function () {
        const result =
          await service
            .getTopologyAtTime({
              organizationId,

              environmentId,

              resourceId:
                "b",

              at,

              depth:
                2,
            });


        expect(
          new Set(
            result.resources.map(
              (resource) =>
                resource.id
            )
          ).size
        ).toBe(
          result.resources.length
        );


        expect(
          new Set(
            result.relationships.map(
              (relationship) =>
                relationship.id
            )
          ).size
        ).toBe(
          result.relationships.length
        );
      }
    );


    test(
      "retrieves graph changes in a temporal window",
      async function () {
        const result =
          await service
            .getChangesBetween({
              organizationId,

              environmentId,

              from:
                new Date(
                  "2026-08-28T08:00:00.000Z"
                ),

              to:
                new Date(
                  "2026-08-28T10:00:00.000Z"
                ),
            });


        expect(
          result
        ).toHaveLength(
          1
        );


        expect(
          repository
            .listGraphChanges
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    test(
      "caps graph traversal depth at five",
      async function () {
        const result =
          await service
            .getTopologyAtTime({
              organizationId,

              environmentId,

              resourceId:
                "a",

              at,

              depth:
                100,
            });


        expect(
          result.depth
        ).toBe(
          5
        );
      }
    );


    test(
      "rejects invalid historical timestamp",
      async function () {
        await expect(
          service
            .getTopologyAtTime({
              organizationId,

              environmentId,

              resourceId:
                "a",

              at:
                "not-a-date",
            })
        ).rejects.toMatchObject({
          code:
            "TEMPORAL_GRAPH_TIMESTAMP_INVALID",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "requires tenant scope",
      async function () {
        await expect(
          service
            .getTopologyAtTime({
              resourceId:
                "a",

              at,
            })
        ).rejects.toMatchObject({
          code:
            "TEMPORAL_GRAPH_SCOPE_REQUIRED",
        });
      }
    );


    test(
      "temporal topology cannot authorize or execute",
      function () {
        expect(
          service.authorize
        ).toBeUndefined();


        expect(
          service.authorizeExecution
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