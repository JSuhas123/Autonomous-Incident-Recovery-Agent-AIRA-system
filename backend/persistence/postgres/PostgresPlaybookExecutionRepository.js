"use strict";

const {
  randomUUID,
} = require("crypto");

const PostgresTenantScope =
  require("./PostgresTenantScope");

class PostgresPlaybookExecutionRepository {
  constructor(options = {}) {
    this.tenantScope =
      options.tenantScope ||
      new PostgresTenantScope(options);
  }

  async create(input = {}) {
    _requireScope(input);
    _require(input.executionId, "executionId");
    _require(input.correlationId, "correlationId");
    _require(input.playbookId, "playbookId");
    _require(input.playbookVersion, "playbookVersion");

    return this.tenantScope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async (client, resolved) => {
        const playbookVersionId =
          input.playbookVersionId ||
          await _resolvePlaybookVersionId(
            client,
            {
              playbookId:
                input.playbookId,

              semver:
                input.playbookVersion,

              organizationUuid:
                resolved.organizationUuid,

              environmentUuid:
                resolved.environmentUuid,
            }
          );

        const incidentUuid =
          await _resolveIncidentUuid(
            client,
            input.incidentId,
            resolved
          );

        const publicId =
          input.publicId ||
          `pbexec_${randomUUID()}`;

        const result =
          await client.query(
            `
              INSERT INTO execution.playbook_executions (
                public_id,
                legacy_mongo_id,
                execution_id,
                correlation_id,
                tenant_public_id,
                organization_id,
                environment_id,
                incident_id,
                incident_public_id,
                playbook_id,
                playbook_version,
                playbook_version_id,
                version_ref,
                playbook_checksum,
                playbook_snapshot,
                incident_context,
                resolved_mappings,
                match_score,
                match_reasons,
                policy_decision,
                approval,
                status,
                status_reason,
                started_at,
                completed_at,
                duration_ms,
                initiated_by,
                initiator_type,
                stage_executions,
                rollback,
                escalation,
                outcome,
                failed_stage_id,
                error_message,
                error_code,
                audit_event_ids,
                decision_trace_id,
                requires_human_review,
                execution_authorized,
                metadata
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14,
                $15::jsonb,
                $16::jsonb,
                $17::jsonb,
                $18,
                $19::jsonb,
                $20::jsonb,
                $21::jsonb,
                $22,
                $23,
                $24,
                $25,
                $26,
                $27,
                $28,
                $29::jsonb,
                $30::jsonb,
                $31::jsonb,
                $32::jsonb,
                $33,
                $34,
                $35,
                $36::jsonb,
                $37,
                $38,
                FALSE,
                $39::jsonb
              )
              RETURNING *
            `,
            [
              publicId,
              input.legacyMongoId || null,
              input.executionId,
              input.correlationId,
              String(input.tenantId),
              resolved.organizationUuid,
              resolved.environmentUuid,
              incidentUuid,
              input.incidentId
                ? String(input.incidentId)
                : null,
              input.playbookId,
              input.playbookVersion,
              playbookVersionId,
              input.versionRef ||
                `${input.playbookId}@${input.playbookVersion}`,
              input.playbookChecksum || "pending",
              _json(
                input.playbookSnapshot || {
                  playbookId:
                    input.playbookId,

                  semver:
                    input.playbookVersion,
                }
              ),
              _json(input.incidentContext || {}),
              _json(input.resolvedMappings || []),
              input.matchScore ?? null,
              _json(input.matchReasons || []),
              _json(input.policyDecision || {}),
              _json(input.approval || {}),
              input.status || "CREATED",
              input.statusReason || null,
              input.startedAt || null,
              input.completedAt || null,
              input.durationMs ?? null,
              input.initiatedBy || null,
              input.initiatorType || "api",
              _json(input.stageExecutions || []),
              _json(input.rollback || {}),
              _json(input.escalation || {}),
              _json(input.outcome || {}),
              input.failedStageId || null,
              input.errorMessage || null,
              input.errorCode || null,
              _json(input.auditEventIds || []),
              input.decisionTraceId || null,
              Boolean(input.requiresHumanReview),
              _json(input.metadata || {}),
            ]
          );

        return _mapRow(
          result.rows[0],
          input
        );
      }
    );
  }

  async getByExecutionId(scope = {}) {
    _requireScope(scope);
    _require(scope.executionId, "executionId");

    return this.tenantScope.run(
      scope,
      async (client) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM execution.playbook_executions
              WHERE execution_id = $1
              LIMIT 1
            `,
            [
              scope.executionId,
            ]
          );

        if (!result.rows[0]) {
          return null;
        }

        return _mapRow(
          result.rows[0],
          scope
        );
      }
    );
  }

  async update(
    scope = {},
    changes = {}
  ) {
    _requireScope(scope);
    _require(scope.executionId, "executionId");

    const assignments = [];
    const values = [
      scope.executionId,
    ];

    const mapping = {
      correlationId:
        ["correlation_id", false],

      incidentContext:
        ["incident_context", true],

      resolvedMappings:
        ["resolved_mappings", true],

      matchScore:
        ["match_score", false],

      matchReasons:
        ["match_reasons", true],

      policyDecision:
        ["policy_decision", true],

      approval:
        ["approval", true],

      status:
        ["status", false],

      statusReason:
        ["status_reason", false],

      startedAt:
        ["started_at", false],

      completedAt:
        ["completed_at", false],

      durationMs:
        ["duration_ms", false],

      stageExecutions:
        ["stage_executions", true],

      rollback:
        ["rollback", true],

      escalation:
        ["escalation", true],

      outcome:
        ["outcome", true],

      failedStageId:
        ["failed_stage_id", false],

      errorMessage:
        ["error_message", false],

      errorCode:
        ["error_code", false],

      auditEventIds:
        ["audit_event_ids", true],

      decisionTraceId:
        ["decision_trace_id", false],

      requiresHumanReview:
        ["requires_human_review", false],
    };

    for (const [field, config] of Object.entries(mapping)) {
      if (
        !Object.prototype.hasOwnProperty.call(
          changes,
          field
        )
      ) {
        continue;
      }

      const [
        column,
        json,
      ] = config;

      values.push(
        json
          ? _json(changes[field])
          : changes[field]
      );

      assignments.push(
        `${column} = $${values.length}${
          json
            ? "::jsonb"
            : ""
        }`
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        "playbookSnapshot"
      ) ||
      Object.prototype.hasOwnProperty.call(
        changes,
        "playbookChecksum"
      ) ||
      Object.prototype.hasOwnProperty.call(
        changes,
        "playbookVersion"
      ) ||
      Object.prototype.hasOwnProperty.call(
        changes,
        "playbookVersionId"
      )
    ) {
      throw _error(
        "PLAYBOOK_EXECUTION_IDENTITY_IMMUTABLE",
        "Executed Playbook identity/snapshot cannot be changed through update()"
      );
    }

    if (!assignments.length) {
      return this.getByExecutionId(
        scope
      );
    }

    return this.tenantScope.run(
      scope,
      async (client) => {
        const result =
          await client.query(
            `
              UPDATE execution.playbook_executions
              SET
                ${assignments.join(", ")}
              WHERE execution_id = $1
              RETURNING *
            `,
            values
          );

        if (!result.rows[0]) {
          return null;
        }

        return _mapRow(
          result.rows[0],
          scope
        );
      }
    );
  }

  /**
   * The initial CREATED row contains the requested Playbook identity.
   *
   * After registry resolution we atomically bind the execution to the exact
   * canonical knowledge version before the execution has started.
   *
   * PostgreSQL's execution identity trigger prevents later mutation.
   */
  async bindResolvedVersion(
    scope = {},
    resolved = {}
  ) {
    _requireScope(scope);
    _require(scope.executionId, "executionId");

    _require(
      resolved.playbookId,
      "playbookId"
    );

    _require(
      resolved.playbookVersion,
      "playbookVersion"
    );

    _require(
      resolved.playbookChecksum,
      "playbookChecksum"
    );

    return this.tenantScope.run(
      scope,
      async (
        client,
        tenant
      ) => {
        const versionId =
          resolved.playbookVersionId ||
          await _resolvePlaybookVersionId(
            client,
            {
              playbookId:
                resolved.playbookId,

              semver:
                resolved.playbookVersion,

              organizationUuid:
                tenant.organizationUuid,

              environmentUuid:
                tenant.environmentUuid,
            }
          );

        const result =
          await client.query(
            `
              UPDATE execution.playbook_executions
              SET
                playbook_version_id = $2,
                version_ref = $3,
                playbook_checksum = $4,
                playbook_snapshot = $5::jsonb
              WHERE execution_id = $1
                AND status IN (
                  'CREATED',
                  'EVALUATING'
                )
                AND playbook_checksum = 'pending'
              RETURNING *
            `,
            [
              scope.executionId,
              versionId,
              resolved.versionRef ||
                `${resolved.playbookId}@${resolved.playbookVersion}`,
              resolved.playbookChecksum,
              _json(
                resolved.playbookSnapshot
              ),
            ]
          );

        if (!result.rows[0]) {
          throw _error(
            "PLAYBOOK_EXECUTION_VERSION_BIND_FAILED",
            `Unable to bind execution ${scope.executionId} to its exact Playbook version`
          );
        }

        return _mapRow(
          result.rows[0],
          scope
        );
      }
    );
  }

  async appendStageExecution(
    scope = {},
    stageExecution
  ) {
    const current =
      await this.getByExecutionId(
        scope
      );

    if (!current) {
      return null;
    }

    return this.update(
      scope,
      {
        stageExecutions: [
          ...(current.stageExecutions || []),
          stageExecution,
        ],
      }
    );
  }

  async listByIncident(
    scope = {}
  ) {
    _requireScope(scope);
    _require(scope.incidentId, "incidentId");

    return this.tenantScope.run(
      scope,
      async (client) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM execution.playbook_executions
              WHERE incident_public_id = $1
              ORDER BY created_at DESC
            `,
            [
              String(
                scope.incidentId
              ),
            ]
          );

        return result.rows.map(
          (row) =>
            _mapRow(
              row,
              scope
            )
        );
      }
    );
  }
}

