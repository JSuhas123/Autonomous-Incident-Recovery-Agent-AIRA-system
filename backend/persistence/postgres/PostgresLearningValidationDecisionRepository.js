"use strict";


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


const {
  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


const {
  assertValidationCannotAuthorize,
} =
  require(
    "../../contracts/humanLearningValidation"
  );


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string"
    ||
    value.trim() ===
      ""
  ) {
    throw humanLearningError(
      "HUMAN_LEARNING_FIELD_REQUIRED",

      `${field} is required`
    );
  }


  return value.trim();
}


class PostgresLearningValidationDecisionRepository {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||

      new PostgresTenantScope(
        options
      );
  }


  async markRunning(
    input = {}
  ) {
    assertValidationCannotAuthorize(
      input
    );


    return this.#updateRun({
      ...input,

      status:
        "RUNNING",

      overallPass:
        null,

      summary:
        input.summary ||
        {},

      start:
        true,

      complete:
        false,
    });
  }


  async completePassed(
    input = {}
  ) {
    assertValidationCannotAuthorize(
      input
    );


    return this.#updateRun({
      ...input,

      status:
        "COMPLETED",

      overallPass:
        true,

      summary:
        input.summary ||
        {},

      start:
        false,

      complete:
        true,
    });
  }


  async completeFailed(
    input = {}
  ) {
    assertValidationCannotAuthorize(
      input
    );


    return this.#updateRun({
      ...input,

      status:
        "FAILED",

      overallPass:
        false,

      summary:
        input.summary ||
        {},

      start:
        false,

      complete:
        true,
    });
  }


  async skipPendingStages(
    input = {}
  ) {
    assertValidationCannotAuthorize(
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


    const validationRunId =
      requireString(
        input.validationRunId,

        "validationRunId"
      );


    const exceptStages =
      Array.isArray(
        input.exceptStages
      )
        ? input.exceptStages
        : [];


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
                UPDATE
                  learning.validation_stages s

                SET
                  status =
                    'SKIPPED',

                  pass =
                    NULL,

                  reason =
                    $2,

                  completed_at =
                    NOW(),

                  updated_at =
                    NOW()

                FROM
                  learning.validation_runs vr

                WHERE
                  s.validation_run_id =
                    vr.id

                  AND
                  (
                    vr.public_id =
                      $1

                    OR

                    vr.id::text =
                      $1
                  )

                  AND
                  s.status =
                    'PENDING'

                  AND
                  NOT (
                    s.stage_type =
                      ANY(
                        $3::text[]
                      )
                  )

                RETURNING
                  s.stage_type
              `,
              [
                validationRunId,

                input.reason ||
                "Skipped after earlier validation gate failure",

                exceptStages,
              ]
            );


          return {
            skippedStages:
              result.rows.map(
                (
                  row
                ) =>
                  row.stage_type
              ),

            executionAuthorized:
              false,
          };
        }
      );
  }


  async #updateRun(
    input
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


    const validationRunId =
      requireString(
        input.validationRunId,

        "validationRunId"
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
                UPDATE
                  learning.validation_runs

                SET
                  status =
                    $2,

                  overall_pass =
                    $3,

                  summary =
                    $4::jsonb,

                  started_at =
                    CASE
                      WHEN $5::boolean
                      THEN COALESCE(
                        started_at,
                        NOW()
                      )
                      ELSE started_at
                    END,

                  completed_at =
                    CASE
                      WHEN $6::boolean
                      THEN NOW()
                      ELSE completed_at
                    END,

                  updated_at =
                    NOW()

                WHERE
                  public_id =
                    $1

                  OR

                  id::text =
                    $1

                RETURNING
                  *
              `,
              [
                validationRunId,

                input.status,

                input.overallPass,

                JSON.stringify(
                  input.summary ||
                  {}
                ),

                input.start ===
                  true,

                input.complete ===
                  true,
              ]
            );


          if (
            !result.rows[0]
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_VALIDATION_RUN_NOT_FOUND",

              "Learning validation run not found",

              404
            );
          }


          return {
            publicId:
              result.rows[0]
                .public_id,

            status:
              result.rows[0]
                .status,

            overallPass:
              result.rows[0]
                .overall_pass,

            summary:
              result.rows[0]
                .summary ||
              {},

            executionAuthorized:
              false,
          };
        }
      );
  }
}


module.exports = {
  PostgresLearningValidationDecisionRepository,
};