"use strict";

const crypto =
  require(
    "node:crypto"
  );

const DecisionTraceRepository =
  require(
    "../repositories/DecisionTraceRepository"
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

class PostgresDecisionTraceRepository
  extends DecisionTraceRepository {
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
                INSERT INTO audit.decision_traces (
                  public_id,
                  database_id,
                  tenant_public_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  correlation_id,
                  inputs,
                  reasoning,
                  rules_triggered,
                  alternatives,
                  decision,
                  recommended_action,
                  tier,
                  action_risk,
                  policy_check,
                  action_result,
                  memory_update,
                  audit_trail,
                  document
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
                  $11::jsonb, $12, $13, $14, $15,
                  $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb
                )
                RETURNING *
              `,
              [
                data.decisionId,

                databaseId,

                data.tenantId,

                resolved.organizationUuid,

                resolved.environmentUuid,

                incidentUuid,

                data.correlationId ||
                  null,

                JSON.stringify(
                  data.inputs ||
                  {}
                ),

                JSON.stringify(
                  data.reasoning ||
                  {}
                ),

                JSON.stringify(
                  data.rulesTriggered ||
                  []
                ),

                JSON.stringify(
                  data.alternatives ||
                  []
                ),

                data.decision ||
                  null,

                data.recommendedAction ||
                  null,

                data.tier ||
                  "observe",

                data.actionRisk ||
                  null,

                JSON.stringify(
                  data.policyCheck ||
                  {}
                ),

                JSON.stringify(
                  data.actionResult ||
                  {}
                ),

                JSON.stringify(
                  data.memoryUpdate ||
                  {}
                ),

                JSON.stringify(
                  data.auditTrail ||
                  []
                ),

                JSON.stringify(
                  document
                ),
              ]
            );

          return mapTrace(
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

  async updateOne(
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
        const row =
          await findTraceRow(
            client,
            filter,
            resolved
          );

        if (!row) {
          return null;
        }

        const trace =
          mapTrace(
            row,
            scope
          );

        applyMongoUpdate(
          trace,
          update
        );

        const document =
          serializeDocument(
            trace
          );

        const result =
          await client.query(
            `
              UPDATE audit.decision_traces
              SET
                correlation_id = $1,
                inputs = $2::jsonb,
                reasoning = $3::jsonb,
                rules_triggered = $4::jsonb,
                alternatives = $5::jsonb,
                decision = $6,
                recommended_action = $7,
                tier = $8,
                action_risk = $9,
                policy_check = $10::jsonb,
                action_result = $11::jsonb,
                memory_update = $12::jsonb,
                audit_trail = $13::jsonb,
                document = $14::jsonb
              WHERE id = $15
              RETURNING *
            `,
            [
              trace.correlationId ||
                null,

              JSON.stringify(
                trace.inputs ||
                {}
              ),

              JSON.stringify(
                trace.reasoning ||
                {}
              ),

              JSON.stringify(
                trace.rulesTriggered ||
                []
              ),

              JSON.stringify(
                trace.alternatives ||
                []
              ),

              trace.decision ||
                null,

              trace.recommendedAction ||
                null,

              trace.tier ||
                "observe",

              trace.actionRisk ||
                null,

              JSON.stringify(
                trace.policyCheck ||
                {}
              ),

              JSON.stringify(
                trace.actionResult ||
                {}
              ),

              JSON.stringify(
                trace.memoryUpdate ||
                {}
              ),

              JSON.stringify(
                trace.auditTrail ||
                []
              ),

              JSON.stringify(
                document
              ),

              row.id,
            ]
          );

        return mapTrace(
          result.rows[0],
          scope
        );
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
        const row =
          await findTraceRow(
            client,
            filter,
            resolved
          );

        return row
          ? mapTrace(
              row,
              scope
            )
          : null;
      },
      transaction
    );
  }

  async list(
    filter,
    {
      sort = {
        createdAt:
          -1,
      },

      limit = 50,
    } = {},
    transaction = null
  ) {
    const scope =
      requireScope(
        filter
      );

    const safeLimit =
      Math.min(
        Math.max(
          Number(
            limit
          ) ||
          50,
          1
        ),
        200
      );

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const {
          where,
          values,
        } =
          buildTraceWhere(
            filter,
            resolved
          );

        const direction =
          Number(
            sort.createdAt
          ) >=
          0
            ? "ASC"
            : "DESC";

        values.push(
          safeLimit
        );

        const result =
          await client.query(
            `
              SELECT *
              FROM audit.decision_traces
              WHERE ${where}
              ORDER BY created_at ${direction}
              LIMIT $${values.length}
            `,
            values
          );

        return result.rows.map(
          (
            row
          ) =>
            mapTrace(
              row,
              scope
            )
        );
      },
      transaction
    );
  }
}

async function findTraceRow(
  client,
  filter,
  resolved
) {
  const {
    where,
    values,
  } =
    buildTraceWhere(
      filter,
      resolved
    );

  const result =
    await client.query(
      `
        SELECT *
        FROM audit.decision_traces
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT 1
      `,
      values
    );

  return result.rows[0] ||
    null;
}

function buildTraceWhere(
  filter,
  resolved
) {
  const clauses = [
    "organization_id = $1",
    "environment_id = $2",
  ];

  const values = [
    resolved.organizationUuid,
    resolved.environmentUuid,
  ];

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
        "environmentId"
    ) {
      continue;
    }

    if (
      key ===
      "tenantId"
    ) {
      const index =
        values.push(
          value
        );

      clauses.push(
        `tenant_public_id = $${index}`
      );

      continue;
    }

    if (
      key ===
      "decisionId"
    ) {
      const index =
        values.push(
          value
        );

      clauses.push(
        `public_id = $${index}`
      );

      continue;
    }

    if (
      key ===
      "correlationId"
    ) {
      const index =
        values.push(
          value
        );

      clauses.push(
        `correlation_id = $${index}`
      );

      continue;
    }

    if (
      key ===
      "decision"
    ) {
      const index =
        values.push(
          value
        );

      clauses.push(
        `decision = $${index}`
      );

      continue;
    }

    if (
      key ===
      "createdAt"
    ) {
      for (
        const [
          operator,
          operand,
        ]
        of Object.entries(
          value
        )
      ) {
        const index =
          values.push(
            operand
          );

        if (
          operator ===
          "$gte"
        ) {
          clauses.push(
            `created_at >= $${index}`
          );
        } else if (
          operator ===
          "$lte"
        ) {
          clauses.push(
            `created_at <= $${index}`
          );
        }
      }

      continue;
    }

    /*
     * Optional service filters such as tier/actionRisk are stored in document.
     */
    const index =
      values.push(
        String(
          value
        )
      );

    clauses.push(
      `document ->> '${safeJsonKey(key)}' = $${index}`
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

function applyMongoUpdate(
  target,
  update = {}
) {
  for (
    const [
      path,
      value,
    ]
    of Object.entries(
      update.$set ||
      {}
    )
  ) {
    setPath(
      target,
      path,
      value
    );
  }

  for (
    const [
      path,
      value,
    ]
    of Object.entries(
      update.$push ||
      {}
    )
  ) {
    const current =
      getPath(
        target,
        path
      );

    const array =
      Array.isArray(
        current
      )
        ? current
        : [];

    array.push(
      value
    );

    setPath(
      target,
      path,
      array
    );
  }
}

function setPath(
  target,
  path,
  value
) {
  const parts =
    path.split(
      "."
    );

  let current =
    target;

  for (
    let index = 0;
    index <
    parts.length -
      1;
    index +=
      1
  ) {
    const key =
      parts[index];

    if (
      !current[key] ||
      typeof current[key] !==
        "object"
    ) {
      current[key] =
        {};
    }

    current =
      current[key];
  }

  current[
    parts[
      parts.length -
      1
    ]
  ] =
    value;
}

function getPath(
  target,
  path
) {
  return path
    .split(
      "."
    )
    .reduce(
      (
        current,
        key
      ) =>
        current?.[
          key
        ],
      target
    );
}

function safeJsonKey(
  value
) {
  if (
    !/^[A-Za-z0-9_]+$/
      .test(
        value
      )
  ) {
    throw Object.assign(
      new Error(
        `Unsupported DecisionTrace filter: ${value}`
      ),
      {
        code:
          "POSTGRES_DECISION_TRACE_FILTER_UNSUPPORTED",
      }
    );
  }

  return value;
}

function mapTrace(
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

    decisionId:
      row.public_id,

    tenantId:
      row.tenant_public_id,

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

    correlationId:
      row.correlation_id,

    inputs:
      row.inputs ||
      {},

    reasoning:
      row.reasoning ||
      {},

    rulesTriggered:
      row.rules_triggered ||
      [],

    alternatives:
      row.alternatives ||
      [],

    decision:
      row.decision,

    recommendedAction:
      row.recommended_action,

    tier:
      row.tier,

    actionRisk:
      row.action_risk,

    policyCheck:
      row.policy_check ||
      {},

    actionResult:
      row.action_result ||
      {},

    memoryUpdate:
      row.memory_update ||
      {},

    auditTrail:
      row.audit_trail ||
      [],

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
    !value.tenantId ||
    !value.organizationId ||
    !value.environmentId
  ) {
    throw Object.assign(
      new Error(
        "DecisionTrace PostgreSQL operation requires tenantId, organizationId and environmentId"
      ),
      {
        code:
          "POSTGRES_DECISION_TRACE_SCOPE_REQUIRED",
      }
    );
  }

  return value;
}

module.exports =
  PostgresDecisionTraceRepository;