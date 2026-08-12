"use strict";

const mongoose =
  require("mongoose");

const {
  RUNBOOK_API_VERSION,
  RUNBOOK_KIND,
  LIFECYCLE_VALUES,
  STEP_TYPE_VALUES,
  FAILURE_POLICY_VALUES,
  RISK_LEVEL_VALUES,
  PARAM_TYPE_VALUES,
  VERIFICATION_STRATEGY_VALUES,
  ROLLBACK_STRATEGY_VALUES,
  OWNER_TYPE_VALUES,
  SEMVER_REGEX,
  STEP_ID_REGEX,
  RUNBOOK_LIFECYCLE,
  RUNBOOK_PARAM_TYPE,
} =
  require(
    "../constants/runbook"
  );

// ============================================================================
// SUB-SCHEMAS
// ============================================================================

const retrySchema =
  new mongoose.Schema(
    {
      maxAttempts: {
        type:
          Number,
        default:
          3,
        min:
          1,
        max:
          10,
      },

      delaySeconds: {
        type:
          Number,
        default:
          1,
        min:
          0,
      },

      backoffMultiplier: {
        type:
          Number,
        default:
          1.5,
        min:
          1,
      },

      maxDelaySeconds: {
        type:
          Number,
        min:
          0,
      },
    },
    {
      _id:
        false,
    }
  );

const preconditionSchema =
  new mongoose.Schema(
    {
      id: {
        type:
          String,
        match:
          STEP_ID_REGEX,
      },

      description:
        String,

      /**
       * Registered deterministic precondition handler.
       *
       * NOT arbitrary shell execution.
       */
      check: {
        type:
          String,
        required:
          true,
      },

      params:
        mongoose.Schema.Types.Mixed,

      onFailure: {
        type:
          String,
        enum:
          FAILURE_POLICY_VALUES,
        default:
          "STOP",
      },
    },
    {
      _id:
        false,
    }
  );

const stepRollbackSchema =
  new mongoose.Schema(
    {
      action: {
        type:
          String,
        required:
          true,
      },

      params:
        mongoose.Schema.Types.Mixed,

      timeoutSeconds: {
        type:
          Number,
        default:
          30,
      },
    },
    {
      _id:
        false,
    }
  );

const stepSchema =
  new mongoose.Schema(
    {
      id: {
        type:
          String,

        match: [
          STEP_ID_REGEX,
          "Step id must be lowercase alphanumeric with hyphens",
        ],
      },

      order: {
        type:
          Number,
        min:
          1,
      },

      name: {
        type:
          String,
        required:
          true,
      },

      description:
        String,

      type: {
        type:
          String,
        enum:
          STEP_TYPE_VALUES,
        required:
          true,
      },

      /**
       * Registered deterministic action identifier.
       *
       * NOT an arbitrary shell command.
       */
      action: {
        type:
          String,
        required:
          true,
      },

      params:
        mongoose.Schema.Types.Mixed,

      timeoutSeconds: {
        type:
          Number,
        default:
          30,
        min:
          1,
      },

      retry: {
        type:
          retrySchema,
        default:
          () => ({}),
      },

      requiresConfirmation: {
        type:
          Boolean,
        default:
          false,
      },

      preconditions: [
        preconditionSchema,
      ],

      failurePolicy: {
        type:
          String,
        enum:
          FAILURE_POLICY_VALUES,
        default:
          "STOP",
      },

      captureOutput: {
        type:
          Boolean,
        default:
          false,
      },

      reversible: {
        type:
          Boolean,
        default:
          false,
      },

      stepRollback:
        stepRollbackSchema,

      // ---------------------------------------------------------------------
      // Legacy compatibility
      // ---------------------------------------------------------------------

      /** @deprecated use order */
      stepNumber:
        Number,

      /** @deprecated use timeoutSeconds */
      timeout:
        Number,

      /** @deprecated use retry.maxAttempts */
      retryPolicy: {
        maxRetries:
          Number,

        backoffMs:
          Number,
      },

      /** @deprecated use failurePolicy */
      onSuccess:
        String,

      /** @deprecated use failurePolicy */
      onFailure:
        String,
    },
    {
      _id:
        false,
    }
  );

