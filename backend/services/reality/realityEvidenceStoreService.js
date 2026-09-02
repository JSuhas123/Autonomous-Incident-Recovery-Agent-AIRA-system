"use strict";


const {
  isKnownRealityArtifactKind,

  REALITY_VISIBILITY,
} =
  require(
    "../../constants/reality"
  );


const PostgresRealityArtifactRepository =
  require(
    "../../persistence/postgres/PostgresRealityArtifactRepository"
  );


const {
  S3RealityObjectStore,

  asBuffer,
} =
  require(
    "./S3RealityObjectStore"
  );


function serviceError(
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
    throw serviceError(
      code,
      `${field} is required`
    );
  }


  return value;
}


class RealityEvidenceStoreService {
  constructor(
    options =
      {}
  ) {
    this.repository =
      options.repository ||

      new PostgresRealityArtifactRepository(
        options.postgres ||
        {}
      );


    this.objectStore =
      options.objectStore ||

      new S3RealityObjectStore(
        options.objectStorage ||
        {}
      );
  }


  async storeArtifact(
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


    const caseId =
      requireValue(
        input.caseId,
        "caseId",
        "REALITY_CASE_REQUIRED"
      );


    const artifactId =
      requireValue(
        input.artifactId,
        "artifactId",
        "REALITY_ARTIFACT_ID_REQUIRED"
      );


    const artifactKind =
      requireValue(
        input.artifactKind,
        "artifactKind",
        "REALITY_ARTIFACT_KIND_REQUIRED"
      );


    if (
      !isKnownRealityArtifactKind(
        artifactKind
      )
    ) {
      throw serviceError(
        "REALITY_ARTIFACT_KIND_INVALID",
        "Reality artifact kind is invalid"
      );
    }


    const channel =
      input.channel ||
      REALITY_VISIBILITY
        .EVIDENCE;


    if (
      ![
        REALITY_VISIBILITY
          .EVIDENCE,

        REALITY_VISIBILITY
          .SEALED_EVALUATION,
      ].includes(
        channel
      )
    ) {
      throw serviceError(
        "REALITY_ARTIFACT_CHANNEL_INVALID",
        "Reality artifact channel is invalid"
      );
    }


    const body =
      asBuffer(
        input.body
      );


    /*
     * Object storage is written first.
     *
     * The object is content-addressed and therefore safely idempotent.
     *
     * A database failure can leave an unreferenced immutable blob,
     * but cannot leave PostgreSQL pointing at bytes that were never stored.
     * Orphan cleanup can be introduced later without weakening integrity.
     */
    const stored =
      await this.objectStore
        .putImmutable({
          organizationId,

          environmentId,

          body,

          contentType:
            input.mediaType ||
            "application/octet-stream",

          metadata: {
            "artifact-id":
              artifactId,

            channel:
              String(
                channel
              ),
          },
        });


    const registered =
      await this.repository
        .registerArtifact({
          organizationId,

          environmentId,

          caseId,

          artifactId,

          artifactKind,

          channel,

          contentHash:
            stored.contentHash,

          byteSize:
            stored.byteSize,

          mediaType:
            stored.contentType,

          storageBucket:
            stored.bucket,

          storageKey:
            stored.key,

          etag:
            stored.etag,

          provenance:
            input.provenance ||
            {},


          /*
           * Permanent 23R boundaries.
           */
          trustedGroundTruth:
            false,

          executionAuthorized:
            false,
        });


    return {
      ...registered,

      objectCreated:
        stored.created,

      executionAuthorized:
        false,
    };
  }


  async getReplayArtifactContent(
    input =
      {}
  ) {
    const artifact =
      await this.repository
        .getReplayArtifact(
          input
        );


    if (
      !artifact
    ) {
      return null;
    }


    /*
     * Defense in depth.
     *
     * Repository SQL already filters to EVIDENCE.
     */
    if (
      artifact.channel !==
      REALITY_VISIBILITY
        .EVIDENCE
    ) {
      throw serviceError(
        "REALITY_SEALED_ARTIFACT_REPLAY_FORBIDDEN",
        "Sealed evaluation artifacts cannot enter the replay channel",
        403
      );
    }


    /*
     * Never trust bytes merely because object storage returned them.
     *
     * Recompute SHA-256 and compare against PostgreSQL metadata.
     */
    const object =
      await this.objectStore
        .getVerified({
          key:
            artifact.storageKey,

          expectedHash:
            artifact.contentHash,
        });


    return {
      artifact,

      body:
        object.body,

      verified:
        true,

      executionAuthorized:
        false,
    };
  }


  async listReplayArtifacts(
    input =
      {}
  ) {
    const artifacts =
      await this.repository
        .listReplayArtifacts(
          input
        );


    if (
      artifacts.some(
        (
          artifact
        ) =>
          artifact.channel !==
          REALITY_VISIBILITY
            .EVIDENCE
      )
    ) {
      throw serviceError(
        "REALITY_GROUND_TRUTH_LEAKAGE",
        "Non-evidence artifact leaked into replay artifact listing",
        500
      );
    }


    return artifacts;
  }
}


module.exports = {
  RealityEvidenceStoreService,
};