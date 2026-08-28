"use strict";

const crypto = require(
  "node:crypto"
);

const PostgresTenantScope = require(
  "./PostgresTenantScope"
);

const {
  assertValidRelationship,
} = require(
  "../../contracts/topology/relationshipContract"
);


class PostgresTemporalRelationshipRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  async createRelationship(
  input,
  transaction = null
) {
  requireScope(
    input
  );

  requireHistorySource(
    input.source
  );


  /*
   * evidence is temporal provenance.
   *
   * It does NOT belong to the canonical ResourceRelationship contract.
   *
   * Keep it outside assertValidRelationship() and write it only to:
   *
   *   resources.relationship_history
   *   resources.graph_change_events
   */
  const evidence =
    input.evidence ||
    {};


  const relationship =
    assertValidRelationship({
      publicId:
        input.publicId ||
        generateId(
          "rel"
        ),

      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      sourceResourceId:
        input.sourceResourceId,

      targetResourceId:
        input.targetResourceId,

      relationshipType:
        input.relationshipType,

      attributes:
        input.attributes ||
        {},

      source:
        input.source,

      confidence:
        input.confidence,

      metadata:
        input.metadata ||
        {},

      validFrom:
        input.validFrom ||
        new Date(),

      validTo:
        null,
    });


  return this.scope.run(
    buildScope(
      input
    ),

    async (
      client,
      resolved
    ) => {
      await verifyResource(
        client,
        resolved,
        relationship.sourceResourceId
      );


      await verifyResource(
        client,
        resolved,
        relationship.targetResourceId
      );


      /*
       * Current-edge idempotency.
       */
      const existing =
        await findActiveEdge(
          client,
          resolved,
          relationship
        );


      if (
        existing
      ) {
        return exposeRelationship(
          existing,
          resolved
        );
      }


      /*
       * Persist canonical current relationship.
       */
      const result =
        await client.query(
          `
            INSERT INTO resources.resource_relationships (
              public_id,
              organization_id,
              environment_id,
              source_resource_id,
              target_resource_id,
              relationship_type,
              source,
              confidence,
              metadata,
              valid_from,
              valid_to,
              discovered_at,
              attributes,
              status,
              last_seen_at
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
              $9::jsonb,
              $10,
              NULL,
              NOW(),
              $11::jsonb,
              'ACTIVE',
              NOW()
            )
            RETURNING *
          `,
          [
            relationship.publicId,

            resolved.organizationUuid,

            resolved.environmentUuid,

            relationship.sourceResourceId,

            relationship.targetResourceId,

            relationship.relationshipType,

            relationship.source,

            relationship.confidence,

            JSON.stringify(
              relationship.metadata ||
              {}
            ),

            relationship.validFrom,

            JSON.stringify(
              relationship.attributes ||
              {}
            ),
          ]
        );


      const created =
        result.rows[0];


      /*
       * Append immutable relationship-history evidence.
       */
      await appendHistory(
        client,
        resolved,
        created,
        {
          changeType:
            "CREATED",

          changedAt:
            relationship.validFrom,

          attributesBefore:
            {},

          attributesAfter:
            created.attributes ||
            {},

          source:
            relationship.source,

          evidence,

          metadata:
            relationship.metadata ||
            {},
        }
      );


      /*
       * Append generic graph-change evidence.
       *
       * This is evidence only.
       * It never authorizes execution.
       */
      await appendGraphEvent(
        client,
        resolved,
        created,
        {
          changeType:
            "RELATIONSHIP_CREATED",

          changedAt:
            relationship.validFrom,

          beforeState:
            {},

          afterState:
            snapshotRelationship(
              created
            ),

          source:
            relationship.source,

          evidence,

          metadata:
            relationship.metadata ||
            {},
        }
      );


      return exposeRelationship(
        created,
        resolved
      );
    },

    transaction
  );
}


  async updateRelationship(
    input,
    transaction = null
  ) {
    requireScope(
      input
    );

    requireRelationshipId(
      input.relationshipId
    );

    requireHistorySource(
      input.source
    );


    return this.scope.run(
      buildScope(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const current =
          await lockRelationship(
            client,
            resolved,
            input.relationshipId
          );


        if (
          !current
        ) {
          return null;
        }


        if (
          current.status !==
            "ACTIVE" ||
          current.valid_to !==
            null
        ) {
          throw repositoryError(
            "Only an ACTIVE relationship may be updated",
            "RELATIONSHIP_NOT_ACTIVE"
          );
        }


        const before =
          snapshotRelationship(
            current
          );


        const attributes =
          input.attributes ===
            undefined
            ? current.attributes ||
              {}
            : input.attributes;


        const confidence =
          input.confidence ===
            undefined
            ? current.confidence
            : input.confidence;


        const metadata =
          input.metadata ===
            undefined
            ? current.metadata ||
              {}
            : input.metadata;


        const changedAt =
          validTimestamp(
            input.changedAt ||
            new Date()
          );


        const result =
          await client.query(
            `
              UPDATE resources.resource_relationships
              SET
                attributes = $4::jsonb,
                confidence = $5,
                source = $6,
                metadata = $7::jsonb,
                last_seen_at = $8
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3
              RETURNING *
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              input.relationshipId,

              JSON.stringify(
                attributes
              ),

              confidence,

              input.source,

              JSON.stringify(
                metadata
              ),

              changedAt,
            ]
          );


        const updated =
          result.rows[0];


        await appendHistory(
          client,
          resolved,
          updated,
          {
            changeType:
              "UPDATED",

            changedAt,

            attributesBefore:
              current.attributes ||
              {},

            attributesAfter:
              updated.attributes ||
              {},

            source:
              input.source,

            evidence:
              input.evidence ||
              {},

            metadata,
          }
        );


        await appendGraphEvent(
          client,
          resolved,
          updated,
          {
            changeType:
              "RELATIONSHIP_UPDATED",

            changedAt,

            beforeState:
              before,

            afterState:
              snapshotRelationship(
                updated
              ),

            source:
              input.source,

            evidence:
              input.evidence ||
              {},

            metadata,
          }
        );


        return exposeRelationship(
          updated,
          resolved
        );
      },

      transaction
    );
  }


  async removeRelationship(
    input,
    transaction = null
  ) {
    requireScope(
      input
    );

    requireRelationshipId(
      input.relationshipId
    );

    requireHistorySource(
      input.source
    );


    const changedAt =
      validTimestamp(
        input.changedAt ||
        new Date()
      );


    return this.scope.run(
      buildScope(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const current =
          await lockRelationship(
            client,
            resolved,
            input.relationshipId
          );


        if (
          !current
        ) {
          return null;
        }


        if (
          current.status !==
            "ACTIVE"
        ) {
          return exposeRelationship(
            current,
            resolved
          );
        }


        if (
          changedAt <=
          new Date(
            current.valid_from
          )
        ) {
          throw repositoryError(
            "Removal time must be later than relationship validFrom",
            "RELATIONSHIP_REMOVAL_TIME_INVALID"
          );
        }


        const before =
          snapshotRelationship(
            current
          );


        const result =
          await client.query(
            `
              UPDATE resources.resource_relationships
              SET
                status = 'INACTIVE',
                valid_to = $4,
                last_seen_at = $4
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3
              RETURNING *
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              input.relationshipId,

              changedAt,
            ]
          );


        const removed =
          result.rows[0];


        await appendHistory(
          client,
          resolved,
          removed,
          {
            changeType:
              "REMOVED",

            changedAt:
              new Date(
                current.valid_from
              ),

            validTo:
              changedAt,

            attributesBefore:
              current.attributes ||
              {},

            attributesAfter:
              {},

            source:
              input.source,

            evidence:
              input.evidence ||
              {},

            metadata:
              input.metadata ||
              {},
          }
        );


        await appendGraphEvent(
          client,
          resolved,
          removed,
          {
            changeType:
              "RELATIONSHIP_REMOVED",

            changedAt,

            beforeState:
              before,

            afterState:
              snapshotRelationship(
                removed
              ),

            source:
              input.source,

            evidence:
              input.evidence ||
              {},

            metadata:
              input.metadata ||
              {},
          }
        );


        return exposeRelationship(
          removed,
          resolved
        );
      },

      transaction
    );
  }


  async reactivateRelationship(
    input,
    transaction = null
  ) {
    requireScope(
      input
    );

    requireRelationshipId(
      input.relationshipId
    );

    requireHistorySource(
      input.source
    );


    const changedAt =
      validTimestamp(
        input.changedAt ||
        new Date()
      );


    return this.scope.run(
      buildScope(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const current =
          await lockRelationship(
            client,
            resolved,
            input.relationshipId
          );


        if (
          !current
        ) {
          return null;
        }


        if (
          current.status ===
            "ACTIVE" &&
          current.valid_to ===
            null
        ) {
          return exposeRelationship(
            current,
            resolved
          );
        }


        const before =
          snapshotRelationship(
            current
          );


        const attributes =
          input.attributes ||
          current.attributes ||
          {};


        const result =
          await client.query(
            `
              UPDATE resources.resource_relationships
              SET
                status = 'ACTIVE',
                valid_from = $4,
                valid_to = NULL,
                attributes = $5::jsonb,
                source = $6,
                confidence = COALESCE(
                  $7,
                  confidence
                ),
                last_seen_at = $4
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3
              RETURNING *
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              input.relationshipId,

              changedAt,

              JSON.stringify(
                attributes
              ),

              input.source,

              input.confidence ??
              null,
            ]
          );


        const reactivated =
          result.rows[0];


        await appendHistory(
          client,
          resolved,
          reactivated,
          {
            changeType:
              "REACTIVATED",

            changedAt,

            attributesBefore:
              current.attributes ||
              {},

            attributesAfter:
              reactivated.attributes ||
              {},

            source:
              input.source,

            evidence:
              input.evidence ||
              {},

            metadata:
              input.metadata ||
              {},
          }
        );


        await appendGraphEvent(
          client,
          resolved,
          reactivated,
          {
            changeType:
              "RELATIONSHIP_REACTIVATED",

            changedAt,

            beforeState:
              before,

            afterState:
              snapshotRelationship(
                reactivated
              ),

            source:
              input.source,

            evidence:
              input.evidence ||
              {},

            metadata:
              input.metadata ||
              {},
          }
        );


        return exposeRelationship(
          reactivated,
          resolved
        );
      },

      transaction
    );
  }


  async listRelationshipHistory(
    {
      organizationId,
      environmentId,
      relationshipId,
      limit = 100,
      offset = 0,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });

    requireRelationshipId(
      relationshipId
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
              FROM resources.relationship_history
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND relationship_id = $3
              ORDER BY
                created_at ASC,
                id ASC
              LIMIT $4
              OFFSET $5
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              relationshipId,

              normalizeLimit(
                limit
              ),

              normalizeOffset(
                offset
              ),
            ]
          );


        return result.rows.map(
          exposeHistory
        );
      },

      transaction
    );
  }
}


async function verifyResource(
  client,
  resolved,
  resourceId
) {
  const result =
    await client.query(
      `
        SELECT id
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


  if (
    !result.rows[0]
  ) {
    throw repositoryError(
      "Relationship endpoint Resource not found",
      "RELATIONSHIP_RESOURCE_NOT_FOUND"
    );
  }
}


async function findActiveEdge(
  client,
  resolved,
  relationship
) {
  const result =
    await client.query(
      `
        SELECT *
        FROM resources.resource_relationships
        WHERE
          organization_id = $1
          AND environment_id = $2
          AND source_resource_id = $3
          AND target_resource_id = $4
          AND relationship_type = $5
          AND status = 'ACTIVE'
          AND valid_to IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [
        resolved.organizationUuid,
        resolved.environmentUuid,
        relationship.sourceResourceId,
        relationship.targetResourceId,
        relationship.relationshipType,
      ]
    );


  return (
    result.rows[0] ||
    null
  );
}


async function lockRelationship(
  client,
  resolved,
  relationshipId
) {
  const result =
    await client.query(
      `
        SELECT *
        FROM resources.resource_relationships
        WHERE
          organization_id = $1
          AND environment_id = $2
          AND id = $3
        LIMIT 1
        FOR UPDATE
      `,
      [
        resolved.organizationUuid,
        resolved.environmentUuid,
        relationshipId,
      ]
    );


  return (
    result.rows[0] ||
    null
  );
}


async function appendHistory(
  client,
  resolved,
  relationship,
  input
) {
  await client.query(
    `
      INSERT INTO resources.relationship_history (
        public_id,
        organization_id,
        environment_id,
        relationship_id,
        source_resource_id,
        target_resource_id,
        relationship_type,
        valid_from,
        valid_to,
        change_type,
        attributes_before,
        attributes_after,
        source,
        evidence,
        metadata
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
        $13,
        $14::jsonb,
        $15::jsonb
      )
    `,
    [
      generateId(
        "relhist"
      ),

      resolved.organizationUuid,

      resolved.environmentUuid,

      relationship.id,

      relationship.source_resource_id,

      relationship.target_resource_id,

      relationship.relationship_type,

      input.changedAt,

      input.validTo ||
      null,

      input.changeType,

      JSON.stringify(
        input.attributesBefore ||
        {}
      ),

      JSON.stringify(
        input.attributesAfter ||
        {}
      ),

      input.source,

      JSON.stringify(
        input.evidence ||
        {}
      ),

      JSON.stringify(
        input.metadata ||
        {}
      ),
    ]
  );
}


async function appendGraphEvent(
  client,
  resolved,
  relationship,
  input
) {
  await client.query(
    `
      INSERT INTO resources.graph_change_events (
        public_id,
        organization_id,
        environment_id,
        resource_id,
        relationship_id,
        change_type,
        changed_at,
        before_state,
        after_state,
        source,
        evidence,
        metadata
      )
      VALUES (
        $1,
        $2,
        $3,
        NULL,
        $4,
        $5,
        $6,
        $7::jsonb,
        $8::jsonb,
        $9,
        $10::jsonb,
        $11::jsonb
      )
    `,
    [
      generateId(
        "gchange"
      ),

      resolved.organizationUuid,

      resolved.environmentUuid,

      relationship.id,

      input.changeType,

      input.changedAt,

      JSON.stringify(
        input.beforeState ||
        {}
      ),

      JSON.stringify(
        input.afterState ||
        {}
      ),

      input.source,

      JSON.stringify(
        input.evidence ||
        {}
      ),

      JSON.stringify(
        input.metadata ||
        {}
      ),
    ]
  );
}


function snapshotRelationship(
  row
) {
  return {
    relationshipId:
      row.id,

    sourceResourceId:
      row.source_resource_id,

    targetResourceId:
      row.target_resource_id,

    relationshipType:
      row.relationship_type,

    attributes:
      row.attributes ||
      {},

    confidence:
      row.confidence ===
        undefined ||
      row.confidence ===
        null
        ? null
        : Number(
            row.confidence
          ),

    status:
      row.status,

    validFrom:
      row.valid_from,

    validTo:
      row.valid_to ||
      null,
  };
}


function exposeRelationship(
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

    sourceResourceId:
      row.source_resource_id,

    targetResourceId:
      row.target_resource_id,

    relationshipType:
      row.relationship_type,

    attributes:
      row.attributes ||
      {},

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

    validFrom:
      row.valid_from,

    validTo:
      row.valid_to ||
      null,

    status:
      row.status,

    metadata:
      row.metadata ||
      {},

    discoveredAt:
      row.discovered_at ||
      null,

    lastSeenAt:
      row.last_seen_at ||
      null,

    createdAt:
      row.created_at ||
      null,
  };
}


function exposeHistory(
  row
) {
  return {
    id:
      row.id,

    publicId:
      row.public_id,

    relationshipId:
      row.relationship_id,

    sourceResourceId:
      row.source_resource_id,

    targetResourceId:
      row.target_resource_id,

    relationshipType:
      row.relationship_type,

    validFrom:
      row.valid_from,

    validTo:
      row.valid_to ||
      null,

    changeType:
      row.change_type,

    attributesBefore:
      row.attributes_before ||
      {},

    attributesAfter:
      row.attributes_after ||
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


function requireScope(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw repositoryError(
      "Temporal relationship scope is required",
      "POSTGRES_TEMPORAL_RELATIONSHIP_SCOPE_REQUIRED"
    );
  }
}


function requireRelationshipId(
  value
) {
  if (
    !value
  ) {
    throw repositoryError(
      "relationshipId is required",
      "POSTGRES_TEMPORAL_RELATIONSHIP_ID_REQUIRED"
    );
  }
}


function requireHistorySource(
  value
) {
  if (
    !value ||
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw repositoryError(
      "Temporal relationship changes require a source",
      "RELATIONSHIP_HISTORY_SOURCE_REQUIRED"
    );
  }
}


function validTimestamp(
  value
) {
  const result =
    value instanceof Date
      ? value
      : new Date(
          value
        );


  if (
    Number.isNaN(
      result.getTime()
    )
  ) {
    throw repositoryError(
      "Invalid relationship change timestamp",
      "RELATIONSHIP_CHANGE_TIMESTAMP_INVALID"
    );
  }


  return result;
}


function buildScope(
  input
) {
  return {
    organizationId:
      input.organizationId,

    environmentId:
      input.environmentId,
  };
}


function generateId(
  prefix
) {
  return (
    `${prefix}_` +
    crypto.randomUUID()
  );
}


function normalizeLimit(
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
    ? Math.min(
        Math.max(
          parsed,
          1
        ),
        1000
      )
    : 100;
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
    }
  );
}


module.exports =
  PostgresTemporalRelationshipRepository;