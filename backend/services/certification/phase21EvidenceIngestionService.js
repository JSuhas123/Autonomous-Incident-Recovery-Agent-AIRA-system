"use strict";


const crypto =
  require(
    "node:crypto"
  );


const INGESTION_VERSION =
  "22.3-phase21-evidence-ingestion-v1";


class Phase21EvidenceIngestionService {
  constructor({
    certificationRepository,
    phase21Reader,
  } = {}) {
    if (
      !certificationRepository
    ) {
      throw serviceError(
        "CERTIFICATION_REPOSITORY_REQUIRED",

        "certificationRepository is required"
      );
    }


    if (
      !phase21Reader
    ) {
      throw serviceError(
        "PHASE21_READER_REQUIRED",

        "phase21Reader is required"
      );
    }


    this.certificationRepository =
      certificationRepository;

    this.phase21Reader =
      phase21Reader;
  }


  async ingest({
    organizationId,

    environmentId,

    certificationRunId,

    experimentRunId,

    artifacts,
  } = {}) {
    if (
      !organizationId ||
      !environmentId ||
      !certificationRunId
    ) {
      throw serviceError(
        "PHASE22_3_SCOPE_REQUIRED",

        "organizationId, environmentId and certificationRunId are required"
      );
    }


    if (
      !Array.isArray(
        artifacts
      ) ||

      artifacts.length ===
        0
    ) {
      throw serviceError(
        "PHASE21_ARTIFACTS_REQUIRED",

        "At least one Phase-21 artifact is required"
      );
    }


    const normalizedArtifacts =
      artifacts.map(
        normalizeArtifactInput
      );


    for (
      const artifact
      of normalizedArtifacts
    ) {
      assertPhase21ArtifactSafe(
        artifact.content,
        artifact.name
      );
    }


    const persisted =
      [];


    /*
     * ------------------------------------------------------------------------
     * Frozen Phase-21 certification artifacts
     * ------------------------------------------------------------------------
     *
     * Phase 22 stores only a cryptographic reference + provenance.
     * The Phase-21 source artifact itself is never modified.
     */
    for (
      const artifact
      of normalizedArtifacts
    ) {
      const hash =
        sha256(
          artifact.rawText
        );


      const lineage =
        extractLineage(
          artifact.content
        );


      const evidence =
        await this.certificationRepository
          .appendEvidenceLink({
            organizationId,

            environmentId,

            certificationRunId,

            evidenceType:
              "PHASE21_CERTIFICATION_ARTIFACT",

            sourceType:
              "PHASE21_FROZEN_ARTIFACT",

            sourceRef:
              artifact.name,

            sourceHash:
              hash,

            observedAt:
              extractObservedAt(
                artifact.content
              ),

            provenance: {
              ingestionVersion:
                INGESTION_VERSION,

              sourcePhase:
                21,

              immutableSource:
                true,

              hashAlgorithm:
                "sha256",

              lineage,

              productionCertified:
                false,

              phase21ExecutionAuthorized:
                false,

              groundTruthToAira:
                false,

              executionAuthorized:
                false,
            },
          });


      persisted.push({
        name:
          artifact.name,

        hash,

        lineage,

        publicId:
          evidence.publicId ||
          evidence.public_id ||
          null,
      });
    }


    /*
     * ------------------------------------------------------------------------
     * Canonical Phase-21 PostgreSQL evidence
     * ------------------------------------------------------------------------
     */
    let postgresEvidence =
      null;


    if (
      experimentRunId
    ) {
      const snapshot =
        await this.phase21Reader
          .readExperimentEvidence({
            organizationId,

            environmentId,

            experimentRunId,
          });


      assertCanonicalSnapshotSafe(
        snapshot
      );


      const canonical =
        stableStringify(
          snapshot
        );


      const sourceHash =
        sha256(
          canonical
        );


      const evidence =
        await this.certificationRepository
          .appendEvidenceLink({
            organizationId,

            environmentId,

            certificationRunId,

            evidenceType:
              "PHASE21_CANONICAL_POSTGRES_EVIDENCE",

            sourceType:
              "POSTGRESQL_RELIABILITY_SCHEMA",

            sourceRef:
              experimentRunId,

            sourceHash,

            observedAt:
              snapshot
                .experimentRun
                ?.completed_at ||

              snapshot
                .experimentRun
                ?.updated_at ||

              snapshot
                .experimentRun
                ?.created_at ||

              new Date(),

            provenance: {
              ingestionVersion:
                INGESTION_VERSION,

              sourcePhase:
                21,

              canonicalStore:
                "POSTGRESQL",

              schema:
                "reliability",

              experimentRunId,

              failureInjectionCount:
                snapshot
                  .failureInjections
                  .length,

              observationCount:
                snapshot
                  .observations
                  .length,

              assertionCount:
                snapshot
                  .assertionResults
                  .length,

              metricCount:
                snapshot
                  .metrics
                  .length,

              sourceImmutableFromPhase22:
                true,

              executionAuthorized:
                false,
            },
          });


      postgresEvidence = {
        experimentRunId,

        hash:
          sourceHash,

        publicId:
          evidence.publicId ||
          evidence.public_id ||
          null,

        failureInjectionCount:
          snapshot
            .failureInjections
            .length,

        observationCount:
          snapshot
            .observations
            .length,

        assertionCount:
          snapshot
            .assertionResults
            .length,

        metricCount:
          snapshot
            .metrics
            .length,
      };
    }


    /*
     * A deterministic digest represents the complete imported evidence bundle.
     *
     * This digest becomes useful later when Phase 22 issues immutable
     * certification certificates.
     */
    const evidenceDigest =
      sha256(
        stableStringify({
          artifacts:
            persisted.map(
              ({
                name,
                hash,
              }) => ({
                name,
                hash,
              })
            ),

          postgresEvidence:
            postgresEvidence
              ? {
                  experimentRunId:
                    postgresEvidence
                      .experimentRunId,

                  hash:
                    postgresEvidence
                      .hash,
                }
              : null,
        })
      );


    return Object.freeze({
      ingestionVersion:
        INGESTION_VERSION,

      artifactCount:
        persisted.length,

      artifacts:
        persisted,

      postgresEvidence,

      evidenceDigest,

      productionCertified:
        false,

      executionAuthorized:
        false,

      phase21EvidenceMutated:
        false,

      groundTruthToAira:
        false,
    });
  }
}


