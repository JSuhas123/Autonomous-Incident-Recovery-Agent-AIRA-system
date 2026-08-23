"use strict";

const crypto =
  require(
    "node:crypto"
  );

const RecoveryDecisionRepository =
  require(
    "../repositories/RecoveryDecisionRepository"
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

class PostgresRecoveryDecisionRepository
  extends RecoveryDecisionRepository {
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

  async createRun(
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
          await this.resolveIncident(
            client,
            resolved,
            data.incidentId
          );

        const diagnosisUuid =
          data.diagnosisId
            ? await resolveDiagnosisUuid(
                client,
                data.diagnosisId
              )
            : null;

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
                INSERT INTO execution.recovery_decision_runs (
                  public_id,
                  database_id,
                  legacy_mongo_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  diagnosis_id,
                  diagnosis_revision,
                  status,
                  decision_type,
                  selected_candidate_id,
                  selected_playbook_id,
                  confidence,
                  stage_trace,
                  candidate_snapshot,
                  critic_result,
                  error,
                  execution_authorized,
                  metadata,
                  started_at,
                  completed_at,
                  duration_ms,
                  document
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8, $9, $10,
                  $11, $12, $13, $14::jsonb, $15::jsonb,
                  $16::jsonb, $17::jsonb, FALSE, $18::jsonb, $19,
                  $20, $21, $22::jsonb
                )
                RETURNING *
              `,
              [
                data.runId,

                databaseId,

                data.legacyMongoId ||
                  null,

                resolved.organizationUuid,

                resolved.environmentUuid,

                incident.id,

                diagnosisUuid,

                data.diagnosisRevision ??
                  null,

                data.status ||
                  "running",

                data.decisionType ||
                  null,

                data.selectedCandidateId ||
                  null,

                data.selectedPlaybookId ||
                  null,

                data.confidence ??
                  0,

                JSON.stringify(
                  data.stageTrace ||
                  []
                ),

                JSON.stringify(
                  data.candidateSnapshot ||
                  []
                ),

                JSON.stringify(
                  data.criticResult ||
                  {}
                ),

                data.error ===
                  undefined ||
                data.error ===
                  null
                  ? null
                  : JSON.stringify(
                      data.error
                    ),

                JSON.stringify(
                  data.metadata ||
                  {}
                ),

                data.startedAt ||
                  new Date(),

                data.completedAt ||
                  null,

                data.durationMs ??
                  null,

                JSON.stringify(
                  document
                ),
              ]
            );

          return mapRun(
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

  async findCurrent(
    scope,
    transaction = null
  ) {
    requireScope(
      scope
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

        const result =
          await client.query(
            `
              SELECT *
              FROM execution.recovery_decisions
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND incident_id = $3
                AND is_current = TRUE
              ORDER BY revision DESC
              LIMIT 1
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
              incident.id,
            ]
          );

        return result.rows[0]
          ? mapDecision(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  async findByIdentifier(
    scope,
    identifier,
    transaction = null
  ) {
    requireScope(
      scope
    );

    const normalized =
      normalizeId(
        identifier
      );

    if (!normalized) {
      return null;
    }

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

        const result =
          await client.query(
            `
              SELECT *
              FROM execution.recovery_decisions
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND incident_id = $3
                AND (
                  public_id = $4
                  OR database_id = $4
                  OR legacy_mongo_id = $4
                  OR id::text = $4
                )
              ORDER BY revision DESC
              LIMIT 1
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
              incident.id,
              normalized,
            ]
          );

        return result.rows[0]
          ? mapDecision(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  async findHistory(
    scope,
    options = {},
    transaction = null
  ) {
    requireScope(
      scope
    );

    const limit =
      Math.min(
        100,
        Math.max(
          1,
          Number(
            options.limit ||
            20
          )
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

        const result =
          await client.query(
            `
              SELECT *
              FROM execution.recovery_decisions
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND incident_id = $3
              ORDER BY revision DESC
              LIMIT $4
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
              incident.id,
              limit,
            ]
          );

        return result.rows.map(
          (row) =>
            mapDecision(
              row,
              scope
            )
        );
      },
      transaction
    );
  }

  async findRunByIdentifier(
    scope,
    identifier,
    transaction = null
  ) {
    requireScope(
      scope
    );

    const normalized =
      normalizeId(
        identifier
      );

    if (!normalized) {
      return null;
    }

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

        const result =
          await client.query(
            `
              SELECT *
              FROM execution.recovery_decision_runs
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND incident_id = $3
                AND (
                  public_id = $4
                  OR database_id = $4
                  OR legacy_mongo_id = $4
                  OR id::text = $4
                )
              ORDER BY created_at DESC
              LIMIT 1
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
              incident.id,
              normalized,
            ]
          );

        return result.rows[0]
          ? mapRun(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  async createDecision(
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
          await this.resolveIncident(
            client,
            resolved,
            data.incidentId
          );

        const diagnosisUuid =
          data.diagnosisId
            ? await resolveDiagnosisUuid(
                client,
                data.diagnosisId
              )
            : null;

        const runUuid =
          data.runId
            ? await resolveRunUuid(
                client,
                data.runId
              )
            : null;

        const supersedesUuid =
          data.supersedesDecisionId
            ? await resolveDecisionUuid(
                client,
                data.supersedesDecisionId
              )
            : null;

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
                INSERT INTO execution.recovery_decisions (
                  public_id,
                  database_id,
                  legacy_mongo_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  diagnosis_id,
                  diagnosis_revision,
                  run_id,
                  revision,
                  is_current,
                  status,
                  decision,
                  selected_candidate_id,
                  selected_playbook_id,
                  confidence,
                  candidates,
                  rejected_candidates,
                  reasons,
                  unknowns,
                  policy_status,
                  risk_level,
                  approval_required,
                  approval_mode,
                  rollback_available,
                  reversibility,
                  critic_result,
                  supersedes_decision_id,
                  execution_authorized,
                  generated_at,
                  metadata,
                  document
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8, $9, $10,
                  $11, $12, $13, $14, $15,
                  $16, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb,
                  $21, $22, $23, $24, $25,
                  $26, $27::jsonb, $28, FALSE, $29,
                  $30::jsonb, $31::jsonb
                )
                RETURNING *
              `,
              [
                data.decisionId,

                databaseId,

                data.legacyMongoId ||
                  null,

                resolved.organizationUuid,

                resolved.environmentUuid,

                incident.id,

                diagnosisUuid,

                data.diagnosisRevision ??
                  null,

                runUuid,

                data.revision,

                data.isCurrent !==
                  false,

                data.status ||
                  "current",

                data.decision,

                data.selectedCandidateId ||
                  null,

                data.selectedPlaybookId ||
                  null,

                data.confidence ??
                  0,

                JSON.stringify(
                  data.candidates ||
                  []
                ),

                JSON.stringify(
                  data.rejectedCandidates ||
                  []
                ),

                JSON.stringify(
                  data.reasons ||
                  []
                ),

                JSON.stringify(
                  data.unknowns ||
                  []
                ),

                data.policyStatus ||
                  null,

                data.riskLevel ||
                  null,

                Boolean(
                  data.approvalRequired
                ),

                data.approvalMode ||
                  null,

                Boolean(
                  data.rollbackAvailable
                ),

                data.reversibility ||
                  null,

                JSON.stringify(
                  data.criticResult ||
                  {}
                ),

                supersedesUuid,

                data.generatedAt ||
                  new Date(),

                JSON.stringify(
                  data.metadata ||
                  {}
                ),

                JSON.stringify(
                  document
                ),
              ]
            );

          return mapDecision(
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

  async saveDecision(
    decision,
    transaction = null
  ) {
    assertPersisted(
      decision,
      "INVALID_RECOVERY_DECISION_DOCUMENT"
    );

    const scope = {
      organizationId:
        decision.organizationId,

      environmentId:
        decision.environmentId,

      incidentId:
        decision.incidentId,
    };

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const supersedesUuid =
          decision.supersedesDecisionId
            ? await resolveDecisionUuid(
                client,
                decision.supersedesDecisionId
              )
            : null;

        const supersededByUuid =
          decision.supersededByDecisionId
            ? await resolveDecisionUuid(
                client,
                decision.supersededByDecisionId
              )
            : null;

        const document =
          serializeDocument({
            ...decision,

            executionAuthorized:
              false,
          });

        const result =
          await client.query(
            `
              UPDATE execution.recovery_decisions
              SET
                is_current = $1,
                status = $2,
                decision = $3,
                selected_candidate_id = $4,
                selected_playbook_id = $5,
                confidence = $6,
                candidates = $7::jsonb,
                rejected_candidates = $8::jsonb,
                reasons = $9::jsonb,
                unknowns = $10::jsonb,
                policy_status = $11,
                risk_level = $12,
                approval_required = $13,
                approval_mode = $14,
                rollback_available = $15,
                reversibility = $16,
                critic_result = $17::jsonb,
                supersedes_decision_id = $18,
                superseded_by_decision_id = $19,
                generated_at = $20,
                metadata = $21::jsonb,
                document = $22::jsonb,
                execution_authorized = FALSE
              WHERE
                organization_id = $23
                AND environment_id = $24
                AND (
                  database_id = $25
                  OR public_id = $25
                  OR legacy_mongo_id = $25
                  OR id::text = $25
                )
              RETURNING *
            `,
            [
              decision.isCurrent !==
                false,

              decision.status,

              decision.decision,

              decision.selectedCandidateId ||
                null,

              decision.selectedPlaybookId ||
                null,

              decision.confidence ??
                0,

              JSON.stringify(
                decision.candidates ||
                []
              ),

              JSON.stringify(
                decision.rejectedCandidates ||
                []
              ),

              JSON.stringify(
                decision.reasons ||
                []
              ),

              JSON.stringify(
                decision.unknowns ||
                []
              ),

              decision.policyStatus ||
                null,

              decision.riskLevel ||
                null,

              Boolean(
                decision.approvalRequired
              ),

              decision.approvalMode ||
                null,

              Boolean(
                decision.rollbackAvailable
              ),

              decision.reversibility ||
                null,

              JSON.stringify(
                decision.criticResult ||
                {}
              ),

              supersedesUuid,

              supersededByUuid,

              decision.generatedAt ||
                null,

              JSON.stringify(
                decision.metadata ||
                {}
              ),

              JSON.stringify(
                document
              ),

              resolved.organizationUuid,

              resolved.environmentUuid,

              normalizeId(
                decision._id
              ),
            ]
          );

        return result.rows[0]
          ? mapDecision(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  async saveRun(
    run,
    transaction = null
  ) {
    assertPersisted(
      run,
      "INVALID_RECOVERY_DECISION_RUN_DOCUMENT"
    );

    const scope = {
      organizationId:
        run.organizationId,

      environmentId:
        run.environmentId,

      incidentId:
        run.incidentId,
    };

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const decisionUuid =
          run.decisionId
            ? await resolveDecisionUuid(
                client,
                run.decisionId
              )
            : null;

        const document =
          serializeDocument({
            ...run,

            executionAuthorized:
              false,
          });

        const result =
          await client.query(
            `
              UPDATE execution.recovery_decision_runs
              SET
                decision_id = $1,
                status = $2,
                decision_type = $3,
                selected_candidate_id = $4,
                selected_playbook_id = $5,
                confidence = $6,
                stage_trace = $7::jsonb,
                candidate_snapshot = $8::jsonb,
                critic_result = $9::jsonb,
                error = $10::jsonb,
                started_at = $11,
                completed_at = $12,
                duration_ms = $13,
                metadata = $14::jsonb,
                document = $15::jsonb,
                execution_authorized = FALSE
              WHERE
                organization_id = $16
                AND environment_id = $17
                AND (
                  database_id = $18
                  OR public_id = $18
                  OR legacy_mongo_id = $18
                  OR id::text = $18
                )
              RETURNING *
            `,
            [
              decisionUuid,

              run.status,

              run.decisionType ||
                null,

              run.selectedCandidateId ||
                null,

              run.selectedPlaybookId ||
                null,

              run.confidence ??
                0,

              JSON.stringify(
                run.stageTrace ||
                []
              ),

              JSON.stringify(
                run.candidateSnapshot ||
                []
              ),

              JSON.stringify(
                run.criticResult ||
                {}
              ),

              run.error == null
                ? null
                : JSON.stringify(
                    run.error
                  ),

              run.startedAt ||
                null,

              run.completedAt ||
                null,

              run.durationMs ??
                null,

              JSON.stringify(
                run.metadata ||
                {}
              ),

              JSON.stringify(
                document
              ),

              resolved.organizationUuid,

              resolved.environmentUuid,

              normalizeId(
                run._id
              ),
            ]
          );

        return result.rows[0]
          ? mapRun(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }

  async resolveIncident(
    client,
    resolved,
    incidentId
  ) {
    const incident =
      await this.scope
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
}

async function resolveDiagnosisUuid(
  client,
  identifier
) {
  return resolveUuid(
    client,
    "incidents.diagnoses",
    identifier
  );
}

async function resolveRunUuid(
  client,
  identifier
) {
  return resolveUuid(
    client,
    "execution.recovery_decision_runs",
    identifier
  );
}

async function resolveDecisionUuid(
  client,
  identifier
) {
  return resolveUuid(
    client,
    "execution.recovery_decisions",
    identifier
  );
}

async function resolveUuid(
  client,
  table,
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
        FROM ${table}
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

  return result.rows[0]
    ?.id ||
    null;
}

function mapRun(
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

    runId:
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

    decisionId:
      document.decisionId ||
      null,

    status:
      row.status,

    completedAt:
      row.completed_at,

    durationMs:
      row.duration_ms,

    executionAuthorized:
      false,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

function mapDecision(
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

    decisionId:
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

    revision:
      row.revision,

    isCurrent:
      row.is_current,

    status:
      row.status,

    decision:
      row.decision,

    supersedesDecisionId:
      document.supersedesDecisionId ||
      null,

    supersededByDecisionId:
      document.supersededByDecisionId ||
      null,

    executionAuthorized:
      false,

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
    !value.environmentId ||
    !value.incidentId
  ) {
    throw Object.assign(
      new Error(
        "RecoveryDecision PostgreSQL operation requires organizationId, environmentId and incidentId"
      ),
      {
        code:
          "POSTGRES_RECOVERY_DECISION_SCOPE_REQUIRED",
      }
    );
  }

  return value;
}

function assertPersisted(
  value,
  code
) {
  if (
    !value?._id ||
    !value.organizationId ||
    !value.environmentId
  ) {
    throw Object.assign(
      new Error(
        "Persisted recovery document and scope are required"
      ),
      {
        code,
      }
    );
  }
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
  PostgresRecoveryDecisionRepository;