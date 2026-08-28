"use strict";

const crypto = require(
  "node:crypto"
);

const PostgresTenantScope = require(
  "./PostgresTenantScope"
);

const {
  assertValidKnownGoodState,
} = require(
  "../../contracts/topology/knownGoodStateContract"
);


class PostgresKnownGoodStateRepository {
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
   * ACTIVATE KNOWN-GOOD BASELINE
   * ==========================================================================
   *
   * Exactly one ACTIVE baseline may exist per resource.
   *
   * If an ACTIVE baseline already points at the same ResourceState,
   * activation is idempotent.
   *
   * Otherwise:
   *
   *   old ACTIVE
   *        ↓
   *   SUPERSEDED
   *
   *   new ResourceState
   *        ↓
   *   ACTIVE
   *
   * All operations execute inside the same PostgresTenantScope transaction.
   * ==========================================================================
   */

  async activateKnownGoodState(
    input,
    transaction = null
  ) {
    requireScope(
      input
    );


    const candidate = {
      ...input,

      publicId:
        input.publicId ||
        generatePublicId(),

      validUntil:
        null,

      supersededBy:
        null,

      status:
        "ACTIVE",
    };


    const knownGood =
      assertValidKnownGoodState(
        candidate
      );


    return this.scope.run(
      buildScope(
        knownGood
      ),

      async (
        client,
        resolved
      ) => {
        /*
         * Verify the immutable ResourceState actually belongs
         * to this Resource and scope.
         */
        const stateResult =
          await client.query(
            `
              SELECT
                rs.id,
                rs.resource_id,
                rs.organization_id,
                rs.environment_id,
                rs.observed_at,
                rs.health,
                rs.lifecycle,
                rs.fingerprint
              FROM resources.resource_states rs
              WHERE
                rs.organization_id = $1
                AND rs.environment_id = $2
                AND rs.resource_id = $3
                AND rs.id = $4
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              knownGood.resourceId,

              knownGood.resourceStateId,
            ]
          );


        if (
          stateResult.rows.length ===
          0
        ) {
          throw createRepositoryError(
            "Known-good ResourceState was not found for the requested resource and scope",
            "KNOWN_GOOD_RESOURCE_STATE_NOT_FOUND"
          );
        }


        /*
         * Lock current ACTIVE baseline.
         */
        const activeResult =
          await client.query(
            `
              SELECT *
              FROM resources.known_good_states
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND resource_id = $3
                AND status = 'ACTIVE'
              ORDER BY
                valid_from DESC,
                created_at DESC
              LIMIT 1
              FOR UPDATE
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              knownGood.resourceId,
            ]
          );


        const currentActive =
          activeResult.rows[0] ||
          null;


        /*
         * Idempotency:
         *
         * attempting to promote the already-active ResourceState
         * simply returns the existing designation.
         */
        if (
          currentActive &&
          currentActive
            .resource_state_id ===
            knownGood.resourceStateId
        ) {
          return exposeKnownGood(
            currentActive,
            resolved
          );
        }


        /*
         * A replacement baseline must start after the baseline
         * it supersedes.
         */
        if (
          currentActive &&
          new Date(
            knownGood.validFrom
          ).getTime() <=
            new Date(
              currentActive.valid_from
            ).getTime()
        ) {
          throw createRepositoryError(
            "Replacement known-good validFrom must be after the active baseline validFrom",
            "KNOWN_GOOD_VALID_FROM_NOT_AFTER_ACTIVE"
          );
        }


        /*
         * Temporarily close the old ACTIVE row.
         *
         * We intentionally do this before INSERT because 0065 has
         * a partial unique index allowing only one ACTIVE row.
         *
         * If anything later fails, the transaction rolls back.
         */
        let previousId =
          null;


        if (
          currentActive
        ) {
          previousId =
            currentActive.id;


          await client.query(
            `
              UPDATE resources.known_good_states
              SET
                status = 'SUPERSEDED',
                valid_until = $4
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3
                AND status = 'ACTIVE'
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              currentActive.id,

              knownGood.validFrom,
            ]
          );
        }


        /*
         * Create new ACTIVE designation.
         */
        const insertResult =
          await client.query(
            `
              INSERT INTO resources.known_good_states (
                public_id,
                organization_id,
                environment_id,
                resource_id,
                resource_state_id,
                valid_from,
                valid_until,
                confidence,
                evidence_count,
                health_evidence,
                reason,
                source,
                approved_by_human,
                superseded_by,
                status,
                metadata
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                NULL,
                $7,
                $8,
                $9::jsonb,
                $10,
                $11,
                $12,
                NULL,
                'ACTIVE',
                $13::jsonb
              )
              RETURNING *
            `,
            [
              knownGood.publicId,

              resolved.organizationUuid,

              resolved.environmentUuid,

              knownGood.resourceId,

              knownGood.resourceStateId,

              knownGood.validFrom,

              knownGood.confidence,

              knownGood.evidenceCount,

              JSON.stringify(
                knownGood.healthEvidence
              ),

              knownGood.reason,

              knownGood.source,

              knownGood.approvedByHuman,

              JSON.stringify(
                knownGood.metadata ||
                {}
              ),
            ]
          );


        const created =
          insertResult.rows[0];


        /*
         * Complete historical linkage:
         *
         * previous.superseded_by → new baseline
         */
        if (
          previousId
        ) {
          await client.query(
            `
              UPDATE resources.known_good_states
              SET
                superseded_by = $4
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              previousId,

              created.id,
            ]
          );
        }


        return exposeKnownGood(
          created,
          resolved
        );
      },