/*
 * ============================================================================
 * ARTIFACT NORMALIZATION
 * ============================================================================
 */


function normalizeArtifactInput(
  input
) {
  if (
    !input?.name
  ) {
    throw serviceError(
      "PHASE21_ARTIFACT_NAME_REQUIRED",

      "Phase-21 artifact name is required"
    );
  }


  let content =
    input.content;

  let rawText =
    input.rawText;


  if (
    !content &&
    typeof rawText ===
      "string"
  ) {
    try {
      content =
        JSON.parse(
          rawText
        );
    } catch (
      error
    ) {
      throw serviceError(
        "PHASE21_ARTIFACT_JSON_INVALID",

        `Phase-21 artifact ${input.name} is not valid JSON`
      );
    }
  }


  if (
    !content ||
    typeof content !==
      "object"
  ) {
    throw serviceError(
      "PHASE21_ARTIFACT_CONTENT_REQUIRED",

      `Phase-21 artifact ${input.name} has no object content`
    );
  }


  if (
    typeof rawText !==
      "string"
  ) {
    rawText =
      stableStringify(
        content
      );
  }


  return {
    name:
      input.name,

    content,

    rawText,
  };
}


/*
 * ============================================================================
 * PHASE-21 SAFETY VALIDATION
 * ============================================================================
 */


function assertPhase21ArtifactSafe(
  artifact,
  name =
    "unknown"
) {
  if (
    !artifactPasses(
      artifact
    )
  ) {
    throw serviceError(
      "PHASE21_ARTIFACT_NOT_PASSING",

      `Phase-21 artifact ${name} is not passing evidence`
    );
  }


  if (
    artifact
      .productionCertified ===
      true ||

    artifact
      .authority
      ?.productionCertified ===
      true
  ) {
    throw serviceError(
      "PHASE21_PRODUCTION_CERTIFICATION_FORBIDDEN",

      `Phase-21 artifact ${name} claims production certification`
    );
  }


  /*
   * Do NOT reject canonical Phase-20 authorization evidence.
   *
   * Batch 8B legitimately records:
   *
   * canonicalExecutionAuthorizationObserved = true
   *
   * That proves Phase 20 authorized an execution.
   *
   * What is forbidden here is Phase 21 itself claiming authority.
   */
  if (
    artifact
      .executionAuthorized ===
      true ||

    artifact
      .phase21ExecutionAuthorized ===
      true ||

    artifact
      .authority
      ?.executionAuthorized ===
      true ||

    artifact
      .authority
      ?.canGrantExecutionAuthorization ===
      true
  ) {
    throw serviceError(
      "PHASE21_AUTHORITY_LEAK",

      `Phase-21 artifact ${name} claims Phase-21 execution authority`
    );
  }


  if (
    artifact
      .groundTruthToAira ===
      true ||

    artifact
      .groundTruthLeaked ===
      true ||

    artifact
      .groundTruth
      ?.passedToAira ===
      true ||

    artifact
      .evaluation
      ?.groundTruthExposed ===
      true
  ) {
    throw serviceError(
      "PHASE21_GROUND_TRUTH_LEAK",

      `Phase-21 artifact ${name} exposes evaluator ground truth to AIRA`
    );
  }


  return true;
}


