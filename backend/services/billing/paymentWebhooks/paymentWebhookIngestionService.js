"use strict";

const crypto =
  require(
    "node:crypto"
  );

const PostgresPaymentWebhookRepository =
  require(
    "../../../persistence/postgres/PostgresPaymentWebhookRepository"
  );

const {
  verifyRazorpaySignature,

  verifyStripeSignature,

  normalizeRawBody,
} =
  require(
    "./webhookSignatureService"
  );


class PaymentWebhookIngestionService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresPaymentWebhookRepository(
        options
      );
  }


  createError(
    message,
    code,
    status =
      400
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


  parseJson(
    rawBody
  ) {
    try {
      return JSON.parse(
        normalizeRawBody(
          rawBody
        )
          .toString(
            "utf8"
          )
      );

    } catch (
      _error
    ) {
      throw this.createError(
        "Webhook body contains invalid JSON",
        "PAYMENT_WEBHOOK_JSON_INVALID"
      );
    }
  }


  async ingestRazorpay({
    rawBody,

    signature,

    eventId,
  }) {
    verifyRazorpaySignature({
      rawBody,

      signature,
    });


    const payload =
      this
        .parseJson(
          rawBody
        );


    if (
      typeof payload.event !==
        "string" ||
      payload.event.length ===
        0
    ) {
      throw this.createError(
        "Razorpay webhook event type is missing",
        "RAZORPAY_WEBHOOK_EVENT_TYPE_REQUIRED"
      );
    }


    /**
     * Razorpay exposes x-razorpay-event-id specifically for webhook
     * idempotency.
     *
     * We fail closed if it is missing rather than deriving identity from the
     * payload.
     */
    if (
      typeof eventId !==
        "string" ||
      eventId.trim().length ===
        0
    ) {
      throw this.createError(
        "Razorpay webhook event ID is required",
        "RAZORPAY_WEBHOOK_EVENT_ID_REQUIRED"
      );
    }


    const paymentEntity =
      payload
        ?.payload
        ?.payment
        ?.entity ||
      null;


    const orderEntity =
      payload
        ?.payload
        ?.order
        ?.entity ||
      null;


    const refundEntity =
      payload
        ?.payload
        ?.refund
        ?.entity ||
      null;


    const providerSessionId =
      paymentEntity
        ?.order_id ||
      orderEntity
        ?.id ||
      null;


    const providerPaymentId =
      paymentEntity
        ?.id ||
      refundEntity
        ?.payment_id ||
      null;


    return this.repository
      .ingest({
        provider:
          "razorpay",

        providerEventId:
          eventId.trim(),

        eventType:
          payload.event,

        providerCreatedAt:
          payload.created_at
            ? new Date(
                Number(
                  payload.created_at
                ) *
                1000
              )
            : null,

        signatureVerified:
          true,

        providerSessionId,

        providerPaymentId,

        payload,

        metadata: {
          source:
            "razorpay_webhook",
        },
      });
  }


  async ingestStripe({
    rawBody,

    signature,
  }) {
    const stripeEvent =
      verifyStripeSignature({
        rawBody,

        signature,
      });


    if (
      !stripeEvent
        ?.id ||
      !stripeEvent
        ?.type
    ) {
      throw this.createError(
        "Stripe event is invalid",
        "STRIPE_WEBHOOK_EVENT_INVALID"
      );
    }


    const object =
      stripeEvent
        ?.data
        ?.object ||
      {};


    return this.repository
      .ingest({
        provider:
          "stripe",

        providerEventId:
          stripeEvent.id,

        eventType:
          stripeEvent.type,

        providerCreatedAt:
          stripeEvent.created
            ? new Date(
                Number(
                  stripeEvent.created
                ) *
                1000
              )
            : null,

        signatureVerified:
          true,

        providerSessionId:
          object.id ||
          null,

        providerPaymentId:
          object.id ||
          null,

        payload:
          stripeEvent,

        metadata: {
          source:
            "stripe_webhook",
        },
      });
  }
}


const paymentWebhookIngestionService =
  new PaymentWebhookIngestionService();


module.exports = {
  PaymentWebhookIngestionService,

  paymentWebhookIngestionService,
};