const parameterSchema =
  new mongoose.Schema(
    {
      name: {
        type:
          String,
        required:
          true,
      },

      description:
        String,

      type: {
        type:
          String,
        enum:
          PARAM_TYPE_VALUES,
        required:
          true,
      },

      required: {
        type:
          Boolean,
        default:
          false,
      },

      /**
       * Raw secret values must never be stored here.
       */
      default:
        mongoose.Schema.Types.Mixed,

      allowedValues: [
        mongoose.Schema.Types.Mixed,
      ],

      min:
        Number,

      max:
        Number,

      sensitive: {
        type:
          Boolean,
        default:
          false,
      },

      sourceHints: [
        String,
      ],
    },
    {
      _id:
        false,
    }
  );

parameterSchema
  .path("default")
  .validate(
    function validateSecretDefault(
      value
    ) {
      if (
        this.type ===
          RUNBOOK_PARAM_TYPE
            .SECRET_REFERENCE &&
        value != null
      ) {
        return false;
      }

      return true;
    },

    "secret-reference parameters must not have a default value — store the reference key only"
  );

const verificationCheckSchema =
  new mongoose.Schema(
    {
      id:
        String,

      type: {
        type:
          String,

        enum: [
          "error_rate_below",
          "latency_below",
          "service_healthy",
          "pod_running",
          "custom",
        ],
      },

      description:
        String,

      params:
        mongoose.Schema.Types.Mixed,

      timeoutSeconds: {
        type:
          Number,
        default:
          30,
      },
    },
    {
      _id:
        false,
    }
  );

const verificationSchema =
  new mongoose.Schema(
    {
      strategy: {
        type:
          String,
        enum:
          VERIFICATION_STRATEGY_VALUES,
        default:
          "ALL",
      },

      minimumSuccessfulChecks: {
        type:
          Number,
        min:
          1,
      },

      timeoutSeconds: {
        type:
          Number,
        default:
          120,
      },

      intervalSeconds: {
        type:
          Number,
        default:
          10,
      },

      checks: [
        verificationCheckSchema,
      ],
    },
    {
      _id:
        false,
    }
  );

const rollbackConfigSchema =
  new mongoose.Schema(
    {
      enabled: {
        type:
          Boolean,
        default:
          false,
      },

      strategy: {
        type:
          String,
        enum:
          ROLLBACK_STRATEGY_VALUES,
        default:
          "NONE",
      },

      steps: [
        {
          id:
            String,

          name: {
            type:
              String,
            required:
              true,
          },

          order:
            Number,

          type: {
            type:
              String,
            enum:
              STEP_TYPE_VALUES,
          },

          action: {
            type:
              String,
            required:
              true,
          },

          params:
            mongoose.Schema.Types.Mixed,

          timeoutSeconds: {
            type:
              Number,
            default:
              30,
          },
        },
      ],

      verification:
        verificationSchema,
    },
    {
      _id:
        false,
    }
  );

const notificationsSchema =
  new mongoose.Schema(
    {
      onStart: [
        String,
      ],

      onSuccess: [
        String,
      ],

      onFailure: [
        String,
      ],

      onRollback: [
        String,
      ],

      onEscalation: [
        String,
      ],
    },
    {
      _id:
        false,
    }
  );

const auditConfigSchema =
  new mongoose.Schema(
    {
      recordInputs: {
        type:
          Boolean,
        default:
          true,
      },

      recordOutputs: {
        type:
          Boolean,
        default:
          true,
      },

      recordEvidence: {
        type:
          Boolean,
        default:
          true,
      },

      redactSensitiveValues: {
        type:
          Boolean,
        default:
          true,
      },
    },
    {
      _id:
        false,
    }
  );

