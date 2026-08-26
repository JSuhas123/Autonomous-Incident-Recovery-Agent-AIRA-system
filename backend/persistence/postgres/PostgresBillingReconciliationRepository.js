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


class PostgresBillingReconciliationRepository {

  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      getPostgresPool();
  }


  async createRun({
    runType,

    provider =
      null,

    metadata =
      {},
  }) {
    const runCode =
      "recon_" +
      crypto
        .randomUUID();


    const result =
      await this.pool
        .query(
          `
            INSERT INTO billing.reconciliation_runs (
              run_code,

              run_type,

              provider,

              metadata
            )
            VALUES (
              $1,
              $2,
              $3,
              $4::jsonb
            )

            RETURNING *
          `,
          [
            runCode,

            runType,

            provider,

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


    return result.rows[0];
  }


  async completeRun({
    runId,

    status,

    scannedCount,

    matchedCount,

    repairedCount,

    suspiciousCount,

    failedCount,
  }) {
    const result =
      await this.pool
        .query(
          `
            UPDATE billing.reconciliation_runs

            SET
              status = $2,

              scanned_count = $3,

              matched_count = $4,

              repaired_count = $5,

              suspicious_count = $6,

              failed_count = $7,

              completed_at = NOW()

            WHERE id = $1

            RETURNING *
          `,
          [
            runId,

            status,

            scannedCount,

            matchedCount,

            repairedCount,

            suspiciousCount,

            failedCount,
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async createFinding({
    runId,

    organizationId =
      null,

    provider =
      null,

    entityType,

    entityId =
      null,

    providerEntityId =
      null,

    severity,

    classification,

    detectedState =
      {},

    canonicalState =
      {},

    providerState =
      {},

    repairAction =
      null,

    repairStatus =
      "NOT_REQUIRED",

    metadata =
      {},
  }) {
    const findingCode =
      "finding_" +
      crypto
        .randomUUID();


    const result =
      await this.pool
        .query(
          `
            INSERT INTO billing.reconciliation_findings (
              run_id,

              finding_code,

              organization_id,

              provider,

              entity_type,

              entity_id,

              provider_entity_id,

              severity,

              classification,

              detected_state,

              canonical_state,

              provider_state,

              repair_action,

              repair_status,

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
              $10::jsonb,
              $11::jsonb,
              $12::jsonb,
              $13,
              $14,
              $15::jsonb
            )

            RETURNING *
          `,
          [
            runId,

            findingCode,

            organizationId,

            provider,

            entityType,

            entityId,

            providerEntityId,

            severity,

            classification,

            JSON.stringify(
              detectedState ||
              {}
            ),

            JSON.stringify(
              canonicalState ||
              {}
            ),

            JSON.stringify(
              providerState ||
              {}
            ),

            repairAction,

            repairStatus,

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


    return result.rows[0];
  }


  async markFindingRepaired(
    findingId
  ) {
    const result =
      await this.pool
        .query(
          `
            UPDATE billing.reconciliation_findings

            SET
              repair_status =
                'REPAIRED',

              repaired_at =
                NOW(),

              repair_error_code =
                NULL,

              repair_error_message =
                NULL

            WHERE id =
              $1

            RETURNING *
          `,
          [
            findingId,
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async markFindingFailed({
    findingId,

    code,

    message,

    manualReview =
      false,
  }) {
    const result =
      await this.pool
        .query(
          `
            UPDATE billing.reconciliation_findings

            SET
              repair_status =
                $2,

              repair_error_code =
                $3,

              repair_error_message =
                $4

            WHERE id =
              $1

            RETURNING *
          `,
          [
            findingId,

            manualReview
              ? "MANUAL_REVIEW"
              : "FAILED",

            code,

            message,
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async listStaleProcessingPayments({
    staleBefore,

    provider =
      null,

    limit =
      100,
  }) {
    const values = [
      staleBefore,

      Number(
        limit
      ),
    ];


    let providerClause =
      "";


    if (
      provider
    ) {
      values.push(
        provider
      );

      providerClause =
        `AND p.provider = $${values.length}`;
    }


    const result =
      await this.pool
        .query(
          `
            SELECT
              p.*,

              o.public_id AS
                organization_public_id,

              i.invoice_number,

              pps.provider_session_id,

              pps.provider_status,

              pps.id AS
                provider_session_internal_id,

              pa.attempt_code,

              pa.id AS
                payment_attempt_id

            FROM billing.payments p

            JOIN tenancy.organizations o
              ON o.id =
                p.organization_id

            JOIN billing.invoices i
              ON i.id =
                p.invoice_id

            LEFT JOIN billing.payment_provider_sessions pps
              ON pps.payment_id =
                p.id

            LEFT JOIN billing.payment_attempts pa
              ON pa.id =
                pps.payment_attempt_id

            WHERE
              p.status =
                'PROCESSING'

              AND COALESCE(
                p.processing_at,
                p.updated_at
              ) <= $1

              ${providerClause}

            ORDER BY
              COALESCE(
                p.processing_at,
                p.updated_at
              ) ASC

            LIMIT $2
          `,
          values
        );


    return result.rows;
  }


  async listFailedWebhookEvents(
    limit =
      100
  ) {
    const result =
      await this.pool
        .query(
          `
            SELECT *

            FROM billing.payment_webhook_events

            WHERE
              status =
                'FAILED'

              AND attempt_count <
                COALESCE(
                  NULLIF(
                    current_setting(
                      'aira.payment_webhook_max_attempts',
                      TRUE
                    ),
                    ''
                  )::INTEGER,
                  10
                )

            ORDER BY
              failed_at ASC

            LIMIT $1
          `,
          [
            Number(
              limit
            ),
          ]
        );


    return result.rows;
  }


  async getInvoicePaymentState(
    invoiceId
  ) {
    const result =
      await this.pool
        .query(
          `
            SELECT
              i.id,

              i.invoice_number,

              i.status,

              i.total_minor,

              i.amount_paid_minor,

              i.amount_due_minor,

              COALESCE(
                SUM(
                  CASE
                    WHEN p.status =
                      'SUCCEEDED'
                    THEN p.amount_minor
                    ELSE 0
                  END
                ),
                0
              ) AS succeeded_payment_minor

            FROM billing.invoices i

            LEFT JOIN billing.payments p
              ON p.invoice_id =
                i.id

            WHERE
              i.id =
                $1

            GROUP BY
              i.id
          `,
          [
            invoiceId,
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async repairInvoicePaymentState(
    invoiceId
  ) {
    const client =
      await this.pool
        .connect();


    try {
      await client.query(
        "BEGIN"
      );


      const result =
        await client.query(
          `
            SELECT
              i.*,

              COALESCE(
                (
                  SELECT SUM(
                    p.amount_minor
                  )

                  FROM billing.payments p

                  WHERE
                    p.invoice_id =
                      i.id

                    AND p.status =
                      'SUCCEEDED'
                ),
                0
              ) AS succeeded_payment_minor

            FROM billing.invoices i

            WHERE i.id =
              $1

            FOR UPDATE
          `,
          [
            invoiceId,
          ]
        );


      const invoice =
        result.rows[0];


      if (
        !invoice
      ) {
        await client.query(
          "ROLLBACK"
        );

        return null;
      }


      const amountPaid =
        Math.min(
          Number(
            invoice
              .succeeded_payment_minor
          ),

          Number(
            invoice
              .total_minor
          )
        );


      const amountDue =
        Math.max(
          0,

          Number(
            invoice
              .total_minor
          ) -
          amountPaid
        );


      await client.query(
        `
          UPDATE billing.invoices

          SET
            amount_paid_minor =
              $2,

            amount_due_minor =
              $3,

            status =
              CASE

                WHEN
                  $3 = 0
                  AND total_minor > 0

                THEN 'PAID'

                WHEN
                  status = 'PAID'
                  AND $3 > 0

                THEN 'OPEN'

                ELSE status

              END,

            paid_at =
              CASE

                WHEN
                  $3 = 0
                  AND total_minor > 0

                THEN COALESCE(
                  paid_at,
                  NOW()
                )

                WHEN
                  $3 > 0

                THEN NULL

                ELSE paid_at

              END

          WHERE id =
            $1
        `,
        [
          invoiceId,

          amountPaid,

          amountDue,
        ]
      );


      await client.query(
        "COMMIT"
      );


      return {
        amountPaidMinor:
          amountPaid,

        amountDueMinor:
          amountDue,

        paid:
          amountDue ===
          0,
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


  async getSubscription(
    organizationId
  ) {
    const result =
      await this.pool
        .query(
          `
            SELECT
              s.*,

              o.public_id AS
                organization_public_id

            FROM tenancy.subscriptions s

            JOIN tenancy.organizations o
              ON o.id =
                s.organization_id

            WHERE
              s.organization_id::text =
                $1

              OR o.public_id =
                $1

              OR o.legacy_mongo_id =
                $1

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


  async updateSubscription({
    subscriptionId,

    updates,
  }) {
    const result =
      await this.pool
        .query(
          `
            UPDATE tenancy.subscriptions

            SET
              status =
                COALESCE(
                  $2,
                  status
                ),

              current_period_started_at =
                COALESCE(
                  $3,
                  current_period_started_at
                ),

              current_period_ends_at =
                COALESCE(
                  $4,
                  current_period_ends_at
                ),

              cancel_at_period_end =
                COALESCE(
                  $5,
                  cancel_at_period_end
                ),

              metadata =
                metadata ||
                $6::jsonb

            WHERE id =
              $1

            RETURNING *
          `,
          [
            subscriptionId,

            updates.status ||
            null,

            updates.currentPeriodStartedAt ||
            null,

            updates.currentPeriodEndsAt ||
            null,

            typeof updates
              .cancelAtPeriodEnd ===
              "boolean"
              ? updates
                  .cancelAtPeriodEnd
              : null,

            JSON.stringify(
              updates.metadata ||
              {}
            ),
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async recordSubscriptionChange({
    organizationId,

    subscriptionId,

    provider =
      null,

    providerSubscriptionId =
      null,

    changeType,

    previousState,

    nextState,

    sourceType,

    sourceId =
      null,

    metadata =
      {},
  }) {
    const eventCode =
      "sub_change_" +
      crypto
        .randomUUID();


    const result =
      await this.pool
        .query(
          `
            INSERT INTO billing.subscription_change_events (
              event_code,

              organization_id,

              subscription_id,

              provider,

              provider_subscription_id,

              change_type,

              previous_state,

              next_state,

              source_type,

              source_id,

              metadata
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7::jsonb,
              $8::jsonb,
              $9,
              $10,
              $11::jsonb
            )

            RETURNING *
          `,
          [
            eventCode,

            organizationId,

            subscriptionId,

            provider,

            providerSubscriptionId,

            changeType,

            JSON.stringify(
              previousState ||
              {}
            ),

            JSON.stringify(
              nextState ||
              {}
            ),

            sourceType,

            sourceId,

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


    return result.rows[0];
  }
}


module.exports =
  PostgresBillingReconciliationRepository;