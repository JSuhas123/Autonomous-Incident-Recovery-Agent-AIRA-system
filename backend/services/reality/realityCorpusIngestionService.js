"use strict";


const {
  assertIngestionAllowed,

  SOURCE_POLICY_STATUS,

  CORPUS_ROLE,
} =
  require(
    "./realityCorpusPolicyService"
  );


const RealityCorpusService =
  require(
    "./realityCorpusService"
  );


const RealityEvidenceStoreService =
  require(
    "./realityEvidenceStoreService"
  );


const REALITY_CORPUS_INGESTION_VERSION =
  "23R.13S.0";


function ingestionError(
  code,
  message,
  status =
    422
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      status,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


function requireValue(
  value,
  field,
  code
) {
  if (
    value ===
      undefined ||

    value ===
      null ||

    String(
      value
    ).trim() ===
      ""
  ) {
    throw ingestionError(
      code,
      `${field} is required`
    );
  }


  return value;
}


function assertCommercialIngestionPolicy(
  input =
    {}
) {
  const decision =
    input.policyDecision;


  if (
    !decision ||

    typeof decision !==
      "object"
  ) {
    throw ingestionError(
      "REALITY_CORPUS_POLICY_DECISION_REQUIRED",
      "policyDecision is required"
    );
  }


  if (
    decision.policyStatus !==
      SOURCE_POLICY_STATUS
        .APPROVED_COMMERCIAL
  ) {
    throw ingestionError(
      "REALITY_CORPUS_COMMERCIAL_INGESTION_FORBIDDEN",
      "only approved commercial sources may enter the commercial canonical corpus",
      403
    );
  }


  const eligibility =
    decision.eligibility;


  if (
    !eligibility ||

    typeof eligibility !==
      "object"
  ) {
    throw ingestionError(
      "REALITY_CORPUS_ELIGIBILITY_REQUIRED",
      "policyDecision.eligibility is required"
    );
  }


  /*
   * Ground truth is never an ingestion capability.
   */
  if (
    eligibility
      .agentGroundTruthVisible !==
      false
  ) {
    throw ingestionError(
      "REALITY_GROUND_TRUTH_LEAKAGE",
      "ground truth must never be agent-visible",
      403
    );
  }


  /*
   * Permanent final-holdout firewall.
   *
   * Holdout material must not simultaneously be usable
   * for training, retrieval, development, validation or
   * customer runtime.
   */
  if (
    input.partition ===
      "HOLDOUT"
  ) {
    const forbidden = [
      "modelTrainingEligible",

      "retrievalEligible",

      "developmentEvaluationEligible",

      "validationEligible",

      "customerRuntimeEligible",
    ];


    if (
      forbidden.some(
        key =>
          eligibility[
            key
          ] ===
          true
      )
    ) {
      throw ingestionError(
        "REALITY_HOLDOUT_CONTAMINATION",
        "holdout case is contaminated by commercial-use eligibility",
        403
      );
    }


    if (
      eligibility
        .holdoutEligible !==
      true
    ) {
      throw ingestionError(
        "REALITY_HOLDOUT_NOT_ELIGIBLE",
        "case is not holdout eligible",
        403
      );
    }
  }


  /*
   * Reuse the frozen runtime corpus-policy destination
   * gate rather than implementing a second routing policy.
   */
  return assertIngestionAllowed(
    decision,
    "APPROVED"
  );
}


class RealityCorpusIngestionService {
  constructor(
    options =
      {}
  ) {
    this.corpusService =
      options.corpusService ||

      new RealityCorpusService(
        options
      );


    this.evidenceStore =
      options.evidenceStore ||

      new RealityEvidenceStoreService(
        options
      );
  }


  async ingestNormalizedCase(
    input =
      {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,
        "organizationId",
        "REALITY_ORGANIZATION_REQUIRED"
      );


    const environmentId =
      requireValue(
        input.environmentId,
        "environmentId",
        "REALITY_ENVIRONMENT_REQUIRED"
      );


    const corpusId =
      requireValue(
        input.corpusId,
        "corpusId",
        "REALITY_CORPUS_REQUIRED"
      );


    const partition =
      requireValue(
        input.partition,
        "partition",
        "REALITY_CORPUS_PARTITION_REQUIRED"
      );


    assertCommercialIngestionPolicy({
      policyDecision:
        input.policyDecision,

      partition,
    });


    const realityCase =
      input.realityCase;


    if (
      !realityCase ||

      typeof realityCase !==
        "object" ||

      Array.isArray(
        realityCase
      )
    ) {
      throw ingestionError(
        "REALITY_CASE_REQUIRED",
        "normalized RealityCase is required"
      );
    }


    /*
     * PostgreSQL canonical case registration comes first.
     *
     * RealityCorpusService still owns:
     *
     * - frozen RealityCase validation
     * - answer sealing
     * - case-version hashing
     * - tenant scope
     * - canonical PostgreSQL persistence
     */
    const registered =
      await this.corpusService
        .registerCase({
          organizationId,

          environmentId,

          corpusId,

          datasetSourceId:
            input.datasetSourceId ||
            null,

          realityCase,

          caseMetadata: {
            ...(
              input.caseMetadata ||
              {}
            ),

            corpusPartition:
              partition,

            corpusRole:
              input.corpusRole ||
              null,

            policyStatus:
              input
                .policyDecision
                .policyStatus,

            eligibility:
              input
                .policyDecision
                .eligibility,

            ingestionVersion:
              REALITY_CORPUS_INGESTION_VERSION,
          },

          versionMetadata: {
            ...(
              input.versionMetadata ||
              {}
            ),

            integrityManifest:
              input.integrityManifest ||
              null,
          },

          groundTruthMetadata:
            input.groundTruthMetadata ||
            {},

          executionAuthorized:
            false,
        });


    const storedArtifacts =
      [];


    /*
     * Artifact persistence reuses Phase 23R object storage.
     *
     * RealityEvidenceStoreService writes immutable
     * content-addressed bytes before registering the
     * PostgreSQL metadata reference.
     */
    for (
      const artifact
      of input.artifacts ||
      []
    ) {
      requireValue(
        artifact.artifactId,
        "artifact.artifactId",
        "REALITY_ARTIFACT_ID_REQUIRED"
      );


      requireValue(
        artifact.artifactKind,
        "artifact.artifactKind",
        "REALITY_ARTIFACT_KIND_REQUIRED"
      );


      const stored =
        await this.evidenceStore
          .storeArtifact({
            organizationId,

            environmentId,

            caseId:
              registered.casePublicId ||
              registered.caseId,

            artifactId:
              artifact.artifactId,

            artifactKind:
              artifact.artifactKind,

            channel:
              artifact.channel,

            body:
              artifact.body,

            mediaType:
              artifact.mediaType,

            provenance: {
              ...(
                artifact.provenance ||
                {}
              ),

              corpusPartition:
                partition,

              policyStatus:
                input
                  .policyDecision
                  .policyStatus,

              ingestionVersion:
                REALITY_CORPUS_INGESTION_VERSION,
            },

            executionAuthorized:
              false,
          });


      storedArtifacts.push(
        stored
      );
    }


    /*
     * Phase 23R.13S does NOT silently index the case.
     *
     * Retrieval indexing requires a separate approved
     * representation and retrieval eligibility check.
     *
     * In particular:
     *
     * HOLDOUT          -> never indexed
     * RESEARCH_ONLY    -> never indexed into commercial Qdrant
     * QUARANTINED      -> never reaches this service
     *
     * Qdrant remains derivative, not authoritative.
     */
    return {
      version:
        REALITY_CORPUS_INGESTION_VERSION,

      case:
        registered,

      artifacts:
        storedArtifacts,

      partition,

      policyStatus:
        input
          .policyDecision
          .policyStatus,

      qdrantIndexed:
        false,

      executionAuthorized:
        false,

      productionCertified:
        false,
    };
  }
}


module.exports = {
  REALITY_CORPUS_INGESTION_VERSION,

  assertCommercialIngestionPolicy,

  RealityCorpusIngestionService,

  CORPUS_ROLE,
};