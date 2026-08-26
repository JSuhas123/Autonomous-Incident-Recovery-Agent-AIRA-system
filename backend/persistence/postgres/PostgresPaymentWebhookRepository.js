"use strict";

const {
  getPostgresPool,
} =
  require(
    "./postgresPool"
  );


class PostgresPaymentWebhookRepository {

  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      getPostgresPool();
  }


  async ingest({
    provider,

    providerEventId,

    eventType,

    providerCreatedAt =
      null,

    signatureVerified,

    providerSessionId =
      null,

    providerPaymentId =
      null,

    payload,

    metadata =
      {},
  }) {
    const result =
      await this.pool
        .query(
          `
            INSERT INTO billing.payment_webhook_events (
              provider,

              provider_event_id,

              event_type,

              provider_created_at,

              signature_verified,

              provider_session_id,

              provider_payment_id,

              payload,

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
              $8::jsonb,
              $9::jsonb
            )

            ON CONFLICT (
              provider,
              provider_event_id
            )

            DO NOTHING

            RETURNING *
          `,
          [
            provider,

            providerEventId,

            eventType,

            providerCreatedAt,

            signatureVerified,

            providerSessionId,

            providerPaymentId,

            JSON.stringify(
              payload
            ),

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

        duplicate:
          false,

        event:
          result.rows[0],
      };
    }


    const existing =
      await this.pool
        .query(
          `
            SELECT *

            FROM billing.payment_webhook_events

            WHERE
              provider = $1

              AND provider_event_id =
                $2

            LIMIT 1
          `,
          [
            provider,

            providerEventId,
          ]
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


  async claim(
    webhookEventId
  ) {
    const maxAttempts =
      Number(
        process.env
          .PAYMENT_WEBHOOK_MAX_ATTEMPTS ||
        10
      );


    const result =
      await this.pool
        .query(
          `
            UPDATE billing.payment_webhook_events

            SET
              status =
                'PROCESSING',

              processing_started_at =
                NOW(),

              attempt_count =
                attempt_count +
                1,

              failure_code =
                NULL,

              failure_message =
                NULL

            WHERE
              id = $1

              AND status IN (
                'RECEIVED',
                'FAILED'
              )

              AND attempt_count <
                $2

            RETURNING *
          `,
          [
            webhookEventId,

            maxAttempts,
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async markProcessed({
    webhookEventId,

    organizationId =
      null,

    paymentId =
      null,

    paymentAttemptId =
      null,
  }) {
    const result =
      await this.pool
        .query(
          `
            UPDATE billing.payment_webhook_events

            SET
              status =
                'PROCESSED',

              organization_id =
                $2,

              payment_id =
                $3,

              payment_attempt_id =
                $4,

              processed_at =
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
            webhookEventId,

            organizationId,

            paymentId,

            paymentAttemptId,
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async markIgnored({
    webhookEventId,

    reason,
  }) {
    const result =
      await this.pool
        .query(
          `
            UPDATE billing.payment_webhook_events

            SET
              status =
                'IGNORED',

              processed_at =
                NOW(),

              failure_code =
                'WEBHOOK_EVENT_IGNORED',

              failure_message =
                $2

            WHERE id =
              $1

            RETURNING *
          `,
          [
            webhookEventId,

            reason,
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async markFailed({
    webhookEventId,

    code,

    message,
  }) {
    const result =
      await this.pool
        .query(
          `
            UPDATE billing.payment_webhook_events

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
            webhookEventId,

            code ||
            "PAYMENT_WEBHOOK_PROCESSING_FAILED",

            message ||
            "Webhook processing failed",
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }
}


module.exports =
  PostgresPaymentWebhookRepository;