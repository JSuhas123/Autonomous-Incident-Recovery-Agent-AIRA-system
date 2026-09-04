"use strict";

/**
 * ============================================================================
 * AIRA PHASE 24.2
 * POSTGRES LEARNING CANDIDATE REPOSITORY
 * ============================================================================
 *
 * A human-derived resolution never enters canonical knowledge directly.
 *
 * HUMAN ACTION
 *      ↓
 * CANDIDATE
 *      ↓
 * QUARANTINE
 *
 * No execution authority.
 * No direct GLOBAL creation.
 *
 * ============================================================================
 */


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


const {
  KNOWLEDGE_CANDIDATE_TYPE,

  KNOWLEDGE_CANDIDATE_STATE,

  KNOWLEDGE_SCOPE,

  assertNoExecutionAuthority,

  assertCandidateTransition,

  humanLearningError,

  requireEnum,
} =
  require(
    "../../contracts/humanLearning"
  );


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_FIELD_REQUIRED",
      `${field} is required`
    );
  }


  return value.trim();
}


function normalizeObject(
  value
) {
  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  ) {
    return value;
  }


  return {};
}


function mapCandidate(
  row
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
      row.organization_id,

    environmentId:
      row.environment_id,

    sourceBundleDatabaseId:
      row.source_bundle_id,

    sourceIncidentDatabaseId:
      row.source_incident_id,

    candidateType:
      row.candidate_type,

    candidateState:
      row.candidate_state,

    truthLevel:
      row.truth_level,

    knowledgeScope:
      row.knowledge_scope,

    title:
      row.title,

    summary:
      row.summary,

    candidatePayload:
      row.candidate_payload ||
      {},

    confidence:
      row.confidence ===
      null
        ? null
        : Number(
            row.confidence
          ),

    riskClassification:
      row.risk_classification,

    sourceDigest:
      row.source_digest,

    candidateDigest:
      row.candidate_digest,

    generatedBy:
      row.generated_by,

    generatorVersion:
      row.generator_version,

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    executionAuthorized:
      false,
  };
}


