"use strict";


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


function createError(
  message,
  code,
  status =
    409,
  details =
    {}
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

      ...details,
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
    "CONTROL_RETURN_ORGANIZATION_REQUIRED"
  );


  requireValue(
    input.environmentId,
    "environmentId",
    "CONTROL_RETURN_ENVIRONMENT_REQUIRED"
  );


  requireValue(
    input.incidentId,
    "incidentId",
    "CONTROL_RETURN_INCIDENT_REQUIRED"
  );


  return {
    organizationId:
      input.organizationId,

    environmentId:
      input.environmentId,

    incidentId:
      input.incidentId,
  };
}


function parseJson(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return {};
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
      return {};
    }
  }


  return value;
}


function mapFence(
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

    incidentId:
      row.incident_id,

    controlLeaseId:
      row.control_lease_id,

    takeoverSessionId:
      row.takeover_session_id,

    previousControlEpoch:
      Number(
        row.previous_control_epoch
      ),

    requiredControlEpoch:
      Number(
        row.required_control_epoch
      ),

    releaseOutcome:
      row.release_outcome,

    state:
      row.state,

    freshAfter:
      row.fresh_after,

    freshDiagnosisId:
      row.fresh_diagnosis_id,

    freshRecoveryDecisionId:
      row.fresh_recovery_decision_id,

    satisfiedAt:
      row.satisfied_at,

    supersededAt:
      row.superseded_at,

    stalePlanResumeAllowed:
      false,

    metadata:
      parseJson(
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


class PostgresControlReturnFenceRepository {
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


  async getPending(
    input =
      {},
    transaction =
      null
  ) {
    const scope =
      requireScope(
        input
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
              SELECT *
              FROM
                human_operations.control_return_fences

              WHERE
                incident_id = $1

                AND
                state =
                  'REQUIRES_FRESH_EVALUATION'

              ORDER BY
                created_at DESC

              LIMIT 1
            `,
            [
              String(
                input.incidentId
              ),
            ]
          );


        return mapFence(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async getLatest(
    input =
      {},
    transaction =
      null
  ) {
    const scope =
      requireScope(
        input
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
              SELECT *
              FROM
                human_operations.control_return_fences

              WHERE
                incident_id = $1

              ORDER BY
                created_at DESC

              LIMIT 1
            `,
            [
              String(
                input.incidentId
              ),
            ]
          );


        return mapFence(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async certifyFreshEvaluation(
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
      input.diagnosisId,
      "diagnosisId",
      "CONTROL_RETURN_FRESH_DIAGNOSIS_REQUIRED"
    );


    requireValue(
      input.recoveryDecisionId,
      "recoveryDecisionId",
      "CONTROL_RETURN_FRESH_RECOVERY_DECISION_REQUIRED"
    );


    return this.scope.run(
      scope,

      async (
        client,
        resolved
      ) => {
        /*
         * Serialize satisfaction of the current fence.
         */
        const fenceResult =
          await client.query(
            `
              SELECT *
              FROM
                human_operations.control_return_fences

              WHERE
                incident_id = $1

                AND
                state =
                  'REQUIRES_FRESH_EVALUATION'

              ORDER BY
                created_at DESC

              LIMIT 1

              FOR UPDATE
            `,
            [
              String(
                input.incidentId
              ),
            ]
          );


        const fence =
          fenceResult.rows[0];


        if (
          !fence
        ) {
          throw createError(
            "No pending control-return fence exists for this incident",
            "CONTROL_RETURN_FENCE_NOT_FOUND",
            404
          );
        }


        /*
         * Resolve the canonical PostgreSQL incident UUID.
         */
        const incident =
          await this.scope
            .identityResolver
            .resolveIncident(
              client,
              resolved,
              input.incidentId
            );


        if (
          !incident
        ) {
          throw createError(
            `Incident not found: ${input.incidentId}`,
            "CONTROL_RETURN_INCIDENT_NOT_FOUND",
            404
          );
        }


        /*
         * ====================================================================
         * FRESH DIAGNOSIS
         * ====================================================================
         *
         * It must:
         *
         * - belong to this tenant/environment/incident
         * - be CURRENT
         * - have been created after the human-control return boundary
         * - carry no execution authority
         */


        const diagnosisResult =
          await client.query(
            `
              SELECT *
              FROM
                incidents.diagnoses

              WHERE
                organization_id = $1

                AND
                environment_id = $2

                AND
                incident_id = $3

                AND
                public_id = $4

                AND
                is_current = TRUE

                AND
                created_at >= $5

                AND
                execution_authorized = FALSE

              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              incident.id,

              String(
                input.diagnosisId
              ),

              fence.fresh_after,
            ]
          );


        const diagnosis =
          diagnosisResult.rows[0];


        if (
          !diagnosis
        ) {
          throw createError(
            "Diagnosis is missing, stale, non-current, or belongs to another incident",
            "CONTROL_RETURN_STALE_DIAGNOSIS",
            409,
            {
              freshAfter:
                fence.fresh_after,

              diagnosisId:
                input.diagnosisId,

              stalePlanResumeAllowed:
                false,
            }
          );
        }


        /*
         * ====================================================================
         * FRESH RECOVERY DECISION
         * ====================================================================
         *
         * The decision must be generated after return control AND must point
         * to the fresh diagnosis above.
         */


        const decisionResult =
          await client.query(
            `
              SELECT *
              FROM
                execution.recovery_decisions

              WHERE
                organization_id = $1

                AND
                environment_id = $2

                AND
                incident_id = $3

                AND
                public_id = $4

                AND
                diagnosis_id = $5

                AND
                is_current = TRUE

                AND
                created_at >= $6

                AND
                execution_authorized = FALSE

              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              incident.id,

              String(
                input.recoveryDecisionId
              ),

              diagnosis.id,

              fence.fresh_after,
            ]
          );


        const decision =
          decisionResult.rows[0];


        if (
          !decision
        ) {
          throw createError(
            "Recovery decision is missing, stale, non-current, or not based on the fresh diagnosis",
            "CONTROL_RETURN_STALE_RECOVERY_DECISION",
            409,
            {
              freshAfter:
                fence.fresh_after,

              recoveryDecisionId:
                input.recoveryDecisionId,

              diagnosisId:
                input.diagnosisId,

              stalePlanResumeAllowed:
                false,
            }
          );
        }


        const updated =
          await client.query(
            `
              UPDATE
                human_operations.control_return_fences

              SET
                state =
                  'SATISFIED',

                fresh_diagnosis_id =
                  $2,

                fresh_recovery_decision_id =
                  $3,

                satisfied_at =
                  NOW(),

                updated_at =
                  NOW(),

                stale_plan_resume_allowed =
                  FALSE,

                metadata =
                  metadata ||
                  $4::jsonb,

                execution_authorized =
                  FALSE

              WHERE
                id = $1

                AND
                state =
                  'REQUIRES_FRESH_EVALUATION'

              RETURNING *
            `,
            [
              fence.id,

              diagnosis.id,

              decision.id,

              JSON.stringify({
                freshEvaluationCertified:
                  true,

                diagnosisPublicId:
                  diagnosis.public_id,

                recoveryDecisionPublicId:
                  decision.public_id,

                stalePlanResumeAllowed:
                  false,

                executionAuthorized:
                  false,
              }),
            ]
          );


        if (
          updated.rows.length !==
          1
        ) {
          throw createError(
            "Control-return fence changed during certification",
            "CONTROL_RETURN_FENCE_CONFLICT",
            409
          );
        }


        return {
          fence:
            mapFence(
              updated.rows[0],
              resolved
            ),

          diagnosisId:
            diagnosis.public_id,

          recoveryDecisionId:
            decision.public_id,

          freshEvaluationCertified:
            true,

          stalePlanResumeAllowed:
            false,

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }
}


module.exports =
  PostgresControlReturnFenceRepository;