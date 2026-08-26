"use strict";

const PaymentProviderAdapter =
  require(
    "./PaymentProviderAdapter"
  );

const {
  assertRazorpayConfiguration,
} =
  require(
    "./providerConfig"
  );


class RazorpayPaymentProvider
  extends PaymentProviderAdapter {

  constructor(
    options = {}
  ) {
    super();


    this.config =
      options.config ||
      assertRazorpayConfiguration();


    this.fetchImpl =
      options.fetchImpl ||
      global.fetch;


    if (
      typeof this.fetchImpl !==
        "function"
    ) {
      const error =
        new Error(
          "Global fetch is required for Razorpay REST integration"
        );

      error.code =
        "RAZORPAY_FETCH_UNAVAILABLE";

      error.status =
        500;

      throw error;
    }
  }


  getProviderCode() {
    return "razorpay";
  }


  getAuthorizationHeader() {
    const credentials =
      Buffer
        .from(
          `${this.config.keyId}:${this.config.keySecret}`,
          "utf8"
        )
        .toString(
          "base64"
        );


    return (
      "Basic " +
      credentials
    );
  }


  async request(
    path,
    options = {}
  ) {
    const response =
      await this.fetchImpl(
        `https://api.razorpay.com/v1${path}`,
        {
          ...options,

          headers: {
            Authorization:
              this
                .getAuthorizationHeader(),

            "Content-Type":
              "application/json",

            ...(options.headers ||
              {}),
          },
        }
      );


    const payload =
      await response
        .json()
        .catch(
          () => ({})
        );


    if (
      !response.ok
    ) {
      const error =
        new Error(
          payload
            ?.error
            ?.description ||
          `Razorpay request failed with status ${response.status}`
        );

      error.code =
        payload
          ?.error
          ?.code ||
        "RAZORPAY_REQUEST_FAILED";

      error.status =
        502;

      error.providerStatus =
        response.status;

      error.providerPayload =
        payload;

      throw error;
    }


    return payload;
  }


  buildReceipt(
    paymentCode
  ) {
    /**
     * Razorpay receipt supports at most 40 characters.
     *
     * Current AIRA payment codes are:
     *
     * pay_<UUID>
     *
     * which fit exactly within that limit.
     */
    return String(
      paymentCode
    )
      .slice(
        0,
        40
      );
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
    const order =
      await this
        .request(
          "/orders",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                amount:
                  amountMinor,

                currency:
                  String(
                    currency
                  )
                    .toUpperCase(),

                receipt:
                  this
                    .buildReceipt(
                      paymentCode
                    ),

                notes: {
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

                  description:
                    String(
                      description ||
                      `AIRA invoice ${invoiceNumber}`
                    )
                      .slice(
                        0,
                        256
                      ),

                  ...metadata,
                },
              }),
          }
        );


    return {
      provider:
        "razorpay",

      sessionType:
        "ORDER",

      providerSessionId:
        order.id,

      providerStatus:
        order.status,

      amountMinor:
        Number(
          order.amount
        ),

      currency:
        String(
          order.currency
        )
          .toUpperCase(),

      checkoutReference:
        order.id,

      client: {
        provider:
          "razorpay",

        orderId:
          order.id,

        keyId:
          this.config
            .keyId,

        amount:
          Number(
            order.amount
          ),

        currency:
          String(
            order.currency
          )
            .toUpperCase(),

        name:
          process.env
            .PAYMENT_CHECKOUT_NAME ||
          "AIRA",

        description:
          description ||
          `AIRA invoice ${invoiceNumber}`,
      },

      raw:
        order,
    };
  }


  async retrieveCheckoutSession(
    providerSessionId
  ) {
    const order =
      await this
        .request(
          `/orders/${encodeURIComponent(
            providerSessionId
          )}`,
          {
            method:
              "GET",
          }
        );


    return {
      provider:
        "razorpay",

      sessionType:
        "ORDER",

      providerSessionId:
        order.id,

      providerStatus:
        order.status,

      amountMinor:
        Number(
          order.amount
        ),

      currency:
        String(
          order.currency
        )
          .toUpperCase(),

      client: {
        provider:
          "razorpay",

        orderId:
          order.id,

        keyId:
          this.config
            .keyId,

        amount:
          Number(
            order.amount
          ),

        currency:
          String(
            order.currency
          )
            .toUpperCase(),
      },

      raw:
        order,
    };
    
  }
  async retrievePaymentState(
  providerSessionId
) {
  const order =
    await this
      .request(
        `/orders/${encodeURIComponent(
          providerSessionId
        )}`,
        {
          method:
            "GET",
        }
      );


  let canonicalStatus =
    "PROCESSING";


  switch (
    String(
      order.status ||
      ""
    )
      .toLowerCase()
  ) {

    case "paid":
      canonicalStatus =
        "SUCCEEDED";
      break;


    case "attempted":
      canonicalStatus =
        "PROCESSING";
      break;


    case "created":
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
      "razorpay",

    providerSessionId:
      order.id,

    providerStatus:
      order.status,

    canonicalStatus,

    amountMinor:
      Number(
        order.amount
      ),

    amountPaidMinor:
      Number(
        order.amount_paid ||
        0
      ),

    amountDueMinor:
      Number(
        order.amount_due ||
        0
      ),

    currency:
      String(
        order.currency
      )
        .toUpperCase(),

    providerPaymentId:
      null,

    raw:
      order,
  };
}
}


module.exports =
  RazorpayPaymentProvider;