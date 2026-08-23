"use strict";

const MigrationDomainRegistry =
  require(
    "../migration/MigrationDomainRegistry"
  );

describe(
  "Phase 13.5 expanded migration domain registry",
  () => {
    test(
      "contains all required physical migration domains",
      () => {
        const registry =
          new MigrationDomainRegistry();

        const names =
          registry.names();

        expect(
          names
        )
          .toContain(
            "incidentLifecycleTransitions"
          );

        expect(
          names
        )
          .toContain(
            "recoveryDecisionRuns"
          );

        expect(
          names
        )
          .toContain(
            "executionRequests"
          );

        expect(
          names
        )
          .toContain(
            "workflowOutbox"
          );
      }
    );

    test(
      "domain order remains dependency aware",
      () => {
        const registry =
          new MigrationDomainRegistry();

        const names =
          registry.names();

        expect(
          names.indexOf(
            "incidents"
          )
        )
          .toBeLessThan(
            names.indexOf(
              "incidentLifecycle"
            )
          );

        expect(
          names.indexOf(
            "recoveryDecisionRuns"
          )
        )
          .toBeLessThan(
            names.indexOf(
              "recoveryDecisions"
            )
          );

        expect(
          names.indexOf(
            "recoveryDecisions"
          )
        )
          .toBeLessThan(
            names.indexOf(
              "executionAuthorizations"
            )
          );

        expect(
          names.indexOf(
            "executionAuthorizations"
          )
        )
          .toBeLessThan(
            names.indexOf(
              "executionRequests"
            )
          );
      }
    );

    test(
      "correlation topology is derived",
      () => {
        const registry =
          new MigrationDomainRegistry();

        expect(
          registry.get(
            "correlationTopology"
          ).migrationMode
        )
          .toBe(
            "derived"
          );
      }
    );

    test(
      "there are 19 migration domains",
      () => {
        const registry =
          new MigrationDomainRegistry();

        expect(
          registry.names()
        )
          .toHaveLength(
            19
          );
      }
    );
  }
);