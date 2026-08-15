"use strict";

const {
  ExecutionRollbackService,
  ROLLBACK_DECISION,
  ROLLBACK_STATUS,
} =
  require(
    "../executionRollbackService"
  );

const {
  ExecutorRegistry,
} =
  require(
    "../executorRegistry"
  );

const {
  EXECUTOR_DOMAIN,
} =
  require(
    "../executorContracts"
  );

function authorization() {
  return {
    authorizationId:
      "auth-1",

    authorizationGranted:
      true,
  };
}

function executionResult(
  overrides = {}
) {
  return {
    status:
      "PARTIAL",

    success:
      false,

    changed:
      true,

    rollbackRequired:
      true,

    ...overrides,
  };
}

function plan(
  overrides = {}
) {
  return {
    planId:
      "plan-1",

    planHash:
      "planhash-1",

    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    recoveryDecisionId:
      "recovery-1",

    executionAuthorized:
      false,

    rollbackPlan: {
      available:
        true,

      automaticAllowed:
        true,

      reversibility:
        "FULL",

      steps: [
        {
          stepId:
            "rollback-1",

          order:
            1,

          adapter:
            "kubernetes",

          action:
            "rollbackDeployment",

          parameters: {
            namespace:
              "production",

            deployment:
              "api",
          },

          timeoutMs:
            1000,
        },
      ],
    },

    ...overrides,
  };
}

function registry() {
  const result =
    new ExecutorRegistry();

  result.register({
    capability:
      "kubernetes.rollbackDeployment",

    domain:
      EXECUTOR_DOMAIN
        .KUBERNETES,

    handler:
      async () => ({
        changed:
          true,

        rolledBack:
          true,
      }),
  });

  return result;
}

