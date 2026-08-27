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


class EpisodicMemoryBuilder {

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


  getDiagnosisId(
    diagnosis
  ) {
    return (
      diagnosis?.diagnosisId ||
      diagnosis?._id ||
      diagnosis?.publicId ||
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


  buildPublicId(
    incidentId
  ) {
    return (
      "mem_episode_incident_" +
      String(
        incidentId
      )
    );
  }


  buildSummary({
    incident,
    diagnoses,
    decisions,
    verifications,
  }) {
    const incidentId =
      this.getIncidentId(
        incident
      );


    const severity =
      incident?.severity ||
      "unknown";


    const service =
      incident?.serviceId ||
      "unknown service";


    const latestDiagnosis =
      diagnoses[
        diagnoses.length -
        1
      ] ||
      null;


    const latestDecision =
      decisions[
        decisions.length -
        1
      ] ||
      null;


    const latestVerification =
      verifications[
        verifications.length -
        1
      ] ||
      null;


    const diagnosisText =
      latestDiagnosis
        ?.outcome ||
      latestDiagnosis
        ?.summary ||
      latestDiagnosis
        ?.status ||
      "no final diagnosis recorded";


    const decisionText =
      latestDecision
        ?.action ||
      latestDecision
        ?.decision ||
      latestDecision
        ?.status ||
      "no recovery decision recorded";


    const verificationText =
      latestVerification
        ?.decision ||
      (
        latestVerification
          ?.recoveryConfirmed ===
        true
          ? "recovery confirmed"
          : null
      ) ||
      latestVerification
        ?.status ||
      "no final verification recorded";


    return [
      `Incident ${incidentId}`,
      `affected ${service}`,
      `with severity ${severity}.`,
      `Diagnosis: ${diagnosisText}.`,
      `Recovery: ${decisionText}.`,
      `Verification: ${verificationText}.`,
    ]
      .join(
        " "
      );
  }


  calculateConfidence(
    verifications
  ) {
    const latest =
      verifications[
        verifications.length -
        1
      ];


    const value =
      Number(
        latest?.confidence
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
      latest
        ?.recoveryConfirmed ===
      true
    ) {
      return 0.95;
    }


    return 0.75;
  }


  calculateTrustScore(
    verifications
  ) {
    const latest =
      verifications[
        verifications.length -
        1
      ];


    if (
      latest
        ?.recoveryConfirmed ===
        true &&
      latest
        ?.incidentClosureEligible ===
        true
    ) {
      return 0.95;
    }


    if (
      latest
        ?.recoveryConfirmed ===
      true
    ) {
      return 0.9;
    }


    return 0.7;
  }


  build({
    organizationId,

    environmentId,

    incident,

    diagnoses =
      [],

    decisions =
      [],

    verifications =
      [],
  }) {
    if (
      !organizationId ||
      !environmentId ||
      !incident
    ) {
      const error =
        new Error(
          "Episodic memory requires organization, environment and incident"
        );

      error.code =
        "EPISODIC_MEMORY_SCOPE_REQUIRED";

      error.status =
        422;

      throw error;
    }


    const incidentId =
      this.getIncidentId(
        incident
      );


    if (
      !incidentId
    ) {
      const error =
        new Error(
          "Incident identifier required for episodic memory"
        );

      error.code =
        "EPISODIC_MEMORY_INCIDENT_ID_REQUIRED";

      error.status =
        422;

      throw error;
    }


    const normalizedDiagnoses =
      this.normalizeArray(
        diagnoses
      );


    const normalizedDecisions =
      this.normalizeArray(
        decisions
      );


    const normalizedVerifications =
      this.normalizeArray(
        verifications
      );


    const summary =
      this.buildSummary({
        incident,

        diagnoses:
          normalizedDiagnoses,

        decisions:
          normalizedDecisions,

        verifications:
          normalizedVerifications,
      });


    const sources = [
      {
        sourceType:
          "INCIDENT",

        sourceId:
          incidentId,

        evidenceRole:
          "PRIMARY",

        observedAt:
          incident.updatedAt ||
          incident.createdAt ||
          null,
      },

      ...normalizedDiagnoses
        .map(
          (
            diagnosis
          ) => ({
            sourceType:
              "DIAGNOSIS",

            sourceId:
              this.getDiagnosisId(
                diagnosis
              ),

            evidenceRole:
              "SUPPORTING",

            observedAt:
              diagnosis.updatedAt ||
              diagnosis.createdAt ||
              null,
          })
        )
        .filter(
          (
            source
          ) =>
            Boolean(
              source.sourceId
            )
        ),

      ...normalizedDecisions
        .map(
          (
            decision
          ) => ({
            sourceType:
              "RECOVERY_DECISION",

            sourceId:
              this.getDecisionId(
                decision
              ),

            evidenceRole:
              "SUPPORTING",

            observedAt:
              decision.updatedAt ||
              decision.createdAt ||
              null,
          })
        )
        .filter(
          (
            source
          ) =>
            Boolean(
              source.sourceId
            )
        ),

      ...normalizedVerifications
        .map(
          (
            verification
          ) => ({
            sourceType:
              "VERIFICATION",

            sourceId:
              this.getVerificationId(
                verification
              ),

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
          })
        )
        .filter(
          (
            source
          ) =>
            Boolean(
              source.sourceId
            )
        ),
    ];


    return {
      memory: {
        publicId:
          this.buildPublicId(
            incidentId
          ),

        organizationId,

        environmentId,

        serviceId:
          incident.serviceId ||
          null,

        incidentId,

        memoryType:
          MEMORY_TYPES
            .EPISODIC,

        scopeType:
          MEMORY_SCOPES
            .INCIDENT,

        title:
          `Incident episode: ${incidentId}`,

        summary,

        content: {
          incident: {
            id:
              incidentId,

            severity:
              incident.severity ||
              null,

            status:
              incident.status ||
              null,

            lifecycleState:
              incident.lifecycleState ||
              null,

            serviceId:
              incident.serviceId ||
              null,

            fingerprint:
              incident.fingerprint ||
              null,

            occurrenceCount:
              incident.occurrenceCount ||
              1,

            createdAt:
              incident.createdAt ||
              null,

            resolvedAt:
              incident.resolvedAt ||
              null,

            closedAt:
              incident.closedAt ||
              null,

            resolution:
              incident.resolution ||
              null,
          },

          diagnoses:
            normalizedDiagnoses,

          recoveryDecisions:
            normalizedDecisions,

          verifications:
            normalizedVerifications,

          chronology: {
            incidentCreatedAt:
              incident.createdAt ||
              null,

            incidentResolvedAt:
              incident.resolvedAt ||
              null,

            incidentClosedAt:
              incident.closedAt ||
              null,
          },
        },

        confidence:
          this.calculateConfidence(
            normalizedVerifications
          ),

        trustScore:
          this.calculateTrustScore(
            normalizedVerifications
          ),

        importance:
          incident.severity ===
            "critical"
            ? 1
            : incident.severity ===
                "high"
              ? 0.9
              : 0.75,

        status:
          "ACTIVE",

        sourceType:
          "INCIDENT_LIFECYCLE",

        sourceCount:
          0,

        evidenceCount:
          sources.length,

        observationCount:
          1,

        observedAt:
          incident.closedAt ||
          incident.resolvedAt ||
          incident.updatedAt ||
          new Date(),

        validFrom:
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
            "16.8",

          generator:
            "episodicMemoryBuilder",

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


const episodicMemoryBuilder =
  new EpisodicMemoryBuilder();


module.exports = {
  EpisodicMemoryBuilder,

  episodicMemoryBuilder,
};