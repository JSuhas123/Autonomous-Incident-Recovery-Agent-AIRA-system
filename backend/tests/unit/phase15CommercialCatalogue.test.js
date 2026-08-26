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
  PLAN_CODES,

  LEGACY_PLAN_ALIASES,

  PLAN_VALUES,

  normalizePlanCode,
} =
  require(
    "../../constants/plans"
  );

const {
  ENTITLEMENTS,

  PLAN_ENTITLEMENTS,
} =
  require(
    "../../constants/entitlements"
  );

const {
  DATA_STORES,

  PAYMENT_PROVIDERS,

  FINANCIAL_SOURCE_OF_TRUTH,

  ANALYTICS_SINK,

  INFRASTRUCTURE_GRAPH_STORE,

  isAuthoritativeStore,

  assertFinancialStore,
} =
  require(
    "../../constants/platformDataArchitecture"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0048_billing_commercial_catalogue.sql"
  );


describe(
  "Phase 15.0-15.2 commercial catalogue foundation",
  () => {

    test(
      "canonical commercial plan vocabulary is frozen",
      () => {
        expect(
          PLAN_VALUES
        ).toEqual([
          "developer",
          "starter",
          "growth",
          "scale",
          "enterprise",
        ]);


        expect(
          PLAN_CODES
            .GROWTH
        ).toBe(
          "growth"
        );
      }
    );


    test(
      "legacy plans normalize to canonical commercial plans",
      () => {
        expect(
          LEGACY_PLAN_ALIASES
            .team
        ).toBe(
          "starter"
        );


        expect(
          LEGACY_PLAN_ALIASES
            .business
        ).toBe(
          "growth"
        );


        expect(
          normalizePlanCode(
            "team"
          )
        ).toBe(
          "starter"
        );


        expect(
          normalizePlanCode(
            "business"
          )
        ).toBe(
          "growth"
        );
      }
    );


    test(
      "unknown plan fails normalization",
      () => {
        expect(
          normalizePlanCode(
            "ultra_root"
          )
        ).toBeNull();
      }
    );


    test(
      "all canonical plans have compatibility entitlements",
      () => {
        for (
          const plan
          of PLAN_VALUES
        ) {
          expect(
            PLAN_ENTITLEMENTS[
              plan
            ]
          ).toBeDefined();
        }
      }
    );


    test(
      "Growth commercial limits match frozen Phase 15 baseline",
      () => {
        expect(
          PLAN_ENTITLEMENTS
            .growth[
              ENTITLEMENTS
                .ENVIRONMENTS_MAX
            ]
        ).toBe(
          10
        );


        expect(
          PLAN_ENTITLEMENTS
            .growth[
              ENTITLEMENTS
                .MEMBERS_MAX
            ]
        ).toBe(
          20
        );
      }
    );


    test(
      "PostgreSQL is the only authoritative financial datastore",
      () => {
        expect(
          FINANCIAL_SOURCE_OF_TRUTH
        ).toBe(
          DATA_STORES
            .POSTGRESQL
        );


        expect(
          isAuthoritativeStore(
            DATA_STORES
              .POSTGRESQL
          )
        ).toBe(
          true
        );


        expect(
          isAuthoritativeStore(
            DATA_STORES
              .CLICKHOUSE
          )
        ).toBe(
          false
        );


        expect(
          isAuthoritativeStore(
            DATA_STORES
              .NEO4J
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "ClickHouse and Neo4j responsibilities are frozen",
      () => {
        expect(
          ANALYTICS_SINK
        ).toBe(
          DATA_STORES
            .CLICKHOUSE
        );


        expect(
          INFRASTRUCTURE_GRAPH_STORE
        ).toBe(
          DATA_STORES
            .NEO4J
        );
      }
    );


    test(
      "financial truth cannot be assigned to analytics or graph stores",
      () => {
        expect(
          () =>
            assertFinancialStore(
              DATA_STORES
                .CLICKHOUSE
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "FINANCIAL_STORE_NOT_AUTHORITATIVE",
          })
        );


        expect(
          () =>
            assertFinancialStore(
              DATA_STORES
                .NEO4J
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "FINANCIAL_STORE_NOT_AUTHORITATIVE",
          })
        );
      }
    );


    test(
      "both payment providers are part of the frozen architecture",
      () => {
        expect(
          PAYMENT_PROVIDERS
        ).toEqual(
          expect.objectContaining({
            RAZORPAY:
              "razorpay",

            STRIPE:
              "stripe",
          })
        );
      }
    );


    test(
      "commercial catalogue migration exists",
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
      "migration introduces versioned commercial catalogue",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "billing.plans"
        );


        expect(
          source
        ).toContain(
          "billing.plan_versions"
        );


        expect(
          source
        ).toContain(
          "billing.prices"
        );


        expect(
          source
        ).toContain(
          "billing.entitlement_definitions"
        );


        expect(
          source
        ).toContain(
          "billing.plan_entitlements"
        );
      }
    );


    test(
      "money uses integer minor units",
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
          /amount_minor\s+(REAL|FLOAT|DOUBLE)/i
        );
      }
    );


    test(
      "USD and INR price books are both seeded",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "'USD'"
        );


        expect(
          source
        ).toContain(
          "'INR'"
        );


        expect(
          source
        ).toContain(
          "growth_monthly_usd_2026_08"
        );


        expect(
          source
        ).toContain(
          "growth_monthly_inr_2026_08"
        );
      }
    );


    test(
      "Growth price baseline is frozen",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        // $249.00
        expect(
          source
        ).toContain(
          "24900::BIGINT"
        );


        // ₹23,999.00
        expect(
          source
        ).toContain(
          "2399900::BIGINT"
        );
      }
    );


    test(
      "Enterprise remains contract priced",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).not.toContain(
          "enterprise_monthly_usd_2026_08"
        );


        expect(
          source
        ).not.toContain(
          "enterprise_monthly_inr_2026_08"
        );
      }
    );
  }
);