class PostgresLearningCandidateRepository {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||
      new PostgresTenantScope(
        options
      );
  }


  async createCandidate(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    const organizationId =
      requireString(
        input.organizationId,
        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,
        "environmentId"
      );


    const sourceBundleId =
      requireString(
        input.sourceBundleId,
        "sourceBundleId"
      );


    const candidateType =
      requireEnum(
        input.candidateType,

        KNOWLEDGE_CANDIDATE_TYPE,

        "HUMAN_LEARNING_CANDIDATE_TYPE_INVALID",

        "candidateType"
      );


    const knowledgeScope =
      input.knowledgeScope ||
      KNOWLEDGE_SCOPE
        .ENVIRONMENT;


    if (
      ![
        KNOWLEDGE_SCOPE
          .ORGANIZATION,

        KNOWLEDGE_SCOPE
          .ENVIRONMENT,
      ].includes(
        knowledgeScope
      )
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_GLOBAL_BIRTH_FORBIDDEN",
        "Human-derived candidates must begin in ORGANIZATION or ENVIRONMENT scope"
      );
    }


    return this
      .tenantScope
      .run(
        {
          organizationId,

          environmentId,
        },

        async (
          client
        ) => {
          const result =
            await client.query(
              `
                INSERT INTO
                  learning.knowledge_candidates (
                    organization_id,
                    environment_id,
                    source_bundle_id,
                    source_incident_id,
                    candidate_type,
                    candidate_state,
                    truth_level,
                    knowledge_scope,
                    title,
                    summary,
                    candidate_payload,
                    confidence,
                    risk_classification,
                    source_digest,
                    candidate_digest,
                    generated_by,
                    generator_version,
                    metadata,
                    execution_authorized
                  )

                SELECT
                  b.organization_id,
                  b.environment_id,
                  b.id,
                  b.incident_id,
                  $2,
                  'GENERATED',
                  'CANDIDATE',
                  $3,
                  $4,
                  $5,
                  $6::jsonb,
                  $7::numeric,
                  $8,
                  b.source_digest,
                  $9,
                  $10,
                  $11,
                  $12::jsonb,
                  FALSE

                FROM
                  learning.source_bundles b

                WHERE
                  (
                    b.public_id =
                      $1

                    OR

                    b.id::text =
                      $1
                  )

                ON CONFLICT (
                  organization_id,
                  environment_id,
                  candidate_digest
                )
                DO UPDATE SET
                  updated_at =
                    learning
                      .knowledge_candidates
                      .updated_at

                RETURNING *
              `,
              [
                sourceBundleId,

                candidateType,

                knowledgeScope,

                requireString(
                  input.title,
                  "title"
                ),

                input.summary ||
                null,

                JSON.stringify(
                  normalizeObject(
                    input.candidatePayload
                  )
                ),

                input.confidence ??
                null,

                input.riskClassification ||
                "UNASSESSED",

                requireString(
                  input.candidateDigest,
                  "candidateDigest"
                ),

                requireString(
                  input.generatedBy,
                  "generatedBy"
                ),

                requireString(
                  input.generatorVersion,
                  "generatorVersion"
                ),

                JSON.stringify(
                  normalizeObject(
                    input.metadata
                  )
                ),
              ]
            );


          if (
            !result.rows[0]
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_SOURCE_BUNDLE_NOT_FOUND",
              "Source bundle not found",
              404
            );
          }


          const row =
            result.rows[0];


          /*
           * Lineage records are append-only provenance.
           */
          await client.query(
            `
              INSERT INTO
                learning.candidate_lineage (
                  organization_id,
                  environment_id,
                  candidate_id,
                  source_bundle_id,
                  source_incident_id,
                  parent_candidate_id,
                  generator_name,
                  generator_version,
                  lineage_payload,
                  execution_authorized
                )
              VALUES (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4::uuid,
                $5::uuid,
                NULL,
                $6,
                $7,
                $8::jsonb,
                FALSE
              )
            `,
            [
              row.organization_id,

              row.environment_id,

              row.id,

              row.source_bundle_id,

              row.source_incident_id,

              input.generatedBy,

              input.generatorVersion,

              JSON.stringify(
                normalizeObject(
                  input.lineagePayload
                )
              ),
            ]
          );


          await client.query(
            `
              INSERT INTO
                learning.candidate_status_history (
                  organization_id,
                  environment_id,
                  candidate_id,
                  from_state,
                  to_state,
                  actor_type,
                  actor_user_id,
                  reason,
                  metadata,
                  execution_authorized
                )
              VALUES (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                NULL,
                'GENERATED',
                'SYSTEM',
                NULL,
                $4,
                $5::jsonb,
                FALSE
              )
            `,
            [
              row.organization_id,

              row.environment_id,

              row.id,

              "Candidate created from frozen source bundle",

              JSON.stringify({
                sourceDigest:
                  row.source_digest,
              }),
            ]
          );


          return mapCandidate(
            row
          );
        }
      );
  }


  async transitionCandidate(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    const organizationId =
      requireString(
        input.organizationId,
        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,
        "environmentId"
      );


    const candidateId =
      requireString(
        input.candidateId,
        "candidateId"
      );


    const toState =
      requireEnum(
        input.toState,

        KNOWLEDGE_CANDIDATE_STATE,

        "HUMAN_LEARNING_CANDIDATE_STATE_INVALID",

        "toState"
      );


    return this
      .tenantScope
      .run(
        {
          organizationId,

          environmentId,
        },

        async (
          client
        ) => {
          const currentResult =
            await client.query(
              `
                SELECT *
                FROM
                  learning.knowledge_candidates
                WHERE
                  (
                    public_id =
                      $1

                    OR

                    id::text =
                      $1
                  )
                FOR UPDATE
              `,
              [
                candidateId,
              ]
            );


          const current =
            currentResult
              .rows[0];


          if (
            !current
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_CANDIDATE_NOT_FOUND",
              "Knowledge candidate not found",
              404
            );
          }


          assertCandidateTransition(
            current.candidate_state,
            toState
          );


          const updatedResult =
            await client.query(
              `
                UPDATE
                  learning.knowledge_candidates

                SET
                  candidate_state =
                    $2,

                  updated_at =
                    NOW()

                WHERE
                  id =
                    $1::uuid

                RETURNING *
              `,
              [
                current.id,

                toState,
              ]
            );


          await client.query(
            `
              INSERT INTO
                learning.candidate_status_history (
                  organization_id,
                  environment_id,
                  candidate_id,
                  from_state,
                  to_state,
                  actor_type,
                  actor_user_id,
                  reason,
                  metadata,
                  execution_authorized
                )
              VALUES (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4,
                $5,
                $6,
                $7::uuid,
                $8,
                $9::jsonb,
                FALSE
              )
            `,
            [
              current.organization_id,

              current.environment_id,

              current.id,

              current.candidate_state,

              toState,

              input.actorType ||
              "SYSTEM",

              input.actorUserId ||
              null,

              requireString(
                input.reason,
                "reason"
              ),

              JSON.stringify(
                normalizeObject(
                  input.metadata
                )
              ),
            ]
          );


          return mapCandidate(
            updatedResult
              .rows[0]
          );
        }
      );
  }


  async getCandidate(
    input = {}
  ) {
    const organizationId =
      requireString(
        input.organizationId,
        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,
        "environmentId"
      );


    const candidateId =
      requireString(
        input.candidateId,
        "candidateId"
      );


    return this
      .tenantScope
      .run(
        {
          organizationId,

          environmentId,
        },

        async (
          client
        ) => {
          const result =
            await client.query(
              `
                SELECT *
                FROM
                  learning.knowledge_candidates

                WHERE
                  (
                    public_id =
                      $1

                    OR

                    id::text =
                      $1
                  )

                LIMIT 1
              `,
              [
                candidateId,
              ]
            );


          return mapCandidate(
            result.rows[0]
          );
        }
      );
  }
}


module.exports = {
  PostgresLearningCandidateRepository,

  mapCandidate,
};