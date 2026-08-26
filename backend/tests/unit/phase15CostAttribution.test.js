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
  BILLING_COST_CATEGORIES,

  BILLING_COST_CODES,

  isKnownBillingCostCode,
} =
  require(
    "../../constants/billingCostCategories"
  );


const {
  decimalToMinorUnits,

  normalizeCurrency,

  validateMinorUnits,
} =
  require(
    "../../services/billing/costMoney"
  );


const {
  CostAttributionService,
} =
  require(
    "../../services/billing/costAttributionService"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0052_cost_attribution.sql"
  );


describe(
  "Phase 15.12 internal cost attribution",
  () => {

    test(
      "cost attribution migration exists",
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
      "LLM, compute, storage and payment processing categories exist",
      () => {
        expect(
          BILLING_COST_CATEGORIES
        ).toEqual(
          expect.objectContaining({
            LLM:
              "LLM",

            COMPUTE:
              "COMPUTE",

            STORAGE:
              "STORAGE",

            PAYMENT_PROCESSING:
              "PAYMENT_PROCESSING",
          })
        );
      }
    );


    test(
      "canonical internal cost codes exist",
      () => {
        expect(
          BILLING_COST_CODES
            .LLM_INFERENCE
        ).toBe(
          "llm_inference"
        );


        expect(
          BILLING_COST_CODES
            .COMPUTE_RUNTIME
        ).toBe(
          "compute_runtime"
        );


        expect(
          isKnownBillingCostCode(
            "llm_inference"
          )
        ).toBe(
          true
        );


        expect(
          isKnownBillingCostCode(
            "root_money_magic"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "money conversion uses decimal strings and minor units",
      () => {
        expect(
          decimalToMinorUnits(
            "1.25",
            "USD"
          )
        ).toBe(
          125
        );


        expect(
          decimalToMinorUnits(
            "239.99",
            "INR"
          )
        ).toBe(
          23999
        );
      }
    );


    test(
      "unsupported precision is rejected",
      () => {
        expect(
          () =>
            decimalToMinorUnits(
              "1.2345",
              "USD"
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "COST_DECIMAL_INVALID",
          })
        );
      }
    );


    test(
      "currency is normalized",
      () => {
        expect(
          normalizeCurrency(
            "usd"
          )
        ).toBe(
          "USD"
        );


        expect(
          normalizeCurrency(
            "inr"
          )
        ).toBe(
          "INR"
        );
      }
    );


    test(
      "minor units reject fractional values",
      () => {
        expect(
          () =>
            validateMinorUnits(
              10.5
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "COST_MINOR_AMOUNT_INVALID",
          })
        );
      }
    );


    test(
      "cost events are database immutable",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_prevent_cost_event_mutation"
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
      "financial cost amounts use BIGINT minor units",
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


        expect(
          source
        ).not.toMatch(
          /amount_minor\s+(FLOAT|REAL|DOUBLE)/i
        );
      }
    );


    test(
      "cost attribution is tenant scoped",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "organization_id UUID NOT NULL"
        );


        expect(
          source
        ).toContain(
          "cost event organization/environment mismatch"
        );
      }
    );


    test(
      "cost service rejects unknown cost codes before persistence",
      async () => {
        const service =
          new CostAttributionService({
            repository: {
              recordCost:
                jest.fn(),
            },
          });


        await expect(
          service.record({
            organizationId:
              "org-a",

            costCode:
              "fake_cost",

            currency:
              "USD",

            amountMinor:
              100,

            idempotencyKey:
              "cost:test",

            sourceType:
              "test",
          })
        ).rejects.toMatchObject({
          code:
            "BILLING_COST_CODE_UNKNOWN",
        });
      }
    );
  }
);