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


function requireString(
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


class PostgresLearningReviewRepository {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||

      new PostgresTenantScope(
        options
      );
  }


  async createReviewTask(
    input = {}
  ) {
    assertReviewCannotAuthorize(
      input
    );


    return this.tenantScope.run(
      {
        organizationId:
          requireString(
            input.organizationId,
            "organizationId"
          ),

        environmentId:
          requireString(
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
                learning.review_tasks (
                  organization_id,
                  environment_id,
                  candidate_id,
                  validation_run_id,
                  status,
                  risk_classification,
                  requires_independent_reviewer,
                  source_operator_id,
                  assigned_reviewer_id,
                  metadata,
                  execution_authorized
                )

              SELECT
                c.organization_id,
                c.environment_id,
                c.id,
                vr.id,
                'PENDING',
                $3,
                $4,
                $5,
                $6,
                $7::jsonb,
                FALSE

              FROM
                learning.knowledge_candidates c

              LEFT JOIN
                learning.validation_runs vr
                  ON (
                    vr.public_id =
                      $2

                    OR

                    vr.id::text =
                      $2
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
                  'HUMAN_REVIEW_PENDING'

                AND

                c.execution_authorized =
                  FALSE

              ON CONFLICT (
                candidate_id
              )
              WHERE status = 'PENDING'

              DO UPDATE SET
                updated_at =
                  learning.review_tasks.updated_at

              RETURNING *
            `,
            [
              requireString(
                input.candidateId,
                "candidateId"
              ),

              input.validationRunId ||
              "",

              input.riskClassification ||
              "STANDARD",

              input.requiresIndependentReviewer ===
                true,

              input.sourceOperatorId ||
              null,

              input.assignedReviewerId ||
              null,

              JSON.stringify(
                input.metadata ||
                {}
              ),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw humanLearningError(
            "HUMAN_LEARNING_REVIEW_CANDIDATE_INELIGIBLE",

            (
              "Review requires a candidate in " +
              "HUMAN_REVIEW_PENDING"
            ),

            409
          );
        }


        return mapTask(
          result.rows[0]
        );
      }
    );
  }


  async getReviewTask(
    input = {}
  ) {
    return this.tenantScope.run(
      {
        organizationId:
          requireString(
            input.organizationId,
            "organizationId"
          ),

        environmentId:
          requireString(
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
              SELECT *
              FROM learning.review_tasks

              WHERE
                public_id =
                  $1

                OR

                id::text =
                  $1

              LIMIT 1
            `,
            [
              requireString(
                input.reviewTaskId,
                "reviewTaskId"
              ),
            ]
          );


        return result.rows[0]
          ? mapTask(
              result.rows[0]
            )
          : null;
      }
    );
  }


  async recordDecision(
    input = {}
  ) {
    assertReviewCannotAuthorize(
      input
    );


    return this.tenantScope.run(
      {
        organizationId:
          requireString(
            input.organizationId,
            "organizationId"
          ),

        environmentId:
          requireString(
            input.environmentId,
            "environmentId"
          ),
      },

      async (
        client
      ) => {
        await client.query(
          "BEGIN"
        );


        try {
          const taskResult =
            await client.query(
              `
                SELECT *
                FROM learning.review_tasks

                WHERE
                  (
                    public_id =
                      $1

                    OR

                    id::text =
                      $1
                  )

                  AND

                  status =
                    'PENDING'

                FOR UPDATE
              `,
              [
                requireString(
                  input.reviewTaskId,
                  "reviewTaskId"
                ),
              ]
            );


          const task =
            taskResult.rows[0];


          if (
            !task
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_REVIEW_TASK_NOT_PENDING",

              "Review task is not pending",

              409
            );
          }


          if (
            task.requires_independent_reviewer ===
              true
            &&
            task.source_operator_id
            &&
            task.source_operator_id ===
              input.reviewerId
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_INDEPENDENT_REVIEW_REQUIRED",

              (
                "The source operator cannot be the sole " +
                "reviewer for this candidate"
              ),

              409
            );
          }


          const decisionResult =
            await client.query(
              `
                INSERT INTO
                  learning.review_decisions (
                    organization_id,
                    environment_id,
                    review_task_id,
                    candidate_id,
                    decision,
                    reason,
                    reviewer_id,
                    reviewer_type,
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
                  $9::jsonb,
                  FALSE
                )

                RETURNING *
              `,
              [
                task.organization_id,

                task.environment_id,

                task.id,

                task.candidate_id,

                requireString(
                  input.decision,
                  "decision"
                ),

                requireString(
                  input.reason,
                  "reason"
                ),

                requireString(
                  input.reviewerId,
                  "reviewerId"
                ),

                input.reviewerType ||
                "HUMAN",

                JSON.stringify(
                  input.metadata ||
                  {}
                ),
              ]
            );


          if (
            [
              "APPROVE",
              "REJECT",
            ].includes(
              input.decision
            )
          ) {
            await client.query(
              `
                UPDATE
                  learning.review_tasks

                SET
                  status =
                    'COMPLETED',

                  completed_at =
                    NOW(),

                  updated_at =
                    NOW()

                WHERE
                  id =
                    $1
              `,
              [
                task.id,
              ]
            );
          }


          await client.query(
            "COMMIT"
          );


          return {
            id:
              decisionResult.rows[0].id,

            publicId:
              decisionResult.rows[0]
                .public_id,

            candidateId:
              task.candidate_id,

            decision:
              decisionResult.rows[0]
                .decision,

            reason:
              decisionResult.rows[0]
                .reason,

            reviewerId:
              decisionResult.rows[0]
                .reviewer_id,

            executionAuthorized:
              false,
          };
        }
        catch (
          error
        ) {
          await client.query(
            "ROLLBACK"
          );


          throw error;
        }
      }
    );
  }
}


function mapTask(
  row
) {
  return {
    id:
      row.id,

    publicId:
      row.public_id,

    candidateId:
      row.candidate_id,

    validationRunId:
      row.validation_run_id,

    status:
      row.status,

    riskClassification:
      row.risk_classification,

    requiresIndependentReviewer:
      row.requires_independent_reviewer,

    sourceOperatorId:
      row.source_operator_id,

    assignedReviewerId:
      row.assigned_reviewer_id,

    executionAuthorized:
      false,
  };
}


module.exports = {
  PostgresLearningReviewRepository,
};