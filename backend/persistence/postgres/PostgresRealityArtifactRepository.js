"use strict";


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


function repoError(
  code,
  message,
  status =
    409
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
    throw repoError(
      code,
      `${field} is required`,
      422
    );
  }


  return value;
}


function requireScope(
  input =
    {}
) {
  requireValue(
    input.organizationId,
    "organizationId",
    "REALITY_ORGANIZATION_REQUIRED"
  );


  requireValue(
    input.environmentId,
    "environmentId",
    "REALITY_ENVIRONMENT_REQUIRED"
  );


  return {
    organizationId:
      input.organizationId,

    environmentId:
      input.environmentId,
  };
}


function json(
  value,
  fallback =
    {}
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return fallback;
  }


  if (
    typeof value ===
      "string"
  ) {
    try {
      return JSON.parse(
        value
      );
    } catch {
      return fallback;
    }
  }


  return value;
}


function mapArtifact(
  row,
  resolved
) {
  if (
    !row
  ) {
    return null;
  }


  return {
    id:
      row.id,

    artifactId:
      row.public_id,

    organizationId:
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,

    caseVersionId:
      row.case_version_id,

    caseId:
      row.case_public_id ||
      null,

    artifactKind:
      row.artifact_kind,

    channel:
      row.channel,

    contentHash:
      row.content_hash,

    byteSize:
      Number(
        row.byte_size ||
        0
      ),

    mediaType:
      row.media_type,

    storageBucket:
      row.storage_bucket,

    storageKey:
      row.storage_key,

    etag:
      row.etag,

    provenance:
      json(
        row.provenance
      ),

    trustedGroundTruth:
      false,

    executionAuthorized:
      false,

    createdAt:
      row.created_at,
  };
}


class PostgresRealityArtifactRepository {
  constructor(
    options =
      {}
  ) {
    this.scope =
      options.scope ||

      new PostgresTenantScope(
        options
      );
  }


