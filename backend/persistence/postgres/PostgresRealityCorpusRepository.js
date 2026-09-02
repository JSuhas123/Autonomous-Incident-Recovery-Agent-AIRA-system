"use strict";

const crypto =
  require(
    "node:crypto"
  );

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


function createError(
  message,
  code,
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
    throw createError(
      `${field} is required`,
      code,
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


function publicId(
  prefix
) {
  return (
    `${prefix}_` +
    crypto
      .randomBytes(
        12
      )
      .toString(
        "hex"
      )
  );
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
    } catch (
      _error
    ) {
      return fallback;
    }
  }

  return value;
}


function mapSource(
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

    publicId:
      row.public_id,

    organizationId:
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,

    sourceKind:
      row.source_kind,

    sourceName:
      row.source_name,

    sourceVersion:
      row.source_version,

    license:
      row.license,

    sourceUri:
      row.source_uri,

    modified:
      row.modified ===
      true,

    groundTruthMethod:
      row.ground_truth_method,

    metadata:
      json(
        row.metadata
      ),

    executionAuthorized:
      false,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


function mapCorpus(
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

    publicId:
      row.public_id,

    organizationId:
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,

    name:
      row.name,

    description:
      row.description,

    status:
      row.status,

    corpusVersion:
      Number(
        row.corpus_version ||
        1
      ),

    metadata:
      json(
        row.metadata
      ),

    executionAuthorized:
      false,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    frozenAt:
      row.frozen_at,
  };
}


function mapCaseVersion(
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

    publicId:
      row.public_id,

    organizationId:
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,

    caseId:
      row.case_id,

    casePublicId:
      row.case_public_id,

    corpusId:
      row.corpus_id,

    corpusPublicId:
      row.corpus_public_id,

    datasetSourceId:
      row.dataset_source_id,

    caseKey:
      row.case_key,

    title:
      row.title,

    evidenceGrade:
      row.evidence_grade,

    revision:
      Number(
        row.revision ||
        0
      ),

    contractVersion:
      row.contract_version,

    contentHash:
      row.content_hash,

    visibleCase:
      json(
        row.visible_case
      ),

    isCurrent:
      row.is_current ===
      true,

    metadata:
      json(
        row.metadata
      ),

    executionAuthorized:
      false,

    createdAt:
      row.created_at,

    supersededAt:
      row.superseded_at,
  };
}


class PostgresRealityCorpusRepository {
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


