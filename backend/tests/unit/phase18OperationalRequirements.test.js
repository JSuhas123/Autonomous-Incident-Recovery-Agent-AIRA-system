"use strict";

const {
  RiskPolicyRequirementEngine,
  RollbackDefinitionEngine,
  VerificationDefinitionEngine,
  EscalationDefinitionEngine,
} = require(
  "../../knowledge/reasoning"
);

describe(
  "Phase 18.11-18.14 operational requirements",
  () => {
    test(
      "policy must explicitly allow",
      () => {
        const result =
          new RiskPolicyRequirementEngine()
            .evaluate({
              playbook: {
                risk: {
                  level: "LOW",
                },

                approval: {
                  mode: "AUTOMATIC",
                },
              },

              policyDecision: {
                allowed: false,
                reason:
                  "POLICY_DENIED",
              },
            });

        expect(
          result.blocked
        ).toBe(true);

        expect(
          result.policy.allowed
        ).toBe(false);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );

    test(
      "critical risk requires approval",
      () => {
        const result =
          new RiskPolicyRequirementEngine()
            .evaluate({
              playbook: {
                risk: {
                  level:
                    "CRITICAL",
                },
              },

              policyDecision: {
                allowed:
                  true,
              },
            });

        expect(
          result.risk.level
        ).toBe(
          "CRITICAL"
        );

        expect(
          result.approval.required
        ).toBe(true);

        expect(
          result.blocked
        ).toBe(true);
      }
    );

    test(
      "approved policy and approval satisfy requirements without granting authorization",
      () => {
        const result =
          new RiskPolicyRequirementEngine()
            .evaluate({
              playbook: {
                approval: {
                  mode:
                    "MANUAL",
                },
              },

              policyDecision: {
                allowed:
                  true,
              },

              approval: {
                approved:
                  true,
              },
            });

        expect(
          result.requirementsSatisfied
        ).toBe(true);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );

    test(
      "rollback can explicitly be unavailable",
      () => {
        const result =
          new RollbackDefinitionEngine()
            .evaluate({
              runbooks: [
                {
                  runbookId:
                    "RB-TEST-ONE",

                  rollbackConfig: {
                    strategy:
                      "NONE",

                    reason:
                      "NON_REVERSIBLE_OPERATION",
                  },
                },
              ],
            });

        expect(
          result.rollbackAvailable
        ).toBe(false);

        expect(
          result.fullyRollbackable
        ).toBe(false);

        expect(
          result.unavailableRunbooks
        ).toEqual([
          "RB-TEST-ONE",
        ]);
      }
    );

    test(
      "explicit rollback steps are recognized",
      () => {
        const result =
          new RollbackDefinitionEngine()
            .evaluate({
              runbooks: [
                {
                  runbookId:
                    "RB-TEST-TWO",

                  rollbackConfig: {
                    strategy:
                      "EXPLICIT_STEPS",

                    steps: [
                      {
                        action:
                          "restore",
                      },
                    ],
                  },
                },
              ],
            });

        expect(
          result.rollbackAvailable
        ).toBe(true);

        expect(
          result.fullyRollbackable
        ).toBe(true);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );

    test(
      "verification must be separately defined from command success",
      () => {
        const result =
          new VerificationDefinitionEngine()
            .evaluate({
              runbooks: [
                {
                  runbookId:
                    "RB-VERIFY",

                  verification: {
                    strategy:
                      "ALL",

                    checks: [
                      {
                        type:
                          "health",
                      },
                    ],
                  },
                },
              ],
            });

        expect(
          result.verificationDefined
        ).toBe(true);

        expect(
          result.commandSuccessIsVerification
        ).toBe(false);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );

    test(
      "missing verification is detected",
      () => {
        const result =
          new VerificationDefinitionEngine()
            .evaluate({
              runbooks: [
                {
                  runbookId:
                    "RB-NO-VERIFY",
                },
              ],
            });

        expect(
          result.verificationDefined
        ).toBe(false);

        expect(
          result.missingRunbookVerification
        ).toEqual([
          "RB-NO-VERIFY",
        ]);
      }
    );

    test(
      "rollback failure triggers escalation",
      () => {
        const result =
          new EscalationDefinitionEngine()
            .evaluate({
              playbook: {
                escalation: {
                  destinations: [
                    "ON_CALL",
                  ],
                },
              },

              context: {
                rollbackFailed:
                  true,
              },
            });

        expect(
          result.triggered
        ).toBe(true);

        expect(
          result.humanEscalationAvailable
        ).toBe(true);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );

    test(
      "verification failure can trigger escalation",
      () => {
        const result =
          new EscalationDefinitionEngine()
            .evaluate({
              context: {
                verificationFailed:
                  true,
              },
            });

        expect(
          result.triggered
        ).toBe(true);

        expect(
          result.humanEscalationAvailable
        ).toBe(true);
      }
    );

    test(
      "all operational requirement engines remain non-authorizing",
      () => {
        const risk =
          new RiskPolicyRequirementEngine()
            .evaluate({
              policyDecision: {
                allowed: true,
              },
            });

        const rollback =
          new RollbackDefinitionEngine()
            .evaluate({});

        const verification =
          new VerificationDefinitionEngine()
            .evaluate({});

        const escalation =
          new EscalationDefinitionEngine()
            .evaluate({});

        expect(
          risk.executionAuthorized
        ).toBe(false);

        expect(
          rollback.executionAuthorized
        ).toBe(false);

        expect(
          verification.executionAuthorized
        ).toBe(false);

        expect(
          escalation.executionAuthorized
        ).toBe(false);
      }
    );
  }
);