function artifactPasses(
  artifact
) {
  if (
    artifact.passed ===
      true ||

    artifact.pass ===
      true ||

    artifact.status ===
      "PASS" ||

    artifact.result ===
      "PASS" ||

    artifact.finalResult ===
      "PASS" ||

    artifact
      .finalResult
      ?.pass ===
      true ||

    artifact
      .finalResult
      ?.status ===
      "PASS" ||

    artifact
      .evaluation
      ?.overall ===
      "PASS" ||

    artifact
      .evaluation
      ?.result ===
      "PASS"
  ) {
    return true;
  }


  /*
   * Batch 7 predates the generic pass/passed flag.
   *
   * Its certification is considered passing only when every recorded
   * assertion is explicitly PASS.
   */
  const assertions =
    artifact.assertions;


  if (
    assertions &&
    typeof assertions ===
      "object"
  ) {
    const values =
      Object.values(
        assertions
      );


    return (
      values.length >
        0 &&

      values.every(
        value =>
          value ===
          "PASS"
      )
    );
  }


  return false;
}


/*
 * ============================================================================
 * CANONICAL POSTGRES SAFETY
 * ============================================================================
 */


function assertCanonicalSnapshotSafe(
  snapshot
) {
  if (
    !snapshot
      ?.experimentRun
  ) {
    throw serviceError(
      "PHASE21_CANONICAL_SNAPSHOT_INVALID",

      "Canonical Phase-21 PostgreSQL snapshot is missing the experiment run"
    );
  }


  const rows = [
    snapshot
      .experimentRun,

    ...(
      snapshot
        .failureInjections ||
      []
    ),

    ...(
      snapshot
        .observations ||
      []
    ),

    ...(
      snapshot
        .assertionResults ||
      []
    ),

    ...(
      snapshot
        .metrics ||
      []
    ),
  ];


  const authorityLeak =
    rows.some(
      row =>
        row
          ?.execution_authorized ===
          true ||

        row
          ?.executionAuthorized ===
          true
    );


  if (
    authorityLeak
  ) {
    throw serviceError(
      "PHASE21_CANONICAL_EVIDENCE_AUTHORITY_LEAK",

      "Canonical Phase-21 reliability evidence contains execution_authorized=true"
    );
  }


  return true;
}


/*
 * ============================================================================
 * LINEAGE
 * ============================================================================
 */


function extractLineage(
  artifact
) {
  return compactObject({
    certificateVersion:
      artifact
        .certificateVersion ||
      artifact
        .certificate ||
      null,

    phase:
      artifact.phase ||
      null,

    batch:
      artifact.batch ||
      null,

    labEnvironmentId:
      artifact
        .labEnvironmentId ||
      null,

    experimentRunId:
      artifact
        .experimentRunId ||
      null,

    incidentId:
      artifact
        .incidentId ||
      null,

    signalId:
      artifact.signalId ||
      null,

    correlationGroupId:
      artifact
        .correlationGroupId ||
      null,

    diagnosisRunId:
      artifact
        .diagnosisRunId ||
      artifact
        .diagnosisId ||
      null,

    recoveryDecisionId:
      artifact
        .recoveryDecisionId ||
      null,

    authorizationId:
      artifact
        .authorizationId ||
      null,

    executionRequestId:
      artifact
        .executionRequestId ||
      null,

    planId:
      artifact.planId ||
      null,

    selectedPlaybookId:
      artifact
        .selectedPlaybookId ||
      null,

    selectedFailureMode:
      artifact
        .selectedFailureMode ||
      null,
  });
}


function extractObservedAt(
  artifact
) {
  return (
    artifact.certifiedAt ||

    artifact.generatedAt ||

    artifact.createdAt ||

    artifact.completedAt ||

    null
  );
}


/*
 * ============================================================================
 * DETERMINISTIC HASHING
 * ============================================================================
 */


function compactObject(
  value
) {
  return Object.fromEntries(
    Object
      .entries(
        value
      )
      .filter(
        (
          [
            ,
            item,
          ]
        ) =>
          item !==
            null &&

          item !==
            undefined
      )
  );
}


function sha256(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      String(
        value
      ),
      "utf8"
    )
    .digest(
      "hex"
    );
}


function stableStringify(
  value
) {
  return JSON.stringify(
    normalize(
      value
    )
  );
}


function normalize(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      normalize
    );
  }


  if (
    value instanceof
      Date
  ) {
    return value
      .toISOString();
  }


  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.keys(
      value
    )
      .sort()
      .reduce(
        (
          result,
          key
        ) => {
          if (
            value[key] !==
              undefined
          ) {
            result[key] =
              normalize(
                value[key]
              );
          }


          return result;
        },

        {}
      );
  }


  return value;
}


function serviceError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "Phase21EvidenceIngestionError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


module.exports = {
  INGESTION_VERSION,

  Phase21EvidenceIngestionService,

  assertPhase21ArtifactSafe,

  assertCanonicalSnapshotSafe,

  extractLineage,

  stableStringify,
};