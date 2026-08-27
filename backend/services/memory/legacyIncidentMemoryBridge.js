"use strict";

const crypto =
  require(
    "node:crypto"
  );


const {
  MEMORY_TYPES,
} =
  require(
    "../../constants/memoryTypes"
  );


const {
  MEMORY_SCOPES,
} =
  require(
    "../../constants/memoryScopes"
  );


const {
  MEMORY_STATUSES,
} =
  require(
    "../../constants/memoryLifecycle"
  );


const {
  canonicalMemoryService,
} =
  require(
    "./canonicalMemoryService"
  );


class LegacyIncidentMemoryBridge {

  constructor(
    options = {}
  ) {
    this.memoryService =
      options.memoryService ||
      canonicalMemoryService;
  }


  normalizeLegacyMemory(
    memory
  ) {
    if (
      !memory
    ) {
      return null;
    }


    if (
      typeof memory.toObject ===
        "function"
    ) {
      return memory
        .toObject({
          flattenMaps:
            true,
        });
    }


    return {
      ...memory,
    };
  }


  normalizeActions(
    actions
  ) {
    if (
      !actions
    ) {
      return {};
    }


    if (
      actions instanceof
        Map
    ) {
      return Object.fromEntries(
        actions.entries()
      );
    }


    if (
      typeof actions.toObject ===
        "function"
    ) {
      return actions
        .toObject();
    }


    return {
      ...actions,
    };
  }


  createDeterministicId(
    prefix,
    ...parts
  ) {
    const hash =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          parts
            .map(
              (
                part
              ) =>
                String(
                  part ||
                  ""
                )
            )
            .join(
              "|"
            )
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          32
        );


