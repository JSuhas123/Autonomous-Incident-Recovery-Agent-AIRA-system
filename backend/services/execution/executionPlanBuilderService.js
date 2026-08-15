"use strict";

/**
 * AIRA Execution Plan Builder Service
 *
 * Phase 8.8
 *
 * Converts a selected recovery candidate + playbook into a canonical,
 * immutable execution plan.
 *
 * Responsibilities:
 *
 * - resolve required parameters
 * - preserve ordered steps
 * - normalize timeouts
 * - attach verification hooks
 * - attach rollback mapping
 * - generate deterministic plan hash
 * - reject incomplete / unsafe plans
 *
 * DOES NOT:
 *
 * - authorize execution
 * - execute actions
 * - acquire locks
 * - mutate infrastructure
 */

const crypto =
  require(
    "node:crypto"
  );

class ExecutionPlanBuilderService {
  constructor(
  options = {}
) {
  const configuredMaximum =
    Number.isFinite(
      Number(
        options.maximumStepTimeoutMs
      )
    )
      ? Math.max(
          1000,
          Number(
            options.maximumStepTimeoutMs
          )
        )
      : 15 * 60 * 1000;

  const configuredDefault =
    Number.isFinite(
      Number(
        options.defaultStepTimeoutMs
      )
    )
      ? Math.max(
          1000,
          Number(
            options.defaultStepTimeoutMs
          )
        )
      : 60 * 1000;

  this.maximumStepTimeoutMs =
    configuredMaximum;

  this.defaultStepTimeoutMs =
    Math.min(
      configuredDefault,
      this.maximumStepTimeoutMs
    );
}

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  build(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const playbook =
      input.playbook;

    const selectedCandidate =
      input.selectedCandidate;

    const parameters =
      this.resolveParameters({
        input,
        playbook,
        selectedCandidate,
      });

    const steps =
      this.buildSteps({
        playbook,
        parameters,
      });

    if (
      steps.length ===
      0
    ) {
      throw Object.assign(
        new Error(
          "Execution plan requires at least one playbook step"
        ),
        {
          code:
            "EXECUTION_PLAN_STEPS_REQUIRED",
        }
      );
    }

    const rollbackPlan =
      this.buildRollbackPlan({
        playbook,
        parameters,
      });

    const verificationHooks =
      this.buildVerificationHooks(
        playbook
      );

    const generatedAt =
      new Date();

    const plan = {
      planId:
        input.planId ||
        this.generatePlanId({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          recoveryDecisionId:
            input.recoveryDecisionId,

          selectedPlaybookId:
            input.selectedPlaybookId,
        }),

      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      recoveryDecisionId:
        input.recoveryDecisionId,

      recoveryDecisionRevision:
        input.recoveryDecisionRevision ??
        null,

      candidateId:
        input.selectedCandidateId ||
        selectedCandidate
          ?.candidateId ||
        null,

      playbookId:
        input.selectedPlaybookId ||
        playbook.playbookId,

      playbookVersion:
        playbook.version ||
        null,

      actionType:
        input.actionType ||
        selectedCandidate
          ?.metadata
          ?.actionType ||
        playbook.actionType ||
        null,

      resource: {
        type:
          input.resourceType ||
          selectedCandidate
            ?.metadata
            ?.resourceType ||
          playbook.resourceType ||
          null,

        id:
          input.resourceId ||
          selectedCandidate
            ?.metadata
            ?.resourceId ||
          input.context
            ?.service
            ?.id ||
          null,

        namespace:
          parameters.namespace ||
          null,

        cluster:
          parameters.cluster ||
          null,
      },

      parameters,

      steps,

      verificationHooks,

      rollbackPlan,

      generatedAt,

      metadata: {
        builderVersion:
          "phase8.8-v1",

        immutable:
          true,

        source:
          "phase8_execution_plan_builder",

        playbookTitle:
          playbook.title ||
          null,
      },

      executionAuthorized:
        false,
    };

    plan.planHash =
      this.generatePlanHash(
        plan
      );

    return deepFreeze(
      plan
    );
  }

  // ==========================================================================
  // PARAMETERS
  // ==========================================================================

