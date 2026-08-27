"use strict";


const {
  SYSTEM_DNA_MEMORY_FAMILIES,
} =
  require(
    "./systemDnaContract"
  );


class SystemDnaAggregator {

  createError(
    message,
    code,
    status =
      422
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    return error;
  }


  normalizeType(
    memory
  ) {
    return String(
      memory?.memoryType ||
      memory?.memory_type ||
      ""
    )
      .trim()
      .toUpperCase();
  }


  publicId(
    memory
  ) {
    return (
      memory?.publicId ||
      memory?.public_id ||
      null
    );
  }


  numeric(
    value,
    fallback =
      0
  ) {
    const parsed =
      Number(
        value
      );


    return Number.isFinite(
      parsed
    )
      ? parsed
      : fallback;
  }


  aggregate(
    memories =
      []
  ) {
    if (
      !Array.isArray(
        memories
      )
    ) {
      throw this.createError(
        "System DNA memories must be an array",
        "SYSTEM_DNA_MEMORIES_INVALID"
      );
    }


    const byFamily =
      {};


    const counts =
      {};


    for (
      const family
      of SYSTEM_DNA_MEMORY_FAMILIES
    ) {
      byFamily[
        family
      ] =
        [];

      counts[
        family
      ] =
        0;
    }


    const evidenceMemoryIds =
      [];


    let confidenceTotal =
      0;


    let trustTotal =
      0;


    let weightedMemoryCount =
      0;


    for (
      const memory
      of memories
    ) {
      if (
        !memory ||
        typeof memory !==
          "object"
      ) {
        continue;
      }


      const status =
        String(
          memory.status ||
          ""
        )
          .trim()
          .toUpperCase();


      /**
       * System DNA must never synthesize
       * inactive knowledge.
       */
      if (
        status !==
          "ACTIVE"
      ) {
        continue;
      }


      const type =
        this.normalizeType(
          memory
        );


      if (
        !SYSTEM_DNA_MEMORY_FAMILIES
          .includes(
            type
          )
      ) {
        continue;
      }


      byFamily[
        type
      ].push(
        memory
      );


      counts[
        type
      ] +=
        1;


      const id =
        this.publicId(
          memory
        );


      if (
        id
      ) {
        evidenceMemoryIds
          .push(
            id
          );
      }


      confidenceTotal +=
        this.numeric(
          memory.confidence
        );


      trustTotal +=
        this.numeric(
          memory.trustScore ??
          memory.trust_score
        );


      weightedMemoryCount +=
        1;
    }


    const uniqueEvidenceIds =
      [
        ...new Set(
          evidenceMemoryIds
        ),
      ];


    return {
      byFamily,

      counts,

      evidenceMemoryIds:
        uniqueEvidenceIds,

      evidenceCount:
        uniqueEvidenceIds.length,

      memoryCount:
        weightedMemoryCount,

      averageConfidence:
        weightedMemoryCount >
          0
          ? confidenceTotal /
            weightedMemoryCount
          : 0,

      averageTrust:
        weightedMemoryCount >
          0
          ? trustTotal /
            weightedMemoryCount
          : 0,

      coverage: {
        familyCount:
          Object
            .values(
              counts
            )
            .filter(
              (
                count
              ) =>
                count >
                0
            )
            .length,

        complete:
          SYSTEM_DNA_MEMORY_FAMILIES
            .every(
              (
                family
              ) =>
                counts[
                  family
                ] >
                0
            ),
      },
    };
  }
}


const systemDnaAggregator =
  new SystemDnaAggregator();


module.exports = {
  SystemDnaAggregator,

  systemDnaAggregator,
};