"use strict";

/**
 * Runbook Execution Engine
 *
 * Canonical execution ownership:
 *
 * tenantId
 * + organizationId
 * + environmentId
 * + incidentId
 *
 * Architecture invariant:
 *
 * RunbookExecutionEngine
 *   → ActionHandlerRegistry
 *   → approved deterministic handler
 *
 * No shell fallback.
 */

const {
  v4: uuidv4,
} = require("uuid");

const {
  getActionHandlerRegistry,
} = require("../actions/actionHandlerRegistry");

const {
  getRunbookParameterResolver,
} = require("../parameters/runbookParameterResolver");

const {
  getRunbookVerificationService,
} = require("../verification/runbookVerificationService");

const {
  getRunbookRollbackEngine,
} = require("../rollback/runbookRollbackEngine");

const {
  computeChecksum,
  versionRef,
} = require("../versioning/runbookVersioning");

const RunbookExecution =
  require("../../models/RunbookExecution");

const {
  RUNBOOK_FAILURE_POLICY,
} = require("../../constants/runbook");

const DEFAULT_STEP_TIMEOUT_MS =
  60_000;

// ============================================================================
// ENGINE
// ============================================================================

class RunbookExecutionEngine {
  constructor(options = {}) {
    this._registry =
      options.actionRegistry ||
      null;

    this._paramResolver =
      options.paramResolver ||
      null;

    this._verifier =
      options.verificationService ||
      null;

    this._rollbackEngine =
      options.rollbackEngine ||
      null;

    this._policyEngine =
      options.policyEngine ||
      null;
  }

  _reg() {
    return (
      this._registry ||
      getActionHandlerRegistry()
    );
  }

  _resolver() {
    return (
      this._paramResolver ||
      getRunbookParameterResolver()
    );
  }

  _verifier_() {
    return (
      this._verifier ||
      getRunbookVerificationService()
    );
  }

  _rollback() {
    return (
      this._rollbackEngine ||
      getRunbookRollbackEngine()
    );
  }

  // ==========================================================================
  // OWNERSHIP
  // ==========================================================================

  _assertExecutionScope(
    runbookDef,
    executionInput = {}
  ) {
    const tenantId =
      executionInput.tenantId ||
      runbookDef.tenantId ||
      null;

    const organizationId =
      executionInput.organizationId ||
      runbookDef.organizationId ||
      null;

    const environmentId =
      executionInput.environmentId ||
      runbookDef.environmentId ||
      null;

    if (!tenantId) {
      const error =
        new Error(
          "tenantId is required for runbook execution"
        );

      error.code =
        "RUNBOOK_EXECUTION_TENANT_REQUIRED";

      error.status =
        400;

      throw error;
    }

    if (!organizationId) {
      const error =
        new Error(
          "organizationId is required for runbook execution"
        );

      error.code =
        "RUNBOOK_EXECUTION_ORGANIZATION_REQUIRED";

      error.status =
        400;

      throw error;
    }

    if (!environmentId) {
      const error =
        new Error(
          "environmentId is required for runbook execution"
        );

      error.code =
        "RUNBOOK_EXECUTION_ENVIRONMENT_REQUIRED";

      error.status =
        400;

      throw error;
    }

    return {
      tenantId,
      organizationId,
      environmentId,

      incidentId:
        executionInput.incidentId ||
        null,
    };
  }

  _executionFilter(
    execution
  ) {
    return {
      executionId:
        execution.executionId,

      organizationId:
        execution.organizationId,

      environmentId:
        execution.environmentId,
    };
  }

  // ==========================================================================
  // EXECUTE
  // ==========================================================================