// ============================================================================
// ROOT SCHEMA
// ============================================================================

const runbookSchema =
  new mongoose.Schema(
    {
      // ---------------------------------------------------------------------
      // Canonical envelope
      // ---------------------------------------------------------------------

      apiVersion: {
        type:
          String,
        default:
          RUNBOOK_API_VERSION,
        enum: [
          RUNBOOK_API_VERSION,
        ],
      },

      kind: {
        type:
          String,
        default:
          RUNBOOK_KIND,
        enum: [
          RUNBOOK_KIND,
        ],
      },

      // ---------------------------------------------------------------------
      // Ownership
      // ---------------------------------------------------------------------

      /**
       * Legacy tenant slug/key.
       *
       * Required for tenant-owned runbooks.
       * System runbooks may omit tenant ownership.
       */
      tenantId: {
  type: String,
  trim: true,
  lowercase: true,
  default: null,

  required: function requiredTenantId() {
    return (
      this.owner?.ownerType !== "system"
    );
  },
},

organizationId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Organization",
  default: null,
  index: true,

  required: function requiredOrganizationId() {
    return (
      this.owner?.ownerType === "tenant"
    );
  },
},

environmentId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Environment",
  default: null,
  index: true,

  required: function requiredEnvironmentId() {
    return (
      this.owner?.ownerType === "tenant"
    );
  },
},

