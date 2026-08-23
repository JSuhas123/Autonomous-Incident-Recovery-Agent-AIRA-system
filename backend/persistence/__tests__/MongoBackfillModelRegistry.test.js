"use strict";

const MongoBackfillModelRegistry =
  require(
    "../migration/MongoBackfillModelRegistry"
  );

describe(
  "MongoBackfillModelRegistry",
  () => {
    test(
      "contains the Phase 13 migration domains",
      () => {
        const registry =
          new MongoBackfillModelRegistry();

        expect(
          registry.has(
            "incidents"
          )
        )
          .toBe(
            true
          );

        expect(
          registry.has(
            "signals"
          )
        )
          .toBe(
            true
          );

        expect(
          registry.has(
            "recoveryDecisions"
          )
        )
          .toBe(
            true
          );

        expect(
          registry.has(
            "workflowOutbox"
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "unknown domain fails closed",
      () => {
        const registry =
          new MongoBackfillModelRegistry();

        expect(
          () =>
            registry.get(
              "unknown"
            )
        )
          .toThrow(
            "Unknown Mongo backfill domain"
          );
      }
    );

    test(
      "policies and audit are tenant scoped",
      () => {
        const registry =
          new MongoBackfillModelRegistry();

        expect(
          registry.get(
            "policies"
          ).ownership
        )
          .toBe(
            "tenant"
          );

        expect(
          registry.get(
            "audit"
          ).ownership
        )
          .toBe(
            "tenant"
          );
      }
    );
  }
);