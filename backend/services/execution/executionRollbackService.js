"use strict";

/**
 * AIRA Execution Rollback Service
 *
 * Phase 8.15
 *
 * Handles rollback after a failed or partial execution.
 *
 * Safety rules:
 *
 * - rollback only when execution changed infrastructure
 * - rollback only from immutable plan rollbackPlan
 * - no dynamic rollback generation
 * - optional human approval boundary
 * - execute only registered executor capabilities
 * - preserve rollback step order
 * - stop on rollback failure by default
 */

const {
  EXECUTOR_RESULT_STATUS,
} =
  require(
    "./executorContracts"
  );

const ROLLBACK_DECISION =
  Object.freeze({
    NOT_REQUIRED:
      "NOT_REQUIRED",

    ALLOWED:
      "ALLOWED",

    REQUIRES_APPROVAL:
      "REQUIRES_APPROVAL",

    BLOCKED:
      "BLOCKED",
  });

const ROLLBACK_STATUS =
  Object.freeze({
    NOT_STARTED:
      "NOT_STARTED",

    RUNNING:
      "RUNNING",

    SUCCEEDED:
      "SUCCEEDED",

    FAILED:
      "FAILED",

    PARTIAL:
      "PARTIAL",

    BLOCKED:
      "BLOCKED",
  });

class ExecutionRollbackService {
  constructor(
    options = {}
  ) {
    this.executorRegistry =
      options.executorRegistry ||
      null;

    this.maximumRollbackSteps =
      Number.isFinite(
        Number(
          options.maximumRollbackSteps
        )
      )
        ? Math.max(
            1,
            Number(
              options.maximumRollbackSteps
            )
          )
        : 100;
  }

  // ==========================================================================
  // EVALUATE
  // ==========================================================================

  evaluate(
    input = {}
  ) {
    this.assertEvaluationInput(
      input
    );

    const executionResult =
      input.executionResult;

    const plan =
      input.executionPlan;

    const rollbackPlan =
      plan.rollbackPlan ||
      {};

    // ------------------------------------------------------------------------
    // NO ROLLBACK REQUIRED
    // ------------------------------------------------------------------------

    if (
      executionResult
        .rollbackRequired !==
      true
    ) {
      return {
        decision:
          ROLLBACK_DECISION
            .NOT_REQUIRED,

        allowed:
          false,

        requiresApproval:
          false,

        reasons: [
          "Execution result does not require rollback.",
        ],

        executionAuthorized:
          false,
      };
    }

    // ------------------------------------------------------------------------
    // NO ROLLBACK PLAN
    // ------------------------------------------------------------------------

    if (
      rollbackPlan.available !==
        true ||
      !Array.isArray(
        rollbackPlan.steps
      ) ||
      rollbackPlan.steps.length ===
        0
    ) {
      return {
        decision:
          ROLLBACK_DECISION
            .BLOCKED,

        allowed:
          false,

        requiresApproval:
          false,

        reasons: [
          "Rollback is required but no predefined rollback plan is available.",
        ],

        executionAuthorized:
          false,
      };
    }

    // ------------------------------------------------------------------------
    // MANUAL APPROVAL REQUIRED
    // ------------------------------------------------------------------------

    if (
      rollbackPlan
        .automaticAllowed !==
        true &&
      input.rollbackApprovalSatisfied !==
        true
    ) {
      return {
        decision:
          ROLLBACK_DECISION
            .REQUIRES_APPROVAL,

        allowed:
          false,

        requiresApproval:
          true,

        reasons: [
          "Rollback requires explicit approval.",
        ],

        executionAuthorized:
          false,
      };
    }

    return {
      decision:
        ROLLBACK_DECISION
          .ALLOWED,

      allowed:
        true,

      requiresApproval:
        false,

      reasons: [
        "Predefined rollback plan is eligible for execution.",
      ],

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // EXECUTE ROLLBACK
  // ==========================================================================

  async execute(
    input = {},
    dependencies = {}
  ) {
    this.assertExecutionInput(
      input
    );

    const evaluation =
      this.evaluate(
        input
      );

    if (
      evaluation.allowed !==
      true
    ) {
      return {
        decision:
          evaluation.decision,

        status:
          ROLLBACK_STATUS
            .BLOCKED,

        success:
          false,

        rollbackStarted:
          false,

        stepResults:
          [],

        reasons:
          evaluation.reasons,

        executionAuthorized:
          false,
      };
    }

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
          "Rollback execution requires executor registry"
        ),
        {
          code:
            "ROLLBACK_EXECUTOR_REGISTRY_REQUIRED",
        }
      );
    }

    const rollbackPlan =
      input.executionPlan
        .rollbackPlan;

