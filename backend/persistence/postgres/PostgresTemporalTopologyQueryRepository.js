"use strict";

const PostgresTenantScope = require(
  "./PostgresTenantScope"
);


/*
 * ============================================================================
 * POSTGRES TEMPORAL TOPOLOGY QUERY REPOSITORY
 * ============================================================================
 *
 * Phase 17.9
 *
 * Read-only temporal topology access.
 *
 * Authorities:
 *
 *   resources.resource_states
 *       -> immutable resource state observations
 *
 *   resources.graph_change_events
 *       -> relationship transition timeline
 *
 *   resources.relationship_history
 *       -> immutable relationship audit history
 *
 *   resources.resource_relationships
 *       -> stable relationship identity/endpoints
 *
 * The repository performs NO:
 *
 *   INSERT
 *   UPDATE
 *   DELETE
 *   authorization
 *   execution
 *
 * Historical topology is evidence only.
 * ============================================================================
 */

class PostgresTemporalTopologyQueryRepository {
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
   * RESOURCE STATE AT TIME
   *
   * Greatest observation <= requested timestamp.
   * ==========================================================================
   */

  async getResourceStateAtTime(
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
        const result =
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


        return exposeResourceState(
          result.rows[0] ||
          null,
          resolved
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * RELATIONSHIPS AT TIME
   * ==========================================================================
   *
   * Relationship reconstruction rule:
   *
   * 1. Find the most recent graph_change_event for each relationship <= T.
   * 2. Use that event's after_state as relationship truth at T.
   * 3. Only relationships whose reconstructed state is ACTIVE are returned.
   *
   * For legacy relationships with no Phase 17 graph event, fall back to the
   * current relationship's valid_from / valid_to interval.
   *
   * This fallback allows old imported topology to continue working while all
   * newly mutated Phase 17 relationships receive complete event history.
   * ==========================================================================
   */

  async listRelationshipsAtTime(
    {
      organizationId,
      environmentId,
      resourceId,
      at,
      direction = "BOTH",
      relationshipTypes = [],
      limit = 500,
      offset = 0,
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


    const normalizedDirection =
      normalizeDirection(
        direction
      );


    const normalizedTypes =
      normalizeRelationshipTypes(
        relationshipTypes
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
        const values = [
          resolved.organizationUuid,
          resolved.environmentUuid,
          resourceId,
          timestamp,
        ];


        const endpointCondition =
          buildEndpointCondition(
            normalizedDirection
          );


        let typeCondition =
          "";


        if (
          normalizedTypes.length >
          0
        ) {
          values.push(
            normalizedTypes
          );


          typeCondition =
            `
              AND rr.relationship_type =
                  ANY($${values.length}::text[])
            `;
        }


        values.push(
          normalizeLimit(
            limit
          )
        );


        const limitParameter =
          values.length;


        values.push(
          normalizeOffset(
            offset
          )
        );


        const offsetParameter =
          values.length;


        const result =
          await client.query(
            `
              WITH latest_events AS (
                SELECT DISTINCT ON (
                  gce.relationship_id
                )
                  gce.relationship_id,
                  gce.change_type,
                  gce.changed_at,
                  gce.before_state,
                  gce.after_state,
                  gce.source,
                  gce.evidence,
                  gce.metadata,
                  gce.created_at
                FROM resources.graph_change_events gce
                WHERE
                  gce.organization_id = $1
                  AND gce.environment_id = $2
                  AND gce.relationship_id IS NOT NULL
                  AND gce.changed_at <= $4
                ORDER BY
                  gce.relationship_id,
                  gce.changed_at DESC,
                  gce.created_at DESC,
                  gce.id DESC
              )

              SELECT
                rr.*,

                le.change_type
                  AS temporal_change_type,

                le.changed_at
                  AS temporal_changed_at,

                le.before_state
                  AS temporal_before_state,

                le.after_state
                  AS temporal_after_state,

                le.source
                  AS temporal_source,

                le.evidence
                  AS temporal_evidence,

                CASE
                  WHEN le.relationship_id IS NOT NULL
                    THEN 'EVENT_HISTORY'

                  ELSE 'VALIDITY_FALLBACK'
                END
                  AS reconstruction_source

              FROM resources.resource_relationships rr

              LEFT JOIN latest_events le
                ON le.relationship_id = rr.id

              WHERE
                rr.organization_id = $1
                AND rr.environment_id = $2

                AND ${endpointCondition}

                ${typeCondition}

                AND (
                  (
                    le.relationship_id IS NOT NULL

                    AND COALESCE(
                      le.after_state ->> 'status',
                      ''
                    ) = 'ACTIVE'
                  )

                  OR

                  (
                    le.relationship_id IS NULL

                    AND rr.valid_from <= $4

                    AND (
                      rr.valid_to IS NULL
                      OR rr.valid_to > $4
                    )
                  )
                )

              ORDER BY
                rr.relationship_type ASC,
                rr.source_resource_id ASC,
                rr.target_resource_id ASC,
                rr.id ASC

              LIMIT $${limitParameter}
              OFFSET $${offsetParameter}
            `,
            values
          );


        return result.rows.map(
          (row) =>
            exposeTemporalRelationship(
              row,
              resolved,
              timestamp
            )
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * GRAPH CHANGES IN WINDOW
   * ==========================================================================
   *
   * Useful later for:
   *
   *   Phase 17.10 incident reconstruction
   *   Phase 17.12 change correlation
   * ==========================================================================
   */

  async listGraphChanges(
    {
      organizationId,
      environmentId,
      resourceId = null,
      relationshipId = null,
      from,
      to,
      changeTypes = [],
      limit = 500,
      offset = 0,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    const fromTimestamp =
      requireTimestamp(
        from
      );


    const toTimestamp =
      requireTimestamp(
        to
      );


    if (
      fromTimestamp >
      toTimestamp
    ) {
      throw queryError(
        "Temporal graph from timestamp must not be after to timestamp",
        "TEMPORAL_GRAPH_WINDOW_INVALID"
      );
    }


    const normalizedChangeTypes =
      normalizeRelationshipTypes(
        changeTypes
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
        const values = [
          resolved.organizationUuid,
          resolved.environmentUuid,
          fromTimestamp,
          toTimestamp,
        ];


        const conditions = [
          "organization_id = $1",
          "environment_id = $2",
          "changed_at >= $3",
          "changed_at <= $4",
        ];


        if (
          resourceId
        ) {
          values.push(
            resourceId
          );


          conditions.push(
            `resource_id = $${values.length}`
          );
        }


        if (
          relationshipId
        ) {
          values.push(
            relationshipId
          );


          conditions.push(
            `relationship_id = $${values.length}`
          );
        }


        if (
          normalizedChangeTypes.length >
          0
        ) {
          values.push(
            normalizedChangeTypes
          );


          conditions.push(
            `change_type = ANY($${values.length}::text[])`
          );
        }


        values.push(
          normalizeLimit(
            limit
          )
        );


        const limitParameter =
          values.length;


        values.push(
          normalizeOffset(
            offset
          )
        );


        const offsetParameter =
          values.length;


        const result =
          await client.query(
            `
              SELECT *
              FROM resources.graph_change_events
              WHERE
                ${conditions.join(
                  "\nAND "
                )}
              ORDER BY
                changed_at ASC,
                created_at ASC,
                id ASC
              LIMIT $${limitParameter}
              OFFSET $${offsetParameter}
            `,
            values
          );


        return result.rows.map(
          exposeGraphChange
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * RESOURCE IDENTITY
   * ==========================================================================
   */

  async getResource(
    {
      organizationId,
      environmentId,
      resourceId,
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


    return this.scope.run(
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
              SELECT *
              FROM resources.resources
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3
              LIMIT 1
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
              resourceId,
            ]
          );


        return exposeResource(
          result.rows[0] ||
          null,
          resolved
        );
      },

      transaction
    );
  }
}


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function buildEndpointCondition(
  direction
) {
  switch (
    direction
  ) {
    case "OUTGOING":
      return (
        "rr.source_resource_id = $3"
      );

    case "INCOMING":
      return (
        "rr.target_resource_id = $3"
      );

    case "BOTH":
      return (
        "(" +
        "rr.source_resource_id = $3 " +
        "OR rr.target_resource_id = $3" +
        ")"
      );

    default:
      throw queryError(
        "Unsupported temporal topology direction",
        "TEMPORAL_GRAPH_DIRECTION_INVALID"
      );
  }
}


function normalizeDirection(
  value
) {
  const direction =
    String(
      value ||
      "BOTH"
    )
      .trim()
      .toUpperCase();


  if (
    ![
      "OUTGOING",
      "INCOMING",
      "BOTH",
    ].includes(
      direction
    )
  ) {
    throw queryError(
      "direction must be OUTGOING, INCOMING or BOTH",
      "TEMPORAL_GRAPH_DIRECTION_INVALID"
    );
  }


  return direction;
}


function normalizeRelationshipTypes(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return [];
  }


  if (
    !Array.isArray(
      value
    )
  ) {
    throw queryError(
      "relationshipTypes must be an array",
      "TEMPORAL_GRAPH_RELATIONSHIP_TYPES_INVALID"
    );
  }


  return [
    ...new Set(
      value
        .map(
          (item) =>
            String(
              item ||
              ""
            )
              .trim()
              .toUpperCase()
        )
        .filter(
          Boolean
        )
    ),
  ];
}


function exposeResourceState(
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

    canonicalOrganizationId:
      row.organization_id,

    canonicalEnvironmentId:
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


function exposeTemporalRelationship(
  row,
  resolved,
  reconstructedAt
) {
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

    sourceResourceId:
      row.source_resource_id,

    targetResourceId:
      row.target_resource_id,

    relationshipType:
      row.relationship_type,

    source:
      row.source,

    confidence:
      row.confidence ===
        null ||
      row.confidence ===
        undefined
        ? null
        : Number(
            row.confidence
          ),

    attributes:
      extractHistoricalAttributes(
        row
      ),

    metadata:
      row.metadata ||
      {},

    status:
      "ACTIVE",

    validFrom:
      extractHistoricalValidFrom(
        row
      ),

    validTo:
      null,

    reconstructedAt,

    reconstructionSource:
      row.reconstruction_source,

    latestChangeType:
      row.temporal_change_type ||
      null,

    latestChangedAt:
      row.temporal_changed_at ||
      null,

    temporalEvidence:
      row.temporal_evidence ||
      {},
  };
}


function extractHistoricalAttributes(
  row
) {
  if (
    row.reconstruction_source ===
      "EVENT_HISTORY" &&
    row.temporal_after_state &&
    typeof row.temporal_after_state ===
      "object"
  ) {
    return (
      row.temporal_after_state
        .attributes ||
      {}
    );
  }


  return (
    row.attributes ||
    {}
  );
}


function extractHistoricalValidFrom(
  row
) {
  if (
    row.reconstruction_source ===
      "EVENT_HISTORY" &&
    row.temporal_after_state &&
    row.temporal_after_state
      .validFrom
  ) {
    return row.temporal_after_state
      .validFrom;
  }


  return row.valid_from;
}


function exposeGraphChange(
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

    resourceId:
      row.resource_id ||
      null,

    relationshipId:
      row.relationship_id ||
      null,

    changeType:
      row.change_type,

    changedAt:
      row.changed_at,

    beforeState:
      row.before_state ||
      {},

    afterState:
      row.after_state ||
      {},

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


function exposeResource(
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

    provider:
      row.provider,

    resourceType:
      row.resource_type,

    externalId:
      row.external_id,

    name:
      row.name,

    displayName:
      row.display_name,

    namespace:
      row.namespace,

    region:
      row.region,

    zone:
      row.zone,

    serviceId:
      row.service_id,

    labels:
      row.labels ||
      {},

    attributes:
      row.attributes ||
      {},

    metadata:
      row.metadata ||
      {},

    status:
      row.status,

    firstSeenAt:
      row.first_seen_at,

    lastSeenAt:
      row.last_seen_at,
  };
}


function requireScope(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw queryError(
      "Temporal topology queries require organizationId and environmentId",
      "TEMPORAL_GRAPH_SCOPE_REQUIRED"
    );
  }
}


function requireResourceId(
  value
) {
  if (
    !value
  ) {
    throw queryError(
      "Temporal topology query requires resourceId",
      "TEMPORAL_GRAPH_RESOURCE_ID_REQUIRED"
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
    throw queryError(
      "Temporal topology timestamp is invalid",
      "TEMPORAL_GRAPH_TIMESTAMP_INVALID"
    );
  }


  return timestamp;
}


function normalizeLimit(
  value
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 500;
  }


  return Math.min(
    Math.max(
      parsed,
      1
    ),
    2000
  );
}


function normalizeOffset(
  value
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  return Number.isFinite(
    parsed
  )
    ? Math.max(
        parsed,
        0
      )
    : 0;
}


function queryError(
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
  PostgresTemporalTopologyQueryRepository;