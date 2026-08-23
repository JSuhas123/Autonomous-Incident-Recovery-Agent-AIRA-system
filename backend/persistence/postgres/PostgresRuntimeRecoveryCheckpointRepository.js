"use strict";

const crypto =
  require(
    "node:crypto"
  );

const RuntimeRecoveryCheckpointRepository =
  require(
    "../repositories/RuntimeRecoveryCheckpointRepository"
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

class PostgresRuntimeRecoveryCheckpointRepository
  extends RuntimeRecoveryCheckpointRepository {
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

  async create(
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
        const incident =
          await requireIncident(
            this.scope,
            client,
            resolved,
            data.incidentId
          );

        const databaseId =
          normalizeId(
            data._id
          ) ||
          createDatabaseId();

        const document =
          serializeDocument({
            ...data,

            _id:
              databaseId,

            executionAuthorized:
              false,
          });

        try {
          const result =
            await client.query(
              `
                INSERT INTO workflow.runtime_recovery_checkpoints (
                  database_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  operation_key,
                  stage,
                  status,
                  workflow_identity,
                  owner_worker_id,
                  owner_claim_token,
                  owner_claimed_at,
                  owner_heartbeat_at,
                  owner_lease_expires_at,
                  attempt,
                  interrupted,
                  interruption_reason,
                  interruption_detected_at,
                  resume_safety,
                  result,
                  error_code,
                  error_message,
                  error_retryable,
                  started_at,
                  completed_at,
                  last_transition_at,
                  execution_authorized,
                  metadata,
                  document
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8::jsonb, $9, $10,
                  $11, $12, $13, $14, $15,
                  $16, $17, $18, $19::jsonb, $20,
                  $21, $22, $23, $24, $25,
                  FALSE, $26::jsonb, $27::jsonb
                )
                RETURNING *
              `,
              checkpointValues(
                data,
                databaseId,
                incident.id,
                resolved,
                document
              )
            );

          return mapCheckpoint(
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

  async findOne(
    filter,
    transaction = null
  ) {
    const scope =
      requireScope(
        filter
      );

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const incident =
          await requireIncident(
            this.scope,
            client,
            resolved,
            filter.incidentId
          );

        const {
          where,
          values,
        } =
          buildCheckpointFilter(
            filter,
            incident.id
          );

        const result =
          await client.query(
            `
              SELECT *
              FROM workflow.runtime_recovery_checkpoints
              WHERE ${where}
              LIMIT 1
            `,
            values
          );

        return result.rows[0]
          ? mapCheckpoint(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  /**
   * Atomic compare-and-update.
   *
   * This preserves checkpoint fencing semantics.
   */
  async findOneAndUpdate(
    filter,
    update,
    transaction = null
  ) {
    const scope =
      requireScope(
        filter
      );

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const incident =
          await requireIncident(
            this.scope,
            client,
            resolved,
            filter.incidentId
          );

        const {
          where,
          values:
            filterValues,
        } =
          buildCheckpointFilter(
            filter,
            incident.id
          );

        const {
          setClause,
          values:
            updateValues,
        } =
          buildCheckpointUpdate(
            update,
            filterValues.length
          );

        if (!setClause) {
          throw Object.assign(
            new Error(
              "Runtime checkpoint update contains no supported operations"
            ),
            {
              code:
                "POSTGRES_CHECKPOINT_UPDATE_EMPTY",
            }
          );
        }

        const values = [
          ...filterValues,
          ...updateValues,
        ];

        const result =
          await client.query(
            `
              UPDATE workflow.runtime_recovery_checkpoints
              SET
                ${setClause},
                execution_authorized = FALSE
              WHERE ${where}
              RETURNING *
            `,
            values
          );

        return result.rows[0]
          ? mapCheckpoint(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }
}

function buildCheckpointFilter(
  filter,
  incidentUuid
) {
  const clauses = [
    "incident_id = $1",
  ];

  const values = [
    incidentUuid,
  ];

  const fieldMap = {
    stage:
      "stage",

    operationKey:
      "operation_key",

    status:
      "status",

    "owner.workerId":
      "owner_worker_id",

    "owner.claimToken":
      "owner_claim_token",

    "owner.leaseExpiresAt":
      "owner_lease_expires_at",
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
        "organizationId" ||
      key ===
        "environmentId" ||
      key ===
        "incidentId"
    ) {
      continue;
    }

    const column =
      fieldMap[key];

    if (!column) {
      throw Object.assign(
        new Error(
          `Unsupported runtime checkpoint filter: ${key}`
        ),
        {
          code:
            "POSTGRES_CHECKPOINT_FILTER_UNSUPPORTED",
        }
      );
    }

    if (
      value &&
      typeof value ===
        "object" &&
      !(value instanceof Date)
    ) {
      if (
        Array.isArray(
          value.$in
        )
      ) {
        const index =
          values.push(
            value.$in
          );

        clauses.push(
          `${column} = ANY($${index}::text[])`
        );

        continue;
      }

      if (
        value.$lte !==
        undefined
      ) {
        const index =
          values.push(
            value.$lte
          );

        clauses.push(
          `${column} <= $${index}`
        );

        continue;
      }

      throw Object.assign(
        new Error(
          `Unsupported checkpoint operator for ${key}`
        ),
        {
          code:
            "POSTGRES_CHECKPOINT_OPERATOR_UNSUPPORTED",
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
        "\nAND "
      ),

    values,
  };
}

function buildCheckpointUpdate(
  update,
  offset
) {
  const clauses = [];
  const values = [];

  const fieldMap = {
    status:
      "status",

    "owner.workerId":
      "owner_worker_id",

    "owner.claimToken":
      "owner_claim_token",

    "owner.claimedAt":
      "owner_claimed_at",

    "owner.heartbeatAt":
      "owner_heartbeat_at",

    "owner.leaseExpiresAt":
      "owner_lease_expires_at",

    "interruption.interrupted":
      "interrupted",

    "interruption.reason":
      "interruption_reason",

    "interruption.detectedAt":
      "interruption_detected_at",

    resumeSafety:
      "resume_safety",

    result:
      "result",

    "error.code":
      "error_code",

    "error.message":
      "error_message",

    "error.retryable":
      "error_retryable",

    startedAt:
      "started_at",

    completedAt:
      "completed_at",

    lastTransitionAt:
      "last_transition_at",
  };

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      update.$set ||
      {}
    )
  ) {
    /*
     * Execution authority is hard-coded FALSE in SQL.
     */
    if (
      key ===
      "executionAuthorized"
    ) {
      continue;
    }

    const column =
      fieldMap[key];

    if (!column) {
      throw Object.assign(
        new Error(
          `Unsupported runtime checkpoint update field: ${key}`
        ),
        {
          code:
            "POSTGRES_CHECKPOINT_UPDATE_UNSUPPORTED",
        }
      );
    }

    const index =
      offset +
      values.push(
        (
          key ===
            "result" &&
          value !==
            null
        )
          ? JSON.stringify(
              value
            )
          : value
      );

    clauses.push(
      key ===
        "result"
        ? `${column} = $${index}::jsonb`
        : `${column} = $${index}`
    );
  }

  for (
    const [
      key,
      amount,
    ]
    of Object.entries(
      update.$inc ||
      {}
    )
  ) {
    if (
      key !==
      "attempt"
    ) {
      throw Object.assign(
        new Error(
          `Unsupported runtime checkpoint increment field: ${key}`
        ),
        {
          code:
            "POSTGRES_CHECKPOINT_INCREMENT_UNSUPPORTED",
        }
      );
    }

    const index =
      offset +
      values.push(
        amount
      );

    clauses.push(
      `attempt = attempt + $${index}`
    );
  }

  return {
    setClause:
      clauses.join(
        ",\n"
      ),

    values,
  };
}

function checkpointValues(
  checkpoint,
  databaseId,
  incidentUuid,
  resolved,
  document
) {
  return [
    databaseId,

    resolved.organizationUuid,

    resolved.environmentUuid,

    incidentUuid,

    checkpoint.operationKey,

    checkpoint.stage,

    checkpoint.status,

    JSON.stringify(
      checkpoint.workflowIdentity ||
      {}
    ),

    checkpoint.owner
      ?.workerId ||
      null,

    checkpoint.owner
      ?.claimToken ||
      null,

    checkpoint.owner
      ?.claimedAt ||
      null,

    checkpoint.owner
      ?.heartbeatAt ||
      null,

    checkpoint.owner
      ?.leaseExpiresAt ||
      null,

    Number(
      checkpoint.attempt ||
      0
    ),

    Boolean(
      checkpoint.interruption
        ?.interrupted
    ),

    checkpoint.interruption
      ?.reason ||
      null,

    checkpoint.interruption
      ?.detectedAt ||
      null,

    checkpoint.resumeSafety ||
      "unknown",

    checkpoint.result == null
      ? null
      : JSON.stringify(
          checkpoint.result
        ),

    checkpoint.error
      ?.code ||
      null,

    checkpoint.error
      ?.message ||
      null,

    Boolean(
      checkpoint.error
        ?.retryable
    ),

    checkpoint.startedAt ||
      null,

    checkpoint.completedAt ||
      null,

    checkpoint.lastTransitionAt ||
      new Date(),

    JSON.stringify(
      checkpoint.metadata ||
      {}
    ),

    JSON.stringify(
      document
    ),
  ];
}

function mapCheckpoint(
  row,
  scope
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

    organizationId:
      normalizeId(
        scope.organizationId
      ),

    environmentId:
      normalizeId(
        scope.environmentId
      ),

    incidentId:
      document.incidentId ||
      normalizeId(
        scope.incidentId
      ),

    operationKey:
      row.operation_key,

    stage:
      row.stage,

    status:
      row.status,

    workflowIdentity:
      row.workflow_identity ||
      {},

    owner: {
      workerId:
        row.owner_worker_id,

      claimToken:
        row.owner_claim_token,

      claimedAt:
        row.owner_claimed_at,

      heartbeatAt:
        row.owner_heartbeat_at,

      leaseExpiresAt:
        row.owner_lease_expires_at,
    },

    attempt:
      row.attempt,

    interruption: {
      interrupted:
        row.interrupted,

      reason:
        row.interruption_reason,

      detectedAt:
        row.interruption_detected_at,
    },

    resumeSafety:
      row.resume_safety,

    result:
      row.result,

    error: {
      code:
        row.error_code,

      message:
        row.error_message,

      retryable:
        row.error_retryable,
    },

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,

    lastTransitionAt:
      row.last_transition_at,

    executionAuthorized:
      false,

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

async function requireIncident(
  tenantScope,
  client,
  resolved,
  incidentId
) {
  const incident =
    await tenantScope
      .identityResolver
      .resolveIncident(
        client,
        resolved,
        incidentId
      );

  if (!incident) {
    throw Object.assign(
      new Error(
        `Incident not found: ${incidentId}`
      ),
      {
        code:
          "POSTGRES_INCIDENT_NOT_FOUND",
      }
    );
  }

  return incident;
}

function requireScope(
  value = {}
) {
  if (
    !value.organizationId ||
    !value.environmentId ||
    !value.incidentId
  ) {
    throw Object.assign(
      new Error(
        "Runtime checkpoint PostgreSQL operation requires organizationId, environmentId and incidentId"
      ),
      {
        code:
          "POSTGRES_CHECKPOINT_SCOPE_REQUIRED",
      }
    );
  }

  return value;
}

function createDatabaseId() {
  return crypto
    .randomBytes(
      12
    )
    .toString(
      "hex"
    );
}

module.exports =
  PostgresRuntimeRecoveryCheckpointRepository;