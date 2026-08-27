"use strict";


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


class OutcomeMemoryBuilder {

  normalizeArray(
    value
  ) {
    return Array.isArray(
      value
    )
      ? value
      : [];
  }


  getIncidentId(
    incident
  ) {
    return (
      incident?._id ||
      incident?.publicId ||
      incident?.incidentId ||
      null
    );
  }


  getDecisionId(
    decision
  ) {
    return (
      decision?.decisionId ||
      decision?.recoveryDecisionId ||
      decision?._id ||
      decision?.publicId ||
      null
    );
  }


  getVerificationId(
    verification
  ) {
    return (
      verification?.verificationId ||
      verification?._id ||
      verification?.publicId ||
      null
    );
  }


  buildPublicId({
    incidentId,
    verificationId,
  }) {
    return (
      "mem_outcome_" +
      String(
        incidentId
      ) +
      "_" +
      String(
        verificationId
      )
    );
  }


  classifyOutcome(
    verification
  ) {
    if (
      verification
        ?.recoveryConfirmed ===
      true
    ) {
      return "SUCCESS";
    }


    if (
      verification
        ?.recoveryConfirmed ===
        false &&
      verification
        ?.decision
    ) {
      const normalized =
        String(
          verification.decision
        )
          .toUpperCase();


      if (
        normalized.includes(
          "FAILED"
        ) ||
        normalized.includes(
          "FAILURE"
        )
      ) {
        return "FAILED";
      }
    }


    return "INCONCLUSIVE";
  }


  calculateConfidence(
    verification
  ) {
    const value =
      Number(
        verification
          ?.confidence
      );


    if (
      Number.isFinite(
        value
      )
    ) {
      return Math.max(
        0,
        Math.min(
          1,
          value
        )
      );
    }


    if (
      verification
        ?.recoveryConfirmed ===
      true
    ) {
      return 0.95;
    }


    return 0.65;
  }


  calculateTrustScore(
    verification
  ) {
    const evidencePackage =
      verification
        ?.evidencePackage ||
      {};


    const evidenceCount =
      Array.isArray(
        evidencePackage
          ?.evidence
      )
        ? evidencePackage
            .evidence
            .length
        : Object.keys(
            evidencePackage
          ).length;


    let score =
      0.6;


    if (
      verification
        ?.recoveryConfirmed ===
      true
    ) {
      score +=
        0.2;
    }


    if (
      verification
        ?.incidentClosureEligible ===
      true
    ) {
      score +=
        0.1;
    }


    if (
      evidenceCount >
      0
    ) {
      score +=
        0.05;
    }


    return Math.min(
      0.98,
      score
    );
  }


  getRecoveryAction(
    decision
  ) {
    return (
      decision
        ?.action ||
      decision
        ?.decision ||
      decision
        ?.selectedAction ||
      decision
        ?.candidate
        ?.action ||
      null
    );
  }


  buildSummary({
    incidentId,
    decision,
    verification,
  }) {
    const action =
      this.getRecoveryAction(
        decision
      ) ||
      "unknown recovery action";


    const outcome =
      this.classifyOutcome(
        verification
      );


    const confidence =
      this.calculateConfidence(
        verification
      );


    const closure =
      verification
        ?.incidentClosureEligible ===
      true
        ? "Incident became closure eligible."
        : "Incident was not closure eligible from this verification.";


    return (
      `Recovery outcome for incident ${incidentId}: ` +
      `${action} resulted in ${outcome}. ` +
      `Verification confidence ${(confidence * 100).toFixed(0)}%. ` +
      closure
    );
  }


