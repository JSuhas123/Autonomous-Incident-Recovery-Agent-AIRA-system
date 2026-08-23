"use strict";

const crypto =
  require(
    "node:crypto"
  );

const IncidentDiagnosisRepository =
  require(
    "../repositories/IncidentDiagnosisRepository"
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

class PostgresIncidentDiagnosisRepository
  extends IncidentDiagnosisRepository {
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
              FROM incidents.diagnoses
              WHERE
                incident_id = $1
                AND is_current = TRUE
              ORDER BY revision DESC
              LIMIT 1
            `,
            [
              incident.id,
            ]
          );

        return result.rows[0]
          ? mapDiagnosis(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
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

        const runUuid =
          data.runId
            ? await resolveRunUuid(
                client,
                data.runId
              )
            : null;

        const previousUuid =
          data.supersedesDiagnosisId
            ? await resolveDiagnosisUuid(
                client,
                data.supersedesDiagnosisId
              )
            : null;

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
                INSERT INTO incidents.diagnoses (
                  public_id,
                  database_id,
                  legacy_mongo_id,
                  tenant_public_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  intelligence_run_id,
                  revision,
                  is_current,
                  status,
                  confidence,
                  correlation_id,
                  correlation_group_id,
                  run_external_id,
                  outcome,
                  title,
                  summary,
                  probable_root_cause,
                  root_cause_category,
                  symptoms,
                  findings,
                  hypotheses,
                  primary_hypothesis_id,
                  contradictions,
                  unresolved_questions,
                  unknowns,
                  false_positive_suspected,
                  evidence_summary,
                  impact_snapshot,
                  risk,
                  recommended_next_step,
                  previous_diagnosis_id,
                  execution_authorized,
                  analysis_started_at,
                  analysis_completed_at,
                  coordinator_version,
                  reasoning_provider,
                  model,
                  fallback_used,
                  metadata,
                  document
                )
                VALUES (
                  $1,  $2,  $3,  $4,  $5,
                  $6,  $7,  $8,  $9,  $10,
                  $11, $12, $13, $14, $15,
                  $16, $17, $18, $19, $20,
                  $21::jsonb, $22::jsonb, $23::jsonb, $24, $25::jsonb,
                  $26::jsonb, $27::jsonb, $28, $29::jsonb, $30::jsonb,
                  $31::jsonb, $32::jsonb, $33, FALSE, $34,
                  $35, $36, $37, $38, $39,
                  $40::jsonb, $41::jsonb
                )
                RETURNING *
              `,
              [
                data.diagnosisId,

                databaseId,

                data.legacyMongoId ||
                  null,

                data.tenantId ||
                  null,

                resolved.organizationUuid,

                resolved.environmentUuid,

                incident.id,

                runUuid,

                data.revision,

                data.isCurrent !==
                  false,

                data.status,

                extractOverallConfidence(
                  data.confidence
                ),

                data.correlationId ||
                  null,

                data.correlationGroupId ||
                  null,

                data.runExternalId ||
                  null,

                data.outcome ||
                  null,

                data.title ||
                  null,

                data.summary ||
                  null,

                data.probableRootCause ||
                  null,

                data.rootCauseCategory ||
                  null,

                JSON.stringify(
                  data.symptoms ||
                  []
                ),

                JSON.stringify(
                  data.findings ||
                  []
                ),

                JSON.stringify(
                  data.hypotheses ||
                  []
                ),

                data.primaryHypothesisId ||
                  null,

                JSON.stringify(
                  data.contradictions ||
                  []
                ),

                JSON.stringify(
                  data.unresolvedQuestions ||
                  []
                ),

                JSON.stringify(
                  data.unknowns ||
                  []
                ),

                Boolean(
                  data.falsePositiveSuspected
                ),

                JSON.stringify(
                  data.evidenceSummary ||
                  {}
                ),

                JSON.stringify(
                  data.impactSnapshot ||
                  {}
                ),

                JSON.stringify(
                  data.risk ||
                  {}
                ),

                data.recommendedNextStep ===
                  undefined
                  ? null
                  : JSON.stringify(
                      data.recommendedNextStep
                    ),

                previousUuid,

                data.analysisStartedAt ||
                  null,

                data.analysisCompletedAt ||
                  null,

                data.coordinatorVersion ||
                  null,

                data.reasoningProvider ||
                  null,

                data.model ||
                  null,

                Boolean(
                  data.fallbackUsed
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

          return mapDiagnosis(
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

  async save(
    diagnosis,
    transaction = null
  ) {
    if (
      !diagnosis?._id ||
      !diagnosis.organizationId ||
      !diagnosis.environmentId
    ) {
      throw createError(
        "PostgresIncidentDiagnosisRepository.save() requires persisted diagnosis with scope",
        "INVALID_INCIDENT_DIAGNOSIS_DOCUMENT"
      );
    }

    const scope = {
      organizationId:
        diagnosis.organizationId,

      environmentId:
        diagnosis.environmentId,

      incidentId:
        diagnosis.incidentId,
    };

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const supersededByUuid =
          diagnosis
            .supersededByDiagnosisId
            ? await resolveDiagnosisUuid(
                client,
                diagnosis
                  .supersededByDiagnosisId
              )
            : null;

        const previousUuid =
          diagnosis
            .supersedesDiagnosisId
            ? await resolveDiagnosisUuid(
                client,
                diagnosis
                  .supersedesDiagnosisId
              )
            : null;

        const document =
          serializeDocument(
            diagnosis
          );

        const result =
          await client.query(
            `
              UPDATE incidents.diagnoses
              SET
                is_current = $1,
                status = $2,
                confidence = $3,
                outcome = $4,
                title = $5,
                summary = $6,
                probable_root_cause = $7,
                root_cause_category = $8,
                symptoms = $9::jsonb,
                findings = $10::jsonb,
                hypotheses = $11::jsonb,
                primary_hypothesis_id = $12,
                contradictions = $13::jsonb,
                unresolved_questions = $14::jsonb,
                unknowns = $15::jsonb,
                false_positive_suspected = $16,
                evidence_summary = $17::jsonb,
                impact_snapshot = $18::jsonb,
                risk = $19::jsonb,
                recommended_next_step = $20::jsonb,
                previous_diagnosis_id = $21,
                superseded_by_diagnosis_id = $22,
                analysis_started_at = $23,
                analysis_completed_at = $24,
                coordinator_version = $25,
                reasoning_provider = $26,
                model = $27,
                fallback_used = $28,
                metadata = $29::jsonb,
                document = $30::jsonb
              WHERE
                organization_id = $31
                AND environment_id = $32
                AND (
                  database_id = $33
                  OR legacy_mongo_id = $33
                  OR id::text = $33
                )
              RETURNING *
            `,
            [
              diagnosis.isCurrent !==
                false,

              diagnosis.status,

              extractOverallConfidence(
                diagnosis.confidence
              ),

              diagnosis.outcome ||
                null,

              diagnosis.title ||
                null,

              diagnosis.summary ||
                null,

              diagnosis.probableRootCause ||
                null,

              diagnosis.rootCauseCategory ||
                null,

              JSON.stringify(
                diagnosis.symptoms ||
                []
              ),

              JSON.stringify(
                diagnosis.findings ||
                []
              ),

              JSON.stringify(
                diagnosis.hypotheses ||
                []
              ),

              diagnosis.primaryHypothesisId ||
                null,

              JSON.stringify(
                diagnosis.contradictions ||
                []
              ),

              JSON.stringify(
                diagnosis.unresolvedQuestions ||
                []
              ),

              JSON.stringify(
                diagnosis.unknowns ||
                []
              ),

              Boolean(
                diagnosis.falsePositiveSuspected
              ),

              JSON.stringify(
                diagnosis.evidenceSummary ||
                {}
              ),

              JSON.stringify(
                diagnosis.impactSnapshot ||
                {}
              ),

              JSON.stringify(
                diagnosis.risk ||
                {}
              ),

              diagnosis.recommendedNextStep ===
                undefined
                ? null
                : JSON.stringify(
                    diagnosis.recommendedNextStep
                  ),

              previousUuid,

              supersededByUuid,

              diagnosis.analysisStartedAt ||
                null,

              diagnosis.analysisCompletedAt ||
                null,

              diagnosis.coordinatorVersion ||
                null,

              diagnosis.reasoningProvider ||
                null,

              diagnosis.model ||
                null,

              Boolean(
                diagnosis.fallbackUsed
              ),

              JSON.stringify(
                diagnosis.metadata ||
                {}
              ),

              JSON.stringify(
                document
              ),

              resolved.organizationUuid,

              resolved.environmentUuid,

              normalizeId(
                diagnosis._id
              ),
            ]
          );

        return result.rows[0]
          ? mapDiagnosis(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }
}

async function resolveRunUuid(
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
        FROM agents.intelligence_runs
        WHERE
          database_id = $1
          OR public_id = $1
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

async function resolveDiagnosisUuid(
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
        FROM incidents.diagnoses
        WHERE
          database_id = $1
          OR public_id = $1
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

function extractOverallConfidence(
  confidence
) {
  if (
    typeof confidence ===
    "number"
  ) {
    return confidence;
  }

  return confidence
    ?.overallConfidence ??
    confidence?.score ??
    null;
}

function mapDiagnosis(
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

    diagnosisId:
      row.public_id,

    organizationId:
      document.organizationId ||
      normalizeId(
        scope.organizationId
      ),

    environmentId:
      document.environmentId ||
      normalizeId(
        scope.environmentId
      ),

    incidentId:
      document.incidentId ||
      normalizeId(
        scope.incidentId
      ),

    tenantId:
      row.tenant_public_id,

    revision:
      row.revision,

    isCurrent:
      row.is_current,

    status:
      row.status,

    outcome:
      row.outcome,

    title:
      row.title,

    summary:
      row.summary,

    probableRootCause:
      row.probable_root_cause,

    rootCauseCategory:
      row.root_cause_category,

    symptoms:
      row.symptoms ||
      [],

    findings:
      row.findings ||
      [],

    hypotheses:
      row.hypotheses ||
      [],

    primaryHypothesisId:
      row.primary_hypothesis_id,

    contradictions:
      row.contradictions ||
      [],

    unresolvedQuestions:
      row.unresolved_questions ||
      [],

    unknowns:
      row.unknowns ||
      [],

    falsePositiveSuspected:
      row.false_positive_suspected,

    evidenceSummary:
      row.evidence_summary ||
      {},

    impactSnapshot:
      row.impact_snapshot ||
      {},

    risk:
      row.risk ||
      {},

    recommendedNextStep:
      row.recommended_next_step,

    runExternalId:
      row.run_external_id,

    analysisStartedAt:
      row.analysis_started_at,

    analysisCompletedAt:
      row.analysis_completed_at,

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
      "Incident diagnosis PostgreSQL operation requires organizationId, environmentId and incidentId",
      "POSTGRES_DIAGNOSIS_SCOPE_REQUIRED"
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
  PostgresIncidentDiagnosisRepository;