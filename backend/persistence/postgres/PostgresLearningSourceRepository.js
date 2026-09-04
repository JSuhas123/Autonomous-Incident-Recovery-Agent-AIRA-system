"use strict";


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


const {
  assertNoExecutionAuthority,

  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
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


function mapSourceBundle(
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

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    incidentDatabaseId:
      row.incident_id,

    interventionSessionDatabaseId:
      row.intervention_session_id,

    bundleVersion:
      Number(
        row.bundle_version
      ),

    observationPayload:
      row.observation_payload ||
      [],

    assertionPayload:
      row.assertion_payload ||
      [],

    diagnosisPayload:
      row.diagnosis_payload ||
      [],

    actionPayload:
      row.action_payload ||
      [],

    verificationPayload:
      row.verification_payload ||
      [],

    outcomePayload:
      row.outcome_payload ||
      [],

    provenance:
      row.provenance ||
      {},

    sourceDigest:
      row.source_digest,

    frozenAt:
      row.frozen_at,

    createdAt:
      row.created_at,

    executionAuthorized:
      false,
  };
}


class PostgresLearningSourceRepository {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||
      new PostgresTenantScope(
        options
      );
  }


  async getSourceBundle(
    input = {}
  ) {
    assertNoExecutionAuthority(
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


    const sourceBundleId =
      requireString(
        input.sourceBundleId,
        "sourceBundleId"
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
                  learning.source_bundles

                WHERE
                  public_id =
                    $1

                  OR

                  id::text =
                    $1

                LIMIT 1
              `,
              [
                sourceBundleId,
              ]
            );


          return mapSourceBundle(
            result.rows[0]
          );
        }
      );
  }
}


module.exports = {
  PostgresLearningSourceRepository,

  mapSourceBundle,
};