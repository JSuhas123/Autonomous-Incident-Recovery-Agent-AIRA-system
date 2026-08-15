"use strict";

/**
 * AIRA Step Execution Engine
 *
 * Phase 8.14
 *
 * Executes an already-authorized immutable execution plan.
 *
 * Safety properties:
 *
 * - requires verified authorization context
 * - requires immutable execution plan
 * - executes only registered executor capabilities
 * - no arbitrary shell execution
 * - preserves step ordering
 * - per-step timeout
 * - stop-on-failure by default
 * - captures evidence for every step
 * - does not perform rollback itself
 *
 * Rollback is handled by Phase 8.15.
 */

const {
  EXECUTOR_RESULT_STATUS,
} =
  require(
    "./executorContracts"
  );

const STEP_STATUS =
  Object.freeze({
    PENDING:
      "PENDING",

    RUNNING:
      "RUNNING",

    SUCCEEDED:
      "SUCCEEDED",

    FAILED:
      "FAILED",

    SKIPPED:
      "SKIPPED",

    TIMED_OUT:
      "TIMED_OUT",

    BLOCKED:
      "BLOCKED",
  });

const EXECUTION_STATUS =
  Object.freeze({
    SUCCEEDED:
      "SUCCEEDED",

    FAILED:
      "FAILED",

    PARTIAL:
      "PARTIAL",

    BLOCKED:
      "BLOCKED",
  });

class StepExecutionEngine {
  constructor(
    options = {}
  ) {
    this.executorRegistry =
      options.executorRegistry ||
      null;

    this.maximumSteps =
      Number.isFinite(
        Number(
          options.maximumSteps
        )
      )
        ? Math.max(
            1,
            Number(
              options.maximumSteps
            )
          )
        : 100;
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async execute(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const registry =
      dependencies.executorRegistry ||
      this.executorRegistry;

    if (
      !registry ||
      typeof registry.execute !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "Step execution requires executor registry"
        ),
        {
          code:
            "STEP_EXECUTION_REGISTRY_REQUIRED",
        }
      );
    }

    const plan =
      input.executionPlan;

    this.assertPlan(
      plan
    );

    const startedAt =
      new Date();

    const stepResults =
      [];

    let changed =
      false;

    let failure =
      null;

    // ========================================================================
    // ORDER STEPS
    // ========================================================================

    const steps =
      [...plan.steps]
        .sort(
          (
            a,
            b
          ) =>
            Number(
              a.order ||
              0
            ) -
            Number(
              b.order ||
              0
            )
        );

    if (
      steps.length >
      this.maximumSteps
    ) {
      throw Object.assign(
        new Error(
          `Execution plan exceeds maximum step count ${this.maximumSteps}`
        ),
        {
          code:
            "STEP_EXECUTION_TOO_MANY_STEPS",
        }
      );
    }

    // ========================================================================
    // EXECUTE
    // ========================================================================

    for (
      let index = 0;
      index <
      steps.length;
      index++
    ) {
      const step =
        steps[index];

      // ----------------------------------------------------------------------
      // CONFIRMATION BOUNDARY
      // ----------------------------------------------------------------------

      if (
        step.requiresConfirmation ===
        true &&
        typeof dependencies
          .confirmStep !==
        "function"
      ) {
        const result = {
          stepId:
            step.stepId,

          order:
            step.order,

          capability:
            this.resolveCapability(
              step
            ),

          status:
            STEP_STATUS
              .BLOCKED,

          success:
            false,

          changed:
            false,

          error: {
            code:
              "STEP_CONFIRMATION_REQUIRED",

            message:
              "Execution step requires confirmation.",
          },

          startedAt:
            null,

          completedAt:
            new Date(),

          durationMs:
            0,
        };

        stepResults.push(
          result
        );

        failure =
          result;

        break;
      }

      if (
        step.requiresConfirmation ===
        true
      ) {
        const confirmed =
          await dependencies
            .confirmStep({
              step,

              executionPlan:
                plan,

              authorization:
                input.authorization,
            });

        if (
          confirmed !==
          true
        ) {
          const result = {
            stepId:
              step.stepId,

            order:
              step.order,

            capability:
              this.resolveCapability(
                step
              ),

            status:
              STEP_STATUS
                .BLOCKED,

            success:
              false,

            changed:
              false,

            error: {
              code:
                "STEP_CONFIRMATION_DENIED",

              message:
                "Execution step confirmation was denied.",
            },

            startedAt:
              null,

            completedAt:
              new Date(),

            durationMs:
              0,
          };

          stepResults.push(
            result
          );

          failure =
            result;

          break;
        }
      }

      // ----------------------------------------------------------------------
      // EXECUTE STEP
      // ----------------------------------------------------------------------

      const result =
        await this.executeStep({
          step,

          plan,

          input,

          registry,

          dependencies,
        });

      stepResults.push(
        result
      );

      if (
        result.changed ===
        true
      ) {
        changed =
          true;
      }

      if (
        result.success !==
        true
      ) {
        failure =
          result;

        if (
          step.continueOnFailure !==
          true
        ) {
          break;
        }
      }
    }

