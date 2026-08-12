"use strict";

const mongoose =
  require("mongoose");

const {
  LIFECYCLE_VALUES,
  STAGE_TYPE_VALUES,
  FAILURE_POLICY_VALUES,
  ROLLBACK_STRATEGY_VALUES,
  RISK_LEVEL_VALUES,
  APPROVAL_MODE_VALUES,
  OWNER_TYPE_VALUES,
  PLAYBOOK_LIFECYCLE,
} =
  require(
    "../constants/playbook"
  );

// ============================================================================
// SUB-SCHEMAS
// ============================================================================

const runbookRefSchema =
  new mongoose.Schema(
    {
      runbookId: {
        type:
          String,
        required:
          true,
      },

      versionConstraint: {
        type:
          String,
        default:
          null,
      },

      required: {
        type:
          Boolean,
        default:
          true,
      },

      parameterMappings: {
        type:
          mongoose.Schema.Types.Mixed,
        default:
          {},
      },

      conditions: {
        type:
          mongoose.Schema.Types.Mixed,
        default:
          {},
      },

      description:
        String,
    },
    {
      _id:
        false,
    }
  );

const stageSchema =
  new mongoose.Schema(
    {
      id: {
        type:
          String,
        required:
          true,
      },

      order: {
        type:
          Number,
        required:
          true,
      },

      name: {
        type:
          String,
        required:
          true,
      },

      type: {
        type:
          String,
        enum:
          STAGE_TYPE_VALUES,
        required:
          true,
      },

      description:
        String,

      conditions: {
        type:
          mongoose.Schema.Types.Mixed,
        default:
          {},
      },

      runbooks: [
        runbookRefSchema,
      ],

      failurePolicy: {
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

// ============================================================================
// ROOT SCHEMA
// ============================================================================

const playbookSchema =
  new mongoose.Schema(
    {
      // ---------------------------------------------------------------------
      // Canonical identity
      // ---------------------------------------------------------------------

      apiVersion: {
        type:
          String,
        default:
          "aira.io/v1",
      },

      kind: {
        type:
          String,
        default:
          "Playbook",
      },

      playbookId: {
        type:
          String,
        required:
          true,
        trim:
          true,
      },

      semver: {
        type:
          String,
        required:
          true,
        trim:
          true,
      },

      name: {
        type:
          String,
        required:
          true,
      },

      description:
        String,

      category:
        String,

      lifecycle: {
        type:
          String,
        enum:
          LIFECYCLE_VALUES,
        default:
          PLAYBOOK_LIFECYCLE
            .DRAFT,
      },

      // ---------------------------------------------------------------------
      // Ownership
      // ---------------------------------------------------------------------

      tenantId: {
        type:
          String,
        trim:
          true,
        lowercase:
          true,
        default:
          null,
      },

      /**
       * null for system-owned global playbooks.
       */
      organizationId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Organization",
        default:
          null,
        index:
          true,
      },

      /**
       * null for system-owned global playbooks.
       */
      environmentId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Environment",
        default:
          null,
        index:
          true,
      },

      owner: {
        ownerType: {
          type:
            String,
          enum:
            OWNER_TYPE_VALUES,
          default:
            "system",
        },

        name:
          String,

        team:
          String,
      },

      // ---------------------------------------------------------------------
      // Incident matching
      //
      // IMPORTANT:
      // incident.environments describes applicability.
      // environmentId describes ownership.
      // ---------------------------------------------------------------------

      incident: {
        types: [
          {
            type:
              String,
          },
        ],

        severities: [
          {
            type:
              String,
          },
        ],

        providers: [
          {
            type:
              String,
          },
        ],

        environments: [
          {
            type:
              String,
          },
        ],

        serviceTypes: [
          {
            type:
              String,
          },
        ],
      },

      // ---------------------------------------------------------------------
      // Triggers
      // ---------------------------------------------------------------------

      triggers: {
        all: {
          type:
            mongoose.Schema.Types.Mixed,
          default:
            [],
        },

        any: {
          type:
            mongoose.Schema.Types.Mixed,
          default:
            [],
        },

        none: {
          type:
            mongoose.Schema.Types.Mixed,
          default:
            [],
        },
      },

      requiredEvidence: [
        {
          type:
            String,
        },
      ],

      conditions: {
        minimumConfidence: {
          type:
            Number,
          min:
            0,
          max:
            1,
          default:
            0.7,
        },

        requiredSignals: [
          {
            type:
              String,
          },
        ],

        safetyConditions:
          mongoose.Schema.Types.Mixed,
      },

      risk: {
        level: {
          type:
            String,
          enum:
            RISK_LEVEL_VALUES,
        },

        blastRadius:
          String,
      },

      policy: {
        required: {
          type:
            Boolean,
          default:
            false,
        },

        constraints:
          mongoose.Schema.Types.Mixed,
      },

      approval: {
        mode: {
          type:
            String,
          enum:
            APPROVAL_MODE_VALUES,
          default:
            "AUTOMATIC",
        },

        conditions:
          mongoose.Schema.Types.Mixed,
      },

      // ---------------------------------------------------------------------
      // Orchestration
      // ---------------------------------------------------------------------

      stages: [
        stageSchema,
      ],

      rollback: {
        strategy: {
          type:
            String,
          enum:
            ROLLBACK_STRATEGY_VALUES,
          default:
            "NONE",
        },

        maxAttempts: {
          type:
            Number,
          default:
            1,
        },

        stages: [
          {
            type:
              String,
          },
        ],
      },

      escalation: {
        maxRecoveryAttempts: {
          type:
            Number,
          default:
            3,
        },

        condition:
          String,

        escalateTo:
          String,

        notifyChannels: [
          {
            type:
              String,
          },
        ],
      },

      outcome: {
        captureLearning: {
          type:
            Boolean,
          default:
            false,
        },

        updateIncidentMemory: {
          type:
            Boolean,
          default:
            false,
        },

        successMetrics: [
          {
            type:
              String,
          },
        ],
      },

      checksum:
        String,

      immutable: {
        type:
          Boolean,
        default:
          false,
      },

      tags: [
        {
          type:
            String,
        },
      ],
    },
    {
      timestamps:
        true,

      strict:
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

  if (
    !document.tenantId
  ) {
    return new Error(
      "Tenant-owned playbook requires tenantId"
    );
  }

  if (
    !document.organizationId
  ) {
    return new Error(
      "Tenant-owned playbook requires organizationId"
    );
  }

  if (
    !document.environmentId
  ) {
    return new Error(
      "Tenant-owned playbook requires environmentId"
    );
  }

  return null;
}

// ============================================================================
// STAGE VALIDATION
// ============================================================================

function validateStageIds(
  stages
) {
  if (
    !Array.isArray(
      stages
    )
  ) {
    return null;
  }

  const ids =
    stages
      .map(
        (stage) =>
          stage.id
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
      return new Error(
        `Duplicate playbook stage id: ${id}`
      );
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

playbookSchema.pre(
  "save",
  function beforeSave(
    next
  ) {
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

    const stageError =
      validateStageIds(
        this.stages
      );

    if (
      stageError
    ) {
      return next(
        stageError
      );
    }

    return next();
  }
);

// ============================================================================
// INDEXES
// ============================================================================

/**
 * Global reusable system playbook version.
 */
playbookSchema.index(
  {
    playbookId:
      1,

    semver:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_system_playbook_version",

    partialFilterExpression: {
      "owner.ownerType":
        "system",

      playbookId: {
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
 * Tenant-owned version uniqueness.
 *
 * Same logical playbook/version may exist separately
 * in Production and Staging.
 */
playbookSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    playbookId:
      1,

    semver:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_tenant_playbook_version_per_environment",

    partialFilterExpression: {
      organizationId: {
        $type:
          "objectId",
      },

      environmentId: {
        $type:
          "objectId",
      },

      playbookId: {
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
 * Environment catalogue.
 */
playbookSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  lifecycle:
    1,
});

/**
 * Incident-type matching.
 */
playbookSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  "incident.types":
    1,

  lifecycle:
    1,
});

/**
 * Severity matching.
 */
playbookSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  "incident.severities":
    1,

  lifecycle:
    1,
});

/**
 * Provider matching.
 */
playbookSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  "incident.providers":
    1,

  lifecycle:
    1,
});

/**
 * Tag search.
 */
playbookSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  tags:
    1,
});

// ============================================================================
// MODEL
// ============================================================================

const Playbook =
  mongoose.model(
    "Playbook",
    playbookSchema
  );

Playbook.validateOwnership =
  validateOwnership;

Playbook.validateStageIds =
  validateStageIds;

Playbook.isSystemOwned =
  isSystemOwned;

module.exports =
  Playbook;