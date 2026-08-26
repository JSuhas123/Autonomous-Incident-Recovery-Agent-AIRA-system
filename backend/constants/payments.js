"use strict";


const PAYMENT_STATUS =
  Object.freeze({

    REQUIRES_PAYMENT:
      "REQUIRES_PAYMENT",

    PROCESSING:
      "PROCESSING",

    SUCCEEDED:
      "SUCCEEDED",

    FAILED:
      "FAILED",

    CANCELLED:
      "CANCELLED",
  });


const PAYMENT_ATTEMPT_STATUS =
  Object.freeze({

    CREATED:
      "CREATED",

    PROCESSING:
      "PROCESSING",

    SUCCEEDED:
      "SUCCEEDED",

    FAILED:
      "FAILED",

    CANCELLED:
      "CANCELLED",
  });


const REFUND_STATUS =
  Object.freeze({

    REQUESTED:
      "REQUESTED",

    PROCESSING:
      "PROCESSING",

    SUCCEEDED:
      "SUCCEEDED",

    FAILED:
      "FAILED",

    CANCELLED:
      "CANCELLED",
  });


const PAYMENT_PROVIDERS =
  Object.freeze({

    STRIPE:
      "stripe",

    RAZORPAY:
      "razorpay",
  });


const PAYMENT_PROVIDER_VALUES =
  Object.freeze(
    Object.values(
      PAYMENT_PROVIDERS
    )
  );


function isKnownPaymentProvider(
  value
) {
  return (
    typeof value ===
      "string" &&
    PAYMENT_PROVIDER_VALUES
      .includes(
        value
      )
  );
}


module.exports = {
  PAYMENT_STATUS,

  PAYMENT_ATTEMPT_STATUS,

  REFUND_STATUS,

  PAYMENT_PROVIDERS,

  PAYMENT_PROVIDER_VALUES,

  isKnownPaymentProvider,
};