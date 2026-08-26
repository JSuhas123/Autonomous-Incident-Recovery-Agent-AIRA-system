"use strict";


const PAYMENT_WEBHOOK_STATUS =
  Object.freeze({

    RECEIVED:
      "RECEIVED",

    PROCESSING:
      "PROCESSING",

    PROCESSED:
      "PROCESSED",

    IGNORED:
      "IGNORED",

    FAILED:
      "FAILED",
  });


const RAZORPAY_WEBHOOK_EVENTS =
  Object.freeze({

    PAYMENT_AUTHORIZED:
      "payment.authorized",

    PAYMENT_CAPTURED:
      "payment.captured",

    PAYMENT_FAILED:
      "payment.failed",

    ORDER_PAID:
      "order.paid",

    REFUND_CREATED:
      "refund.created",

    REFUND_PROCESSED:
      "refund.processed",

    REFUND_FAILED:
      "refund.failed",
  });


const STRIPE_WEBHOOK_EVENTS =
  Object.freeze({

    PAYMENT_INTENT_PROCESSING:
      "payment_intent.processing",

    PAYMENT_INTENT_SUCCEEDED:
      "payment_intent.succeeded",

    PAYMENT_INTENT_FAILED:
      "payment_intent.payment_failed",

    PAYMENT_INTENT_CANCELLED:
      "payment_intent.canceled",

    CHARGE_REFUNDED:
      "charge.refunded",
  });


module.exports = {
  PAYMENT_WEBHOOK_STATUS,

  RAZORPAY_WEBHOOK_EVENTS,

  STRIPE_WEBHOOK_EVENTS,
};