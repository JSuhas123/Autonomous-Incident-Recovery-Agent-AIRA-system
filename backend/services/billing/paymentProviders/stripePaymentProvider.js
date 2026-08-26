"use strict";

const Stripe =
  require(
    "stripe"
  );

const PaymentProviderAdapter =
  require(
    "./PaymentProviderAdapter"
  );

const {
  assertStripeConfiguration,
} =
  require(
    "./providerConfig"
  );


class StripePaymentProvider
  extends PaymentProviderAdapter {

  constructor(
    options = {}
  ) {
    super();


    const config =
      options.config ||
      assertStripeConfiguration();


    this.config =
      config;


    this.client =
      options.client ||
      new Stripe(
        config.secretKey
      );
  }


  getProviderCode() {
    return "stripe";
  }


  normalizeCurrency(
    currency
  ) {
    return String(
      currency
    )
      .trim()
      .toLowerCase();
  }


  async createCheckoutSession({
    paymentCode,

    invoiceNumber,

    organizationId,

    amountMinor,

    currency,

    description =
      null,

    metadata =
      {},
  }) {
    const intent =
      await this.client
        .paymentIntents
        .create(
          {
            amount:
              amountMinor,

            currency:
              this
                .normalizeCurrency(
                  currency
                ),

            automatic_payment_methods: {
              enabled:
                true,
            },

            description:
              description ||
              `AIRA invoice ${invoiceNumber}`,

            metadata: {
              aira_payment_code:
                String(
                  paymentCode
                ),

              aira_invoice_number:
                String(
                  invoiceNumber
                ),

              aira_organization_id:
                String(
                  organizationId
                ),

              ...metadata,
            },
          },

          {
            /**
             * Retries of the same AIRA payment must not create multiple
             * Stripe PaymentIntents.
             */
            idempotencyKey:
              `aira-payment-${paymentCode}`,
          }
        );


    return {
      provider:
        "stripe",

      sessionType:
        "PAYMENT_INTENT",

      providerSessionId:
        intent.id,

      providerStatus:
        intent.status,

      amountMinor:
        intent.amount,

      currency:
        String(
          intent.currency
        )
          .toUpperCase(),

      checkoutReference:
        intent.id,

      client: {
        provider:
          "stripe",

        paymentIntentId:
          intent.id,

        clientSecret:
          intent.client_secret,

        publishableKey:
          this.config
            .publishableKey,
      },

      raw:
        intent,
    };
  }


  async retrieveCheckoutSession(
    providerSessionId
  ) {
    const intent =
      await this.client
        .paymentIntents
        .retrieve(
          providerSessionId
        );


    return {
      provider:
        "stripe",

      sessionType:
        "PAYMENT_INTENT",

      providerSessionId:
        intent.id,

      providerStatus:
        intent.status,

      amountMinor:
        intent.amount,

      currency:
        String(
          intent.currency
        )
          .toUpperCase(),

      client: {
        provider:
          "stripe",

        paymentIntentId:
          intent.id,

        clientSecret:
          intent.client_secret,

        publishableKey:
          this.config
            .publishableKey,
      },

      raw:
        intent,
    };
  }


  async cancelCheckoutSession(
    providerSessionId
  ) {
    const intent =
      await this.client
        .paymentIntents
        .cancel(
          providerSessionId
        );


    return {
      provider:
        "stripe",

      providerSessionId:
        intent.id,

      providerStatus:
        intent.status,

      cancelled:
        true,

      raw:
        intent,
    };
  }
  async retrievePaymentState(
  providerSessionId
) {
  const intent =
    await this.client
      .paymentIntents
      .retrieve(
        providerSessionId
      );


  let canonicalStatus =
    "PROCESSING";


  switch (
    intent.status
  ) {

    case "succeeded":
      canonicalStatus =
        "SUCCEEDED";
      break;


    case "canceled":
      canonicalStatus =
        "CANCELLED";
      break;


    case "requires_payment_method":
      canonicalStatus =
        "FAILED";
      break;


    case "processing":
    case "requires_action":
    case "requires_confirmation":
    case "requires_capture":
      canonicalStatus =
        "PROCESSING";
      break;


    default:
      canonicalStatus =
        "UNKNOWN";
      break;
  }


  return {
    provider:
      "stripe",

    providerSessionId:
      intent.id,

    providerStatus:
      intent.status,

    canonicalStatus,

    amountMinor:
      Number(
        intent.amount
      ),

    amountPaidMinor:
      intent.status ===
        "succeeded"
        ? Number(
            intent.amount_received ||
            intent.amount
          )
        : 0,

    currency:
      String(
        intent.currency
      )
        .toUpperCase(),

    providerPaymentId:
      intent.id,

    raw:
      intent,
  };
}
}


module.exports =
  StripePaymentProvider;