async function _resolvePlaybookVersionId(
  client,
  input
) {
  const result =
    await client.query(
      `
        SELECT
          pv.id

        FROM knowledge.playbook_versions pv

        JOIN knowledge.playbook_definitions pd
          ON pd.id =
             pv.playbook_definition_id

        WHERE
          pd.playbook_key = $1

          AND pv.semver = $2

          AND pd.status <> 'RETIRED'

          AND (
            (
              pv.scope_type = 'ENVIRONMENT'
              AND pv.organization_id = $3
              AND pv.environment_id = $4
            )

            OR

            (
              pv.scope_type = 'ORGANIZATION'
              AND pv.organization_id = $3
              AND pv.environment_id IS NULL
            )

            OR

            (
              pv.scope_type = 'GLOBAL'
              AND pv.organization_id IS NULL
              AND pv.environment_id IS NULL
            )
          )

        ORDER BY
          CASE pv.scope_type
            WHEN 'ENVIRONMENT'
              THEN 3

            WHEN 'ORGANIZATION'
              THEN 2

            WHEN 'GLOBAL'
              THEN 1

            ELSE 0
          END DESC

        LIMIT 1
      `,
      [
        input.playbookId,

        input.semver,

        input.organizationUuid,

        input.environmentUuid,
      ]
    );


  return result.rows[0]
    ?.id ||
    null;
}

