"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );


function read(
  ...segments
) {
  return fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "..",
      ...segments
    ),
    "utf8"
  );
}


describe(
  "Phase 15.20 architecture certification",
  () => {

    // ========================================================================
    // POSTGRESQL AUTHORITY
    // ========================================================================

    test(
      "PostgreSQL remains authoritative for usage",
      () => {
        const source =
          read(
            "persistence",
            "postgres",
            "migrations",
            "0050_usage_ledger_aggregation.sql"
          );


        expect(
          source
        ).toContain(
          "Authoritative immutable AIRA usage ledger"
        );


        expect(
          source
        ).toContain(
          "Never invoice from Redis or ClickHouse"
        );
      }
    );


    test(
      "cost attribution remains PostgreSQL authoritative",
      () => {
        const source =
          read(
            "persistence",
            "postgres",
            "migrations",
            "0052_cost_attribution.sql"
          );


        expect(
          source
        ).toContain(
          "PostgreSQL remains authoritative"
        );
      }
    );


    // ========================================================================
    // REDIS
    // ========================================================================

    test(
      "Redis is runtime acceleration rather than financial truth",
      () => {
        const source =
          read(
            "services",
            "billing",
            "usageMeterService.js"
          );


        expect(
          source
        ).toContain(
          "PostgreSQL"
        );


        expect(
          source
        ).toContain(
          "Redis"
        );


        expect(
          source
        ).toMatch(
          /best-effort/i
        );
      }
    );


    // ========================================================================
    // PROVIDER SEPARATION
    // ========================================================================

    test(
      "invoice engine does not depend on Stripe or Razorpay SDKs",
      () => {
        const source =
          read(
            "services",
            "billing",
            "invoiceService.js"
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


    test(
      "provider checkout orchestration cannot mark payments successful",
      () => {
        const source =
          read(
            "services",
            "billing",
            "paymentProviderService.js"
          );


        expect(
          source
        ).not.toContain(
          "succeedPaymentAttempt"
        );
      }
    );


    test(
      "Stripe and Razorpay use independent provider adapters",
      () => {
        expect(
          fs.existsSync(
            path.join(
              __dirname,
              "..",
              "..",
              "services",
              "billing",
              "paymentProviders",
              "stripePaymentProvider.js"
            )
          )
        ).toBe(
          true
        );


        expect(
          fs.existsSync(
            path.join(
              __dirname,
              "..",
              "..",
              "services",
              "billing",
              "paymentProviders",
              "razorpayPaymentProvider.js"
            )
          )
        ).toBe(
          true
        );
      }
    );


    // ========================================================================
    // SECRET BOUNDARY
    // ========================================================================

    test(
      "provider session schema never stores payment secrets",
      () => {
        const source =
          read(
            "persistence",
            "postgres",
            "migrations",
            "0057_payment_provider_sessions.sql"
          );


        expect(
          source
        ).not.toMatch(
          /\bclient_secret\s+TEXT\b/i
        );


        expect(
          source
        ).not.toMatch(
          /\bkey_secret\s+TEXT\b/i
        );


        expect(
          source
        ).not.toMatch(
          /\bsecret_key\s+TEXT\b/i
        );
      }
    );


    test(
      "provider configuration sources secrets from environment",
      () => {
        const source =
          read(
            "services",
            "billing",
            "paymentProviders",
            "providerConfig.js"
          );


        expect(
          source
        ).toContain(
          "process.env"
        );


        expect(
          source
        ).toContain(
          "RAZORPAY_KEY_SECRET"
        );


        expect(
          source
        ).toContain(
          "STRIPE_SECRET_KEY"
        );
      }
    );


    // ========================================================================
    // WEBHOOK BOUNDARY
    // ========================================================================

    test(
      "payment webhooks require raw request bodies",
      () => {
        const source =
          read(
            "routes",
            "paymentWebhookRoutes.js"
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
      }
    );


   test(
  "webhook route is mounted before global JSON parsing",
  () => {
    const source =
      read(
        "server.js"
      );


    const lines =
      source.split(
        /\r?\n/
      );


    /**
     * Locate the actual webhook mount.
     *
     * We deliberately inspect code lines rather than using source.indexOf()
     * because comments elsewhere in server.js may mention express.json().
     */
    const webhookRouteLine =
      lines.findIndex(
        (
          line
        ) =>
          line.includes(
            '"/api/billing/webhooks"'
          ) ||
          line.includes(
            "'/api/billing/webhooks'"
          )
      );


    expect(
      webhookRouteLine
    ).toBeGreaterThanOrEqual(
      0
    );


    /**
     * Locate actual express.json() invocation lines.
     *
     * Comments such as:
     *
     *   // must be before express.json()
     *
     * are intentionally ignored.
     */
    const jsonParserLines =
      lines
        .map(
          (
            line,
            index
          ) => ({
            line:
              line.trim(),

            index,
          })
        )
        .filter(
          (
            entry
          ) =>
            /^express\.json\s*\(/.test(
              entry.line
            )
        );


    expect(
      jsonParserLines.length
    ).toBeGreaterThan(
      0
    );


    /**
     * Every global JSON parser in server.js must occur after the payment
     * webhook route.
     *
     * Razorpay and Stripe require access to the untouched raw request body.
     */
    for (
      const parser
      of jsonParserLines
    ) {
      expect(
        parser.index
      ).toBeGreaterThan(
        webhookRouteLine
      );
    }


    /**
     * Confirm the webhook route itself is part of app.use(...).
     */
    const webhookContextStart =
      Math.max(
        0,
        webhookRouteLine -
        3
      );


    const webhookContextEnd =
      Math.min(
        lines.length,
        webhookRouteLine +
        4
      );


    const webhookContext =
      lines
        .slice(
          webhookContextStart,
          webhookContextEnd
        )
        .join(
          "\n"
        );


    expect(
      webhookContext
    ).toContain(
      "app.use"
    );


    expect(
      webhookContext
    ).toContain(
      "paymentWebhookRoutes"
    );
  }
);

    // ========================================================================
    // ENTITLEMENT ARCHITECTURE
    // ========================================================================

    test(
      "commercial capability decisions are entitlement based",
      () => {
        const source =
          read(
            "services",
            "core",
            "entitlementService.js"
          );


        expect(
          source
        ).toMatch(
          /entitlement/i
        );


        expect(
          source
        ).not.toMatch(
          /if\s*\(\s*plan\s*===\s*["']enterprise["']/i
        );
      }
    );


    // ========================================================================
    // COST / REVENUE SEPARATION
    // ========================================================================

    test(
      "tenant economics keeps cost and revenue separate",
      () => {
        const source =
          read(
            "persistence",
            "postgres",
            "migrations",
            "0053_tenant_economics.sql"
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


    // ========================================================================
    // RECONCILIATION
    // ========================================================================

    test(
      "reconciliation does not mutate usage ledger",
      () => {
        const source =
          read(
            "services",
            "billing",
            "billingReconciliationService.js"
          );


        expect(
          source
        ).not.toMatch(
          /UPDATE\s+billing\.usage_events/i
        );


        expect(
          source
        ).not.toMatch(
          /DELETE\s+FROM\s+billing\.usage_events/i
        );
      }
    );


    test(
      "reconciliation does not mutate cost ledger",
      () => {
        const source =
          read(
            "services",
            "billing",
            "billingReconciliationService.js"
          );


        expect(
          source
        ).not.toMatch(
          /UPDATE\s+billing\.cost_events/i
        );


        expect(
          source
        ).not.toMatch(
          /DELETE\s+FROM\s+billing\.cost_events/i
        );
      }
    );


    // ========================================================================
    // PHASE 15 REQUIRED COMPONENTS
    // ========================================================================

    test(
      "all major Phase 15 persistence domains exist",
      () => {
        const migrations = [
          "0048_billing_commercial_catalogue.sql",

          "0049_subscription_entitlement_meter_foundation.sql",

          "0050_usage_ledger_aggregation.sql",

          "0051_runtime_entitlements_quota.sql",

          "0052_cost_attribution.sql",

          "0053_tenant_economics.sql",

          "0054_invoice_engine.sql",

          "0055_financial_adjustments.sql",

          "0056_payment_state_machine.sql",

          "0057_payment_provider_sessions.sql",

          "0058_payment_webhooks.sql",

          "0059_billing_reconciliation.sql",
        ];


        for (
          const migration
          of migrations
        ) {
          expect(
            fs.existsSync(
              path.join(
                __dirname,
                "..",
                "..",
                "persistence",
                "postgres",
                "migrations",
                migration
              )
            )
          ).toBe(
            true
          );
        }
      }
    );
  }
);