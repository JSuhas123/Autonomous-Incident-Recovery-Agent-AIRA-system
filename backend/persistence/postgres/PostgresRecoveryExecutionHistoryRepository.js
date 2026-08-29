"use strict";

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


/*
 * ============================================================================
 * AIRA PHASE 19.12
 * RECOVERY EXECUTION HISTORY REPOSITORY
 * ============================================================================
 *
 * READ-ONLY coverage adapter over Phase 18 canonical execution history:
 *
 *   execution.playbook_executions
 *   execution.runbook_executions
 *
 * Does NOT create execution history.
 * Does NOT authorize execution.
 * Does NOT duplicate execution persistence.
 * ============================================================================
 */


class PostgresRecoveryExecutionHistoryRepository {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  /*
   * ==========================================================================
   * PLAYBOOK HISTORY
   * ==========================================================================
   */


  async listPlaybookExecutions(
    input = {},
    transaction = null
  ) {
    requireScope(
      input
    );

    requireText(
      input.playbookId,
      "playbookId is required",
      "COVERAGE_PLAYBOOK_ID_REQUIRED"
    );


    const limit =
      normalizeLimit(
        input.limit
      );


    return this.tenantScope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const values = [
          resolved
            .organizationUuid,

          resolved
            .environmentUuid,

          input.playbookId,
        ];


        const predicates = [
          "organization_id = $1",

          "environment_id = $2",

          "playbook_id = $3",
        ];


        if (
          input.playbookVersion
        ) {
          values.push(
            input.playbookVersion
          );

          predicates.push(
            `playbook_version = $${values.length}`
          );
        }


        values.push(
          limit
        );

        const limitPosition =
          values.length;


        const result =
          await client.query(
            `
              SELECT
                *

              FROM
                execution.playbook_executions

              WHERE
                ${predicates.join(
                  "\nAND "
                )}

              ORDER BY
                created_at DESC

              LIMIT
                $${limitPosition}
            `,
            values
          );


        return result.rows.map(
          mapPlaybookExecution
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * RUNBOOK HISTORY
   * ==========================================================================
   */


  async listRunbookExecutions(
    input = {},
    transaction = null
  ) {
    requireScope(
      input
    );

    requireText(
      input.runbookId,
      "runbookId is required",
      "COVERAGE_RUNBOOK_ID_REQUIRED"
    );


    const limit =
      normalizeLimit(
        input.limit
      );


    return this.tenantScope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const values = [
          resolved
            .organizationUuid,

          resolved
            .environmentUuid,

          input.runbookId,
        ];


        const predicates = [
          "organization_id = $1",

          "environment_id = $2",

          "runbook_id = $3",
        ];


        if (
          input.runbookVersion
        ) {
          values.push(
            input.runbookVersion
          );

          predicates.push(
            `runbook_version = $${values.length}`
          );
        }


        values.push(
          limit
        );

        const limitPosition =
          values.length;


        const result =
          await client.query(
            `
              SELECT
                *

              FROM
                execution.runbook_executions

              WHERE
                ${predicates.join(
                  "\nAND "
                )}

              ORDER BY
                created_at DESC

              LIMIT
                $${limitPosition}
            `,
            values
          );


        return result.rows.map(
          mapRunbookExecution
        );
      },

      transaction
    );
  }
}


/*
 * ============================================================================
 * DOMAIN MAPPING
 * ============================================================================
 */


function mapPlaybookExecution(
  row
) {
  return {
    id:
      row.id,

    publicId:
      row.public_id,

    executionId:
      row.execution_id,

    playbookId:
      row.playbook_id,

    playbookVersion:
      row.playbook_version,

    playbookVersionId:
      row.playbook_version_id,

    status:
      row.status,

    durationMs:
      nullableNumber(
        row.duration_ms
      ),

    verificationResult:
      row.outcome
        ?.verification ||
      null,

    outcome:
      row.outcome ||
      {},

    rollback:
      row.rollback ||
      {},

    escalation:
      row.escalation ||
      {},

    requiresHumanReview:
      row.requires_human_review ===
      true,

    escalated:
      detectPlaybookEscalation(
        row
      ),

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,

    createdAt:
      row.created_at,

    historicalEvidenceOnly:
      true,

    executionAuthorized:
      false,
  };
}


function mapRunbookExecution(
  row
) {
  return {
    id:
      row.id,

    publicId:
      row.public_id,

    executionId:
      row.execution_id,

    playbookExecutionId:
      row.playbook_execution_id,

    runbookId:
      row.runbook_id,

    runbookVersion:
      row.runbook_version,

    runbookVersionId:
      row.runbook_version_id,

    status:
      row.status,

    durationMs:
      nullableNumber(
        row.duration_ms
      ),

    verificationResult:
      row.verification_result ||
      null,

    rollbackState:
      row.rollback_state ||
      {},

    requiresHumanReview:
      row.requires_human_review ===
      true,

    escalated:
      row.escalated ===
      true,

    escalationReason:
      row.escalation_reason ||
      null,

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,

    createdAt:
      row.created_at,

    historicalEvidenceOnly:
      true,

    executionAuthorized:
      false,
  };
}


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */


function detectPlaybookEscalation(
  row
) {
  if (
    row.status ===
    "ESCALATED"
  ) {
    return true;
  }


  if (
    row.requires_human_review ===
    true
  ) {
    return true;
  }


  return (
    row.escalation
      ?.triggered ===
      true ||
    row.escalation
      ?.escalated ===
      true
  );
}


function nullableNumber(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }


  const number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )
    ? number
    : null;
}


function normalizeLimit(
  value
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 100;
  }


  return Math.min(
    Math.max(
      parsed,
      1
    ),
    1000
  );
}


function requireScope(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw createError(
      "Recovery history requires organizationId and environmentId",
      "COVERAGE_HISTORY_SCOPE_REQUIRED"
    );
  }
}


function requireText(
  value,
  message,
  code
) {
  if (
    typeof value !==
      "string" ||
    value.trim() ===
      ""
  ) {
    throw createError(
      message,
      code
    );
  }
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

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  PostgresRecoveryExecutionHistoryRepository;