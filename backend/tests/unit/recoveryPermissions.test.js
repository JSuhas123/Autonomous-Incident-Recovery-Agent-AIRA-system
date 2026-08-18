"use strict";

const {
  RECOVERY_STATE,
  RECOVERY_VERIFICATION_STATE,
  MONITORING_RECOMMENDATION,
  RECOVERY_OBSERVATION_SCHEMA_VERSION,
  createRecoveryObservation,
} =
  require(
    "../../agents/v2/contracts/agentContracts"
  );

const {
  BaseAgent,
} =
  require(
    "../../agents/v2/runtime/baseAgent"
  );

const {
  AGENT_PERMISSION_REGISTRY,
  assertAgentPermissions,
  validateAgentPermissions,
} =
  require(
    "../../agents/v2/config/agentPermissions"
  );

class SafeAgent
  extends BaseAgent {
  constructor() {
    super(
      "DiagnosisAgent",
      "test"
    );
  }
}

class MutationAgent
  extends BaseAgent {
  constructor() {
    super(
      "DiagnosisAgent",
      "test"
    );
  }

  getCapabilities() {
    return {
      ...super
        .getCapabilities(),

      infrastructureMutation:
        true,
    };
  }
}

describe(
  "Phase 12.10 recovery observation",
  () => {
    test(
      "recovered trajectory still cannot declare final recovery",
      () => {
        const observation =
          createRecoveryObservation({
            state:
              RECOVERY_STATE
                .RECOVERED,

            confidence:
              0.95,

            verificationState:
              RECOVERY_VERIFICATION_STATE
                .VERIFIED,

            recommendation:
              MONITORING_RECOMMENDATION
                .CONTINUE,
          });

        expect(
          observation.schemaVersion
        ).toBe(
          RECOVERY_OBSERVATION_SCHEMA_VERSION
        );

        expect(
          observation.state
        ).toBe(
          RECOVERY_STATE.RECOVERED
        );

        expect(
          observation
            .finalRecoveryDeclared
        ).toBe(
          false
        );

        expect(
          observation
            .requiresDeterministicVerification
        ).toBe(
          true
        );

        expect(
          observation
            .incidentResolutionAuthorized
        ).toBe(
          false
        );

        expect(
          observation
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "worsening always forces escalation",
      () => {
        const observation =
          createRecoveryObservation({
            state:
              RECOVERY_STATE
                .WORSENING,

            recommendation:
              MONITORING_RECOMMENDATION
                .WAIT,
          });

        expect(
          observation.recommendation
        ).toBe(
          MONITORING_RECOMMENDATION
            .ESCALATE
        );

        expect(
          observation.worsening
        ).toBe(
          true
        );
      }
    );
  }
);

describe(
  "Phase 12.11 agent permissions",
  () => {
    test(
      "all 15 agents have explicit permission policies",
      () => {
        const expected = [
          "SymptomAnalysisAgent",
          "CorrelationAgent",
          "TopologyAnalysisAgent",
          "ChangeAnalysisAgent",
          "HistoricalAnalysisAgent",
          "InvestigationAgent",
          "RootCauseHypothesisAgent",
          "DiagnosisAgent",
          "RiskImpactAgent",
          "PlaybookSelectionAgent",
          "ParameterResolutionAgent",
          "RecoveryMonitoringAgent",
          "VerificationCriticAgent",
          "LearningAgent",
          "ExplanationAgent",
        ];

        expect(
          Object.keys(
            AGENT_PERMISSION_REGISTRY
          )
            .sort()
        ).toEqual(
          expected.sort()
        );
      }
    );

    test(
      "safe agent passes central policy",
      () => {
        expect(
          () =>
            assertAgentPermissions(
              new SafeAgent()
            )
        ).not.toThrow();
      }
    );

    test(
      "agent requesting mutation authority is denied",
      () => {
        const validation =
          validateAgentPermissions(
            new MutationAgent()
          );

        expect(
          validation.valid
        ).toBe(
          false
        );

        expect(
          validation.errors
            .some(
              (
                error
              ) =>
                error.includes(
                  "infrastructureMutation"
                )
            )
        ).toBe(
          true
        );
      }
    );

    test(
      "unregistered agent fails closed",
      () => {
        class UnknownAgent
          extends BaseAgent {
          constructor() {
            super(
              "UnknownAgent",
              "1"
            );
          }
        }

        expect(
          () =>
            assertAgentPermissions(
              new UnknownAgent()
            )
        ).toThrow(
          "No permission policy registered"
        );
      }
    );

    test(
      "BaseAgent denies dangerous authority by default",
      () => {
        const caps =
          new SafeAgent()
            .getCapabilities();

        expect(
          caps.infrastructureMutation
        ).toBe(
          false
        );

        expect(
          caps.executionAuthorization
        ).toBe(
          false
        );

        expect(
          caps.approvalAuthority
        ).toBe(
          false
        );

        expect(
          caps.incidentResolution
        ).toBe(
          false
        );

        expect(
          caps.policyMutation
        ).toBe(
          false
        );

        expect(
          caps.playbookPublication
        ).toBe(
          false
        );

        expect(
          caps.secretValueAccess
        ).toBe(
          false
        );
      }
    );
  }
);