"use strict";

const {
  getPostgresPool,
} =
  require(
    "./postgresPool"
  );


function createError(
  message,
  code,
  status = 500
) {
  const error =
    new Error(
      message
    );

  error.code =
    code;

  error.status =
    status;

  return error;
}


class PostgresPaymentProviderSessionRepository {

  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      getPostgresPool();
  }


  async create({
    organizationId,

    paymentCode,

    attemptCode,

    provider,

    providerSessionId,

    sessionType,

    providerStatus,

    amountMinor,

    currency,

    checkoutReference =
      null,

    metadata =
      {},
  }) {
    const result =
      await this.pool
        .query(
          `
            INSERT INTO billing.payment_provider_sessions (
              organization_id,

              payment_id,

              payment_attempt_id,

              provider,

              provider_session_id,

              session_type,

              status,

              provider_status,

              amount_minor,

              currency,

              checkout_reference,

              metadata
            )

            SELECT
              o.id,

              p.id,

              pa.id,

              $4,

              $5,

              $6,

              'CREATED',

              $7,

              $8,

              $9,

              $10,

              $11::jsonb

            FROM tenancy.organizations o

            JOIN billing.payments p
              ON p.organization_id =
                o.id

            JOIN billing.payment_attempts pa
              ON pa.payment_id =
                p.id

            WHERE
              (
                o.id::text = $1
                OR o.public_id = $1
                OR o.legacy_mongo_id = $1
              )

              AND p.payment_code =
                $2

              AND pa.attempt_code =
                $3

            ON CONFLICT (
              provider,
              provider_session_id
            )

            DO NOTHING

            RETURNING *
          `,
          [
            String(
              organizationId
            ),

            paymentCode,

            attemptCode,

            provider,

            providerSessionId,

            sessionType,

            providerStatus,

            amountMinor,

            currency,

            checkoutReference,

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


    if (
      result.rows[0]
    ) {
      return result.rows[0];
    }


    const existing =
      await this.findByProviderSession({
        provider,

        providerSessionId,
      });


    if (
      existing
    ) {
      return existing;
    }


    throw createError(
      "Unable to persist payment provider session",
      "PAYMENT_PROVIDER_SESSION_PERSIST_FAILED"
    );
  }


  async findByPayment({
    organizationId,

    paymentCode,

    provider =
      null,
  }) {
    const values = [
      String(
        organizationId
      ),

      paymentCode,
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
        `AND pps.provider = $${values.length}`;
    }


    const result =
      await this.pool
        .query(
          `
            SELECT
              pps.*,

              p.payment_code,

              pa.attempt_code

            FROM billing.payment_provider_sessions pps

            JOIN billing.payments p
              ON p.id =
                pps.payment_id

            JOIN billing.payment_attempts pa
              ON pa.id =
                pps.payment_attempt_id

            JOIN tenancy.organizations o
              ON o.id =
                pps.organization_id

            WHERE
              (
                pps.organization_id::text = $1
                OR o.public_id = $1
                OR o.legacy_mongo_id = $1
              )

              AND p.payment_code =
                $2

              ${providerClause}

            ORDER BY
              pps.created_at DESC

            LIMIT 1
          `,
          values
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async findByProviderSession({
    provider,

    providerSessionId,
  }) {
    const result =
      await this.pool
        .query(
          `
            SELECT
              pps.*,

              p.payment_code,

              pa.attempt_code,

              o.public_id AS
                organization_public_id

            FROM billing.payment_provider_sessions pps

            JOIN billing.payments p
              ON p.id =
                pps.payment_id

            JOIN billing.payment_attempts pa
              ON pa.id =
                pps.payment_attempt_id

            JOIN tenancy.organizations o
              ON o.id =
                pps.organization_id

            WHERE
              pps.provider = $1

              AND pps.provider_session_id =
                $2

            LIMIT 1
          `,
          [
            provider,

            providerSessionId,
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async updateProviderStatus({
    provider,

    providerSessionId,

    providerStatus,

    status,
  }) {
    const result =
      await this.pool
        .query(
          `
            UPDATE billing.payment_provider_sessions

            SET
              provider_status =
                $3,

              status =
                $4

            WHERE
              provider =
                $1

              AND provider_session_id =
                $2

            RETURNING *
          `,
          [
            provider,

            providerSessionId,

            providerStatus,

            status,
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }
}


module.exports =
  PostgresPaymentProviderSessionRepository;