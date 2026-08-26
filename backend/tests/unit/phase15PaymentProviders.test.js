"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );


const PaymentProviderAdapter =
  require(
    "../../services/billing/paymentProviders/PaymentProviderAdapter"
  );


const {
  createPaymentProvider,
} =
  require(
    "../../services/billing/paymentProviders/paymentProviderFactory"
  );


const {
  PaymentProviderService,
} =
  require(
    "../../services/billing/paymentProviderService"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0057_payment_provider_sessions.sql"
  );


describe(
  "Phase 15.17 Stripe and Razorpay provider adapters",
  () => {

    test(
      "provider session migration exists",
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
      "provider sessions never persist client secrets",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /client_secret\s+TEXT/i
        );


        expect(
          source
        ).not.toMatch(
          /key_secret\s+TEXT/i
        );


        expect(
          source
        ).not.toMatch(
          /secret_key\s+TEXT/i
        );
      }
    );


    test(
      "Stripe maps to PaymentIntent sessions",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "services",
              "billing",
              "paymentProviders",
              "stripePaymentProvider.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "paymentIntents"
        );


        expect(
          source
        ).toContain(
          "PAYMENT_INTENT"
        );
      }
    );


    test(
      "Stripe creation uses provider idempotency",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "services",
              "billing",
              "paymentProviders",
              "stripePaymentProvider.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "idempotencyKey"
        );


        expect(
          source
        ).toContain(
          "aira-payment-"
        );
      }
    );


    test(
      "Razorpay maps to Order sessions",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "services",
              "billing",
              "paymentProviders",
              "razorpayPaymentProvider.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          '"/orders"'
        );


        expect(
          source
        ).toContain(
          '"ORDER"'
        );
      }
    );


    test(
      "base provider fails closed for unimplemented operations",
      async () => {
        const adapter =
          new PaymentProviderAdapter();


        await expect(
          adapter
            .createCheckoutSession({})
        ).rejects.toThrow();
      }
    );


    test(
      "unknown provider fails closed",
      () => {
        expect(
          () =>
            createPaymentProvider(
              "unknown-provider"
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "PAYMENT_PROVIDER_INVALID",
          })
        );
      }
    );


    test(
      "orchestration can operate against provider-neutral adapter",
      async () => {
        const sessionRepository = {
          findByPayment:
            jest.fn(
              async () =>
                null
            ),

          create:
            jest.fn(
              async (
                value
              ) =>
                value
            ),
        };


        const fakeAdapter = {
          createCheckoutSession:
            jest.fn(
              async () => ({
                provider:
                  "stripe",

                sessionType:
                  "PAYMENT_INTENT",

                providerSessionId:
                  "pi_fake",

                providerStatus:
                  "requires_payment_method",

                amountMinor:
                  1000,

                currency:
                  "USD",

                checkoutReference:
                  "pi_fake",

                client: {
                  provider:
                    "stripe",

                  clientSecret:
                    "not-persisted",
                },
              })
            ),

          cancelCheckoutSession:
            jest.fn(),
        };


        const service =
          new PaymentProviderService({
            sessionRepository,

            providerFactory:
              () =>
                fakeAdapter,
          });


        expect(
          service
        ).toBeInstanceOf(
          PaymentProviderService
        );
      }
    );


    test(
      "payment provider service never marks payments successful itself",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "services",
              "billing",
              "paymentProviderService.js"
            ),
            "utf8"
          );


        expect(
          source
        ).not.toContain(
          "succeedPaymentAttempt"
        );
      }
    );
  }
);