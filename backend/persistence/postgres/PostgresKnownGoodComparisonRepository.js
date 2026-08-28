"use strict";

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


/*
 * ============================================================================
 * POSTGRES KNOWN-GOOD COMPARISON REPOSITORY
 * ============================================================================
 *
 * Phase 17.11
 *
 * Read-only evidence access for comparing:
 *
 *   evidence-backed Known-Good ResourceState
 *
 * against
 *
 *   ResourceState observed at time T
 *
 * We query PostgreSQL directly instead of coupling this service to the
 * individual Phase 17.4 / 17.5 repository method signatures.
 *
 * PostgreSQL remains authoritative.
 *
 * No INSERT / UPDATE / DELETE.
 * No execution authorization.
 * ============================================================================
 */

class PostgresKnownGoodComparisonRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  async getComparisonStatesAtTime(
    {
      organizationId,
      environmentId,
      resourceId,
      at,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });

    requireResourceId(
      resourceId
    );


    const timestamp =
      requireTimestamp(
        at
      );


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        /*
         * ---------------------------------------------------------------
         * KNOWN-GOOD VALID AT T
         * ---------------------------------------------------------------
         *
         * IMPORTANT:
         *
         * Do NOT filter status = ACTIVE here.
         *
         * A row that is SUPERSEDED now may still have been the valid
         * known-good baseline historically at time T.
         */
        const knownGoodResult =
          await client.query(
            `
              SELECT
                kgs.id
                  AS known_good_id,

                kgs.public_id
                  AS known_good_public_id,

                kgs.resource_id
                  AS known_good_resource_id,

                kgs.resource_state_id
                  AS known_good_resource_state_id,

                kgs.valid_from
                  AS known_good_valid_from,

                kgs.valid_until
                  AS known_good_valid_until,

                kgs.confidence
                  AS known_good_confidence,

                kgs.evidence_count
                  AS known_good_evidence_count,

                kgs.health_evidence
                  AS known_good_health_evidence,

                kgs.reason
                  AS known_good_reason,

                kgs.source
                  AS known_good_source,

                kgs.approved_by_human
                  AS known_good_approved_by_human,

                kgs.status
                  AS known_good_status,

                kgs.metadata
                  AS known_good_metadata,

                rs.id
                  AS state_id,

                rs.public_id
                  AS state_public_id,

                rs.resource_id
                  AS state_resource_id,

                rs.observed_at
                  AS state_observed_at,

                rs.health
                  AS state_health,

                rs.lifecycle
                  AS state_lifecycle,

                rs.configuration
                  AS state_configuration,

                rs.runtime
                  AS state_runtime,

                rs.metrics
                  AS state_metrics,

                rs.attributes
                  AS state_attributes,

                rs.version
                  AS state_version,

                rs.fingerprint
                  AS state_fingerprint,

                rs.source
                  AS state_source,

                rs.evidence
                  AS state_evidence,

                rs.metadata
                  AS state_metadata,

                rs.created_at
                  AS state_created_at

              FROM resources.known_good_states kgs

              JOIN resources.resource_states rs
                ON rs.id =
                   kgs.resource_state_id

              WHERE
                kgs.organization_id = $1
                AND kgs.environment_id = $2
                AND kgs.resource_id = $3

                AND kgs.valid_from <= $4

                AND (
                  kgs.valid_until IS NULL
                  OR kgs.valid_until > $4
                )

              ORDER BY
                kgs.valid_from DESC,
                kgs.created_at DESC,
                kgs.id DESC

              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              resourceId,

              timestamp,
            ]
          );


        /*
         * ---------------------------------------------------------------
         * RESOURCE STATE AT T
         * ---------------------------------------------------------------
         */

        const observedResult =
          await client.query(
            `
              SELECT *
              FROM resources.resource_states
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND resource_id = $3
                AND observed_at <= $4
              ORDER BY
                observed_at DESC,
                created_at DESC,
                id DESC
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              resourceId,

              timestamp,
            ]
          );


        const knownGoodRow =
          knownGoodResult.rows[0] ||
          null;


        return {
          knownGood:
            exposeKnownGood(
              knownGoodRow,
              resolved
            ),

          knownGoodState:
            exposeJoinedState(
              knownGoodRow,
              resolved
            ),

          observedState:
            exposeState(
              observedResult.rows[0] ||
              null,
              resolved
            ),

          comparedAt:
            timestamp,
        };
      },

      transaction
    );
  }
}


