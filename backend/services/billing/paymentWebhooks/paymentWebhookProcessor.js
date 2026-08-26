"use strict";

const PostgresPaymentWebhookRepository =
  require(
    "../../../persistence/postgres/PostgresPaymentWebhookRepository"
  );

const PostgresPaymentProviderSessionRepository =
  require(
    "../../../persistence/postgres/PostgresPaymentProviderSessionRepository"
  );

const {
  succeedPaymentAttempt,

  failPaymentAttempt,
} =
  require(
    "../paymentService"
  );

const {
  RAZORPAY_WEBHOOK_EVENTS,

  STRIPE_WEBHOOK_EVENTS,
} =
  require(
    "../../../constants/paymentWebhooks"
  );


class PaymentWebhookProcessor {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresPaymentWebhookRepository(
        options
      );

    this.sessionRepository =
      options.sessionRepository ||
      new PostgresPaymentProviderSessionRepository(
        options
      );
  }


  createError(
    message,
    code,
    status =
      500
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


  async resolveProviderSession(
    webhook
  ) {
    if (
      !webhook
        .provider_session_id
    ) {
      return null;
    }


    return this
      .sessionRepository
      .findByProviderSession({
        provider:
          webhook.provider,

        providerSessionId:
          webhook
            .provider_session_id,
      });
  }


  async process(
    webhookEventId
  ) {
    const webhook =
      await this.repository
        .claim(
          webhookEventId
        );


    if (
      !webhook
    ) {
      return {
        claimed:
          false,

        duplicate:
          true,
      };
    }


    try {
      if (
        webhook.provider ===
          "razorpay"
      ) {
        return await this
          .processRazorpay(
            webhook
          );
      }


      if (
        webhook.provider ===
          "stripe"
      ) {
        return await this
          .processStripe(
            webhook
          );
      }


      return this
        .ignore(
          webhook,
          "Unsupported payment provider"
        );

    } catch (
      error
    ) {
      await this.repository
        .markFailed({
          webhookEventId:
            webhook.id,

          code:
            error.code ||
            "PAYMENT_WEBHOOK_PROCESSING_FAILED",

          message:
            error.message,
        });


      throw error;
    }
  }


  async processRazorpay(
    webhook
  ) {
    const eventType =
      webhook
        .event_type;


    switch (
      eventType
    ) {

      case RAZORPAY_WEBHOOK_EVENTS
        .PAYMENT_CAPTURED:

      case RAZORPAY_WEBHOOK_EVENTS
        .ORDER_PAID:

        return this
          .succeed(
            webhook
          );


      case RAZORPAY_WEBHOOK_EVENTS
        .PAYMENT_FAILED:

        return this
          .fail(
            webhook
          );


      case RAZORPAY_WEBHOOK_EVENTS
        .PAYMENT_AUTHORIZED:

        /**
         * Authorized is not final settlement.
         *
         * AIRA waits for captured / order.paid.
         */
        return this
          .ignore(
            webhook,

            "Razorpay payment is authorized but not yet captured"
          );


      default:

        return this
          .ignore(
            webhook,

            "Razorpay event is not handled by Phase 15.18"
          );
    }
  }


  async processStripe(
    webhook
  ) {
    switch (
      webhook.event_type
    ) {

      case STRIPE_WEBHOOK_EVENTS
        .PAYMENT_INTENT_SUCCEEDED:

        return this
          .succeed(
            webhook
          );


      case STRIPE_WEBHOOK_EVENTS
        .PAYMENT_INTENT_FAILED:

        return this
          .fail(
            webhook
          );


      case STRIPE_WEBHOOK_EVENTS
        .PAYMENT_INTENT_PROCESSING:

      case STRIPE_WEBHOOK_EVENTS
        .PAYMENT_INTENT_CANCELLED:

      default:

        return this
          .ignore(
            webhook,

            "Stripe event does not produce final settlement in this processor"
          );
    }
  }


  async succeed(
    webhook
  ) {
    const mapping =
      await this
        .resolveProviderSession(
          webhook
        );


    if (
      !mapping
    ) {
      throw this.createError(
        "Payment provider session mapping not found",
        "PAYMENT_WEBHOOK_SESSION_NOT_FOUND"
      );
    }


    const result =
      await succeedPaymentAttempt({
        organizationId:
          mapping
            .organization_public_id,

        paymentCode:
          mapping
            .payment_code,

        attemptCode:
          mapping
            .attempt_code,

        providerPaymentId:
          webhook
            .provider_payment_id ||
          webhook
            .provider_session_id,

        providerPaymentIntentId:
          webhook.provider ===
            "stripe"
            ? webhook
                .provider_session_id
            : null,

        responsePayload: {
          webhookEventId:
            webhook
              .provider_event_id,

          eventType:
            webhook
              .event_type,
        },
      });


    await this
      .sessionRepository
      .updateProviderStatus({
        provider:
          webhook.provider,

        providerSessionId:
          webhook
            .provider_session_id,

        providerStatus:
          webhook
            .event_type,

        status:
          "SUCCEEDED",
      });


    await this.repository
      .markProcessed({
        webhookEventId:
          webhook.id,

        organizationId:
          mapping
            .organization_id,

        paymentId:
          mapping
            .payment_id,

        paymentAttemptId:
          mapping
            .payment_attempt_id,
      });


    return {
      processed:
        true,

      paymentSucceeded:
        true,

      duplicatePayment:
        Boolean(
          result
            .duplicate
        ),

      paymentCode:
        mapping
          .payment_code,
    };
  }


  async fail(
    webhook
  ) {
    const mapping =
      await this
        .resolveProviderSession(
          webhook
        );


    if (
      !mapping
    ) {
      throw this.createError(
        "Payment provider session mapping not found",
        "PAYMENT_WEBHOOK_SESSION_NOT_FOUND"
      );
    }


    const payload =
      webhook.payload ||
      {};


    const razorpayPayment =
      payload
        ?.payload
        ?.payment
        ?.entity ||
      {};


    const stripeObject =
      payload
        ?.data
        ?.object ||
      {};


    const failureCode =
      razorpayPayment
        ?.error_code ||
      stripeObject
        ?.last_payment_error
        ?.code ||
      "PROVIDER_PAYMENT_FAILED";


    const failureMessage =
      razorpayPayment
        ?.error_description ||
      stripeObject
        ?.last_payment_error
        ?.message ||
      "Payment provider reported failure";


    await failPaymentAttempt({
      organizationId:
        mapping
          .organization_public_id,

      paymentCode:
        mapping
          .payment_code,

      attemptCode:
        mapping
          .attempt_code,

      failureCode,

      failureMessage,

      responsePayload: {
        webhookEventId:
          webhook
            .provider_event_id,

        eventType:
          webhook
            .event_type,
      },
    });


    await this
      .sessionRepository
      .updateProviderStatus({
        provider:
          webhook.provider,

        providerSessionId:
          webhook
            .provider_session_id,

        providerStatus:
          webhook
            .event_type,

        status:
          "FAILED",
      });


    await this.repository
      .markProcessed({
        webhookEventId:
          webhook.id,

        organizationId:
          mapping
            .organization_id,

        paymentId:
          mapping
            .payment_id,

        paymentAttemptId:
          mapping
            .payment_attempt_id,
      });


    return {
      processed:
        true,

      paymentFailed:
        true,

      paymentCode:
        mapping
          .payment_code,
    };
  }


  async ignore(
    webhook,
    reason
  ) {
    await this.repository
      .markIgnored({
        webhookEventId:
          webhook.id,

        reason,
      });


    return {
      processed:
        true,

      ignored:
        true,

      reason,
    };
  }
}


const paymentWebhookProcessor =
  new PaymentWebhookProcessor();


module.exports = {
  PaymentWebhookProcessor,

  paymentWebhookProcessor,
};