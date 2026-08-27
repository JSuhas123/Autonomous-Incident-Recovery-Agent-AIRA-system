"use strict";


const PostgresMemoryRetrievalRepository =
  require(
    "../../../persistence/postgres/PostgresMemoryRetrievalRepository"
  );


class MemoryHydrationService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresMemoryRetrievalRepository(
        options
      );
  }


  async hydrate({
    organizationId,

    candidates,

    environmentId =
      null,

    serviceId =
      null,

    resourceId =
      null,

    incidentId =
      null,

    memoryTypes =
      [],

    scopes =
      [],

    includeGlobal =
      false,
  }) {
    if (
      !Array.isArray(
        candidates
      ) ||
      candidates.length ===
        0
    ) {
      return {
        memories:
          [],

        candidateCount:
          0,

        hydratedCount:
          0,

        rejectedCount:
          0,
      };
    }


    const candidateIds =
      [
        ...new Set(
          candidates
            .map(
              (
                candidate
              ) =>
                String(
                  candidate.memoryId
                )
            )
        ),
      ];


    const hydrated =
      await this.repository
        .hydrateCandidates({
          organizationId,

          candidateIds,

          environmentId,

          serviceId,

          resourceId,

          incidentId,

          memoryTypes,

          scopes,

          includeGlobal,
        });


    const hydratedById =
      new Map(
        hydrated.map(
          (
            memory
          ) => [
            String(
              memory.id
            ),

            memory,
          ]
        )
      );


    /**
     * Preserve Qdrant similarity ordering, but only after PostgreSQL has
     * authorized and hydrated each candidate.
     */
    const memories =
      candidates
        .map(
          (
            candidate
          ) => {
            const memory =
              hydratedById
                .get(
                  String(
                    candidate.memoryId
                  )
                );


            if (
              !memory
            ) {
              return null;
            }


            return {
              ...memory,

              retrieval: {
                score:
                  Number(
                    candidate.score ||
                    0
                  ),

                qdrantPointId:
                  candidate.pointId,
              },
            };
          }
        )
        .filter(
          Boolean
        );


    return {
      memories,

      candidateCount:
        candidates.length,

      hydratedCount:
        memories.length,

      rejectedCount:
        Math.max(
          0,

          candidates.length -
          memories.length
        ),
    };
  }
}


const memoryHydrationService =
  new MemoryHydrationService();


module.exports = {
  MemoryHydrationService,

  memoryHydrationService,
};