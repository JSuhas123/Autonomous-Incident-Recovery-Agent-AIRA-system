
"use strict";


const crypto =
  require(
    "node:crypto"
  );


const {
  MEMORY_TYPES,
} =
  require(
    "../../../constants/memoryTypes"
  );


const {
  MEMORY_SCOPES,
} =
  require(
    "../../../constants/memoryScopes"
  );


class SemanticMemoryBuilder {

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


  normalizeText(
    value
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }


    const normalized =
      String(
        value
      )
        .trim()
        .replace(
          /\s+/g,
          " "
        );


    return normalized ||
      null;
  }


  normalizeEvidence(
    evidence
  ) {
    return {
      memoryId:
        evidence.memoryId ||
        evidence.id ||
        null,

      publicId:
        evidence.publicId ||
        null,

      symptom:
        this
          .normalizeText(
            evidence.symptom
          ),

      cause:
        this
          .normalizeText(
            evidence.cause
          ),

      serviceId:
        evidence.serviceId ||
        null,

      environmentId:
        evidence.environmentId ||
        null,

      confidence:
        Math.max(
          0,

          Math.min(
            1,

            Number(
              evidence.confidence ||
              0
            )
          )
        ),

      trustScore:
        Math.max(
          0,

          Math.min(
            1,

            Number(
              evidence.trustScore ||
              0
            )
          )
        ),

      contradicts:
        evidence.contradicts ===
          true,

      observedAt:
        evidence.observedAt ||
        null,
    };
  }


  calculateStatistics(
    evidence
  ) {
    const normalized =
      evidence
        .map(
          (
            item
          ) =>
            this
              .normalizeEvidence(
                item
              )
        )
        .filter(
          (
            item
          ) =>
            item.symptom &&
            item.cause
        );


    const supporting =
      normalized.filter(
        (
          item
        ) =>
          !item.contradicts
      );


    const contradicting =
      normalized.filter(
        (
          item
        ) =>
          item.contradicts
      );


    const total =
      normalized.length;


    const consistency =
      total >
        0
        ? supporting.length /
          total
        : 0;


    const averageConfidence =
      supporting.length >
        0
        ? supporting.reduce(
            (
              sum,
              item
            ) =>
              sum +
              item.confidence,
            0
          ) /
          supporting.length
        : 0;


    const averageTrust =
      supporting.length >
        0
        ? supporting.reduce(
            (
              sum,
              item
            ) =>
              sum +
              item.trustScore,
            0
          ) /
          supporting.length
        : 0;


    return {
      total,

      supporting:
        supporting.length,

      contradicting:
        contradicting.length,

      consistency,

      averageConfidence,

      averageTrust,

      evidence:
        normalized,
    };
  }


  buildPublicId({
    organizationId,

    environmentId,

    serviceId,

    symptom,

    cause,
  }) {
    const hash =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            organizationId,

            environmentId ||
              "",

            serviceId ||
              "",

            symptom
              .toLowerCase(),

            cause
              .toLowerCase(),
          ]
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


    return (
      "mem_semantic_" +
      hash
    );
  }


  determineScope({
    organizationId,

    environmentId,

    serviceId,
  }) {
    if (
      serviceId
    ) {
      if (
        !environmentId
      ) {
        throw this.createError(
          "Service semantic memory requires environment",
          "SEMANTIC_MEMORY_ENVIRONMENT_REQUIRED"
        );
      }


      return {
        scopeType:
          MEMORY_SCOPES
            .SERVICE,

        organizationId,

        environmentId,

        serviceId,
      };
    }


    if (
      environmentId
    ) {
      return {
        scopeType:
          MEMORY_SCOPES
            .ENVIRONMENT,

        organizationId,

        environmentId,

        serviceId:
          null,
      };
    }


    return {
      scopeType:
        MEMORY_SCOPES
          .TENANT,

      organizationId,

      environmentId:
        null,

      serviceId:
        null,
    };
  }


  build({
    organizationId,

    environmentId =
      null,

    serviceId =
      null,

    symptom,

    cause,

    evidence,

    minimumEvidence =
      3,

    minimumConsistency =
      0.75,
  }) {
    const normalizedSymptom =
      this
        .normalizeText(
          symptom
        );


    const normalizedCause =
      this
        .normalizeText(
          cause
        );


    if (
      !organizationId ||
      !normalizedSymptom ||
      !normalizedCause
    ) {
      throw this.createError(
        "Semantic memory requires organization, symptom and cause",
        "SEMANTIC_MEMORY_INPUT_REQUIRED"
      );
    }


    if (
      !Array.isArray(
        evidence
      )
    ) {
      throw this.createError(
        "Semantic memory evidence must be an array",
        "SEMANTIC_MEMORY_EVIDENCE_REQUIRED"
      );
    }


    const statistics =
      this
        .calculateStatistics(
          evidence
        );


    if (
      statistics.supporting <
      minimumEvidence
    ) {
      return {
        eligible:
          false,

        reason:
          "INSUFFICIENT_EVIDENCE",

        statistics,
      };
    }


    if (
      statistics.consistency <
      minimumConsistency
    ) {
      return {
        eligible:
          false,

        reason:
          "CONSISTENCY_BELOW_THRESHOLD",

        statistics,
      };
    }


    const scope =
      this
        .determineScope({
          organizationId,

          environmentId,

          serviceId,
        });


    const confidence =
      Math.min(
        0.98,

        (
          statistics.consistency *
          0.45
        ) +
        (
          statistics.averageConfidence *
          0.35
        ) +
        (
          Math.min(
            statistics.supporting /
            10,
            1
          ) *
          0.2
        )
      );


    const trustScore =
      Math.min(
        0.98,

        (
          statistics.consistency *
          0.45
        ) +
        (
          statistics.averageTrust *
          0.35
        ) +
        (
          Math.min(
            statistics.supporting /
            20,
            1
          ) *
          0.2
        )
      );


    const publicId =
      this
        .buildPublicId({
          organizationId,

          environmentId,

          serviceId,

          symptom:
            normalizedSymptom,

          cause:
            normalizedCause,
        });


    const sources =
      statistics
        .evidence
        .filter(
          (
            item
          ) =>
            item.publicId
        )
        .map(
          (
            item
          ) => ({
            sourceType:
              "MEMORY",

            sourceId:
              item.publicId,

            evidenceRole:
              item.contradicts
                ? "CONTRADICTING"
                : "SUPPORTING",

            observedAt:
              item.observedAt,
          })
        );


    return {
      eligible:
        true,

      statistics,

      sources,

      memory: {
        publicId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        serviceId:
          scope.serviceId,

        resourceId:
          null,

        incidentId:
          null,

        memoryType:
          MEMORY_TYPES
            .SEMANTIC,

        scopeType:
          scope.scopeType,

        title:
          `Operational relationship: ${normalizedSymptom}`,

        summary:
          (
            `${normalizedCause} is associated with ` +
            `${normalizedSymptom} across ` +
            `${statistics.supporting} supporting observations ` +
            `with ${(statistics.consistency * 100).toFixed(0)}% consistency.`
          ),

        content: {
          knowledge: {
            relationshipType:
              "CAUSE_ASSOCIATION",

            symptom:
              normalizedSymptom,

            cause:
              normalizedCause,

            statement:
              (
                `${normalizedCause} is associated with ${normalizedSymptom}`
              ),

            causalCertainty:
              "OBSERVED_ASSOCIATION",
          },

          evidence: {
            total:
              statistics.total,

            supporting:
              statistics.supporting,

            contradicting:
              statistics.contradicting,

            consistency:
              statistics.consistency,

            minimumEvidence,

            minimumConsistency,
          },

          applicability: {
            organizationId,

            environmentId,

            serviceId,
          },

          supportingMemoryIds:
            statistics
              .evidence
              .filter(
                (
                  item
                ) =>
                  !item.contradicts
              )
              .map(
                (
                  item
                ) =>
                  item.publicId
              ),

          contradictingMemoryIds:
            statistics
              .evidence
              .filter(
                (
                  item
                ) =>
                  item.contradicts
              )
              .map(
                (
                  item
                ) =>
                  item.publicId
              ),
        },

        confidence,

        trustScore,

        importance:
          Math.min(
            1,

            0.65 +
            (
              statistics.consistency *
              0.25
            ) +
            (
              Math.min(
                statistics.supporting /
                20,
                1
              ) *
              0.1
            )
          ),

        status:
          "ACTIVE",

        sourceType:
          "EVIDENCE_SYNTHESIS",

        sourceCount:
          0,

        evidenceCount:
          sources.length,

        observationCount:
          Math.max(
            1,
            statistics.total
          ),

        observedAt:
          new Date(),

        validFrom:
          null,

        validUntil:
          null,

        supersedesMemoryId:
          null,

        legacySourceType:
          null,

        legacySourceId:
          null,

        metadata: {
          phase:
            "16.11",

          generator:
            "semanticMemoryBuilder",

          authoritativeStore:
            "postgresql",

          retrievalStore:
            "qdrant",

          executionAuthorized:
            false,

          inferenceLevel:
            "OBSERVED_ASSOCIATION",

          minimumEvidence,

          minimumConsistency,
        },

        schemaVersion:
          1,
      },
    };
  }
}


const semanticMemoryBuilder =
  new SemanticMemoryBuilder();


module.exports = {
  SemanticMemoryBuilder,

  semanticMemoryBuilder,
};