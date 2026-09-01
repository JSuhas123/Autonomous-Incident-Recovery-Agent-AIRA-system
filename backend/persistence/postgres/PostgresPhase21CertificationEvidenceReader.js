"use strict";


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


class PostgresPhase21CertificationEvidenceReader {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  async readExperimentEvidence(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.experimentRunId,
      "experimentRunId"
    );


    return this.scope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async (
        client
      ) => {
        const runResult =
          await client.query(
            `
              SELECT *
              FROM
                reliability.experiment_runs

              WHERE
                public_id = $1

              LIMIT 1
            `,
            [
              input.experimentRunId,
            ]
          );


        const experimentRun =
          runResult.rows[0];


        if (
          !experimentRun
        ) {
          throw readerError(
            "PHASE21_EXPERIMENT_RUN_NOT_FOUND",

            `Phase-21 experiment run ${input.experimentRunId} was not found`
          );
        }


        const runUuid =
          experimentRun.id;


        const [
          failureResult,
          observationResult,
          assertionResult,
          metricResult,
        ] =
          await Promise.all([
            client.query(
              `
                SELECT *
                FROM
                  reliability.failure_injections

                WHERE
                  experiment_run_id = $1

                ORDER BY
                  requested_at ASC,
                  public_id ASC
              `,
              [
                runUuid,
              ]
            ),

            client.query(
              `
                SELECT *
                FROM
                  reliability.observations

                WHERE
                  experiment_run_id = $1

                ORDER BY
                  observed_at ASC,
                  public_id ASC
              `,
              [
                runUuid,
              ]
            ),

            client.query(
              `
                SELECT *
                FROM
                  reliability.assertion_results

                WHERE
                  experiment_run_id = $1

                ORDER BY
                  assertion_key ASC,
                  public_id ASC
              `,
              [
                runUuid,
              ]
            ),

            client.query(
              `
                SELECT *
                FROM
                  reliability.metrics

                WHERE
                  experiment_run_id = $1

                ORDER BY
                  metric_key ASC,
                  public_id ASC
              `,
              [
                runUuid,
              ]
            ),
          ]);


        return Object.freeze({
          source:
            "POSTGRESQL_RELIABILITY_SCHEMA",

          experimentRun,

          failureInjections:
            failureResult.rows,

          observations:
            observationResult.rows,

          assertionResults:
            assertionResult.rows,

          metrics:
            metricResult.rows,

          executionAuthorized:
            false,
        });
      },

      transaction
    );
  }
}


function requireScope(
  input
) {
  if (
    !input?.organizationId ||
    !input?.environmentId
  ) {
    throw readerError(
      "PHASE21_EVIDENCE_SCOPE_REQUIRED",

      "organizationId and environmentId are required"
    );
  }
}


function requireValue(
  value,
  fieldName
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    throw readerError(
      "PHASE21_EVIDENCE_VALUE_REQUIRED",

      `${fieldName} is required`
    );
  }
}


function readerError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "PostgresPhase21CertificationEvidenceReaderError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  PostgresPhase21CertificationEvidenceReader;