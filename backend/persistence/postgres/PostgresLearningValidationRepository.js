"use strict";


const crypto =
  require(
    "node:crypto"
  );


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


function digest(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      JSON.stringify(
        value
      )
    )
    .digest(
      "hex"
    );
}


function mapRun(
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

    candidateId:
      row.candidate_id,

    validationVersion:
      Number(
        row.validation_version
      ),

    status:
      row.status,

    validationProfile:
      row.validation_profile,

    sourceDigest:
      row.source_digest,

    candidateDigest:
      row.candidate_digest,

    replayPass:
      row.replay_pass,

    reliabilityLabPass:
      row.reliability_lab_pass,

    regressionPass:
      row.regression_pass,

    safetyPass:
      row.safety_pass,

    overallPass:
      row.overall_pass,

    summary:
      row.summary ||
      {},

    executionAuthorized:
      false,

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


class PostgresLearningValidationRepository {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||

      new PostgresTenantScope(
        options
      );
  }


  async createValidationRun(
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
                INSERT INTO
                  learning.validation_runs (
                    organization_id,
                    environment_id,
                    candidate_id,
                    validation_version,
                    status,
                    validation_profile,
                    source_digest,
                    candidate_digest,
                    summary,
                    execution_authorized
                  )

                SELECT
                  c.organization_id,
                  c.environment_id,
                  c.id,
                  COALESCE(
                    (
                      SELECT
                        MAX(
                          validation_version
                        ) + 1

                      FROM
                        learning.validation_runs vr

                      WHERE
                        vr.candidate_id =
                          c.id
                    ),
                    1
                  ),
                  'PENDING',
                  $2,
                  c.source_digest,
                  c.candidate_digest,
                  '{}'::jsonb,
                  FALSE

                FROM
                  learning.knowledge_candidates c

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
                    'QUARANTINED'

                RETURNING *
              `,
              [
                candidateId,

                input.validationProfile ||
                "STANDARD",
              ]
            );


          if (
            !result.rows[0]
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_VALIDATION_CANDIDATE_NOT_QUARANTINED",
              "Validation may begin only for a quarantined candidate",
              409
            );
          }


          const run =
            result.rows[0];


          for (
            const stage
            of [
              "REPLAY",
              "RELIABILITY_LAB",
              "REGRESSION",
              "SAFETY",
            ]
          ) {
            await client.query(
              `
                INSERT INTO
                  learning.validation_stages (
                    organization_id,
                    environment_id,
                    validation_run_id,
                    stage_type,
                    status,
                    execution_authorized
                  )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  $4,
                  'PENDING',
                  FALSE
                )
              `,
              [
                run.organization_id,

                run.environment_id,

                run.id,

                stage,
              ]
            );
          }


          return mapRun(
            run
          );
        }
      );
  }


  async getValidationRun(
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
                SELECT *
                FROM
                  learning.validation_runs

                WHERE
                  public_id =
                    $1

                  OR

                  id::text =
                    $1

                LIMIT 1
              `,
              [
                validationRunId,
              ]
            );


          return mapRun(
            result.rows[0]
          );
        }
      );
  }


  async setStageResult(
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


    const stageType =
      requireString(
        input.stageType,
        "stageType"
      );


    const passed =
      input.passed ===
      true;


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
                    $2,

                  pass =
                    $3,

                  metrics =
                    $4::jsonb,

                  reason =
                    $5,

                  started_at =
                    COALESCE(
                      started_at,
                      NOW()
                    ),

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

                  s.stage_type =
                    $6

                RETURNING
                  s.*
              `,
              [
                validationRunId,

                passed
                  ? "PASSED"
                  : "FAILED",

                passed,

                JSON.stringify(
                  input.metrics ||
                  {}
                ),

                input.reason ||
                null,

                stageType,
              ]
            );


          if (
            !result.rows[0]
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_VALIDATION_STAGE_NOT_FOUND",
              "Validation stage not found",
              404
            );
          }


          return {
            stageType:
              result.rows[0]
                .stage_type,

            status:
              result.rows[0]
                .status,

            passed:
              result.rows[0]
                .pass,

            metrics:
              result.rows[0]
                .metrics ||
              {},

            executionAuthorized:
              false,
          };
        }
      );
  }


  async addEvidence(
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


    const evidencePayload =
      input.evidencePayload ||
      {};


    const evidenceDigest =
      input.evidenceDigest ||
      digest(
        evidencePayload
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
                INSERT INTO
                  learning.validation_evidence (
                    organization_id,
                    environment_id,
                    validation_run_id,
                    stage_type,
                    evidence_type,
                    source_system,
                    source_reference,
                    evidence_payload,
                    evidence_digest,
                    execution_authorized
                  )

                SELECT
                  vr.organization_id,
                  vr.environment_id,
                  vr.id,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6::jsonb,
                  $7,
                  FALSE

                FROM
                  learning.validation_runs vr

                WHERE
                  vr.public_id =
                    $1

                  OR

                  vr.id::text =
                    $1

                RETURNING *
              `,
              [
                validationRunId,

                requireString(
                  input.stageType,
                  "stageType"
                ),

                requireString(
                  input.evidenceType,
                  "evidenceType"
                ),

                requireString(
                  input.sourceSystem,
                  "sourceSystem"
                ),

                input.sourceReference ||
                null,

                JSON.stringify(
                  evidencePayload
                ),

                evidenceDigest,
              ]
            );


          if (
            !result.rows[0]
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_VALIDATION_RUN_NOT_FOUND",
              "Validation run not found",
              404
            );
          }


          return {
            id:
              result.rows[0].id,

            evidenceDigest:
              result.rows[0]
                .evidence_digest,

            executionAuthorized:
              false,
          };
        }
      );
  }


  async bindReplayCase(
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
                INSERT INTO
                  learning.replay_bindings (
                    organization_id,
                    environment_id,
                    validation_run_id,
                    candidate_id,
                    reality_case_id,
                    replay_run_id,
                    binding_role,
                    result_status,
                    result_payload,
                    execution_authorized
                  )

                SELECT
                  vr.organization_id,
                  vr.environment_id,
                  vr.id,
                  c.id,
                  $3,
                  $4,
                  $5,
                  $6,
                  $7::jsonb,
                  FALSE

                FROM
                  learning.validation_runs vr

                JOIN
                  learning.knowledge_candidates c
                    ON c.organization_id =
                       vr.organization_id

                   AND c.environment_id =
                       vr.environment_id

                WHERE
                  (
                    vr.public_id =
                      $1

                    OR

                    vr.id::text =
                      $1
                  )

                  AND

                  (
                    c.public_id =
                      $2

                    OR

                    c.id::text =
                      $2
                  )

                ON CONFLICT (
                  validation_run_id,
                  reality_case_id,
                  binding_role
                )
                DO UPDATE SET
                  replay_run_id =
                    EXCLUDED.replay_run_id,

                  result_status =
                    EXCLUDED.result_status,

                  result_payload =
                    EXCLUDED.result_payload,

                  updated_at =
                    NOW()

                RETURNING *
              `,
              [
                validationRunId,

                candidateId,

                requireString(
                  input.realityCaseId,
                  "realityCaseId"
                ),

                input.replayRunId ||
                null,

                input.bindingRole ||
                "SOURCE_INCIDENT",

                input.resultStatus ||
                "PENDING",

                JSON.stringify(
                  input.resultPayload ||
                  {}
                ),
              ]
            );


          if (
            !result.rows[0]
          ) {
            throw humanLearningError(
              "HUMAN_LEARNING_REPLAY_BINDING_FAILED",
              "Could not bind candidate validation to Reality replay",
              404
            );
          }


          return {
            id:
              result.rows[0].id,

            realityCaseId:
              result.rows[0]
                .reality_case_id,

            replayRunId:
              result.rows[0]
                .replay_run_id,

            bindingRole:
              result.rows[0]
                .binding_role,

            resultStatus:
              result.rows[0]
                .result_status,

            executionAuthorized:
              false,
          };
        }
      );
  }
}


module.exports = {
  PostgresLearningValidationRepository,
};