    // ========================================================================
    // MARK UNEXECUTED STEPS SKIPPED
    // ========================================================================

    if (
      failure &&
      stepResults.length <
      steps.length
    ) {
      const completedIds =
        new Set(
          stepResults.map(
            (
              result
            ) =>
              result.stepId
          )
        );

      for (
        const step
        of steps
      ) {
        if (
          completedIds.has(
            step.stepId
          )
        ) {
          continue;
        }

        stepResults.push({
          stepId:
            step.stepId,

          order:
            step.order,

          capability:
            this.resolveCapability(
              step
            ),

          status:
            STEP_STATUS
              .SKIPPED,

          success:
            false,

          changed:
            false,

          error: {
            code:
              "STEP_SKIPPED_AFTER_FAILURE",

            message:
              "Step was skipped because an earlier step failed.",
          },

          startedAt:
            null,

          completedAt:
            null,

          durationMs:
            0,
        });
      }
    }

    // ========================================================================
    // FINAL STATUS
    // ========================================================================

    const completedAt =
      new Date();

    const failedResults =
      stepResults.filter(
        (
          result
        ) =>
          [
            STEP_STATUS
              .FAILED,

            STEP_STATUS
              .TIMED_OUT,

            STEP_STATUS
              .BLOCKED,
          ].includes(
            result.status
          )
      );

    const successfulResults =
      stepResults.filter(
        (
          result
        ) =>
          result.status ===
          STEP_STATUS
            .SUCCEEDED
      );

    let status;

    if (
      failedResults.length ===
      0
    ) {
      status =
        EXECUTION_STATUS
          .SUCCEEDED;
    } else if (
      successfulResults.length ===
      0
    ) {
      status =
        failedResults.some(
          (
            result
          ) =>
            result.status ===
            STEP_STATUS
              .BLOCKED
        )
          ? EXECUTION_STATUS
              .BLOCKED
          : EXECUTION_STATUS
              .FAILED;
    } else {
      status =
        EXECUTION_STATUS
          .PARTIAL;
    }

