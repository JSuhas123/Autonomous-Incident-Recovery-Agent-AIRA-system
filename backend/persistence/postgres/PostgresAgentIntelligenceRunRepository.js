"use strict";

const crypto =
  require(
    "node:crypto"
  );

const AgentIntelligenceRunRepository =
  require(
    "../repositories/AgentIntelligenceRunRepository"
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

class PostgresAgentIntelligenceRunRepository
  extends AgentIntelligenceRunRepository {
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
    if (
      Array.isArray(
        data
      )
    ) {
      data =
        data[0];
    }

    const context =
      requireScope(
        data
      );

    return this.scope.run(
      context,
      async (
        client,
        resolved
      ) => {
        const incident =
          await this.scope
            .identityResolver
            .resolveIncident(
              client,
              resolved,
              data.incidentId
            );

        if (!incident) {
          throw createError(
            `Incident not found: ${data.incidentId}`,
            "POSTGRES_INCIDENT_NOT_FOUND"
          );
        }

        const databaseId =
          normalizeId(
            data._id
          ) ||
          crypto
            .randomBytes(
              12
            )
            .toString(
              "hex"
            );

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
                INSERT INTO agents.intelligence_runs (
                  public_id,
                  database_id,
                  legacy_mongo_id,
                  tenant_public_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  status,
                  phase,
                  confidence,
                  correlation_id,
                  correlation_group_id,
                  context_summary,
                  agent_trace,
                  budget_usage,
                  security_findings,
                  finding_ids,
                  hypothesis_ids,
                  contradiction_ids,
                  outcome,
                  summary,
                  manual_reason,
                  warnings,
                  error,
                  execution_authorized,
                  coordinator_version,
                  reasoning_provider,
                  model,
                  fallback_used,
                  started_at,
                  completed_at,
                  failed_at,
                  duration_ms,
                  metadata,
                  document
                )
                VALUES (
                  $1,  $2,  $3,  $4,  $5,
                  $6,  $7,  $8,  $9,  $10,
                  $11, $12, $13::jsonb, $14::jsonb, $15::jsonb,
                  $16::jsonb, $17, $18, $19, $20,
                  $21, $22, $23::jsonb, $24::jsonb, FALSE,
                  $25, $26, $27, $28, $29,
                  $30, $31, $32, $33::jsonb, $34::jsonb
                )
                RETURNING *
              `,
              [
                data.runId,

                databaseId,

                data.legacyMongoId ||
                  null,

                data.tenantId ||
                  null,

                resolved.organizationUuid,

                resolved.environmentUuid,

                incident.id,

                data.status ||
                  "pending",

                data.phase ||
                  "context_building",

                extractOverallConfidence(
                  data.confidence
                ),

                data.correlationId ||
                  null,

                data.correlationGroupId ||
                  null,

                JSON.stringify(
                  data.contextSummary ||
                  {}
                ),

                JSON.stringify(
                  data.agentTrace ||
                  []
                ),

                JSON.stringify(
                  data.budgetUsage ||
                  {}
                ),

                JSON.stringify(
                  data.securityFindings ||
                  []
                ),

                data.findingIds ||
                  [],

                data.hypothesisIds ||
                  [],

                data.contradictionIds ||
                  [],

                data.outcome ||
                  null,

                data.summary ||
                  null,

                data.manualReason ||
                  null,

                JSON.stringify(
                  data.warnings ||
                  []
                ),

                data.error ===
                  undefined
                  ? null
                  : JSON.stringify(
                      data.error
                    ),

                data.coordinatorVersion ||
                  null,

                data.reasoningProvider ||
                  null,

                data.model ||
                  null,

                Boolean(
                  data.fallbackUsed
                ),

                data.startedAt ||
                  new Date(),

                data.completedAt ||
                  null,

                data.failedAt ||
                  null,

                data.durationMs ??
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

          return mapRun(
            result.rows[0],
            context
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

  async save(
    run,
    transaction = null
  ) {
    if (
      !run?._id ||
      !run.organizationId ||
      !run.environmentId
    ) {
      throw createError(
        "PostgresAgentIntelligenceRunRepository.save() requires persisted run with scope",
        "INVALID_AGENT_INTELLIGENCE_RUN_DOCUMENT"
      );
    }

    const context = {
      organizationId:
        run.organizationId,

      environmentId:
        run.environmentId,
    };

    return this.scope.run(
      context,
      async (
        client,
        resolved
      ) => {
        let diagnosisUuid =
          null;

        if (
          run.diagnosisId
        ) {
          diagnosisUuid =
            await resolveDiagnosisUuid(
              client,
              run.diagnosisId
            );
        }

        const document =
          serializeDocument(
            run
          );

        const result =
          await client.query(
            `
              UPDATE agents.intelligence_runs
              SET
                diagnosis_id = $1,
                status = $2,
                phase = $3,
                confidence = $4,
                correlation_id = $5,
                correlation_group_id = $6,
                context_summary = $7::jsonb,
                agent_trace = $8::jsonb,
                budget_usage = $9::jsonb,
                security_findings = $10::jsonb,
                finding_ids = $11,
                hypothesis_ids = $12,
                contradiction_ids = $13,
                outcome = $14,
                summary = $15,
                manual_reason = $16,
                warnings = $17::jsonb,
                error = $18::jsonb,
                coordinator_version = $19,
                reasoning_provider = $20,
                model = $21,
                fallback_used = $22,
                started_at = $23,
                completed_at = $24,
                failed_at = $25,
                duration_ms = $26,
                metadata = $27::jsonb,
                document = $28::jsonb
              WHERE
                organization_id = $29
                AND environment_id = $30
                AND (
                  database_id = $31
                  OR legacy_mongo_id = $31
                  OR id::text = $31
                )
              RETURNING *
            `,
            [
              diagnosisUuid,

              run.status,

              run.phase,

              extractOverallConfidence(
                run.confidence
              ),

              run.correlationId ||
                null,

              run.correlationGroupId ||
                null,

              JSON.stringify(
                run.contextSummary ||
                {}
              ),

              JSON.stringify(
                run.agentTrace ||
                []
              ),

              JSON.stringify(
                run.budgetUsage ||
                {}
              ),

              JSON.stringify(
                run.securityFindings ||
                []
              ),

              run.findingIds ||
                [],

              run.hypothesisIds ||
                [],

              run.contradictionIds ||
                [],

              run.outcome ||
                null,

              run.summary ||
                null,

              run.manualReason ||
                null,

              JSON.stringify(
                run.warnings ||
                []
              ),

              run.error ===
                undefined
                ? null
                : JSON.stringify(
                    run.error
                  ),

              run.coordinatorVersion ||
                null,

              run.reasoningProvider ||
                null,

              run.model ||
                null,

              Boolean(
                run.fallbackUsed
              ),

              run.startedAt ||
                null,

              run.completedAt ||
                null,

              run.failedAt ||
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
              context
            )
          : null;
      },
      transaction
    );
  }

  async findLatestForIncident(
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
          await this.scope
            .identityResolver
            .resolveIncident(
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
              SELECT
                created_at,
                status,
                completed_at
              FROM agents.intelligence_runs
              WHERE incident_id = $1
              ORDER BY created_at DESC
              LIMIT 1
            `,
            [
              incident.id,
            ]
          );

        if (
          result.rows.length ===
          0
        ) {
          return null;
        }

        return {
          createdAt:
            result.rows[0]
              .created_at,

          status:
            result.rows[0]
              .status,

          completedAt:
            result.rows[0]
              .completed_at,
        };
      },
      transaction
    );
  }
}

