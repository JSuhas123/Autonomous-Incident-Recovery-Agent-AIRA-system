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
  assertPoisoningCannotAuthorize,
} = require(
  "../../contracts/humanLearningPoisoning"
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


class PostgresLearningPoisoningRepository {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||

      new PostgresTenantScope(
        options
      );
  }


  async recordTrustAssessment(
    input = {}
  ) {
    assertPoisoningCannotAuthorize(
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
                learning.evidence_trust_assessments (
                  organization_id,
                  environment_id,
                  candidate_id,
                  content_channel,
                  trust_level,
                  trusted,
                  reasons,
                  metadata,
                  execution_authorized
                )

              SELECT
                c.organization_id,
                c.environment_id,
                c.id,
                $2,
                $3,
                $4,
                $5::jsonb,
                $6::jsonb,
                FALSE

              FROM
                learning.knowledge_candidates c

              WHERE
                c.public_id =
                  $1

                OR

                c.id::text =
                  $1

              RETURNING *
            `,
            [
              required(
                input.candidateId,
                "candidateId"
              ),

              required(
                input.contentChannel,
                "contentChannel"
              ),

              required(
                input.trustLevel,
                "trustLevel"
              ),

              input.trusted ===
                true,

              JSON.stringify(
                input.reasons ||
                []
              ),

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
            "HUMAN_LEARNING_CANDIDATE_NOT_FOUND",

            "Candidate not found",

            404
          );
        }


        return {
          publicId:
            result.rows[0].public_id,

          executionAuthorized:
            false,
        };
      }
    );
  }


  async recordPoisoningFinding(
    input = {}
  ) {
    assertPoisoningCannotAuthorize(
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
                learning.poisoning_findings (
                  organization_id,
                  environment_id,
                  candidate_id,
                  poisoning_class,
                  detected,
                  severity,
                  evidence,
                  reason,
                  execution_authorized
                )

              SELECT
                c.organization_id,
                c.environment_id,
                c.id,
                $2,
                TRUE,
                $3,
                $4::jsonb,
                $5,
                FALSE

              FROM
                learning.knowledge_candidates c

              WHERE
                c.public_id =
                  $1

                OR

                c.id::text =
                  $1

              RETURNING *
            `,
            [
              required(
                input.candidateId,
                "candidateId"
              ),

              required(
                input.poisoningClass,
                "poisoningClass"
              ),

              required(
                input.severity,
                "severity"
              ),

              JSON.stringify(
                input.evidence ||
                []
              ),

              required(
                input.reason,
                "reason"
              ),
            ]
          );


        return {
          publicId:
            result.rows[0]
              ?.public_id,

          executionAuthorized:
            false,
        };
      }
    );
  }


  async recordOutcomeVerification(
    input = {}
  ) {
    assertPoisoningCannotAuthorize(
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
                learning.outcome_verifications (
                  organization_id,
                  environment_id,
                  candidate_id,
                  service_restored,
                  root_cause_corrected,
                  stability_window_pass,
                  recurrence_check_pass,
                  metrics_normalized,
                  dependency_health_pass,
                  independent_verification_pass,
                  root_cause_evidence_pass,
                  false_success_detected,
                  temporary_mitigation_detected,
                  evidence,
                  execution_authorized
                )

              SELECT
                c.organization_id,
                c.environment_id,
                c.id,
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
                $12::jsonb,
                FALSE

              FROM
                learning.knowledge_candidates c

              WHERE
                c.public_id =
                  $1

                OR

                c.id::text =
                  $1

              RETURNING *
            `,
            [
              required(
                input.candidateId,
                "candidateId"
              ),

              input.serviceRestored ===
                true,

              input.rootCauseCorrected ===
                true,

              input.stabilityWindowPass ===
                true,

              input.recurrenceCheckPass ===
                true,

              input.metricsNormalized ===
                true,

              input.dependencyHealthPass ===
                true,

              input.independentVerificationPass ===
                true,

              input.rootCauseEvidencePass ===
                true,

              input.falseSuccessDetected ===
                true,

              input.temporaryMitigationDetected ===
                true,

              JSON.stringify(
                input.evidence ||
                {}
              ),
            ]
          );


        return {
          publicId:
            result.rows[0]
              ?.public_id,

          executionAuthorized:
            false,
        };
      }
    );
  }
}


module.exports = {
  PostgresLearningPoisoningRepository,
};