  async registerArtifact(
    input =
      {},
    transaction =
      null
  ) {
    const scope =
      requireScope(
        input
      );


    for (
      const [
        field,
        code,
      ]
      of [
        [
          "caseId",
          "REALITY_CASE_REQUIRED",
        ],

        [
          "artifactId",
          "REALITY_ARTIFACT_ID_REQUIRED",
        ],

        [
          "artifactKind",
          "REALITY_ARTIFACT_KIND_REQUIRED",
        ],

        [
          "channel",
          "REALITY_ARTIFACT_CHANNEL_REQUIRED",
        ],

        [
          "contentHash",
          "REALITY_ARTIFACT_HASH_REQUIRED",
        ],

        [
          "storageBucket",
          "REALITY_ARTIFACT_BUCKET_REQUIRED",
        ],

        [
          "storageKey",
          "REALITY_ARTIFACT_STORAGE_KEY_REQUIRED",
        ],
      ]
    ) {
      requireValue(
        input[field],
        field,
        code
      );
    }


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const versionResult =
          await client.query(
            `
              SELECT
                v.id
                  AS case_version_id,

                c.public_id
                  AS case_public_id

              FROM
                reality.cases c

              JOIN
                reality.case_versions v
              ON
                v.case_id =
                  c.id

                AND

                v.is_current =
                  TRUE

              WHERE
                c.public_id =
                  $1

                OR

                c.id::text =
                  $1

              LIMIT 1
            `,
            [
              String(
                input.caseId
              ),
            ]
          );


        const version =
          versionResult
            .rows[0];


        if (
          !version
        ) {
          throw repoError(
            "REALITY_CASE_NOT_FOUND",
            "Reality case not found",
            404
          );
        }


        const inserted =
          await client.query(
            `
              INSERT INTO
                reality.case_artifacts (
                  public_id,

                  organization_id,
                  environment_id,

                  case_version_id,

                  artifact_kind,
                  channel,

                  content_hash,
                  byte_size,
                  media_type,

                  storage_bucket,
                  storage_key,

                  etag,

                  provenance,

                  trusted_ground_truth,

                  execution_authorized
                )

              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13::jsonb,
                FALSE,
                FALSE
              )

              ON CONFLICT (
                organization_id,
                environment_id,
                case_version_id,
                public_id
              )

              DO NOTHING

              RETURNING *
            `,
            [
              input.artifactId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              version
                .case_version_id,

              input.artifactKind,

              input.channel,

              String(
                input.contentHash
              )
                .toLowerCase(),

              Number(
                input.byteSize ||
                0
              ),

              input.mediaType ||
              "application/octet-stream",

              input.storageBucket,

              input.storageKey,

              input.etag ||
              null,

              JSON.stringify(
                input.provenance ||
                {}
              ),
            ]
          );


        if (
          inserted.rows[0]
        ) {
          return {
            created:
              true,

            duplicate:
              false,

            artifact:
              mapArtifact(
                {
                  ...inserted.rows[0],

                  case_public_id:
                    version
                      .case_public_id,
                },

                resolved
              ),

            executionAuthorized:
              false,
          };
        }


        /*
         * Idempotent duplicate or immutable-ID conflict.
         */
        const existingResult =
          await client.query(
            `
              SELECT
                a.*,

                c.public_id
                  AS case_public_id

              FROM
                reality.case_artifacts a

              JOIN
                reality.case_versions v
              ON
                v.id =
                  a.case_version_id

              JOIN
                reality.cases c
              ON
                c.id =
                  v.case_id

              WHERE
                a.case_version_id =
                  $1

                AND

                a.public_id =
                  $2

              LIMIT 1
            `,
            [
              version
                .case_version_id,

              input.artifactId,
            ]
          );


        const existing =
          existingResult
            .rows[0];


        if (
          !existing
        ) {
          throw repoError(
            "REALITY_ARTIFACT_REGISTRATION_RACE",
            "Reality artifact registration could not be resolved",
            409
          );
        }


        if (
          existing.content_hash !==
            String(
              input.contentHash
            )
              .toLowerCase() ||

          existing.storage_key !==
            input.storageKey ||

          existing.channel !==
            input.channel
        ) {
          throw repoError(
            "REALITY_ARTIFACT_ID_CONFLICT",
            "Reality artifact ID already exists with different immutable content",
            409
          );
        }


        return {
          created:
            false,

          duplicate:
            true,

          artifact:
            mapArtifact(
              existing,
              resolved
            ),

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }


  async getReplayArtifact(
    input =
      {},
    transaction =
      null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.artifactId,
      "artifactId",
      "REALITY_ARTIFACT_ID_REQUIRED"
    );


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        /*
         * IMPORTANT:
         *
         * SEALED_EVALUATION is excluded in SQL itself.
         */
        const result =
          await client.query(
            `
              SELECT
                a.*,

                c.public_id
                  AS case_public_id

              FROM
                reality.case_artifacts a

              JOIN
                reality.case_versions v
              ON
                v.id =
                  a.case_version_id

              JOIN
                reality.cases c
              ON
                c.id =
                  v.case_id

              WHERE
                a.public_id =
                  $1

                AND

                a.channel =
                  'EVIDENCE'

              LIMIT 1
            `,
            [
              String(
                input.artifactId
              ),
            ]
          );


        return mapArtifact(
          result.rows[0] ||
          null,
          resolved
        );
      },

      transaction
    );
  }


  async listReplayArtifacts(
    input =
      {},
    transaction =
      null
  ) {
    const scope =
      requireScope(
        input
      );


    requireValue(
      input.caseId,
      "caseId",
      "REALITY_CASE_REQUIRED"
    );


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT
                a.*,

                c.public_id
                  AS case_public_id

              FROM
                reality.cases c

              JOIN
                reality.case_versions v
              ON
                v.case_id =
                  c.id

                AND

                v.is_current =
                  TRUE

              JOIN
                reality.case_artifacts a
              ON
                a.case_version_id =
                  v.id

                AND

                a.channel =
                  'EVIDENCE'

              WHERE
                c.public_id =
                  $1

                OR

                c.id::text =
                  $1

              ORDER BY
                a.created_at ASC,

                a.public_id ASC
            `,
            [
              String(
                input.caseId
              ),
            ]
          );


        return result.rows.map(
          (
            row
          ) =>
            mapArtifact(
              row,
              resolved
            )
        );
      },

      transaction
    );
  }
}


module.exports =
  PostgresRealityArtifactRepository;