owner: {
  ownerType: {
    type: String,
    enum: OWNER_TYPE_VALUES,

    /*
     * IMPORTANT:
     * Do not default unspecified legacy definitions to "system".
     *
     * Explicit system runbooks:
     *   owner.ownerType = "system"
     *
     * Legacy definitions without ownerType must still provide tenantId.
     */
    default: undefined,
  },

  name: String,
  contact: String,
},
      // ---------------------------------------------------------------------
      // Canonical identity
      // ---------------------------------------------------------------------

      /**
       * Stable logical identifier.
       *
       * Example:
       * RB-K8S-POD-RESTART
       */
      runbookId: {
        type:
          String,
        trim:
          true,
        sparse:
          true,
      },

      semver: {
        type:
          String,

        validate: {
          validator:
            (value) =>
              !value ||
              SEMVER_REGEX.test(
                value
              ),

          message:
            "version must be a valid semantic version (e.g. 1.0.0)",
        },
      },

      lifecycle: {
        type:
          String,
        enum:
          LIFECYCLE_VALUES,
        default:
          RUNBOOK_LIFECYCLE
            .DRAFT,
      },

      category:
        String,

      tags: [
        String,
      ],

      // ---------------------------------------------------------------------
      // Applicability scope
      //
      // IMPORTANT:
      // scope.environments describes WHERE a runbook may be applicable.
      // environmentId describes WHO OWNS this runbook.
      //
      // They are intentionally different concepts.
      // ---------------------------------------------------------------------

      scope: {
        environments: [
          String,
        ],

        providers: [
          String,
        ],

        resourceTypes: [
          String,
        ],

        services: [
          String,
        ],
      },

      // ---------------------------------------------------------------------
      // Risk
      // ---------------------------------------------------------------------

      risk: {
        level: {
          type:
            String,
          enum:
            RISK_LEVEL_VALUES,
          default:
            "MEDIUM",
        },

        blastRadius:
          String,

        reversible: {
          type:
            Boolean,
          default:
            false,
        },
      },

      // ---------------------------------------------------------------------
      // Parameters / execution definition
      // ---------------------------------------------------------------------

      parameters: [
        parameterSchema,
      ],

      preconditions: [
        preconditionSchema,
      ],

      steps: [
        stepSchema,
      ],

      verification:
        verificationSchema,

      rollbackConfig:
        rollbackConfigSchema,

      notifications:
        notificationsSchema,

      auditConfig: {
        type:
          auditConfigSchema,

        default:
          () => ({}),
      },

      // ---------------------------------------------------------------------
      // Denormalized execution summary
      // ---------------------------------------------------------------------

      lastExecuted:
        Date,

      totalExecutions: {
        type:
          Number,
        default:
          0,
      },

      successfulExecutions: {
        type:
          Number,
        default:
          0,
      },

      successRate: {
        type:
          Number,
        default:
          0,
      },

      // =====================================================================
      // LEGACY FIELDS
      // =====================================================================

      name: {
        type:
          String,
        required:
          true,
      },

      description:
        String,

      /** @deprecated */
      incidentType:
        String,

      /** @deprecated */
      serviceId:
        String,

      /** @deprecated lifecycle is authoritative */
      enabled: {
        type:
          Boolean,
        default:
          true,
      },

      /** @deprecated lifecycle is authoritative */
      active: {
        type:
          Boolean,
        default:
          true,
      },

      autoTrigger: {
        type:
          Boolean,
        default:
          false,
      },

      triggerConditions: {
        minConfidence: {
          type:
            Number,
          default:
            80,
        },

        severityLevels: [
          String,
        ],

        incidentTypes: [
          String,
        ],
      },

      /** @deprecated use rollbackConfig */
      rollback: [
        {
          stepNumber:
            Number,

          name:
            String,

          type:
            String,

          action:
            String,

          params:
            mongoose.Schema.Types.Mixed,

          timeout: {
            type:
              Number,
            default:
              30000,
          },
        },
      ],

      /** @deprecated use verification.checks */
      successCriteria: [
        {
          type: {
            type:
              String,

            enum: [
              "error_rate_below",
              "latency_below",
              "service_healthy",
              "custom",
            ],
          },

          param:
            mongoose.Schema.Types.Mixed,
        },
      ],

      /** @deprecated execution history belongs in RunbookExecution */
      executionHistory: [
        {
          executionId:
            String,

          correlationId:
            String,

          startedAt:
            Date,

          completedAt:
            Date,

          status:
            String,

          successCriteriaMet:
            Boolean,

          rollbackExecuted:
            Boolean,

          duration:
            Number,

          logs: [
            String,
          ],

          executionErrors: [
            String,
          ],
        },
      ],

      /** @deprecated use semver */
      version: {
        type:
          Number,
        default:
          1,
      },

      createdBy:
        String,

      lastModifiedBy:
        String,
    },
    {
      timestamps:
        true,

      versionKey:
        false,
    }
  );

// ============================================================================
// OWNERSHIP VALIDATION
// ============================================================================

function isSystemOwned(
  document
) {
  return (
    document?.owner
      ?.ownerType ===
    "system"
  );
}

function validateOwnership(
  document
) {
  /**
   * System runbooks are global templates.
   *
   * They MUST NOT accidentally become tied to one
   * organization's environment.
   */
  if (
    isSystemOwned(
      document
    )
  ) {
    document.tenantId =
      null;

    document.organizationId =
      null;

    document.environmentId =
      null;

    return null;
  }

  /**
   * Tenant-owned definitions require all ownership fields.
   */
  if (
    !document.tenantId
  ) {
    return new Error(
      "Tenant-owned runbook requires tenantId"
    );
  }

  if (
    !document.organizationId
  ) {
    return new Error(
      "Tenant-owned runbook requires organizationId"
    );
  }

  if (
    !document.environmentId
  ) {
    return new Error(
      "Tenant-owned runbook requires environmentId"
    );
  }

  return null;
}

// ============================================================================
// LIFECYCLE
// ============================================================================

function normalizeRunbookLifecycle(
  document
) {
  if (
    document.lifecycle ===
    RUNBOOK_LIFECYCLE
      .DISABLED
  ) {
    document.enabled =
      false;

    document.active =
      false;
  } else if (
    document.lifecycle ===
    RUNBOOK_LIFECYCLE
      .ACTIVE
  ) {
    document.enabled =
      true;

    document.active =
      true;
  }
}