function exposeKnownGood(
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
      row.known_good_id,

    publicId:
      row.known_good_public_id,

    organizationId:
      resolved
        ?.applicationOrganizationId,

    environmentId:
      resolved
        ?.applicationEnvironmentId,

    resourceId:
      row.known_good_resource_id,

    resourceStateId:
      row.known_good_resource_state_id,

    validFrom:
      row.known_good_valid_from,

    validUntil:
      row.known_good_valid_until ||
      null,

    confidence:
      Number(
        row.known_good_confidence
      ),

    evidenceCount:
      row.known_good_evidence_count,

    healthEvidence:
      row.known_good_health_evidence ||
      {},

    reason:
      row.known_good_reason,

    source:
      row.known_good_source,

    approvedByHuman:
      Boolean(
        row.known_good_approved_by_human
      ),

    status:
      row.known_good_status,

    metadata:
      row.known_good_metadata ||
      {},
  };
}


function exposeJoinedState(
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
      row.state_id,

    publicId:
      row.state_public_id,

    organizationId:
      resolved
        ?.applicationOrganizationId,

    environmentId:
      resolved
        ?.applicationEnvironmentId,

    resourceId:
      row.state_resource_id,

    observedAt:
      row.state_observed_at,

    health:
      row.state_health,

    lifecycle:
      row.state_lifecycle,

    configuration:
      row.state_configuration ||
      {},

    runtime:
      row.state_runtime ||
      {},

    metrics:
      row.state_metrics ||
      {},

    attributes:
      row.state_attributes ||
      {},

    version:
      row.state_version ||
      null,

    fingerprint:
      row.state_fingerprint,

    source:
      row.state_source,

    evidence:
      row.state_evidence ||
      {},

    metadata:
      row.state_metadata ||
      {},

    createdAt:
      row.state_created_at,
  };
}


function exposeState(
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

    resourceId:
      row.resource_id,

    observedAt:
      row.observed_at,

    health:
      row.health,

    lifecycle:
      row.lifecycle,

    configuration:
      row.configuration ||
      {},

    runtime:
      row.runtime ||
      {},

    metrics:
      row.metrics ||
      {},

    attributes:
      row.attributes ||
      {},

    version:
      row.version ||
      null,

    fingerprint:
      row.fingerprint,

    source:
      row.source,

    evidence:
      row.evidence ||
      {},

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at,
  };
}


function requireScope(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw comparisonError(
      "Known-good comparison requires organizationId and environmentId",
      "KNOWN_GOOD_COMPARISON_SCOPE_REQUIRED"
    );
  }
}


function requireResourceId(
  value
) {
  if (
    !value
  ) {
    throw comparisonError(
      "Known-good comparison requires resourceId",
      "KNOWN_GOOD_COMPARISON_RESOURCE_ID_REQUIRED"
    );
  }
}


function requireTimestamp(
  value
) {
  const timestamp =
    value instanceof Date
      ? value
      : new Date(
          value
        );


  if (
    Number.isNaN(
      timestamp.getTime()
    )
  ) {
    throw comparisonError(
      "Known-good comparison timestamp is invalid",
      "KNOWN_GOOD_COMPARISON_TIMESTAMP_INVALID"
    );
  }


  return timestamp;
}


function comparisonError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  PostgresKnownGoodComparisonRepository;