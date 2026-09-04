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
  assertGeneralizationCannotAuthorize,
} =
  require(
    "../../contracts/humanLearningGeneralization"
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


class PostgresLearningGeneralizationRepository {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||

      new PostgresTenantScope(
        options
      );
  }


  async createRequest(
    input = {}
  ) {
    assertGeneralizationCannotAuthorize(
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


    return this.tenantScope.run(
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
                learning.generalization_requests (
                  organization_id,
                  environment_id,
                  source_candidate_id,
                  source_candidate_digest,
                  source_scope,
                  target_scope,
                  status,
                  request_reason,
                  requested_by_type,
                  requested_by_id,
                  metadata,
                  execution_authorized
                )

              SELECT
                c.organization_id,
                c.environment_id,
                c.id,
                c.candidate_digest,
                c.knowledge_scope,
                'GLOBAL',
                'REQUESTED',
                $2,
                $3,
                $4,
                $5::jsonb,
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

                c.knowledge_scope IN (
                  'ORGANIZATION',
                  'ENVIRONMENT'
                )

                AND

                c.candidate_state IN (
                  'HUMAN_REVIEW_PENDING',
                  'APPROVED'
                )

                AND

                c.execution_authorized =
                  FALSE

              RETURNING *
            `,
            [
              candidateId,

              requireString(
                input.reason,
                "reason"
              ),

              input.requestedByType ||
              "SYSTEM",

              input.requestedById ||
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
            "HUMAN_LEARNING_GENERALIZATION_SOURCE_INELIGIBLE",

            (
              "Generalization requires a tenant-scoped, " +
              "validated candidate awaiting or having human review"
            ),

            409
          );
        }


        return {
          id:
            result.rows[0].id,

          publicId:
            result.rows[0]
              .public_id,

          sourceCandidateId:
            result.rows[0]
              .source_candidate_id,

          sourceCandidateDigest:
            result.rows[0]
              .source_candidate_digest,

          sourceScope:
            result.rows[0]
              .source_scope,

          targetScope:
            "GLOBAL",

          status:
            result.rows[0]
              .status,

          executionAuthorized:
            false,
        };
      }
    );
  }


  async updateRequestStatus(
    input = {}
  ) {
    assertGeneralizationCannotAuthorize(
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
              UPDATE
                learning.generalization_requests

              SET
                status =
                  $2,

                metadata =
                  metadata ||
                  $3::jsonb,

                completed_at =
                  CASE
                    WHEN $2 IN (
                      'BOUNDARY_APPROVED',
                      'BOUNDARY_REJECTED',
                      'FAILED',
                      'CANCELLED'
                    )
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

              RETURNING *
            `,
            [
              requireString(
                input.generalizationRequestId,
                "generalizationRequestId"
              ),

              requireString(
                input.status,
                "status"
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
            "HUMAN_LEARNING_GENERALIZATION_REQUEST_NOT_FOUND",

            "Generalization request not found",

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

          executionAuthorized:
            false,
        };
      }
    );
  }


  async createArtifact(
    input = {}
  ) {
    assertGeneralizationCannotAuthorize(
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
                learning.generalization_artifacts (
                  generalized_candidate_public_id,
                  organization_id,
                  environment_id,
                  generalization_request_id,
                  source_candidate_id,
                  artifact_digest,
                  proposed_scope,
                  candidate_type,
                  truth_level,
                  generalized_candidate,
                  redaction_manifest,
                  leakage_findings,
                  status,
                  publication_eligible,
                  requires_independent_validation,
                  execution_authorized
                )

              SELECT
                $2,
                r.organization_id,
                r.environment_id,
                r.id,
                r.source_candidate_id,
                $3,
                'GLOBAL',
                $4,
                'CANDIDATE',
                $5::jsonb,
                $6::jsonb,
                $7::jsonb,
                $8,
                FALSE,
                TRUE,
                FALSE

              FROM
                learning.generalization_requests r

              WHERE
                r.public_id =
                  $1

                OR

                r.id::text =
                  $1

              RETURNING *
            `,
            [
              requireString(
                input.generalizationRequestId,
                "generalizationRequestId"
              ),

              requireString(
                input.generalizedCandidatePublicId,
                "generalizedCandidatePublicId"
              ),

              requireString(
                input.artifactDigest,
                "artifactDigest"
              ),

              requireString(
                input.candidateType,
                "candidateType"
              ),

              JSON.stringify(
                input.generalizedCandidate
              ),

              JSON.stringify(
                input.redactionManifest ||
                {}
              ),

              JSON.stringify(
                input.leakageFindings ||
                []
              ),

              input.status ||
              "QUARANTINED",
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw humanLearningError(
            "HUMAN_LEARNING_GENERALIZATION_ARTIFACT_FAILED",

            "Could not persist generalized candidate artifact",

            404
          );
        }


        return {
          id:
            result.rows[0].id,

          publicId:
            result.rows[0]
              .public_id,

          generalizedCandidatePublicId:
            result.rows[0]
              .generalized_candidate_public_id,

          status:
            result.rows[0]
              .status,

          publicationEligible:
            false,

          requiresIndependentValidation:
            true,

          executionAuthorized:
            false,
        };
      }
    );
  }


  async recordIsolationCheck(
    input = {}
  ) {
    assertGeneralizationCannotAuthorize(
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
                learning.generalization_isolation_checks (
                  organization_id,
                  environment_id,
                  generalization_request_id,
                  artifact_id,
                  check_type,
                  passed,
                  findings,
                  metrics,
                  execution_authorized
                )

              SELECT
                r.organization_id,
                r.environment_id,
                r.id,
                a.id,
                $3,
                $4,
                $5::jsonb,
                $6::jsonb,
                FALSE

              FROM
                learning.generalization_requests r

              JOIN
                learning.generalization_artifacts a
                  ON a.generalization_request_id =
                     r.id

              WHERE
                (
                  r.public_id =
                    $1

                  OR

                  r.id::text =
                    $1
                )

                AND

                (
                  a.public_id =
                    $2

                  OR

                  a.id::text =
                    $2
                )

              ON CONFLICT (
                artifact_id,
                check_type
              )
              DO UPDATE SET
                passed =
                  EXCLUDED.passed,

                findings =
                  EXCLUDED.findings,

                metrics =
                  EXCLUDED.metrics

              RETURNING *
            `,
            [
              requireString(
                input.generalizationRequestId,
                "generalizationRequestId"
              ),

              requireString(
                input.artifactId,
                "artifactId"
              ),

              requireString(
                input.checkType,
                "checkType"
              ),

              input.passed ===
                true,

              JSON.stringify(
                input.findings ||
                []
              ),

              JSON.stringify(
                input.metrics ||
                {}
              ),
            ]
          );


        return {
          checkType:
            result.rows[0]
              .check_type,

          passed:
            result.rows[0]
              .passed,

          executionAuthorized:
            false,
        };
      }
    );
  }
}


module.exports = {
  PostgresLearningGeneralizationRepository,
};