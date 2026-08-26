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


class PostgresFinancialAdjustmentRepository {

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
        "FINANCIAL_ADJUSTMENT_ORGANIZATION_NOT_FOUND",
        404
      );
    }


    return result
      .rows[0]
      .id;
  }


  async createCredit({
    organizationId,

    currency,

    amountMinor,

    reason,

    sourceType,

    sourceId =
      null,

    validFrom =
      new Date(),

    expiresAt =
      null,

    createdBy =
      null,

    metadata =
      {},
  }) {
    const client =
      await this.pool
        .connect();


    try {
      const organizationUuid =
        await this
          .resolveOrganization(
            client,
            organizationId
          );


      const creditCode =
        "credit_" +
        crypto
          .randomUUID();


      const result =
        await client.query(
          `
            INSERT INTO billing.credit_grants (
              credit_code,

              organization_id,

              currency,

              amount_minor,

              reason,

              source_type,

              source_id,

              valid_from,

              expires_at,

              created_by,

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
              $11::jsonb
            )

            RETURNING *
          `,
          [
            creditCode,

            organizationUuid,

            currency,

            amountMinor,

            reason,

            sourceType,

            sourceId,

            validFrom,

            expiresAt,

            createdBy,

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


      return result.rows[0];

    } finally {
      client.release();
    }
  }


  async createDiscount({
    organizationId,

    discountType,

    currency =
      null,

    fixedAmountMinor =
      null,

    percentageBasisPoints =
      null,

    reason,

    validFrom =
      new Date(),

    expiresAt =
      null,

    maxApplications =
      null,

    createdBy =
      null,

    metadata =
      {},
  }) {
    const client =
      await this.pool
        .connect();


    try {
      const organizationUuid =
        await this
          .resolveOrganization(
            client,
            organizationId
          );


      const discountCode =
        "discount_" +
        crypto
          .randomUUID();


      const result =
        await client.query(
          `
            INSERT INTO billing.discount_grants (
              discount_code,

              organization_id,

              discount_type,

              currency,

              fixed_amount_minor,

              percentage_basis_points,

              reason,

              valid_from,

              expires_at,

              max_applications,

              created_by,

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
              $12::jsonb
            )

            RETURNING *
          `,
          [
            discountCode,

            organizationUuid,

            discountType,

            currency,

            fixedAmountMinor,

            percentageBasisPoints,

            reason,

            validFrom,

            expiresAt,

            maxApplications,

            createdBy,

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


      return result.rows[0];

    } finally {
      client.release();
    }
  }


  async createAdjustment({
    organizationId,

    adjustmentType,

    currency,

    amountMinor,

    reason,

    sourceType,

    sourceId =
      null,

    effectiveAt =
      new Date(),

    createdBy =
      null,

    metadata =
      {},
  }) {
    const client =
      await this.pool
        .connect();


    try {
      const organizationUuid =
        await this
          .resolveOrganization(
            client,
            organizationId
          );


      const adjustmentCode =
        "adjustment_" +
        crypto
          .randomUUID();


      const result =
        await client.query(
          `
            INSERT INTO billing.financial_adjustments (
              adjustment_code,

              organization_id,

              adjustment_type,

              currency,

              amount_minor,

              reason,

              source_type,

              source_id,

              effective_at,

              created_by,

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
              $11::jsonb
            )

            RETURNING *
          `,
          [
            adjustmentCode,

            organizationUuid,

            adjustmentType,

            currency,

            amountMinor,

            reason,

            sourceType,

            sourceId,

            effectiveAt,

            createdBy,

            JSON.stringify(
              metadata ||
              {}
            ),
          ]
        );


      return result.rows[0];

    } finally {
      client.release();
    }
  }
}


module.exports =
  PostgresFinancialAdjustmentRepository;