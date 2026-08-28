"use strict";

const {
  randomUUID,
} = require("crypto");

const PostgresTenantScope =
  require("./PostgresTenantScope");

class PostgresRunbookExecutionRepository {
  constructor(options = {}) {
    this.tenantScope =
      options.tenantScope ||
      new PostgresTenantScope(options);
  }

  async create(input = {}) {
    _requireScope(input);

    _require(
      input.executionId,
      "executionId"
    );

    _require(
      input.correlationId,
      "correlationId"
    );

    _require(
      input.runbookId,
      "runbookId"
    );

    _require(
      input.runbookVersion,
      "runbookVersion"
    );

    _require(
      input.runbookChecksum,
      "runbookChecksum"
    );

    const result =
      await this.tenantScope.run(
        input,

        async (
          client,
          resolved
        ) => {
          const versionId =
            input.runbookVersionId ||
            await _resolveRunbookVersionId(
              client,
              {
                runbookId:
                  input.runbookId,

                semver:
                  input.runbookVersion,

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

          const parentPlaybookExecutionId =
            await _resolveParentPlaybookExecution(
              client,
              input,
              resolved
            );

          const publicId =
            input.publicId ||
            `rbexec_${randomUUID()}`;

          const inserted =
            await client.query(
              `
                INSERT INTO execution.runbook_executions (
                  public_id,
                  legacy_mongo_id,
                  execution_id,
                  correlation_id,
                  tenant_public_id,
                  organization_id,
                  environment_id,
                  incident_id,
                  incident_public_id,
                  playbook_execution_id,
                  playbook_execution_public_id,
                  runbook_id,
                  runbook_version,
                  runbook_version_id,
                  version_ref,
                  runbook_checksum,
                  runbook_snapshot,
                  resolved_parameters,
                  policy_decision,
                  approval_id,
                  approver,
                  approved_at,
                  status,
                  status_reason,
                  started_at,
                  completed_at,
                  duration_ms,
                  initiated_by,
                  initiator_type,
                  step_attempts,
                  verification_result,
                  rollback_state,
                  pre_execution_state,
                  post_execution_state,
                  audit_event_ids,
                  decision_trace_id,
                  failed_step_id,
                  error_message,
                  error_code,
                  requires_human_review,
                  escalated,
                  escalated_at,
                  escalation_reason,
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
                  $15,
                  $16,
                  $17::jsonb,
                  $18::jsonb,
                  $19::jsonb,
                  $20,
                  $21,
                  $22,
                  $23,
                  $24,
                  $25,
                  $26,
                  $27,
                  $28,
                  $29,
                  $30::jsonb,
                  $31::jsonb,
                  $32::jsonb,
                  $33::jsonb,
                  $34::jsonb,
                  $35::jsonb,
                  $36,
                  $37,
                  $38,
                  $39,
                  $40,
                  $41,
                  $42,
                  $43,
                  FALSE,
                  $44::jsonb
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
                parentPlaybookExecutionId,
                input.playbookExecutionPublicId ||
                  null,
                input.runbookId,
                input.runbookVersion,
                versionId,
                input.versionRef ||
                  `${input.runbookId}@${input.runbookVersion}`,
                input.runbookChecksum,
                _json(input.runbookSnapshot || {}),
                _json(input.resolvedParameters || []),
                _json(input.policyDecision || {}),
                input.approvalId || null,
                input.approver || null,
                input.approvedAt || null,
                input.status || "CREATED",
                input.statusReason || null,
                input.startedAt || null,
                input.completedAt || null,
                input.durationMs ?? null,
                input.initiatedBy || null,
                input.initiatorType || "api",
                _json(input.stepAttempts || []),
                _json(input.verificationResult || {}),
                _json(input.rollbackState || {}),
                _json(input.preExecutionState || {}),
                _json(input.postExecutionState || {}),
                _json(input.auditEventIds || []),
                input.decisionTraceId || null,
                input.failedStepId || null,
                input.errorMessage || null,
                input.errorCode || null,
                Boolean(input.requiresHumanReview),
                Boolean(input.escalated),
                input.escalatedAt || null,
                input.escalationReason || null,
                _json(input.metadata || {}),
              ]
            );

          return _mapRow(
            inserted.rows[0],
            input
          );
        }
      );

    return result;
  }

  async getByExecutionId(
    scope = {}
  ) {
    _requireScope(scope);

    _require(
      scope.executionId,
      "executionId"
    );

    return this.tenantScope.run(
      scope,

      async (client) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM execution.runbook_executions
              WHERE execution_id = $1
              LIMIT 1
            `,
            [
              scope.executionId,
            ]
          );

        return result.rows[0]
          ? _mapRow(
              result.rows[0],
              scope
            )
          : null;
      }
    );
  }

  async update(
    scope = {},
    changes = {}
  ) {
    _requireScope(scope);

    _require(
      scope.executionId,
      "executionId"
    );

    const mapping = {
      resolvedParameters:
        ["resolved_parameters", true],

      policyDecision:
        ["policy_decision", true],

      approvalId:
        ["approval_id", false],

      approver:
        ["approver", false],

      approvedAt:
        ["approved_at", false],

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

      stepAttempts:
        ["step_attempts", true],

      verificationResult:
        ["verification_result", true],

      rollbackState:
        ["rollback_state", true],

      preExecutionState:
        ["pre_execution_state", true],

      postExecutionState:
        ["post_execution_state", true],

      auditEventIds:
        ["audit_event_ids", true],

      decisionTraceId:
        ["decision_trace_id", false],

      failedStepId:
        ["failed_step_id", false],

      errorMessage:
        ["error_message", false],

      errorCode:
        ["error_code", false],

      requiresHumanReview:
        ["requires_human_review", false],

      escalated:
        ["escalated", false],

      escalatedAt:
        ["escalated_at", false],

      escalationReason:
        ["escalation_reason", false],

      metadata:
        ["metadata", true],
    };

    const assignments = [];

    const values = [
      scope.executionId,
    ];

    for (
      const [
        field,
        [
          column,
          json,
        ],
      ]
      of Object.entries(mapping)
    ) {
      if (
        !Object.prototype
          .hasOwnProperty.call(
            changes,
            field
          )
      ) {
        continue;
      }

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

    const immutableFields = [
      "runbookId",
      "runbookVersion",
      "runbookVersionId",
      "versionRef",
      "runbookChecksum",
      "runbookSnapshot",
      "organizationId",
      "environmentId",
      "tenantId",
    ];

    for (
      const field
      of immutableFields
    ) {
      if (
        Object.prototype
          .hasOwnProperty.call(
            changes,
            field
          )
      ) {
        throw _error(
          "RUNBOOK_EXECUTION_IDENTITY_IMMUTABLE",
          `Runbook execution field "${field}" is immutable`
        );
      }
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
              UPDATE execution.runbook_executions
              SET
                ${assignments.join(", ")}
              WHERE execution_id = $1
              RETURNING *
            `,
            values
          );

        return result.rows[0]
          ? _mapRow(
              result.rows[0],
              scope
            )
          : null;
      }
    );
  }

  async appendStepAttempt(
    scope = {},
    attempt
  ) {
    _requireScope(scope);

    _require(
      scope.executionId,
      "executionId"
    );

    return this.tenantScope.run(
      scope,

      async (client) => {
        const result =
          await client.query(
            `
              UPDATE execution.runbook_executions
              SET
                step_attempts =
                  step_attempts ||
                  $2::jsonb
              WHERE execution_id = $1
              RETURNING *
            `,
            [
              scope.executionId,

              _json([
                attempt,
              ]),
            ]
          );

        return result.rows[0]
          ? _mapRow(
              result.rows[0],
              scope
            )
          : null;
      }
    );
  }

  async listByIncident(
    scope = {}
  ) {
    _requireScope(scope);

    _require(
      scope.incidentId,
      "incidentId"
    );

    return this.tenantScope.run(
      scope,

      async (client) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM execution.runbook_executions
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

async function _resolveRunbookVersionId(
  client,
  input
) {
  const result =
    await client.query(
      `
        SELECT
          rv.id

        FROM knowledge.runbook_versions rv

        JOIN knowledge.runbook_definitions rd
          ON rd.id =
             rv.runbook_definition_id

        WHERE
          rd.runbook_key = $1

          AND rv.semver = $2

          AND rd.status <> 'RETIRED'

          AND (
            (
              rv.scope_type = 'ENVIRONMENT'
              AND rv.organization_id = $3
              AND rv.environment_id = $4
            )

            OR

            (
              rv.scope_type = 'ORGANIZATION'
              AND rv.organization_id = $3
              AND rv.environment_id IS NULL
            )

            OR

            (
              rv.scope_type = 'GLOBAL'
              AND rv.organization_id IS NULL
              AND rv.environment_id IS NULL
            )
          )

        ORDER BY
          CASE rv.scope_type
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
        input.runbookId,

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

async function _resolveParentPlaybookExecution(
  client,
  input,
  resolved
) {
  if (!input.playbookExecutionId) {
    return null;
  }

  const result =
    await client.query(
      `
        SELECT id
        FROM execution.playbook_executions
        WHERE (
          id::text = $1
          OR execution_id = $1
          OR public_id = $1
        )
          AND organization_id = $2
          AND environment_id = $3
        LIMIT 1
      `,
      [
        String(
          input.playbookExecutionId
        ),

        resolved.organizationUuid,

        resolved.environmentUuid,
      ]
    );

  return result.rows[0]?.id || null;
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

    playbookExecutionId:
      row.playbook_execution_id,

    playbookExecutionPublicId:
      row.playbook_execution_public_id,

    runbookId:
      row.runbook_id,

    runbookVersion:
      row.runbook_version,

    runbookVersionId:
      row.runbook_version_id,

    versionRef:
      row.version_ref,

    runbookChecksum:
      row.runbook_checksum,

    runbookSnapshot:
      row.runbook_snapshot || {},

    resolvedParameters:
      row.resolved_parameters || [],

    policyDecision:
      row.policy_decision || {},

    approvalId:
      row.approval_id,

    approver:
      row.approver,

    approvedAt:
      row.approved_at,

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
        : Number(
            row.duration_ms
          ),

    initiatedBy:
      row.initiated_by,

    initiatorType:
      row.initiator_type,

    stepAttempts:
      row.step_attempts || [],

    verificationResult:
      row.verification_result || {},

    rollbackState:
      row.rollback_state || {},

    preExecutionState:
      row.pre_execution_state || {},

    postExecutionState:
      row.post_execution_state || {},

    auditEventIds:
      row.audit_event_ids || [],

    decisionTraceId:
      row.decision_trace_id,

    failedStepId:
      row.failed_step_id,

    errorMessage:
      row.error_message,

    errorCode:
      row.error_code,

    requiresHumanReview:
      Boolean(
        row.requires_human_review
      ),

    escalated:
      Boolean(
        row.escalated
      ),

    escalatedAt:
      row.escalated_at,

    escalationReason:
      row.escalation_reason,

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
  field
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    throw _error(
      "POSTGRES_RUNBOOK_EXECUTION_REQUIRED_FIELD",
      `${field} is required`
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
  PostgresRunbookExecutionRepository;