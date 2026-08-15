"use strict";

/**
 * AIRA Executor Registry
 *
 * Phase 8.13
 *
 * Controlled capability registry.
 *
 * Playbooks NEVER select arbitrary code or shell commands.
 * They may only request capabilities explicitly registered here.
 */

const {
  EXECUTOR_ERROR,
  EXECUTOR_RESULT_STATUS,
  createExecutorResult,
} =
  require(
    "./executorContracts"
  );

class ExecutorRegistry {
  constructor() {
    this.capabilities =
      new Map();
  }

  // ==========================================================================
  // REGISTER
  // ==========================================================================

  register(
    definition = {}
  ) {
    this.assertDefinition(
      definition
    );

    const capability =
      definition.capability
        .trim();

    if (
      this.capabilities
        .has(
          capability
        )
    ) {
      throw Object.assign(
        new Error(
          `Executor capability already registered: ${capability}`
        ),
        {
          code:
            "EXECUTOR_CAPABILITY_ALREADY_REGISTERED",
        }
      );
    }

    const record = {
      capability,

      domain:
        definition.domain,

      description:
        definition.description ||
        "",

      enabled:
        definition.enabled !==
        false,

      riskLevel:
        definition.riskLevel ||
        "medium",

      requiresAuthorization:
        definition.requiresAuthorization !==
        false,

      handler:
        definition.handler,

      validate:
        typeof definition.validate ===
        "function"
          ? definition.validate
          : null,

      metadata:
        definition.metadata &&
        typeof definition.metadata ===
          "object"
          ? {
              ...definition.metadata,
            }
          : {},
    };

    this.capabilities
      .set(
        capability,
        record
      );

    return this.describe(
      capability
    );
  }

  // ==========================================================================
  // UNREGISTER
  // ==========================================================================

  unregister(
    capability
  ) {
    return this.capabilities
      .delete(
        capability
      );
  }

  // ==========================================================================
  // ENABLE / DISABLE
  // ==========================================================================

  enable(
    capability
  ) {
    const record =
      this.requireCapability(
        capability
      );

    record.enabled =
      true;

    return this.describe(
      capability
    );
  }

  disable(
    capability
  ) {
    const record =
      this.requireCapability(
        capability
      );

    record.enabled =
      false;

    return this.describe(
      capability
    );
  }

  // ==========================================================================
  // LOOKUP
  // ==========================================================================

  has(
    capability
  ) {
    return this.capabilities
      .has(
        capability
      );
  }

  get(
    capability
  ) {
    return this.capabilities
      .get(
        capability
      ) ||
      null;
  }

  requireCapability(
    capability
  ) {
    if (
      !capability ||
      typeof capability !==
        "string"
    ) {
      throw Object.assign(
        new Error(
          "Executor capability is required"
        ),
        {
          code:
            EXECUTOR_ERROR
              .CAPABILITY_REQUIRED,
        }
      );
    }

    const record =
      this.get(
        capability
      );

    if (
      !record
    ) {
      throw Object.assign(
        new Error(
          `Executor capability is not registered: ${capability}`
        ),
        {
          code:
            EXECUTOR_ERROR
              .CAPABILITY_NOT_REGISTERED,

          capability,
        }
      );
    }

    return record;
  }

  // ==========================================================================
  // DESCRIBE
  // ==========================================================================

  describe(
    capability
  ) {
    const record =
      this.requireCapability(
        capability
      );

    return {
      capability:
        record.capability,

      domain:
        record.domain,

      description:
        record.description,

      enabled:
        record.enabled,

      riskLevel:
        record.riskLevel,

      requiresAuthorization:
        record
          .requiresAuthorization,

      metadata: {
        ...record.metadata,
      },
    };
  }

