"use strict";

const crypto =
  require(
    "node:crypto"
  );

const AuditRepository =
  require(
    "../repositories/AuditRepository"
  );

const PostgresTenantContext =
  require(
    "./PostgresTenantContext"
  );

const PostgresIdentityResolver =
  require(
    "./PostgresIdentityResolver"
  );

const {
  normalizeId,
  serializeDocument,
  reviveDocument,
  translatePostgresError,
} =
  require(
    "./postgresDomainMapper"
  );

class PostgresAuditRepository
  extends AuditRepository {
  constructor(
    options = {}
  ) {
    super();

    this.tenantContext =
      options.tenantContext ||
      new PostgresTenantContext(
        options
      );

    this.identityResolver =
      options.identityResolver ||
      new PostgresIdentityResolver();
  }

  async create(
    data,
    transaction = null
  ) {
    const tenantId =
      requireTenant(
        data
      );

    return this.tenantContext.run(
      tenantId,
      async (
        client
      ) => {
        let organizationUuid =
          null;

        let environmentUuid =
          null;

        if (
          data.organizationId &&
          data.environmentId
        ) {
          const resolved =
            await this.identityResolver
              .resolveScope(
                client,
                {
                  organizationId:
                    data.organizationId,

                  environmentId:
                    data.environmentId,
                }
              );

          organizationUuid =
            resolved.organizationUuid;

          environmentUuid =
            resolved.environmentUuid;
        }

        const databaseId =
          normalizeId(
            data._id
          ) ||
          crypto.randomUUID();

        const document =
          serializeDocument({
            ...data,

            _id:
              databaseId,
          });

        try {
          const result =
            await client.query(
              `
                INSERT INTO audit.audit_events (
                  public_id,
                  database_id,
                  tenant_public_id,
                  organization_id,
                  environment_id,
                  chain_index,
                  event_type,
                  principal,
                  principal_id,
                  user_id,
                  correlation_id,
                  ip_address,
                  action,
                  service_id,
                  action_details,
                  payload,
                  metadata,
                  signature,
                  previous_event_hash,
                  event_hash,
                  status,
                  occurred_at,
                  document
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8, $9, $10,
                  $11, $12, $13, $14, $15::jsonb,
                  $16::jsonb, $17::jsonb, $18, $19, $20,
                  $21, $22, $23::jsonb
                )
                RETURNING *
              `,
              [
                data.eventId,

                databaseId,

                tenantId,

                organizationUuid,

                environmentUuid,

                data.chainIndex,

                data.eventType,

                data.principal,

                data.principalId ||
                  null,

                data.userId ||
                  null,

                data.correlationId ||
                  null,

                data.ipAddress ||
                  null,

                data.action ||
                  null,

                normalizeId(
                  data.serviceId
                ),

                data.actionDetails ==
                  null
                  ? null
                  : JSON.stringify(
                      data.actionDetails
                    ),

                JSON.stringify(
                  data.payload ??
                  null
                ),

                data.metadata ==
                  null
                  ? null
                  : JSON.stringify(
                      data.metadata
                    ),

                data.signature,

                data.previousEventHash ||
                  null,

                data.eventHash,

                data.status ||
                  "created",

                new Date(
                  data.timestamp ||
                  Date.now()
                ),

                JSON.stringify(
                  document
                ),
              ]
            );

          return mapAuditEvent(
            result.rows[0]
          );
        } catch (
          error
        ) {
          throw translatePostgresError(
            error
          );
        }
      },
      transaction
    );
  }

  async findLatestForTenant(
    tenantId,
    transaction = null
  ) {
    return this.tenantContext.run(
      tenantId,
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM audit.audit_events
              WHERE tenant_public_id = $1
              ORDER BY occurred_at DESC
              LIMIT 1
            `,
            [
              tenantId,
            ]
          );

        return result.rows[0]
          ? mapAuditEvent(
              result.rows[0]
            )
          : null;
      },
      transaction
    );
  }

  async findOne(
    filter,
    transaction = null
  ) {
    const tenantId =
      requireTenant(
        filter
      );

    return this.tenantContext.run(
      tenantId,
      async (
        client
      ) => {
        const {
          where,
          values,
        } =
          buildAuditFilter(
            filter
          );

        const result =
          await client.query(
            `
              SELECT *
              FROM audit.audit_events
              WHERE ${where}
              ORDER BY occurred_at DESC
              LIMIT 1
            `,
            values
          );

        return result.rows[0]
          ? mapAuditEvent(
              result.rows[0]
            )
          : null;
      },
      transaction
    );
  }

  async list(
    filter,
    {
      sort = {
        timestamp:
          1,
      },

      limit = null,
    } = {},
    transaction = null
  ) {
    const tenantId =
      requireTenant(
        filter
      );

    return this.tenantContext.run(
      tenantId,
      async (
        client
      ) => {
        const {
          where,
          values,
        } =
          buildAuditFilter(
            filter
          );

        const direction =
          Number(
            sort.timestamp
          ) >=
          0
            ? "ASC"
            : "DESC";

        let limitClause =
          "";

        if (
          limit !==
            null &&
          limit !==
            undefined
        ) {
          const safeLimit =
            Math.min(
              Math.max(
                Number(
                  limit
                ) ||
                100,
                1
              ),
              1000
            );

          values.push(
            safeLimit
          );

          limitClause =
            `LIMIT $${values.length}`;
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM audit.audit_events
              WHERE ${where}
              ORDER BY occurred_at ${direction}
              ${limitClause}
            `,
            values
          );

        return result.rows.map(
          mapAuditEvent
        );
      },
      transaction
    );
  }
}

