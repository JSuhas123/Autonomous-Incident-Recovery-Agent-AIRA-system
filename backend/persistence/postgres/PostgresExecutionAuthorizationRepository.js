"use strict";

const crypto =
  require(
    "node:crypto"
  );

const ExecutionAuthorizationRepository =
  require(
    "../repositories/ExecutionAuthorizationRepository"
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

class PostgresExecutionAuthorizationRepository
  extends ExecutionAuthorizationRepository {
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

  async createAuthorization(
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

        const recoveryDecision =
          await resolveRecoveryDecision(
            client,
            data.recoveryDecisionId
          );

        if (!recoveryDecision) {
          throw Object.assign(
            new Error(
              `Recovery decision not found: ${data.recoveryDecisionId}`
            ),
            {
              code:
                "POSTGRES_RECOVERY_DECISION_NOT_FOUND",
            }
          );
        }

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
          });

        try {
          const result =
            await client.query(
              `
                INSERT INTO execution.authorizations (
                  public_id,
                  database_id,
                  legacy_mongo_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  recovery_decision_id,
                  recovery_decision_revision,
                  selected_candidate_id,
                  selected_playbook_id,
                  decision,
                  status,
                  authorization_granted,
                  approval_state,
                  policy_state,
                  freshness_state,
                  kill_switch_state,
                  lock_state,
                  idempotency_state,
                  valid_from,
                  expires_at,
                  authorized_at,
                  reasons,
                  warnings,
                  execution_plan,
                  plan_id,
                  plan_hash,
                  idempotency_key,
                  lease_key,
                  lease_owner_id,
                  stage_trace,
                  critic_result,
                  consumed_at,
                  revoked_at,
                  revoked_reason,
                  metadata,
                  document
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8, $9, $10,
                  $11, $12, $13, $14::jsonb, $15::jsonb,
                  $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20,
                  $21, $22, $23::jsonb, $24::jsonb, $25::jsonb,
                  $26, $27, $28, $29, $30,
                  $31::jsonb, $32::jsonb, $33, $34, $35,
                  $36::jsonb, $37::jsonb
                )
                RETURNING *
              `,
              [
                data.authorizationId,

                databaseId,

                data.legacyMongoId ||
                  null,

                resolved.organizationUuid,

                resolved.environmentUuid,

                incident.id,

                recoveryDecision.id,

                data.recoveryDecisionRevision ??
                  null,

                data.selectedCandidateId ||
                  null,

                data.selectedPlaybookId ||
                  null,

                data.decision,

                data.status,

                Boolean(
                  data.authorizationGranted
                ),

                jsonScalar(
                  data.approvalState
                ),

                jsonScalar(
                  data.policyState
                ),

                jsonScalar(
                  data.freshnessState
                ),

                jsonScalar(
                  data.killSwitchState
                ),

                jsonScalar(
                  data.lockState
                ),

                jsonScalar(
                  data.idempotencyState
                ),

                data.validFrom ||
                  null,

                data.expiresAt ||
                  null,

                data.authorizedAt ||
                  null,

                JSON.stringify(
                  data.reasons ||
                  []
                ),

                JSON.stringify(
                  data.warnings ||
                  []
                ),

                data.executionPlan == null
                  ? null
                  : JSON.stringify(
                      data.executionPlan
                    ),

                data.planId ||
                  null,

                data.planHash ||
                  null,

                data.idempotencyKey ||
                  null,

                data.leaseKey ||
                  null,

                data.leaseOwnerId ||
                  null,

                JSON.stringify(
                  data.stageTrace ||
                  []
                ),

                JSON.stringify(
                  data.criticResult ||
                  {}
                ),

                data.consumedAt ||
                  null,

                data.revokedAt ||
                  null,

                data.revokedReason ||
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

          return mapAuthorization(
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

  async createExecutionRequest(
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

        const authorization =
          await resolveAuthorization(
            client,
            data.authorizationId
          );

        if (!authorization) {
          throw Object.assign(
            new Error(
              `Execution authorization not found: ${data.authorizationId}`
            ),
            {
              code:
                "POSTGRES_EXECUTION_AUTHORIZATION_NOT_FOUND",
            }
          );
        }

        const recoveryDecision =
          await resolveRecoveryDecision(
            client,
            data.recoveryDecisionId
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
          });

        try {
          const result =
            await client.query(
              `
                INSERT INTO execution.execution_requests (
                  public_id,
                  database_id,
                  legacy_mongo_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  authorization_id,
                  recovery_decision_id,
                  recovery_decision_revision,
                  candidate_id,
                  playbook_id,
                  state,
                  plan_id,
                  plan_hash,
                  execution_plan,
                  idempotency_key,
                  lock_key,
                  lease_owner_id,
                  attempt,
                  max_attempts,
                  requested_at,
                  queued_at,
                  started_at,
                  completed_at,
                  cancelled_at,
                  failure,
                  result,
                  rollback,
                  metadata,
                  document
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8, $9, $10,
                  $11, $12, $13, $14, $15::jsonb,
                  $16, $17, $18, $19, $20,
                  $21, $22, $23, $24, $25,
                  $26::jsonb, $27::jsonb, $28::jsonb, $29::jsonb, $30::jsonb
                )
                RETURNING *
              `,
              [
                data.executionRequestId,

                databaseId,

                data.legacyMongoId ||
                  null,

                resolved.organizationUuid,

                resolved.environmentUuid,

                incident.id,

                authorization.id,

                recoveryDecision
                  ?.id ||
                null,

                data.recoveryDecisionRevision ??
                  null,

                data.candidateId ||
                  null,

                data.playbookId,

                data.state,

                data.planId ||
                  null,

                data.planHash ||
                  null,

                JSON.stringify(
                  data.executionPlan ||
                  {}
                ),

                data.idempotencyKey,

                data.lockKey ||
                  null,

                data.leaseOwnerId ||
                  null,

                Number(
                  data.attempt ||
                  0
                ),

                Number(
                  data.maxAttempts ||
                  1
                ),

                data.requestedAt ||
                  new Date(),

                data.queuedAt ||
                  null,

                data.startedAt ||
                  null,

                data.completedAt ||
                  null,

                data.cancelledAt ||
                  null,

                data.failure == null
                  ? null
                  : JSON.stringify(
                      data.failure
                    ),

                data.result == null
                  ? null
                  : JSON.stringify(
                      data.result
                    ),

                data.rollback == null
                  ? null
                  : JSON.stringify(
                      data.rollback
                    ),

                JSON.stringify(
                  data.metadata ||
                  {}
                ),

                JSON.stringify(
                  document
                ),
              ]
            );

          return mapExecutionRequest(
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
}

async function resolveRecoveryDecision(
  client,
  identifier
) {
  const id =
    normalizeId(
      identifier
    );

  const result =
    await client.query(
      `
        SELECT id
        FROM execution.recovery_decisions
        WHERE
          public_id = $1
          OR database_id = $1
          OR legacy_mongo_id = $1
          OR id::text = $1
        LIMIT 1
      `,
      [
        id,
      ]
    );

  return result.rows[0] ||
    null;
}

async function resolveAuthorization(
  client,
  identifier
) {
  const id =
    normalizeId(
      identifier
    );

  const result =
    await client.query(
      `
        SELECT id
        FROM execution.authorizations
        WHERE
          public_id = $1
          OR database_id = $1
          OR legacy_mongo_id = $1
          OR id::text = $1
        LIMIT 1
      `,
      [
        id,
      ]
    );

  return result.rows[0] ||
    null;
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

function mapAuthorization(
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
      row.legacy_mongo_id ||
      row.id,

    authorizationId:
      row.public_id,

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

    authorizationGranted:
      row.authorization_granted,

    status:
      row.status,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

function mapExecutionRequest(
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
      row.legacy_mongo_id ||
      row.id,

    executionRequestId:
      row.public_id,

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

    state:
      row.state,

    requestedAt:
      row.requested_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

function jsonScalar(
  value
) {
  return value == null
    ? null
    : JSON.stringify(
        value
      );
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
        "Execution persistence requires organizationId, environmentId and incidentId"
      ),
      {
        code:
          "POSTGRES_EXECUTION_SCOPE_REQUIRED",
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
  PostgresExecutionAuthorizationRepository;