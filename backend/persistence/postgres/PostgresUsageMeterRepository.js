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


const ORGANIZATION_SCOPE_ENVIRONMENT_ID =
  "00000000-0000-0000-0000-000000000000";


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


class PostgresUsageMeterRepository {

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
        "USAGE_ORGANIZATION_NOT_FOUND",
        404,
        {
          organizationId,
        }
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
          SELECT
            id,
            public_id,
            legacy_mongo_id,
            organization_id

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
        "USAGE_ENVIRONMENT_NOT_FOUND",
        404,
        {
          organizationId:
            organizationUuid,

          environmentId,
        }
      );
    }


    return result.rows[0];
  }


  async resolveMeter(
    client,
    meterCode
  ) {
    const result =
      await client.query(
        `
          SELECT
            id,
            meter_code,
            version,
            unit,
            aggregation_type,
            billable,
            economic,
            status

          FROM billing.meter_definitions

          WHERE
            meter_code = $1
            AND status = 'active'

          ORDER BY
            version DESC

          LIMIT 1
        `,
        [
          meterCode,
        ]
      );


    if (
      !result.rows[0]
    ) {
      throw createError(
        "Unknown billing meter",
        "BILLING_METER_UNKNOWN",
        422,
        {
          meterCode,
        }
      );
    }


    return result.rows[0];
  }


  async recordUsage({
    organizationId,

    environmentId =
      null,

    meterCode,

    quantity,

    idempotencyKey,

    sourceType,

    sourceId =
      null,

    correlationId =
      null,

    incidentId =
      null,

    executionRequestId =
      null,

    recoveryDecisionId =
      null,

    agentRunId =
      null,

    integrationId =
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


      const meter =
        await this
          .resolveMeter(
            client,
            meterCode
          );


      const eventId =
        "usage_" +
        crypto
          .randomUUID();


      const usageInsert =
        await client.query(
          `
            INSERT INTO billing.usage_events (
              event_id,

              organization_id,
              environment_id,

              meter_definition_id,
              meter_code,
              meter_version,

              quantity,

              idempotency_key,

              source_type,
              source_id,

              correlation_id,

              incident_id,
              execution_request_id,
              recovery_decision_id,

              agent_run_id,
              integration_id,

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

              $18::jsonb
            )

            ON CONFLICT (
              organization_id,
              meter_code,
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

            meter.id,

            meter.meter_code,

            meter.version,

            quantity,

            idempotencyKey,

            sourceType,

            sourceId,

            correlationId,

            incidentId,

            executionRequestId,

            recoveryDecisionId,

            agentRunId,

            integrationId,

            occurredAt,

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


      if (
        !usageInsert.rows[0]
      ) {
        const existing =
          await client.query(
            `
              SELECT *
              FROM billing.usage_events

              WHERE
                organization_id = $1
                AND meter_code = $2
                AND idempotency_key = $3

              LIMIT 1
            `,
            [
              organization.id,
              meter.meter_code,
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


      const usageEvent =
        usageInsert.rows[0];


      const outboxEventId =
        "billing_usage_" +
        usageEvent
          .event_id;


      await client.query(
        `
          INSERT INTO billing.event_outbox (
            event_id,

            organization_id,

            event_type,

            aggregate_type,

            aggregate_id,

            payload
          )
          VALUES (
            $1,
            $2,
            'billing.usage.recorded',
            'usage_event',
            $3,
            $4::jsonb
          )

          ON CONFLICT (
            event_id
          )
          DO NOTHING
        `,
        [
          outboxEventId,

          organization.id,

          usageEvent
            .event_id,

          JSON.stringify({
            usageEventId:
              usageEvent
                .event_id,

            organizationId:
              organization
                .public_id ||
              organization
                .legacy_mongo_id ||
              String(
                organization.id
              ),

            environmentId:
              environment
                ?.public_id ||
              environment
                ?.legacy_mongo_id ||
              (
                environment
                  ?.id
                  ? String(
                      environment.id
                    )
                  : null
              ),

            meterCode:
              meter
                .meter_code,

            meterVersion:
              meter
                .version,

            quantity:
              String(
                usageEvent
                  .quantity
              ),

            sourceType,

            sourceId,

            occurredAt:
              usageEvent
                .occurred_at,
          }),
        ]
      );


      await client.query(
        "COMMIT"
      );


      return {
        created:
          true,

        duplicate:
          false,

        event:
          usageEvent,
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
        // Original error remains authoritative.
      }


      throw error;

    } finally {
      client.release();
    }
  }


  async findByIdempotencyKey({
    organizationId,
    meterCode,
    idempotencyKey,
  }) {
    const client =
      await this.pool
        .connect();


    try {
      const organization =
        await this
          .resolveOrganization(
            client,
            organizationId
          );


      const result =
        await client.query(
          `
            SELECT *
            FROM billing.usage_events

            WHERE
              organization_id = $1
              AND meter_code = $2
              AND idempotency_key = $3

            LIMIT 1
          `,
          [
            organization.id,
            meterCode,
            idempotencyKey,
          ]
        );


      return (
        result.rows[0] ||
        null
      );

    } finally {
      client.release();
    }
  }


  async listUsage({
    organizationId,

    environmentId =
      null,

    meterCode =
      null,

    from =
      null,

    to =
      null,

    limit =
      1000,
  }) {
    const client =
      await this.pool
        .connect();


    try {
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


      const values = [
        organization.id,
      ];


      const where = [
        "organization_id = $1",
      ];


      if (
        environment
      ) {
        values.push(
          environment.id
        );

        where.push(
          `environment_id = $${values.length}`
        );
      }


      if (
        meterCode
      ) {
        values.push(
          meterCode
        );

        where.push(
          `meter_code = $${values.length}`
        );
      }


      if (
        from
      ) {
        values.push(
          from
        );

        where.push(
          `occurred_at >= $${values.length}`
        );
      }


      if (
        to
      ) {
        values.push(
          to
        );

        where.push(
          `occurred_at < $${values.length}`
        );
      }


      values.push(
        Math.min(
          Math.max(
            Number(
              limit
            ) ||
            1000,
            1
          ),
          10000
        )
      );


      const result =
        await client.query(
          `
            SELECT *
            FROM billing.usage_events

            WHERE
              ${where.join(
                "\nAND "
              )}

            ORDER BY
              occurred_at DESC,
              recorded_at DESC

            LIMIT $${values.length}
          `,
          values
        );


      return result.rows;

    } finally {
      client.release();
    }
  }
  async getPeriodQuantity({
  organizationId,

  meterCode,

  periodStart,

  periodEnd,
}) {
  const client =
    await this.pool
      .connect();


  try {
    const organization =
      await this
        .resolveOrganization(
          client,
          organizationId
        );


    const meter =
      await this
        .resolveMeter(
          client,
          meterCode
        );


    const result =
      await client.query(
        `
          SELECT
            CASE

              WHEN $5 IN (
                'SUM',
                'COUNT'
              )
              THEN COALESCE(
                SUM(quantity),
                0
              )

              WHEN $5 = 'MAX'
              THEN COALESCE(
                MAX(quantity),
                0
              )

              WHEN $5 = 'LATEST'
              THEN COALESCE(
                (
                  ARRAY_AGG(
                    quantity
                    ORDER BY
                      occurred_at DESC,
                      recorded_at DESC
                  )
                )[1],
                0
              )

              ELSE COALESCE(
                SUM(quantity),
                0
              )

            END AS quantity

          FROM billing.usage_events

          WHERE
            organization_id = $1
            AND meter_code = $2
            AND occurred_at >= $3
            AND occurred_at < $4
        `,
        [
          organization.id,

          meterCode,

          periodStart,

          periodEnd,

          meter
            .aggregation_type,
        ]
      );


    return Number(
      result.rows[0]
        ?.quantity ||
      0
    );

  } finally {
    client.release();
  }
}
}


module.exports = {
  PostgresUsageMeterRepository,

  ORGANIZATION_SCOPE_ENVIRONMENT_ID,
};