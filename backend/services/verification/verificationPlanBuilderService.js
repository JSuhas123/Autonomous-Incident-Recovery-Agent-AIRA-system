"use strict";

/**
 * AIRA Verification Plan Builder
 *
 * Phase 9.2
 *
 * Builds a deterministic post-execution verification plan.
 *
 * Sources:
 *
 * - executed plan verification hooks
 * - playbook postconditions
 * - incident symptoms
 * - recovery context
 *
 * DOES NOT:
 *
 * - mark incident recovered
 * - authorize execution
 * - execute rollback
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  VERIFICATION_DIMENSION,
} =
  require(
    "./verificationContracts"
  );

class VerificationPlanBuilderService {
  constructor(
    options = {}
  ) {
    this.defaultTimeoutMs =
      Number.isFinite(
        Number(
          options.defaultTimeoutMs
        )
      )
        ? Math.max(
            1000,
            Number(
              options.defaultTimeoutMs
            )
          )
        : 60000;

    this.maximumChecks =
      Number.isFinite(
        Number(
          options.maximumChecks
        )
      )
        ? Math.max(
            1,
            Number(
              options.maximumChecks
            )
          )
        : 50;
  }

  build(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const checks =
      [];

    // ========================================================================
    // 1. EXECUTION PLAN VERIFICATION HOOKS
    // ========================================================================

    const hooks =
      normalizeArray(
        input
          .executionPlan
          ?.verificationHooks
      );

    for (
      const hook
      of hooks
    ) {
      checks.push(
        this.fromHook(
          hook
        )
      );
    }

    // ========================================================================
    // 2. PLAYBOOK POSTCONDITIONS
    // ========================================================================

    const postconditions =
      normalizeArray(
        input
          .playbook
          ?.postconditions
      );

    for (
      const condition
      of postconditions
    ) {
      checks.push(
        this.fromPostcondition(
          condition
        )
      );
    }

    // ========================================================================
    // 3. INCIDENT SYMPTOMS
    // ========================================================================

    const symptoms =
      normalizeArray(
        input
          .incident
          ?.symptoms
      );

    for (
      const symptom
      of symptoms
    ) {
      const derived =
        this.fromSymptom(
          symptom
        );

      if (
        derived
      ) {
        checks.push(
          derived
        );
      }
    }

    // ========================================================================
    // 4. DEFAULT HEALTH CHECK
    // ========================================================================

    if (
      checks.length ===
      0
    ) {
      checks.push({
        checkId:
          "health-default",

        dimension:
          VERIFICATION_DIMENSION
            .HEALTH,

        type:
          "service_health",

        description:
          "Verify affected service is healthy after recovery.",

        required:
          true,

        timeoutMs:
          this.defaultTimeoutMs,

        expectedValue:
          "healthy",

        parameters: {
          serviceId:
            input
              .context
              ?.service
              ?.id ||
            null,
        },

        metadata: {
          source:
            "default",
        },
      });
    }

    // ========================================================================
    // 5. DEDUPLICATE
    // ========================================================================

    const uniqueChecks =
      this.deduplicate(
        checks
      );

    if (
      uniqueChecks.length >
      this.maximumChecks
    ) {
      throw Object.assign(
        new Error(
          `Verification plan exceeds maximum check count ${this.maximumChecks}`
        ),
        {
          code:
            "VERIFICATION_PLAN_TOO_MANY_CHECKS",
        }
      );
    }

    const plan = {
      verificationPlanId:
        input.verificationPlanId ||
        this.generatePlanId(
          input
        ),

      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      executionRequestId:
        input.executionRequestId,

      authorizationId:
        input.authorizationId ||
        null,

      recoveryDecisionId:
        input.recoveryDecisionId ||
        null,

      executionPlanId:
        input
          .executionPlan
          ?.planId ||
        null,

      executionPlanHash:
        input
          .executionPlan
          ?.planHash ||
        null,

      checks:
        uniqueChecks.map(
          (
            check,
            index
          ) => ({
            ...check,

            order:
              index + 1,
          })
        ),

      requiredCheckCount:
        uniqueChecks.filter(
          (
            check
          ) =>
            check.required !==
            false
        )
          .length,

      generatedAt:
        new Date(),

      metadata: {
        builderVersion:
          "phase9.2-v1",

        immutable:
          true,
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

  fromHook(
    hook = {}
  ) {
    return {
      checkId:
        hook.hookId ||
        hook.id ||
        null,

      dimension:
        normalizeDimension(
          hook.dimension ||
          hook.type
        ),

      type:
        hook.type ||
        "custom",

      description:
        hook.description ||
        null,

      required:
        hook.required !==
        false,

      timeoutMs:
        this.normalizeTimeout(
          hook.timeoutMs
        ),

      expectedValue:
        hook.expectedValue ??
        null,

      threshold:
        hook.threshold ??
        null,

      parameters:
        hook.parameters ||
        {},

      metadata: {
        source:
          "execution_plan_hook",
      },
    };
  }

  fromPostcondition(
    condition = {}
  ) {
    if (
      typeof condition ===
      "string"
    ) {
      return {
        checkId:
          null,

        dimension:
          VERIFICATION_DIMENSION
            .HEALTH,

        type:
          "postcondition",

        description:
          condition,

        required:
          true,

        timeoutMs:
          this.defaultTimeoutMs,

        expectedValue:
          true,

        parameters:
          {},

        metadata: {
          source:
            "playbook_postcondition",
        },
      };
    }

    return {
      checkId:
        condition.id ||
        condition.checkId ||
        null,

      dimension:
        normalizeDimension(
          condition.dimension ||
          condition.type
        ),

      type:
        condition.type ||
        "postcondition",

      description:
        condition.description ||
        null,

      required:
        condition.required !==
        false,

      timeoutMs:
        this.normalizeTimeout(
          condition.timeoutMs
        ),

      expectedValue:
        condition.expectedValue ??
        condition.expected ??
        null,

      threshold:
        condition.threshold ??
        null,

      parameters:
        condition.parameters ||
        {},

      metadata: {
        source:
          "playbook_postcondition",
      },
    };
  }

  fromSymptom(
    symptom
  ) {
    const value =
      typeof symptom ===
        "string"
        ? symptom
        : symptom
            ?.type ||
          symptom
            ?.name ||
          symptom
            ?.description ||
          "";

    const normalized =
      String(
        value
      )
        .toLowerCase();

    if (
      normalized.includes(
        "cpu"
      )
    ) {
      return {
        checkId:
          null,

        dimension:
          VERIFICATION_DIMENSION
            .METRICS,

        type:
          "cpu_recovery",

        description:
          "Verify CPU usage returned to acceptable range.",

        required:
          true,

        timeoutMs:
          this.defaultTimeoutMs,

        threshold:
          symptom
            ?.recoveryThreshold ??
          80,

        parameters:
          {},

        metadata: {
          source:
            "incident_symptom",
        },
      };
    }

    if (
      normalized.includes(
        "memory"
      )
    ) {
      return {
        checkId:
          null,

        dimension:
          VERIFICATION_DIMENSION
            .METRICS,

        type:
          "memory_recovery",

        description:
          "Verify memory usage returned to acceptable range.",

        required:
          true,

        timeoutMs:
          this.defaultTimeoutMs,

        threshold:
          symptom
            ?.recoveryThreshold ??
          85,

        parameters:
          {},

        metadata: {
          source:
            "incident_symptom",
        },
      };
    }

    if (
      normalized.includes(
        "error"
      ) ||
      normalized.includes(
        "5xx"
      )
    ) {
      return {
        checkId:
          null,

        dimension:
          VERIFICATION_DIMENSION
            .LOGS,

        type:
          "error_rate_recovery",

        description:
          "Verify application error symptoms have cleared.",

        required:
          true,

        timeoutMs:
          this.defaultTimeoutMs,

        threshold:
          symptom
            ?.recoveryThreshold ??
          null,

        parameters:
          {},

        metadata: {
          source:
            "incident_symptom",
        },
      };
    }

    if (
      normalized.includes(
        "unhealthy"
      ) ||
      normalized.includes(
        "down"
      ) ||
      normalized.includes(
        "unavailable"
      )
    ) {
      return {
        checkId:
          null,

        dimension:
          VERIFICATION_DIMENSION
            .HEALTH,

        type:
          "service_health",

        description:
          "Verify service availability has recovered.",

        required:
          true,

        timeoutMs:
          this.defaultTimeoutMs,

        expectedValue:
          "healthy",

        parameters:
          {},

        metadata: {
          source:
            "incident_symptom",
        },
      };
    }

    return null;
  }

  deduplicate(
    checks
  ) {
    const seen =
      new Set();

    const result =
      [];

    for (
      let index = 0;
      index <
      checks.length;
      index++
    ) {
      const check =
        checks[index];

      const key =
        [
          check.dimension,
          check.type,
          check.description,
        ]
          .map(
            (
              value
            ) =>
              String(
                value ||
                ""
              )
          )
          .join(
            "::"
          );

      if (
        seen.has(
          key
        )
      ) {
        continue;
      }

      seen.add(
        key
      );

      result.push({
        ...check,

        checkId:
          check.checkId ||
          `verify-${index + 1}`,
      });
    }

    return result;
  }

  normalizeTimeout(
    value
  ) {
    const numeric =
      Number(
        value
      );

    if (
      !Number.isFinite(
        numeric
      )
    ) {
      return this.defaultTimeoutMs;
    }

    return Math.max(
      1000,
      numeric
    );
  }

  generatePlanId(
    input
  ) {
    return (
      "verifyplan_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            input.organizationId,
            input.environmentId,
            input.incidentId,
            input.executionRequestId,
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

      executionRequestId:
        plan.executionRequestId,

      authorizationId:
        plan.authorizationId,

      recoveryDecisionId:
        plan.recoveryDecisionId,

      executionPlanId:
        plan.executionPlanId,

      executionPlanHash:
        plan.executionPlanHash,

      checks:
        plan.checks,
    };

    return (
      "verifyhash_" +
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
          "Verification plan input is required"
        ),
        {
          code:
            "VERIFICATION_PLAN_INPUT_REQUIRED",
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
          "Verification plan requires organization, environment and incident scope"
        ),
        {
          code:
            "VERIFICATION_PLAN_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.executionRequestId
    ) {
      throw Object.assign(
        new Error(
          "Verification plan requires executionRequestId"
        ),
        {
          code:
            "VERIFICATION_PLAN_EXECUTION_REQUEST_REQUIRED",
        }
      );
    }

    if (
      !input.executionPlan
    ) {
      throw Object.assign(
        new Error(
          "Verification plan requires execution plan"
        ),
        {
          code:
            "VERIFICATION_PLAN_EXECUTION_PLAN_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Verification plan cannot receive execution authorization"
        ),
        {
          code:
            "VERIFICATION_PLAN_UNSAFE_INPUT",
        }
      );
    }
  }
}

function normalizeDimension(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    normalized.includes(
      "metric"
    ) ||
    normalized.includes(
      "cpu"
    ) ||
    normalized.includes(
      "memory"
    ) ||
    normalized.includes(
      "latency"
    )
  ) {
    return VERIFICATION_DIMENSION
      .METRICS;
  }

  if (
    normalized.includes(
      "log"
    ) ||
    normalized.includes(
      "error"
    )
  ) {
    return VERIFICATION_DIMENSION
      .LOGS;
  }

  if (
    normalized.includes(
      "incident"
    )
  ) {
    return VERIFICATION_DIMENSION
      .INCIDENT_STATE;
  }

  if (
    normalized.includes(
      "resource"
    ) ||
    normalized.includes(
      "deployment"
    ) ||
    normalized.includes(
      "pod"
    )
  ) {
    return VERIFICATION_DIMENSION
      .RESOURCE_STATE;
  }

  if (
    normalized.includes(
      "dependency"
    )
  ) {
    return VERIFICATION_DIMENSION
      .DEPENDENCY_STATE;
  }

  return VERIFICATION_DIMENSION
    .HEALTH;
}

function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
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

  return (
    "{" +
    Object.keys(
      value
    )
      .sort()
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

module.exports =
  new VerificationPlanBuilderService();

module.exports
  .VerificationPlanBuilderService =
  VerificationPlanBuilderService;