    const steps =
      [...rollbackPlan.steps]
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
      this.maximumRollbackSteps
    ) {
      throw Object.assign(
        new Error(
          `Rollback plan exceeds maximum step count ${this.maximumRollbackSteps}`
        ),
        {
          code:
            "ROLLBACK_TOO_MANY_STEPS",
        }
      );
    }

    const startedAt =
      new Date();

    const stepResults =
      [];

    let failure =
      null;

    let changed =
      false;

    // ========================================================================
    // EXECUTE ROLLBACK STEPS
    // ========================================================================

    for (
      const step
      of steps
    ) {
      const result =
        await this.executeRollbackStep({
          step,

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
    // SKIP REMAINING STEPS
    // ========================================================================

    if (
      failure &&
      stepResults.length <
      steps.length
    ) {
      const completed =
        new Set(
          stepResults.map(
            (
              item
            ) =>
              item.stepId
          )
        );

      for (
        const step
        of steps
      ) {
        if (
          completed.has(
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

          success:
            false,

          changed:
            false,

          status:
            "SKIPPED",

          error: {
            code:
              "ROLLBACK_STEP_SKIPPED",

            message:
              "Rollback step skipped after earlier rollback failure.",
          },
        });
      }
    }

    // ========================================================================
    // FINAL STATUS
    // ========================================================================

    const failures =
      stepResults.filter(
        (
          result
        ) =>
          result.success !==
          true &&
          result.status !==
          "SKIPPED"
      );

    const successes =
      stepResults.filter(
        (
          result
        ) =>
          result.success ===
          true
      );

    let status;

    if (
      failures.length ===
      0
    ) {
      status =
        ROLLBACK_STATUS
          .SUCCEEDED;
    } else if (
      successes.length ===
      0
    ) {
      status =
        ROLLBACK_STATUS
          .FAILED;
    } else {
      status =
        ROLLBACK_STATUS
          .PARTIAL;
    }

    const completedAt =
      new Date();

    return {
      decision:
        ROLLBACK_DECISION
          .ALLOWED,

      status,

      success:
        status ===
        ROLLBACK_STATUS
          .SUCCEEDED,

      changed,

      rollbackStarted:
        true,

      stepCount:
        steps.length,

      successfulStepCount:
        successes.length,

      failedStepCount:
        failures.length,

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

      failure:
        failure
          ? {
              stepId:
                failure.stepId,

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

      executionAuthorized:
        false,

      rollbackVersion:
        "phase8.15-v1",
    };
  }

  // ==========================================================================
  // SINGLE ROLLBACK STEP
  // ==========================================================================

  async executeRollbackStep({
    step,
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
          "BLOCKED",

        success:
          false,

        changed:
          false,

        error: {
          code:
            "ROLLBACK_CAPABILITY_REQUIRED",

          message:
            "Rollback step has no registered capability.",
        },
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

              rollbackExecution:
                true,

              authorizationId:
                input.authorization
                  .authorizationId,

              executionRequestId:
                input.executionRequestId ||
                null,

              organizationId:
                input.executionPlan
                  .organizationId,

              environmentId:
                input.executionPlan
                  .environmentId,

              incidentId:
                input.executionPlan
                  .incidentId,

              recoveryDecisionId:
                input.executionPlan
                  .recoveryDecisionId,

              planId:
                input.executionPlan
                  .planId,

              planHash:
                input.executionPlan
                  .planHash,

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
            "SUCCEEDED",

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
        };
      }

      return {
        stepId:
          step.stepId,

        order:
          step.order,

        capability,

        status:
          "FAILED",

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
              "ROLLBACK_EXECUTION_FAILED",

            message:
              "Rollback executor reported failure.",
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
    } catch (
      error
    ) {
      const completedAt =
        new Date();

      return {
        stepId:
          step.stepId,

        order:
          step.order,

        capability,

        status:
          error.code ===
            "ROLLBACK_STEP_TIMEOUT"
            ? "TIMED_OUT"
            : "FAILED",

        success:
          false,

        changed:
          false,

        error: {
          code:
            error.code ||
            "ROLLBACK_EXECUTION_FAILED",

          message:
            String(
              error.message ||
              "Rollback step failed"
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
    if (
      step.capability
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
                        `Rollback step timed out after ${timeout}ms`
                      ),
                      {
                        code:
                          "ROLLBACK_STEP_TIMEOUT",
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

  assertEvaluationInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Rollback input is required"
        ),
        {
          code:
            "ROLLBACK_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.executionResult
    ) {
      throw Object.assign(
        new Error(
          "Rollback evaluation requires execution result"
        ),
        {
          code:
            "ROLLBACK_EXECUTION_RESULT_REQUIRED",
        }
      );
    }

    if (
      !input.executionPlan
    ) {
      throw Object.assign(
        new Error(
          "Rollback evaluation requires execution plan"
        ),
        {
          code:
            "ROLLBACK_PLAN_REQUIRED",
        }
      );
    }

    if (
      input.executionPlan
        .executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Rollback plan cannot independently authorize execution"
        ),
        {
          code:
            "ROLLBACK_UNSAFE_PLAN",
        }
      );
    }
  }

  assertExecutionInput(
    input
  ) {
    this.assertEvaluationInput(
      input
    );

    if (
      !input.authorization ||
      input.authorization
        .authorizationGranted !==
        true
    ) {
      throw Object.assign(
        new Error(
          "Rollback execution requires granted execution authorization"
        ),
        {
          code:
            "ROLLBACK_AUTHORIZATION_REQUIRED",
        }
      );
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new ExecutionRollbackService();

module.exports
  .ExecutionRollbackService =
  ExecutionRollbackService;

module.exports
  .ROLLBACK_DECISION =
  ROLLBACK_DECISION;

module.exports
  .ROLLBACK_STATUS =
  ROLLBACK_STATUS;