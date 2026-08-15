"use strict";

const {
  ExecutionKillSwitchGateService,
} =
  require(
    "../executionKillSwitchGateService"
  );

const {
  KILL_SWITCH_STATE,
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

    selectedCandidate: {
      metadata: {
        actionType:
          "restart",
      },
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

function manager(
  overrides = {}
) {
  return {
    areActionsEnabled() {
      return overrides
        .actionsEnabled ??
        true;
    },

    getAllStatuses() {
      return {
        EMERGENCY_MODE:
          overrides
            .emergencyMode ??
          false,

        RECOVERY_EXECUTION_ENABLED:
          overrides
            .recoveryExecutionEnabled ??
          true,
      };
    },

    isActionAllowed() {
      return overrides
        .actionAllowed ??
        true;
    },
  };
}

describe(
  "ExecutionKillSwitchGateService",
  () => {
    test(
      "allows execution path when all kill switches permit it",
      async () => {
        const service =
          new ExecutionKillSwitchGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async getKillSwitchManager() {
                  return manager();
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            KILL_SWITCH_STATE
              .ENABLED
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
      "global kill switch blocks execution",
      async () => {
        const service =
          new ExecutionKillSwitchGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async getKillSwitchManager() {
                  return manager({
                    actionsEnabled:
                      false,
                  });
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            KILL_SWITCH_STATE
              .DISABLED
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
      "emergency mode blocks execution",
      async () => {
        const service =
          new ExecutionKillSwitchGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async getKillSwitchManager() {
                  return manager({
                    emergencyMode:
                      true,
                  });
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            KILL_SWITCH_STATE
              .EMERGENCY_MODE
          );

        expect(
          result.blocked
        )
          .toBe(
            true
          );
      }
    );

    test(
      "recovery-specific kill switch blocks execution",
      async () => {
        const service =
          new ExecutionKillSwitchGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async getKillSwitchManager() {
                  return manager({
                    recoveryExecutionEnabled:
                      false,
                  });
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            KILL_SWITCH_STATE
              .DISABLED
          );
      }
    );

    test(
      "action-specific kill switch blocks selected action",
      async () => {
        const service =
          new ExecutionKillSwitchGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async getKillSwitchManager() {
                  return manager({
                    actionAllowed:
                      false,
                  });
                },
              }
            );

        expect(
          result.allowed
        )
          .toBe(
            false
          );

        expect(
          result.reasons
        )
          .toContain(
            "Action type restart is disabled by kill switch."
          );
      }
    );

    test(
      "organization-level execution stop blocks execution",
      async () => {
        const service =
          new ExecutionKillSwitchGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async getKillSwitchManager() {
                  return manager();
                },

                async isOrganizationExecutionEnabled() {
                  return false;
                },
              }
            );

        expect(
          result.allowed
        )
          .toBe(
            false
          );

        expect(
          result.reasons
        )
          .toContain(
            "Execution is disabled for this organization."
          );
      }
    );

    test(
      "environment-level execution stop blocks execution",
      async () => {
        const service =
          new ExecutionKillSwitchGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async getKillSwitchManager() {
                  return manager();
                },

                async isEnvironmentExecutionEnabled() {
                  return false;
                },
              }
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
      "recovery execution provider can block incident remediation",
      async () => {
        const service =
          new ExecutionKillSwitchGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async getKillSwitchManager() {
                  return manager();
                },

                async isRecoveryExecutionEnabled() {
                  return false;
                },
              }
            );

        expect(
          result.allowed
        )
          .toBe(
            false
          );

        expect(
          result.reasons
        )
          .toContain(
            "Recovery execution is currently disabled."
          );
      }
    );

    test(
      "unknown kill-switch state fails closed",
      async () => {
        const service =
          new ExecutionKillSwitchGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {}
            );

        expect(
          result.state
        )
          .toBe(
            KILL_SWITCH_STATE
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
          new ExecutionKillSwitchGateService();

        await expect(
          service
            .evaluate({
              ...baseInput(),

              executionAuthorized:
                true,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_KILL_SWITCH_UNSAFE_INPUT",
          });
      }
    );
  }
);