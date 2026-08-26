"use strict";

const PostgresPaymentRepository =
  require(
    "../../persistence/postgres/PostgresPaymentRepository"
  );

const {
  isKnownPaymentProvider,
} =
  require(
    "../../constants/payments"
  );

const {
  validateMinorUnits,
} =
  require(
    "./costMoney"
  );


class PaymentService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresPaymentRepository(
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


  async create({
    organizationId,

    invoiceNumber,

    amountMinor =
      null,

    metadata =
      {},
  }) {
    if (
      !organizationId ||
      !invoiceNumber
    ) {
      throw this.createError(
        "Organization and invoice number are required",
        "PAYMENT_CREATE_INPUT_INVALID"
      );
    }


    const normalizedAmount =
      amountMinor ===
        null ||
      amountMinor ===
        undefined
        ? null
        : validateMinorUnits(
            amountMinor
          );


    return this.repository
      .createPayment({
        organizationId,

        invoiceNumber,

        amountMinor:
          normalizedAmount,

        metadata,
      });
  }


  async beginAttempt({
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
    if (
      !isKnownPaymentProvider(
        provider
      )
    ) {
      throw this.createError(
        "Unknown payment provider",
        "PAYMENT_PROVIDER_INVALID"
      );
    }


    return this.repository
      .createAttempt({
        organizationId,

        paymentCode,

        provider,

        providerAttemptId,

        requestPayload,

        metadata,
      });
  }


  async succeedAttempt({
    organizationId,

    paymentCode,

    attemptCode,

    providerPaymentId,

    providerPaymentIntentId =
      null,

    responsePayload =
      null,
  }) {
    if (
      !providerPaymentId
    ) {
      throw this.createError(
        "Provider payment identifier is required",
        "PAYMENT_PROVIDER_PAYMENT_ID_REQUIRED"
      );
    }


    return this.repository
      .markAttemptSucceeded({
        organizationId,

        paymentCode,

        attemptCode,

        providerPaymentId,

        providerPaymentIntentId,

        responsePayload,
      });
  }


  async failAttempt({
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
    return this.repository
      .markAttemptFailed({
        organizationId,

        paymentCode,

        attemptCode,

        failureCode,

        failureMessage,

        responsePayload,
      });
  }


  async get({
    organizationId,

    paymentCode,
  }) {
    return this.repository
      .findPayment({
        organizationId,

        paymentCode,
      });
  }
}


const paymentService =
  new PaymentService();


module.exports = {
  PaymentService,

  paymentService,

  createPayment:
    paymentService
      .create
      .bind(
        paymentService
      ),

  beginPaymentAttempt:
    paymentService
      .beginAttempt
      .bind(
        paymentService
      ),

  succeedPaymentAttempt:
    paymentService
      .succeedAttempt
      .bind(
        paymentService
      ),

  failPaymentAttempt:
    paymentService
      .failAttempt
      .bind(
        paymentService
      ),

  getPayment:
    paymentService
      .get
      .bind(
        paymentService
      ),
};