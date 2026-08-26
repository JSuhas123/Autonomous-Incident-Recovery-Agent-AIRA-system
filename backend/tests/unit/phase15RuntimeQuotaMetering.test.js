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
  COMMERCIAL_ENTITLEMENTS,
} =
  require(
    "../../constants/commercialEntitlements"
  );


const {
  BillingQuotaService,
} =
  require(
    "../../services/billing/billingQuotaService"
  );


const {
  BillingRuntimeCacheService,
} =
  require(
    "../../services/billing/billingRuntimeCacheService"
  );


const {
  autonomousRecoveryUsageKey,
} =
  require(
    "../../services/billing/usageIdempotency"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0051_runtime_entitlements_quota.sql"
  );


describe(
  "Phase 15.9-15.11 runtime quota and metering",
  () => {

    test(
      "runtime entitlement migration exists",
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
      "autonomous recovery commercial entitlements are canonical",
      () => {
        expect(
          COMMERCIAL_ENTITLEMENTS
            .AUTONOMOUS_RECOVERY_ENABLED
        ).toBe(
          "autonomous_recovery.enabled"
        );


        expect(
          COMMERCIAL_ENTITLEMENTS
            .AUTONOMOUS_RECOVERY_MONTHLY_INCLUDED
        ).toBe(
          "autonomous_recovery.monthly.included"
        );
      }
    );


    test(
      "Growth includes 150 autonomous recoveries",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "('growth', 'autonomous_recovery.monthly.included', 150::BIGINT)"
        );
      }
    );


    test(
      "Scale includes 1000 autonomous recoveries",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "('scale', 'autonomous_recovery.monthly.included', 1000::BIGINT)"
        );
      }
    );


    test(
      "billing cache is explicitly Redis acceleration",
      () => {
        const cache =
          new BillingRuntimeCacheService({
            client:
              null,
          });


        expect(
          cache
            .entitlementKey(
              "org-a"
            )
        ).toContain(
          "aira:billing:entitlements:v1:org-a"
        );
      }
    );


    test(
      "quota service defaults to monthly UTC period",
      () => {
        const service =
          new BillingQuotaService({
            usageRepository:
              {},
          });


        const result =
          service
            .resolveDefaultPeriod(
              new Date(
                "2026-08-26T12:00:00Z"
              )
            );


        expect(
          result
            .periodStart
            .toISOString()
        ).toBe(
          "2026-08-01T00:00:00.000Z"
        );


        expect(
          result
            .periodEnd
            .toISOString()
        ).toBe(
          "2026-09-01T00:00:00.000Z"
        );
      }
    );


    test(
      "autonomous recovery billing key remains deterministic",
      () => {
        expect(
          autonomousRecoveryUsageKey({
            recoveryDecisionId:
              "rec-100",
          })
        ).toBe(
          "autonomous_recovery:rec-100"
        );
      }
    );


    test(
      "production autonomy is independently entitled",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "'production_autonomy.enabled'"
        );


        expect(
          source
        ).toContain(
          "('starter', 'production_autonomy.enabled', FALSE)"
        );


        expect(
          source
        ).toContain(
          "('growth', 'production_autonomy.enabled', TRUE)"
        );
      }
    );
  }
);