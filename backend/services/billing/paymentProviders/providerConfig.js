
"use strict";


function envBoolean(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase() ===
    "true";
}


function createConfigurationError(
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
    500;

  return error;
}


function getStripeConfig() {
  return {
    enabled:
      envBoolean(
        process.env
          .STRIPE_ENABLED
      ),

    secretKey:
      process.env
        .STRIPE_SECRET_KEY ||
      null,

    publishableKey:
      process.env
        .STRIPE_PUBLISHABLE_KEY ||
      null,
  };
}


function getRazorpayConfig() {
  return {
    enabled:
      envBoolean(
        process.env
          .RAZORPAY_ENABLED
      ),

    keyId:
      process.env
        .RAZORPAY_KEY_ID ||
      null,

    keySecret:
      process.env
        .RAZORPAY_KEY_SECRET ||
      null,
  };
}


function assertStripeConfiguration() {
  const config =
    getStripeConfig();


  if (
    !config.enabled
  ) {
    throw createConfigurationError(
      "Stripe payment provider is disabled",
      "STRIPE_DISABLED"
    );
  }


  if (
    !config.secretKey
  ) {
    throw createConfigurationError(
      "Stripe secret key is required",
      "STRIPE_SECRET_KEY_REQUIRED"
    );
  }


  if (
    !config.publishableKey
  ) {
    throw createConfigurationError(
      "Stripe publishable key is required",
      "STRIPE_PUBLISHABLE_KEY_REQUIRED"
    );
  }


  return config;
}


function assertRazorpayConfiguration() {
  const config =
    getRazorpayConfig();


  if (
    !config.enabled
  ) {
    throw createConfigurationError(
      "Razorpay payment provider is disabled",
      "RAZORPAY_DISABLED"
    );
  }


  if (
    !config.keyId
  ) {
    throw createConfigurationError(
      "Razorpay key ID is required",
      "RAZORPAY_KEY_ID_REQUIRED"
    );
  }


  if (
    !config.keySecret
  ) {
    throw createConfigurationError(
      "Razorpay key secret is required",
      "RAZORPAY_KEY_SECRET_REQUIRED"
    );
  }


  return config;
}


module.exports = {
  envBoolean,

  getStripeConfig,

  getRazorpayConfig,

  assertStripeConfiguration,

  assertRazorpayConfiguration,
};