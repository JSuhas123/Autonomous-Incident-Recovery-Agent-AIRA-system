"use strict";

const PostgresTemporalTopologyQueryRepository =
  require(
    "../../persistence/postgres/PostgresTemporalTopologyQueryRepository"
  );


/*
 * ============================================================================
 * TEMPORAL TOPOLOGY QUERY SERVICE
 * ============================================================================
 *
 * Phase 17.9
 *
 * Reconstructs graph context at arbitrary time T.
 *
 * This is a READ-ONLY reasoning surface.
 *
 * It never:
 *
 *   - changes infrastructure
 *   - changes ResourceStates
 *   - changes relationships
 *   - marks known-good state
 *   - authorizes execution
 * ============================================================================
 */

class TemporalTopologyQueryService {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresTemporalTopologyQueryRepository(
        options
      );
  }


  /*
   * ==========================================================================
   * SINGLE RESOURCE CONTEXT AT TIME
   * ==========================================================================
   */

  async getResourceContextAtTime(
    input,
    transaction = null
  ) {
    requireInput(
      input
    );


    const at =
      normalizeTimestamp(
        input.at
      );


    const resource =
      await this.repository
        .getResource(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            resourceId:
              input.resourceId,
          },

          transaction
        );


    if (
      !resource
    ) {
      return null;
    }


    const [
      state,
      relationships,
    ] =
      await Promise.all([
        this.repository
          .getResourceStateAtTime(
            {
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              resourceId:
                input.resourceId,

              at,
            },

            transaction
          ),

        this.repository
          .listRelationshipsAtTime(
            {
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              resourceId:
                input.resourceId,

              at,

              direction:
                input.direction ||
                "BOTH",

              relationshipTypes:
                input.relationshipTypes ||
                [],
            },

            transaction
          ),
      ]);


    return {
      resource,

      state,

      relationships,

      reconstructedAt:
        at,

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * TEMPORAL GRAPH TRAVERSAL
   * ==========================================================================
   *
   * Breadth-first traversal.
   *
   * Depth:
   *
   *   0 = root only
   *   1 = direct neighbors
   *   2 = neighbors of neighbors
   *
   * Hard maximum = 5.
   *
   * Neo4j is deliberately unnecessary here.
   * PostgreSQL remains canonical.
   * ==========================================================================
   */

  async getTopologyAtTime(
    input,
    transaction = null
  ) {
    requireInput(
      input
    );


    const depth =
      normalizeDepth(
        input.depth
      );


    const at =
      normalizeTimestamp(
        input.at
      );


    const visited =
      new Set();


    const queued =
      new Set([
        input.resourceId,
      ]);


    let frontier = [
      {
        resourceId:
          input.resourceId,

        depth:
          0,
      },
    ];


    const resources =
      new Map();

    const states =
      new Map();

    const relationships =
      new Map();


    while (
      frontier.length >
      0
    ) {
      const nextFrontier = [];


      for (
        const entry
        of frontier
      ) {
        if (
          visited.has(
            entry.resourceId
          )
        ) {
          continue;
        }


        visited.add(
          entry.resourceId
        );


        const resource =
          await this.repository
            .getResource(
              {
                organizationId:
                  input.organizationId,

                environmentId:
                  input.environmentId,

                resourceId:
                  entry.resourceId,
              },

              transaction
            );


        if (
          !resource
        ) {
          continue;
        }


        resources.set(
          resource.id,
          {
            ...resource,

            graphDepth:
              entry.depth,
          }
        );


        const state =
          await this.repository
            .getResourceStateAtTime(
              {
                organizationId:
                  input.organizationId,

                environmentId:
                  input.environmentId,

                resourceId:
                  entry.resourceId,

                at,
              },

              transaction
            );


        if (
          state
        ) {
          states.set(
            entry.resourceId,
            state
          );
        }


        if (
          entry.depth >=
          depth
        ) {
          continue;
        }


        const edges =
          await this.repository
            .listRelationshipsAtTime(
              {
                organizationId:
                  input.organizationId,

                environmentId:
                  input.environmentId,

                resourceId:
                  entry.resourceId,

                at,

                direction:
                  input.direction ||
                  "BOTH",

                relationshipTypes:
                  input.relationshipTypes ||
                  [],
              },

              transaction
            );


        for (
          const edge
          of edges
        ) {
          relationships.set(
            edge.id,
            edge
          );


          const neighborId =
            edge.sourceResourceId ===
              entry.resourceId
              ? edge.targetResourceId
              : edge.sourceResourceId;


          if (
            !visited.has(
              neighborId
            ) &&
            !queued.has(
              neighborId
            )
          ) {
            queued.add(
              neighborId
            );


            nextFrontier.push({
              resourceId:
                neighborId,

              depth:
                entry.depth +
                1,
            });
          }
        }
      }


      frontier =
        nextFrontier;
    }


    return {
      rootResourceId:
        input.resourceId,

      reconstructedAt:
        at,

      depth,

      resources:
        Array.from(
          resources.values()
        ),

      states:
        Array.from(
          states.values()
        ),

      relationships:
        Array.from(
          relationships.values()
        ),

      counts: {
        resources:
          resources.size,

        states:
          states.size,

        relationships:
          relationships.size,
      },

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * CHANGE WINDOW
   * ==========================================================================
   */

  async getChangesBetween(
    input,
    transaction = null
  ) {
    if (
      !input ||
      !input.organizationId ||
      !input.environmentId
    ) {
      throw serviceError(
        "Temporal change query requires tenant scope",
        "TEMPORAL_GRAPH_SCOPE_REQUIRED"
      );
    }


    return this.repository
      .listGraphChanges(
        input,
        transaction
      );
  }
}


function requireInput(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw serviceError(
      "Temporal topology tenant scope is required",
      "TEMPORAL_GRAPH_SCOPE_REQUIRED"
    );
  }


  if (
    !input.resourceId
  ) {
    throw serviceError(
      "Temporal topology resourceId is required",
      "TEMPORAL_GRAPH_RESOURCE_ID_REQUIRED"
    );
  }


  normalizeTimestamp(
    input.at
  );
}


function normalizeDepth(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return 1;
  }


  const parsed =
    Number.parseInt(
      value,
      10
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <
      0
  ) {
    throw serviceError(
      "Temporal topology depth must be a non-negative integer",
      "TEMPORAL_GRAPH_DEPTH_INVALID"
    );
  }


  return Math.min(
    parsed,
    5
  );
}


function normalizeTimestamp(
  value
) {
  const timestamp =
    value instanceof Date
      ? value
      : new Date(
          value
        );


  if (
    Number.isNaN(
      timestamp.getTime()
    )
  ) {
    throw serviceError(
      "Temporal topology timestamp is invalid",
      "TEMPORAL_GRAPH_TIMESTAMP_INVALID"
    );
  }


  return timestamp;
}


function serviceError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  TemporalTopologyQueryService;