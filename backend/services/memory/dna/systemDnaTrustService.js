"use strict";


class SystemDnaTrustService {

  clamp(
    value
  ) {
    const parsed =
      Number(
        value
      );


    if (
      !Number.isFinite(
        parsed
      )
    ) {
      return 0;
    }


    return Math.max(
      0,
      Math.min(
        1,
        parsed
      )
    );
  }


  score({
    aggregation,

    conflicts =
      null,
  }) {
    if (
      !aggregation
    ) {
      const error =
        new Error(
          "System DNA aggregation is required"
        );

      error.code =
        "SYSTEM_DNA_TRUST_AGGREGATION_REQUIRED";

      error.status =
        422;

      throw error;
    }


    const familyCoverage =
      this.clamp(
        (
          aggregation
            ?.coverage
            ?.familyCount ||
          0
        ) /
        6
      );


    const evidenceStrength =
      this.clamp(
        (
          aggregation
            ?.evidenceCount ||
          0
        ) /
        12
      );


    const baseTrust =
      this.clamp(
        aggregation
          ?.averageTrust ||
        0
      );


    const confidence =
      this.clamp(
        aggregation
          ?.averageConfidence ||
        0
      );


    const conflictCount =
      Number(
        conflicts
          ?.conflictCount ||
        0
      );


    const requiresHumanReview =
      conflicts
        ?.requiresHumanReview ===
        true;


    const criticalConflict =
      conflicts
        ?.critical ===
        true;


    let conflictFactor =
      1;


    if (
      conflictCount >
        0
    ) {
      conflictFactor -=
        Math.min(
          0.25,
          conflictCount *
            0.05
        );
    }


    if (
      requiresHumanReview
    ) {
      conflictFactor -=
        0.10;
    }


    if (
      criticalConflict
    ) {
      conflictFactor -=
        0.25;
    }


    conflictFactor =
      this.clamp(
        conflictFactor
      );


    const rawTrust =
      (
        baseTrust *
        0.35
      ) +
      (
        confidence *
        0.25
      ) +
      (
        familyCoverage *
        0.20
      ) +
      (
        evidenceStrength *
        0.20
      );


    const finalTrust =
      this.clamp(
        rawTrust *
        conflictFactor
      );


    return {
      score:
        Number(
          finalTrust
            .toFixed(
              6
            )
        ),

      components: {
        baseTrust,

        confidence,

        familyCoverage,

        evidenceStrength,

        conflictFactor,
      },

      provenance: {
        evidenceMemoryIds:
          [
            ...(
              aggregation
                ?.evidenceMemoryIds ||
              []
            ),
          ],

        evidenceCount:
          aggregation
            ?.evidenceCount ||
          0,

        memoryCount:
          aggregation
            ?.memoryCount ||
          0,

        familyCount:
          aggregation
            ?.coverage
            ?.familyCount ||
          0,
      },

      safety: {
        executionAuthorized:
          false,

        grantsExecutionPermission:
          false,

        evidenceOnly:
          true,
      },
    };
  }
}


const systemDnaTrustService =
  new SystemDnaTrustService();


module.exports = {
  SystemDnaTrustService,

  systemDnaTrustService,
};