async function _resolveIncidentUuid(
  client,
  incidentId,
  resolved
) {
  if (
    !incidentId
  ) {
    return null;
  }


  const result =
    await client.query(
      `
        SELECT id

        FROM incidents.incidents

        WHERE
          (
            id::text = $1
            OR public_id = $1
          )

          AND organization_id = $2

          AND environment_id = $3

        LIMIT 1
      `,
      [
        String(
          incidentId
        ),

        resolved.organizationUuid,

        resolved.environmentUuid,
      ]
    );


  return result.rows[0]
    ?.id ||
    null;
}

function _mapRow(
  row,
  scope = {}
) {
  if (!row) {
    return null;
  }

  return {
    id:
      row.id,

    publicId:
      row.public_id,

    legacyMongoId:
      row.legacy_mongo_id,

    executionId:
      row.execution_id,

    correlationId:
      row.correlation_id,

    tenantId:
      row.tenant_public_id,

    organizationId:
      scope.organizationId,

    environmentId:
      scope.environmentId,

    canonicalOrganizationId:
      row.organization_id,

    canonicalEnvironmentId:
      row.environment_id,

    incidentId:
      row.incident_public_id ||
      row.incident_id ||
      null,

    canonicalIncidentId:
      row.incident_id,

    playbookId:
      row.playbook_id,

    playbookVersion:
      row.playbook_version,

    playbookVersionId:
      row.playbook_version_id,

    versionRef:
      row.version_ref,

    playbookChecksum:
      row.playbook_checksum,

    playbookSnapshot:
      row.playbook_snapshot || {},

    incidentContext:
      row.incident_context || {},

    resolvedMappings:
      row.resolved_mappings || [],

    matchScore:
      row.match_score === null
        ? null
        : Number(row.match_score),

    matchReasons:
      row.match_reasons || [],

    policyDecision:
      row.policy_decision || {},

    approval:
      row.approval || {},

    status:
      row.status,

    statusReason:
      row.status_reason,

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,

    durationMs:
      row.duration_ms === null
        ? null
        : Number(row.duration_ms),

    initiatedBy:
      row.initiated_by,

    initiatorType:
      row.initiator_type,

    stageExecutions:
      row.stage_executions || [],

    rollback:
      row.rollback || {},

    escalation:
      row.escalation || {},

    outcome:
      row.outcome || {},

    failedStageId:
      row.failed_stage_id,

    errorMessage:
      row.error_message,

    errorCode:
      row.error_code,

    auditEventIds:
      row.audit_event_ids || [],

    decisionTraceId:
      row.decision_trace_id,

    requiresHumanReview:
      Boolean(
        row.requires_human_review
      ),

    executionAuthorized:
      false,

    metadata:
      row.metadata || {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

function _requireScope(
  scope
) {
  _require(
    scope.tenantId,
    "tenantId"
  );

  _require(
    scope.organizationId,
    "organizationId"
  );

  _require(
    scope.environmentId,
    "environmentId"
  );
}

function _require(
  value,
  name
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    throw _error(
      "POSTGRES_PLAYBOOK_EXECUTION_REQUIRED_FIELD",
      `${name} is required`
    );
  }
}

function _json(
  value
) {
  return JSON.stringify(
    value === undefined
      ? null
      : value
  );
}

function _error(
  code,
  message
) {
  return Object.assign(
    new Error(message),
    {
      code,
      executionAuthorized:
        false,
    }
  );
}

module.exports =
  PostgresPlaybookExecutionRepository;