"use strict";

const express =
  require(
    "express"
  );

const {
  paymentWebhookIngestionService,
} =
  require(
    "../services/billing/paymentWebhooks/paymentWebhookIngestionService"
  );

const {
  paymentWebhookProcessor,
} =
  require(
    "../services/billing/paymentWebhooks/paymentWebhookProcessor"
  );


const router =
  express.Router();


function sendWebhookError(
  res,
  error
) {
  return res
    .status(
      Number(
        error.status
      ) ||
      400
    )
    .json({
      accepted:
        false,

      code:
        error.code ||
        "PAYMENT_WEBHOOK_REJECTED",
    });
}


// ============================================================================
// RAZORPAY
//
// CRITICAL:
// express.raw MUST see the body BEFORE express.json parses it.
// ============================================================================

router.post(
  "/razorpay",

  express.raw({
    type:
      "application/json",

    limit:
      "1mb",
  }),

  async (
    req,
    res
  ) => {
    try {
      const result =
        await paymentWebhookIngestionService
          .ingestRazorpay({
            rawBody:
              req.body,

            signature:
              req.headers[
                "x-razorpay-signature"
              ],

            eventId:
              req.headers[
                "x-razorpay-event-id"
              ],
          });


      /**
       * Signature has been verified and the event is durably stored.
       *
       * Acknowledge delivery now.
       */
      res
        .status(
          200
        )
        .json({
          accepted:
            true,

          duplicate:
            result
              .duplicate,
        });


      /**
       * Process after acknowledgement.
       *
       * In later deployment hardening this can be dispatched through
       * RabbitMQ while PostgreSQL remains the durable source of truth.
       */
      if (
        result.created
      ) {
        setImmediate(
          () => {
            paymentWebhookProcessor
              .process(
                result
                  .event
                  .id
              )
              .catch(
                (
                  error
                ) => {
                  console.error(
                    "[payment-webhook] Razorpay processing failed",
                    {
                      eventId:
                        result
                          .event
                          .id,

                      code:
                        error
                          .code,

                      message:
                        error
                          .message,
                    }
                  );
                }
              );
          }
        );
      }


      return;

    } catch (
      error
    ) {
      return sendWebhookError(
        res,
        error
      );
    }
  }
);


// ============================================================================
// STRIPE
// ============================================================================

router.post(
  "/stripe",

  express.raw({
    type:
      "application/json",

    limit:
      "1mb",
  }),

  async (
    req,
    res
  ) => {
    try {
      const result =
        await paymentWebhookIngestionService
          .ingestStripe({
            rawBody:
              req.body,

            signature:
              req.headers[
                "stripe-signature"
              ],
          });


      res
        .status(
          200
        )
        .json({
          accepted:
            true,

          duplicate:
            result
              .duplicate,
        });


      if (
        result.created
      ) {
        setImmediate(
          () => {
            paymentWebhookProcessor
              .process(
                result
                  .event
                  .id
              )
              .catch(
                (
                  error
                ) => {
                  console.error(
                    "[payment-webhook] Stripe processing failed",
                    {
                      eventId:
                        result
                          .event
                          .id,

                      code:
                        error
                          .code,

                      message:
                        error
                          .message,
                    }
                  );
                }
              );
          }
        );
      }


      return;

    } catch (
      error
    ) {
      return sendWebhookError(
        res,
        error
      );
    }
  }
);


module.exports =
  router;