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


class ProceduralMemoryBuilder {

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


  normalizeOutcome(
    memory
  ) {
    const outcome =
      memory
        ?.content
        ?.outcome ||
      {};


    const recoveryDecision =
      memory
        ?.content
        ?.recoveryDecision ||
      {};


    return {
      memoryId:
        memory.id,

      publicId:
        memory.publicId,

      organizationId:
        memory.organizationId,

      environmentId:
        memory.environmentId,

      serviceId:
        memory.serviceId ||
        memory
          ?.content
          ?.incident
          ?.serviceId ||
        null,

      incidentId:
        memory.incidentId,

      action:
        recoveryDecision.action ||
        recoveryDecision.decision ||
        null,

      classification:
        outcome.classification ||
        "INCONCLUSIVE",

      successful:
        outcome.successful ===
          true,

      failed:
        outcome.failed ===
          true,

      inconclusive:
        outcome.inconclusive ===
          true,

      confidence:
        Number(
          memory.confidence ||
          0
        ),

      trustScore:
        Number(
          memory.trustScore ||
          0
        ),

      observedAt:
        memory.observedAt ||
        memory.updatedAt ||
        memory.createdAt ||
        null,
    };
  }


  calculateStatistics(
    outcomes
  ) {
    const normalized =
      outcomes.map(
        (
          outcome
        ) =>
          this
            .normalizeOutcome(
              outcome
            )
      );


    const successes =
      normalized.filter(
        (
          outcome
        ) =>
          outcome.successful
      )
        .length;


    const failures =
      normalized.filter(
        (
          outcome
        ) =>
          outcome.failed
      )
        .length;


    const inconclusive =
      normalized.length -
      successes -
      failures;


    const conclusive =
      successes +
      failures;


    const successRate =
      conclusive >
        0
        ? successes /
          conclusive
        : 0;


    const averageConfidence =
      normalized.length >
        0
        ? normalized.reduce(
            (
              total,
              outcome
            ) =>
              total +
              outcome.confidence,
            0
          ) /
          normalized.length
        : 0;


    const averageTrust =
      normalized.length >
        0
        ? normalized.reduce(
            (
              total,
              outcome
            ) =>
              total +
              outcome.trustScore,
            0
          ) /
          normalized.length
        : 0;


    return {
      total:
        normalized.length,

      conclusive,

      successes,

      failures,

      inconclusive,

      successRate,

      averageConfidence,

      averageTrust,

      outcomes:
        normalized,
    };
  }


  buildPublicId({
    organizationId,
    environmentId,
    serviceId,
    action,
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
            action,
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
      "mem_procedure_" +
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
          "Service procedural memory requires environment",
          "PROCEDURAL_MEMORY_ENVIRONMENT_REQUIRED"
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

    action,

    outcomes,

    minimumEvidence =
      3,

    minimumSuccessRate =
      0.8,
  }) {
    if (
      !organizationId ||
      !action
    ) {
      throw this.createError(
        "Procedural memory requires organization and recovery action",
        "PROCEDURAL_MEMORY_INPUT_REQUIRED"
      );
    }


    if (
      !Array.isArray(
        outcomes
      )
    ) {
      throw this.createError(
        "Procedural memory outcomes must be an array",
        "PROCEDURAL_MEMORY_OUTCOMES_REQUIRED"
      );
    }


    const statistics =
      this
        .calculateStatistics(
          outcomes
        );


    if (
      statistics.conclusive <
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
      statistics.successRate <
      minimumSuccessRate
    ) {
      return {
        eligible:
          false,

        reason:
          "SUCCESS_RATE_BELOW_THRESHOLD",

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
      Math.max(
        0,

        Math.min(
          1,

          (
            statistics
              .successRate *
            0.6
          ) +
          (
            statistics
              .averageConfidence *
            0.25
          ) +
          (
            Math.min(
              statistics.conclusive /
              10,
              1
            ) *
            0.15
          )
        )
      );


    const trustScore =
      Math.max(
        0,

        Math.min(
          0.98,

          (
            statistics
              .successRate *
            0.65
          ) +
          (
            statistics
              .averageTrust *
            0.25
          ) +
          (
            Math.min(
              statistics.conclusive /
              20,
              1
            ) *
            0.1
          )
        )
      );


    const publicId =
      this
        .buildPublicId({
          organizationId,

          environmentId,

          serviceId,

          action,
        });


    const summary =
      (
        `${action} has succeeded in ` +
        `${statistics.successes} of ` +
        `${statistics.conclusive} conclusive recovery outcomes ` +
        `(${(statistics.successRate * 100).toFixed(0)}% success rate)` +
        (
          serviceId
            ? ` for service ${serviceId}.`
            : environmentId
              ? " in this environment."
              : " for this tenant."
        )
      );


    const sources =
      statistics
        .outcomes
        .map(
          (
            outcome
          ) => ({
            sourceType:
              "OUTCOME_MEMORY",

            sourceId:
              outcome.publicId,

            evidenceRole:
              outcome.successful
                ? "SUPPORTING"
                : outcome.failed
                  ? "CONTRADICTING"
                  : "SUPPORTING",

            observedAt:
              outcome.observedAt,
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
            .PROCEDURAL,

        scopeType:
          scope.scopeType,

        title:
          `Recovery procedure: ${action}`,

        summary,

        content: {
          procedure: {
            action,

            executionAuthorized:
              false,
          },

          evidence: {
            totalObserved:
              statistics.total,

            conclusive:
              statistics.conclusive,

            successes:
              statistics.successes,

            failures:
              statistics.failures,

            inconclusive:
              statistics.inconclusive,

            successRate:
              statistics.successRate,

            minimumEvidence,

            minimumSuccessRate,
          },

          applicability: {
            organizationId,

            environmentId,

            serviceId,
          },

          supportingOutcomeIds:
            statistics
              .outcomes
              .map(
                (
                  outcome
                ) =>
                  outcome.publicId
              ),
        },

        confidence,

        trustScore,

        importance:
          Math.min(
            1,

            0.6 +
            (
              statistics.successRate *
              0.3
            ) +
            (
              Math.min(
                statistics.conclusive /
                20,
                1
              ) *
              0.1
            )
          ),

        status:
          "ACTIVE",

        sourceType:
          "OUTCOME_SYNTHESIS",

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
          statistics
            .outcomes
            .map(
              (
                outcome
              ) =>
                outcome.observedAt
                  ? new Date(
                      outcome.observedAt
                    )
                  : null
            )
            .filter(
              Boolean
            )
            .sort(
              (
                a,
                b
              ) =>
                b -
                a
            )[0] ||
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
            "16.10",

          generator:
            "proceduralMemoryBuilder",

          authoritativeStore:
            "postgresql",

          retrievalStore:
            "qdrant",

          executionAuthorized:
            false,

          evidenceThreshold:
            minimumEvidence,

          successThreshold:
            minimumSuccessRate,
        },

        schemaVersion:
          1,
      },
    };
  }
}


const proceduralMemoryBuilder =
  new ProceduralMemoryBuilder();


module.exports = {
  ProceduralMemoryBuilder,

  proceduralMemoryBuilder,
};