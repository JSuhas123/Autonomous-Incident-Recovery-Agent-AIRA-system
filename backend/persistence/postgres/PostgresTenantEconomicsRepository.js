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


class PostgresTenantEconomicsRepository {

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
        "ECONOMICS_ORGANIZATION_NOT_FOUND",
        404
      );
    }


    return result.rows[0];
  }


  // ==========================================================================
  // COMMERCIAL CONTEXT
  // ==========================================================================

  async getCommercialContext(
    client,
    organizationUuid,
    currency
  ) {
    const result =
      await client.query(
        `
          SELECT
            s.id AS subscription_id,

            s.plan AS subscription_plan,

            s.plan_version_id,

            s.price_id,

            s.status AS subscription_status,

            s.billing_interval,

            s.currency AS subscription_currency,

            p.code AS plan_code,

            pr.currency AS price_currency,

            pr.amount_minor

          FROM tenancy.subscriptions s

          LEFT JOIN billing.plan_versions pv
            ON pv.id =
              s.plan_version_id

          LEFT JOIN billing.plans p
            ON p.id =
              pv.plan_id

          LEFT JOIN billing.prices pr
            ON pr.id =
              s.price_id

          WHERE
            s.organization_id = $1

          ORDER BY
            s.started_at DESC NULLS LAST

          LIMIT 1
        `,
        [
          organizationUuid,
        ]
      );


    const row =
      result.rows[0];


    if (
      !row
    ) {
      return {
        subscriptionId:
          null,

        planCode:
          null,

        planVersionId:
          null,

        priceId:
          null,

        subscriptionStatus:
          null,

        billingInterval:
          null,

        currency,

        subscriptionRevenueMinor:
          0,
      };
    }


    if (
      row.price_currency &&
      row.price_currency !==
        currency
    ) {
      throw createError(
        "Subscription price currency does not match economics currency",
        "ECONOMICS_CURRENCY_MISMATCH",
        422,
        {
          requestedCurrency:
            currency,

          priceCurrency:
            row.price_currency,
        }
      );
    }


    return {
      subscriptionId:
        row.subscription_id,

      planCode:
        row.plan_code ||
        row.subscription_plan ||
        null,

      planVersionId:
        row.plan_version_id,

      priceId:
        row.price_id,

      subscriptionStatus:
        row.subscription_status,

      billingInterval:
        row.billing_interval,

      currency:
        row.price_currency ||
        row.subscription_currency ||
        currency,

      subscriptionRevenueMinor:
        row.amount_minor ===
          null ||
        row.amount_minor ===
          undefined
          ? 0
          : Number(
              row.amount_minor
            ),
    };
  }


  // ==========================================================================
  // COST BREAKDOWN
  // ==========================================================================

  async getCostBreakdown({
    client,

    organizationUuid,

    currency,

    periodStart,

    periodEnd,
  }) {
    const result =
      await client.query(
        `
          SELECT
            category,

            COALESCE(
              SUM(
                amount_minor
              ),
              0
            )::BIGINT AS amount_minor

          FROM billing.cost_events

          WHERE
            organization_id = $1
            AND currency = $2
            AND occurred_at >= $3
            AND occurred_at < $4

          GROUP BY category
        `,
        [
          organizationUuid,

          currency,

          periodStart,

          periodEnd,
        ]
      );


    const breakdown = {
      LLM:
        0,

      COMPUTE:
        0,

      STORAGE:
        0,

      NETWORK:
        0,

      VECTOR:
        0,

      NOTIFICATION:
        0,

      DATABASE:
        0,

      PAYMENT_PROCESSING:
        0,

      OTHER:
        0,
    };


    for (
      const row
      of result.rows
    ) {
      const category =
        row.category;


      if (
        Object.prototype
          .hasOwnProperty
          .call(
            breakdown,
            category
          )
      ) {
        breakdown[
          category
        ] =
          Number(
            row.amount_minor
          );
      } else {
        breakdown.OTHER +=
          Number(
            row.amount_minor
          );
      }
    }


    return breakdown;
  }


  // ==========================================================================
  // SNAPSHOT
  // ==========================================================================

  async insertSnapshot({
    client,

    organizationUuid,

    commercial,

    currency,

    periodStart,

    periodEnd,

    revenue,

    costs,

    grossProfitMinor,

    grossMarginBasisPoints,

    revenueSource,

    costSource,

    calculationVersion,

    metadata,
  }) {
    const snapshotId =
      "econ_" +
      crypto
        .randomUUID();


    const result =
      await client.query(
        `
          INSERT INTO billing.tenant_economics_snapshots (
            snapshot_id,

            organization_id,

            subscription_id,

            plan_code,

            plan_version_id,

            price_id,

            currency,

            period_start,

            period_end,

            subscription_revenue_minor,

            usage_revenue_minor,

            adjustment_revenue_minor,

            total_revenue_minor,

            llm_cost_minor,

            compute_cost_minor,

            storage_cost_minor,

            network_cost_minor,

            vector_cost_minor,

            notification_cost_minor,

            database_cost_minor,

            payment_processing_cost_minor,

            other_cost_minor,

            total_cost_minor,

            gross_profit_minor,

            gross_margin_basis_points,

            revenue_source,

            cost_source,

            calculation_version,

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

            $23,

            $24,

            $25,

            $26,

            $27,

            $28,

            $29::jsonb
          )

          ON CONFLICT (
            organization_id,
            currency,
            period_start,
            period_end,
            calculation_version
          )

          DO NOTHING

          RETURNING *
        `,
        [
          snapshotId,

          organizationUuid,

          commercial
            .subscriptionId,

          commercial
            .planCode,

          commercial
            .planVersionId,

          commercial
            .priceId,

          currency,

          periodStart,

          periodEnd,

          revenue
            .subscriptionRevenueMinor,

          revenue
            .usageRevenueMinor,

          revenue
            .adjustmentRevenueMinor,

          revenue
            .totalRevenueMinor,

          costs
            .LLM,

          costs
            .COMPUTE,

          costs
            .STORAGE,

          costs
            .NETWORK,

          costs
            .VECTOR,

          costs
            .NOTIFICATION,

          costs
            .DATABASE,

          costs
            .PAYMENT_PROCESSING,

          costs
            .OTHER,

          costs
            .total,

          grossProfitMinor,

          grossMarginBasisPoints,

          revenueSource,

          costSource,

          calculationVersion,

          JSON.stringify(
            metadata ||
            {}
          ),
        ]
      );


    if (
      result.rows[0]
    ) {
      return {
        created:
          true,

        snapshot:
          result.rows[0],
      };
    }


    const existing =
      await client.query(
        `
          SELECT *

          FROM billing.tenant_economics_snapshots

          WHERE
            organization_id = $1
            AND currency = $2
            AND period_start = $3
            AND period_end = $4
            AND calculation_version = $5

          LIMIT 1
        `,
        [
          organizationUuid,

          currency,

          periodStart,

          periodEnd,

          calculationVersion,
        ]
      );


    return {
      created:
        false,

      snapshot:
        existing.rows[0],
    };
  }


  async calculateAndStore({
    organizationId,

    currency,

    periodStart,

    periodEnd,

    usageRevenueMinor =
      0,

    adjustmentRevenueMinor =
      0,

    revenueSource,

    costSource,

    calculationVersion,

    calculateGrossProfitMinor,

    calculateGrossMarginBasisPoints,

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


      const commercial =
        await this
          .getCommercialContext(
            client,
            organization.id,
            currency
          );


      const costs =
        await this
          .getCostBreakdown({
            client,

            organizationUuid:
              organization.id,

            currency,

            periodStart,

            periodEnd,
          });


      costs.total =
        Object.values(
          costs
        )
          .reduce(
            (
              total,
              value
            ) =>
              total +
              Number(
                value
              ),
            0
          );


      const revenue = {
        subscriptionRevenueMinor:
          Number(
            commercial
              .subscriptionRevenueMinor ||
            0
          ),

        usageRevenueMinor:
          Number(
            usageRevenueMinor
          ),

        adjustmentRevenueMinor:
          Number(
            adjustmentRevenueMinor
          ),
      };


      revenue.totalRevenueMinor =
        revenue
          .subscriptionRevenueMinor +
        revenue
          .usageRevenueMinor +
        revenue
          .adjustmentRevenueMinor;


      const grossProfitMinor =
        calculateGrossProfitMinor({
          revenueMinor:
            revenue
              .totalRevenueMinor,

          costMinor:
            costs.total,
        });


      const grossMarginBasisPoints =
        calculateGrossMarginBasisPoints({
          revenueMinor:
            revenue
              .totalRevenueMinor,

          grossProfitMinor,
        });


      const stored =
        await this
          .insertSnapshot({
            client,

            organizationUuid:
              organization.id,

            commercial,

            currency,

            periodStart,

            periodEnd,

            revenue,

            costs,

            grossProfitMinor,

            grossMarginBasisPoints,

            revenueSource,

            costSource,

            calculationVersion,

            metadata,
          });


      await client.query(
        "COMMIT"
      );


      return {
        ...stored,

        organization: {
          id:
            organization.id,

          publicId:
            organization.public_id,
        },

        revenue,

        costs,

        grossProfitMinor,

        grossMarginBasisPoints,
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


  async getLatest(
    organizationId
  ) {
    const result =
      await this.pool
        .query(
          `
            SELECT
              tes.*,

              o.public_id AS organization_public_id

            FROM billing.tenant_economics_snapshots tes

            JOIN tenancy.organizations o
              ON o.id =
                tes.organization_id

            WHERE
              tes.organization_id::text = $1
              OR o.public_id = $1
              OR o.legacy_mongo_id = $1

            ORDER BY
              tes.period_end DESC,
              tes.calculated_at DESC

            LIMIT 1
          `,
          [
            String(
              organizationId
            ),
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }
}


module.exports =
  PostgresTenantEconomicsRepository;