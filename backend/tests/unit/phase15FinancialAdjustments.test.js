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
  DISCOUNT_TYPES,

  FINANCIAL_ADJUSTMENT_TYPES,

  calculatePercentageDiscount,
} =
  require(
    "../../constants/financialAdjustments"
  );


const {
  FinancialAdjustmentService,
} =
  require(
    "../../services/billing/financialAdjustmentService"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0055_financial_adjustments.sql"
  );


describe(
  "Phase 15.15 credits, discounts and financial adjustments",
  () => {

    test(
      "financial adjustment migration exists",
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
      "fixed and percentage discounts are canonical",
      () => {
        expect(
          DISCOUNT_TYPES
            .FIXED
        ).toBe(
          "FIXED"
        );


        expect(
          DISCOUNT_TYPES
            .PERCENTAGE
        ).toBe(
          "PERCENTAGE"
        );
      }
    );


    test(
      "credit and debit adjustments are canonical",
      () => {
        expect(
          FINANCIAL_ADJUSTMENT_TYPES
            .CREDIT
        ).toBe(
          "CREDIT"
        );


        expect(
          FINANCIAL_ADJUSTMENT_TYPES
            .DEBIT
        ).toBe(
          "DEBIT"
        );
      }
    );


    test(
      "percentage discount uses basis points",
      () => {
        expect(
          calculatePercentageDiscount({
            subtotalMinor:
              10000,

            percentageBasisPoints:
              1000,
          })
        ).toBe(
          1000
        );


        expect(
          calculatePercentageDiscount({
            subtotalMinor:
              10000,

            percentageBasisPoints:
              2500,
          })
        ).toBe(
          2500
        );
      }
    );


    test(
      "percentage discount cannot exceed 100 percent",
      () => {
        expect(
          () =>
            calculatePercentageDiscount({
              subtotalMinor:
                10000,

              percentageBasisPoints:
                10001,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "DISCOUNT_PERCENTAGE_INVALID",
          })
        );
      }
    );


    test(
      "credit balances are represented through grants and immutable applications",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "billing.credit_grants"
        );


        expect(
          source
        ).toContain(
          "billing.invoice_financial_applications"
        );
      }
    );


    test(
      "financial applications are immutable",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_prevent_financial_application_mutation"
        );


        expect(
          source
        ).toContain(
          "BEFORE UPDATE"
        );


        expect(
          source
        ).toContain(
          "BEFORE DELETE"
        );
      }
    );


    test(
      "credit grant amounts use BIGINT minor units",
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
      "financial adjustment service rejects missing reason",
      async () => {
        const service =
          new FinancialAdjustmentService({
            repository:
              {},
          });


        await expect(
          service.grantCredit({
            organizationId:
              "org-a",

            currency:
              "USD",

            amountMinor:
              100,

            reason:
              "",
          })
        ).rejects.toMatchObject({
          code:
            "FINANCIAL_REASON_REQUIRED",
        });
      }
    );


    test(
      "financial adjustment service rejects invalid adjustment type",
      async () => {
        const service =
          new FinancialAdjustmentService({
            repository:
              {},
          });


        await expect(
          service.createAdjustment({
            organizationId:
              "org-a",

            adjustmentType:
              "MAGIC",

            currency:
              "USD",

            amountMinor:
              100,

            reason:
              "test",
          })
        ).rejects.toMatchObject({
          code:
            "FINANCIAL_ADJUSTMENT_TYPE_INVALID",
        });
      }
    );
  }
);