"use strict";

const {
  getPostgresPool,
} =
  require(
    "./postgresPool"
  );

  const {
  calculatePercentageDiscount,
} =
  require(
    "../../constants/financialAdjustments"
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


class PostgresInvoiceRepository {

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
        "INVOICE_ORGANIZATION_NOT_FOUND",
        404
      );
    }


    return result.rows[0];
  }


  async getSubscriptionContext(
    client,
    organizationUuid,
    currency
  ) {
    const result =
      await client.query(
        `
          SELECT
            s.id AS subscription_id,

            s.plan,

            s.status,

            s.plan_version_id,

            s.price_id,

            s.billing_interval,

            s.currency,

            pr.amount_minor AS
              subscription_amount_minor,

            pr.currency AS
              price_currency

          FROM tenancy.subscriptions s

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
      throw createError(
        "Subscription required for invoice generation",
        "INVOICE_SUBSCRIPTION_NOT_FOUND",
        422
      );
    }


    if (
      row.price_currency &&
      row.price_currency !==
        currency
    ) {
      throw createError(
        "Invoice currency does not match subscription price",
        "INVOICE_CURRENCY_MISMATCH",
        422,
        {
          invoiceCurrency:
            currency,

          priceCurrency:
            row.price_currency,
        }
      );
    }


    return {
      subscriptionId:
        row.subscription_id,

      plan:
        row.plan,

      status:
        row.status,

      planVersionId:
        row.plan_version_id,

      priceId:
        row.price_id,

      billingInterval:
        row.billing_interval,

      currency:
        row.price_currency ||
        row.currency ||
        currency,

      subscriptionAmountMinor:
        row.subscription_amount_minor ===
          null ||
        row.subscription_amount_minor ===
          undefined
          ? 0
          : Number(
              row.subscription_amount_minor
            ),
    };
  }


  async getUsageCharges({
    client,

    organizationUuid,

    planVersionId,

    currency,

    periodStart,

    periodEnd,
  }) {
    if (
      !planVersionId
    ) {
      return [];
    }


    const result =
      await client.query(
        `
          SELECT
            ur.meter_code,

            ur.amount_minor_per_unit,

            ur.included_entitlement_key,

            COALESCE(
              usage.quantity,
              0
            ) AS actual_quantity,

            COALESCE(
              ent.integer_value,
              0
            ) AS included_quantity,

            md.version AS meter_version

          FROM billing.usage_rates ur

          JOIN billing.meter_definitions md
            ON md.id =
              ur.meter_definition_id

          LEFT JOIN LATERAL (
              SELECT
                SUM(
                  upa.quantity
                ) AS quantity

              FROM billing.usage_period_aggregates upa

              WHERE
                upa.organization_id =
                  $1

                AND upa.meter_code =
                  ur.meter_code

                AND upa.period_start =
                  $4

                AND upa.period_end =
                  $5
          ) usage
            ON TRUE

          LEFT JOIN billing.entitlement_definitions ed
            ON ed.entitlement_key =
              ur.included_entitlement_key

          LEFT JOIN billing.plan_entitlements ent
            ON ent.plan_version_id =
              $2

           AND ent.entitlement_definition_id =
              ed.id

          WHERE
            ur.plan_version_id =
              $2

            AND ur.currency =
              $3

            AND ur.status =
              'active'

          ORDER BY
            ur.meter_code
        `,
        [
          organizationUuid,

          planVersionId,

          currency,

          periodStart,

          periodEnd,
        ]
      );


    return result.rows;
  }


  async nextInvoiceNumber(
    client,
    date =
      new Date()
  ) {
    const result =
      await client.query(
        `
          SELECT
            nextval(
              'billing.invoice_number_seq'
            ) AS sequence
        `
      );


    const sequence =
      String(
        result.rows[0]
          .sequence
      )
        .padStart(
          6,
          "0"
        );


    return (
      "AIRA-" +
      date.getUTCFullYear() +
      "-" +
      sequence
    );
  }


  async findExistingInvoice({
    client,

    organizationUuid,

    currency,

    periodStart,

    periodEnd,

    generationVersion,
  }) {
    const result =
      await client.query(
        `
          SELECT *

          FROM billing.invoices

          WHERE
            organization_id = $1

            AND currency = $2

            AND period_start = $3

            AND period_end = $4

            AND generation_version = $5

          LIMIT 1
        `,
        [
          organizationUuid,

          currency,

          periodStart,

          periodEnd,

          generationVersion,
        ]
      );


    return (
      result.rows[0] ||
      null
    );
  }

async applyFinancialAdjustments({
  client,

  invoice,

  organizationUuid,

  currency,

  subtotalMinor,

  lineNumber,
}) {
  let nextLineNumber =
    lineNumber;


  let discountMinor =
    0;


  let creditMinor =
    0;


  let debitMinor =
    0;


  const items =
    [];


  // ==========================================================================
  // DISCOUNTS
  // ==========================================================================

  const discounts =
    await client.query(
      `
        SELECT
          dg.*,

          (
            SELECT COUNT(*)

            FROM billing.invoice_financial_applications ifa

            WHERE
              ifa.application_type = 'DISCOUNT'
              AND ifa.source_id = dg.id
          ) AS application_count

        FROM billing.discount_grants dg

        WHERE
          dg.organization_id = $1

          AND dg.status = 'ACTIVE'

          AND dg.valid_from <= NOW()

          AND (
            dg.expires_at IS NULL
            OR dg.expires_at > NOW()
          )

          AND (
            dg.currency IS NULL
            OR dg.currency = $2
          )

        ORDER BY
          dg.created_at ASC
      `,
      [
        organizationUuid,

        currency,
      ]
    );


  for (
    const discount
    of discounts.rows
  ) {
    if (
      discount.max_applications !==
        null &&
      Number(
        discount.application_count
      ) >=
        Number(
          discount.max_applications
        )
    ) {
      continue;
    }


    let amount =
      0;


    if (
      discount.discount_type ===
        "FIXED"
    ) {
      amount =
        Number(
          discount
            .fixed_amount_minor
        );
    } else if (
      discount.discount_type ===
        "PERCENTAGE"
    ) {
      amount =
        calculatePercentageDiscount({
          subtotalMinor:

            Math.max(
              0,

              subtotalMinor -
              discountMinor
            ),

          percentageBasisPoints:
            Number(
              discount
                .percentage_basis_points
            ),
        });
    }


    amount =
      Math.min(
        amount,

        Math.max(
          0,

          subtotalMinor -
          discountMinor
        )
      );


    if (
      amount <=
        0
    ) {
      continue;
    }


    const item =
      await client.query(
        `
          INSERT INTO billing.invoice_items (
            invoice_id,

            line_number,

            item_type,

            description,

            quantity,

            unit_amount_minor,

            amount_minor,

            source_type,

            source_id,

            metadata
          )
          VALUES (
            $1,
            $2,
            'DISCOUNT',
            $3,
            1,
            $4,
            $4,
            'discount_grant',
            $5,
            $6::jsonb
          )

          RETURNING *
        `,
        [
          invoice.id,

          nextLineNumber++,

          "Discount — " +
          discount.reason,

          amount,

          discount.discount_code,

          JSON.stringify({
            discountType:
              discount
                .discount_type,

            discountCode:
              discount
                .discount_code,
          }),
        ]
      );


    await client.query(
      `
        INSERT INTO billing.invoice_financial_applications (
          invoice_id,

          organization_id,

          application_type,

          source_id,

          source_code,

          currency,

          amount_minor
        )
        VALUES (
          $1,
          $2,
          'DISCOUNT',
          $3,
          $4,
          $5,
          $6
        )
      `,
      [
        invoice.id,

        organizationUuid,

        discount.id,

        discount
          .discount_code,

        currency,

        amount,
      ]
    );


    discountMinor +=
      amount;


    items.push(
      item.rows[0]
    );
  }


  // ==========================================================================
  // CREDIT GRANTS
  // ==========================================================================

  const credits =
    await client.query(
      `
        SELECT
          cg.*,

          COALESCE(
            (
              SELECT SUM(
                ifa.amount_minor
              )

              FROM billing.invoice_financial_applications ifa

              WHERE
                ifa.application_type = 'CREDIT'

                AND ifa.source_id =
                  cg.id
            ),
            0
          ) AS applied_minor

        FROM billing.credit_grants cg

        WHERE
          cg.organization_id = $1

          AND cg.currency = $2

          AND cg.status = 'ACTIVE'

          AND cg.valid_from <= NOW()

          AND (
            cg.expires_at IS NULL
            OR cg.expires_at > NOW()
          )

        ORDER BY
          cg.created_at ASC
      `,
      [
        organizationUuid,

        currency,
      ]
    );


  for (
    const credit
    of credits.rows
  ) {
    const remainingCredit =
      Number(
        credit.amount_minor
      ) -
      Number(
        credit.applied_minor
      );


    const remainingInvoice =
      Math.max(
        0,

        subtotalMinor -
        discountMinor -
        creditMinor
      );


    const amount =
      Math.min(
        remainingCredit,

        remainingInvoice
      );


    if (
      amount <=
        0
    ) {
      continue;
    }


    const item =
      await client.query(
        `
          INSERT INTO billing.invoice_items (
            invoice_id,

            line_number,

            item_type,

            description,

            quantity,

            unit_amount_minor,

            amount_minor,

            source_type,

            source_id,

            metadata
          )
          VALUES (
            $1,
            $2,
            'CREDIT',
            $3,
            1,
            $4,
            $4,
            'credit_grant',
            $5,
            $6::jsonb
          )

          RETURNING *
        `,
        [
          invoice.id,

          nextLineNumber++,

          "Credit — " +
          credit.reason,

          amount,

          credit.credit_code,

          JSON.stringify({
            creditCode:
              credit.credit_code,
          }),
        ]
      );


    await client.query(
      `
        INSERT INTO billing.invoice_financial_applications (
          invoice_id,

          organization_id,

          application_type,

          source_id,

          source_code,

          currency,

          amount_minor
        )
        VALUES (
          $1,
          $2,
          'CREDIT',
          $3,
          $4,
          $5,
          $6
        )
      `,
      [
        invoice.id,

        organizationUuid,

        credit.id,

        credit
          .credit_code,

        currency,

        amount,
      ]
    );


    creditMinor +=
      amount;


    items.push(
      item.rows[0]
    );
  }


  // ==========================================================================
  // MANUAL ADJUSTMENTS
  // ==========================================================================

  const adjustments =
    await client.query(
      `
        SELECT *

        FROM billing.financial_adjustments

        WHERE
          organization_id = $1

          AND currency = $2

          AND status = 'PENDING'

          AND effective_at <= NOW()

        ORDER BY
          effective_at ASC,
          created_at ASC
      `,
      [
        organizationUuid,

        currency,
      ]
    );


  for (
    const adjustment
    of adjustments.rows
  ) {
    const amount =
      Number(
        adjustment
          .amount_minor
      );


    const isDebit =
      adjustment
        .adjustment_type ===
      "DEBIT";


    const applicationType =
      isDebit
        ? "ADJUSTMENT_DEBIT"
        : "ADJUSTMENT_CREDIT";


    const itemType =
      "ADJUSTMENT";


    const item =
      await client.query(
        `
          INSERT INTO billing.invoice_items (
            invoice_id,

            line_number,

            item_type,

            description,

            quantity,

            unit_amount_minor,

            amount_minor,

            source_type,

            source_id,

            metadata
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            1,
            $5,
            $5,
            'financial_adjustment',
            $6,
            $7::jsonb
          )

          RETURNING *
        `,
        [
          invoice.id,

          nextLineNumber++,

          itemType,

          adjustment
            .adjustment_type +
          " adjustment — " +
          adjustment.reason,

          amount,

          adjustment
            .adjustment_code,

          JSON.stringify({
            adjustmentCode:
              adjustment
                .adjustment_code,

            adjustmentType:
              adjustment
                .adjustment_type,
          }),
        ]
      );


    await client.query(
      `
        INSERT INTO billing.invoice_financial_applications (
          invoice_id,

          organization_id,

          application_type,

          source_id,

          source_code,

          currency,

          amount_minor
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
      `,
      [
        invoice.id,

        organizationUuid,

        applicationType,

        adjustment.id,

        adjustment
          .adjustment_code,

        currency,

        amount,
      ]
    );


    await client.query(
      `
        UPDATE billing.financial_adjustments

        SET status =
          'APPLIED'

        WHERE id =
          $1
      `,
      [
        adjustment.id,
      ]
    );


    if (
      isDebit
    ) {
      debitMinor +=
        amount;
    } else {
      creditMinor +=
        amount;
    }


    items.push(
      item.rows[0]
    );
  }


  return {
    items,

    nextLineNumber,

    discountMinor,

    creditMinor,

    debitMinor,
  };
}

  async generateInvoice({
    organizationId,

    currency,

    periodStart,

    periodEnd,

    generationVersion,

    calculateInvoiceTotal,

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


      const existing =
        await this
          .findExistingInvoice({
            client,

            organizationUuid:
              organization.id,

            currency,

            periodStart,

            periodEnd,

            generationVersion,
          });


      if (
        existing
      ) {
        const items =
          await client.query(
            `
              SELECT *

              FROM billing.invoice_items

              WHERE invoice_id = $1

              ORDER BY line_number
            `,
            [
              existing.id,
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

          invoice:
            existing,

          items:
            items.rows,
        };
      }


      const subscription =
        await this
          .getSubscriptionContext(
            client,
            organization.id,
            currency
          );


      const invoiceNumber =
        await this
          .nextInvoiceNumber(
            client
          );


      const invoiceInsert =
        await client.query(
          `
            INSERT INTO billing.invoices (
              invoice_number,

              organization_id,

              subscription_id,

              plan_version_id,

              price_id,

              currency,

              billing_interval,

              period_start,

              period_end,

              status,

              generation_version,

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
              'DRAFT',
              $10,
              $11::jsonb
            )

            RETURNING *
          `,
          [
            invoiceNumber,

            organization.id,

            subscription
              .subscriptionId,

            subscription
              .planVersionId,

            subscription
              .priceId,

            currency,

            subscription
              .billingInterval,

            periodStart,

            periodEnd,

            generationVersion,

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


      const invoice =
        invoiceInsert.rows[0];


      const items =
        [];


      let lineNumber =
        1;


      // ======================================================================
      // BASE SUBSCRIPTION
      // ======================================================================

      const subscriptionAmount =
        subscription
          .subscriptionAmountMinor;


      const subscriptionItem =
        await client.query(
          `
            INSERT INTO billing.invoice_items (
              invoice_id,

              line_number,

              item_type,

              description,

              quantity,

              unit_amount_minor,

              amount_minor,

              source_type,

              source_id,

              metadata
            )
            VALUES (
              $1,
              $2,
              'SUBSCRIPTION',
              $3,
              1,
              $4,
              $4,
              'subscription',
              $5,
              $6::jsonb
            )

            RETURNING *
          `,
          [
            invoice.id,

            lineNumber++,

            "AIRA " +
            String(
              subscription.plan ||
              "subscription"
            ) +
            " subscription",

            subscriptionAmount,

            subscription
              .subscriptionId,

            JSON.stringify({
              billingInterval:
                subscription
                  .billingInterval,

              priceId:
                subscription
                  .priceId,

              planVersionId:
                subscription
                  .planVersionId,
            }),
          ]
        );


      items.push(
        subscriptionItem
          .rows[0]
      );


      // ======================================================================
      // METERED OVERAGE
      // ======================================================================

      const usageCharges =
        await this
          .getUsageCharges({
            client,

            organizationUuid:
              organization.id,

            planVersionId:
              subscription
                .planVersionId,

            currency,

            periodStart,

            periodEnd,
          });


      for (
        const usage
        of usageCharges
      ) {
        const actual =
          Number(
            usage.actual_quantity ||
            0
          );


        const included =
          Number(
            usage.included_quantity ||
            0
          );


        const overage =
          Math.max(
            0,

            actual -
            included
          );


        if (
          overage <=
            0
        ) {
          continue;
        }


        if (
          !Number.isSafeInteger(
            overage
          )
        ) {
          throw createError(
            "Billable usage quantity must resolve to a whole safe integer",
            "INVOICE_USAGE_QUANTITY_INVALID",
            500,
            {
              meterCode:
                usage.meter_code,

              overage,
            }
          );
        }


        const unitAmount =
          Number(
            usage
              .amount_minor_per_unit
          );


        if (
          !Number.isSafeInteger(
            unitAmount
          )
        ) {
          throw createError(
            "Usage rate is not a safe integer",
            "INVOICE_USAGE_RATE_INVALID",
            500
          );
        }


        const amount =
          overage *
          unitAmount;


        if (
          !Number.isSafeInteger(
            amount
          )
        ) {
          throw createError(
            "Calculated usage charge exceeds safe integer range",
            "INVOICE_USAGE_AMOUNT_INVALID",
            500
          );
        }


        const usageItem =
          await client.query(
            `
              INSERT INTO billing.invoice_items (
                invoice_id,

                line_number,

                item_type,

                description,

                quantity,

                unit_amount_minor,

                amount_minor,

                meter_code,

                meter_version,

                included_quantity,

                actual_quantity,

                overage_quantity,

                source_type,

                metadata
              )
              VALUES (
                $1,
                $2,
                'USAGE',
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                'usage_period',
                $12::jsonb
              )

              RETURNING *
            `,
            [
              invoice.id,

              lineNumber++,

              "AIRA usage overage — " +
              usage.meter_code,

              overage,

              unitAmount,

              amount,

              usage.meter_code,

              usage.meter_version,

              included,

              actual,

              overage,

              JSON.stringify({
                includedEntitlement:
                  usage
                    .included_entitlement_key,
              }),
            ]
          );


        items.push(
          usageItem
            .rows[0]
        );
      }


     const baseSubtotalMinor =
  items
    .reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item
            .amount_minor
        ),
      0
    );


const financial =
  await this
    .applyFinancialAdjustments({
      client,

      invoice,

      organizationUuid:
        organization.id,

      currency,

      subtotalMinor:
        baseSubtotalMinor,

      lineNumber,
    });


items.push(
  ...financial
    .items
);


lineNumber =
  financial
    .nextLineNumber;


/**
 * Debit adjustments increase subtotal.
 *
 * Discounts and credits are tracked separately and later subtracted by
 * calculateInvoiceTotal().
 */
const subtotalMinor =
  baseSubtotalMinor +
  financial
    .debitMinor;


const discountMinor =
  financial
    .discountMinor;


const creditMinor =
  financial
    .creditMinor;


const taxMinor =
  0;


const totalMinor =
  calculateInvoiceTotal({
    subtotalMinor,

    discountMinor,

    creditMinor,

    taxMinor,
  });


      const finalized =
        await client.query(
          `
            UPDATE billing.invoices

            SET
              subtotal_minor = $2,

              discount_minor = $3,

              credit_minor = $4,

              tax_minor = $5,

              total_minor = $6,

              amount_due_minor = $6,

              status = 'OPEN',

              finalized_at = NOW(),

              opened_at = NOW(),

              due_at = NOW() +
                  INTERVAL '7 days',

              metadata =
                metadata ||
                $7::jsonb

            WHERE id = $1

            RETURNING *
          `,
          [
            invoice.id,

            subtotalMinor,

            discountMinor,

            creditMinor,

            taxMinor,

            totalMinor,

            JSON.stringify({
              taxCalculated:
                false,

              creditsApplied:
                false,

              discountsApplied:
                false,

              invoiceEngineVersion:
                generationVersion,
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

        invoice:
          finalized.rows[0],

        items,
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


  async getInvoiceByNumber({
    organizationId,

    invoiceNumber,
  }) {
    const result =
      await this.pool
        .query(
          `
            SELECT
              i.*,

              o.public_id AS
                organization_public_id

            FROM billing.invoices i

            JOIN tenancy.organizations o
              ON o.id =
                i.organization_id

            WHERE
              i.invoice_number = $1

              AND (
                i.organization_id::text = $2
                OR o.public_id = $2
                OR o.legacy_mongo_id = $2
              )

            LIMIT 1
          `,
          [
            invoiceNumber,

            String(
              organizationId
            ),
          ]
        );


    if (
      !result.rows[0]
    ) {
      return null;
    }


    const invoice =
      result.rows[0];


    const items =
      await this.pool
        .query(
          `
            SELECT *

            FROM billing.invoice_items

            WHERE invoice_id = $1

            ORDER BY line_number
          `,
          [
            invoice.id,
          ]
        );


    return {
      invoice,

      items:
        items.rows,
    };
  }
}


module.exports =
  PostgresInvoiceRepository;