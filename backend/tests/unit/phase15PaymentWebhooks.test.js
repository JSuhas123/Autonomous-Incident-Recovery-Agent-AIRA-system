"use strict";

const crypto =
  require(
    "node:crypto"
  );

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );


const {
  verifyRazorpaySignature,
} =
  require(
    "../../services/billing/paymentWebhooks/webhookSignatureService"
  );


const {
  RAZORPAY_WEBHOOK_EVENTS,

  STRIPE_WEBHOOK_EVENTS,
} =
  require(
    "../../constants/paymentWebhooks"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0058_payment_webhooks.sql"
  );


describe(
  "Phase 15.18 signed payment webhooks",
  () => {

    test(
      "payment webhook migration exists",
      () => {
        expect(
          fs.existsSync(
            migrationPath
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "Razorpay signature verifies against raw body",
      () => {
        const secret =
          "phase15-test-webhook-secret";


        const rawBody =
          Buffer.from(
            JSON.stringify({
              event:
                "payment.captured",
            }),
            "utf8"
          );


        const signature =
          crypto
            .createHmac(
              "sha256",
              secret
            )
            .update(
              rawBody
            )
            .digest(
              "hex"
            );


        expect(
          verifyRazorpaySignature({
            rawBody,

            signature,

            secret,
          })
        ).toBe(
          true
        );
      }
    );


    test(
      "Razorpay invalid signature fails closed",
      () => {
        expect(
          () =>
            verifyRazorpaySignature({
              rawBody:
                Buffer.from(
                  "{}"
                ),

              signature:
                "aaaaaaaa",

              secret:
                "secret",
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "RAZORPAY_WEBHOOK_SIGNATURE_INVALID",
          })
        );
      }
    );


    test(
      "Razorpay final payment events are canonical",
      () => {
        expect(
          RAZORPAY_WEBHOOK_EVENTS
            .PAYMENT_CAPTURED
        ).toBe(
          "payment.captured"
        );


        expect(
          RAZORPAY_WEBHOOK_EVENTS
            .ORDER_PAID
        ).toBe(
          "order.paid"
        );


        expect(
          RAZORPAY_WEBHOOK_EVENTS
            .PAYMENT_FAILED
        ).toBe(
          "payment.failed"
        );
      }
    );


    test(
      "Stripe webhook vocabulary remains structurally supported",
      () => {
        expect(
          STRIPE_WEBHOOK_EVENTS
            .PAYMENT_INTENT_SUCCEEDED
        ).toBe(
          "payment_intent.succeeded"
        );
      }
    );


    test(
      "webhook identity is provider idempotent",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /UNIQUE\s*\(\s*provider\s*,\s*provider_event_id\s*\)/i
        );
      }
    );


    test(
      "webhook payload identity is protected",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_protect_webhook_identity"
        );


        expect(
          source
        ).toContain(
          "payment webhook identity and payload are immutable"
        );
      }
    );


    test(
      "webhook lifecycle supports durable retry state",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "'RECEIVED'"
        );


        expect(
          source
        ).toContain(
          "'PROCESSING'"
        );


        expect(
          source
        ).toContain(
          "'PROCESSED'"
        );


        expect(
          source
        ).toContain(
          "'FAILED'"
        );
      }
    );


    test(
      "Razorpay route explicitly requires raw body",
      () => {
        const routePath =
          path.join(
            __dirname,
            "..",
            "..",
            "routes",
            "paymentWebhookRoutes.js"
          );


        const source =
          fs.readFileSync(
            routePath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "express.raw"
        );


        expect(
          source
        ).toContain(
          "x-razorpay-signature"
        );


        expect(
          source
        ).toContain(
          "x-razorpay-event-id"
        );
      }
    );
  }
);