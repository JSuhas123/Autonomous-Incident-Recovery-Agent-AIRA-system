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
  calculateGrossProfitMinor,

  calculateGrossMarginBasisPoints,

  ECONOMICS_REVENUE_SOURCES,

  ECONOMICS_COST_SOURCES,
} =
  require(
    "../../constants/tenantEconomics"
  );


const {
  TenantEconomicsService,
} =
  require(
    "../../services/billing/tenantEconomicsService"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0053_tenant_economics.sql"
  );


describe(
  "Phase 15.13 tenant economics",
  () => {

    test(
      "tenant economics migration exists",
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
      "gross profit subtracts internal cost from revenue",
      () => {
        expect(
          calculateGrossProfitMinor({
            revenueMinor:
              10000,

            costMinor:
              2500,
          })
        ).toBe(
          7500
        );
      }
    );


    test(
      "gross margin uses basis points",
      () => {
        expect(
          calculateGrossMarginBasisPoints({
            revenueMinor:
              10000,

            grossProfitMinor:
              7500,
          })
        ).toBe(
          7500
        );
      }
    );


    test(
      "negative gross margin is supported",
      () => {
        expect(
          calculateGrossMarginBasisPoints({
            revenueMinor:
              10000,

            grossProfitMinor:
              -2500,
          })
        ).toBe(
          -2500
        );
      }
    );


    test(
      "zero revenue has undefined gross margin",
      () => {
        expect(
          calculateGrossMarginBasisPoints({
            revenueMinor:
              0,

            grossProfitMinor:
              -500,
          })
        ).toBeNull();
      }
    );


    test(
      "economics separates provisional revenue from cost authority",
      () => {
        expect(
          ECONOMICS_REVENUE_SOURCES
            .SUBSCRIPTION_ESTIMATE
        ).toBe(
          "SUBSCRIPTION_ESTIMATE"
        );


        expect(
          ECONOMICS_COST_SOURCES
            .COST_LEDGER
        ).toBe(
          "COST_LEDGER"
        );
      }
    );


    test(
      "snapshot stores revenue, costs, profit and margin",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "total_revenue_minor"
        );


        expect(
          source
        ).toContain(
          "total_cost_minor"
        );


        expect(
          source
        ).toContain(
          "gross_profit_minor"
        );


        expect(
          source
        ).toContain(
          "gross_margin_basis_points"
        );
      }
    );


    test(
      "economics contains detailed COGS categories",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        const expected =
          [
            "llm_cost_minor",

            "compute_cost_minor",

            "storage_cost_minor",

            "network_cost_minor",

            "vector_cost_minor",

            "notification_cost_minor",

            "database_cost_minor",

            "payment_processing_cost_minor",
          ];


        for (
          const column
          of expected
        ) {
          expect(
            source
          ).toContain(
            column
          );
        }
      }
    );


    test(
      "economics snapshots identify themselves as provisional before invoices",
      async () => {
        const repository = {
          calculateAndStore:
            jest.fn(
              async (
                value
              ) =>
                value
            ),
        };


        const service =
          new TenantEconomicsService({
            repository,
          });


        const result =
          await service
            .calculate({
              organizationId:
                "org-test",

              currency:
                "USD",

              periodStart:
                new Date(
                  "2026-08-01T00:00:00Z"
                ),

              periodEnd:
                new Date(
                  "2026-09-01T00:00:00Z"
                ),
            });


        expect(
          result
            .revenueSource
        ).toBe(
          "SUBSCRIPTION_ESTIMATE"
        );


        expect(
          result
            .costSource
        ).toBe(
          "COST_LEDGER"
        );


        expect(
          result
            .metadata
            .invoiceAuthoritative
        ).toBe(
          false
        );
      }
    );


    test(
      "invalid economics period fails closed",
      async () => {
        const service =
          new TenantEconomicsService({
            repository: {},
          });


        await expect(
          service.calculate({
            organizationId:
              "org-test",

            periodStart:
              "2026-09-01",

            periodEnd:
              "2026-08-01",
          })
        ).rejects.toMatchObject({
          code:
            "ECONOMICS_PERIOD_INVALID",
        });
      }
    );
  }
);