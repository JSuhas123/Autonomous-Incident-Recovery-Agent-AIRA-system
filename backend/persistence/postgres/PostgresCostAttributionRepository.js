"use strict";

const crypto =
  require(
    "node:crypto"
  );

const {
  getPostgresPool,
} =
  require(
    "./postgresPool"
  );


function createError(
  message,
  code,
  status = 500,
  metadata = {}
) {
  const error =
    new Error(
      message
    );

  error.code =
    code;

  error.status =
    status;

  Object.assign(
    error,
    metadata
  );

  return error;
}


class PostgresCostAttributionRepository {

  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      getPostgresPool();
  }


  async resolveOrganization(
    client,
    organizationId
  ) {
    const result =
      await client.query(
        `
          SELECT
            id,
            public_id,
            legacy_mongo_id

          FROM tenancy.organizations

          WHERE
            id::text = $1
            OR public_id = $1
            OR legacy_mongo_id = $1

          LIMIT 1
        `,
        [
          String(
            organizationId
          ),
        ]
      );


    if (
      !result.rows[0]
    ) {
      throw createError(
        "Organization not found",
        "COST_ORGANIZATION_NOT_FOUND",
        404
      );
    }


    return result.rows[0];
  }


  async resolveEnvironment(
    client,
    organizationUuid,
    environmentId
  ) {
    if (
      !environmentId
    ) {
      return null;
    }


    const result =
      await client.query(
        `
          SELECT id
          FROM tenancy.environments

          WHERE
            organization_id = $1

            AND (
              id::text = $2
              OR public_id = $2
              OR legacy_mongo_id = $2
            )

          LIMIT 1
        `,
        [
          organizationUuid,

          String(
            environmentId
          ),
        ]
      );


    if (
      !result.rows[0]
    ) {
      throw createError(
        "Environment not found inside organization",
        "COST_ENVIRONMENT_NOT_FOUND",
        404
      );
    }


    return result.rows[0];
  }


  async resolveCostDefinition(
    client,
    costCode
  ) {
    const result =
      await client.query(
        `
          SELECT
            id,
            cost_code,
            version,
            category,
            unit

          FROM billing.cost_definitions

          WHERE
            cost_code = $1
            AND status = 'active'

          ORDER BY version DESC

          LIMIT 1
        `,
        [
          costCode,
        ]
      );


    if (
      !result.rows[0]
    ) {
      throw createError(
        "Unknown billing cost code",
        "BILLING_COST_CODE_UNKNOWN",
        422,
        {
          costCode,
        }
      );
    }


    return result.rows[0];
  }


  async recordCost({
    organizationId,

    environmentId =
      null,

    costCode,

    currency,

    amountMinor,

    quantity =
      null,

    idempotencyKey,

    sourceType,

    sourceId =
      null,

    correlationId =
      null,

    incidentId =
      null,

    agentRunId =
      null,

    executionRequestId =
      null,

    integrationId =
      null,

    provider =
      null,

    model =
      null,

    occurredAt =
      new Date(),

    metadata =
      {},
  }) {
    const client =
      await this.pool
        .connect();


    try {
      await client.query(
        "BEGIN"
      );


      const organization =
        await this
          .resolveOrganization(
            client,
            organizationId
          );


      const environment =
        await this
          .resolveEnvironment(
            client,
            organization.id,
            environmentId
          );


      const definition =
        await this
          .resolveCostDefinition(
            client,
            costCode
          );


      const eventId =
        "cost_" +
        crypto
          .randomUUID();


      const result =
        await client.query(
          `
            INSERT INTO billing.cost_events (
              event_id,

              organization_id,
              environment_id,

              cost_definition_id,

              cost_code,
              cost_version,
              category,

              currency,
              amount_minor,

              quantity,
              unit,

              idempotency_key,

              source_type,
              source_id,

              correlation_id,

              incident_id,
              agent_run_id,
              execution_request_id,
              integration_id,

              provider,
              model,

              occurred_at,

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
              $17,
              $18,
              $19,

              $20,
              $21,

              $22,

              $23::jsonb
            )

            ON CONFLICT (
              organization_id,
              cost_code,
              idempotency_key
            )
            DO NOTHING

            RETURNING *
          `,
          [
            eventId,

            organization.id,

            environment
              ?.id ||
            null,

            definition.id,

            definition.cost_code,

            definition.version,

            definition.category,

            currency,

            amountMinor,

            quantity,

            definition.unit,

            idempotencyKey,

            sourceType,

            sourceId,

            correlationId,

            incidentId,

            agentRunId,

            executionRequestId,

            integrationId,

            provider,

            model,

            occurredAt,

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


      if (
        !result.rows[0]
      ) {
        const existing =
          await client.query(
            `
              SELECT *
              FROM billing.cost_events

              WHERE
                organization_id = $1
                AND cost_code = $2
                AND idempotency_key = $3

              LIMIT 1
            `,
            [
              organization.id,

              definition
                .cost_code,

              idempotencyKey,
            ]
          );


        await client.query(
          "COMMIT"
        );


        return {
          created:
            false,

          duplicate:
            true,

          event:
            existing.rows[0],
        };
      }


      await client.query(
        "COMMIT"
      );


      return {
        created:
          true,

        duplicate:
          false,

        event:
          result.rows[0],
      };

    } catch (
      error
    ) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (
        _rollbackError
      ) {
        // Preserve original failure.
      }


      throw error;

    } finally {
      client.release();
    }
  }


  async rebuildPeriodAggregates({
    organizationId,

    periodStart,

    periodEnd,
  }) {
    const client =
      await this.pool
        .connect();


    try {
      await client.query(
        "BEGIN"
      );


      const organization =
        await this
          .resolveOrganization(
            client,
            organizationId
          );


      await client.query(
        `
          DELETE FROM billing.cost_period_aggregates

          WHERE
            organization_id = $1
            AND period_start = $2
            AND period_end = $3
        `,
        [
          organization.id,

          periodStart,

          periodEnd,
        ]
      );


      const result =
        await client.query(
          `
            INSERT INTO billing.cost_period_aggregates (
              organization_id,

              category,

              currency,

              period_start,

              period_end,

              amount_minor,

              event_count,

              calculated_at
            )

            SELECT
              organization_id,

              category,

              currency,

              $2,

              $3,

              SUM(
                amount_minor
              ),

              COUNT(*)::BIGINT,

              NOW()

            FROM billing.cost_events

            WHERE
              organization_id = $1
              AND occurred_at >= $2
              AND occurred_at < $3

            GROUP BY
              organization_id,
              category,
              currency

            RETURNING *
          `,
          [
            organization.id,

            periodStart,

            periodEnd,
          ]
        );


      await client.query(
        "COMMIT"
      );


      return result.rows;

    } catch (
      error
    ) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (
        _rollbackError
      ) {
        // Preserve original error.
      }


      throw error;

    } finally {
      client.release();
    }
  }
}


module.exports =
  PostgresCostAttributionRepository;