"use strict";

const {
  AsyncLocalStorage,
} =
  require(
    "node:async_hooks"
  );

const {
  getAgentBudgets,
} =
  require(
    "../config/agentBudgets"
  );

const budgetStorage =
  new AsyncLocalStorage();

const runs =
  new Map();

const BUDGET_ERROR_CODE =
  "AGENT_BUDGET_EXCEEDED";

function createBudgetRun({
  runId,
  incidentId,
  overrides = {},
} = {}) {
  if (
    !runId
  ) {
    throw new TypeError(
      "Budget run requires runId"
    );
  }

  const limits = {
    ...getAgentBudgets(),
    ...overrides,
  };

  const existing =
    runs.get(
      runId
    );

  if (
    existing
  ) {
    return existing;
  }

  const run = {
    runId,

    incidentId:
      incidentId ||
      null,

    startedAt:
      Date.now(),

    limits,

    usage: {
      steps:
        0,

      toolCalls:
        0,

      modelCalls:
        0,

      retries:
        0,

      inputTokens:
        0,

      outputTokens:
        0,

      estimatedCost:
        0,
    },

    toolCalls:
      [],

    modelCalls:
      [],

    violations:
      [],

    securityFindings:
      [],
  };

  runs.set(
    runId,
    run
  );

  return run;
}

function getBudgetRun(
  runId
) {
  return runs.get(
    runId
  ) ||
  null;
}

function getCurrentBudgetRun() {
  const runId =
    budgetStorage
      .getStore()
      ?.runId;

  return runId
    ? getBudgetRun(
        runId
      )
    : null;
}

function withBudgetRun(
  runId,
  callback
) {
  if (
    !getBudgetRun(
      runId
    )
  ) {
    throw new Error(
      `Unknown budget run: ${runId}`
    );
  }

  return budgetStorage
    .run(
      {
        runId,
      },
      callback
    );
}

function _throwExceeded(
  run,
  dimension,
  actual,
  limit
) {
  const violation = {
    code:
      BUDGET_ERROR_CODE,

    dimension,

    actual,

    limit,

    at:
      new Date()
        .toISOString(),
  };

  run.violations
    .push(
      violation
    );

  const error =
    new Error(
      `Agent budget exceeded: ${dimension} ${actual}/${limit}`
    );

  error.code =
    BUDGET_ERROR_CODE;

  error.dimension =
    dimension;

  error.actual =
    actual;

  error.limit =
    limit;

  throw error;
}

function assertRuntimeBudget(
  run
) {
  if (
    !run
  ) {
    return;
  }

  const elapsed =
    Date.now() -
    run.startedAt;

  if (
    elapsed >
    run.limits
      .orchestratorTimeoutMs
  ) {
    _throwExceeded(
      run,
      "runtimeMs",
      elapsed,
      run.limits
        .orchestratorTimeoutMs
    );
  }
}

function consumeStep(
  runId,
  stage = null
) {
  const run =
    getBudgetRun(
      runId
    );

  if (
    !run
  ) {
    return;
  }

  assertRuntimeBudget(
    run
  );

  run.usage.steps +=
    1;

  if (
    run.usage.steps >
    run.limits
      .maxStepsPerIncident
  ) {
    _throwExceeded(
      run,
      "steps",
      run.usage.steps,
      run.limits
        .maxStepsPerIncident
    );
  }

  if (
    stage
  ) {
    run.toolCalls
      .push({
        type:
          "ORCHESTRATION_STEP",

        name:
          String(
            stage
          ),

        at:
          new Date()
            .toISOString(),
      });
  }
}

function consumeToolCall(
  runId,
  name
) {
  const run =
    getBudgetRun(
      runId
    );

  if (
    !run
  ) {
    return;
  }

  assertRuntimeBudget(
    run
  );

  run.usage.toolCalls +=
    1;

  run.toolCalls
    .push({
      type:
        "TOOL_CALL",

      name:
        String(
          name ||
          "unknown"
        ),

      at:
        new Date()
          .toISOString(),
    });

  if (
    run.usage.toolCalls >
    run.limits
      .maxToolCallsPerIncident
  ) {
    _throwExceeded(
      run,
      "toolCalls",
      run.usage.toolCalls,
      run.limits
        .maxToolCallsPerIncident
    );
  }
}

function recordRetry() {
  const run =
    getCurrentBudgetRun();

  if (
    !run
  ) {
    return;
  }

  run.usage.retries +=
    1;

  if (
    run.usage.retries >
    run.limits
      .maxRetriesPerIncident
  ) {
    _throwExceeded(
      run,
      "retries",
      run.usage.retries,
      run.limits
        .maxRetriesPerIncident
    );
  }
}

function reserveModelCall({
  task,
  estimatedInputTokens = 0,
} = {}) {
  const run =
    getCurrentBudgetRun();

  if (
    !run
  ) {
    return;
  }

  assertRuntimeBudget(
    run
  );

  run.usage.modelCalls +=
    1;

  run.usage.inputTokens +=
    Math.max(
      0,
      Number(
        estimatedInputTokens
      ) ||
      0
    );

  if (
    run.usage.modelCalls >
    run.limits
      .maxModelCallsPerIncident
  ) {
    _throwExceeded(
      run,
      "modelCalls",
      run.usage.modelCalls,
      run.limits
        .maxModelCallsPerIncident
    );
  }

  if (
    run.usage.inputTokens >
    run.limits
      .maxInputTokensPerIncident
  ) {
    _throwExceeded(
      run,
      "inputTokens",
      run.usage.inputTokens,
      run.limits
        .maxInputTokensPerIncident
    );
  }

  run.modelCalls
    .push({
      task:
        task ||
        null,

      startedAt:
        new Date()
          .toISOString(),
    });
}