// ============================================================================
// STEP VALIDATION
// ============================================================================

function validateStepIds(
  steps
) {
  if (
    !Array.isArray(
      steps
    )
  ) {
    return null;
  }

  const ids =
    steps
      .map(
        (step) =>
          step.id
      )
      .filter(
        Boolean
      );

  const seen =
    new Set();

  for (
    const id
    of ids
  ) {
    if (
      seen.has(id)
    ) {
      const error =
        new mongoose.Error
          .ValidationError(
            null
          );

      error.message =
        `Duplicate runbook step id: ${id}`;

      return error;
    }

    seen.add(
      id
    );
  }

  return null;
}

// ============================================================================
// PRE-SAVE
// ============================================================================

runbookSchema.pre(
  "save",
  function beforeSave(
    next
  ) {
    normalizeRunbookLifecycle(
      this
    );

    const ownershipError =
      validateOwnership(
        this
      );

    if (
      ownershipError
    ) {
      return next(
        ownershipError
      );
    }

    const stepError =
      validateStepIds(
        this.steps
      );

    if (
      stepError
    ) {
      return next(
        stepError
      );
    }

    return next();
  }
);

// ============================================================================
// VIRTUAL / HELPERS
// ============================================================================

runbookSchema
  .virtual(
    "metadataVersion"
  )
  .get(
    function metadataVersion() {
      return (
        this.semver ||
        null
      );
    }
  );

runbookSchema.methods
  .getVersion =
  function getVersion() {
    return (
      this.semver ||
      null
    );
  };

// ============================================================================
// INDEXES
// ============================================================================

/**
 * System runbook logical/version uniqueness.
 *
 * Partial index prevents tenant definitions from colliding
 * with globally reusable templates.
 */
runbookSchema.index(
  {
    runbookId:
      1,

    semver:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_system_runbook_version",

    partialFilterExpression: {
      "owner.ownerType":
        "system",

      runbookId: {
        $type:
          "string",
      },

      semver: {
        $type:
          "string",
      },
    },
  }
);

/**
 * Tenant-owned runbook uniqueness.
 *
 * Production and Staging may intentionally contain the same
 * logical runbook/version without colliding.
 */
runbookSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    runbookId:
      1,

    semver:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_tenant_runbook_version_per_environment",

    partialFilterExpression: {
      organizationId: {
        $type:
          "objectId",
      },

      environmentId: {
        $type:
          "objectId",
      },

      runbookId: {
        $type:
          "string",
      },

      semver: {
        $type:
          "string",
      },
    },
  }
);

/**
 * Main tenant/environment catalogue.
 */
runbookSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  lifecycle:
    1,
});

/**
 * Service-scoped applicability.
 */
runbookSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  "scope.services":
    1,

  lifecycle:
    1,
});

/**
 * Auto-trigger selection.
 */
runbookSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  autoTrigger:
    1,

  lifecycle:
    1,
});

/**
 * Tag search.
 */
runbookSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  tags:
    1,
});

/**
 * Legacy incidentType compatibility.
 */
runbookSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  incidentType:
    1,
});

/**
 * Legacy serviceId compatibility.
 */
runbookSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  serviceId:
    1,

  enabled:
    1,
});

// ============================================================================
// MODEL
// ============================================================================

const Runbook =
  mongoose.model(
    "Runbook",
    runbookSchema
  );

Runbook.validateStepIds =
  validateStepIds;

Runbook.normalizeRunbookLifecycle =
  normalizeRunbookLifecycle;

Runbook.validateOwnership =
  validateOwnership;

Runbook.isSystemOwned =
  isSystemOwned;

Runbook.getCanonicalVersion =
  function getCanonicalVersion(
    document
  ) {
    return (
      document?.semver ||
      null
    );
  };

module.exports =
  Runbook;