  list() {
    return Array.from(
      this.capabilities
        .values()
    )
      .map(
        (
          record
        ) => ({
          capability:
            record.capability,

          domain:
            record.domain,

          description:
            record.description,

          enabled:
            record.enabled,

          riskLevel:
            record.riskLevel,

          requiresAuthorization:
            record
              .requiresAuthorization,

          metadata: {
            ...record.metadata,
          },
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          a.capability
            .localeCompare(
              b.capability
            )
      );
  }

  // ==========================================================================
  // EXECUTE CAPABILITY
  // ==========================================================================

  async execute(
    capability,
    input = {},
    context = {}
  ) {
    const record =
      this.requireCapability(
        capability
      );

    if (
      record.enabled !==
      true
    ) {
      throw Object.assign(
        new Error(
          `Executor capability is disabled: ${capability}`
        ),
        {
          code:
            EXECUTOR_ERROR
              .CAPABILITY_DISABLED,

          capability,
        }
      );
    }

    /*
     * Authorization must come from the trusted Step Execution Engine.
     *
     * A playbook parameter itself must never be able to manufacture this.
     */
    if (
      record
        .requiresAuthorization ===
        true &&
      context
        .authorizationVerified !==
        true
    ) {
      throw Object.assign(
        new Error(
          `Executor capability requires verified authorization: ${capability}`
        ),
        {
          code:
            EXECUTOR_ERROR
              .UNSAFE_INPUT,

          capability,
        }
      );
    }

    if (
      record.validate
    ) {
      const validation =
        await record
          .validate(
            input,
            context
          );

      if (
        validation ===
        false ||
        validation
          ?.valid ===
          false
      ) {
        throw Object.assign(
          new Error(
            validation
              ?.reason ||
            `Invalid executor input for ${capability}`
          ),
          {
            code:
              EXECUTOR_ERROR
                .INVALID_INPUT,

            capability,
          }
        );
      }
    }

    const startedAt =
      new Date();

    try {
      const output =
        await record
          .handler(
            input,
            context
          );

      const completedAt =
        new Date();

      return createExecutorResult({
        capability,

        status:
          EXECUTOR_RESULT_STATUS
            .SUCCEEDED,

        success:
          true,

        changed:
          output
            ?.changed ===
            true,

        output:
          output ||
          null,

        startedAt,

        completedAt,

        durationMs:
          Math.max(
            0,
            completedAt -
            startedAt
          ),

        metadata: {
          domain:
            record.domain,

          riskLevel:
            record.riskLevel,
        },
      });
    } catch (
      error
    ) {
      const completedAt =
        new Date();

      return createExecutorResult({
        capability,

        status:
          EXECUTOR_RESULT_STATUS
            .FAILED,

        success:
          false,

        changed:
          false,

        error: {
          code:
            error.code ||
            EXECUTOR_ERROR
              .EXECUTION_FAILED,

          message:
            String(
              error.message ||
              "Executor capability failed"
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

        metadata: {
          domain:
            record.domain,

          riskLevel:
            record.riskLevel,
        },
      });
    }
  }

  // ==========================================================================
  // DEFINITION VALIDATION
  // ==========================================================================

  assertDefinition(
    definition
  ) {
    if (
      !definition ||
      typeof definition !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Executor definition is required"
        ),
        {
          code:
            "EXECUTOR_DEFINITION_REQUIRED",
        }
      );
    }

    if (
      !definition.capability ||
      typeof definition
        .capability !==
        "string"
    ) {
      throw Object.assign(
        new Error(
          "Executor definition requires capability"
        ),
        {
          code:
            EXECUTOR_ERROR
              .CAPABILITY_REQUIRED,
        }
      );
    }

    /*
     * Force namespace.action format:
     *
     * kubernetes.restartDeployment
     * docker.restartContainer
     */
    if (
      !/^[a-z][a-z0-9_-]*\.[A-Za-z][A-Za-z0-9_-]*$/
        .test(
          definition
            .capability
        )
    ) {
      throw Object.assign(
        new Error(
          `Invalid executor capability name: ${definition.capability}`
        ),
        {
          code:
            "EXECUTOR_CAPABILITY_INVALID",
        }
      );
    }

    if (
      !definition.domain ||
      typeof definition
        .domain !==
        "string"
    ) {
      throw Object.assign(
        new Error(
          "Executor definition requires domain"
        ),
        {
          code:
            "EXECUTOR_DOMAIN_REQUIRED",
        }
      );
    }

    if (
      typeof definition
        .handler !==
      "function"
    ) {
      throw Object.assign(
        new Error(
          "Executor definition requires handler"
        ),
        {
          code:
            "EXECUTOR_HANDLER_REQUIRED",
        }
      );
    }
  }
}

module.exports =
  new ExecutorRegistry();

module.exports
  .ExecutorRegistry =
  ExecutorRegistry;