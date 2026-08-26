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
  INVOICE_STATUS,

  INVOICE_ITEM_TYPES,

  calculateInvoiceTotal,
} =
  require(
    "../../constants/invoice"
  );


const {
  InvoiceService,
} =
  require(
    "../../services/billing/invoiceService"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0054_invoice_engine.sql"
  );


describe(
  "Phase 15.14 invoice engine",
  () => {

    test(
      "invoice migration exists",
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
      "invoice lifecycle is canonical",
      () => {
        expect(
          INVOICE_STATUS
        ).toEqual(
          expect.objectContaining({
            DRAFT:
              "DRAFT",

            OPEN:
              "OPEN",

            PAID:
              "PAID",

            VOID:
              "VOID",

            UNCOLLECTIBLE:
              "UNCOLLECTIBLE",
          })
        );
      }
    );


    test(
      "invoice item types reserve future financial adjustments",
      () => {
        expect(
          INVOICE_ITEM_TYPES
        ).toEqual(
          expect.objectContaining({
            SUBSCRIPTION:
              "SUBSCRIPTION",

            USAGE:
              "USAGE",

            CREDIT:
              "CREDIT",

            DISCOUNT:
              "DISCOUNT",

            TAX:
              "TAX",
          })
        );
      }
    );


    test(
      "invoice total calculation is deterministic",
      () => {
        expect(
          calculateInvoiceTotal({
            subtotalMinor:
              30000,

            discountMinor:
              1000,

            creditMinor:
              500,

            taxMinor:
              5400,
          })
        ).toBe(
          33900
        );
      }
    );


    test(
      "invoice amounts reject floating point minor units",
      () => {
        expect(
          () =>
            calculateInvoiceTotal({
              subtotalMinor:
                100.5,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "INVOICE_AMOUNT_INVALID",
          })
        );
      }
    );


    test(
      "invoice schema stores money using BIGINT",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /subtotal_minor\s+BIGINT/i
        );


        expect(
          source
        ).toMatch(
          /total_minor\s+BIGINT/i
        );


        expect(
          source
        ).toMatch(
          /amount_minor\s+BIGINT/i
        );
      }
    );


    test(
      "finalized invoice financials are database protected",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_protect_finalized_invoice_financials"
        );


        expect(
          source
        ).toContain(
          "finalized invoice financial fields are immutable"
        );
      }
    );


    test(
      "finalized invoice items are immutable",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_protect_finalized_invoice_items"
        );


        expect(
          source
        ).toContain(
          "finalized invoice items are immutable"
        );
      }
    );


    test(
      "Stripe and Razorpay identifiers do not contaminate invoice pricing",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /stripe_price_id/i
        );


        expect(
          source
        ).not.toMatch(
          /razorpay_plan_id/i
        );
      }
    );


    test(
      "Growth overage baseline is frozen",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        // Growth recovery USD = $1.25
        expect(
          source
        ).toContain(
          "125::BIGINT"
        );


        // Growth recovery INR = ₹119
        expect(
          source
        ).toContain(
          "11900::BIGINT"
        );
      }
    );


    test(
      "invoice service fails closed on invalid period",
      async () => {
        const service =
          new InvoiceService({
            repository: {},
          });


        await expect(
          service.generate({
            organizationId:
              "org-a",

            periodStart:
              "2026-09-01",

            periodEnd:
              "2026-08-01",
          })
        ).rejects.toMatchObject({
          code:
            "INVOICE_PERIOD_INVALID",
        });
      }
    );


    test(
      "invoice service remains payment-provider independent",
      () => {
        const servicePath =
          path.join(
            __dirname,
            "..",
            "..",
            "services",
            "billing",
            "invoiceService.js"
          );


        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /\bstripe\b/i
        );


        expect(
          source
        ).not.toMatch(
          /\brazorpay\b/i
        );
      }
    );
  }
);