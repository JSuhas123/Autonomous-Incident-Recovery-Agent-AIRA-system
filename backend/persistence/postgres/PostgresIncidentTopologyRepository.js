"use strict";

const PostgresTenantScope = require(
  "./PostgresTenantScope"
);


/*
 * ============================================================================
 * POSTGRES INCIDENT TOPOLOGY REPOSITORY
 * ============================================================================
 *
 * Phase 17.10
 *
 * Small read-only bridge between:
 *
 *   incidents.incidents
 *
 * and the Phase 17 temporal Resource Graph.
 *
 * It deliberately does NOT:
 *
 *   - modify incidents
 *   - modify resources
 *   - modify states
 *   - modify relationships
 *   - infer authorization
 *
 * Both canonical PostgreSQL UUID and public incident ID are accepted.
 * ============================================================================
 */

class PostgresIncidentTopologyRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  async getIncident(
    {
      organizationId,
      environmentId,
      incidentId,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !incidentId
    ) {
      throw repositoryError(
        "incidentId is required",
        "INCIDENT_TOPOLOGY_INCIDENT_ID_REQUIRED"
      );
    }


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
         * incidentId may be:
         *
         *   canonical PostgreSQL UUID
         *   public_id
         *   legacy_mongo_id
         *
         * id::text avoids attempting to cast arbitrary public IDs to UUID.
         */
        const result =
          await client.query(
            `
              SELECT
                id,
                public_id,
                legacy_mongo_id,
                organization_id,
                environment_id,
                service_id,
                correlation_id,
                correlation_group_id,
                title,
                description,
                status,
                severity,
                source,
                provider,
                started_at,
                detected_at,
                first_detected_at,
                last_observed_at,
                resolved_at,
                closed_at,
                created_at,
                updated_at,
                metadata
              FROM incidents.incidents
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND (
                  id::text = $3
                  OR public_id = $3
                  OR legacy_mongo_id = $3
                )
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              String(
                incidentId
              ),
            ]
          );


        return exposeIncident(
          result.rows[0] ||
          null,
          resolved
        );
      },

      transaction
    );
  }
}


function exposeIncident(
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

    legacyMongoId:
      row.legacy_mongo_id ||
      null,

    organizationId:
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,

    canonicalOrganizationId:
      row.organization_id,

    canonicalEnvironmentId:
      row.environment_id,

    serviceId:
      row.service_id ||
      null,

    correlationId:
      row.correlation_id ||
      null,

    correlationGroupId:
      row.correlation_group_id ||
      null,

    title:
      row.title ||
      null,

    description:
      row.description ||
      null,

    status:
      row.status,

    severity:
      row.severity,

    source:
      row.source ||
      null,

    provider:
      row.provider ||
      null,

    startedAt:
      row.started_at ||
      null,

    detectedAt:
      row.detected_at ||
      null,

    firstDetectedAt:
      row.first_detected_at ||
      null,

    lastObservedAt:
      row.last_observed_at ||
      null,

    resolvedAt:
      row.resolved_at ||
      null,

    closedAt:
      row.closed_at ||
      null,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    metadata:
      row.metadata ||
      {},
  };
}


function requireScope(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw repositoryError(
      "Incident topology lookup requires organizationId and environmentId",
      "INCIDENT_TOPOLOGY_SCOPE_REQUIRED"
    );
  }
}


function repositoryError(
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
  PostgresIncidentTopologyRepository;