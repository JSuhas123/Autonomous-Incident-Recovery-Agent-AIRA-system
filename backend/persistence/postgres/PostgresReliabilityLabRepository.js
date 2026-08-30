"use strict";

const crypto =
  require(
    "node:crypto"
  );

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


class PostgresReliabilityLabRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  /*
   * ==========================================================================
   * LAB ENVIRONMENTS
   * ==========================================================================
   */


  async createLabEnvironment(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    const publicId =
      input.publicId ||
      generateId(
        "lab"
      );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                reliability.lab_environments (
                  public_id,

                  organization_id,
                  environment_id,

                  name,
                  kind,
                  status,

                  safety_class,
                  production,

                  infrastructure_ref,
                  namespace,

                  labels,
                  configuration,
                  baseline,

                  dirty_reason,

                  execution_authorized
                )
              VALUES (
                $1,

                $2,
                $3,

                $4,
                $5,
                $6,

                'LAB_ONLY',
                FALSE,

                $7,
                $8,

                $9::jsonb,
                $10::jsonb,
                $11::jsonb,

                $12,

                FALSE
              )

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.name,

              input.kind,

              input.status ||
              "ABSENT",

              input
                .infrastructureRef ||
              null,

              input.namespace ||
              null,

              JSON.stringify(
                input.labels ||
                {}
              ),

              JSON.stringify(
                input.configuration ||
                {}
              ),

              JSON.stringify(
                input.baseline ||
                {}
              ),

              input.dirtyReason ||
              null,
            ]
          );


        return mapLabEnvironment(
          result.rows[0]
        );
      },

      transaction
    );
  }


  async getLabEnvironment(
    {
      organizationId,

      environmentId,

      labEnvironmentId,
    },

    transaction =
      null
  ) {
    return this.scope.run(
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
                reliability.lab_environments
              WHERE
                public_id = $1
              LIMIT 1
            `,
            [
              labEnvironmentId,
            ]
          );


        return result.rows[0]
          ? mapLabEnvironment(
              result.rows[0]
            )
          : null;
      },

      transaction
    );
  }


  async listLabEnvironments(
    {
      organizationId,

      environmentId,

      status =
        null,
    },

    transaction =
      null
  ) {
    return this.scope.run(
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
                reliability.lab_environments
              WHERE
                (
                  $1::text IS NULL
                  OR
                  status = $1
                )

              ORDER BY
                created_at ASC
            `,
            [
              status,
            ]
          );


        return result.rows.map(
          mapLabEnvironment
        );
      },

      transaction
    );
  }


  async updateLabEnvironmentState(
    {
      organizationId,

      environmentId,

      labEnvironmentId,

      status,

      dirtyReason =
        undefined,

      baseline =
        undefined,

      lastBaselinedAt =
        undefined,

      lastResetAt =
        undefined,

      lastHealthCheckAt =
        undefined,
    },

    transaction =
      null
  ) {
    return this.scope.run(
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
                reliability.lab_environments

              SET
                status =
                  $2,

                dirty_reason =
                  CASE
                    WHEN $3::boolean
                    THEN $4
                    ELSE dirty_reason
                  END,

                baseline =
                  CASE
                    WHEN $5::boolean
                    THEN $6::jsonb
                    ELSE baseline
                  END,

                last_baselined_at =
                  CASE
                    WHEN $7::boolean
                    THEN $8
                    ELSE last_baselined_at
                  END,

                last_reset_at =
                  CASE
                    WHEN $9::boolean
                    THEN $10
                    ELSE last_reset_at
                  END,

                last_health_check_at =
                  CASE
                    WHEN $11::boolean
                    THEN $12
                    ELSE last_health_check_at
                  END

              WHERE
                public_id =
                  $1

              RETURNING *
            `,
            [
              labEnvironmentId,

              status,

              dirtyReason !==
                undefined,

              dirtyReason ===
                undefined
                ? null
                : dirtyReason,

              baseline !==
                undefined,

              JSON.stringify(
                baseline ||
                {}
              ),

              lastBaselinedAt !==
                undefined,

              lastBaselinedAt ||
              null,

              lastResetAt !==
                undefined,

              lastResetAt ||
              null,

              lastHealthCheckAt !==
                undefined,

              lastHealthCheckAt ||
              null,
            ]
          );


        return result.rows[0]
          ? mapLabEnvironment(
              result.rows[0]
            )
          : null;
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * EXPERIMENT DEFINITIONS
   * ==========================================================================
   */


  async createExperimentDefinition(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    const publicId =
      input.publicId ||
      generateId(
        "expdef"
      );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                reliability.experiment_definitions (
                  public_id,

                  organization_id,
                  environment_id,

                  experiment_key,
                  version,

                  name,
                  description,

                  failure_domain,
                  failure_type,

                  target_resource_type,

                  ground_truth,
                  assertions,
                  configuration,

                  enabled,

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
                $12::jsonb,
                $13::jsonb,

                $14,

                FALSE
              )

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.experimentKey,

              input.version,

              input.name,

              input.description ||
              null,

              input.failureDomain,

              input.failureType,

              input.targetResourceType,

              JSON.stringify(
                input.groundTruth
              ),

              JSON.stringify(
                input.assertions ||
                []
              ),

              JSON.stringify(
                input.configuration ||
                {}
              ),

              input.enabled !==
              false,
            ]
          );


        return mapExperimentDefinition(
          result.rows[0]
        );
      },

      transaction
    );
  }


  async getExperimentDefinition(
    {
      organizationId,

      environmentId,

      experimentKey,

      version =
        null,
    },

    transaction =
      null
  ) {
    return this.scope.run(
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
                reliability.experiment_definitions

              WHERE
                experiment_key =
                  $1

                AND

                (
                  $2::integer IS NULL
                  OR
                  version = $2
                )

              ORDER BY
                version DESC

              LIMIT 1
            `,
            [
              experimentKey,

              version,
            ]
          );


        return result.rows[0]
          ? mapExperimentDefinition(
              result.rows[0]
            )
          : null;
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * EXPERIMENT RUNS
   * ==========================================================================
   */


  async createExperimentRun(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    const publicId =
      input.publicId ||
      generateId(
        "exprun"
      );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                reliability.experiment_runs (
                  public_id,

                  organization_id,
                  environment_id,

                  lab_environment_id,
                  experiment_definition_id,

                  experiment_key,
                  experiment_version,

                  correlation_id,

                  status,

                  metadata,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                le.id,
                ed.id,

                ed.experiment_key,
                ed.version,

                $6,

                'CREATED',

                $7::jsonb,

                FALSE

              FROM
                reliability.lab_environments le,

                reliability.experiment_definitions ed

              WHERE
                le.public_id =
                  $4

                AND

                ed.experiment_key =
                  $5

                AND

                ed.version =
                  $8

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.labEnvironmentId,

              input.experimentKey,

              input.correlationId,

              JSON.stringify(
                input.metadata ||
                {}
              ),

              input.experimentVersion,
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw repositoryError(
            "RELIABILITY_RUN_DEPENDENCY_NOT_FOUND",
            "Lab environment or experiment definition was not found"
          );
        }


        return mapExperimentRun(
          result.rows[0]
        );
      },

      transaction
    );
  }


  async getExperimentRun(
    {
      organizationId,

      environmentId,

      experimentRunId,
    },

    transaction =
      null
  ) {
    return this.scope.run(
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
                reliability.experiment_runs

              WHERE
                public_id =
                  $1

              LIMIT 1
            `,
            [
              experimentRunId,
            ]
          );


        return result.rows[0]
          ? mapExperimentRun(
              result.rows[0]
            )
          : null;
      },

      transaction
    );
  }


  async updateExperimentRunState(
    {
      organizationId,

      environmentId,

      experimentRunId,

      status,

      outcome =
        undefined,

      startedAt =
        undefined,

      completedAt =
        undefined,

      baselineSnapshot =
        undefined,

      finalSnapshot =
        undefined,

      failureSummary =
        undefined,

      recoverySummary =
        undefined,

      verificationSummary =
        undefined,

      resetSummary =
        undefined,
    },

    transaction =
      null
  ) {
    return this.scope.run(
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
                reliability.experiment_runs

              SET
                status =
                  $2,

                outcome =
                  CASE
                    WHEN $3::boolean
                    THEN $4
                    ELSE outcome
                  END,

                started_at =
                  CASE
                    WHEN $5::boolean
                    THEN $6
                    ELSE started_at
                  END,

                completed_at =
                  CASE
                    WHEN $7::boolean
                    THEN $8
                    ELSE completed_at
                  END,

                baseline_snapshot =
                  CASE
                    WHEN $9::boolean
                    THEN $10::jsonb
                    ELSE baseline_snapshot
                  END,

                final_snapshot =
                  CASE
                    WHEN $11::boolean
                    THEN $12::jsonb
                    ELSE final_snapshot
                  END,

                failure_summary =
                  CASE
                    WHEN $13::boolean
                    THEN $14::jsonb
                    ELSE failure_summary
                  END,

                recovery_summary =
                  CASE
                    WHEN $15::boolean
                    THEN $16::jsonb
                    ELSE recovery_summary
                  END,

                verification_summary =
                  CASE
                    WHEN $17::boolean
                    THEN $18::jsonb
                    ELSE verification_summary
                  END,

                reset_summary =
                  CASE
                    WHEN $19::boolean
                    THEN $20::jsonb
                    ELSE reset_summary
                  END

              WHERE
                public_id =
                  $1

              RETURNING *
            `,
            [
              experimentRunId,

              status,

              outcome !==
                undefined,

              outcome ||
              null,

              startedAt !==
                undefined,

              startedAt ||
              null,

              completedAt !==
                undefined,

              completedAt ||
              null,

              baselineSnapshot !==
                undefined,

              JSON.stringify(
                baselineSnapshot ||
                {}
              ),

              finalSnapshot !==
                undefined,

              JSON.stringify(
                finalSnapshot ||
                {}
              ),

              failureSummary !==
                undefined,

              JSON.stringify(
                failureSummary ||
                {}
              ),

              recoverySummary !==
                undefined,

              JSON.stringify(
                recoverySummary ||
                {}
              ),

              verificationSummary !==
                undefined,

              JSON.stringify(
                verificationSummary ||
                {}
              ),

              resetSummary !==
                undefined,

              JSON.stringify(
                resetSummary ||
                {}
              ),
            ]
          );


        return result.rows[0]
          ? mapExperimentRun(
              result.rows[0]
            )
          : null;
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * EVIDENCE
   * ==========================================================================
   */


  async appendFailureInjection(
    input,
    transaction =
      null
  ) {
    return this._insertRunEvidence(
      "failure_injections",
      input,
      transaction
    );
  }


  async appendObservation(
    input,
    transaction =
      null
  ) {
    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                reliability.observations (
                  public_id,

                  organization_id,
                  environment_id,

                  experiment_run_id,

                  observation_type,
                  source,
                  observed_at,

                  reference_type,
                  reference_id,

                  summary,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                er.id,

                $5,
                $6,
                $7,

                $8,
                $9,

                $10::jsonb,

                FALSE

              FROM
                reliability.experiment_runs er

              WHERE
                er.public_id =
                  $4

              RETURNING *
            `,
            [
              input.publicId ||
              generateId(
                "obs"
              ),

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.experimentRunId,

              input.observationType,

              input.source,

              input.observedAt ||
              new Date(),

              input.referenceType ||
              null,

              input.referenceId ||
              null,

              JSON.stringify(
                input.summary ||
                {}
              ),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw repositoryError(
            "RELIABILITY_EXPERIMENT_RUN_NOT_FOUND",
            "Experiment run was not found"
          );
        }


        return {
          ...result.rows[0],

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }


  async upsertAssertionResult(
    input,
    transaction =
      null
  ) {
    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                reliability.assertion_results (
                  public_id,

                  organization_id,
                  environment_id,

                  experiment_run_id,

                  assertion_key,
                  status,

                  expected,
                  actual,

                  reason_code,
                  details,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                er.id,

                $5,
                $6,

                $7::jsonb,
                $8::jsonb,

                $9,
                $10::jsonb,

                FALSE

              FROM
                reliability.experiment_runs er

              WHERE
                er.public_id =
                  $4

              ON CONFLICT (
                experiment_run_id,
                assertion_key
              )

              DO UPDATE SET
                status =
                  EXCLUDED.status,

                expected =
                  EXCLUDED.expected,

                actual =
                  EXCLUDED.actual,

                reason_code =
                  EXCLUDED.reason_code,

                details =
                  EXCLUDED.details,

                evaluated_at =
                  NOW()

              RETURNING *
            `,
            [
              input.publicId ||
              generateId(
                "assert"
              ),

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.experimentRunId,

              input.assertionKey,

              input.status,

              JSON.stringify(
                input.expected ??
                null
              ),

              JSON.stringify(
                input.actual ??
                null
              ),

              input.reasonCode ||
              null,

              JSON.stringify(
                input.details ||
                {}
              ),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw repositoryError(
            "RELIABILITY_EXPERIMENT_RUN_NOT_FOUND",
            "Experiment run was not found"
          );
        }


        return {
          ...result.rows[0],

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }


  async upsertMetric(
    input,
    transaction =
      null
  ) {
    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                reliability.metrics (
                  public_id,

                  organization_id,
                  environment_id,

                  experiment_run_id,

                  metric_key,
                  value,
                  unit,

                  metadata,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                er.id,

                $5,
                $6,
                $7,

                $8::jsonb,

                FALSE

              FROM
                reliability.experiment_runs er

              WHERE
                er.public_id =
                  $4

              ON CONFLICT (
                experiment_run_id,
                metric_key
              )

              DO UPDATE SET
                value =
                  EXCLUDED.value,

                unit =
                  EXCLUDED.unit,

                metadata =
                  EXCLUDED.metadata,

                measured_at =
                  NOW()

              RETURNING *
            `,
            [
              input.publicId ||
              generateId(
                "metric"
              ),

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.experimentRunId,

              input.metricKey,

              Number(
                input.value
              ),

              input.unit ||
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
          throw repositoryError(
            "RELIABILITY_EXPERIMENT_RUN_NOT_FOUND",
            "Experiment run was not found"
          );
        }


        return {
          ...result.rows[0],

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }


  async _insertRunEvidence(
    table,
    input,
    transaction
  ) {
    if (
      table !==
      "failure_injections"
    ) {
      throw repositoryError(
        "RELIABILITY_EVIDENCE_TABLE_INVALID",
        "Unsupported reliability evidence table"
      );
    }


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                reliability.failure_injections (
                  public_id,

                  organization_id,
                  environment_id,

                  experiment_run_id,

                  failure_domain,
                  failure_type,

                  target_resource_id,
                  target_resource_public_id,
                  target_resource_type,

                  injector_key,
                  injector_version,

                  state,

                  injection_parameters,
                  provenance,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                er.id,

                $5,
                $6,

                $7,
                $8,
                $9,

                $10,
                $11,

                $12,

                $13::jsonb,
                $14::jsonb,

                FALSE

              FROM
                reliability.experiment_runs er

              WHERE
                er.public_id =
                  $4

              RETURNING *
            `,
            [
              input.publicId ||
              generateId(
                "inject"
              ),

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.experimentRunId,

              input.failureDomain,

              input.failureType,

              input.targetResourceId ||
              null,

              input.targetResourcePublicId ||
              null,

              input.targetResourceType,

              input.injectorKey,

              input.injectorVersion ||
              null,

              input.state ||
              "REQUESTED",

              JSON.stringify(
                input.injectionParameters ||
                {}
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
          throw repositoryError(
            "RELIABILITY_EXPERIMENT_RUN_NOT_FOUND",
            "Experiment run was not found"
          );
        }


        return {
          ...result.rows[0],

          executionAuthorized:
            false,
        };
      },

      transaction
    );
  }
}


/*
 * ============================================================================
 * MAPPERS
 * ============================================================================
 */


function mapLabEnvironment(
  row
) {
  return {
    id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    name:
      row.name,

    kind:
      row.kind,

    status:
      row.status,

    safetyClass:
      row.safety_class,

    production:
      row.production,

    infrastructureRef:
      row.infrastructure_ref,

    namespace:
      row.namespace,

    labels:
      row.labels ||
      {},

    configuration:
      row.configuration ||
      {},

    baseline:
      row.baseline ||
      {},

    dirtyReason:
      row.dirty_reason,

    lastBaselinedAt:
      row.last_baselined_at,

    lastResetAt:
      row.last_reset_at,

    lastHealthCheckAt:
      row.last_health_check_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    executionAuthorized:
      false,
  };
}


function mapExperimentDefinition(
  row
) {
  return {
    id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    experimentKey:
      row.experiment_key,

    version:
      Number(
        row.version
      ),

    name:
      row.name,

    description:
      row.description,

    failureDomain:
      row.failure_domain,

    failureType:
      row.failure_type,

    targetResourceType:
      row.target_resource_type,

    groundTruth:
      row.ground_truth,

    assertions:
      row.assertions ||
      [],

    configuration:
      row.configuration ||
      {},

    enabled:
      row.enabled,

    createdAt:
      row.created_at,

    executionAuthorized:
      false,
  };
}


function mapExperimentRun(
  row
) {
  return {
    id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    labEnvironmentId:
      row.lab_environment_id,

    experimentDefinitionId:
      row.experiment_definition_id,

    experimentKey:
      row.experiment_key,

    experimentVersion:
      Number(
        row.experiment_version
      ),

    correlationId:
      row.correlation_id,

    status:
      row.status,

    outcome:
      row.outcome,

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,

    baselineSnapshot:
      row.baseline_snapshot ||
      {},

    finalSnapshot:
      row.final_snapshot ||
      {},

    failureSummary:
      row.failure_summary ||
      {},

    recoverySummary:
      row.recovery_summary ||
      {},

    verificationSummary:
      row.verification_summary ||
      {},

    resetSummary:
      row.reset_summary ||
      {},

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


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */


function scopeOf(
  input
) {
  requireScope(
    input
  );


  return {
    organizationId:
      input.organizationId,

    environmentId:
      input.environmentId,
  };
}


function requireScope(
  input
) {
  if (
    !input
      ?.organizationId ||
    !input
      ?.environmentId
  ) {
    throw repositoryError(
      "RELIABILITY_SCOPE_REQUIRED",
      "organizationId and environmentId are required"
    );
  }
}


function generateId(
  prefix
) {
  return `${prefix}_${crypto.randomUUID()}`;
}


function repositoryError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "PostgresReliabilityLabRepositoryError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  PostgresReliabilityLabRepository;