    return {
      executionRequestId:
        input.executionRequestId ||
        null,

      authorizationId:
        input.authorization
          ?.authorizationId ||
        null,

      planId:
        plan.planId,

      planHash:
        plan.planHash,

      status,

      success:
        status ===
        EXECUTION_STATUS
          .SUCCEEDED,

      changed,

      stepCount:
        steps.length,

      successfulStepCount:
        successfulResults.length,

      failedStepCount:
        failedResults.length,

      stepResults:
        stepResults.sort(
          (
            a,
            b
          ) =>
            Number(
              a.order ||
              0
            ) -
            Number(
              b.order ||
              0
            )
        ),

      rollbackRequired:
        failedResults.length >
          0 &&
        changed ===
          true &&
        plan.rollbackPlan
          ?.available ===
          true,

      failure:
        failure
          ? {
              stepId:
                failure.stepId,

              status:
                failure.status,

              error:
                failure.error ||
                null,
            }
          : null,

      startedAt,

      completedAt,

      durationMs:
        Math.max(
          0,
          completedAt -
          startedAt
        ),

      executionStarted:
        true,

      executionVersion:
        "phase8.14-v1",
    };
  }

  // ==========================================================================
  // EXECUTE SINGLE STEP
  // ==========================================================================

  async executeStep({
    step,
    plan,
    input,
    registry,
    dependencies,
  }) {
    const capability =
      this.resolveCapability(
        step
      );

    if (
      !capability
    ) {
      return {
        stepId:
          step.stepId,

        order:
          step.order,

        capability:
          null,

        status:
          STEP_STATUS
            .BLOCKED,

        success:
          false,

        changed:
          false,

        error: {
          code:
            "STEP_CAPABILITY_REQUIRED",

          message:
            "Execution step has no registered capability.",
        },

        startedAt:
          null,

        completedAt:
          new Date(),

        durationMs:
          0,
      };
    }

    const startedAt =
      new Date();

    try {
      const result =
        await this.withTimeout(
          registry.execute(
            capability,

            step.parameters ||
            {},

            {
              authorizationVerified:
                true,

              authorizationId:
                input.authorization
                  .authorizationId,

              executionRequestId:
                input.executionRequestId ||
                null,

              organizationId:
                plan.organizationId,

              environmentId:
                plan.environmentId,

              incidentId:
                plan.incidentId,

              recoveryDecisionId:
                plan.recoveryDecisionId,

              planId:
                plan.planId,

              planHash:
                plan.planHash,

              stepId:
                step.stepId,

              dependencies,
            }
          ),

          step.timeoutMs
        );

      const completedAt =
        new Date();

      if (
        result.status ===
          EXECUTOR_RESULT_STATUS
            .SUCCEEDED &&
        result.success ===
          true
      ) {
        return {
          stepId:
            step.stepId,

          order:
            step.order,

          capability,

          status:
            STEP_STATUS
              .SUCCEEDED,

          success:
            true,

          changed:
            result.changed ===
            true,

          output:
            result.output ||
            null,

          error:
            null,

          startedAt,

          completedAt,

          durationMs:
            Math.max(
              0,
              completedAt -
              startedAt
            ),

          executorResult:
            result,
        };
      }

      return {
        stepId:
          step.stepId,

        order:
          step.order,

        capability,

        status:
          STEP_STATUS
            .FAILED,

        success:
          false,

        changed:
          result.changed ===
          true,

        output:
          result.output ||
          null,

        error:
          result.error || {
            code:
              "STEP_EXECUTION_FAILED",

            message:
              "Executor reported failure.",
          },

        startedAt,

        completedAt,

        durationMs:
          Math.max(
            0,
            completedAt -
            startedAt
          ),

        executorResult:
          result,
      };
    } catch (
      error
    ) {
      const completedAt =
        new Date();

      if (
        error.code ===
        "STEP_EXECUTION_TIMEOUT"
      ) {
        return {
          stepId:
            step.stepId,

          order:
            step.order,

          capability,

          status:
            STEP_STATUS
              .TIMED_OUT,

          success:
            false,

          changed:
            false,

          error: {
            code:
              error.code,

            message:
              error.message,
          },

          startedAt,

          completedAt,

          durationMs:
            Math.max(
              0,
              completedAt -
              startedAt
            ),
        };
      }

      return {
        stepId:
          step.stepId,

        order:
          step.order,

        capability,

        status:
          STEP_STATUS
            .FAILED,

        success:
          false,

        changed:
          false,

        error: {
          code:
            error.code ||
            "STEP_EXECUTION_FAILED",

          message:
            String(
              error.message ||
              "Execution step failed"
            )
              .slice(
                0,
                2048
              ),
        },

        startedAt,

        completedAt,

        durationMs:
          Math.max(
            0,
            completedAt -
            startedAt
          ),
      };
    }
  }

  // ==========================================================================
  // CAPABILITY
  // ==========================================================================

  resolveCapability(
    step
  ) {
    /*
     * Preferred format:
     *
     * capability: "kubernetes.restartDeployment"
     *
     * Backward-compatible plan format:
     *
     * adapter: "kubernetes"
     * action: "restartDeployment"
     */

    if (
      step.capability &&
      typeof step.capability ===
        "string"
    ) {
      return step.capability;
    }

    if (
      step.adapter &&
      step.action
    ) {
      return (
        `${step.adapter}.${step.action}`
      );
    }

    return null;
  }

  // ==========================================================================
  // TIMEOUT
  // ==========================================================================

  async withTimeout(
    promise,
    timeoutMs
  ) {
    const timeout =
      Number.isFinite(
        Number(
          timeoutMs
        )
      )
        ? Math.max(
            1,
            Number(
              timeoutMs
            )
          )
        : 60000;

    let timer;

    try {
      return await Promise.race([
        promise,

        new Promise(
          (
            _resolve,
            reject
          ) => {
            timer =
              setTimeout(
                () => {
                  reject(
                    Object.assign(
                      new Error(
                        `Execution step timed out after ${timeout}ms`
                      ),
                      {
                        code:
                          "STEP_EXECUTION_TIMEOUT",
                      }
                    )
                  );
                },
                timeout
              );
          }
        ),
      ]);
    } finally {
      if (
        timer
      ) {
        clearTimeout(
          timer
        );
      }
    }
  }

  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Step execution input is required"
        ),
        {
          code:
            "STEP_EXECUTION_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.authorization
    ) {
      throw Object.assign(
        new Error(
          "Step execution requires persisted authorization"
        ),
        {
          code:
            "STEP_EXECUTION_AUTHORIZATION_REQUIRED",
        }
      );
    }

    if (
      input.authorization
        .authorizationGranted !==
      true
    ) {
      throw Object.assign(
        new Error(
          "Step execution requires granted authorization"
        ),
        {
          code:
            "STEP_EXECUTION_NOT_AUTHORIZED",
        }
      );
    }

    if (
      !input.executionPlan
    ) {
      throw Object.assign(
        new Error(
          "Step execution requires execution plan"
        ),
        {
          code:
            "STEP_EXECUTION_PLAN_REQUIRED",
        }
      );
    }
  }

  assertPlan(
    plan
  ) {
    if (
      !Array.isArray(
        plan.steps
      ) ||
      plan.steps.length ===
        0
    ) {
      throw Object.assign(
        new Error(
          "Execution plan must contain steps"
        ),
        {
          code:
            "STEP_EXECUTION_PLAN_STEPS_REQUIRED",
        }
      );
    }

    if (
      plan.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Execution plan cannot independently authorize execution"
        ),
        {
          code:
            "STEP_EXECUTION_UNSAFE_PLAN",
        }
      );
    }

    if (
      !plan.planId ||
      !plan.planHash
    ) {
      throw Object.assign(
        new Error(
          "Execution plan requires planId and planHash"
        ),
        {
          code:
            "STEP_EXECUTION_PLAN_IDENTITY_REQUIRED",
        }
      );
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new StepExecutionEngine();

module.exports
  .StepExecutionEngine =
  StepExecutionEngine;

module.exports
  .STEP_STATUS =
  STEP_STATUS;

module.exports
  .EXECUTION_STATUS =
  EXECUTION_STATUS;