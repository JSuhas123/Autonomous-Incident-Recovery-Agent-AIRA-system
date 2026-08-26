"use strict";

const PostgresTenantEconomicsRepository =
  require(
    "../../persistence/postgres/PostgresTenantEconomicsRepository"
  );

const {
  normalizeCurrency,

  validateMinorUnits,
} =
  require(
    "./costMoney"
  );

const {
  ECONOMICS_REVENUE_SOURCES,

  ECONOMICS_COST_SOURCES,

  ECONOMICS_CALCULATION_VERSION,

  calculateGrossProfitMinor,

  calculateGrossMarginBasisPoints,
} =
  require(
    "../../constants/tenantEconomics"
  );


class TenantEconomicsService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresTenantEconomicsRepository(
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


  validatePeriod(
    periodStart,
    periodEnd
  ) {
    const start =
      periodStart instanceof Date
        ? periodStart
        : new Date(
            periodStart
          );


    const end =
      periodEnd instanceof Date
        ? periodEnd
        : new Date(
            periodEnd
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
      throw this.createError(
        "Invalid tenant economics period",
        "ECONOMICS_PERIOD_INVALID"
      );
    }


    return {
      periodStart:
        start,

      periodEnd:
        end,
    };
  }


  async calculate({
    organizationId,

    currency =
      "USD",

    periodStart,

    periodEnd,

    usageRevenueMinor =
      0,

    adjustmentRevenueMinor =
      0,

    metadata =
      {},
  }) {
    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization is required",
        "ECONOMICS_ORGANIZATION_REQUIRED"
      );
    }


    const normalizedCurrency =
      normalizeCurrency(
        currency
      );


    const period =
      this
        .validatePeriod(
          periodStart,
          periodEnd
        );


    const normalizedUsageRevenue =
      validateMinorUnits(
        usageRevenueMinor
      );


    /**
     * Adjustments may eventually be negative.
     *
     * 15.15 introduces credits/discounts/adjustments properly.
     *
     * Until then, do NOT accept negative financial adjustments through this
     * provisional economics API.
     */
    const normalizedAdjustmentRevenue =
      validateMinorUnits(
        adjustmentRevenueMinor
      );


    return this.repository
      .calculateAndStore({
        organizationId,

        currency:
          normalizedCurrency,

        periodStart:
          period.periodStart,

        periodEnd:
          period.periodEnd,

        usageRevenueMinor:
          normalizedUsageRevenue,

        adjustmentRevenueMinor:
          normalizedAdjustmentRevenue,

        revenueSource:
          ECONOMICS_REVENUE_SOURCES
            .SUBSCRIPTION_ESTIMATE,

        costSource:
          ECONOMICS_COST_SOURCES
            .COST_LEDGER,

        calculationVersion:
          ECONOMICS_CALCULATION_VERSION,

        calculateGrossProfitMinor,

        calculateGrossMarginBasisPoints,

        metadata: {
          ...metadata,

          provisionalRevenue:
            true,

          invoiceAuthoritative:
            false,
        },
      });
  }


  async getLatest(
    organizationId
  ) {
    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization is required",
        "ECONOMICS_ORGANIZATION_REQUIRED"
      );
    }


    return this.repository
      .getLatest(
        organizationId
      );
  }
}


const tenantEconomicsService =
  new TenantEconomicsService();


module.exports = {
  TenantEconomicsService,

  tenantEconomicsService,

  calculateTenantEconomics:
    tenantEconomicsService
      .calculate
      .bind(
        tenantEconomicsService
      ),

  getLatestTenantEconomics:
    tenantEconomicsService
      .getLatest
      .bind(
        tenantEconomicsService
      ),
};