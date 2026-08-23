"use strict";

const IncidentLifecycleRepository =
  require(
    "../repositories/IncidentLifecycleRepository"
  );

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );

const {
  normalizeId,
  serializeDocument,
} =
  require(
    "./postgresDomainMapper"
  );

class PostgresIncidentLifecycleRepository
  extends IncidentLifecycleRepository {
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

  async findCurrent(
    scope,
    transaction = null
  ) {
    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const incident =
          await this.resolveIncident(
            client,
            resolved,
            scope.incidentId
          );

        if (!incident) {
          return null;
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM incidents.incident_lifecycle
              WHERE incident_id = $1
              LIMIT 1
            `,
            [
              incident.id,
            ]
          );

        return result.rows[0]
          ? mapLifecycle(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  async createTransition(
    transition,
    transaction = null
  ) {
    return this.scope.run(
      transition,
      async (
        client,
        resolved
      ) => {
        const incident =
          await this.resolveIncident(
            client,
            resolved,
            transition.incidentId
          );

        if (!incident) {
          throw Object.assign(
            new Error(
              `Incident not found: ${transition.incidentId}`
            ),
            {
              code:
                "POSTGRES_INCIDENT_NOT_FOUND",
            }
          );
        }

        const result =
          await client.query(
            `
              INSERT INTO incidents.incident_lifecycle_transitions (
                public_id,
                organization_id,
                environment_id,
                incident_id,
                revision,
                from_state,
                to_state,
                reason,
                actor,
                source,
                verification_id,
                recovery_decision_id,
                execution_request_id,
                retry_request_id,
                rollback_request_id,
                escalation_id,
                metadata,
                transitioned_at
              )
              VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9::jsonb, $10::jsonb,
                $11, $12, $13, $14, $15,
                $16, $17::jsonb, $18
              )
              RETURNING *
            `,
            [
              transition.transitionId,

              resolved.organizationUuid,

              resolved.environmentUuid,

              incident.id,

              transition.revision,

              transition.fromState,

              transition.toState,

              transition.reason ||
                null,

              JSON.stringify(
                transition.actor ||
                {}
              ),

              JSON.stringify(
                transition.source ||
                {}
              ),

              transition.verificationId ||
                null,

              transition.recoveryDecisionId ||
                null,

              transition.executionRequestId ||
                null,

              transition.retryRequestId ||
                null,

              transition.rollbackRequestId ||
                null,

              transition.escalationId ||
                null,

              JSON.stringify(
                transition.metadata ||
                {}
              ),

              transition.transitionedAt ||
                new Date(),
            ]
          );

        return mapTransition(
          result.rows[0],
          transition
        );
      },
      transaction
    );
  }

  async upsertCurrent(
    scope,
    update,
    transaction = null
  ) {
    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const incident =
          await this.resolveIncident(
            client,
            resolved,
            scope.incidentId
          );

        if (!incident) {
          throw Object.assign(
            new Error(
              `Incident not found: ${scope.incidentId}`
            ),
            {
              code:
                "POSTGRES_INCIDENT_NOT_FOUND",
            }
          );
        }

        const result =
          await client.query(
            `
              INSERT INTO incidents.incident_lifecycle (
                organization_id,
                environment_id,
                incident_id,
                lifecycle_state,
                revision,
                verification_id,
                recovery_decision_id,
                execution_request_id,
                retry_request_id,
                rollback_request_id,
                escalation_id,
                stability_observation,
                closure_eligibility,
                latest_transition,
                last_reason,
                resolved_at,
                closed_at,
                regressed_at,
                escalated_at,
                metadata
              )
              VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12::jsonb, $13::jsonb, $14::jsonb, $15,
                $16, $17, $18, $19, $20::jsonb
              )
              ON CONFLICT (
                organization_id,
                environment_id,
                incident_id
              )
              DO UPDATE SET
                lifecycle_state =
                  EXCLUDED.lifecycle_state,
                revision =
                  EXCLUDED.revision,
                verification_id =
                  EXCLUDED.verification_id,
                recovery_decision_id =
                  EXCLUDED.recovery_decision_id,
                execution_request_id =
                  EXCLUDED.execution_request_id,
                retry_request_id =
                  EXCLUDED.retry_request_id,
                rollback_request_id =
                  EXCLUDED.rollback_request_id,
                escalation_id =
                  EXCLUDED.escalation_id,
                stability_observation =
                  EXCLUDED.stability_observation,
                closure_eligibility =
                  EXCLUDED.closure_eligibility,
                latest_transition =
                  EXCLUDED.latest_transition,
                last_reason =
                  EXCLUDED.last_reason,
                resolved_at =
                  EXCLUDED.resolved_at,
                closed_at =
                  EXCLUDED.closed_at,
                regressed_at =
                  EXCLUDED.regressed_at,
                escalated_at =
                  EXCLUDED.escalated_at,
                metadata =
                  EXCLUDED.metadata
              RETURNING *
            `,
            lifecycleValues(
              resolved,
              incident.id,
              update
            )
          );

        return mapLifecycle(
          result.rows[0],
          scope
        );
      },
      transaction
    );
  }

  async updateCurrent(
    scope,
    update,
    transaction = null
  ) {
    const existing =
      await this.findCurrent(
        scope,
        transaction
      );

    if (!existing) {
      return null;
    }

    return this.upsertCurrent(
      scope,
      {
        ...existing,
        ...update,

        metadata: {
          ...(
            existing.metadata ||
            {}
          ),

          ...(
            update.metadata ||
            {}
          ),
        },
      },
      transaction
    );
  }

  async getHistory(
    scope,
    limit = 100,
    transaction = null
  ) {
    const safeLimit =
      Math.min(
        500,
        Math.max(
          1,
          Number(
            limit
          ) ||
          100
        )
      );

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const incident =
          await this.resolveIncident(
            client,
            resolved,
            scope.incidentId
          );

        if (!incident) {
          return [];
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM incidents.incident_lifecycle_transitions
              WHERE incident_id = $1
              ORDER BY revision ASC
              LIMIT $2
            `,
            [
              incident.id,
              safeLimit,
            ]
          );

        return result.rows.map(
          (
            row
          ) =>
            mapTransition(
              row,
              scope
            )
        );
      },
      transaction
    );
  }

  async resolveIncident(
    client,
    resolved,
    incidentId
  ) {
    return this.scope
      .identityResolver
      .resolveIncident(
        client,
        resolved,
        incidentId
      );
  }
}

