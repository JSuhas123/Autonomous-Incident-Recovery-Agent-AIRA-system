"use strict";

/**
 * AIRA Base Agent
 *
 * Phase 12.3
 *
 * Every intelligence agent extends this class and returns the same canonical
 * AgentResult<T> envelope.
 *
 * SAFETY INVARIANTS:
 *
 * - execute() must return a canonical AgentResult
 * - agents cannot grant infrastructure execution authority
 * - confidence must be explicit
 * - missing evidence must be explicit
 * - assumptions must be visible
 * - failures must not silently become SUCCESS
 * - infrastructure mutation is never exposed through BaseAgent
 */

const {
  AGENT_STATUS,
  createAgentExecutionRecord,
} =
  require(
    "../contracts/agentContracts"
  );

class BaseAgent {
  /**
   * @param {string} name
   * @param {string} version
   */
  constructor(
    name,
    version
  ) {
    if (
      !name
    ) {
      throw new TypeError(
        "BaseAgent name is required"
      );
    }

    if (
      !version
    ) {
      throw new TypeError(
        "BaseAgent version is required"
      );
    }

    this._name =
      name;

    this._version =
      version;
  }

  get name() {
    return this._name;
  }

  get version() {
    return this._version;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate canonical AgentContext before execution.
   *
   * Individual agents may extend this validation.
   */
  validateInput(
    context
  ) {
    const errors =
      [];

    if (
      !context
    ) {
      errors.push(
        "context is required"
      );

      return {
        valid:
          false,

        errors,
      };
    }

    if (
      !context
        .incidentId
    ) {
      errors.push(
        "context.incidentId is required"
      );
    }

    if (
      !context
        .tenantId
    ) {
      errors.push(
        "context.tenantId is required"
      );
    }

    /*
     * Phase 12 canonical contexts should contain complete scope.
     *
     * Compatibility contexts may temporarily omit organization/environment,
     * so do not make them mandatory here until all legacy tests/routes migrate.
     */
    if (
      (
        context
          .organizationId ||
        context
          .environmentId
      ) &&
      (
        !context
          .organizationId ||
        !context
          .environmentId
      )
    ) {
      errors.push(
        "context organization/environment scope is incomplete"
      );
    }

    return {
      valid:
        errors.length ===
        0,

      errors,
    };
  }

  /**
   * Implement in concrete agents.
   */
  async execute(
    context,
    dependencies = {}
  ) {
    void context;
    void dependencies;

    throw new Error(
      `${this._name}.execute() must be implemented`
    );
  }

  /**
   * Validate canonical AgentResult.
   */
  validateOutput(
    record
  ) {
    const errors =
      [];

    if (
      !record
    ) {
      errors.push(
        "result is required"
      );

      return {
        valid:
          false,

        errors,
      };
    }

    if (
      !record
        .schemaVersion
    ) {
      errors.push(
        "result.schemaVersion is required"
      );
    }

    if (
      record.agent !==
      this._name
    ) {
      errors.push(
        `result.agent must be ${this._name}`
      );
    }

    if (
      record.version !==
      this._version
    ) {
      errors.push(
        `result.version must be ${this._version}`
      );
    }

    if (
      !record.status
    ) {
      errors.push(
        "result.status is required"
      );
    }

    if (
      !record.startedAt
    ) {
      errors.push(
        "result.startedAt is required"
      );
    }

    if (
      !record.completedAt
    ) {
      errors.push(
        "result.completedAt is required"
      );
    }

    if (
      !Array.isArray(
        record
          .evidenceUsed
      )
    ) {
      errors.push(
        "result.evidenceUsed must be an array"
      );
    }

    if (
      !Array.isArray(
        record
          .evidenceMissing
      )
    ) {
      errors.push(
        "result.evidenceMissing must be an array"
      );
    }

    if (
      !Array.isArray(
        record
          .assumptions
      )
    ) {
      errors.push(
        "result.assumptions must be an array"
      );
    }

    if (
      !Array.isArray(
        record
          .warnings
      )
    ) {
      errors.push(
        "result.warnings must be an array"
      );
    }

    if (
      !record
        .modelMetadata ||
      typeof record
        .modelMetadata !==
        "object"
    ) {
      errors.push(
        "result.modelMetadata is required"
      );
    }

    return {
      valid:
        errors.length ===
        0,

      errors,
    };
  }

  // ==========================================================================
  // CAPABILITIES
  // ==========================================================================

  getCapabilities() {
  return {
    name:
      this._name,

    version:
      this._version,

    reads:
      [],

    writes:
      [],

    requiresLLM:
      false,

    /*
     * Phase 12.11 deny-by-default authority flags.
     */
    infrastructureMutation:
      false,

    executionAuthorization:
      false,

    approvalAuthority:
      false,

    incidentResolution:
      false,

    policyMutation:
      false,

    playbookPublication:
      false,

    secretValueAccess:
      false,
  };
}

  // ==========================================================================
  // CANONICAL RESULT HELPERS
  // ==========================================================================

  _success(
    startedAt,
    result,
    opts = {}
  ) {
    return this._buildResult(
      AGENT_STATUS
        .SUCCESS,

      startedAt,

      result,

      opts
    );
  }

  _partial(
    startedAt,
    result,
    opts = {}
  ) {
    return this._buildResult(
      AGENT_STATUS
        .PARTIAL,

      startedAt,

      result,

      opts
    );
  }

  /**
   * Agent ran correctly, but evidence is not strong enough for a safe
   * conclusion.
   *
   * This is not equivalent to FAILED.
   */
  _insufficientEvidence(
    startedAt,
    result = null,
    opts = {}
  ) {
    return this._buildResult(
      AGENT_STATUS
        .INSUFFICIENT_EVIDENCE,

      startedAt,

      result,

      {
        ...opts,

        confidence:
          opts.confidence ??
          0,
      }
    );
  }

  _manual(
    startedAt,
    reason,
    opts = {}
  ) {
    return this._buildResult(
      AGENT_STATUS
        .MANUAL_REQUIRED,

      startedAt,

      {
        ...(
          opts.result &&
          typeof opts.result ===
            "object"
            ? opts.result
            : {}
        ),

        manualReason:
          reason,
      },

      {
        ...opts,

        confidence:
          opts.confidence ??
          0,

        error:
          null,
      }
    );
  }

  _fail(
    startedAt,
    error,
    opts = {}
  ) {
    const normalizedError =
      error instanceof
        Error
        ? error.message
        : String(
            error ||
            "Agent execution failed"
          );

    return this._buildResult(
      AGENT_STATUS
        .FAILED,

      startedAt,

      opts.result ??
      null,

      {
        ...opts,

        confidence:
          opts.confidence ??
          0,

        error:
          normalizedError,
      }
    );
  }

  _skipped(
    startedAt,
    reason,
    opts = {}
  ) {
    return this._buildResult(
      AGENT_STATUS
        .SKIPPED,

      startedAt,

      {
        ...(
          opts.result &&
          typeof opts.result ===
            "object"
            ? opts.result
            : {}
        ),

        skipReason:
          reason,
      },

      {
        ...opts,

        confidence:
          opts.confidence ??
          null,
      }
    );
  }

  // ==========================================================================
  // INTERNAL RESULT BUILDER
  // ==========================================================================

  _buildResult(
    status,
    startedAt,
    result,
    opts = {}
  ) {
    const completedAt =
      new Date();

    const suppliedMetadata =
      (
        opts.modelMetadata &&
        typeof opts
          .modelMetadata ===
          "object"
      )
        ? opts.modelMetadata
        : {};

    return createAgentExecutionRecord({
      agent:
        this._name,

      version:
        this._version,

      status,

      startedAt:
        startedAt instanceof
          Date
          ? startedAt
              .toISOString()
          : startedAt,

      completedAt:
        completedAt
          .toISOString(),

      confidence:
        opts.confidence ??
        null,

      result,

      evidenceUsed:
        opts.evidenceUsed ||
        [],

      evidenceMissing:
        opts.evidenceMissing ||
        [],

      assumptions:
        opts.assumptions ||
        [],

      warnings:
        opts.warnings ||
        [],

      nextRecommendedStage:
        opts.nextRecommendedStage ||
        null,

      modelMetadata: {
        provider:
          suppliedMetadata
            .provider ??
          opts.provider ??
          null,

        model:
          suppliedMetadata
            .model ??
          opts.model ??
          null,

        inputTokens:
          suppliedMetadata
            .inputTokens ??
          opts.inputTokens ??
          null,

        outputTokens:
          suppliedMetadata
            .outputTokens ??
          opts.outputTokens ??
          null,

        totalTokens:
          suppliedMetadata
            .totalTokens ??
          opts.totalTokens ??
          null,

        latencyMs:
          suppliedMetadata
            .latencyMs ??
          opts.latencyMs ??
          null,

        estimatedCost:
          suppliedMetadata
            .estimatedCost ??
          opts.estimatedCost ??
          null,
      },

      /*
       * Legacy aliases are supplied too so older persistence/query code keeps
       * working during migration.
       */
      provider:
        suppliedMetadata
          .provider ??
        opts.provider ??
        null,

      model:
        suppliedMetadata
          .model ??
        opts.model ??
        null,

      tokenEstimate:
        opts.tokenEstimate ??
        suppliedMetadata
          .totalTokens ??
        null,

      fallbackUsed:
        Boolean(
          opts.fallbackUsed
        ),

      error:
        opts.error ??
        null,

      metadata:
        opts.metadata ||
        {},
    });
  }
}

module.exports = {
  BaseAgent,
};