function buildAuditFilter(
  filter
) {
  const clauses = [];
  const values = [];

  const fields = {
    tenantId:
      "tenant_public_id",

    eventId:
      "public_id",

    eventHash:
      "event_hash",

    correlationId:
      "correlation_id",

    eventType:
      "event_type",

    status:
      "status",
  };

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      filter
    )
  ) {
    if (
      key ===
      "timestamp"
    ) {
      for (
        const [
          operator,
          operand,
        ]
        of Object.entries(
          value
        )
      ) {
        const index =
          values.push(
            operand
          );

        if (
          operator ===
          "$gte"
        ) {
          clauses.push(
            `occurred_at >= $${index}`
          );
        } else if (
          operator ===
          "$lte"
        ) {
          clauses.push(
            `occurred_at <= $${index}`
          );
        }
      }

      continue;
    }

    const column =
      fields[key];

    if (!column) {
      throw Object.assign(
        new Error(
          `Unsupported PostgreSQL audit filter: ${key}`
        ),
        {
          code:
            "POSTGRES_AUDIT_FILTER_UNSUPPORTED",
        }
      );
    }

    const index =
      values.push(
        value
      );

    clauses.push(
      `${column} = $${index}`
    );
  }

  return {
    where:
      clauses.join(
        " AND "
      ),

    values,
  };
}

function mapAuditEvent(
  row
) {
  const document =
    reviveDocument(
      row.document ||
      {}
    );

  return {
    ...document,

    _id:
      row.database_id ||
      row.id,

    eventId:
      row.public_id,

    tenantId:
      row.tenant_public_id,

    chainIndex:
      Number(
        row.chain_index
      ),

    eventType:
      row.event_type,

    principal:
      row.principal,

    principalId:
      row.principal_id,

    userId:
      row.user_id,

    correlationId:
      row.correlation_id,

    ipAddress:
      row.ip_address,

    action:
      row.action,

    serviceId:
      row.service_id,

    actionDetails:
      row.action_details,

    payload:
      row.payload,

    metadata:
      row.metadata,

    signature:
      row.signature,

    previousEventHash:
      row.previous_event_hash,

    eventHash:
      row.event_hash,

    status:
      row.status,

    timestamp:
      row.occurred_at,

    createdAt:
      row.created_at,
  };
}

function requireTenant(
  value
) {
  const tenantId =
    typeof value ===
      "string"
      ? value
      : value?.tenantId;

  if (!tenantId) {
    throw Object.assign(
      new Error(
        "Audit PostgreSQL operation requires tenantId"
      ),
      {
        code:
          "POSTGRES_AUDIT_TENANT_REQUIRED",
      }
    );
  }

  return tenantId;
}

module.exports =
  PostgresAuditRepository;