function completeModelCall({
  task,
  inputTokens = null,
  outputTokens = 0,
  estimatedCost = 0,
  model = null,
  provider = null,
} = {}) {
  const run =
    getCurrentBudgetRun();

  if (
    !run
  ) {
    return;
  }

  /*
   * reserveModelCall already charged estimated input tokens.
   *
   * If the provider reports a real value, adjust to it.
   */
  if (
    inputTokens !==
      null &&
    inputTokens !==
      undefined
  ) {
    const latest =
      [...run.modelCalls]
        .reverse()
        .find(
          (entry) =>
            !entry.completedAt &&
            (
              !task ||
              entry.task ===
                task
            )
        );

    if (
      latest
    ) {
      latest.actualInputTokens =
        Math.max(
          0,
          Number(
            inputTokens
          ) ||
          0
        );
    }
  }

  run.usage.outputTokens +=
    Math.max(
      0,
      Number(
        outputTokens
      ) ||
      0
    );

  run.usage.estimatedCost +=
    Math.max(
      0,
      Number(
        estimatedCost
      ) ||
      0
    );

  if (
    run.usage.outputTokens >
    run.limits
      .maxOutputTokensPerIncident
  ) {
    _throwExceeded(
      run,
      "outputTokens",
      run.usage.outputTokens,
      run.limits
        .maxOutputTokensPerIncident
    );
  }

  if (
    run.usage.estimatedCost >
    run.limits
      .maxEstimatedCostPerIncident
  ) {
    _throwExceeded(
      run,
      "estimatedCost",
      Number(
        run.usage
          .estimatedCost
          .toFixed(
            6
          )
      ),
      run.limits
        .maxEstimatedCostPerIncident
    );
  }

  const latest =
    [...run.modelCalls]
      .reverse()
      .find(
        (entry) =>
          !entry.completedAt &&
          (
            !task ||
            entry.task ===
              task
          )
      );

  if (
    latest
  ) {
    latest.completedAt =
      new Date()
        .toISOString();

    latest.outputTokens =
      outputTokens ||
      0;

    latest.estimatedCost =
      estimatedCost ||
      0;

    latest.model =
      model;

    latest.provider =
      provider;
  }
}

function recordSecurityFinding(
  finding
) {
  const run =
    getCurrentBudgetRun();

  if (
    !run ||
    !finding
  ) {
    return;
  }

  run.securityFindings
    .push({
      ...finding,

      detectedAt:
        finding.detectedAt ||
        new Date()
          .toISOString(),
    });
}

function wrapToolDependencies(
  runId,
  dependencies = {}
) {
  const wrapValue =
    (
      value,
      path
    ) => {
      if (
        typeof value ===
        "function"
      ) {
        return function budgetedFunction(
          ...args
        ) {
          consumeToolCall(
            runId,
            path
          );

          return value.apply(
            this,
            args
          );
        };
      }

      if (
        !value ||
        typeof value !==
          "object"
      ) {
        return value;
      }

      return new Proxy(
        value,
        {
          get(
            target,
            property,
            receiver
          ) {
            const result =
              Reflect.get(
                target,
                property,
                receiver
              );

            if (
              typeof result ===
              "function"
            ) {
              return function budgetedMethod(
                ...args
              ) {
                consumeToolCall(
                  runId,
                  `${path}.${String(
                    property
                  )}`
                );

                return result.apply(
                  target,
                  args
                );
              };
            }

            return result;
          },
        }
      );
    };

  const wrapped =
    {};

  for (
    const [
      key,
      value,
    ] of Object.entries(
      dependencies ||
      {}
    )
  ) {
    wrapped[
      key
    ] =
      wrapValue(
        value,
        key
      );
  }

  return wrapped;
}

function snapshotBudgetRun(
  runId
) {
  const run =
    getBudgetRun(
      runId
    );

  if (
    !run
  ) {
    return null;
  }

  return {
    runId:
      run.runId,

    incidentId:
      run.incidentId,

    limits: {
      ...run.limits,
    },

    usage: {
      ...run.usage,

      estimatedCost:
        Number(
          run.usage
            .estimatedCost
            .toFixed(
              6
            )
        ),
    },

    violations:
      [...run.violations],

    toolCalls:
      [...run.toolCalls],

    modelCalls:
      [...run.modelCalls],

    securityFindings:
      [...run.securityFindings],

    elapsedMs:
      Date.now() -
      run.startedAt,
  };
}

function deleteBudgetRun(
  runId
) {
  runs.delete(
    runId
  );
}

module.exports = {
  BUDGET_ERROR_CODE,
  createBudgetRun,
  getBudgetRun,
  getCurrentBudgetRun,
  withBudgetRun,
  assertRuntimeBudget,
  consumeStep,
  consumeToolCall,
  reserveModelCall,
  completeModelCall,
  recordRetry,
  recordSecurityFinding,
  wrapToolDependencies,
  snapshotBudgetRun,
  deleteBudgetRun,
};