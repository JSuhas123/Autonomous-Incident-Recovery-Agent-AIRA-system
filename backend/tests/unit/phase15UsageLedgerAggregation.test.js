"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );

  const usageRepositoryPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "PostgresUsageMeterRepository.js"
  );

const {
  BILLING_METERS,
} =
  require(
    "../../constants/billingMeters"
  );


const {
  UsageMeterService,
} =
  require(
    "../../services/billing/usageMeterService"
  );


const {
  buildUsageIdempotencyKey,

  autonomousRecoveryUsageKey,

  incidentUsageKey,
} =
  require(
    "../../services/billing/usageIdempotency"
  );


const {
  validateRange,
} =
  require(
    "../../services/billing/usageAggregationService"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0050_usage_ledger_aggregation.sql"
  );


describe(
  "Phase 15.6-15.8 immutable usage ledger and aggregation",
  () => {

    test(
      "usage ledger migration exists",
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
      "raw usage events are database immutable",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_prevent_usage_event_mutation"
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
      "financial usage has durable idempotency",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "usage_event_idempotency_unique"
        );


        expect(
          source
        ).toMatch(
          /organization_id[\s\S]*meter_code[\s\S]*idempotency_key/
        );
      }
    );


 test(
  "usage and async publication use a PostgreSQL transactional outbox",
  () => {
    const migrationSource =
      fs.readFileSync(
        migrationPath,
        "utf8"
      );


    const repositorySource =
      fs.readFileSync(
        usageRepositoryPath,
        "utf8"
      );


    /**
     * Migration owns the durable outbox schema.
     */
    expect(
      migrationSource
    ).toContain(
      "billing.event_outbox"
    );


    /**
     * Runtime repository emits the actual canonical usage domain event.
     */
    expect(
      repositorySource
    ).toContain(
      "billing.usage.recorded"
    );


    /**
     * Usage + outbox are committed through one PostgreSQL transaction.
     */
    expect(
      repositorySource
    ).toContain(
      "BEGIN"
    );


    expect(
      repositorySource
    ).toContain(
      "COMMIT"
    );
  }
);


    test(
      "usage quantity cannot be zero or negative",
      () => {
        const service =
          new UsageMeterService({
            repository: {},
          });


        expect(
          () =>
            service
              .validateQuantity(
                0
              )
        ).toThrow(
          expect.objectContaining({
            code:
              "USAGE_QUANTITY_INVALID",
          })
        );


        expect(
          () =>
            service
              .validateQuantity(
                -10
              )
        ).toThrow(
          expect.objectContaining({
            code:
              "USAGE_QUANTITY_INVALID",
          })
        );
      }
    );


    test(
      "usage keys are stable and namespaced",
      () => {
        expect(
          buildUsageIdempotencyKey(
            "incident",
            "inc-123"
          )
        ).toBe(
          "incident:inc-123"
        );


        expect(
          incidentUsageKey(
            "inc-123"
          )
        ).toBe(
          "incident:inc-123"
        );
      }
    );


    test(
      "autonomous recovery billing uses one logical recovery identity",
      () => {
        expect(
          autonomousRecoveryUsageKey({
            recoveryDecisionId:
              "recovery-123",
          })
        ).toBe(
          "autonomous_recovery:recovery-123"
        );


        expect(
          () =>
            autonomousRecoveryUsageKey({})
        ).toThrow(
          expect.objectContaining({
            code:
              "RECOVERY_BILLING_IDENTIFIER_REQUIRED",
          })
        );
      }
    );


    test(
      "usage range requires increasing timestamps",
      () => {
        expect(
          () =>
            validateRange(
              "2026-08-30T00:00:00Z",
              "2026-08-01T00:00:00Z"
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "USAGE_AGGREGATION_RANGE_INVALID",
          })
        );
      }
    );


    test(
      "aggregate tables remain derived from the raw ledger",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "billing.usage_daily_aggregates"
        );


        expect(
          source
        ).toContain(
          "billing.usage_period_aggregates"
        );


        expect(
          source
        ).toContain(
          "Rebuildable"
        );
      }
    );


    test(
      "autonomous recovery meter remains registered",
      () => {
        expect(
          BILLING_METERS
            .AUTONOMOUS_RECOVERIES
        ).toBe(
          "autonomous_recoveries"
        );
      }
    );
  }
);