"use strict";


const crypto =
  require(
    "node:crypto"
  );


const {
  REALITY_VISIBILITY,

  isKnownRealityArtifactKind,
} =
  require(
    "../../constants/reality"
  );


const {
  PythonRealityNormalizer,
} =
  require(
    "./PythonRealityNormalizer"
  );


const {
  RealityCorpusService,
} =
  require(
    "./realityCorpusService"
  );


const {
  RealityEvidenceStoreService,
} =
  require(
    "./realityEvidenceStoreService"
  );


const NORMALIZATION_SCHEMA_VERSION =
  "23R.3.0";


function ingestionError(
  code,
  message,
  status =
    422,
  metadata =
    {}
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

      ...metadata,
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


function sha256(
  buffer
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      buffer
    )
    .digest(
      "hex"
    );
}


function decodeBase64Strict(
  value
) {
  if (
    typeof value !==
      "string"
  ) {
    throw ingestionError(
      "REALITY_NORMALIZED_ARTIFACT_BODY_INVALID",
      "Normalized artifact contentBase64 must be a string"
    );
  }


  const normalized =
    value.replace(
      /\s+/g,
      ""
    );


  if (
    normalized.length %
      4 !==
      0 ||

    !/^[A-Za-z0-9+/]*={0,2}$/
      .test(
        normalized
      )
  ) {
    throw ingestionError(
      "REALITY_NORMALIZED_ARTIFACT_BASE64_INVALID",
      "Normalized artifact contentBase64 is invalid"
    );
  }


  return Buffer.from(
    normalized,
    "base64"
  );
}


function validateNormalizedBundle(
  normalized,

  {
    organizationId,
    environmentId,
  }
) {
  if (
    !normalized ||

    typeof normalized !==
      "object" ||

    Array.isArray(
      normalized
    )
  ) {
    throw ingestionError(
      "REALITY_NORMALIZER_OUTPUT_INVALID",
      "Normalized dataset bundle must be an object"
    );
  }


  if (
    normalized
      .schemaVersion !==
      NORMALIZATION_SCHEMA_VERSION
  ) {
    throw ingestionError(
      "REALITY_NORMALIZER_SCHEMA_UNSUPPORTED",
      `Unsupported normalization schema: ${normalized.schemaVersion}`
    );
  }


  if (
    normalized
      .executionAuthorized ===
      true
  ) {
    throw ingestionError(
      "REALITY_NORMALIZER_AUTHORITY_VIOLATION",
      "Normalized dataset cannot grant execution authority",
      500
    );
  }


  const realityCase =
    normalized
      .realityCase;


  if (
    !realityCase ||

    typeof realityCase !==
      "object"
  ) {
    throw ingestionError(
      "REALITY_NORMALIZED_CASE_REQUIRED",
      "Normalized dataset must contain realityCase"
    );
  }


  if (
    realityCase
      .scope
      ?.organizationId !==
      organizationId ||

    realityCase
      .scope
      ?.environmentId !==
      environmentId
  ) {
    throw ingestionError(
      "REALITY_NORMALIZED_SCOPE_MISMATCH",
      "Normalized RealityCase scope does not match ingestion scope",
      403
    );
  }


  if (
    realityCase
      .sealing
      ?.groundTruthAgentVisible !==
      false ||

    realityCase
      .sealing
      ?.evidenceVisibility !==
      REALITY_VISIBILITY
        .EVIDENCE ||

    realityCase
      .sealing
      ?.evaluationVisibility !==
      REALITY_VISIBILITY
        .SEALED_EVALUATION
  ) {
    throw ingestionError(
      "REALITY_NORMALIZED_SEALING_INVALID",
      "Normalized RealityCase answer-sealing boundary is invalid",
      403
    );
  }


  if (
    !Array.isArray(
      normalized.artifacts
    ) ||

    normalized
      .artifacts
      .length ===
      0
  ) {
    throw ingestionError(
      "REALITY_NORMALIZED_ARTIFACTS_REQUIRED",
      "Normalized dataset must contain artifacts"
    );
  }


  const artifactIds =
    new Set();


  for (
    const artifact
    of normalized.artifacts
  ) {
    requireValue(
      artifact.artifactId,

      "artifact.artifactId",

      "REALITY_ARTIFACT_ID_REQUIRED"
    );


    if (
      artifactIds.has(
        artifact.artifactId
      )
    ) {
      throw ingestionError(
        "REALITY_NORMALIZED_ARTIFACT_DUPLICATE_ID",
        `Duplicate normalized artifactId: ${artifact.artifactId}`
      );
    }


    artifactIds.add(
      artifact.artifactId
    );


    if (
      !isKnownRealityArtifactKind(
        artifact.kind
      )
    ) {
      throw ingestionError(
        "REALITY_NORMALIZED_ARTIFACT_KIND_INVALID",
        `Invalid normalized artifact kind: ${artifact.kind}`
      );
    }


    if (
      artifact.channel !==
      REALITY_VISIBILITY
        .EVIDENCE
    ) {
      throw ingestionError(
        "REALITY_NORMALIZED_SEALED_ARTIFACT_FORBIDDEN",
        "Dataset ingestion artifacts must remain in the EVIDENCE channel",
        403
      );
    }


    if (
      artifact
        .trustedGroundTruth ===
        true ||

      artifact
        .executionAuthorized ===
        true
    ) {
      throw ingestionError(
        "REALITY_NORMALIZED_ARTIFACT_AUTHORITY_VIOLATION",
        "Normalized artifact cannot establish truth or execution authority",
        403
      );
    }


    const body =
      decodeBase64Strict(
        artifact
          .contentBase64
      );


    const actualHash =
      sha256(
        body
      );


    if (
      actualHash !==
        String(
          artifact.contentHash ||
          ""
        )
          .toLowerCase()
    ) {
      throw ingestionError(
        "REALITY_NORMALIZED_ARTIFACT_HASH_MISMATCH",
        `Normalized artifact hash mismatch: ${artifact.artifactId}`,
        409
      );
    }


    if (
      body.length !==
        Number(
          artifact.byteSize
        )
    ) {
      throw ingestionError(
        "REALITY_NORMALIZED_ARTIFACT_SIZE_MISMATCH",
        `Normalized artifact byte size mismatch: ${artifact.artifactId}`,
        409
      );
    }
  }


  return true;
}


