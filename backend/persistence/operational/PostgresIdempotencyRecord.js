"use strict";

const crypto = require("node:crypto");
const { getPostgresPool } = require("../postgres/postgresPool");

function rowToRecord(row) {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,

    organizationId: row.organization_id,
    environmentId: row.environment_id,
    operation: row.operation,
    idempotencyKey: row.idempotency_key,

    status: row.status,
    ownerId: row.owner_id,
    claimToken: row.claim_token,

    incidentId: row.incident_id,
    recoveryDecisionId: row.recovery_decision_id,
    executionRequestId: row.execution_request_id,
    verificationId: row.verification_id,
    lifecycleId: row.lifecycle_id,
    eventId: row.event_id,
    correlationId: row.correlation_id,

    requestFingerprint: row.request_fingerprint,

    result: row.result,
    resultReference: row.result_reference,

    failure: row.failure,

    claimedAt: row.claimed_at,
    heartbeatAt: row.heartbeat_at,
    leaseExpiresAt: row.lease_expires_at,

    completedAt: row.completed_at,
    expiredAt: row.expired_at,

    attemptCount: Number(row.attempt_count || 0),
    duplicateCount: Number(row.duplicate_count || 0),
    lastDuplicateAt: row.last_duplicate_at,

    metadata: row.metadata || {},
    schemaVersion: Number(row.schema_version || 1),

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function duplicateError(error) {
  if (error?.code !== "23505") return error;

  const wrapped = new Error(
    "Duplicate idempotency record"
  );

  wrapped.code = 11000;
  wrapped.codeName = "DuplicateKey";
  wrapped.cause = error;

  return wrapped;
}

function buildWhere(filter = {}, values = []) {
  const clauses = [];

  const mapping = {
    _id: "id",
    organizationId: "organization_id",
    environmentId: "environment_id",
    operation: "operation",
    idempotencyKey: "idempotency_key",
    status: "status",
    ownerId: "owner_id",
    claimToken: "claim_token",
  };

  for (const [key, column] of Object.entries(mapping)) {
    if (filter[key] === undefined) continue;

    values.push(filter[key]);
    clauses.push(`${column} = $${values.length}`);
  }

  if (filter.leaseExpiresAt?.$lte !== undefined) {
    values.push(filter.leaseExpiresAt.$lte);
    clauses.push(
      `lease_expires_at <= $${values.length}`
    );
  }

  if (filter["failure.retryable"] !== undefined) {
    values.push(filter["failure.retryable"]);
    clauses.push(
      `(failure->>'retryable')::boolean = $${values.length}`
    );
  }

  if (!clauses.length) {
    throw new Error(
      "Idempotency persistence refuses unscoped query"
    );
  }

  return clauses.join(" AND ");
}

function updateColumn(key) {
  const mapping = {
    status: "status",
    ownerId: "owner_id",
    claimToken: "claim_token",
    requestFingerprint: "request_fingerprint",

    incidentId: "incident_id",
    recoveryDecisionId: "recovery_decision_id",
    executionRequestId: "execution_request_id",
    verificationId: "verification_id",
    lifecycleId: "lifecycle_id",
    eventId: "event_id",
    correlationId: "correlation_id",

    result: "result",
    resultReference: "result_reference",
    failure: "failure",

    claimedAt: "claimed_at",
    heartbeatAt: "heartbeat_at",
    leaseExpiresAt: "lease_expires_at",
    completedAt: "completed_at",
    expiredAt: "expired_at",

    lastDuplicateAt: "last_duplicate_at",
    metadata: "metadata",
  };

  return mapping[key] || null;
}

class Query {
  constructor(executor) {
    this.executor = executor;
    this.sortSpec = null;
    this.limitValue = null;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  then(resolve, reject) {
    return this.executor({
      sort: this.sortSpec,
      limit: this.limitValue,
    }).then(resolve, reject);
  }

  catch(reject) {
    return this.then(undefined, reject);
  }
}

class PostgresIdempotencyRecord {
  static async create(data) {
    const pool = getPostgresPool();

    const id =
      data._id ||
      crypto.randomUUID();

    try {
      const result = await pool.query(
        `
        INSERT INTO workflow.idempotency_records (
          id,
          organization_id,
          environment_id,
          operation,
          idempotency_key,
          status,
          owner_id,
          claim_token,
          incident_id,
          recovery_decision_id,
          execution_request_id,
          verification_id,
          lifecycle_id,
          event_id,
          correlation_id,
          request_fingerprint,
          result,
          result_reference,
          failure,
          claimed_at,
          heartbeat_at,
          lease_expires_at,
          completed_at,
          expired_at,
          attempt_count,
          duplicate_count,
          last_duplicate_at,
          metadata,
          schema_version,
          created_at,
          updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,
          NOW(),NOW()
        )
        RETURNING *
        `,
        [
          id,
          data.organizationId,
          data.environmentId,
          data.operation,
          data.idempotencyKey,
          data.status || "PROCESSING",
          data.ownerId || null,
          data.claimToken || null,
          data.incidentId || null,
          data.recoveryDecisionId || null,
          data.executionRequestId || null,
          data.verificationId || null,
          data.lifecycleId || null,
          data.eventId || null,
          data.correlationId || null,
          data.requestFingerprint || null,
          data.result ?? null,
          data.resultReference || null,
          data.failure ?? null,
          data.claimedAt || null,
          data.heartbeatAt || null,
          data.leaseExpiresAt || null,
          data.completedAt || null,
          data.expiredAt || null,
          data.attemptCount || 0,
          data.duplicateCount || 0,
          data.lastDuplicateAt || null,
          data.metadata || {},
          data.schemaVersion || 1,
        ]
      );

      return rowToRecord(
        result.rows[0]
      );
    } catch (error) {
      throw duplicateError(error);
    }
  }

  static async findOne(filter) {
    const pool = getPostgresPool();
    const values = [];

    const where =
      buildWhere(filter, values);

    const result =
      await pool.query(
        `
        SELECT *
        FROM workflow.idempotency_records
        WHERE ${where}
        LIMIT 1
        `,
        values
      );

    return rowToRecord(
      result.rows[0]
    );
  }

  static async findOneAndUpdate(
    filter,
    update
  ) {
    const pool = getPostgresPool();
    const values = [];

    const where =
      buildWhere(filter, values);

    const setters = [];

    for (
      const [key, value]
      of Object.entries(update?.$set || {})
    ) {
      const column =
        updateColumn(key);

      if (!column) {
        throw new Error(
          `Unsupported idempotency update field: ${key}`
        );
      }

      values.push(value);

      setters.push(
        `${column} = $${values.length}`
      );
    }

    for (
      const [key, value]
      of Object.entries(update?.$inc || {})
    ) {
      const column =
        updateColumn(key) ||
        ({
          attemptCount: "attempt_count",
          duplicateCount: "duplicate_count",
        })[key];

      if (!column) {
        throw new Error(
          `Unsupported idempotency increment field: ${key}`
        );
      }

      values.push(value);

      setters.push(
        `${column} = COALESCE(${column},0) + $${values.length}`
      );
    }

    setters.push(
      "updated_at = NOW()"
    );

    const result =
      await pool.query(
        `
        UPDATE workflow.idempotency_records
        SET ${setters.join(", ")}
        WHERE ${where}
        RETURNING *
        `,
        values
      );

    return rowToRecord(
      result.rows[0]
    );
  }

  static async updateOne(
    filter,
    update
  ) {
    const record =
      await this.findOneAndUpdate(
        filter,
        update
      );

    return {
      acknowledged: true,
      matchedCount:
        record ? 1 : 0,
      modifiedCount:
        record ? 1 : 0,
    };
  }

  static find(filter) {
    return new Query(
      async ({
        sort,
        limit,
      }) => {
        const pool = getPostgresPool();
        const values = [];

        const where =
          buildWhere(
            filter,
            values
          );

        let order =
          "created_at ASC";

        if (
          sort?.leaseExpiresAt === 1
        ) {
          order =
            "lease_expires_at ASC";
        } else if (
          sort?.leaseExpiresAt === -1
        ) {
          order =
            "lease_expires_at DESC";
        }

        const safeLimit =
          Math.min(
            500,
            Math.max(
              1,
              Number(limit || 100)
            )
          );

        values.push(safeLimit);

        const result =
          await pool.query(
            `
            SELECT *
            FROM workflow.idempotency_records
            WHERE ${where}
            ORDER BY ${order}
            LIMIT $${values.length}
            `,
            values
          );

        return result.rows.map(
          rowToRecord
        );
      }
    );
  }
}

module.exports =
  PostgresIdempotencyRecord;

