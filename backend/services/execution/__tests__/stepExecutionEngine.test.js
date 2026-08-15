"use strict";

const {
  StepExecutionEngine,
  STEP_STATUS,
  EXECUTION_STATUS,
} =
  require(
    "../stepExecutionEngine"
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

function authorization(
  overrides = {}
) {
  return {
    authorizationId:
      "auth-1",

    authorizationGranted:
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

    steps: [
      {
        stepId:
          "step-1",

        order:
          1,

        adapter:
          "kubernetes",

        action:
          "restartDeployment",

        parameters: {
          namespace:
            "production",

          deployment:
            "api",
        },

        timeoutMs:
          1000,

        continueOnFailure:
          false,
      },

      {
        stepId:
          "step-2",

        order:
          2,

        adapter:
          "kubernetes",

        action:
          "waitRollout",

        parameters: {
          namespace:
            "production",

          deployment:
            "api",
        },

        timeoutMs:
          1000,

        continueOnFailure:
          false,
      },
    ],

    rollbackPlan: {
      available:
        true,

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
      "kubernetes.restartDeployment",

    domain:
      EXECUTOR_DOMAIN
        .KUBERNETES,

    handler:
      async () => ({
        changed:
          true,

        restarted:
          true,
      }),
  });

  result.register({
    capability:
      "kubernetes.waitRollout",

    domain:
      EXECUTOR_DOMAIN
        .KUBERNETES,

    handler:
      async () => ({
        changed:
          false,

        ready:
          true,
      }),
  });

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
      }),
  });

  return result;
}