  resolveParameters({
    input,
    playbook,
    selectedCandidate,
  }) {
    const requiredParameters =
      normalizeArray(
        playbook
          .requiredParameters
      );

    const parameterSources = {
      ...(
        input.context ||
        {}
      ),

      ...(
        input.context
          ?.service ||
        {}
      ),

      ...(
        selectedCandidate
          ?.parameters ||
        {}
      ),

      ...(
        input.parameters ||
        {}
      ),
    };

    const resolved =
      {};

    for (
      const key
      of requiredParameters
    ) {
      const value =
        getNestedValue(
          parameterSources,
          key
        );

      if (
        value ===
          undefined ||
        value ===
          null ||
        value ===
          ""
      ) {
        throw Object.assign(
          new Error(
            `Execution plan missing required parameter: ${key}`
          ),
          {
            code:
              "EXECUTION_PLAN_PARAMETER_REQUIRED",

            parameter:
              key,
          }
        );
      }

      resolved[key] =
        value;
    }

    // Preserve explicit safe optional parameters.
    for (
      const [
        key,
        value,
      ]
      of Object.entries(
        input.parameters ||
        {}
      )
    ) {
      if (
        resolved[key] ===
        undefined
      ) {
        resolved[key] =
          value;
      }
    }

    return resolved;
  }

  // ==========================================================================
  // STEPS
  // ==========================================================================

  buildSteps({
    playbook,
    parameters,
  }) {
    const sourceSteps =
      normalizeArray(
        playbook.steps
      );

    return sourceSteps.map(
      (
        step,
        index
      ) => {
        const timeoutMs =
          this.normalizeTimeout(
            step.timeoutMs ||
            step.timeout ||
            this.defaultStepTimeoutMs
          );

        return {
          stepId:
            step.stepId ||
            step.id ||
            `step-${index + 1}`,

          order:
            index + 1,

          name:
            step.name ||
            step.description ||
            `Step ${index + 1}`,

          action:
            step.action ||
            step.type ||
            null,

          adapter:
            step.adapter ||
            playbook.adapter ||
            null,

          parameters:
            this.resolveStepParameters(
              step.parameters ||
              {},
              parameters
            ),

          timeoutMs,

          continueOnFailure:
            step.continueOnFailure ===
            true,

          requiresConfirmation:
            step.requiresConfirmation ===
            true,

          verification:
            normalizeArray(
              step.verification
            ),

          rollbackStepId:
            step.rollbackStepId ||
            null,

          metadata: {
            ...(
              step.metadata ||
              {}
            ),
          },
        };
      }
    );
  }

  // ==========================================================================
  // STEP PARAMETERS
  // ==========================================================================

  resolveStepParameters(
    stepParameters,
    resolvedParameters
  ) {
    const result =
      {};

    for (
      const [
        key,
        value,
      ]
      of Object.entries(
        stepParameters
      )
    ) {
      if (
        typeof value ===
          "string" &&
        value.startsWith(
          "{{"
        ) &&
        value.endsWith(
          "}}"
        )
      ) {
        const reference =
          value
            .slice(
              2,
              -2
            )
            .trim();

        const resolved =
          getNestedValue(
            resolvedParameters,
            reference
          );

        if (
          resolved ===
            undefined
        ) {
          throw Object.assign(
            new Error(
              `Execution step references unresolved parameter: ${reference}`
            ),
            {
              code:
                "EXECUTION_PLAN_STEP_PARAMETER_UNRESOLVED",

              parameter:
                reference,
            }
          );
        }

        result[key] =
          resolved;
      } else {
        result[key] =
          value;
      }
    }

    return result;
  }

  // ==========================================================================
  // VERIFICATION
  // ==========================================================================

  buildVerificationHooks(
    playbook
  ) {
    const hooks =
      normalizeArray(
        playbook
          .verificationHooks ||
        playbook
          .postconditions
      );

    return hooks.map(
      (
        hook,
        index
      ) => ({
        hookId:
          hook.hookId ||
          hook.id ||
          `verify-${index + 1}`,

        type:
          hook.type ||
          null,

        description:
          hook.description ||
          null,

        timeoutMs:
          this.normalizeTimeout(
            hook.timeoutMs ||
            this.defaultStepTimeoutMs
          ),

        parameters:
          hook.parameters ||
          {},
      })
    );
  }

  // ==========================================================================
  // ROLLBACK
  // ==========================================================================

  buildRollbackPlan({
    playbook,
    parameters,
  }) {
    const rollback =
      playbook.rollback ||
      {};

    const rollbackSteps =
      normalizeArray(
        rollback.steps
      );

    return {
      available:
        rollbackSteps.length >
        0,

      reversibility:
        rollback.reversibility ||
        (
          rollbackSteps.length >
          0
            ? "FULL"
            : "UNKNOWN"
        ),

      automaticAllowed:
        rollback
          .automaticAllowed ===
        true,

      steps:
        rollbackSteps.map(
          (
            step,
            index
          ) => ({
            stepId:
              step.stepId ||
              step.id ||
              `rollback-${index + 1}`,

            order:
              index + 1,

            action:
              step.action ||
              step.type ||
              null,

            adapter:
              step.adapter ||
              playbook.adapter ||
              null,

            parameters:
              this.resolveStepParameters(
                step.parameters ||
                {},
                parameters
              ),

            timeoutMs:
              this.normalizeTimeout(
                step.timeoutMs ||
                this.defaultStepTimeoutMs
              ),
          })
        ),
    };
  }

