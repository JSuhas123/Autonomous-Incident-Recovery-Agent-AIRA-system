"use strict";

const crypto =
  require(
    "node:crypto"
  );

const RecoveryVerificationRepository =
  require(
    "../repositories/RecoveryVerificationRepository"
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


class PostgresRecoveryVerificationRepository
  extends RecoveryVerificationRepository {
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

        if (!incident) {
          return null;
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM execution.recovery_verifications
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
          ? mapVerification(
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
    if (
      !scope?.organizationId ||
      !scope?.environmentId
    ) {
      throw createError(
        "Recovery verification lookup requires organization and environment",
        "POSTGRES_RECOVERY_VERIFICATION_SCOPE_REQUIRED"
      );
    }

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
        const result =
          await client.query(
            `
              SELECT *
              FROM execution.recovery_verifications
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND (
                  public_id = $3
                  OR database_id = $3
                  OR legacy_mongo_id = $3
                  OR id::text = $3
                )
              LIMIT 1
            `,
            [
              resolved.organizationUuid,
              resolved.environmentUuid,
              normalized,
            ]
          );

        return result.rows[0]
          ? mapVerification(
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

        if (!incident) {
          return [];
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM execution.recovery_verifications
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
          (
            row
          ) =>
            mapVerification(
              row,
              scope
            )
        );
      },
      transaction
    );
  }


  async findRuns(
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
            100
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

        if (!incident) {
          return [];
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM execution.recovery_verification_runs
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND incident_id = $3
              ORDER BY created_at DESC
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
          (
            row
          ) =>
            mapRun(
              row,
              scope
            )
        );
      },
      transaction
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
                INSERT INTO execution.recovery_verification_runs (
                  public_id,
                  database_id,
                  legacy_mongo_id,
                  verification_public_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  incident_public_id,
                  execution_request_public_id,
                  state,
                  attempt,
                  max_attempts,
                  verification_plan_id,
                  verification_plan_hash,
                  requested_at,
                  started_at,
                  completed_at,
                  failure,
                  metadata,
                  document
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8, $9, $10,
                  $11, $12, $13, $14, $15,
                  $16, $17, $18::jsonb, $19::jsonb, $20::jsonb
                )
                RETURNING *
              `,
              [
                data.verificationRunId,

                databaseId,

                data.legacyMongoId ||
                  null,

                data.verificationId,

                resolved.organizationUuid,

                resolved.environmentUuid,

                incident.id,

                normalizeId(
                  data.incidentId
                ),

                data.executionRequestId,

                data.state ||
                  "CREATED",

                Number(
                  data.attempt ||
                  0
                ),

                Math.max(
                  1,
                  Number(
                    data.maxAttempts ||
                    1
                  )
                ),

                data.verificationPlanId ||
                  null,

                data.verificationPlanHash ||
                  null,

                data.requestedAt ||
                  new Date(),

                data.startedAt ||
                  null,

                data.completedAt ||
                  null,

                data.failure == null
                  ? null
                  : JSON.stringify(
                      data.failure
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


  async saveRun(
    run,
    transaction = null
  ) {
    const scope =
      requireScope(
        run
      );

    const identifier =
      normalizeId(
        run._id ||
        run.verificationRunId
      );

    if (!identifier) {
      throw createError(
        "Verification run identifier is required",
        "POSTGRES_RECOVERY_VERIFICATION_RUN_ID_REQUIRED"
      );
    }

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        let resultVerificationUuid =
          null;

        if (
          run.resultVerificationDocumentId
        ) {
          resultVerificationUuid =
            await resolveVerificationUuid(
              client,
              run.resultVerificationDocumentId
            );
        }

        const document =
          serializeDocument(
            run
          );

        const result =
          await client.query(
            `
              UPDATE execution.recovery_verification_runs
              SET
                state = $1,
                attempt = $2,
                max_attempts = $3,
                verification_plan_id = $4,
                verification_plan_hash = $5,
                result_verification_id = $6,
                requested_at = $7,
                started_at = $8,
                completed_at = $9,
                failure = $10::jsonb,
                metadata = $11::jsonb,
                document = $12::jsonb,
                updated_at = NOW()
              WHERE
                organization_id = $13
                AND environment_id = $14
                AND (
                  public_id = $15
                  OR database_id = $15
                  OR legacy_mongo_id = $15
                  OR id::text = $15
                )
              RETURNING *
            `,
            [
              run.state,

              Number(
                run.attempt ||
                0
              ),

              Math.max(
                1,
                Number(
                  run.maxAttempts ||
                  1
                )
              ),

              run.verificationPlanId ||
                null,

              run.verificationPlanHash ||
                null,

              resultVerificationUuid,

              run.requestedAt ||
                null,

              run.startedAt ||
                null,

              run.completedAt ||
                null,

              run.failure == null
                ? null
                : JSON.stringify(
                    run.failure
                  ),

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
              scope
            )
          : null;
      },
      transaction
    );
  }


  async createVerification(
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
          createDatabaseId();

        const previousVerificationUuid =
          data.previousVerificationId
            ? await resolveVerificationUuid(
                client,
                data.previousVerificationId
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
                INSERT INTO execution.recovery_verifications (
                  public_id,
                  database_id,
                  legacy_mongo_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  incident_public_id,
                  execution_request_public_id,
                  authorization_public_id,
                  recovery_decision_public_id,
                  execution_plan_id,
                  execution_plan_hash,
                  verification_plan_id,
                  verification_plan_hash,
                  revision,
                  is_current,
                  status,
                  decision,
                  confidence,
                  next_action,
                  recovered,
                  recovery_confirmed,
                  incident_closure_eligible,
                  overall_score,
                  verification_plan,
                  evidence_package,
                  decision_result,
                  critic_result,
                  routing_result,
                  previous_verification_id,
                  verified_at,
                  metadata,
                  document
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8, $9, $10,
                  $11, $12, $13, $14, $15,
                  $16, $17, $18, $19, $20,
                  $21, $22, $23, $24, $25::jsonb,
                  $26::jsonb, $27::jsonb, $28::jsonb, $29::jsonb, $30,
                  $31, $32::jsonb, $33::jsonb
                )
                RETURNING *
              `,
              [
                data.verificationId,

                databaseId,

                data.legacyMongoId ||
                  null,

                resolved.organizationUuid,

                resolved.environmentUuid,

                incident.id,

                normalizeId(
                  data.incidentId
                ),

                data.executionRequestId,

                data.authorizationId ||
                  null,

                data.recoveryDecisionId ||
                  null,

                data.executionPlanId ||
                  null,

                data.executionPlanHash ||
                  null,

                data.verificationPlanId,

                data.verificationPlanHash,

                Number(
                  data.revision
                ),

                data.isCurrent !==
                  false,

                data.status ||
                  "current",

                data.decision,

                data.confidence ||
                  null,

                data.nextAction ||
                  null,

                Boolean(
                  data.recovered
                ),

                Boolean(
                  data.recoveryConfirmed
                ),

                Boolean(
                  data.incidentClosureEligible
                ),

                data.overallScore ??
                  null,

                JSON.stringify(
                  data.verificationPlan ||
                  {}
                ),

                JSON.stringify(
                  data.evidencePackage ||
                  {}
                ),

                JSON.stringify(
                  data.decisionResult ||
                  {}
                ),

                JSON.stringify(
                  data.criticResult ||
                  {}
                ),

                JSON.stringify(
                  data.routingResult ||
                  {}
                ),

                previousVerificationUuid,

                data.verifiedAt ||
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

          return mapVerification(
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


  async saveVerification(
    verification,
    transaction = null
  ) {
    const scope =
      requireScope(
        verification
      );

    const identifier =
      normalizeId(
        verification._id ||
        verification.verificationId
      );

    if (!identifier) {
      throw createError(
        "Verification identifier is required",
        "POSTGRES_RECOVERY_VERIFICATION_ID_REQUIRED"
      );
    }

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const previousUuid =
          verification.previousVerificationId
            ? await resolveVerificationUuid(
                client,
                verification.previousVerificationId
              )
            : null;

        const supersededByUuid =
          verification.supersededByVerificationId
            ? await resolveVerificationUuid(
                client,
                verification.supersededByVerificationId
              )
            : null;

        const document =
          serializeDocument(
            verification
          );

        const result =
          await client.query(
            `
              UPDATE execution.recovery_verifications
              SET
                is_current = $1,
                status = $2,
                decision = $3,
                confidence = $4,
                next_action = $5,
                recovered = $6,
                recovery_confirmed = $7,
                incident_closure_eligible = $8,
                overall_score = $9,
                verification_plan = $10::jsonb,
                evidence_package = $11::jsonb,
                decision_result = $12::jsonb,
                critic_result = $13::jsonb,
                routing_result = $14::jsonb,
                previous_verification_id = $15,
                superseded_by_verification_id = $16,
                verified_at = $17,
                metadata = $18::jsonb,
                document = $19::jsonb,
                updated_at = NOW()
              WHERE
                organization_id = $20
                AND environment_id = $21
                AND (
                  public_id = $22
                  OR database_id = $22
                  OR legacy_mongo_id = $22
                  OR id::text = $22
                )
              RETURNING *
            `,
            [
              verification.isCurrent !==
                false,

              verification.status ||
                "current",

              verification.decision,

              verification.confidence ||
                null,

              verification.nextAction ||
                null,

              Boolean(
                verification.recovered
              ),

              Boolean(
                verification.recoveryConfirmed
              ),

              Boolean(
                verification.incidentClosureEligible
              ),

              verification.overallScore ??
                null,

              JSON.stringify(
                verification.verificationPlan ||
                {}
              ),

              JSON.stringify(
                verification.evidencePackage ||
                {}
              ),

              JSON.stringify(
                verification.decisionResult ||
                {}
              ),

              JSON.stringify(
                verification.criticResult ||
                {}
              ),

              JSON.stringify(
                verification.routingResult ||
                {}
              ),

              previousUuid,

              supersededByUuid,

              verification.verifiedAt ||
                null,

              JSON.stringify(
                verification.metadata ||
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
          ? mapVerification(
              result.rows[0],
              scope
            )
          : null;
      },
      transaction
    );
  }


  async markRunFailed(
    verificationRunId,
    error,
    transaction = null
  ) {
    const normalized =
      normalizeId(
        verificationRunId
      );

    if (!normalized) {
      throw createError(
        "verificationRunId is required",
        "VERIFICATION_RUN_ID_REQUIRED"
      );
    }

    const failure = {
      code:
        error?.code ||
        "VERIFICATION_RUN_FAILED",

      message:
        String(
          error?.message ||
          "Verification run failed"
        )
          .slice(
            0,
            2048
          ),
    };

    const client =
      transaction
        ?.kind ===
        "postgres"
        ? transaction.client
        : null;

    if (
      client
    ) {
      return updateFailedRun(
        client,
        normalized,
        failure
      );
    }

    const {
      getPostgresPool,
    } =
      require(
        "./postgresPool"
      );

    const pool =
      getPostgresPool();

    return updateFailedRun(
      pool,
      normalized,
      failure
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


async function updateFailedRun(
  client,
  identifier,
  failure
) {
  const result =
    await client.query(
      `
        UPDATE execution.recovery_verification_runs
        SET
          state = 'FAILED',
          completed_at = NOW(),
          failure = $2::jsonb,
          updated_at = NOW()
        WHERE
          public_id = $1
          OR database_id = $1
          OR legacy_mongo_id = $1
          OR id::text = $1
        RETURNING *
      `,
      [
        identifier,

        JSON.stringify(
          failure
        ),
      ]
    );

  return result.rows[0]
    ? mapRun(
        result.rows[0],
        {
          organizationId:
            result.rows[0]
              .organization_id,

          environmentId:
            result.rows[0]
              .environment_id,

          incidentId:
            result.rows[0]
              .incident_public_id,
        }
      )
    : null;
}


async function resolveVerificationUuid(
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
        FROM execution.recovery_verifications
        WHERE
          public_id = $1
          OR database_id = $1
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


function mapVerification(
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

    verificationId:
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
      row.incident_public_id ||
      normalizeId(
        scope.incidentId
      ),

    executionRequestId:
      row.execution_request_public_id,

    authorizationId:
      row.authorization_public_id,

    recoveryDecisionId:
      row.recovery_decision_public_id,

    executionPlanId:
      row.execution_plan_id,

    executionPlanHash:
      row.execution_plan_hash,

    verificationPlanId:
      row.verification_plan_id,

    verificationPlanHash:
      row.verification_plan_hash,

    revision:
      row.revision,

    isCurrent:
      row.is_current,

    status:
      row.status,

    decision:
      row.decision,

    confidence:
      row.confidence,

    nextAction:
      row.next_action,

    recovered:
      row.recovered,

    recoveryConfirmed:
      row.recovery_confirmed,

    incidentClosureEligible:
      row.incident_closure_eligible,

    overallScore:
      row.overall_score,

    verificationPlan:
      row.verification_plan ||
      {},

    evidencePackage:
      row.evidence_package ||
      {},

    decisionResult:
      row.decision_result ||
      {},

    criticResult:
      row.critic_result ||
      {},

    routingResult:
      row.routing_result ||
      {},

    verifiedAt:
      row.verified_at,

    metadata:
      row.metadata ||
      {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
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

    verificationRunId:
      row.public_id,

    verificationId:
      row.verification_public_id,

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
      row.incident_public_id ||
      normalizeId(
        scope.incidentId
      ),

    executionRequestId:
      row.execution_request_public_id,

    state:
      row.state,

    attempt:
      row.attempt,

    maxAttempts:
      row.max_attempts,

    verificationPlanId:
      row.verification_plan_id,

    verificationPlanHash:
      row.verification_plan_hash,

    resultVerificationDocumentId:
      document.resultVerificationDocumentId ||
      (
        row.result_verification_id
          ? String(
              row.result_verification_id
            )
          : null
      ),

    requestedAt:
      row.requested_at,

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,

    failure:
      row.failure,

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
    !value.environmentId ||
    !value.incidentId
  ) {
    throw createError(
      "Recovery verification operation requires organizationId, environmentId and incidentId",
      "POSTGRES_RECOVERY_VERIFICATION_SCOPE_REQUIRED"
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
  PostgresRecoveryVerificationRepository;