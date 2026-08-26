"use strict";

const StripePaymentProvider =
  require(
    "./stripePaymentProvider"
  );

const RazorpayPaymentProvider =
  require(
    "./razorpayPaymentProvider"
  );

const {
  PAYMENT_PROVIDERS,

  isKnownPaymentProvider,
} =
  require(
    "../../../constants/payments"
  );


function createError(
  message,
  code
) {
  const error =
    new Error(
      message
    );

  error.code =
    code;

  error.status =
    422;

  return error;
}


function resolveDefaultProvider() {
  const configured =
    String(
      process.env
        .PAYMENT_PROVIDER_DEFAULT ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    configured
  ) {
    if (
      !isKnownPaymentProvider(
        configured
      )
    ) {
      throw createError(
        "Configured default payment provider is invalid",
        "PAYMENT_PROVIDER_DEFAULT_INVALID"
      );
    }


    return configured;
  }


  return PAYMENT_PROVIDERS
    .RAZORPAY;
}


function createPaymentProvider(
  provider,
  options = {}
) {
  const normalized =
    String(
      provider ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !isKnownPaymentProvider(
      normalized
    )
  ) {
    throw createError(
      "Unknown payment provider",
      "PAYMENT_PROVIDER_INVALID"
    );
  }


  switch (
    normalized
  ) {

    case PAYMENT_PROVIDERS
      .STRIPE:

      return new StripePaymentProvider(
        options
      );


    case PAYMENT_PROVIDERS
      .RAZORPAY:

      return new RazorpayPaymentProvider(
        options
      );


    default:
      throw createError(
        "Payment provider adapter unavailable",
        "PAYMENT_PROVIDER_UNAVAILABLE"
      );
  }
}


module.exports = {
  resolveDefaultProvider,

  createPaymentProvider,
};