"use strict";

const {
  ExecutionFreshnessService,
} =
  require(
    "../executionFreshnessService"
  );

const {
  EXECUTION_FRESHNESS_STATE,
} =
  require(
    "../executionAuthorizationContracts"
  );

function baseInput(
  overrides = {}
) {
  const generatedAt =
    overrides.generatedAt ||
    new Date(
      Date.now() -
      1000
    );

  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    recoveryDecisionId:
      "recovery-1",

    recoveryDecisionRevision:
      3,

    diagnosisId:
      "diagnosis-1",

    diagnosisRevision:
      2,

    selectedPlaybookId:
      "playbook-1",

    generatedAt,

    recoveryDecision: {
      decisionId:
        "recovery-1",

      organizationId:
        "org-1",

      environmentId:
        "env-1",

      incidentId:
        "incident-1",

      revision:
        3,

      generatedAt,
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

function healthyDependencies() {
  return {
    async getCurrentRecoveryDecision() {
      return {
        decisionId:
          "recovery-1",

        revision:
          3,

        isCurrent:
          true,
      };
    },

    async getCurrentDiagnosis() {
      return {
        diagnosisId:
          "diagnosis-1",

        revision:
          2,

        isCurrent:
          true,
      };
    },

    async getIncident() {
      return {
        _id:
          "incident-1",

        status:
          "open",
      };
    },

    async getPlaybook() {
      return {
        playbookId:
          "playbook-1",

        status:
          "approved",

        enabled:
          true,
      };
    },
  };
}

describe(
  "ExecutionFreshnessService",
  () => {
    test(
      "fresh recovery decision passes freshness validation",
      async () => {
        const service =
          new ExecutionFreshnessService({
            maximumDecisionAgeMs:
              300000,
          });

        const result =
          await service
            .validate(
              baseInput(),
              healthyDependencies()
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_FRESHNESS_STATE
              .FRESH
          );

        expect(
          result.fresh
        )
          .toBe(
            true
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "old recovery decision expires",
      async () => {
        const now =
          new Date();

        const service =
          new ExecutionFreshnessService({
            maximumDecisionAgeMs:
              5000,
          });

        const result =
          await service
            .validate(
              baseInput({
                generatedAt:
                  new Date(
                    now.getTime() -
                    60000
                  ),
              }),
              {
                ...healthyDependencies(),

                now,
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_FRESHNESS_STATE
              .EXPIRED
          );

        expect(
          result.expired
        )
          .toBe(
            true
          );
      }
    );

    test(
      "superseded recovery decision is stale",
      async () => {
        const service =
          new ExecutionFreshnessService();

        const dependencies =
          healthyDependencies();

        dependencies
          .getCurrentRecoveryDecision =
          async () => ({
            decisionId:
              "recovery-2",

            revision:
              4,
          });

        const result =
          await service
            .validate(
              baseInput(),
              dependencies
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_FRESHNESS_STATE
              .STALE
          );

        expect(
          result.reasons
        )
          .toContain(
            "Recovery decision is no longer the current decision."
          );
      }
    );

    test(
      "changed diagnosis revision makes recovery decision stale",
      async () => {
        const service =
          new ExecutionFreshnessService();

        const dependencies =
          healthyDependencies();

        dependencies
          .getCurrentDiagnosis =
          async () => ({
            diagnosisId:
              "diagnosis-1",

            revision:
              3,
          });

        const result =
          await service
            .validate(
              baseInput(),
              dependencies
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_FRESHNESS_STATE
              .STALE
          );

        expect(
          result.reasons
        )
          .toContain(
            "Diagnosis revision changed after recovery decision."
          );
      }
    );

    test(
      "resolved incident makes decision stale",
      async () => {
        const service =
          new ExecutionFreshnessService();

        const dependencies =
          healthyDependencies();

        dependencies
          .getIncident =
          async () => ({
            status:
              "resolved",
          });

        const result =
          await service
            .validate(
              baseInput(),
              dependencies
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_FRESHNESS_STATE
              .STALE
          );
      }
    );

    test(
      "disabled playbook makes decision stale",
      async () => {
        const service =
          new ExecutionFreshnessService();

        const dependencies =
          healthyDependencies();

        dependencies
          .getPlaybook =
          async () => ({
            playbookId:
              "playbook-1",

            status:
              "approved",

            enabled:
              false,
          });

        const result =
          await service
            .validate(
              baseInput(),
              dependencies
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_FRESHNESS_STATE
              .STALE
          );

        expect(
          result.reasons
        )
          .toContain(
            "Selected playbook has been disabled."
          );
      }
    );

    test(
      "unapproved playbook makes decision stale",
      async () => {
        const service =
          new ExecutionFreshnessService();

        const dependencies =
          healthyDependencies();

        dependencies
          .getPlaybook =
          async () => ({
            playbookId:
              "playbook-1",

            status:
              "draft",

            enabled:
              true,
          });

        const result =
          await service
            .validate(
              baseInput(),
              dependencies
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_FRESHNESS_STATE
              .STALE
          );
      }
    );

    test(
      "cross-environment recovery decision is rejected as stale",
      async () => {
        const service =
          new ExecutionFreshnessService();

        const input =
          baseInput();

        input
          .recoveryDecision
          .environmentId =
          "env-other";

        const result =
          await service
            .validate(
              input,
              healthyDependencies()
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_FRESHNESS_STATE
              .STALE
          );

        expect(
          result.reasons
        )
          .toContain(
            "Recovery decision environment does not match execution scope."
          );
      }
    );

    test(
      "cross-organization recovery decision is rejected as stale",
      async () => {
        const service =
          new ExecutionFreshnessService();

        const input =
          baseInput();

        input
          .recoveryDecision
          .organizationId =
          "org-other";

        const result =
          await service
            .validate(
              input,
              healthyDependencies()
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_FRESHNESS_STATE
              .STALE
          );
      }
    );

    test(
      "never accepts execution authorization as input",
      async () => {
        const service =
          new ExecutionFreshnessService();

        await expect(
          service
            .validate({
              ...baseInput(),

              executionAuthorized:
                true,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_FRESHNESS_UNSAFE_INPUT",
          });
      }
    );
  }
);