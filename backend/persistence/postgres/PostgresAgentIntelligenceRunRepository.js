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
                  data.state ||
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
                  data.finalOutcome ||
                  null,

                data.summary ||
                  data.explanationTitle ||
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
    const context =
      requireScope(
        run
      );

    const identifier =
      normalizeId(
        run._id
      );

    if (
      !identifier
    ) {
      throw createError(
        "Agent intelligence run identifier is required",
        "POSTGRES_AGENT_RUN_ID_REQUIRED"
      );
    }

    return this.scope.run(
      context,
      async (
        client,
        resolved
      ) => {
        const document =
          serializeDocument(
            run
          );

        const result =
          await client.query(
            `
              UPDATE agents.intelligence_runs
              SET
                status = $1,
                phase = $2,
                confidence = $3,
                correlation_id = $4,
                correlation_group_id = $5,
                context_summary = $6::jsonb,
                agent_trace = $7::jsonb,
                budget_usage = $8::jsonb,
                security_findings = $9::jsonb,
                finding_ids = $10,
                hypothesis_ids = $11,
                contradiction_ids = $12,
                outcome = $13,
                summary = $14,
                manual_reason = $15,
                warnings = $16::jsonb,
                error = $17::jsonb,
                coordinator_version = $18,
                reasoning_provider = $19,
                model = $20,
                fallback_used = $21,
                started_at = $22,
                completed_at = $23,
                failed_at = $24,
                duration_ms = $25,
                metadata = $26::jsonb,
                document = $27::jsonb,
                updated_at = NOW()
              WHERE
                organization_id = $28
                AND environment_id = $29
                AND database_id = $30
              RETURNING *
            `,
            [
              run.status ||
                run.state ||
                "pending",

              run.phase ||
                "context_building",

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
                run.finalOutcome ||
                null,

              run.summary ||
                run.explanationTitle ||
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

              identifier,
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
    const context =
      requireScope(
        scope
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
              scope.incidentId
            );

        if (!incident) {
          return null;
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM agents.intelligence_runs
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND incident_id = $3
              ORDER BY created_at DESC
              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              resolved.environmentUuid,

              incident.id,
            ]
          );

        if (
          result.rows.length ===
          0
        ) {
          return null;
        }

        return mapRun(
          result.rows[0],
          context
        );
      },
      transaction
    );
  }
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

  if (
    typeof confidence ===
    "object"
  ) {
    if (
      typeof confidence.overall ===
      "number"
    ) {
      return confidence.overall;
    }

    if (
      typeof confidence.score ===
      "number"
    ) {
      return confidence.score;
    }

    if (
      typeof confidence.value ===
      "number"
    ) {
      return confidence.value;
    }
  }

  const parsed =
    Number(
      confidence
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : null;
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

    incidentId:
      document.incidentId ||
      normalizeId(
        context.incidentId
      ),

    tenantId:
      document.tenantId ||
      row.tenant_public_id,

    status:
      row.status,

    state:
      document.state ||
      row.status,

    phase:
      row.phase,

    confidence:
      document.confidence ??
      row.confidence,

    correlationId:
      document.correlationId ||
      row.correlation_id,

    correlationGroupId:
      document.correlationGroupId ||
      row.correlation_group_id,

    contextSummary:
      document.contextSummary ||
      row.context_summary ||
      {},

    agentTrace:
      document.agentTrace ||
      row.agent_trace ||
      [],

    budgetUsage:
      document.budgetUsage ||
      row.budget_usage ||
      {},

    securityFindings:
      document.securityFindings ||
      row.security_findings ||
      [],

    findingIds:
      document.findingIds ||
      row.finding_ids ||
      [],

    hypothesisIds:
      document.hypothesisIds ||
      row.hypothesis_ids ||
      [],

    contradictionIds:
      document.contradictionIds ||
      row.contradiction_ids ||
      [],

    outcome:
      document.outcome ||
      row.outcome,

    finalOutcome:
      document.finalOutcome ||
      row.outcome,

    summary:
      document.summary ||
      row.summary,

    explanationTitle:
      document.explanationTitle ||
      row.summary,

    manualRequired:
      Boolean(
        document.manualRequired
      ),

    manualReason:
      document.manualReason ||
      row.manual_reason,

    warnings:
      document.warnings ||
      row.warnings ||
      [],

    error:
      document.error ||
      row.error,

    learningCount:
      document.learningCount ||
      0,

    playbookExecutionId:
      document.playbookExecutionId ||
      null,

    decisionTraceSchemaVersion:
      document.decisionTraceSchemaVersion ||
      null,

    decisionTrace:
      document.decisionTrace ||
      null,

    coordinatorVersion:
      row.coordinator_version,

    reasoningProvider:
      row.reasoning_provider,

    model:
      row.model,

    fallbackUsed:
      row.fallback_used,

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