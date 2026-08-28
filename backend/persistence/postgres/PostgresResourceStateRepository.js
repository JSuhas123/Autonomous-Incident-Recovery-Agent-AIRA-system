"use strict";

const crypto = require(
  "node:crypto"
);

const PostgresTenantScope = require(
  "./PostgresTenantScope"
);

const {
  assertValidResourceState,
} = require(
  "../../contracts/topology/resourceStateContract"
);


/*
 * ============================================================================
 * POSTGRES RESOURCE STATE REPOSITORY
 * ============================================================================
 *
 * Phase 17.4
 *
 * Canonical persistence boundary for immutable ResourceState history.
 *
 * PostgreSQL:
 *
 *   resources.resource_states
 *
 * Resource identity lives in:
 *
 *   resources.resources
 *
 * Resource state history lives here.
 *
 * This repository is intentionally append-only.
 *
 * There are deliberately NO:
 *
 *   updateResourceState()
 *   deleteResourceState()
 *   replaceResourceState()
 *   saveResourceState()
 *
 * methods.
 *
 * Historical state must never be rewritten.
 *
 * PostgreSQL migration 0066 additionally enforces immutability at the
 * database layer.
 *
 * ============================================================================
 */

class PostgresResourceStateRepository {
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
   * APPEND IMMUTABLE STATE
   * ==========================================================================
   */

  async appendResourceState(
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
    };


    const state =
      assertValidResourceState(
        candidate
      );


    return this.scope.run(
      buildScope(
        state
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO resources.resource_states (
                public_id,
                organization_id,
                environment_id,
                resource_id,
                observed_at,
                health,
                lifecycle,
                configuration,
                runtime,
                metrics,
                attributes,
                version,
                fingerprint,
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
                $8::jsonb,
                $9::jsonb,
                $10::jsonb,
                $11::jsonb,
                $12,
                $13,
                $14,
                $15::jsonb,
                $16::jsonb
              )
              RETURNING *
            `,
            [
              state.publicId,

              resolved.organizationUuid,

              resolved.environmentUuid,

              state.resourceId,

              state.observedAt,

              state.health,

              state.lifecycle,

              JSON.stringify(
                state.configuration ||
                {}
              ),

              JSON.stringify(
                state.runtime ||
                {}
              ),

              JSON.stringify(
                state.metrics ||
                {}
              ),

              JSON.stringify(
                state.attributes ||
                {}
              ),

              state.version,

              state.fingerprint,

              state.source,

              JSON.stringify(
                state.evidence ||
                {}
              ),

              JSON.stringify(
                state.metadata ||
                {}
              ),
            ]
          );


        return exposeState(
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
   * GET STATE BY CANONICAL UUID
   * ==========================================================================
   */

  async getResourceStateById(
    {
      organizationId,
      environmentId,
      stateId,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !stateId
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
              FROM resources.resource_states
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND id = $3
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              stateId,
            ]
          );


        return exposeState(
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
   * GET STATE BY PUBLIC ID
   * ==========================================================================
   */

  async getResourceStateByPublicId(
    {
      organizationId,
      environmentId,
      publicId,
    },
    transaction = null
  ) {
    requireScope({
      organizationId,
      environmentId,
    });


    if (
      !publicId
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
              FROM resources.resource_states
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND public_id = $3
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              publicId,
            ]
          );


        return exposeState(
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
   * CURRENT / LATEST STATE
   *
   * "Latest" means greatest observed_at.
   *
   * It does NOT mean known-good.
   * ==========================================================================
   */

  async getLatestResourceState(
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
              FROM resources.resource_states
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND resource_id = $3
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
            ]
          );


        return exposeState(
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
   * STATE AT HISTORICAL TIME
   *
   * Returns the latest observation at or before the requested time.
   *
   * This is a fundamental primitive that Phase 17.9 and 17.10 will later use
   * for temporal topology reconstruction.
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
        at,
        "at"
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


        return exposeState(
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
   * FIND STATE BY FINGERPRINT
   *
   * Fingerprint lookup is useful for:
   *
   * - detecting repeated states
   * - historical comparison
   * - later known-good matching
   *
   * Fingerprint equality does not grant authorization and does not by itself
   * establish known-good state.
   * ==========================================================================
   */

  async findResourceStateByFingerprint(
    {
      organizationId,
      environmentId,
      resourceId,
      fingerprint,
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


    if (
      !fingerprint
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
              FROM resources.resource_states
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND resource_id = $3
                AND fingerprint = $4
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

              fingerprint,
            ]
          );


        return exposeState(
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
   * RESOURCE STATE HISTORY
   * ==========================================================================
   */

  async listResourceStates(
    filter = {},
    transaction = null
  ) {
    requireScope(
      filter
    );


    requireResourceId(
      filter.resourceId
    );


    const limit =
      normalizeLimit(
        filter.limit
      );


    const offset =
      normalizeOffset(
        filter.offset
      );


    return this.scope.run(
      buildScope(
        filter
      ),

      async (
        client,
        resolved
      ) => {
        const values = [
          resolved.organizationUuid,

          resolved.environmentUuid,

          filter.resourceId,
        ];


        const conditions = [
          "organization_id = $1",

          "environment_id = $2",

          "resource_id = $3",
        ];


        appendFilter(
          conditions,
          values,
          "health",
          filter.health
        );


        appendFilter(
          conditions,
          values,
          "lifecycle",
          filter.lifecycle
        );


        appendFilter(
          conditions,
          values,
          "source",
          filter.source
        );


        if (
          filter.from
        ) {
          values.push(
            requireTimestamp(
              filter.from,
              "from"
            )
          );


          conditions.push(
            `observed_at >= $${values.length}`
          );
        }


        if (
          filter.to
        ) {
          values.push(
            requireTimestamp(
              filter.to,
              "to"
            )
          );


          conditions.push(
            `observed_at <= $${values.length}`
          );
        }


        values.push(
          limit
        );


        const limitParameter =
          values.length;


        values.push(
          offset
        );


        const offsetParameter =
          values.length;


        const result =
          await client.query(
            `
              SELECT *
              FROM resources.resource_states
              WHERE
                ${conditions.join(
                  "\nAND "
                )}
              ORDER BY
                observed_at DESC,
                created_at DESC,
                id DESC
              LIMIT $${limitParameter}
              OFFSET $${offsetParameter}
            `,
            values
          );


        return result.rows.map(
          (row) =>
            exposeState(
              row,
              resolved
            )
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

function requireScope(
  value = {}
) {
  if (
    !value.organizationId ||
    !value.environmentId
  ) {
    throw createRepositoryError(
      "Resource state PostgreSQL operation requires organizationId and environmentId",
      "POSTGRES_RESOURCE_STATE_SCOPE_REQUIRED"
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
      "Resource state operation requires resourceId",
      "POSTGRES_RESOURCE_STATE_RESOURCE_ID_REQUIRED"
    );
  }


  return resourceId;
}


function requireTimestamp(
  value,
  fieldName
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
    throw createRepositoryError(
      `Invalid resource state ${fieldName} timestamp`,
      "POSTGRES_RESOURCE_STATE_TIMESTAMP_INVALID"
    );
  }


  return timestamp;
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
    "rstate_" +
    crypto.randomUUID()
  );
}


function appendFilter(
  conditions,
  values,
  column,
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return;
  }


  values.push(
    value
  );


  conditions.push(
    `${column} = $${values.length}`
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
  PostgresResourceStateRepository;