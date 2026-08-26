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
  BILLING_METERS,

  BILLING_METER_VALUES,

  isKnownBillingMeter,
} =
  require(
    "../../constants/billingMeters"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0049_subscription_entitlement_meter_foundation.sql"
  );


const entitlementServicePath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "core",
    "entitlementService.js"
  );


const subscriptionRepositoryPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "PostgresSubscriptionRepository.js"
  );


describe(
  "Phase 15.3-15.5 subscription, entitlement and meter foundation",
  () => {

    test(
      "Phase 15 migration exists",
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
      "subscription lifecycle is bound to plan versions and prices",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "plan_version_id"
        );


        expect(
          source
        ).toContain(
          "price_id"
        );


        expect(
          source
        ).toContain(
          "current_period_started_at"
        );


        expect(
          source
        ).toContain(
          "current_period_ends_at"
        );


        expect(
          source
        ).toContain(
          "cancel_at_period_end"
        );
      }
    );


    test(
      "legacy commercial plans are migrated",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "WHEN plan = 'team'"
        );


        expect(
          source
        ).toContain(
          "THEN 'starter'"
        );


        expect(
          source
        ).toContain(
          "WHEN plan = 'business'"
        );


        expect(
          source
        ).toContain(
          "THEN 'growth'"
        );
      }
    );


    test(
      "effective entitlement architecture supports tenant overrides",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "billing.tenant_entitlement_overrides"
        );


        expect(
          source
        ).toContain(
          "billing.effective_entitlements"
        );
      }
    );


    test(
      "EntitlementService reads database-backed effective entitlements",
      () => {
        const source =
          fs.readFileSync(
            entitlementServicePath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "PostgresBillingCatalogueRepository"
        );


        expect(
          source
        ).toContain(
          "getEffectiveEntitlements"
        );


        expect(
          source
        ).not.toContain(
          "PLAN_ENTITLEMENTS["
        );
      }
    );


    test(
      "subscription repository exposes Phase 15 lifecycle columns",
      () => {
        const source =
          fs.readFileSync(
            subscriptionRepositoryPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          '"plan_version_id"'
        );


        expect(
          source
        ).toContain(
          '"price_id"'
        );


        expect(
          source
        ).toContain(
          '"billing_interval"'
        );


        expect(
          source
        ).toContain(
          '"currency"'
        );


        expect(
          source
        ).toContain(
          '"current_period_ends_at"'
        );
      }
    );


    test(
      "meter catalogue contains economics-critical meters",
      () => {
        expect(
          BILLING_METER_VALUES
        ).toEqual(
          expect.arrayContaining([
            "incidents_processed",
            "agent_runs",
            "llm_input_tokens",
            "llm_output_tokens",
            "telemetry_bytes",
            "playbook_executions",
            "autonomous_recoveries",
            "evidence_storage_bytes",
          ])
        );
      }
    );


    test(
      "unknown billing meters fail closed",
      () => {
        expect(
          isKnownBillingMeter(
            BILLING_METERS
              .AGENT_RUNS
          )
        ).toBe(
          true
        );


        expect(
          isKnownBillingMeter(
            "money_magic"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "meter definitions are versioned",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "billing.meter_definitions"
        );


        expect(
          source
        ).toContain(
          "meter_code"
        );


        expect(
          source
        ).toContain(
          "version INTEGER"
        );


        expect(
          source
        ).toContain(
          "meter_definition_version_unique"
        );
      }
    );


    test(
      "usage event ledger is deliberately not introduced in this migration",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /CREATE TABLE IF NOT EXISTS\s+billing\.usage_events/i
        );
      }
    );
  }
);