"use strict";

const {
  getPostgresPool,
} =
  require(
    "../../persistence/postgres"
  );

const {
  ORGANIZATION_SCOPE_ENVIRONMENT_ID,
} =
  require(
    "../../persistence/postgres/PostgresUsageMeterRepository"
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


async function resolveOrganization(
  client,
  organizationId
) {
  const result =
    await client.query(
      `
        SELECT id
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
      404
    );
  }


  return result
    .rows[0]
    .id;
}


function validateRange(
  from,
  to
) {
  const start =
    new Date(
      from
    );


  const end =
    new Date(
      to
    );


  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    ) ||
    end <=
      start
  ) {
    throw createError(
      "Invalid usage aggregation range",
      "USAGE_AGGREGATION_RANGE_INVALID",
      422
    );
  }


  return {
    start,
    end,
  };
}


async function rebuildDailyAggregates({
  organizationId,

  from,

  to,
}) {
  const {
    start,
    end,
  } =
    validateRange(
      from,
      to
    );


  const pool =
    getPostgresPool();


  const client =
    await pool
      .connect();


  try {
    await client.query(
      "BEGIN"
    );


    const organizationUuid =
      await resolveOrganization(
        client,
        organizationId
      );


    await client.query(
      `
        DELETE FROM billing.usage_daily_aggregates

        WHERE
          organization_id = $1
          AND usage_date >=
              ($2::timestamptz AT TIME ZONE 'UTC')::date
          AND usage_date <
              ($3::timestamptz AT TIME ZONE 'UTC')::date
      `,
      [
        organizationUuid,
        start,
        end,
      ]
    );


    const result =
      await client.query(
        `
          INSERT INTO billing.usage_daily_aggregates (
            organization_id,

            environment_id,

            meter_definition_id,

            meter_code,

            meter_version,

            usage_date,

            quantity,

            event_count,

            first_occurred_at,

            last_occurred_at,

            calculated_at
          )

          SELECT
            organization_id,

            COALESCE(
              environment_id,
              $4::uuid
            ),

            meter_definition_id,

            meter_code,

            meter_version,

            (
              occurred_at
              AT TIME ZONE 'UTC'
            )::date,

            CASE
              WHEN md.aggregation_type IN (
                'SUM',
                'COUNT'
              )
                THEN SUM(
                  ue.quantity
                )

              WHEN md.aggregation_type = 'MAX'
                THEN MAX(
                  ue.quantity
                )

              WHEN md.aggregation_type = 'LATEST'
                THEN (
                  ARRAY_AGG(
                    ue.quantity
                    ORDER BY
                      ue.occurred_at DESC,
                      ue.recorded_at DESC
                  )
                )[1]

              ELSE SUM(
                ue.quantity
              )
            END,

            COUNT(*)::BIGINT,

            MIN(
              ue.occurred_at
            ),

            MAX(
              ue.occurred_at
            ),

            NOW()

          FROM billing.usage_events ue

          JOIN billing.meter_definitions md
            ON md.id =
              ue.meter_definition_id

          WHERE
            ue.organization_id = $1
            AND ue.occurred_at >= $2
            AND ue.occurred_at < $3

          GROUP BY
            ue.organization_id,

            COALESCE(
              ue.environment_id,
              $4::uuid
            ),

            ue.meter_definition_id,

            ue.meter_code,

            ue.meter_version,

            (
              ue.occurred_at
              AT TIME ZONE 'UTC'
            )::date,

            md.aggregation_type

          RETURNING *
        `,
        [
          organizationUuid,
          start,
          end,
          ORGANIZATION_SCOPE_ENVIRONMENT_ID,
        ]
      );


    await client.query(
      "COMMIT"
    );


    return {
      organizationId,

      from:
        start,

      to:
        end,

      aggregatesWritten:
        result.rowCount,

      aggregates:
        result.rows,
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
      // Preserve original error.
    }


    throw error;

  } finally {
    client.release();
  }
}


async function rebuildPeriodAggregates({
  organizationId,

  periodStart,

  periodEnd,
}) {
  const {
    start,
    end,
  } =
    validateRange(
      periodStart,
      periodEnd
    );


  const pool =
    getPostgresPool();


  const client =
    await pool
      .connect();


  try {
    await client.query(
      "BEGIN"
    );


    const organizationUuid =
      await resolveOrganization(
        client,
        organizationId
      );


    await client.query(
      `
        DELETE FROM billing.usage_period_aggregates

        WHERE
          organization_id = $1
          AND period_start = $2
          AND period_end = $3
      `,
      [
        organizationUuid,
        start,
        end,
      ]
    );


    const result =
      await client.query(
        `
          INSERT INTO billing.usage_period_aggregates (
            organization_id,

            environment_id,

            meter_definition_id,

            meter_code,

            meter_version,

            period_start,

            period_end,

            quantity,

            event_count,

            calculated_at
          )

          SELECT
            ue.organization_id,

            COALESCE(
              ue.environment_id,
              $4::uuid
            ),

            ue.meter_definition_id,

            ue.meter_code,

            ue.meter_version,

            $2,

            $3,

            CASE
              WHEN md.aggregation_type IN (
                'SUM',
                'COUNT'
              )
                THEN SUM(
                  ue.quantity
                )

              WHEN md.aggregation_type = 'MAX'
                THEN MAX(
                  ue.quantity
                )

              WHEN md.aggregation_type = 'LATEST'
                THEN (
                  ARRAY_AGG(
                    ue.quantity
                    ORDER BY
                      ue.occurred_at DESC,
                      ue.recorded_at DESC
                  )
                )[1]

              ELSE SUM(
                ue.quantity
              )
            END,

            COUNT(*)::BIGINT,

            NOW()

          FROM billing.usage_events ue

          JOIN billing.meter_definitions md
            ON md.id =
              ue.meter_definition_id

          WHERE
            ue.organization_id = $1
            AND ue.occurred_at >= $2
            AND ue.occurred_at < $3

          GROUP BY
            ue.organization_id,

            COALESCE(
              ue.environment_id,
              $4::uuid
            ),

            ue.meter_definition_id,

            ue.meter_code,

            ue.meter_version,

            md.aggregation_type

          RETURNING *
        `,
        [
          organizationUuid,
          start,
          end,
          ORGANIZATION_SCOPE_ENVIRONMENT_ID,
        ]
      );


    await client.query(
      "COMMIT"
    );


    return {
      organizationId,

      periodStart:
        start,

      periodEnd:
        end,

      aggregatesWritten:
        result.rowCount,

      aggregates:
        result.rows,
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
      // Preserve original error.
    }


    throw error;

  } finally {
    client.release();
  }
}


async function getPeriodUsage({
  organizationId,

  periodStart,

  periodEnd,
}) {
  const {
    start,
    end,
  } =
    validateRange(
      periodStart,
      periodEnd
    );


  const pool =
    getPostgresPool();


  const client =
    await pool
      .connect();


  try {
    const organizationUuid =
      await resolveOrganization(
        client,
        organizationId
      );


    const result =
      await client.query(
        `
          SELECT
            meter_code,

            meter_version,

            SUM(
              quantity
            ) AS quantity,

            SUM(
              event_count
            ) AS event_count

          FROM billing.usage_period_aggregates

          WHERE
            organization_id = $1
            AND period_start = $2
            AND period_end = $3

          GROUP BY
            meter_code,
            meter_version

          ORDER BY
            meter_code ASC
        `,
        [
          organizationUuid,
          start,
          end,
        ]
      );


    return result.rows;

  } finally {
    client.release();
  }
}


module.exports = {
  rebuildDailyAggregates,

  rebuildPeriodAggregates,

  getPeriodUsage,

  validateRange,
};