  build({
    organizationId,

    environmentId,

    incident,

    decision,

    verification,
  }) {
    if (
      !organizationId ||
      !environmentId ||
      !incident ||
      !verification
    ) {
      const error =
        new Error(
          "Outcome memory requires organization, environment, incident and verification"
        );

      error.code =
        "OUTCOME_MEMORY_INPUT_REQUIRED";

      error.status =
        422;

      throw error;
    }


    const incidentId =
      this.getIncidentId(
        incident
      );


    const verificationId =
      this.getVerificationId(
        verification
      );


    const decisionId =
      decision
        ? this
            .getDecisionId(
              decision
            )
        : null;


    if (
      !incidentId ||
      !verificationId
    ) {
      const error =
        new Error(
          "Outcome memory requires incident and verification identifiers"
        );

      error.code =
        "OUTCOME_MEMORY_IDENTITY_REQUIRED";

      error.status =
        422;

      throw error;
    }


    const outcome =
      this.classifyOutcome(
        verification
      );


    const confidence =
      this.calculateConfidence(
        verification
      );


    const trustScore =
      this.calculateTrustScore(
        verification
      );


    const sources = [
      {
        sourceType:
          "INCIDENT",

        sourceId:
          incidentId,

        evidenceRole:
          "SUPPORTING",

        observedAt:
          incident.updatedAt ||
          incident.createdAt ||
          null,
      },

      {
        sourceType:
          "VERIFICATION",

        sourceId:
          verificationId,

        evidenceRole:
          verification
            ?.recoveryConfirmed ===
            true
            ? "PRIMARY"
            : "SUPPORTING",

        observedAt:
          verification.verifiedAt ||
          verification.updatedAt ||
          verification.createdAt ||
          null,
      },
    ];


    if (
      decisionId
    ) {
      sources.push({
        sourceType:
          "RECOVERY_DECISION",

        sourceId:
          decisionId,

        evidenceRole:
          "SUPPORTING",

        observedAt:
          decision.updatedAt ||
          decision.createdAt ||
          null,
      });
    }


    return {
      memory: {
        publicId:
          this.buildPublicId({
            incidentId,

            verificationId,
          }),

        organizationId,

        environmentId,

        serviceId:
          incident.serviceId ||
          null,

        incidentId,

        memoryType:
          MEMORY_TYPES
            .OUTCOME,

        scopeType:
          MEMORY_SCOPES
            .INCIDENT,

        title:
          `Recovery outcome: ${incidentId}`,

        summary:
          this
            .buildSummary({
              incidentId,

              decision,

              verification,
            }),

        content: {
          incident: {
            id:
              incidentId,

            status:
              incident.status ||
              null,

            severity:
              incident.severity ||
              null,

            serviceId:
              incident.serviceId ||
              null,
          },

          recoveryDecision: {
            id:
              decisionId,

            status:
              decision
                ?.status ||
              null,

            decision:
              decision
                ?.decision ||
              null,

            action:
              this
                .getRecoveryAction(
                  decision
                ),

            revision:
              decision
                ?.revision ??
              null,

            executionAuthorized:
              false,
          },

          verification: {
            id:
              verificationId,

            status:
              verification.status ||
              null,

            decision:
              verification.decision ||
              null,

            recovered:
              verification.recovered ??
              null,

            recoveryConfirmed:
              verification.recoveryConfirmed ??
              null,

            incidentClosureEligible:
              verification.incidentClosureEligible ??
              null,

            confidence:
              verification.confidence ??
              null,

            overallScore:
              verification.overallScore ??
              null,

            nextAction:
              verification.nextAction ||
              null,

            executionRequestId:
              verification.executionRequestId ||
              null,

            authorizationId:
              verification.authorizationId ||
              null,

            executionPlanId:
              verification.executionPlanId ||
              null,

            verifiedAt:
              verification.verifiedAt ||
              null,

            evidencePackage:
              verification.evidencePackage ||
              {},

            criticResult:
              verification.criticResult ||
              {},

            routingResult:
              verification.routingResult ||
              {},
          },

          outcome: {
            classification:
              outcome,

            successful:
              outcome ===
              "SUCCESS",

            failed:
              outcome ===
              "FAILED",

            inconclusive:
              outcome ===
              "INCONCLUSIVE",

            closureEligible:
              verification
                ?.incidentClosureEligible ===
              true,

            recoveryConfirmed:
              verification
                ?.recoveryConfirmed ===
              true,
          },
        },

        confidence,

        trustScore,

        importance:
          outcome ===
            "FAILED"
            ? 1
            : outcome ===
                "SUCCESS"
              ? 0.9
              : 0.8,

        status:
          "ACTIVE",

        sourceType:
          "RECOVERY_OUTCOME",

        sourceCount:
          0,

        evidenceCount:
          sources.length,

        observationCount:
          1,

        observedAt:
          verification.verifiedAt ||
          verification.updatedAt ||
          new Date(),

        validFrom:
          decision
            ?.createdAt ||
          incident.createdAt ||
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
            "16.9",

          generator:
            "outcomeMemoryBuilder",

          authoritativeStore:
            "postgresql",

          retrievalStore:
            "qdrant",

          executionAuthorized:
            false,
        },

        schemaVersion:
          1,
      },

      sources,
    };
  }
}


const outcomeMemoryBuilder =
  new OutcomeMemoryBuilder();


module.exports = {
  OutcomeMemoryBuilder,

  outcomeMemoryBuilder,
};