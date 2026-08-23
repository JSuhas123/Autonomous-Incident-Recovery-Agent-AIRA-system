"use strict";

const crypto =
  require(
    "node:crypto"
  );

const ApprovalRepository =
  require(
    "../repositories/ApprovalRepository"
  );

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
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

class PostgresApprovalRepository
  extends ApprovalRepository {
  constructor(
    options = {}
  ) {
    super();

    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }

  async createRequest(
    data,
    transaction = null
  ) {
    const scope =
      requireScope(
        data
      );

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        let incidentUuid =
          null;

        if (
          data.incidentId
        ) {
          const incident =
            await this.scope
              .identityResolver
              .resolveIncident(
                client,
                resolved,
                data.incidentId
              );

          incidentUuid =
            incident?.id ||
            null;
        }

        const databaseId =
          normalizeId(
            data._id
          ) ||
          crypto.randomUUID();

        const approvalId =
          data.approvalId ||
          crypto.randomUUID();

        const expiresAt =
          data.expiresAt ||
          new Date(
            Date.now() +
            (
              Number.parseInt(
                process.env
                  .APPROVAL_TIMEOUT_MS,
                10
              ) ||
              600000
            )
          );

        const document =
          serializeDocument({
            ...data,

            _id:
              databaseId,

            approvalId,

            expiresAt,
          });

        try {
          const result =
            await client.query(
              `
                INSERT INTO execution.approvals (
                  public_id,
                  database_id,
                  legacy_mongo_id,
                  tenant_public_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  decision_id,
                  correlation_id,
                  action,
                  reason,
                  severity,
                  confidence,
                  resource,
                  namespace,
                  additional_params,
                  decision_trace,
                  status,
                  approved_by,
                  approved_at,
                  rejected_by,
                  rejected_at,
                  rejection_reason,
                  expires_at,
                  executed_at,
                  metadata,
                  document
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8, $9, $10,
                  $11, $12, $13, $14::jsonb, $15,
                  $16::jsonb, $17::jsonb, $18, $19, $20,
                  $21, $22, $23, $24, $25,
                  $26::jsonb, $27::jsonb
                )
                RETURNING *
              `,
              [
                approvalId,

                databaseId,

                data.legacyMongoId ||
                  null,

                data.tenantId,

                resolved.organizationUuid,

                resolved.environmentUuid,

                incidentUuid,

                data.decisionId,

                data.correlationId ||
                  null,

                data.action,

                data.reason,

                data.severity ||
                  "medium",

                data.confidence,

                JSON.stringify(
                  data.resource
                ),

                data.namespace ||
                  "default",

                JSON.stringify(
                  data.additionalParams ||
                  {}
                ),

                JSON.stringify(
                  data.decisionTrace ||
                  {}
                ),

                data.status ||
                  "pending",

                data.approvedBy ||
                  null,

                data.approvedAt ||
                  null,

                data.rejectedBy ||
                  null,

                data.rejectedAt ||
                  null,

                data.rejectionReason ||
                  null,

                expiresAt,

                data.executedAt ||
                  null,

                JSON.stringify(
                  data.metadata ||
                  {}
                ),

                JSON.stringify(
                  document
                ),
              ]
            );

          return mapApproval(
            result.rows[0],
            scope
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

  async findPending(
    scope,
    transaction = null
  ) {
    requireScope(
      scope
    );

    return this.scope.run(
      scope,
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM execution.approvals
              WHERE
                status = 'pending'
                AND expires_at > NOW()
              ORDER BY created_at DESC
            `
          );

        return result.rows.map(
          (
            row
          ) =>
            mapApproval(
              row,
              scope
            )
        );
      },
      transaction
    );
  }

  async findByApprovalId(
    approvalId,
    scope,
    transaction = null
  ) {
    requireScope(
      scope
    );

    return this.scope.run(
      scope,
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM execution.approvals
              WHERE public_id = $1
              LIMIT 1
            `,
            [
              approvalId,
            ]
          );

        return result.rows[0]
          ? mapApproval(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  async approve(
    request,
    approvedBy,
    metadata = {},
    transaction = null
  ) {
    if (
      request.status !==
      "pending"
    ) {
      throw new Error(
        `Cannot approve request with status: ${request.status}`
      );
    }

    if (
      new Date() >
      new Date(
        request.expiresAt
      )
    ) {
      request.status =
        "expired";

      await this.save(
        request,
        transaction
      );

      throw new Error(
        "Approval request has expired"
      );
    }

    request.status =
      "approved";

    request.approvedBy =
      approvedBy;

    request.approvedAt =
      new Date();

    request.metadata = {
      ...(
        request.metadata ||
        {}
      ),

      ...metadata,
    };

    return this.save(
      request,
      transaction
    );
  }

  async reject(
    request,
    rejectedBy,
    reason = "",
    metadata = {},
    transaction = null
  ) {
    if (
      request.status !==
      "pending"
    ) {
      throw new Error(
        `Cannot reject request with status: ${request.status}`
      );
    }

    request.status =
      "rejected";

    request.rejectedBy =
      rejectedBy;

    request.rejectionReason =
      reason;

    request.rejectedAt =
      new Date();

    request.metadata = {
      ...(
        request.metadata ||
        {}
      ),

      ...metadata,
    };

    return this.save(
      request,
      transaction
    );
  }

  async save(
    request,
    transaction = null
  ) {
    const scope =
      requireScope(
        request
      );

    return this.scope.run(
      scope,
      async (
        client
      ) => {
        const document =
          serializeDocument(
            request
          );

        const result =
          await client.query(
            `
              UPDATE execution.approvals
              SET
                status = $1,
                approved_by = $2,
                approved_at = $3,
                rejected_by = $4,
                rejected_at = $5,
                rejection_reason = $6,
                expires_at = $7,
                executed_at = $8,
                metadata = $9::jsonb,
                document = $10::jsonb
              WHERE public_id = $11
              RETURNING *
            `,
            [
              request.status,

              request.approvedBy ||
                null,

              request.approvedAt ||
                null,

              request.rejectedBy ||
                null,

              request.rejectedAt ||
                null,

              request.rejectionReason ||
                null,

              request.expiresAt,

              request.executedAt ||
                null,

              JSON.stringify(
                request.metadata ||
                {}
              ),

              JSON.stringify(
                document
              ),

              request.approvalId,
            ]
          );

        return result.rows[0]
          ? mapApproval(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  async countByStatus(
    scope,
    status,
    transaction = null
  ) {
    requireScope(
      scope
    );

    return this.scope.run(
      scope,
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT COUNT(*)::INTEGER AS count
              FROM execution.approvals
              WHERE status = $1
            `,
            [
              status,
            ]
          );

        return result.rows[0]
          .count;
      },
      transaction
    );
  }
}

function mapApproval(
  row,
  scope
) {
  const document =
    reviveDocument(
      row.document ||
      {}
    );

  let resource =
    row.resource;

  if (
    typeof resource ===
      "string"
  ) {
    resource =
      resource;
  } else if (
    resource !==
      null &&
    resource !==
      undefined
  ) {
    resource =
      typeof resource ===
        "object" &&
      Object.keys(
        resource
      ).length ===
        1 &&
      resource.value !==
        undefined
        ? resource.value
        : document.resource;
  }

  return {
    ...document,

    _id:
      row.database_id ||
      row.id,

    approvalId:
      row.public_id,

    tenantId:
      row.tenant_public_id,

    organizationId:
      normalizeId(
        scope.organizationId
      ),

    environmentId:
      normalizeId(
        scope.environmentId
      ),

    status:
      row.status,

    resource,

    approvedBy:
      row.approved_by,

    approvedAt:
      row.approved_at,

    rejectedBy:
      row.rejected_by,

    rejectedAt:
      row.rejected_at,

    rejectionReason:
      row.rejection_reason,

    expiresAt:
      row.expires_at,

    executedAt:
      row.executed_at,

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

function requireScope(
  value = {}
) {
  if (
    !value.organizationId ||
    !value.environmentId
  ) {
    throw Object.assign(
      new Error(
        "Approval PostgreSQL operation requires organizationId and environmentId"
      ),
      {
        code:
          "POSTGRES_APPROVAL_SCOPE_REQUIRED",
      }
    );
  }

  return value;
}

module.exports =
  PostgresApprovalRepository;