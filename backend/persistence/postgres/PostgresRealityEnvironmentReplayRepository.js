"use strict";

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );

const ENVIRONMENT_REPLAY_RUN_STAGE =
  Object.freeze({
    CREATED:
      "CREATED",

    LAB_RESERVED:
      "LAB_RESERVED",

    EXPERIMENT_BOUND:
      "EXPERIMENT_BOUND",

    INJECTING:
      "INJECTING",

    OBSERVING:
      "OBSERVING",

    INVESTIGATING:
      "INVESTIGATING",

    RECOVERY_PENDING:
      "RECOVERY_PENDING",

    RECOVERING:
      "RECOVERING",

    VERIFYING:
      "VERIFYING",

    RESETTING:
      "RESETTING",

    COMPLETED:
      "COMPLETED",

    FAILED:
      "FAILED",
  });

function repositoryError(
  code,
  message,
  status = 422
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

function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw repositoryError(
      "REALITY_ENVIRONMENT_REPLAY_BINDING_FIELD_REQUIRED",
      `${field} is required`
    );
  }

  return value.trim();
}

function requireStage(
  value
) {
  const stage =
    requireString(
      value,
      "stage"
    );

  if (
    !Object.values(
      ENVIRONMENT_REPLAY_RUN_STAGE
    ).includes(
      stage
    )
  ) {
    throw repositoryError(
      "REALITY_ENVIRONMENT_REPLAY_BINDING_STAGE_INVALID",
      `Unsupported environment replay stage ${stage}`
    );
  }

  return stage;
}

function mapEnvironmentReplayRun(
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

    environmentReplayRunId:
      row.public_id,

    replayRunDatabaseId:
      row.replay_run_id,

    replayRunId:
      row.replay_run_public_id,

    caseId:
      row.case_public_id,

    caseRevision:
      Number(
        row.case_revision
      ),

    caseContentHash:
      row.case_content_hash,

    labEnvironmentDatabaseId:
      row.lab_environment_id,

    labEnvironmentId:
      row.lab_environment_public_id,

    experimentRunDatabaseId:
      row.experiment_run_id,

    experimentRunId:
      row.experiment_run_public_id,

    correlationId:
      row.correlation_id,

    mode:
      row.mode,

    stage:
      row.stage,

    failureCode:
      row.failure_code,

    failureMessage:
      row.failure_message,

    metadata:
      row.metadata ||
      {},

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,

    failedAt:
      row.failed_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    groundTruthAgentVisible:
      false,

    productionCertified:
      false,

    executionAuthorized:
      false,
  };
}

