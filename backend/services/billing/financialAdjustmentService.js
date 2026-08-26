"use strict";

const PostgresFinancialAdjustmentRepository =
  require(
    "../../persistence/postgres/PostgresFinancialAdjustmentRepository"
  );

const {
  normalizeCurrency,

  validateMinorUnits,
} =
  require(
    "./costMoney"
  );

const {
  DISCOUNT_TYPES,

  FINANCIAL_ADJUSTMENT_TYPES,
} =
  require(
    "../../constants/financialAdjustments"
  );


class FinancialAdjustmentService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresFinancialAdjustmentRepository(
        options
      );
  }


  createError(
    message,
    code,
    status = 422
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


  validateReason(
    reason
  ) {
    if (
      typeof reason !==
        "string" ||
      reason.trim().length ===
        0
    ) {
      throw this.createError(
        "Financial adjustment reason is required",
        "FINANCIAL_REASON_REQUIRED"
      );
    }


    return reason.trim();
  }


  async grantCredit({
    organizationId,

    currency,

    amountMinor,

    reason,

    sourceType =
      "manual",

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
    return this.repository
      .createCredit({
        organizationId,

        currency:
          normalizeCurrency(
            currency
          ),

        amountMinor:
          validateMinorUnits(
            amountMinor
          ),

        reason:
          this
            .validateReason(
              reason
            ),

        sourceType,

        sourceId,

        validFrom,

        expiresAt,

        createdBy,

        metadata,
      });
  }


  async grantFixedDiscount({
    organizationId,

    currency,

    amountMinor,

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
    return this.repository
      .createDiscount({
        organizationId,

        discountType:
          DISCOUNT_TYPES
            .FIXED,

        currency:
          normalizeCurrency(
            currency
          ),

        fixedAmountMinor:
          validateMinorUnits(
            amountMinor
          ),

        percentageBasisPoints:
          null,

        reason:
          this
            .validateReason(
              reason
            ),

        validFrom,

        expiresAt,

        maxApplications,

        createdBy,

        metadata,
      });
  }


  async grantPercentageDiscount({
    organizationId,

    percentageBasisPoints,

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
    const percentage =
      Number(
        percentageBasisPoints
      );


    if (
      !Number.isInteger(
        percentage
      ) ||
      percentage <=
        0 ||
      percentage >
        10000
    ) {
      throw this.createError(
        "Percentage discount must be between 1 and 10000 basis points",
        "DISCOUNT_PERCENTAGE_INVALID"
      );
    }


    return this.repository
      .createDiscount({
        organizationId,

        discountType:
          DISCOUNT_TYPES
            .PERCENTAGE,

        currency:
          null,

        fixedAmountMinor:
          null,

        percentageBasisPoints:
          percentage,

        reason:
          this
            .validateReason(
              reason
            ),

        validFrom,

        expiresAt,

        maxApplications,

        createdBy,

        metadata,
      });
  }


  async createAdjustment({
    organizationId,

    adjustmentType,

    currency,

    amountMinor,

    reason,

    sourceType =
      "manual",

    sourceId =
      null,

    effectiveAt =
      new Date(),

    createdBy =
      null,

    metadata =
      {},
  }) {
    if (
      !Object
        .values(
          FINANCIAL_ADJUSTMENT_TYPES
        )
        .includes(
          adjustmentType
        )
    ) {
      throw this.createError(
        "Unknown financial adjustment type",
        "FINANCIAL_ADJUSTMENT_TYPE_INVALID"
      );
    }


    return this.repository
      .createAdjustment({
        organizationId,

        adjustmentType,

        currency:
          normalizeCurrency(
            currency
          ),

        amountMinor:
          validateMinorUnits(
            amountMinor
          ),

        reason:
          this
            .validateReason(
              reason
            ),

        sourceType,

        sourceId,

        effectiveAt,

        createdBy,

        metadata,
      });
  }
}


const financialAdjustmentService =
  new FinancialAdjustmentService();


module.exports = {
  FinancialAdjustmentService,

  financialAdjustmentService,

  grantCredit:
    financialAdjustmentService
      .grantCredit
      .bind(
        financialAdjustmentService
      ),

  grantFixedDiscount:
    financialAdjustmentService
      .grantFixedDiscount
      .bind(
        financialAdjustmentService
      ),

  grantPercentageDiscount:
    financialAdjustmentService
      .grantPercentageDiscount
      .bind(
        financialAdjustmentService
      ),

  createFinancialAdjustment:
    financialAdjustmentService
      .createAdjustment
      .bind(
        financialAdjustmentService
      ),
};