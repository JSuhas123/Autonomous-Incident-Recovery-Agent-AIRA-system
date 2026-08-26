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
  RECONCILIATION_RUN_TYPES,

  RECONCILIATION_CLASSIFICATION,

  RECONCILIATION_REPAIR_STATUS,

  SUBSCRIPTION_CHANGE_TYPES,
} =
  require(
    "../../constants/billingReconciliation"
  );


const {
  SubscriptionReconciliationService,
} =
  require(
    "../../services/billing/subscriptionReconciliationService"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0059_billing_reconciliation.sql"
  );


describe(
  "Phase 15.19 billing reconciliation",
  () => {

    test(
      "reconciliation migration exists",
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
      "payment, webhook, subscription and full reconciliation are canonical",
      () => {
        expect(
          RECONCILIATION_RUN_TYPES
        ).toEqual(
          expect.objectContaining({
            PAYMENT:
              "PAYMENT",

            WEBHOOK:
              "WEBHOOK",

            SUBSCRIPTION:
              "SUBSCRIPTION",

            FULL:
              "FULL",
          })
        );
      }
    );


    test(
      "repairable and suspicious drift are separated",
      () => {
        expect(
          RECONCILIATION_CLASSIFICATION
            .REPAIRABLE_DRIFT
        ).toBe(
          "REPAIRABLE_DRIFT"
        );


        expect(
          RECONCILIATION_CLASSIFICATION
            .SUSPICIOUS_DRIFT
        ).toBe(
          "SUSPICIOUS_DRIFT"
        );


        expect(
          RECONCILIATION_REPAIR_STATUS
            .MANUAL_REVIEW
        ).toBe(
          "MANUAL_REVIEW"
        );
      }
    );


    test(
      "subscription changes are explicitly audited",
      () => {
        expect(
          SUBSCRIPTION_CHANGE_TYPES
            .RECONCILED
        ).toBe(
          "RECONCILED"
        );


        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "billing.subscription_change_events"
        );
      }
    );


    test(
      "reconciliation findings preserve detected identity",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_protect_reconciliation_finding_identity"
        );


        expect(
          source
        ).toContain(
          "reconciliation finding identity is immutable"
        );
      }
    );


    test(
      "subscription status normalization is fail-closed for unknown provider state",
      () => {
        const service =
          new SubscriptionReconciliationService({
            repository:
              {},
          });


        expect(
          service
            .normalizeStatus(
              "totally_unknown"
            )
        ).toBeNull();
      }
    );


    test(
      "known provider subscription states normalize canonically",
      () => {
        const service =
          new SubscriptionReconciliationService({
            repository:
              {},
          });


        expect(
          service
            .normalizeStatus(
              "active"
            )
        ).toBe(
          "active"
        );


        expect(
          service
            .normalizeStatus(
              "past_due"
            )
        ).toBe(
          "past_due"
        );


        expect(
          service
            .normalizeStatus(
              "cancelled"
            )
        ).toBe(
          "cancelled"
        );
      }
    );


    test(
      "reconciliation never mutates immutable usage or cost ledgers",
      () => {
        const servicePath =
          path.join(
            __dirname,
            "..",
            "..",
            "services",
            "billing",
            "billingReconciliationService.js"
          );


        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /UPDATE\s+billing\.usage_events/i
        );


        expect(
          source
        ).not.toMatch(
          /UPDATE\s+billing\.cost_events/i
        );
      }
    );
  }
);