describe(
  "ExecutionRollbackService",
  () => {
    test(
      "returns NOT_REQUIRED when execution does not require rollback",
      () => {
        const service =
          new ExecutionRollbackService();

        const result =
          service.evaluate({
            executionResult:
              executionResult({
                rollbackRequired:
                  false,
              }),

            executionPlan:
              plan(),
          });

        expect(
          result.decision
        )
          .toBe(
            ROLLBACK_DECISION
              .NOT_REQUIRED
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
      "blocks when rollback is required but no rollback plan exists",
      () => {
        const service =
          new ExecutionRollbackService();

        const inputPlan =
          plan();

        inputPlan.rollbackPlan = {
          available:
            false,

          steps:
            [],
        };

        const result =
          service.evaluate({
            executionResult:
              executionResult(),

            executionPlan:
              inputPlan,
          });

        expect(
          result.decision
        )
          .toBe(
            ROLLBACK_DECISION
              .BLOCKED
          );
      }
    );

    test(
      "requires approval when automatic rollback is disabled",
      () => {
        const service =
          new ExecutionRollbackService();

        const inputPlan =
          plan();

        inputPlan
          .rollbackPlan
          .automaticAllowed =
          false;

        const result =
          service.evaluate({
            executionResult:
              executionResult(),

            executionPlan:
              inputPlan,

            rollbackApprovalSatisfied:
              false,
          });

        expect(
          result.decision
        )
          .toBe(
            ROLLBACK_DECISION
              .REQUIRES_APPROVAL
          );

        expect(
          result.requiresApproval
        )
          .toBe(
            true
          );
      }
    );

    test(
      "approved manual rollback becomes allowed",
      () => {
        const service =
          new ExecutionRollbackService();

        const inputPlan =
          plan();

        inputPlan
          .rollbackPlan
          .automaticAllowed =
          false;

        const result =
          service.evaluate({
            executionResult:
              executionResult(),

            executionPlan:
              inputPlan,

            rollbackApprovalSatisfied:
              true,
          });

        expect(
          result.decision
        )
          .toBe(
            ROLLBACK_DECISION
              .ALLOWED
          );
      }
    );

    test(
      "executes predefined rollback successfully",
      async () => {
        const service =
          new ExecutionRollbackService({
            executorRegistry:
              registry(),
          });

        const result =
          await service.execute({
            executionRequestId:
              "req-1",

            authorization:
              authorization(),

            executionResult:
              executionResult(),

            executionPlan:
              plan(),
          });

        expect(
          result.status
        )
          .toBe(
            ROLLBACK_STATUS
              .SUCCEEDED
          );

        expect(
          result.success
        )
          .toBe(
            true
          );

        expect(
          result.rollbackStarted
        )
          .toBe(
            true
          );

        expect(
          result.stepResults
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "rollback step failure returns FAILED",
      async () => {
        const customRegistry =
          new ExecutorRegistry();

        customRegistry.register({
          capability:
            "kubernetes.rollbackDeployment",

          domain:
            EXECUTOR_DOMAIN
              .KUBERNETES,

          handler:
            async () => {
              throw new Error(
                "rollback failed"
              );
            },
        });

        const service =
          new ExecutionRollbackService({
            executorRegistry:
              customRegistry,
          });

        const result =
          await service.execute({
            authorization:
              authorization(),

            executionResult:
              executionResult(),

            executionPlan:
              plan(),
          });

        expect(
          result.status
        )
          .toBe(
            ROLLBACK_STATUS
              .FAILED
          );

        expect(
          result.success
        )
          .toBe(
            false
          );
      }
    );

    test(
      "unknown rollback capability fails safely",
      async () => {
        const service =
          new ExecutionRollbackService({
            executorRegistry:
              registry(),
          });

        const inputPlan =
          plan();

        inputPlan
          .rollbackPlan
          .steps[0]
          .capability =
          "kubernetes.unknownRollback";

        delete inputPlan
          .rollbackPlan
          .steps[0]
          .adapter;

        delete inputPlan
          .rollbackPlan
          .steps[0]
          .action;

        const result =
          await service.execute({
            authorization:
              authorization(),

            executionResult:
              executionResult(),

            executionPlan:
              inputPlan,
          });

        expect(
          result.success
        )
          .toBe(
            false
          );

        expect(
          result.status
        )
          .toBe(
            ROLLBACK_STATUS
              .FAILED
          );
      }
    );

    test(
      "rollback stops after first failed step",
      async () => {
        let secondExecuted =
          false;

        const customRegistry =
          new ExecutorRegistry();

        customRegistry.register({
          capability:
            "kubernetes.failRollback",

          domain:
            EXECUTOR_DOMAIN
              .KUBERNETES,

          handler:
            async () => {
              throw new Error(
                "rollback failed"
              );
            },
        });

        customRegistry.register({
          capability:
            "kubernetes.secondRollback",

          domain:
            EXECUTOR_DOMAIN
              .KUBERNETES,

          handler:
            async () => {
              secondExecuted =
                true;

              return {
                changed:
                  true,
              };
            },
        });

        const inputPlan =
          plan();

        inputPlan.rollbackPlan.steps = [
          {
            stepId:
              "rb-1",

            order:
              1,

            adapter:
              "kubernetes",

            action:
              "failRollback",

            timeoutMs:
              1000,
          },

          {
            stepId:
              "rb-2",

            order:
              2,

            adapter:
              "kubernetes",

            action:
              "secondRollback",

            timeoutMs:
              1000,
          },
        ];

        const service =
          new ExecutionRollbackService({
            executorRegistry:
              customRegistry,
          });

        const result =
          await service.execute({
            authorization:
              authorization(),

            executionResult:
              executionResult(),

            executionPlan:
              inputPlan,
          });

        expect(
          result.success
        )
          .toBe(
            false
          );

        expect(
          secondExecuted
        )
          .toBe(
            false
          );

        expect(
          result
            .stepResults[1]
            .status
        )
          .toBe(
            "SKIPPED"
          );
      }
    );

    test(
      "rollback requires granted authorization",
      async () => {
        const service =
          new ExecutionRollbackService({
            executorRegistry:
              registry(),
          });

        await expect(
          service.execute({
            authorization: {
              authorizationGranted:
                false,
            },

            executionResult:
              executionResult(),

            executionPlan:
              plan(),
          })
        )
          .rejects
          .toMatchObject({
            code:
              "ROLLBACK_AUTHORIZATION_REQUIRED",
          });
      }
    );

    test(
      "rollback plan cannot authorize itself",
      () => {
        const service =
          new ExecutionRollbackService();

        expect(
          () =>
            service.evaluate({
              executionResult:
                executionResult(),

              executionPlan:
                plan({
                  executionAuthorized:
                    true,
                }),
            })
        )
          .toThrow(
            "cannot independently authorize"
          );
      }
    );
  }
);