describe(
  "StepExecutionEngine",
  () => {
    test(
      "executes ordered plan successfully",
      async () => {
        const engine =
          new StepExecutionEngine({
            executorRegistry:
              registry(),
          });

        const result =
          await engine
            .execute({
              executionRequestId:
                "request-1",

              authorization:
                authorization(),

              executionPlan:
                plan(),
            });

        expect(
          result.status
        )
          .toBe(
            EXECUTION_STATUS
              .SUCCEEDED
          );

        expect(
          result.success
        )
          .toBe(
            true
          );

        expect(
          result.stepResults
        )
          .toHaveLength(
            2
          );

        expect(
          result
            .stepResults[0]
            .status
        )
          .toBe(
            STEP_STATUS
              .SUCCEEDED
          );

        expect(
          result
            .stepResults[1]
            .status
        )
          .toBe(
            STEP_STATUS
              .SUCCEEDED
          );

        expect(
          result.changed
        )
          .toBe(
            true
          );

        expect(
          result.rollbackRequired
        )
          .toBe(
            false
          );
      }
    );

    test(
      "preserves explicit step ordering",
      async () => {
        const executionOrder =
          [];

        const customRegistry =
          new ExecutorRegistry();

        customRegistry
          .register({
            capability:
              "kubernetes.first",

            domain:
              EXECUTOR_DOMAIN
                .KUBERNETES,

            handler:
              async () => {
                executionOrder
                  .push(
                    "first"
                  );

                return {
                  changed:
                    true,
                };
              },
          });

        customRegistry
          .register({
            capability:
              "kubernetes.second",

            domain:
              EXECUTOR_DOMAIN
                .KUBERNETES,

            handler:
              async () => {
                executionOrder
                  .push(
                    "second"
                  );

                return {
                  changed:
                    true,
                };
              },
          });

        const engine =
          new StepExecutionEngine({
            executorRegistry:
              customRegistry,
          });

        await engine.execute({
          authorization:
            authorization(),

          executionPlan:
            plan({
              steps: [
                {
                  stepId:
                    "second",

                  order:
                    2,

                  adapter:
                    "kubernetes",

                  action:
                    "second",

                  timeoutMs:
                    1000,
                },

                {
                  stepId:
                    "first",

                  order:
                    1,

                  adapter:
                    "kubernetes",

                  action:
                    "first",

                  timeoutMs:
                    1000,
                },
              ],
            }),
        });

        expect(
          executionOrder
        )
          .toEqual([
            "first",
            "second",
          ]);
      }
    );

    test(
      "stops after failed step by default",
      async () => {
        const customRegistry =
          new ExecutorRegistry();

        customRegistry
          .register({
            capability:
              "kubernetes.fail",

            domain:
              EXECUTOR_DOMAIN
                .KUBERNETES,

            handler:
              async () => {
                throw new Error(
                  "restart failed"
                );
              },
          });

        customRegistry
          .register({
            capability:
              "kubernetes.after",

            domain:
              EXECUTOR_DOMAIN
                .KUBERNETES,

            handler:
              jest.fn(
                async () => ({
                  changed:
                    true,
                })
              ),
          });

        const engine =
          new StepExecutionEngine({
            executorRegistry:
              customRegistry,
          });

        const result =
          await engine.execute({
            authorization:
              authorization(),

            executionPlan:
              plan({
                steps: [
                  {
                    stepId:
                      "failure",

                    order:
                      1,

                    adapter:
                      "kubernetes",

                    action:
                      "fail",

                    timeoutMs:
                      1000,

                    continueOnFailure:
                      false,
                  },

                  {
                    stepId:
                      "after",

                    order:
                      2,

                    adapter:
                      "kubernetes",

                    action:
                      "after",

                    timeoutMs:
                      1000,
                  },
                ],
              }),
          });

        expect(
          result.success
        )
          .toBe(
            false
          );

        expect(
          result
            .stepResults[0]
            .status
        )
          .toBe(
            STEP_STATUS
              .FAILED
          );

        expect(
          result
            .stepResults[1]
            .status
        )
          .toBe(
            STEP_STATUS
              .SKIPPED
          );
      }
    );

    test(
      "continueOnFailure allows later step",
      async () => {
        const customRegistry =
          new ExecutorRegistry();

        customRegistry
          .register({
            capability:
              "kubernetes.fail",

            domain:
              EXECUTOR_DOMAIN
                .KUBERNETES,

            handler:
              async () => {
                throw new Error(
                  "failure"
                );
              },
          });

        customRegistry
          .register({
            capability:
              "kubernetes.continue",

            domain:
              EXECUTOR_DOMAIN
                .KUBERNETES,

            handler:
              async () => ({
                changed:
                  true,
              }),
          });

        const engine =
          new StepExecutionEngine({
            executorRegistry:
              customRegistry,
          });

        const result =
          await engine.execute({
            authorization:
              authorization(),

            executionPlan:
              plan({
                steps: [
                  {
                    stepId:
                      "failure",

                    order:
                      1,

                    adapter:
                      "kubernetes",

                    action:
                      "fail",

                    timeoutMs:
                      1000,

                    continueOnFailure:
                      true,
                  },

                  {
                    stepId:
                      "continue",

                    order:
                      2,

                    adapter:
                      "kubernetes",

                    action:
                      "continue",

                    timeoutMs:
                      1000,
                  },
                ],
              }),
          });

        expect(
          result.status
        )
          .toBe(
            EXECUTION_STATUS
              .PARTIAL
          );

        expect(
          result
            .stepResults[1]
            .status
        )
          .toBe(
            STEP_STATUS
              .SUCCEEDED
          );
      }
    );

    test(
      "step timeout is enforced",
      async () => {
        const customRegistry =
          new ExecutorRegistry();

        customRegistry
          .register({
            capability:
              "kubernetes.slow",

            domain:
              EXECUTOR_DOMAIN
                .KUBERNETES,

            handler:
              async () => {
                await new Promise(
                  (
                    resolve
                  ) =>
                    setTimeout(
                      resolve,
                      100
                    )
                );

                return {
                  changed:
                    true,
                };
              },
          });

        const engine =
          new StepExecutionEngine({
            executorRegistry:
              customRegistry,
          });

        const result =
          await engine.execute({
            authorization:
              authorization(),

            executionPlan:
              plan({
                steps: [
                  {
                    stepId:
                      "slow",

                    order:
                      1,

                    adapter:
                      "kubernetes",

                    action:
                      "slow",

                    timeoutMs:
                      10,
                  },
                ],
              }),
          });

        expect(
          result
            .stepResults[0]
            .status
        )
          .toBe(
            STEP_STATUS
              .TIMED_OUT
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
      "unknown capability is blocked safely",
      async () => {
        const engine =
          new StepExecutionEngine({
            executorRegistry:
              registry(),
          });

        const result =
          await engine.execute({
            authorization:
              authorization(),

            executionPlan:
              plan({
                steps: [
                  {
                    stepId:
                      "unknown",

                    order:
                      1,

                    capability:
                      "kubernetes.deleteUniverse",

                    timeoutMs:
                      1000,
                  },
                ],
              }),
          });

        expect(
          result.success
        )
          .toBe(
            false
          );

        expect(
          result
            .stepResults[0]
            .status
        )
          .toBe(
            STEP_STATUS
              .FAILED
          );
      }
    );

    test(
      "changed successful step plus later failure requests rollback",
      async () => {
        const customRegistry =
          registry();

        customRegistry
          .register({
            capability:
              "kubernetes.failLater",

            domain:
              EXECUTOR_DOMAIN
                .KUBERNETES,

            handler:
              async () => {
                throw new Error(
                  "later failure"
                );
              },
          });

        const engine =
          new StepExecutionEngine({
            executorRegistry:
              customRegistry,
          });

        const result =
          await engine.execute({
            authorization:
              authorization(),

            executionPlan:
              plan({
                steps: [
                  {
                    stepId:
                      "change",

                    order:
                      1,

                    adapter:
                      "kubernetes",

                    action:
                      "restartDeployment",

                    timeoutMs:
                      1000,
                  },

                  {
                    stepId:
                      "failure",

                    order:
                      2,

                    adapter:
                      "kubernetes",

                    action:
                      "failLater",

                    timeoutMs:
                      1000,
                  },
                ],
              }),
          });

        expect(
          result.rollbackRequired
        )
          .toBe(
            true
          );
      }
    );

    test(
      "confirmation-required step is blocked without confirmer",
      async () => {
        const engine =
          new StepExecutionEngine({
            executorRegistry:
              registry(),
          });

        const inputPlan =
          plan();

        inputPlan
          .steps[0]
          .requiresConfirmation =
          true;

        const result =
          await engine.execute({
            authorization:
              authorization(),

            executionPlan:
              inputPlan,
          });

        expect(
          result
            .stepResults[0]
            .status
        )
          .toBe(
            STEP_STATUS
              .BLOCKED
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
      "confirmed step may execute",
      async () => {
        const engine =
          new StepExecutionEngine({
            executorRegistry:
              registry(),
          });

        const inputPlan =
          plan();

        inputPlan
          .steps[0]
          .requiresConfirmation =
          true;

        const result =
          await engine.execute(
            {
              authorization:
                authorization(),

              executionPlan:
                inputPlan,
            },

            {
              async confirmStep() {
                return true;
              },
            }
          );

        expect(
          result
            .stepResults[0]
            .status
        )
          .toBe(
            STEP_STATUS
              .SUCCEEDED
          );
      }
    );

    test(
      "rejects execution without granted authorization",
      async () => {
        const engine =
          new StepExecutionEngine({
            executorRegistry:
              registry(),
          });

        await expect(
          engine.execute({
            authorization:
              authorization({
                authorizationGranted:
                  false,
              }),

            executionPlan:
              plan(),
          })
        )
          .rejects
          .toMatchObject({
            code:
              "STEP_EXECUTION_NOT_AUTHORIZED",
          });
      }
    );

    test(
      "execution plan cannot independently authorize itself",
      async () => {
        const engine =
          new StepExecutionEngine({
            executorRegistry:
              registry(),
          });

        await expect(
          engine.execute({
            authorization:
              authorization(),

            executionPlan:
              plan({
                executionAuthorized:
                  true,
              }),
          })
        )
          .rejects
          .toMatchObject({
            code:
              "STEP_EXECUTION_UNSAFE_PLAN",
          });
      }
    );

    test(
      "rejects empty execution plan",
      async () => {
        const engine =
          new StepExecutionEngine({
            executorRegistry:
              registry(),
          });

        await expect(
          engine.execute({
            authorization:
              authorization(),

            executionPlan:
              plan({
                steps:
                  [],
              }),
          })
        )
          .rejects
          .toMatchObject({
            code:
              "STEP_EXECUTION_PLAN_STEPS_REQUIRED",
          });
      }
    );
  }
);