class RealityDatasetIngestionService {
  constructor(
    options =
      {}
  ) {
    this.normalizer =
      options.normalizer ||

      new PythonRealityNormalizer(
        options.python ||
        {}
      );


    this.corpusService =
      options.corpusService ||

      new RealityCorpusService(
        options.corpus ||
        {}
      );


    this.evidenceStore =
      options.evidenceStore ||

      new RealityEvidenceStoreService(
        options.evidence ||
        {}
      );
  }


  async ingestRawDataset(
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


    if (
      !input.rawDataset ||

      typeof input.rawDataset !==
        "object" ||

      Array.isArray(
        input.rawDataset
      )
    ) {
      throw ingestionError(
        "REALITY_RAW_DATASET_INVALID",
        "rawDataset must be an object"
      );
    }


    const normalized =
      await this.normalizer
        .normalize(
          input.rawDataset
        );


    validateNormalizedBundle(
      normalized,

      {
        organizationId,

        environmentId,
      }
    );


    const source =
      normalized
        .sourceRegistration;


    if (
      !source ||

      typeof source !==
        "object"
    ) {
      throw ingestionError(
        "REALITY_NORMALIZED_SOURCE_REQUIRED",
        "Normalized dataset must contain sourceRegistration"
      );
    }


    const registeredSource =
      await this.corpusService
        .createDatasetSource({
          organizationId,

          environmentId,


          publicId:
            source.publicId,


          sourceKind:
            source.sourceKind,


          sourceName:
            source.sourceName,


          sourceVersion:
            source.sourceVersion,


          license:
            source.license,


          sourceUri:
            source.sourceUri ||
            null,


          modified:
            source.modified ===
            true,


          groundTruthMethod:
            source
              .groundTruthMethod,


          metadata:
            source.metadata ||
            {},


          executionAuthorized:
            false,
        });


    const registeredCase =
      await this.corpusService
        .registerCase({
          organizationId,

          environmentId,

          corpusId,


          datasetSourceId:
            registeredSource.publicId ||

            registeredSource.id,


          realityCase:
            normalized
              .realityCase,


          caseMetadata: {
            ingestionAdapter:
              normalized.adapter,

            normalizationSchemaVersion:
              normalized
                .schemaVersion,

            normalizationDigest:
              normalized
                .normalizationDigest,
          },


          versionMetadata: {
            normalizedBy:
              "PYTHON_OFFLINE_TOOLING",

            normalizationDigest:
              normalized
                .normalizationDigest,
          },


          groundTruthMetadata: {
            sealedBy:
              "PHASE_23R_INGESTION",

            groundTruthAgentVisible:
              false,
          },
        });


    const artifactResults =
      [];


    for (
      const artifact
      of normalized.artifacts
    ) {
      const body =
        decodeBase64Strict(
          artifact
            .contentBase64
        );


      const stored =
        await this.evidenceStore
          .storeArtifact({
            organizationId,

            environmentId,


            caseId:
              normalized
                .realityCase
                .identity
                .caseId,


            artifactId:
              artifact
                .artifactId,


            artifactKind:
              artifact.kind,


            channel:
              REALITY_VISIBILITY
                .EVIDENCE,


            body,


            mediaType:
              artifact
                .mediaType,


            provenance: {
              ...(
                artifact
                  .provenance ||
                {}
              ),

              normalizedContentHash:
                artifact
                  .contentHash,

              normalizationDigest:
                normalized
                  .normalizationDigest,
            },
          });


      const storedHash =
        stored
          .artifact
          ?.contentHash;


      if (
        storedHash &&

        storedHash !==
          artifact
            .contentHash
      ) {
        throw ingestionError(
          "REALITY_INGESTED_ARTIFACT_HASH_MISMATCH",

          (
            "Stored artifact hash does not match "
            + "normalized artifact: "
            + `${artifact.artifactId}`
          ),

          409
        );
      }


      artifactResults.push({
        artifactId:
          artifact
            .artifactId,

        contentHash:
          artifact
            .contentHash,

        stored:
          true,

        duplicate:
          stored.duplicate ===
          true,
      });
    }


    return {
      schemaVersion:
        normalized
          .schemaVersion,

      adapter:
        normalized.adapter,

      normalizationDigest:
        normalized
          .normalizationDigest,

      source:
        registeredSource,

      case:
        registeredCase,

      artifacts:
        artifactResults,

      artifactCount:
        artifactResults.length,

      groundTruthAgentVisible:
        false,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  NORMALIZATION_SCHEMA_VERSION,

  RealityDatasetIngestionService,

  validateNormalizedBundle,

  decodeBase64Strict,
};