    return `${prefix}_${hash}`;
  }


  calculateSemanticConfidence(
    legacy
  ) {
    const stats =
      legacy.stats ||
      {};


    const occurrences =
      Number(
        stats.totalOccurrences ||
        0
      );


    const trendConfidence =
      Number(
        stats
          ?.confidenceTrend
          ?.avgConfidence ||
        0
      );


    const evidenceConfidence =
      Math.min(
        occurrences /
        10,
        1
      );


    return Math.max(
      0,

      Math.min(
        1,

        (
          evidenceConfidence *
          0.6
        ) +
        (
          trendConfidence *
          0.4
        )
      )
    );
  }


  calculateTrustScore(
    legacy
  ) {
    const occurrences =
      Number(
        legacy
          ?.stats
          ?.totalOccurrences ||
        0
      );


    return Math.max(
      0.1,

      Math.min(
        0.9,

        0.2 +
        (
          occurrences *
          0.07
        )
      )
    );
  }


  buildSemanticMemory(
    legacyInput
  ) {
    const legacy =
      this
        .normalizeLegacyMemory(
          legacyInput
        );


    if (
      !legacy
        ?.tenantId ||
      !legacy
        ?.patternId
    ) {
      return null;
    }


    const actions =
      this
        .normalizeActions(
          legacy
            ?.stats
            ?.actions
        );


    const totalOccurrences =
      Number(
        legacy
          ?.stats
          ?.totalOccurrences ||
        0
      );


    return {
      publicId:
        this
          .createDeterministicId(
            "mem_legacy_semantic",

            legacy.tenantId,

            legacy.patternId
          ),

      organizationId:
        String(
          legacy.tenantId
        ),

      memoryType:
        MEMORY_TYPES
          .SEMANTIC,

      scopeType:
        MEMORY_SCOPES
          .TENANT,

      title:
        legacy.patternName ||
        `Operational pattern ${legacy.patternId}`,

      summary:
        totalOccurrences >
          0
          ? (
              `Operational pattern ${legacy.patternId} has been observed ` +
              `${totalOccurrences} time${totalOccurrences === 1 ? "" : "s"}.`
            )
          : (
              `Operational pattern ${legacy.patternId} is known to AIRA.`
            ),

      content: {
        patternId:
          legacy.patternId,

        patternType:
          legacy.patternType ||
          null,

        patternName:
          legacy.patternName ||
          null,

        description:
          legacy.description ||
          null,

        occurrences:
          legacy.occurrences ||
          [],

        statistics: {
          totalOccurrences,

          firstOccurrence:
            legacy
              ?.stats
              ?.firstOccurrence ||
            null,

          lastOccurrence:
            legacy
              ?.stats
              ?.lastOccurrence ||
            null,

          frequency:
            legacy
              ?.stats
              ?.frequency ||
            null,

          severityTrend:
            legacy
              ?.stats
              ?.severityTrend ||
            null,

          confidenceTrend:
            legacy
              ?.stats
              ?.confidenceTrend ||
            null,

          actions,
        },

        prediction:
          legacy.predictedNextOccurrence ||
          null,

        recommendedAction:
          legacy.recommendedAction ||
          null,
      },

      confidence:
        this
          .calculateSemanticConfidence(
            legacy
          ),

      trustScore:
        this
          .calculateTrustScore(
            legacy
          ),

      importance:
        Math.min(
          1,

          0.4 +
          (
            totalOccurrences *
            0.05
          )
        ),

      status:
        legacy.isActive ===
          false
          ? MEMORY_STATUSES
              .ARCHIVED
          : MEMORY_STATUSES
              .ACTIVE,

      sourceType:
        "LEGACY_INCIDENT_MEMORY",

      sourceCount:
        1,

      evidenceCount:
        Array.isArray(
          legacy.occurrences
        )
          ? legacy
              .occurrences
              .length
          : 0,

      observationCount:
        Math.max(
          1,
          totalOccurrences
        ),

      observedAt:
        legacy
          ?.stats
          ?.lastOccurrence ||
        legacy.updatedAt ||
        legacy.createdAt ||
        new Date(),

      validFrom:
        legacy.createdAt ||
        null,

      validUntil:
        null,

      legacySourceType:
        "IncidentMemory",

      legacySourceId:
        String(
          legacy._id ||
          legacy.patternId
        ),

      metadata: {
        phase:
          "16.4",

        bridge:
          "legacyIncidentMemory",

        migratedFrom:
          "IncidentMemory",

        patternId:
          legacy.patternId,
      },

      schemaVersion:
        1,
    };
  }


  buildProceduralMemory(
    legacyInput
  ) {
    const legacy =
      this
        .normalizeLegacyMemory(
          legacyInput
        );


    const recommendation =
      legacy
        ?.recommendedAction;


    if (
      !legacy
        ?.tenantId ||
      !legacy
        ?.patternId ||
      !recommendation
        ?.action
    ) {
      return null;
    }


    const successRate =
      Number(
        recommendation
          .successRate ||
        0
      );


    const confidence =
      Number(
        recommendation
          .confidence ||
        successRate ||
        0
      );


    /**
     * Phase 16.4 deliberately refuses to create procedural memory from a
     * weak recommendation.
     *
     * The existing memory service recommends actions after >= 3 attempts
     * and >= 80% success, so normally only mature legacy patterns reach here.
     */
    if (
      successRate <
        0.8
    ) {
      return null;
    }


    const actions =
      this
        .normalizeActions(
          legacy
            ?.stats
            ?.actions
        );


    const actionStats =
      actions[
        recommendation.action
      ] ||
      {};


    return {
      publicId:
        this
          .createDeterministicId(
            "mem_legacy_procedural",

            legacy.tenantId,

            legacy.patternId,

            recommendation.action
          ),

      organizationId:
        String(
          legacy.tenantId
        ),

      memoryType:
        MEMORY_TYPES
          .PROCEDURAL,

      scopeType:
        MEMORY_SCOPES
          .TENANT,

      title:
        `Recovery procedure for ${legacy.patternId}`,

      summary:
        (
          `${recommendation.action} has historically resolved ` +
          `${legacy.patternId} with ${(successRate * 100).toFixed(0)}% success.`
        ),

      content: {
        triggerPattern: {
          patternId:
            legacy.patternId,

          patternType:
            legacy.patternType ||
            null,
        },

        recommendedAction:
          recommendation.action,

        reasoning:
          recommendation.reasoning ||
          null,

        historicalPerformance: {
          successRate,

          successes:
            Number(
              actionStats.successes ||
              0
            ),

          failures:
            Number(
              actionStats.failures ||
              0
            ),

          totalAttempts:
            Number(
              actionStats.totalAttempts ||
              0
            ),

          averageRecoveryTimeMs:
            Number(
              actionStats.avgRecoveryTimeMs ||
              0
            ),

          lastUsed:
            actionStats.lastUsed ||
            null,
        },
      },

      confidence:
        Math.max(
          0,

          Math.min(
            1,
            confidence
          )
        ),

      trustScore:
        Math.max(
          0,

          Math.min(
            0.95,
            (
              successRate *
              0.7
            ) +
            0.2
          )
        ),

      importance:
        Math.max(
          0.5,

          Math.min(
            1,
            successRate
          )
        ),

      status:
        legacy.isActive ===
          false
          ? MEMORY_STATUSES
              .ARCHIVED
          : MEMORY_STATUSES
              .ACTIVE,

      sourceType:
        "LEGACY_INCIDENT_MEMORY",

      sourceCount:
        1,

      evidenceCount:
        Number(
          actionStats.totalAttempts ||
          0
        ),

      observationCount:
        Math.max(
          1,

          Number(
            actionStats.totalAttempts ||
            1
          )
        ),

      observedAt:
        actionStats.lastUsed ||
        legacy.updatedAt ||
        new Date(),

      validFrom:
        legacy.createdAt ||
        null,

      validUntil:
        null,

      legacySourceType:
        "IncidentMemory",

      legacySourceId:
        String(
          legacy._id ||
          legacy.patternId
        ),

      metadata: {
        phase:
          "16.4",

        bridge:
          "legacyIncidentMemory",

        derivedMemory:
          "PROCEDURAL",

        patternId:
          legacy.patternId,

        action:
          recommendation.action,
      },

      schemaVersion:
        1,
    };
  }


  async sync(
    legacyMemory
  ) {
    const semantic =
      this
        .buildSemanticMemory(
          legacyMemory
        );


    if (
      !semantic
    ) {
      return {
        synchronized:
          false,

        reason:
          "LEGACY_MEMORY_INVALID",
      };
    }


    const semanticResult =
      await this
        .memoryService
        .upsertByPublicId(
          semantic,
          {
            changeReason:
              "Legacy IncidentMemory semantic synchronization",

            changedByType:
              "LEGACY_BRIDGE",
          }
        );


    await this
      .memoryService
      .addSource({
        organizationId:
          semantic.organizationId,

        memoryPublicId:
          semantic.publicId,

        sourceType:
          "LEGACY_INCIDENT_MEMORY",

        sourceId:
          semantic
            .legacySourceId,

        evidenceRole:
          "PRIMARY",

        observedAt:
          semantic.observedAt,

        metadata: {
          patternId:
            semantic
              .metadata
              .patternId,
        },
      });


    const procedural =
      this
        .buildProceduralMemory(
          legacyMemory
        );


    let proceduralResult =
      null;


    if (
      procedural
    ) {
      proceduralResult =
        await this
          .memoryService
          .upsertByPublicId(
            procedural,
            {
              changeReason:
                "Legacy IncidentMemory procedural synchronization",

              changedByType:
                "LEGACY_BRIDGE",
            }
          );


      await this
        .memoryService
        .addSource({
          organizationId:
            procedural.organizationId,

          memoryPublicId:
            procedural.publicId,

          sourceType:
            "LEGACY_INCIDENT_MEMORY",

          sourceId:
            procedural
              .legacySourceId,

          evidenceRole:
            "PRIMARY",

          observedAt:
            procedural.observedAt,

          metadata: {
            patternId:
              procedural
                .metadata
                .patternId,

            action:
              procedural
                .metadata
                .action,
          },
        });


      await this
        .memoryService
        .relate({
          organizationId:
            semantic.organizationId,

          fromMemoryPublicId:
            procedural.publicId,

          toMemoryPublicId:
            semantic.publicId,

          relationType:
            "DERIVED_FROM",

          confidence:
            procedural.confidence,

          metadata: {
            phase:
              "16.4",
          },
        });
    }


    return {
      synchronized:
        true,

      semantic:
        semanticResult,

      procedural:
        proceduralResult,
    };
  }
}


const legacyIncidentMemoryBridge =
  new LegacyIncidentMemoryBridge();


module.exports = {
  LegacyIncidentMemoryBridge,

  legacyIncidentMemoryBridge,
};