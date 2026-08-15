"use strict";

const {
  ExecutionPolicyRevalidationService,
} =
  require(
    "../executionPolicyRevalidationService"
  );

const {
  EXECUTION_POLICY_STATE,
} =
  require(
    "../executionAuthorizationContracts"
  );

function baseInput(
  overrides = {}
) {
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

    selectedCandidateId:
      "candidate-1",

    selectedPlaybookId:
      "playbook-1",

    environment:
      "production",

    approvalSatisfied:
      false,

    recoveryDecision: {
      policyStatus:
        "eligible",
    },

    selectedCandidate: {
      candidateId:
        "candidate-1",

      playbookId:
        "playbook-1",

      metadata: {
        productionAllowed:
          true,
      },
    },

    context: {
      environment:
        "production",

      service: {
        id:
          "api",
      },
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "ExecutionPolicyRevalidationService",
  () => {
    test(
      "safe recovery action remains allowed",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const result =
          await service
            .validate(
              baseInput()
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .ALLOWED
          );

        expect(
          result.allowed
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
      "Phase 7 policy blocked decision remains denied",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const result =
          await service
            .validate(
              baseInput({
                recoveryDecision: {
                  policyStatus:
                    "blocked",
                },
              })
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .DENIED
          );
      }
    );

    test(
      "production-denied action is blocked",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const input =
          baseInput();

        input
          .selectedCandidate
          .metadata
          .productionAllowed =
          false;

        const result =
          await service
            .validate(
              input
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .DENIED
          );
      }
    );

    test(
      "destructive action without permission is denied",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const input =
          baseInput();

        input
          .selectedCandidate
          .metadata = {
            destructive:
              true,

            allowDestructive:
              false,
          };

        const result =
          await service
            .validate(
              input
            );

        expect(
          result.denied
        )
          .toBe(
            true
          );
      }
    );

    test(
      "destructive permitted action still requires approval",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const input =
          baseInput();

        input
          .selectedCandidate
          .metadata = {
            destructive:
              true,

            allowDestructive:
              true,
          };

        const result =
          await service
            .validate(
              input
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .REQUIRES_APPROVAL
          );
      }
    );

    test(
      "approved destructive action can pass",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const input =
          baseInput({
            approvalSatisfied:
              true,
          });

        input
          .selectedCandidate
          .metadata = {
            destructive:
              true,

            allowDestructive:
              true,
          };

        const result =
          await service
            .validate(
              input
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .ALLOWED
          );
      }
    );

    test(
      "manual-only action tier is denied",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const input =
          baseInput();

        input
          .selectedCandidate
          .metadata
          .actionTier =
          "tier4";

        const result =
          await service
            .validate(
              input
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .DENIED
          );
      }
    );

    test(
      "tier3 requires approval",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const input =
          baseInput();

        input
          .selectedCandidate
          .metadata
          .actionTier =
          "tier3";

        const result =
          await service
            .validate(
              input
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .REQUIRES_APPROVAL
          );
      }
    );

    test(
      "external policy engine can deny execution",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const result =
          await service
            .validate(
              baseInput(),
              {
                async evaluatePolicy() {
                  return {
                    allowed:
                      false,

                    policyIds: [
                      "prod-protection",
                    ],

                    reasons: [
                      "Payments production mutations are disabled.",
                    ],
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .DENIED
          );

        expect(
          result.policyIds
        )
          .toContain(
            "prod-protection"
          );
      }
    );

    test(
      "external policy approval requirement is enforced",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const result =
          await service
            .validate(
              baseInput(),
              {
                async evaluatePolicy() {
                  return {
                    allowed:
                      true,

                    requiresApproval:
                      true,
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .REQUIRES_APPROVAL
          );
      }
    );

    test(
      "maintenance window can deny execution",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const input =
          baseInput();

        input
          .selectedCandidate
          .metadata
          .maintenanceWindowRequired =
          true;

        const result =
          await service
            .validate(
              input,
              {
                async validateMaintenanceWindow() {
                  return {
                    allowed:
                      false,

                    reason:
                      "Outside production maintenance window.",
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .DENIED
          );
      }
    );

    test(
      "maintenance window may require approval",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const input =
          baseInput();

        input
          .selectedCandidate
          .metadata
          .maintenanceWindowRequired =
          true;

        const result =
          await service
            .validate(
              input,
              {
                async validateMaintenanceWindow() {
                  return {
                    allowed:
                      false,

                    requiresApproval:
                      true,

                    reason:
                      "Emergency change approval required.",
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .REQUIRES_APPROVAL
          );
      }
    );

    test(
      "unverified policy revision change becomes UNKNOWN",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

        const result =
          await service
            .validate(
              baseInput({
                policyRevision:
                  3,
              }),
              {
                async getCurrentPolicyRevision() {
                  return 4;
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_POLICY_STATE
              .UNKNOWN
          );

        expect(
          result.allowed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "never accepts upstream execution authorization",
      async () => {
        const service =
          new ExecutionPolicyRevalidationService();

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
              "EXECUTION_POLICY_UNSAFE_INPUT",
          });
      }
    );
  }
);