class PostgresRealityEnvironmentReplayRepository {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||
      new PostgresTenantScope(
        options
      );
  }

  async createBinding(
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

    const replayRunId =
      requireString(
        input.replayRunId,
        "replayRunId"
      );

    const labEnvironmentId =
      requireString(
        input.labEnvironmentId,
        "labEnvironmentId"
      );

    const correlationId =
      requireString(
        input.correlationId,
        "correlationId"
      );

    const mode =
      requireString(
        input.mode,
        "mode"
      );

    return this.tenantScope.run(
      {
        organizationId,
        environmentId,
      },
      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                reality.environment_replay_runs (
                  organization_id,
                  environment_id,
                  replay_run_id,
                  replay_run_public_id,
                  case_public_id,
                  case_revision,
                  case_content_hash,
                  lab_environment_id,
                  lab_environment_public_id,
                  correlation_id,
                  mode,
                  stage,
                  metadata,
                  execution_authorized
                )
              SELECT
                $1::uuid,
                $2::uuid,
                rr.id,
                rr.public_id,
                rr.case_public_id,
                rr.case_revision,
                rr.case_content_hash,
                le.id,
                le.public_id,
                $5,
                $6,
                'LAB_RESERVED',
                $7::jsonb,
                FALSE
              FROM
                reality.replay_runs rr
              JOIN
                reliability.lab_environments le
                  ON le.organization_id = rr.organization_id
                 AND le.environment_id = rr.environment_id
              WHERE
                rr.public_id = $3
                AND le.public_id = $4
                AND rr.organization_id = $1::uuid
                AND rr.environment_id = $2::uuid
                AND rr.execution_authorized = FALSE
                AND le.execution_authorized = FALSE
                AND le.production = FALSE
              ON CONFLICT (
                organization_id,
                environment_id,
                replay_run_id,
                lab_environment_id
              )
              DO UPDATE SET
                correlation_id = EXCLUDED.correlation_id,
                mode = EXCLUDED.mode,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
              RETURNING *
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
              replayRunId,
              labEnvironmentId,
              correlationId,
              mode,
              JSON.stringify(
                input.metadata ||
                {}
              ),
            ]
          );

        const binding =
          mapEnvironmentReplayRun(
            result.rows[
              0
            ]
          );

        if (
          !binding
        ) {
          throw repositoryError(
            "REALITY_ENVIRONMENT_REPLAY_BINDING_TARGET_NOT_FOUND",
            (
              "Replay run and LAB_ONLY environment " +
              "could not be bound in the requested tenant scope"
            ),
            404
          );
        }

        return binding;
      }
    );
  }

  async bindExperimentRun(
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

    const environmentReplayRunId =
      requireString(
        input.environmentReplayRunId,
        "environmentReplayRunId"
      );

    const experimentRunId =
      requireString(
        input.experimentRunId,
        "experimentRunId"
      );

    return this.tenantScope.run(
      {
        organizationId,
        environmentId,
      },
      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              UPDATE
                reality.environment_replay_runs err
              SET
                experiment_run_id = er.id,
                experiment_run_public_id = er.public_id,
                stage = 'EXPERIMENT_BOUND',
                started_at = COALESCE(
                  err.started_at,
                  NOW()
                ),
                updated_at = NOW()
              FROM
                reliability.experiment_runs er
              WHERE
                err.public_id = $3
                AND er.public_id = $4
                AND err.organization_id = $1::uuid
                AND err.environment_id = $2::uuid
                AND er.organization_id = err.organization_id
                AND er.environment_id = err.environment_id
                AND er.lab_environment_id = err.lab_environment_id
                AND er.correlation_id = err.correlation_id
                AND err.execution_authorized = FALSE
                AND er.execution_authorized = FALSE
              RETURNING err.*
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
              environmentReplayRunId,
              experimentRunId,
            ]
          );

        const binding =
          mapEnvironmentReplayRun(
            result.rows[
              0
            ]
          );

        if (
          !binding
        ) {
          throw repositoryError(
            "REALITY_ENVIRONMENT_REPLAY_EXPERIMENT_BINDING_REJECTED",
            (
              "Phase 21 experiment run did not match the " +
              "environment replay tenant, lab, or correlation identity"
            ),
            409
          );
        }

        return binding;
      }
    );
  }

  async getBinding(
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

    const environmentReplayRunId =
      requireString(
        input.environmentReplayRunId,
        "environmentReplayRunId"
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
              SELECT *
              FROM
                reality.environment_replay_runs
              WHERE
                public_id = $1
              LIMIT 1
            `,
            [
              environmentReplayRunId,
            ]
          );

        return mapEnvironmentReplayRun(
          result.rows[
            0
          ]
        );
      }
    );
  }

  async transitionStage(
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

    const environmentReplayRunId =
      requireString(
        input.environmentReplayRunId,
        "environmentReplayRunId"
      );

    const stage =
      requireStage(
        input.stage
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
              UPDATE
                reality.environment_replay_runs
              SET
                stage = $2,
                completed_at = CASE
                  WHEN $2 = 'COMPLETED'
                    THEN NOW()
                  ELSE completed_at
                END,
                failed_at = CASE
                  WHEN $2 = 'FAILED'
                    THEN NOW()
                  ELSE failed_at
                END,
                failure_code = CASE
                  WHEN $2 = 'FAILED'
                    THEN $3
                  ELSE failure_code
                END,
                failure_message = CASE
                  WHEN $2 = 'FAILED'
                    THEN $4
                  ELSE failure_message
                END,
                updated_at = NOW()
              WHERE
                public_id = $1
              RETURNING *
            `,
            [
              environmentReplayRunId,
              stage,
              input.failureCode ||
                null,
              input.failureMessage ||
                null,
            ]
          );

        return mapEnvironmentReplayRun(
          result.rows[
            0
          ]
        );
      }
    );
  }
}

module.exports = {
  PostgresRealityEnvironmentReplayRepository,
  ENVIRONMENT_REPLAY_RUN_STAGE,
  mapEnvironmentReplayRun,
};