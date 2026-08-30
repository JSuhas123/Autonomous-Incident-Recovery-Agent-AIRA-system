"use strict";

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );

const {
  sanitizeIntegrationValue,
} =
  require(
    "../../services/integrations/integrationSecurity"
  );


class PostgresIntegrationInvocationAuditRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  async append(
    input,
    transaction =
      null
  ) {
    validateInput(
      input
    );


    return this.scope.run(
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
        const safeMetadata =
          sanitizeIntegrationValue(
            input.metadata ||
            {}
          );


        const result =
          await client.query(
            `
              INSERT INTO
                integrations.invocation_audit (
                  invocation_id,

                  organization_id,
                  environment_id,

                  connection_id,
                  integration_public_id,

                  provider,
                  operation,
                  capability,

                  outcome,
                  attempt_count,
                  duration_ms,

                  error_code,

                  authorization_id,
                  execution_request_id,

                  metadata,

                  execution_authorized
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

                false
              )

              RETURNING *
            `,
            [
              String(
                input.invocationId
              ),

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.connectionId ||
              null,

              input.integrationPublicId ||
              null,

              String(
                input.provider
              )
                .trim()
                .toLowerCase(),

              String(
                input.operation
              ),

              input.capability ||
              null,

              normalizeOutcome(
                input.outcome
              ),

              normalizePositiveInteger(
                input.attemptCount,
                1
              ),

              normalizeNullableNonNegativeInteger(
                input.durationMs
              ),

              input.errorCode ||
              null,

              input.authorizationId ||
              null,

              input.executionRequestId ||
              null,

              JSON.stringify(
                safeMetadata
              ),
            ]
          );


        return mapAudit(
          result.rows[0]
        );
      },

      transaction
    );
  }


  async list(
    {
      organizationId,

      environmentId,

      integrationPublicId =
        null,

      provider =
        null,

      operation =
        null,

      limit =
        100,

      offset =
        0,
    },

    transaction =
      null
  ) {
    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM
                integrations.invocation_audit
              WHERE
                (
                  $1::text IS NULL
                  OR
                  integration_public_id = $1
                )

                AND

                (
                  $2::text IS NULL
                  OR
                  provider = $2
                )

                AND

                (
                  $3::text IS NULL
                  OR
                  operation = $3
                )

              ORDER BY
                created_at DESC,
                id DESC

              LIMIT $4
              OFFSET $5
            `,
            [
              integrationPublicId,

              provider
                ? String(
                    provider
                  )
                    .trim()
                    .toLowerCase()
                : null,

              operation,

              Math.min(
                Math.max(
                  Number(
                    limit
                  ) ||
                  100,
                  1
                ),
                500
              ),

              Math.max(
                Number(
                  offset
                ) ||
                0,
                0
              ),
            ]
          );


        return result.rows.map(
          mapAudit
        );
      },

      transaction
    );
  }
}


function validateInput(
  input
) {
  for (
    const field
    of [
      "organizationId",

      "environmentId",

      "invocationId",

      "provider",

      "operation",

      "outcome",
    ]
  ) {
    if (
      !input?.[
        field
      ]
    ) {
      throw Object.assign(
        new Error(
          `${field} is required for integration invocation audit`
        ),
        {
          code:
            "INTEGRATION_AUDIT_FIELD_REQUIRED",

          field,

          executionAuthorized:
            false,
        }
      );
    }
  }
}


function normalizeOutcome(
  value
) {
  const normalized =
    String(
      value
    )
      .trim()
      .toUpperCase();


  const allowed =
    new Set([
      "SUCCESS",
      "PARTIAL",
      "FAILED",
      "BLOCKED",
      "TIMEOUT",
      "CIRCUIT_OPEN",
    ]);


  if (
    !allowed.has(
      normalized
    )
  ) {
    throw Object.assign(
      new Error(
        `Invalid integration audit outcome "${normalized}"`
      ),
      {
        code:
          "INTEGRATION_AUDIT_OUTCOME_INVALID",

        executionAuthorized:
          false,
      }
    );
  }


  return normalized;
}


function normalizePositiveInteger(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  return Number.isInteger(
    parsed
  ) &&
  parsed >
    0
    ? parsed
    : fallback;
}


function normalizeNullableNonNegativeInteger(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }


  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  ) &&
  parsed >=
    0
    ? Math.floor(
        parsed
      )
    : null;
}


function mapAudit(
  row
) {
  return {
    id:
      row.id,

    invocationId:
      row.invocation_id,

    organizationId:
      row.organization_id,

    environmentId:
      row.environment_id,

    connectionId:
      row.connection_id,

    integrationPublicId:
      row.integration_public_id,

    provider:
      row.provider,

    operation:
      row.operation,

    capability:
      row.capability,

    outcome:
      row.outcome,

    attemptCount:
      Number(
        row.attempt_count
      ),

    durationMs:
      row.duration_ms ===
      null
        ? null
        : Number(
            row.duration_ms
          ),

    errorCode:
      row.error_code,

    authorizationId:
      row.authorization_id,

    executionRequestId:
      row.execution_request_id,

    metadata:
      row.metadata ||
      {},

    executionAuthorized:
      false,

    createdAt:
      row.created_at,
  };
}


module.exports =
  PostgresIntegrationInvocationAuditRepository;