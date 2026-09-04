"use strict";


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


const {
  humanLearningError,
} = require(
  "../../contracts/humanLearning"
);


const {
  assertReviewCannotAuthorize,
} = require(
  "../../contracts/humanLearningReview"
);


function required(
  value,
  field
) {
  if (
    typeof value !==
      "string"
    ||
    !value.trim()
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_FIELD_REQUIRED",

      `${field} is required`
    );
  }


  return value.trim();
}


class PostgresLearningPublicationRepository {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||

      new PostgresTenantScope(
        options
      );
  }


  async recordPublication(
    input = {}
  ) {
    assertReviewCannotAuthorize(
      input
    );


    return this.tenantScope.run(
      {
        organizationId:
          required(
            input.organizationId,
            "organizationId"
          ),

        environmentId:
          required(
            input.environmentId,
            "environmentId"
          ),
      },

      async (
        client
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                learning.knowledge_publications (
                  organization_id,
                  environment_id,
                  candidate_id,
                  review_decision_id,
                  validation_run_id,
                  publication_status,
                  target_scope,
                  target_knowledge_type,
                  canonical_definition_public_id,
                  canonical_version_public_id,
                  canonical_knowledge_key,
                  publication_version,
                  provenance,
                  execution_authorized
                )

              SELECT
                c.organization_id,
                c.environment_id,
                c.id,
                rd.id,
                vr.id,
                'PUBLISHED',
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10::jsonb,
                FALSE

              FROM
                learning.knowledge_candidates c

              JOIN
                learning.review_decisions rd
                  ON (
                    rd.public_id =
                      $2

                    OR

                    rd.id::text =
                      $2
                  )

                  AND

                  rd.candidate_id =
                    c.id

                  AND

                  rd.decision =
                    'APPROVE'

              LEFT JOIN
                learning.validation_runs vr
                  ON (
                    vr.public_id =
                      $3

                    OR

                    vr.id::text =
                      $3
                  )

              WHERE
                (
                  c.public_id =
                    $1

                  OR

                  c.id::text =
                    $1
                )

                AND

                c.candidate_state =
                  'APPROVED'

                AND

                c.execution_authorized =
                  FALSE

              RETURNING *
            `,
            [
              required(
                input.candidateId,
                "candidateId"
              ),

              required(
                input.reviewDecisionId,
                "reviewDecisionId"
              ),

              input.validationRunId ||
              "",

              required(
                input.targetScope,
                "targetScope"
              ),

              required(
                input.targetKnowledgeType,
                "targetKnowledgeType"
              ),

              input.canonicalDefinitionPublicId ||
              null,

              input.canonicalVersionPublicId ||
              null,

              required(
                input.canonicalKnowledgeKey,
                "canonicalKnowledgeKey"
              ),

              required(
                input.publicationVersion,
                "publicationVersion"
              ),

              JSON.stringify(
                input.provenance ||
                {}
              ),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw humanLearningError(
            "HUMAN_LEARNING_PUBLICATION_INELIGIBLE",

            (
              "Publication requires an APPROVED candidate " +
              "and APPROVE review decision"
            ),

            409
          );
        }


        return mapPublication(
          result.rows[0]
        );
      }
    );
  }


  async updatePublicationStatus(
    input = {}
  ) {
    assertReviewCannotAuthorize(
      input
    );


    return this.tenantScope.run(
      {
        organizationId:
          required(
            input.organizationId,
            "organizationId"
          ),

        environmentId:
          required(
            input.environmentId,
            "environmentId"
          ),
      },

      async (
        client
      ) => {
        const result =
          await client.query(
            `
              UPDATE
                learning.knowledge_publications

              SET
                publication_status =
                  $2,

                deprecated_at =
                  CASE
                    WHEN $2 =
                      'DEPRECATED'
                    THEN NOW()
                    ELSE deprecated_at
                  END,

                revoked_at =
                  CASE
                    WHEN $2 =
                      'REVOKED'
                    THEN NOW()
                    ELSE revoked_at
                  END,

                updated_at =
                  NOW()

              WHERE
                public_id =
                  $1

                OR

                id::text =
                  $1

              RETURNING *
            `,
            [
              required(
                input.publicationId,
                "publicationId"
              ),

              required(
                input.status,
                "status"
              ),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw humanLearningError(
            "HUMAN_LEARNING_PUBLICATION_NOT_FOUND",

            "Learning publication not found",

            404
          );
        }


        return mapPublication(
          result.rows[0]
        );
      }
    );
  }


  async recordRevocation(
    input = {}
  ) {
    assertReviewCannotAuthorize(
      input
    );


    return this.tenantScope.run(
      {
        organizationId:
          required(
            input.organizationId,
            "organizationId"
          ),

        environmentId:
          required(
            input.environmentId,
            "environmentId"
          ),
      },

      async (
        client
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                learning.knowledge_revocations (
                  organization_id,
                  environment_id,
                  publication_id,
                  action,
                  reason,
                  actor_id,
                  actor_type,
                  metadata,
                  execution_authorized
                )

              SELECT
                p.organization_id,
                p.environment_id,
                p.id,
                $2,
                $3,
                $4,
                $5,
                $6::jsonb,
                FALSE

              FROM
                learning.knowledge_publications p

              WHERE
                p.public_id =
                  $1

                OR

                p.id::text =
                  $1

              RETURNING *
            `,
            [
              required(
                input.publicationId,
                "publicationId"
              ),

              required(
                input.action,
                "action"
              ),

              required(
                input.reason,
                "reason"
              ),

              required(
                input.actorId,
                "actorId"
              ),

              input.actorType ||
              "HUMAN",

              JSON.stringify(
                input.metadata ||
                {}
              ),
            ]
          );


        return {
          publicId:
            result.rows[0]
              ?.public_id,

          action:
            result.rows[0]
              ?.action,

          executionAuthorized:
            false,
        };
      }
    );
  }
}


function mapPublication(
  row
) {
  return {
    id:
      row.id,

    publicId:
      row.public_id,

    candidateId:
      row.candidate_id,

    status:
      row.publication_status,

    targetScope:
      row.target_scope,

    targetKnowledgeType:
      row.target_knowledge_type,

    canonicalDefinitionPublicId:
      row.canonical_definition_public_id,

    canonicalVersionPublicId:
      row.canonical_version_public_id,

    canonicalKnowledgeKey:
      row.canonical_knowledge_key,

    publicationVersion:
      row.publication_version,

    provenance:
      row.provenance ||
      {},

    executionAuthorized:
      false,
  };
}


module.exports = {
  PostgresLearningPublicationRepository,
};