function lifecycleValues(
  resolved,
  incidentUuid,
  update
) {
  return [
    resolved.organizationUuid,

    resolved.environmentUuid,

    incidentUuid,

    update.lifecycleState,

    update.revision ||
      1,

    update.verificationId ||
      null,

    update.recoveryDecisionId ||
      null,

    update.executionRequestId ||
      null,

    update.retryRequestId ||
      null,

    update.rollbackRequestId ||
      null,

    update.escalationId ||
      null,

    update.stabilityObservation ===
      undefined
      ? null
      : JSON.stringify(
          serializeDocument(
            update.stabilityObservation
          )
        ),

    update.closureEligibility ===
      undefined
      ? null
      : JSON.stringify(
          serializeDocument(
            update.closureEligibility
          )
        ),

    update.latestTransition ===
      undefined
      ? null
      : JSON.stringify(
          serializeDocument(
            update.latestTransition
          )
        ),

    update.lastReason ||
      null,

    update.resolvedAt ||
      null,

    update.closedAt ||
      null,

    update.regressedAt ||
      null,

    update.escalatedAt ||
      null,

    JSON.stringify(
      update.metadata ||
      {}
    ),
  ];
}

function mapLifecycle(
  row,
  scope
) {
  return {
    _id:
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
      normalizeId(
        scope.incidentId
      ),

    lifecycleState:
      row.lifecycle_state,

    revision:
      row.revision,

    verificationId:
      row.verification_id,

    recoveryDecisionId:
      row.recovery_decision_id,

    executionRequestId:
      row.execution_request_id,

    retryRequestId:
      row.retry_request_id,

    rollbackRequestId:
      row.rollback_request_id,

    escalationId:
      row.escalation_id,

    stabilityObservation:
      row.stability_observation,

    closureEligibility:
      row.closure_eligibility,

    latestTransition:
      row.latest_transition,

    lastReason:
      row.last_reason,

    resolvedAt:
      row.resolved_at,

    closedAt:
      row.closed_at,

    regressedAt:
      row.regressed_at,

    escalatedAt:
      row.escalated_at,

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

function mapTransition(
  row,
  scope
) {
  return {
    _id:
      row.id,

    transitionId:
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
      normalizeId(
        scope.incidentId
      ),

    revision:
      row.revision,

    fromState:
      row.from_state,

    toState:
      row.to_state,

    reason:
      row.reason,

    actor:
      row.actor ||
      {},

    source:
      row.source ||
      {},

    verificationId:
      row.verification_id,

    recoveryDecisionId:
      row.recovery_decision_id,

    executionRequestId:
      row.execution_request_id,

    retryRequestId:
      row.retry_request_id,

    rollbackRequestId:
      row.rollback_request_id,

    escalationId:
      row.escalation_id,

    metadata:
      row.metadata ||
      {},

    transitionedAt:
      row.transitioned_at,

    createdAt:
      row.created_at,
  };
}

module.exports =
  PostgresIncidentLifecycleRepository;