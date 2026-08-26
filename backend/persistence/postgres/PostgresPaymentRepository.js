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


class PostgresPaymentRepository {

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
        "PAYMENT_ORGANIZATION_NOT_FOUND",
        404
      );
    }


    return result
      .rows[0]
      .id;
  }


  async resolveInvoice(
    client,
    organizationUuid,
    invoiceNumber
  ) {
    const result =
      await client.query(
        `
          SELECT *

          FROM billing.invoices

          WHERE
            organization_id = $1
            AND invoice_number = $2

          LIMIT 1
        `,
        [
          organizationUuid,

          invoiceNumber,
        ]
      );


    if (
      !result.rows[0]
    ) {
      throw createError(
        "Invoice not found",
        "PAYMENT_INVOICE_NOT_FOUND",
        404
      );
    }


    return result.rows[0];
  }


  async createPayment({
    organizationId,

    invoiceNumber,

    amountMinor =
      null,

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


      const organizationUuid =
        await this
          .resolveOrganization(
            client,
            organizationId
          );


      const invoice =
        await this
          .resolveInvoice(
            client,
            organizationUuid,
            invoiceNumber
          );


      if (
        ![
          "OPEN",
        ].includes(
          invoice.status
        )
      ) {
        throw createError(
          "Invoice is not payable",
          "PAYMENT_INVOICE_NOT_PAYABLE",
          422,
          {
            invoiceStatus:
              invoice.status,
          }
        );
      }


      const outstanding =
        Number(
          invoice
            .amount_due_minor
        );


      if (
        outstanding <=
          0
      ) {
        throw createError(
          "Invoice has no outstanding balance",
          "PAYMENT_NOT_REQUIRED",
          422
        );
      }


      const requestedAmount =
        amountMinor ===
          null ||
        amountMinor ===
          undefined
          ? outstanding
          : Number(
              amountMinor
            );


      if (
        !Number.isSafeInteger(
          requestedAmount
        ) ||
        requestedAmount <=
          0 ||
        requestedAmount >
          outstanding
      ) {
        throw createError(
          "Payment amount is invalid",
          "PAYMENT_AMOUNT_INVALID",
          422,
          {
            requestedAmount,

            outstanding,
          }
        );
      }


      const paymentCode =
        "pay_" +
        crypto
          .randomUUID();


      const result =
        await client.query(
          `
            INSERT INTO billing.payments (
              payment_code,

              organization_id,

              invoice_id,

              currency,

              amount_minor,

              status,

              metadata
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              'REQUIRES_PAYMENT',
              $6::jsonb
            )

            RETURNING *
          `,
          [
            paymentCode,

            organizationUuid,

            invoice.id,

            invoice.currency,

            requestedAmount,

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


      await client.query(
        "COMMIT"
      );


      return result.rows[0];

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


  async findPayment({
    organizationId,

    paymentCode,
  }) {
    const result =
      await this.pool
        .query(
          `
            SELECT
              p.*,

              i.invoice_number

            FROM billing.payments p

            JOIN billing.invoices i
              ON i.id =
                p.invoice_id

            JOIN tenancy.organizations o
              ON o.id =
                p.organization_id

            WHERE
              p.payment_code = $1

              AND (
                p.organization_id::text = $2
                OR o.public_id = $2
                OR o.legacy_mongo_id = $2
              )

            LIMIT 1
          `,
          [
            paymentCode,

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


  async createAttempt({
    organizationId,

    paymentCode,

    provider,

    providerAttemptId =
      null,

    requestPayload =
      null,

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


      const organizationUuid =
        await this
          .resolveOrganization(
            client,
            organizationId
          );


      const paymentResult =
        await client.query(
          `
            SELECT *

            FROM billing.payments

            WHERE
              organization_id = $1
              AND payment_code = $2

            FOR UPDATE
          `,
          [
            organizationUuid,

            paymentCode,
          ]
        );


      const payment =
        paymentResult
          .rows[0];


      if (
        !payment
      ) {
        throw createError(
          "Payment not found",
          "PAYMENT_NOT_FOUND",
          404
        );
      }


      if (
        ![
          "REQUIRES_PAYMENT",
          "FAILED",
        ].includes(
          payment.status
        )
      ) {
        throw createError(
          "Payment cannot begin another attempt",
          "PAYMENT_ATTEMPT_NOT_ALLOWED",
          422,
          {
            paymentStatus:
              payment.status,
          }
        );
      }


      const attemptCode =
        "attempt_" +
        crypto
          .randomUUID();


      const result =
        await client.query(
          `
            INSERT INTO billing.payment_attempts (
              attempt_code,

              payment_id,

              organization_id,

              provider,

              provider_attempt_id,

              status,

              amount_minor,

              currency,

              request_payload,

              metadata
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              'CREATED',
              $6,
              $7,
              $8::jsonb,
              $9::jsonb
            )

            RETURNING *
          `,
          [
            attemptCode,

            payment.id,

            organizationUuid,

            provider,

            providerAttemptId,

            payment
              .amount_minor,

            payment
              .currency,

            requestPayload ===
              null
              ? null
              : JSON.stringify(
                  requestPayload
                ),

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


      await client.query(
        `
          UPDATE billing.payments

          SET
            status =
              'PROCESSING',

            provider =
              $2,

            processing_at =
              NOW()

          WHERE id =
            $1
        `,
        [
          payment.id,

          provider,
        ]
      );


      await client.query(
        "COMMIT"
      );


      return result.rows[0];

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


  async markAttemptSucceeded({
    organizationId,

    paymentCode,

    attemptCode,

    providerPaymentId,

    providerPaymentIntentId =
      null,

    responsePayload =
      null,
  }) {
    const client =
      await this.pool
        .connect();


    try {
      await client.query(
        "BEGIN"
      );


      const organizationUuid =
        await this
          .resolveOrganization(
            client,
            organizationId
          );


      const paymentResult =
        await client.query(
          `
            SELECT *

            FROM billing.payments

            WHERE
              organization_id = $1
              AND payment_code = $2

            FOR UPDATE
          `,
          [
            organizationUuid,

            paymentCode,
          ]
        );


      const payment =
        paymentResult
          .rows[0];


      if (
        !payment
      ) {
        throw createError(
          "Payment not found",
          "PAYMENT_NOT_FOUND",
          404
        );
      }


      if (
        payment.status ===
          "SUCCEEDED"
      ) {
        await client.query(
          "COMMIT"
        );


        return {
          duplicate:
            true,

          payment,
        };
      }


      const attemptResult =
        await client.query(
          `
            SELECT *

            FROM billing.payment_attempts

            WHERE
              payment_id = $1
              AND attempt_code = $2

            FOR UPDATE
          `,
          [
            payment.id,

            attemptCode,
          ]
        );


      const attempt =
        attemptResult
          .rows[0];


      if (
        !attempt
      ) {
        throw createError(
          "Payment attempt not found",
          "PAYMENT_ATTEMPT_NOT_FOUND",
          404
        );
      }


      await client.query(
        `
          UPDATE billing.payment_attempts

          SET
            status =
              'SUCCEEDED',

            provider_attempt_id =
              COALESCE(
                provider_attempt_id,
                $2
              ),

            response_payload =
              $3::jsonb,

            completed_at =
              NOW()

          WHERE id =
            $1
        `,
        [
          attempt.id,

          providerPaymentId,

          responsePayload ===
            null
            ? null
            : JSON.stringify(
                responsePayload
              ),
        ]
      );


      const succeeded =
        await client.query(
          `
            UPDATE billing.payments

            SET
              status =
                'SUCCEEDED',

              provider_payment_id =
                $2,

              provider_payment_intent_id =
                $3,

              succeeded_at =
                NOW(),

              failure_code =
                NULL,

              failure_message =
                NULL

            WHERE id =
              $1

            RETURNING *
          `,
          [
            payment.id,

            providerPaymentId,

            providerPaymentIntentId,
          ]
        );


      const updatedPayment =
        succeeded.rows[0];


      const invoiceResult =
        await client.query(
          `
            SELECT *

            FROM billing.invoices

            WHERE id =
              $1

            FOR UPDATE
          `,
          [
            updatedPayment
              .invoice_id,
          ]
        );


      const invoice =
        invoiceResult
          .rows[0];


      const newAmountPaid =
        Number(
          invoice
            .amount_paid_minor
        ) +
        Number(
          updatedPayment
            .amount_minor
        );


      const cappedAmountPaid =
        Math.min(
          newAmountPaid,

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
          cappedAmountPaid
        );


      const invoicePaid =
        amountDue ===
          0;


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
                WHEN $4
                  THEN 'PAID'
                ELSE 'OPEN'
              END,

            paid_at =
              CASE
                WHEN $4
                  THEN NOW()
                ELSE paid_at
              END

          WHERE id =
            $1
        `,
        [
          invoice.id,

          cappedAmountPaid,

          amountDue,

          invoicePaid,
        ]
      );


      await client.query(
        "COMMIT"
      );


      return {
        duplicate:
          false,

        payment:
          updatedPayment,

        invoicePaid,

        amountDueMinor:
          amountDue,
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


  async markAttemptFailed({
    organizationId,

    paymentCode,

    attemptCode,

    failureCode =
      null,

    failureMessage =
      null,

    responsePayload =
      null,
  }) {
    const client =
      await this.pool
        .connect();


    try {
      await client.query(
        "BEGIN"
      );


      const organizationUuid =
        await this
          .resolveOrganization(
            client,
            organizationId
          );


      const paymentResult =
        await client.query(
          `
            SELECT *

            FROM billing.payments

            WHERE
              organization_id = $1
              AND payment_code = $2

            FOR UPDATE
          `,
          [
            organizationUuid,

            paymentCode,
          ]
        );


      const payment =
        paymentResult.rows[0];


      if (
        !payment
      ) {
        throw createError(
          "Payment not found",
          "PAYMENT_NOT_FOUND",
          404
        );
      }


      const attemptResult =
        await client.query(
          `
            SELECT *

            FROM billing.payment_attempts

            WHERE
              payment_id = $1
              AND attempt_code = $2

            FOR UPDATE
          `,
          [
            payment.id,

            attemptCode,
          ]
        );


      const attempt =
        attemptResult.rows[0];


      if (
        !attempt
      ) {
        throw createError(
          "Payment attempt not found",
          "PAYMENT_ATTEMPT_NOT_FOUND",
          404
        );
      }


      await client.query(
        `
          UPDATE billing.payment_attempts

          SET
            status =
              'FAILED',

            failure_code =
              $2,

            failure_message =
              $3,

            response_payload =
              $4::jsonb,

            completed_at =
              NOW()

          WHERE id =
            $1
        `,
        [
          attempt.id,

          failureCode,

          failureMessage,

          responsePayload ===
            null
            ? null
            : JSON.stringify(
                responsePayload
              ),
        ]
      );


      const result =
        await client.query(
          `
            UPDATE billing.payments

            SET
              status =
                'FAILED',

              failed_at =
                NOW(),

              failure_code =
                $2,

              failure_message =
                $3

            WHERE id =
              $1

            RETURNING *
          `,
          [
            payment.id,

            failureCode,

            failureMessage,
          ]
        );


      await client.query(
        "COMMIT"
      );


      return result.rows[0];

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
}


module.exports =
  PostgresPaymentRepository;