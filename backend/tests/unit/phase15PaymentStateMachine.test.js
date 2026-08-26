"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );


const {
  PAYMENT_STATUS,

  PAYMENT_ATTEMPT_STATUS,

  REFUND_STATUS,

  PAYMENT_PROVIDERS,

  isKnownPaymentProvider,
} =
  require(
    "../../constants/payments"
  );


const {
  PaymentService,
} =
  require(
    "../../services/billing/paymentService"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0056_payment_state_machine.sql"
  );


describe(
  "Phase 15.16 provider-neutral payment state machine",
  () => {

    test(
      "payment migration exists",
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
      "canonical payment lifecycle exists",
      () => {
        expect(
          PAYMENT_STATUS
        ).toEqual(
          expect.objectContaining({
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
          })
        );
      }
    );


    test(
      "canonical payment attempt lifecycle exists",
      () => {
        expect(
          PAYMENT_ATTEMPT_STATUS
        ).toEqual(
          expect.objectContaining({
            CREATED:
              "CREATED",

            PROCESSING:
              "PROCESSING",

            SUCCEEDED:
              "SUCCEEDED",

            FAILED:
              "FAILED",
          })
        );
      }
    );


    test(
      "refund lifecycle exists",
      () => {
        expect(
          REFUND_STATUS
            .REQUESTED
        ).toBe(
          "REQUESTED"
        );


        expect(
          REFUND_STATUS
            .SUCCEEDED
        ).toBe(
          "SUCCEEDED"
        );
      }
    );


    test(
      "Stripe and Razorpay are canonical providers",
      () => {
        expect(
          PAYMENT_PROVIDERS
            .STRIPE
        ).toBe(
          "stripe"
        );


        expect(
          PAYMENT_PROVIDERS
            .RAZORPAY
        ).toBe(
          "razorpay"
        );


        expect(
          isKnownPaymentProvider(
            "stripe"
          )
        ).toBe(
          true
        );


        expect(
          isKnownPaymentProvider(
            "razorpay"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "unknown provider fails closed",
      () => {
        expect(
          isKnownPaymentProvider(
            "random_bank"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "payment state transitions are protected in PostgreSQL",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_validate_payment_transition"
        );


        expect(
          source
        ).toContain(
          "terminal payment state"
        );
      }
    );


    test(
      "succeeded payment financials are immutable",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_protect_succeeded_payment_financials"
        );


        expect(
          source
        ).toContain(
          "succeeded payment financial fields are immutable"
        );
      }
    );


    test(
      "payment amounts use BIGINT minor units",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /amount_minor\s+BIGINT/i
        );
      }
    );


    test(
      "payment service rejects unknown provider before persistence",
      async () => {
        const service =
          new PaymentService({
            repository:
              {},
          });


        await expect(
          service.beginAttempt({
            organizationId:
              "org-a",

            paymentCode:
              "pay-a",

            provider:
              "unknown",
          })
        ).rejects.toMatchObject({
          code:
            "PAYMENT_PROVIDER_INVALID",
        });
      }
    );


    test(
      "provider-specific APIs are not called by payment service",
      () => {
        const servicePath =
          path.join(
            __dirname,
            "..",
            "..",
            "services",
            "billing",
            "paymentService.js"
          );


        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /require\s*\(\s*["']stripe["']/i
        );


        expect(
          source
        ).not.toMatch(
          /require\s*\(\s*["']razorpay["']/i
        );
      }
    );
  }
);