  async createDatasetSource(
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
      ] of [
        [
          "sourceKind",
          "REALITY_SOURCE_KIND_REQUIRED",
        ],

        [
          "sourceName",
          "REALITY_SOURCE_NAME_REQUIRED",
        ],

        [
          "sourceVersion",
          "REALITY_SOURCE_VERSION_REQUIRED",
        ],

        [
          "license",
          "REALITY_SOURCE_LICENSE_REQUIRED",
        ],

        [
          "groundTruthMethod",
          "REALITY_GROUND_TRUTH_METHOD_REQUIRED",
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
        const result =
          await client.query(
            `
              INSERT INTO
                reality.dataset_sources (
                  public_id,

                  organization_id,
                  environment_id,

                  source_kind,
                  source_name,
                  source_version,

                  license,
                  source_uri,

                  modified,

                  ground_truth_method,

                  metadata,

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
                $11::jsonb,
                FALSE
              )

              ON CONFLICT (
                organization_id,
                environment_id,
                public_id
              )

              DO UPDATE SET
                source_kind =
                  EXCLUDED.source_kind,

                source_name =
                  EXCLUDED.source_name,

                source_version =
                  EXCLUDED.source_version,

                license =
                  EXCLUDED.license,

                source_uri =
                  EXCLUDED.source_uri,

                modified =
                  EXCLUDED.modified,

                ground_truth_method =
                  EXCLUDED.ground_truth_method,

                metadata =
                  EXCLUDED.metadata,

                updated_at =
                  NOW()

              RETURNING *
            `,
            [
              input.publicId ||
              publicId(
                "reality_source"
              ),

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.sourceKind,

              input.sourceName,

              input.sourceVersion,

              input.license,

              input.sourceUri ||
              null,

              input.modified ===
              true,

              input
                .groundTruthMethod,

              JSON.stringify(
                input.metadata ||
                {}
              ),
            ]
          );

        return mapSource(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async createCorpus(
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
      input.name,
      "name",
      "REALITY_CORPUS_NAME_REQUIRED"
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
              INSERT INTO
                reality.corpora (
                  public_id,

                  organization_id,
                  environment_id,

                  name,
                  description,

                  status,

                  corpus_version,

                  metadata,

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
                $8::jsonb,
                FALSE
              )

              RETURNING *
            `,
            [
              input.publicId ||
              publicId(
                "corpus"
              ),

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.name,

              input.description ||
              null,

              input.status ||
              "DRAFT",

              input.corpusVersion ||
              1,

              JSON.stringify(
                input.metadata ||
                {}
              ),
            ]
          );

        return mapCorpus(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async registerCaseVersion(
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
      input.corpusId,
      "corpusId",
      "REALITY_CORPUS_REQUIRED"
    );

    requireValue(
      input.caseKey,
      "caseKey",
      "REALITY_CASE_KEY_REQUIRED"
    );

    requireValue(
      input.title,
      "title",
      "REALITY_CASE_TITLE_REQUIRED"
    );

    requireValue(
      input.evidenceGrade,
      "evidenceGrade",
      "REALITY_EVIDENCE_GRADE_REQUIRED"
    );

    requireValue(
      input.contractVersion,
      "contractVersion",
      "REALITY_CONTRACT_VERSION_REQUIRED"
    );

    requireValue(
      input.contentHash,
      "contentHash",
      "REALITY_CONTENT_HASH_REQUIRED"
    );

    if (
      !input.visibleCase ||
      typeof input.visibleCase !==
        "object" ||
      Array.isArray(
        input.visibleCase
      )
    ) {
      throw createError(
        "visibleCase must be an object",
        "REALITY_VISIBLE_CASE_INVALID",
        422
      );
    }

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          input.visibleCase,
          "sealedEvaluation"
        ) ||

      Object.prototype
        .hasOwnProperty
        .call(
          input.visibleCase,
          "evaluationRubric"
        )
    ) {
      throw createError(
        "Replay-visible case cannot contain sealed evaluation data",
        "REALITY_GROUND_TRUTH_LEAKAGE",
        403
      );
    }

    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        const corpus =
          await this.#resolveScopedEntity(
            client,
            "reality.corpora",
            input.corpusId
          );

        if (
          !corpus
        ) {
          throw createError(
            "Reality corpus not found",
            "REALITY_CORPUS_NOT_FOUND",
            404
          );
        }

        let source =
          null;

        if (
          input.datasetSourceId
        ) {
          source =
            await this.#resolveScopedEntity(
              client,
              "reality.dataset_sources",
              input.datasetSourceId
            );

          if (
            !source
          ) {
            throw createError(
              "Reality dataset source not found",
              "REALITY_SOURCE_NOT_FOUND",
              404
            );
          }
        }

        /*
         * Serialize version generation for one canonical case identity.
         *
         * This prevents concurrent ingestion workers from both creating
         * revision N+1.
         */
        const lockKey =
          [
            resolved
              .organizationUuid,

            resolved
              .environmentUuid,

            corpus.id,

            input.caseKey,
          ].join(
            ":"
          );

        await client.query(
          `
            SELECT
              pg_advisory_xact_lock(
                hashtext(
                  $1
                )
              )
          `,
          [
            lockKey,
          ]
        );

        let caseRow =
          (
            await client.query(
              `
                SELECT *
                FROM
                  reality.cases

                WHERE
                  corpus_id = $1
                  AND
                  case_key = $2

                LIMIT 1

                FOR UPDATE
              `,
              [
                corpus.id,

                input.caseKey,
              ]
            )
          ).rows[0] ||
          null;

        if (
          !caseRow
        ) {
          caseRow =
            (
              await client.query(
                `
                  INSERT INTO
                    reality.cases (
                      public_id,

                      organization_id,
                      environment_id,

                      corpus_id,

                      dataset_source_id,

                      case_key,

                      title,

                      evidence_grade,

                      status,

                      current_revision,

                      metadata,

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
                    'ACTIVE',
                    0,
                    $9::jsonb,
                    FALSE
                  )

                  RETURNING *
                `,
                [
                  input.casePublicId ||
                  publicId(
                    "reality_case"
                  ),

                  resolved
                    .organizationUuid,

                  resolved
                    .environmentUuid,

                  corpus.id,

                  source?.id ||
                  null,

                  input.caseKey,

                  input.title,

                  input.evidenceGrade,

                  JSON.stringify(
                    input.caseMetadata ||
                    {}
                  ),
                ]
              )
            ).rows[0];
        }

        const current =
          (
            await client.query(
              `
                SELECT *
                FROM
                  reality.case_versions

                WHERE
                  case_id = $1
                  AND
                  is_current = TRUE

                LIMIT 1

                FOR UPDATE
              `,
              [
                caseRow.id,
              ]
            )
          ).rows[0] ||
          null;

        /*
         * Content-addressed semantic idempotency.
         *
         * Re-importing exactly the same normalized case does not manufacture
         * another revision.
         */
        if (
          current &&
          current.content_hash ===
            String(
              input.contentHash
            ).toLowerCase()
        ) {
          return {
            created:
              false,

            duplicate:
              true,

            version:
              mapCaseVersion(
                {
                  ...current,

                  case_public_id:
                    caseRow.public_id,

                  corpus_id:
                    corpus.id,

                  corpus_public_id:
                    corpus.public_id,

                  dataset_source_id:
                    caseRow
                      .dataset_source_id,

                  case_key:
                    caseRow.case_key,

                  title:
                    caseRow.title,

                  evidence_grade:
                    caseRow
                      .evidence_grade,
                },

                resolved
              ),

            executionAuthorized:
              false,
          };
        }

        const revision =
          current
            ? Number(
                current.revision
              ) +
              1
            : 1;

        if (
          current
        ) {
          await client.query(
            `
              UPDATE
                reality.case_versions

              SET
                is_current =
                  FALSE,

                superseded_at =
                  COALESCE(
                    superseded_at,
                    NOW()
                  )

              WHERE
                id = $1
            `,
            [
              current.id,
            ]
          );
        }

        const inserted =
          (
            await client.query(
              `
                INSERT INTO
                  reality.case_versions (
                    public_id,

                    organization_id,
                    environment_id,

                    case_id,

                    revision,

                    contract_version,

                    content_hash,

                    visible_case,

                    is_current,

                    metadata,

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
                  $8::jsonb,
                  TRUE,
                  $9::jsonb,
                  FALSE
                )

                RETURNING *
              `,
              [
                input.versionPublicId ||
                publicId(
                  "reality_version"
                ),

                resolved
                  .organizationUuid,

                resolved
                  .environmentUuid,

                caseRow.id,

                revision,

                input.contractVersion,

                String(
                  input.contentHash
                ).toLowerCase(),

                JSON.stringify(
                  input.visibleCase
                ),

                JSON.stringify(
                  input.versionMetadata ||
                  {}
                ),
              ]
            )
          ).rows[0];

        /*
         * Ground truth is persisted separately from visible_case.
         *
         * Replay queries never join this table.
         */
        await client.query(
          `
            INSERT INTO
              reality.case_ground_truth (
                public_id,

                organization_id,
                environment_id,

                case_id,

                case_version_id,

                sealed_evaluation,

                evaluation_rubric,

                metadata,

                execution_authorized
              )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6::jsonb,
              $7::jsonb,
              $8::jsonb,
              FALSE
            )
          `,
          [
            input.groundTruthPublicId ||
            publicId(
              "reality_truth"
            ),

            resolved
              .organizationUuid,

            resolved
              .environmentUuid,

            caseRow.id,

            inserted.id,

            JSON.stringify(
              input.sealedEvaluation ||
              {}
            ),

            JSON.stringify(
              input.evaluationRubric ||
              {}
            ),

            JSON.stringify(
              input.groundTruthMetadata ||
              {}
            ),
          ]
        );

        await client.query(
          `
            UPDATE
              reality.cases

            SET
              dataset_source_id =
                COALESCE(
                  $2,
                  dataset_source_id
                ),

              title =
                $3,

              evidence_grade =
                $4,

              current_revision =
                $5,

              updated_at =
                NOW()

            WHERE
              id = $1
          `,
          [
            caseRow.id,

            source?.id ||
            null,

            input.title,

            input.evidenceGrade,

            revision,
          ]
        );

        return {
          created:
            true,

          duplicate:
            false,

          version:
            mapCaseVersion(
              {
                ...inserted,

                case_public_id:
                  caseRow.public_id,

                corpus_id:
                  corpus.id,

                corpus_public_id:
                  corpus.public_id,

                dataset_source_id:
                  source?.id ||
                  caseRow
                    .dataset_source_id,

                case_key:
                  input.caseKey,

                title:
                  input.title,

                evidence_grade:
                  input.evidenceGrade,
              },

              resolved
            ),

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }


  async getCaseForReplay(
    input =
      {},
    transaction =
      null
  ) {
    return this.#getCase(
      input,
      false,
      transaction
    );
  }


  async getCaseForEvaluation(
    input =
      {},
    transaction =
      null
  ) {
    return this.#getCase(
      input,
      true,
      transaction
    );
  }


  async #getCase(
    input,
    includeGroundTruth,
    transaction
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
        const groundTruthSelect =
          includeGroundTruth
            ? `
                ,
                gt.sealed_evaluation,
                gt.evaluation_rubric
              `
            : "";

        const groundTruthJoin =
          includeGroundTruth
            ? `
                JOIN
                  reality.case_ground_truth gt
                ON
                  gt.case_version_id =
                    v.id
              `
            : "";

        const result =
          await client.query(
            `
              SELECT
                v.*,

                c.public_id
                  AS case_public_id,

                c.corpus_id,

                c.dataset_source_id,

                c.case_key,

                c.title,

                c.evidence_grade,

                cp.public_id
                  AS corpus_public_id

                ${groundTruthSelect}

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
                reality.corpora cp
              ON
                cp.id =
                  c.corpus_id

              ${groundTruthJoin}

              WHERE
                (
                  c.public_id =
                    $1

                  OR

                  c.id::text =
                    $1
                )

              LIMIT 1
            `,
            [
              String(
                input.caseId
              ),
            ]
          );

        const row =
          result.rows[0];

        if (
          !row
        ) {
          return null;
        }

        const mapped =
          mapCaseVersion(
            row,
            resolved
          );

        /*
         * Replay path.
         *
         * There is deliberately no ground-truth JOIN in this branch.
         */
        if (
          !includeGroundTruth
        ) {
          return {
            ...mapped,

            realityCase:
              mapped.visibleCase,

            groundTruthIncluded:
              false,

            executionAuthorized:
              false,
          };
        }

        /*
         * Evaluation path.
         *
         * Only offline evaluation/scoring code should use this method.
         */
        return {
          ...mapped,

          realityCase: {
            ...mapped.visibleCase,

            sealedEvaluation:
              json(
                row
                  .sealed_evaluation
              ),

            evaluationRubric:
              json(
                row
                  .evaluation_rubric
              ),
          },

          groundTruthIncluded:
            true,

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }


  async #resolveScopedEntity(
    client,
    table,
    id
  ) {
    const result =
      await client.query(
        `
          SELECT *
          FROM
            ${table}

          WHERE
            public_id =
              $1

            OR

            id::text =
              $1

          LIMIT 1
        `,
        [
          String(
            id
          ),
        ]
      );

    return (
      result.rows[0] ||
      null
    );
  }
}


module.exports =
  PostgresRealityCorpusRepository;