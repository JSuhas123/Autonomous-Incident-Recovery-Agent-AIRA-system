"use strict";

const {
  getPayment,

  beginPaymentAttempt,
} =
  require(
    "./paymentService"
  );

const PostgresPaymentProviderSessionRepository =
  require(
    "../../persistence/postgres/PostgresPaymentProviderSessionRepository"
  );

const {
  createPaymentProvider,

  resolveDefaultProvider,
} =
  require(
    "./paymentProviders/paymentProviderFactory"
  );


class PaymentProviderService {

  constructor(
    options = {}
  ) {
    this.sessionRepository =
      options.sessionRepository ||
      new PostgresPaymentProviderSessionRepository(
        options
      );

    this.providerFactory =
      options.providerFactory ||
      createPaymentProvider;
  }


  createError(
    message,
    code,
    status = 422,
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


  async createCheckout({
    organizationId,

    paymentCode,

    provider =
      null,

    metadata =
      {},
  }) {
    if (
      !organizationId ||
      !paymentCode
    ) {
      throw this.createError(
        "Organization and payment code are required",
        "PAYMENT_CHECKOUT_INPUT_INVALID"
      );
    }


    const selectedProvider =
      provider ||
      resolveDefaultProvider();


    const payment =
      await getPayment({
        organizationId,

        paymentCode,
      });


    if (
      !payment
    ) {
      throw this.createError(
        "Payment not found",
        "PAYMENT_NOT_FOUND",
        404
      );
    }


    /**
     * If a provider session was already created for this AIRA payment,
     * recover it instead of creating another external payment object.
     */
    const existing =
      await this
        .sessionRepository
        .findByPayment({
          organizationId,

          paymentCode,

          provider:
            selectedProvider,
        });


    const adapter =
      this
        .providerFactory(
          selectedProvider
        );


    if (
      existing
    ) {
      const recovered =
        await adapter
          .retrieveCheckoutSession(
            existing
              .provider_session_id
          );


      return {
        created:
          false,

        recovered:
          true,

        paymentCode,

        attemptCode:
          existing
            .attempt_code,

        provider:
          selectedProvider,

        session:
          recovered,

        checkout:
          recovered.client,
      };
    }


    if (
      ![
        "REQUIRES_PAYMENT",
        "FAILED",
      ].includes(
        payment.status
      )
    ) {
      throw this.createError(
        "Payment is not eligible for checkout creation",
        "PAYMENT_CHECKOUT_STATE_INVALID",
        422,
        {
          paymentStatus:
            payment.status,
        }
      );
    }


    let providerSession =
      null;


    try {
      providerSession =
        await adapter
          .createCheckoutSession({
            paymentCode,

            invoiceNumber:
              payment
                .invoice_number,

            organizationId,

            amountMinor:
              Number(
                payment
                  .amount_minor
              ),

            currency:
              payment
                .currency,

            description:
              `AIRA invoice ${payment.invoice_number}`,

            metadata,
          });


      const attempt =
        await beginPaymentAttempt({
          organizationId,

          paymentCode,

          provider:
            selectedProvider,

          providerAttemptId:
            providerSession
              .providerSessionId,

          requestPayload: {
            providerSessionId:
              providerSession
                .providerSessionId,

            sessionType:
              providerSession
                .sessionType,
          },

          metadata: {
            phase:
              "15.17",

            provider:
              selectedProvider,
          },
        });


      await this
        .sessionRepository
        .create({
          organizationId,

          paymentCode,

          attemptCode:
            attempt
              .attempt_code,

          provider:
            selectedProvider,

          providerSessionId:
            providerSession
              .providerSessionId,

          sessionType:
            providerSession
              .sessionType,

          providerStatus:
            providerSession
              .providerStatus,

          amountMinor:
            Number(
              providerSession
                .amountMinor
            ),

          currency:
            providerSession
              .currency,

          checkoutReference:
            providerSession
              .checkoutReference,

          metadata: {
            phase:
              "15.17",
          },
        });


      return {
        created:
          true,

        recovered:
          false,

        paymentCode,

        attemptCode:
          attempt
            .attempt_code,

        provider:
          selectedProvider,

        session: {
          provider:
            providerSession
              .provider,

          sessionType:
            providerSession
              .sessionType,

          providerSessionId:
            providerSession
              .providerSessionId,

          providerStatus:
            providerSession
              .providerStatus,

          amountMinor:
            providerSession
              .amountMinor,

          currency:
            providerSession
              .currency,
        },

        checkout:
          providerSession
            .client,
      };

    } catch (
      error
    ) {
      /**
       * If an external provider object was created but our internal attempt
       * could not be established, make a best-effort cancellation where the
       * provider supports it.
       *
       * Stripe PaymentIntent cancellation is supported.
       * Razorpay Order cancellation is not relied upon here.
       */
      if (
        providerSession
          ?.providerSessionId
      ) {
        try {
          await adapter
            .cancelCheckoutSession(
              providerSession
                .providerSessionId
            );
        } catch (
          _cleanupError
        ) {
          // 15.19 reconciliation will detect provider orphans.
        }
      }


      throw error;
    }
  }


  async retrieveCheckout({
    organizationId,

    paymentCode,

    provider,
  }) {
    const mapping =
      await this
        .sessionRepository
        .findByPayment({
          organizationId,

          paymentCode,

          provider,
        });


    if (
      !mapping
    ) {
      throw this.createError(
        "Payment provider session not found",
        "PAYMENT_PROVIDER_SESSION_NOT_FOUND",
        404
      );
    }


    const adapter =
      this
        .providerFactory(
          mapping.provider
        );


    const providerSession =
      await adapter
        .retrieveCheckoutSession(
          mapping
            .provider_session_id
        );


    return {
      paymentCode,

      attemptCode:
        mapping
          .attempt_code,

      provider:
        mapping.provider,

      session:
        providerSession,

      checkout:
        providerSession
          .client,
    };
  }
}


const paymentProviderService =
  new PaymentProviderService();


module.exports = {
  PaymentProviderService,

  paymentProviderService,

  createPaymentCheckout:
    paymentProviderService
      .createCheckout
      .bind(
        paymentProviderService
      ),

  retrievePaymentCheckout:
    paymentProviderService
      .retrieveCheckout
      .bind(
        paymentProviderService
      ),
};
