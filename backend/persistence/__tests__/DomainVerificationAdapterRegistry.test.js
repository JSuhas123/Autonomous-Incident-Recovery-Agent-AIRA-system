"use strict";

const DomainVerificationAdapterRegistry =
  require(
    "../migration/DomainVerificationAdapterRegistry"
  );

describe(
  "DomainVerificationAdapterRegistry",
  () => {
    test(
      "registers all physical Phase 13.5C verification domains",
      () => {
        const registry =
          new DomainVerificationAdapterRegistry();

        const expected = [
          "incidents",

          "incidentEvents",

          "incidentLifecycleTransitions",

          "incidentLifecycle",

          "signals",

          "signalCorrelations",

          "agentIntelligenceRuns",

          "incidentDiagnoses",

          "decisionTraces",

          "recoveryDecisionRuns",

          "recoveryDecisions",

          "executionAuthorizations",

          "executionRequests",

          "runtimeRecoveryCheckpoints",

          "approvals",

          "audit",

          "policies",

          "workflowOutbox",
        ];

        for (
          const domain
          of expected
        ) {
          expect(
            registry.has(
              domain
            )
          )
            .toBe(
              true
            );
        }

        expect(
          registry.list()
        )
          .toHaveLength(
            18
          );
      }
    );

    test(
      "unknown adapter fails closed",
      () => {
        const registry =
          new DomainVerificationAdapterRegistry();

        expect(
          () =>
            registry.get(
              "unknown-domain"
            )
        )
          .toThrow(
            "Verification adapter not found"
          );
      }
    );
  }
);