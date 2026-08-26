"use strict";

const PostgresInvoiceRepository =
  require(
    "../../persistence/postgres/PostgresInvoiceRepository"
  );

const {
  normalizeCurrency,
} =
  require(
    "./costMoney"
  );

const {
  INVOICE_GENERATION_VERSION,

  calculateInvoiceTotal,
} =
  require(
    "../../constants/invoice"
  );


class InvoiceService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresInvoiceRepository(
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
        "Invalid invoice billing period",
        "INVOICE_PERIOD_INVALID"
      );
    }


    return {
      periodStart:
        start,

      periodEnd:
        end,
    };
  }


  async generate({
    organizationId,

    currency =
      "USD",

    periodStart,

    periodEnd,

    metadata =
      {},
  }) {
    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization is required for invoice generation",
        "INVOICE_ORGANIZATION_REQUIRED"
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


    return this.repository
      .generateInvoice({
        organizationId,

        currency:
          normalizedCurrency,

        periodStart:
          period.periodStart,

        periodEnd:
          period.periodEnd,

        generationVersion:
          INVOICE_GENERATION_VERSION,

        calculateInvoiceTotal,

        metadata: {
          ...metadata,

          generatedBy:
            "AIRA_PHASE_15_14",

          paymentCollected:
            false,

          taxFinalized:
            false,
        },
      });
  }


  async get({
    organizationId,

    invoiceNumber,
  }) {
    if (
      !organizationId ||
      !invoiceNumber
    ) {
      throw this.createError(
        "Organization and invoice number are required",
        "INVOICE_LOOKUP_INVALID"
      );
    }


    return this.repository
      .getInvoiceByNumber({
        organizationId,

        invoiceNumber,
      });
  }
}


const invoiceService =
  new InvoiceService();


module.exports = {
  InvoiceService,

  invoiceService,

  generateInvoice:
    invoiceService
      .generate
      .bind(
        invoiceService
      ),

  getInvoice:
    invoiceService
      .get
      .bind(
        invoiceService
      ),
};