      transaction
    );
  }


  async getKnownGoodStateById(
    {
      organizationId,
      environmentId,
      knownGoodStateId,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !knownGoodStateId
    ) {
      return null;
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
        const result =
          await client.query(
            `
              SELECT *
              FROM resources.known_good_states
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              knownGoodStateId,
            ]
          );


        return exposeKnownGood(
          result.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }


  async getActiveKnownGoodState(
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
              FROM resources.known_good_states
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND resource_id = $3
                AND status = 'ACTIVE'
              ORDER BY
                valid_from DESC,
                created_at DESC
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              resourceId,
            ]
          );


        return exposeKnownGood(
          result.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }


  /*
   * Historical designation valid at time T.
   *
   * Do NOT filter by current status here.
   *
   * A row may now be SUPERSEDED but still have been the valid
   * known-good baseline at a historical timestamp.
   */
  async getKnownGoodStateAtTime(
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
              FROM resources.known_good_states
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND resource_id = $3
                AND valid_from <= $4
                AND (
                  valid_until IS NULL
                  OR valid_until > $4
                )
              ORDER BY
                valid_from DESC,
                created_at DESC
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              resourceId,

              timestamp,
            ]
          );


        return exposeKnownGood(
          result.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }


  async listKnownGoodHistory(
    {
      organizationId,
      environmentId,
      resourceId,
      limit = 100,
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
              FROM resources.known_good_states
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND resource_id = $3
              ORDER BY
                valid_from DESC,
                created_at DESC,
                id DESC
              LIMIT $4
              OFFSET $5
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              resourceId,

              normalizeLimit(
                limit
              ),

              normalizeOffset(
                offset
              ),
            ]
          );


        return result.rows.map(
          (row) =>
            exposeKnownGood(
              row,
              resolved
            )
        );
      },

      transaction
    );
  }


  async revokeActiveKnownGoodState(
    {
      organizationId,
      environmentId,
      resourceId,
      revokedAt = new Date(),
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
        revokedAt
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
        const activeResult =
          await client.query(
            `
              SELECT *
              FROM resources.known_good_states
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND resource_id = $3
                AND status = 'ACTIVE'
              LIMIT 1
              FOR UPDATE
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              resourceId,
            ]
          );


        const active =
          activeResult.rows[0] ||
          null;


        if (
          !active
        ) {
          return null;
        }


        if (
          timestamp.getTime() <=
          new Date(
            active.valid_from
          ).getTime()
        ) {
          throw createRepositoryError(
            "Known-good revocation time must be after validFrom",
            "KNOWN_GOOD_REVOCATION_TIME_INVALID"
          );
        }


        const updateResult =
          await client.query(
            `
              UPDATE resources.known_good_states
              SET
                status = 'REVOKED',
                valid_until = $4
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3
              RETURNING *
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              active.id,

              timestamp,
            ]
          );


        return exposeKnownGood(
          updateResult.rows[0] ||
            null,

          resolved
        );
      },

      transaction
    );
  }
}


function requireScope(
  value = {}
) {
  if (
    !value.organizationId ||
    !value.environmentId
  ) {
    throw createRepositoryError(
      "Known-good PostgreSQL operation requires organizationId and environmentId",
      "POSTGRES_KNOWN_GOOD_SCOPE_REQUIRED"
    );
  }


  return value;
}


function requireResourceId(
  resourceId
) {
  if (
    !resourceId
  ) {
    throw createRepositoryError(
      "Known-good operation requires resourceId",
      "POSTGRES_KNOWN_GOOD_RESOURCE_ID_REQUIRED"
    );
  }


  return resourceId;
}


function requireTimestamp(
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
    throw createRepositoryError(
      "Known-good timestamp is invalid",
      "POSTGRES_KNOWN_GOOD_TIMESTAMP_INVALID"
    );
  }


  return result;
}


function buildScope(
  value
) {
  return {
    organizationId:
      value.organizationId,

    environmentId:
      value.environmentId,
  };
}


function generatePublicId() {
  return (
    "kgs_" +
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


  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 100;
  }


  return Math.min(
    Math.max(
      parsed,
      1
    ),
    1000
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


  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 0;
  }


  return Math.max(
    parsed,
    0
  );
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

    resourceStateId:
      row.resource_state_id,

    validFrom:
      row.valid_from,

    validUntil:
      row.valid_until,

    confidence:
      Number(
        row.confidence
      ),

    evidenceCount:
      row.evidence_count,

    healthEvidence:
      row.health_evidence ||
      {},

    reason:
      row.reason,

    source:
      row.source,

    approvedByHuman:
      Boolean(
        row.approved_by_human
      ),

    supersededBy:
      row.superseded_by ||
      null,

    status:
      row.status,

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at,
  };
}


function createRepositoryError(
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
  PostgresKnownGoodStateRepository;