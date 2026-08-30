"use strict";

const crypto =
  require(
    "node:crypto"
  );

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


const CONNECTION_STATUSES =
  Object.freeze([
    "draft",
    "connected",
    "degraded",
    "disconnected",
    "disabled",
  ]);


const HEALTH_STATUSES =
  Object.freeze([
    "unknown",
    "healthy",
    "degraded",
    "unhealthy",
  ]);


class PostgresIntegrationConnectionRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  async createConnection(
    input,
    transaction = null
  ) {
    validateCreateInput(
      input
    );


    return this.scope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const publicId =
          input.publicId ||
          generateConnectionPublicId();


        const status =
          normalizeStatus(
            input.status ||
            "draft"
          );


        const lifecycle =
          normalizeLifecycle(
            status,
            input
          );


        const result =
          await client.query(
            `
              INSERT INTO
                integrations.connections (
                  public_id,

                  organization_id,
                  environment_id,

                  provider,
                  name,
                  external_account_id,

                  service_ids,
                  capabilities,
                  non_secret_config,

                  status,
                  health_status,

                  connected_at,
                  disconnected_at,
                  disabled_at,
                  disabled_reason,

                  last_health_check_at,
                  last_event_at,
                  last_successful_event_at,
                  last_error_at,

                  error_summary,
                  consecutive_failures,
                  last_latency_ms,

                  created_by_user_id,
                  updated_by_user_id,

                  metadata,

                  execution_authorized
                )
              VALUES (
                $1,

                $2,
                $3,

                $4,
                $5,
                $6,

                $7::jsonb,
                $8::jsonb,
                $9::jsonb,

                $10,
                $11,

                $12,
                $13,
                $14,
                $15,

                $16,
                $17,
                $18,
                $19,

                $20,
                $21,
                $22,

                $23,
                $24,

                $25::jsonb,

                false
              )

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              normalizeProvider(
                input.provider
              ),

              normalizeName(
                input.name
              ),

              nullableString(
                input.externalAccountId
              ),

              JSON.stringify(
                normalizeStringArray(
                  input.serviceIds
                )
              ),

              JSON.stringify(
                normalizeStringArray(
                  input.capabilities
                )
              ),

              JSON.stringify(
                normalizeObject(
                  input.nonSecretConfig
                )
              ),

              status,

              normalizeHealthStatus(
                input.healthStatus ||
                "unknown"
              ),

              lifecycle
                .connectedAt,

              lifecycle
                .disconnectedAt,

              lifecycle
                .disabledAt,

              lifecycle
                .disabledReason,

              nullableDate(
                input.lastHealthCheckAt
              ),

              nullableDate(
                input.lastEventAt
              ),

              nullableDate(
                input.lastSuccessfulEventAt
              ),

              nullableDate(
                input.lastErrorAt
              ),

              nullableString(
                input.errorSummary
              ),

              normalizeNonNegativeInteger(
                input.consecutiveFailures,
                0
              ),

              normalizeNullableNonNegativeInteger(
                input.lastLatencyMs
              ),

              input.createdByUserId ||
              null,

              input.updatedByUserId ||
              input.createdByUserId ||
              null,

              JSON.stringify(
                normalizeObject(
                  input.metadata
                )
              ),
            ]
          );


        return mapConnection(
          result.rows[0]
        );
      },

      transaction
    );
  }


  async getConnectionById(
    {
      organizationId,

      environmentId,

      connectionId,
    },

    transaction = null
  ) {
    requireScope(
      organizationId,
      environmentId
    );


    if (
      !connectionId
    ) {
      throw requiredError(
        "connectionId"
      );
    }


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
                integrations.connections
              WHERE
                id = $1
              LIMIT 1
            `,
            [
              connectionId,
            ]
          );


        return result
          .rows[0]
          ? mapConnection(
              result.rows[0]
            )
          : null;
      },

      transaction
    );
  }


  async getConnectionByPublicId(
    {
      organizationId,

      environmentId,

      publicId,
    },

    transaction = null
  ) {
    requireScope(
      organizationId,
      environmentId
    );


    if (
      !publicId
    ) {
      throw requiredError(
        "publicId"
      );
    }


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
                integrations.connections
              WHERE
                public_id = $1
              LIMIT 1
            `,
            [
              publicId,
            ]
          );


        return result
          .rows[0]
          ? mapConnection(
              result.rows[0]
            )
          : null;
      },

      transaction
    );
  }


  async listConnections(
    {
      organizationId,

      environmentId,

      provider =
        null,

      status =
        null,

      healthStatus =
        null,

      limit =
        100,

      offset =
        0,
    },

    transaction = null
  ) {
    requireScope(
      organizationId,
      environmentId
    );


    const normalizedLimit =
      Math.min(
        Math.max(
          Number(
            limit
          ) ||
          100,
          1
        ),
        500
      );


    const normalizedOffset =
      Math.max(
        Number(
          offset
        ) ||
        0,
        0
      );


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
                integrations.connections
              WHERE
                (
                  $1::text IS NULL
                  OR
                  provider = $1
                )

                AND

                (
                  $2::text IS NULL
                  OR
                  status = $2
                )

                AND

                (
                  $3::text IS NULL
                  OR
                  health_status = $3
                )

              ORDER BY
                created_at DESC,
                id DESC

              LIMIT $4
              OFFSET $5
            `,
            [
              provider
                ? normalizeProvider(
                    provider
                  )
                : null,

              status
                ? normalizeStatus(
                    status
                  )
                : null,

              healthStatus
                ? normalizeHealthStatus(
                    healthStatus
                  )
                : null,

              normalizedLimit,

              normalizedOffset,
            ]
          );


        return result.rows.map(
          mapConnection
        );
      },

      transaction
    );
  }


  async updateConnection(
    {
      organizationId,

      environmentId,

      connectionId,

      patch,
    },

    transaction = null
  ) {
    requireScope(
      organizationId,
      environmentId
    );


    if (
      !connectionId
    ) {
      throw requiredError(
        "connectionId"
      );
    }


    if (
      !patch ||
      typeof patch !==
        "object" ||
      Array.isArray(
        patch
      )
    ) {
      throw Object.assign(
        new Error(
          "integration connection patch is required"
        ),
        {
          code:
            "INTEGRATION_CONNECTION_PATCH_REQUIRED",
        }
      );
    }


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client
      ) => {
        const existingResult =
          await client.query(
            `
              SELECT *
              FROM
                integrations.connections
              WHERE
                id = $1
              FOR UPDATE
            `,
            [
              connectionId,
            ]
          );


        if (
          !existingResult
            .rows[0]
        ) {
          return null;
        }


        const existing =
          mapConnection(
            existingResult
              .rows[0]
          );


        const status =
          patch.status !==
          undefined
            ? normalizeStatus(
                patch.status
              )
            : existing.status;


        const lifecycle =
          normalizeLifecycle(
            status,
            {
              ...existing,

              ...patch,
            }
          );


        const result =
          await client.query(
            `
              UPDATE
                integrations.connections
              SET
                provider = $2,

                name = $3,

                external_account_id = $4,

                service_ids = $5::jsonb,

                capabilities = $6::jsonb,

                non_secret_config = $7::jsonb,

                status = $8,

                health_status = $9,

                connected_at = $10,

                disconnected_at = $11,

                disabled_at = $12,

                disabled_reason = $13,

                last_health_check_at = $14,

                last_event_at = $15,

                last_successful_event_at = $16,

                last_error_at = $17,

                error_summary = $18,

                consecutive_failures = $19,

                last_latency_ms = $20,

                updated_by_user_id = $21,

                metadata = $22::jsonb,

                execution_authorized = false
              WHERE
                id = $1

              RETURNING *
            `,
            [
              connectionId,

              patch.provider !==
              undefined
                ? normalizeProvider(
                    patch.provider
                  )
                : existing.provider,

              patch.name !==
              undefined
                ? normalizeName(
                    patch.name
                  )
                : existing.name,

              patch.externalAccountId !==
              undefined
                ? nullableString(
                    patch.externalAccountId
                  )
                : existing
                    .externalAccountId,

              JSON.stringify(
                patch.serviceIds !==
                undefined
                  ? normalizeStringArray(
                      patch.serviceIds
                    )
                  : existing
                      .serviceIds
              ),

              JSON.stringify(
                patch.capabilities !==
                undefined
                  ? normalizeStringArray(
                      patch.capabilities
                    )
                  : existing
                      .capabilities
              ),

              JSON.stringify(
                patch.nonSecretConfig !==
                undefined
                  ? normalizeObject(
                      patch.nonSecretConfig
                    )
                  : existing
                      .nonSecretConfig
              ),

              status,

              patch.healthStatus !==
              undefined
                ? normalizeHealthStatus(
                    patch.healthStatus
                  )
                : existing
                    .healthStatus,

              lifecycle
                .connectedAt,

              lifecycle
                .disconnectedAt,

              lifecycle
                .disabledAt,

              lifecycle
                .disabledReason,

              patch.lastHealthCheckAt !==
              undefined
                ? nullableDate(
                    patch.lastHealthCheckAt
                  )
                : existing
                    .lastHealthCheckAt,

              patch.lastEventAt !==
              undefined
                ? nullableDate(
                    patch.lastEventAt
                  )
                : existing
                    .lastEventAt,

              patch.lastSuccessfulEventAt !==
              undefined
                ? nullableDate(
                    patch.lastSuccessfulEventAt
                  )
                : existing
                    .lastSuccessfulEventAt,

              patch.lastErrorAt !==
              undefined
                ? nullableDate(
                    patch.lastErrorAt
                  )
                : existing
                    .lastErrorAt,

              patch.errorSummary !==
              undefined
                ? nullableString(
                    patch.errorSummary
                  )
                : existing
                    .errorSummary,

              patch.consecutiveFailures !==
              undefined
                ? normalizeNonNegativeInteger(
                    patch.consecutiveFailures,
                    0
                  )
                : existing
                    .consecutiveFailures,

              patch.lastLatencyMs !==
              undefined
                ? normalizeNullableNonNegativeInteger(
                    patch.lastLatencyMs
                  )
                : existing
                    .lastLatencyMs,

              patch.updatedByUserId ||
              existing
                .updatedByUserId ||
              null,

              JSON.stringify(
                patch.metadata !==
                undefined
                  ? normalizeObject(
                      patch.metadata
                    )
                  : existing
                      .metadata
              ),
            ]
          );


        return mapConnection(
          result.rows[0]
        );
      },

      transaction
    );
  }


  async deleteConnection(
    {
      organizationId,

      environmentId,

      connectionId,
    },

    transaction = null
  ) {
    requireScope(
      organizationId,
      environmentId
    );


    if (
      !connectionId
    ) {
      throw requiredError(
        "connectionId"
      );
    }


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
              DELETE FROM
                integrations.connections
              WHERE
                id = $1
              RETURNING id
            `,
            [
              connectionId,
            ]
          );


        return (
          result.rowCount >
          0
        );
      },

      transaction
    );
  }
}


function validateCreateInput(
  input
) {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw Object.assign(
      new Error(
        "integration connection input is required"
      ),
      {
        code:
          "INTEGRATION_CONNECTION_INPUT_REQUIRED",
      }
    );
  }


  requireScope(
    input.organizationId,
    input.environmentId
  );


  if (
    !input.provider
  ) {
    throw requiredError(
      "provider"
    );
  }


  if (
    !input.name
  ) {
    throw requiredError(
      "name"
    );
  }
}


function requireScope(
  organizationId,
  environmentId
) {
  if (
    !organizationId
  ) {
    throw requiredError(
      "organizationId"
    );
  }


  if (
    !environmentId
  ) {
    throw requiredError(
      "environmentId"
    );
  }
}


function requiredError(
  field
) {
  return Object.assign(
    new Error(
      `${field} is required`
    ),
    {
      code:
        "INTEGRATION_CONNECTION_FIELD_REQUIRED",

      field,
    }
  );
}


function normalizeProvider(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !normalized
  ) {
    throw requiredError(
      "provider"
    );
  }


  return normalized;
}


function normalizeName(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim();


  if (
    !normalized
  ) {
    throw requiredError(
      "name"
    );
  }


  return normalized;
}


function normalizeStatus(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !CONNECTION_STATUSES
      .includes(
        normalized
      )
  ) {
    throw Object.assign(
      new Error(
        `invalid integration connection status: ${value}`
      ),
      {
        code:
          "INTEGRATION_CONNECTION_STATUS_INVALID",
      }
    );
  }


  return normalized;
}


function normalizeHealthStatus(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !HEALTH_STATUSES
      .includes(
        normalized
      )
  ) {
    throw Object.assign(
      new Error(
        `invalid integration health status: ${value}`
      ),
      {
        code:
          "INTEGRATION_HEALTH_STATUS_INVALID",
      }
    );
  }


  return normalized;
}


function normalizeLifecycle(
  status,
  input
) {
  let connectedAt =
    nullableDate(
      input.connectedAt
    );


  let disconnectedAt =
    nullableDate(
      input.disconnectedAt
    );


  let disabledAt =
    nullableDate(
      input.disabledAt
    );


  let disabledReason =
    nullableString(
      input.disabledReason
    );


  if (
    status ===
    "connected"
  ) {
    connectedAt =
      connectedAt ||
      new Date();

    disconnectedAt =
      null;

    disabledAt =
      null;

    disabledReason =
      null;
  }


  if (
    status ===
      "disconnected" &&
    !disconnectedAt
  ) {
    disconnectedAt =
      new Date();
  }


  if (
    status ===
      "disabled" &&
    !disabledAt
  ) {
    disabledAt =
      new Date();
  }


  return {
    connectedAt,

    disconnectedAt,

    disabledAt,

    disabledReason,
  };
}


function normalizeStringArray(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }


  return [
    ...new Set(
      value
        .filter(
          (
            item
          ) =>
            item !==
              null &&
            item !==
              undefined
        )
        .map(
          (
            item
          ) =>
            String(
              item
            )
        )
    ),
  ];
}


function normalizeObject(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return {};
  }


  return {
    ...value,
  };
}


function normalizeNonNegativeInteger(
  value,
  fallback
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return fallback;
  }


  const number =
    Number(
      value
    );


  if (
    !Number.isInteger(
      number
    ) ||
    number <
      0
  ) {
    throw Object.assign(
      new Error(
        "value must be a non-negative integer"
      ),
      {
        code:
          "INTEGRATION_NON_NEGATIVE_INTEGER_REQUIRED",
      }
    );
  }


  return number;
}


function normalizeNullableNonNegativeInteger(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ""
  ) {
    return null;
  }


  return normalizeNonNegativeInteger(
    value,
    0
  );
}


function nullableString(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }


  const normalized =
    String(
      value
    ).trim();


  return (
    normalized ||
    null
  );
}


function nullableDate(
  value
) {
  if (
    !value
  ) {
    return null;
  }


  if (
    value instanceof
    Date
  ) {
    return value;
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw Object.assign(
      new Error(
        `invalid date: ${value}`
      ),
      {
        code:
          "INTEGRATION_DATE_INVALID",
      }
    );
  }


  return date;
}


function generateConnectionPublicId() {
  return (
    "int_conn_" +
    crypto
      .randomUUID()
  );
}


function mapConnection(
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

    provider:
      row.provider,

    name:
      row.name,

    externalAccountId:
      row.external_account_id,

    serviceIds:
      Array.isArray(
        row.service_ids
      )
        ? row.service_ids
        : [],

    capabilities:
      Array.isArray(
        row.capabilities
      )
        ? row.capabilities
        : [],

    nonSecretConfig:
      row.non_secret_config ||
      {},

    status:
      row.status,

    healthStatus:
      row.health_status,

    connectedAt:
      row.connected_at,

    disconnectedAt:
      row.disconnected_at,

    disabledAt:
      row.disabled_at,

    disabledReason:
      row.disabled_reason,

    lastHealthCheckAt:
      row.last_health_check_at,

    lastEventAt:
      row.last_event_at,

    lastSuccessfulEventAt:
      row.last_successful_event_at,

    lastErrorAt:
      row.last_error_at,

    errorSummary:
      row.error_summary,

    consecutiveFailures:
      Number(
        row.consecutive_failures ||
        0
      ),

    lastLatencyMs:
      row.last_latency_ms ===
      null
        ? null
        : Number(
            row.last_latency_ms
          ),

    createdByUserId:
      row.created_by_user_id,

    updatedByUserId:
      row.updated_by_user_id,

    metadata:
      row.metadata ||
      {},

    executionAuthorized:
      false,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


module.exports =
  PostgresIntegrationConnectionRepository;