  async execute(
    runbookDef,
    executionInput = {}
  ) {
    const scope =
      this._assertExecutionScope(
        runbookDef,
        executionInput
      );

    const executionId =
      uuidv4();

    const correlationId =
      executionInput.correlationId ||
      uuidv4();

    const checksum =
      computeChecksum(
        runbookDef
      );

    const ref =
      versionRef(
        runbookDef.runbookId,
        runbookDef.semver
      );

    let execution =
      await RunbookExecution.create({
        executionId,

        correlationId,

        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        incidentId:
          scope.incidentId,

        /**
         * Temporary legacy compatibility.
         */
        orgId:
          String(
            scope.organizationId
          ),

        runbookId:
          runbookDef.runbookId,

        runbookVersion:
          runbookDef.semver,

        runbookSnapshot:
          _sanitizeSnapshot(
            runbookDef
          ),

        runbookChecksum:
          checksum,

        versionRef:
          ref,

        initiatedBy:
          executionInput.initiatedBy ||
          "api",

        initiatorType:
          executionInput.initiatorType ||
          "api",

        status:
          "CREATED",
      });

    try {
      // ======================================================================
      // 1. PARAMETER RESOLUTION
      // ======================================================================

      execution =
        await this._setStatus(
          execution,
          "VALIDATING"
        );

      const {
        resolved,
        errors:
          parameterErrors,
      } =
        this._resolver()
          .resolve(
            runbookDef.parameters ||
            [],
            {
              explicitInputs:
                executionInput
                  .explicitInputs ||
                {},

              incidentEvidence:
                executionInput
                  .incidentEvidence ||
                {},

              alertLabels:
                executionInput
                  .alertLabels ||
                {},

              humanInput:
                executionInput
                  .humanInput ||
                {},
            }
          );

      if (
        parameterErrors.length >
        0
      ) {
        return this._fail(
          execution,
          "PARAM_RESOLUTION_FAILED",
          parameterErrors.join(
            "; "
          )
        );
      }

      const storedParameters =
        resolved.map(
          (parameter) => ({
            ...parameter,

            value:
              parameter.sensitive
                ? "[REDACTED]"
                : parameter.value,

            redacted:
              Boolean(
                parameter.sensitive
              ),
          })
        );

      await RunbookExecution
        .updateOne(
          this._executionFilter(
            execution
          ),
          {
            $set: {
              resolvedParameters:
                storedParameters,
            },
          }
        );

      /**
       * Unredacted values exist only in memory.
       */
      const runtimeParameters =
        Object.fromEntries(
          resolved.map(
            (parameter) => [
              parameter.name,
              parameter.value,
            ]
          )
        );

      // ======================================================================
      // 2. POLICY
      // ======================================================================

      if (
        this._policyEngine
      ) {
        const policyDecision =
          await this
            ._policyEngine
            .evaluate({
              action:
                "runbook:execute",

              runbookId:
                runbookDef
                  .runbookId,

              tenantId:
                scope.tenantId,

              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,

              incidentId:
                scope.incidentId,

              correlationId,

              risk:
                runbookDef.risk,

              lifecycle:
                runbookDef
                  .lifecycle,
            });

        await RunbookExecution
          .updateOne(
            this._executionFilter(
              execution
            ),
            {
              $set: {
                policyDecision,
              },
            }
          );

        if (
          !policyDecision.allowed
        ) {
          return this._fail(
            execution,
            "POLICY_DENIED",
            policyDecision.reason ||
              "Policy denied execution"
          );
        }
      }

      // ======================================================================
      // 3. APPROVAL
      // ======================================================================

      const needsApproval =
        this
          ._executionNeedsApproval(
            runbookDef,
            executionInput
          );

      if (
        needsApproval &&
        !executionInput
          .approvalId
      ) {
        execution =
          await this._setStatus(
            execution,
            "WAITING_FOR_APPROVAL"
          );

        await RunbookExecution
          .updateOne(
            this._executionFilter(
              execution
            ),
            {
              $set: {
                statusReason:
                  "Awaiting human approval for high-risk/confirmation-required step",
              },
            }
          );

        return RunbookExecution
          .findOne(
            this._executionFilter(
              execution
            )
          )
          .lean();
      }

      if (
        executionInput
          .approvalId
      ) {
        await RunbookExecution
          .updateOne(
            this._executionFilter(
              execution
            ),
            {
              $set: {
                approvalId:
                  executionInput
                    .approvalId,

                approver:
                  executionInput
                    .approver,

                approvedAt:
                  new Date(),
              },
            }
          );
      }

      // ======================================================================
      // 4. RUN
      // ======================================================================

      execution =
        await this._setStatus(
          execution,
          "RUNNING",
          {
            startedAt:
              new Date(),
          }
        );

      const steps =
        _orderedSteps(
          runbookDef
        );

      const completedSteps =
        [];

      const preStates =
        {};

      let failedStep =
        null;

      const executionContext = {
        executionId,

        correlationId,

        tenantId:
          scope.tenantId,

        organizationId:
          scope.organizationId,

        environmentId:
          scope.environmentId,

        incidentId:
          scope.incidentId,

        dryRun:
          Boolean(
            executionInput.dryRun
          ),
      };

      for (
        const step
        of steps
      ) {
        const result =
          await this._executeStep(
            step,
            runtimeParameters,
            {
              ...executionContext,

              stepConfig:
                step,
            }
          );

        if (
          result.preState !==
          undefined
        ) {
          preStates[
            step.stepId
          ] =
            result.preState;
        }

        const attempt = {
          stepId:
            step.stepId,

          type:
            step.type,

          action:
            step.action,

          status:
            result.status,

          startedAt:
            result.startedAt,

          completedAt:
            result.completedAt,

          durationMs:
            result.durationMs,

          output:
            result.output,

          preState:
            result.preState,

          error:
            result.error ||
            null,

          timedOut:
            result.timedOut ||
            false,
        };

        await RunbookExecution
          .updateOne(
            this._executionFilter(
              execution
            ),
            {
              $push: {
                stepAttempts:
                  attempt,
              },
            }
          );

        if (
          result.status ===
          "SUCCEEDED"
        ) {
          completedSteps.push({
            stepId:
              step.stepId,

            type:
              step.type,

            action:
              step.action,
          });
        } else {
          failedStep =
            step;

          break;
        }
      }

      // ======================================================================
      // 5. FAILURE
      // ======================================================================

      if (
        failedStep
      ) {
        const failurePolicy =
          runbookDef
            .failurePolicy ||
          RUNBOOK_FAILURE_POLICY
            .STOP;

        return this
          ._handleFailure(
            execution,
            failedStep,
            failurePolicy,
            runbookDef
              .rollbackConfig,
            completedSteps,
            preStates,
            runtimeParameters,
            executionContext
          );
      }

      // ======================================================================
      // 6. VERIFICATION
      // ======================================================================

      execution =
        await this._setStatus(
          execution,
          "VERIFYING"
        );

      const verificationResult =
        await this
          ._verifier_()
          .verify(
            runbookDef
              .verification,

            runtimeParameters,

            executionContext
          );

      await RunbookExecution
        .updateOne(
          this._executionFilter(
            execution
          ),
          {
            $set: {
              verificationResult,
            },
          }
        );

      if (
        !verificationResult
          .passed &&
        !verificationResult
          .skipped
      ) {
        return this
          ._handleFailure(
            execution,
            null,
            RUNBOOK_FAILURE_POLICY
              .STOP,
            runbookDef
              .rollbackConfig,
            completedSteps,
            preStates,
            runtimeParameters,
            executionContext,
            "VERIFICATION_FAILED"
          );
      }

      // ======================================================================
      // 7. SUCCESS
      // ======================================================================

      const completedAt =
        new Date();

      const latest =
        await RunbookExecution
          .findOne(
            this._executionFilter(
              execution
            )
          );

      const startedAt =
        latest?.startedAt ||
        execution.startedAt ||
        execution.createdAt ||
        completedAt;

      await RunbookExecution
        .updateOne(
          this._executionFilter(
            execution
          ),
          {
            $set: {
              status:
                "SUCCEEDED",

              completedAt,

              durationMs:
                completedAt -
                startedAt,
            },
          }
        );

      return RunbookExecution
        .findOne(
          this._executionFilter(
            execution
          )
        )
        .lean();
    } catch (error) {
      return this._fail(
        execution,
        "UNEXPECTED_ERROR",
        error.message
      );
    }
  }