async function resolveDiagnosisUuid(
  client,
  identifier
) {
  const normalized =
    normalizeId(
      identifier
    );

  const result =
    await client.query(
      `
        SELECT id
        FROM incidents.diagnoses
        WHERE
          database_id = $1
          OR public_id = $1
          OR legacy_mongo_id = $1
          OR id::text = $1
        LIMIT 1
      `,
      [
        normalized,
      ]
    );

  return result.rows[0]
    ?.id ||
    null;
}

function extractOverallConfidence(
  confidence
) {
  if (
    confidence ===
      null ||
    confidence ===
      undefined
  ) {
    return null;
  }

  if (
    typeof confidence ===
    "number"
  ) {
    return confidence;
  }

  return confidence
    .overallConfidence ??
    confidence.score ??
    null;
}

function mapRun(
  row,
  context
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
      document.organizationId ||
      normalizeId(
        context.organizationId
      ),

    environmentId:
      document.environmentId ||
      normalizeId(
        context.environmentId
      ),

    tenantId:
      row.tenant_public_id,

    status:
      row.status,

    phase:
      row.phase,

    diagnosisId:
      document.diagnosisId ||
      null,

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,

    failedAt:
      row.failed_at,

    durationMs:
      row.duration_ms,

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    executionAuthorized:
      false,
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
    throw createError(
      "Agent intelligence PostgreSQL operation requires organizationId, environmentId and incidentId",
      "POSTGRES_AGENT_RUN_SCOPE_REQUIRED"
    );
  }

  return value;
}

function createError(
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
  PostgresAgentIntelligenceRunRepository;