  // ==========================================================================
  // TIMEOUT
  // ==========================================================================

  normalizeTimeout(
    value
  ) {
    const timeout =
      Number(
        value
      );

    if (
      !Number.isFinite(
        timeout
      )
    ) {
      return this
        .defaultStepTimeoutMs;
    }

    return Math.max(
      1000,
      Math.min(
        timeout,
        this.maximumStepTimeoutMs
      )
    );
  }

  // ==========================================================================
  // PLAN ID
  // ==========================================================================

  generatePlanId(
    input
  ) {
    return (
      "execplan_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            input.organizationId,
            input.environmentId,
            input.incidentId,
            input.recoveryDecisionId,
            input.selectedPlaybookId,
            Date.now(),
            crypto.randomUUID(),
          ]
            .join(
              ":"
            )
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          24
        )
    );
  }

  // ==========================================================================
  // PLAN HASH
  // ==========================================================================

  generatePlanHash(
    plan
  ) {
    const canonical = {
      organizationId:
        plan.organizationId,

      environmentId:
        plan.environmentId,

      incidentId:
        plan.incidentId,

      recoveryDecisionId:
        plan.recoveryDecisionId,

      recoveryDecisionRevision:
        plan.recoveryDecisionRevision,

      candidateId:
        plan.candidateId,

      playbookId:
        plan.playbookId,

      playbookVersion:
        plan.playbookVersion,

      actionType:
        plan.actionType,

      resource:
        plan.resource,

      parameters:
        plan.parameters,

      steps:
        plan.steps,

      verificationHooks:
        plan.verificationHooks,

      rollbackPlan:
        plan.rollbackPlan,
    };

    return (
      "planhash_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          stableStringify(
            canonical
          )
        )
        .digest(
          "hex"
        )
    );
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
          "Execution plan input is required"
        ),
        {
          code:
            "EXECUTION_PLAN_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId ||
      !input.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Execution plan requires organization, environment and incident scope"
        ),
        {
          code:
            "EXECUTION_PLAN_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.recoveryDecisionId
    ) {
      throw Object.assign(
        new Error(
          "Execution plan requires recoveryDecisionId"
        ),
        {
          code:
            "EXECUTION_PLAN_DECISION_REQUIRED",
        }
      );
    }

    if (
      !input.selectedPlaybookId
    ) {
      throw Object.assign(
        new Error(
          "Execution plan requires selectedPlaybookId"
        ),
        {
          code:
            "EXECUTION_PLAN_PLAYBOOK_REQUIRED",
        }
      );
    }

    if (
      !input.playbook
    ) {
      throw Object.assign(
        new Error(
          "Execution plan requires playbook"
        ),
        {
          code:
            "EXECUTION_PLAN_PLAYBOOK_OBJECT_REQUIRED",
        }
      );
    }

    if (
      !input.selectedCandidate
    ) {
      throw Object.assign(
        new Error(
          "Execution plan requires selected recovery candidate"
        ),
        {
          code:
            "EXECUTION_PLAN_CANDIDATE_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Execution plan builder cannot receive execution authorization"
        ),
        {
          code:
            "EXECUTION_PLAN_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function getNestedValue(
  object,
  path
) {
  if (
    !path
  ) {
    return undefined;
  }

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        object,
        path
      )
  ) {
    return object[path];
  }

  return String(
    path
  )
    .split(
      "."
    )
    .reduce(
      (
        current,
        key
      ) =>
        current ===
          undefined ||
        current ===
          null
          ? undefined
          : current[key],
      object
    );
}

function stableStringify(
  value
) {
  if (
    value ===
      null ||
    typeof value !==
      "object"
  ) {
    return JSON.stringify(
      value
    );
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return (
      "[" +
      value
        .map(
          stableStringify
        )
        .join(
          ","
        ) +
      "]"
    );
  }

  const keys =
    Object.keys(
      value
    )
      .sort();

  return (
    "{" +
    keys
      .map(
        (
          key
        ) =>
          JSON.stringify(
            key
          ) +
          ":" +
          stableStringify(
            value[key]
          )
      )
      .join(
        ","
      ) +
    "}"
  );
}

function deepFreeze(
  object
) {
  if (
    !object ||
    typeof object !==
      "object" ||
    Object.isFrozen(
      object
    )
  ) {
    return object;
  }

  Object.freeze(
    object
  );

  for (
    const value
    of Object.values(
      object
    )
  ) {
    deepFreeze(
      value
    );
  }

  return object;
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new ExecutionPlanBuilderService();

module.exports
  .ExecutionPlanBuilderService =
  ExecutionPlanBuilderService;