  // ==========================================================================
  // STEP EXECUTION
  // ==========================================================================

  async _executeStep(
    step,
    runtimeParameters,
    context
  ) {
    const registry =
      this._reg();

    const {
      type,
      action,
    } =
      step;

    if (
      !registry.has(
        type,
        action
      )
    ) {
      const now =
        new Date();

      return {
        status:
          "FAILED",

        error:
          `No registered handler for ${type}/${action}`,

        startedAt:
          now,

        completedAt:
          now,

        durationMs:
          0,
      };
    }

    const handler =
      registry.getHandler(
        type,
        action
      );

    const params =
      _mergeStepParams(
        step,
        runtimeParameters
      );

    if (
      typeof handler
        .validate ===
      "function"
    ) {
      const validation =
        handler.validate(
          params
        );

      if (
        !validation.valid
      ) {
        const now =
          new Date();

        return {
          status:
            "FAILED",

          error:
            `Parameter validation: ${validation.errors.join("; ")}`,

          startedAt:
            now,

          completedAt:
            now,

          durationMs:
            0,
        };
      }
    }

    let preState =
      null;

    if (
      typeof handler
        .capturePreState ===
      "function"
    ) {
      try {
        preState =
          await handler
            .capturePreState(
              params,
              context
            );
      } catch {
        preState =
          null;
      }
    }

    const timeoutMs =
      (
        step.timeoutSeconds ||
        (
          DEFAULT_STEP_TIMEOUT_MS /
          1000
        )
      ) *
      1000;

    const maxAttempts =
      handler.metadata
        ?.retrySafe
        ? (
            step.retry
              ?.maxAttempts ||
            step.retryPolicy
              ?.maxAttempts ||
            1
          )
        : 1;

    let lastError =
      null;

    let output =
      null;

    let timedOut =
      false;

    const startedAt =
      new Date();

    for (
      let attempt = 1;
      attempt <=
      maxAttempts;
      attempt++
    ) {
      try {
        output =
          await _withTimeout(
            () =>
              handler.execute(
                params,
                {
                  ...context,

                  stepConfig:
                    step,

                  attempt,
                }
              ),

            timeoutMs,

            `Step ${step.stepId} timed out after ${timeoutMs}ms`
          );

        lastError =
          null;

        break;
      } catch (error) {
        lastError =
          error;

        if (
          error.message
            .includes(
              "timed out"
            )
        ) {
          timedOut =
            true;

          break;
        }

        if (
          attempt <
          maxAttempts
        ) {
          const backoffMs =
            Math.min(
              1000 *
              attempt,
              5000
            );

          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                backoffMs
              )
          );
        }
      }
    }

    const completedAt =
      new Date();

    const durationMs =
      completedAt -
      startedAt;

    if (
      lastError
    ) {
      return {
        status:
          timedOut
            ? "TIMED_OUT"
            : "FAILED",

        error:
          lastError.message,

        timedOut,

        preState,

        startedAt,

        completedAt,

        durationMs,
      };
    }

    const succeeded =
      output?.success !==
      false;

    return {
      status:
        succeeded
          ? "SUCCEEDED"
          : "FAILED",

      output,

      preState,

      startedAt,

      completedAt,

      durationMs,
    };
  }

  // ==========================================================================
  // FAILURE / ROLLBACK
  // ==========================================================================

  async _handleFailure(
    execution,
    failedStep,
    failurePolicy,
    rollbackConfig,
    completedSteps,
    preStates,
    runtimeParameters,
    context,
    errorCode = "STEP_FAILED"
  ) {
    await RunbookExecution
      .updateOne(
        this._executionFilter(
          execution
        ),
        {
          $set: {
            failedStepId:
              failedStep
                ?.stepId ||
              null,

            errorCode,
          },
        }
      );

    if (
      failurePolicy ===
      RUNBOOK_FAILURE_POLICY
        .ROLLBACK
    ) {
      execution =
        await this
          ._setStatus(
            execution,
            "ROLLBACK_PENDING"
          );

      execution =
        await this
          ._setStatus(
            execution,
            "ROLLING_BACK",
            {
              rollbackState: {
                triggeredAt:
                  new Date(),
              },
            }
          );

      const rollbackResult =
        await this
          ._rollback()
          .rollback(
            rollbackConfig,
            completedSteps,
            preStates,
            runtimeParameters,
            context
          );

      const finalStatus =
        rollbackResult.success
          ? "ROLLED_BACK"
          : "ROLLBACK_FAILED";

      const completedAt =
        new Date();

      await RunbookExecution
        .updateOne(
          this._executionFilter(
            execution
          ),
          {
            $set: {
              status:
                finalStatus,

              completedAt,

              rollbackState:
                rollbackResult,
            },
          }
        );
    } else if (
      failurePolicy ===
      RUNBOOK_FAILURE_POLICY
        .ESCALATE
    ) {
      const completedAt =
        new Date();

      await RunbookExecution
        .updateOne(
          this._executionFilter(
            execution
          ),
          {
            $set: {
              status:
                "ESCALATED",

              completedAt,

              escalated:
                true,

              escalatedAt:
                completedAt,

              escalationReason:
                "Failure policy = ESCALATE",
            },
          }
        );
    } else {
      await RunbookExecution
        .updateOne(
          this._executionFilter(
            execution
          ),
          {
            $set: {
              status:
                "FAILED",

              completedAt:
                new Date(),
            },
          }
        );
    }

    return RunbookExecution
      .findOne(
        this._executionFilter(
          execution
        )
      )
      .lean();
  }

  // ==========================================================================
  // STATUS / FAILURE HELPERS
  // ==========================================================================

  async _setStatus(
    execution,
    status,
    extra = {}
  ) {
    const update = {
      status,
      ...extra,
    };

    await RunbookExecution
      .updateOne(
        this._executionFilter(
          execution
        ),
        {
          $set:
            update,
        }
      );

    return {
      ...(
        execution.toObject
          ? execution.toObject()
          : execution
      ),

      ...update,
    };
  }

  async _fail(
    execution,
    errorCode,
    errorMessage
  ) {
    const completedAt =
      new Date();

    await RunbookExecution
      .updateOne(
        this._executionFilter(
          execution
        ),
        {
          $set: {
            status:
              "FAILED",

            completedAt,

            errorCode,

            errorMessage,
          },
        }
      );

    return RunbookExecution
      .findOne(
        this._executionFilter(
          execution
        )
      )
      .lean();
  }

  // ==========================================================================
  // APPROVAL
  // ==========================================================================

  _executionNeedsApproval(
    runbookDef,
    executionInput
  ) {
    if (
      executionInput
        .approvalId
    ) {
      return false;
    }

    const steps =
      _orderedSteps(
        runbookDef
      );

    const registry =
      this._reg();

    return steps.some(
      (step) => {
        if (
          step
            .requiresConfirmation
        ) {
          return true;
        }

        if (
          !registry.has(
            step.type,
            step.action
          )
        ) {
          return false;
        }

        const handler =
          registry.getHandler(
            step.type,
            step.action
          );

        return (
          handler.metadata
            ?.requiresConfirmation ===
          true
        );
      }
    );
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function _orderedSteps(
  runbookDef
) {
  const steps =
    runbookDef.steps;

  if (
    !steps ||
    typeof steps !==
      "object"
  ) {
    return [];
  }

  if (
    Array.isArray(
      steps
    )
  ) {
    return [
      ...steps,
    ].sort(
      (a, b) =>
        (
          a.order ||
          a.stepNumber ||
          0
        ) -
        (
          b.order ||
          b.stepNumber ||
          0
        )
    );
  }

  return Object
    .entries(
      steps
    )
    .sort(
      ([a], [b]) =>
        a.localeCompare(
          b
        )
    )
    .map(
      ([
        stepId,
        step,
      ]) => ({
        stepId,
        ...step,
      })
    );
}

function _mergeStepParams(
  step,
  runtimeParameters
) {
  return {
    ...runtimeParameters,
    ...(
      step.params ||
      {}
    ),
  };
}

function _sanitizeSnapshot(
  runbookDef
) {
  const snapshot = {
    ...runbookDef,
  };

  delete snapshot._id;
  delete snapshot.__v;
  delete snapshot.createdAt;
  delete snapshot.updatedAt;

  return snapshot;
}

function _withTimeout(
  fn,
  milliseconds,
  message
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const timer =
        setTimeout(
          () =>
            reject(
              new Error(
                message
              )
            ),
          milliseconds
        );

      Promise.resolve()
        .then(fn)
        .then(
          (value) => {
            clearTimeout(
              timer
            );

            resolve(
              value
            );
          },

          (error) => {
            clearTimeout(
              timer
            );

            reject(
              error
            );
          }
        );
    }
  );
}

// ============================================================================
// SINGLETON
// ============================================================================

let engine =
  null;

function getRunbookExecutionEngine(
  options
) {
  if (
    !engine ||
    options
  ) {
    engine =
      new RunbookExecutionEngine(
        options ||
        {}
      );
  }

  return engine;
}

function resetRunbookExecutionEngine() {
  engine =
    null;
}

module.exports = {
  RunbookExecutionEngine,
  getRunbookExecutionEngine,
  resetRunbookExecutionEngine,
};