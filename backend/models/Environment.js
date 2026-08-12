"use strict";

const mongoose = require("mongoose");

const environmentSettingsSchema =
  new mongoose.Schema(
    {
      /**
       * Whether autonomous execution is allowed in this
       * environment at all.
       *
       * Detailed autonomy rules still belong to the
       * Policy/Autonomy phase.
       */
      allowAutonomousExecution: {
        type: Boolean,
        default: false,
      },

      /**
       * Whether destructive actions always require
       * explicit approval in this environment.
       *
       * Policy rules can become more granular later.
       */
      requireApprovalForDestructiveActions: {
        type: Boolean,
        default: true,
      },

      /**
       * Optional operational timezone override.
       *
       * If absent, organization timezone is used.
       */
      timezone: {
        type: String,
        default: null,
        trim: true,
        maxlength: 100,
      },
    },
    {
      _id: false,
    }
  );

const environmentSchema =
  new mongoose.Schema(
    {
      organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        index: true,
      },

      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },

      slug: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 80,
        match: /^[a-z0-9_-]+$/,
      },

      type: {
        type: String,
        enum: [
          "development",
          "testing",
          "staging",
          "production",
          "custom",
        ],
        required: true,
        default: "custom",
      },

      criticality: {
        type: String,
        enum: [
          "low",
          "medium",
          "high",
          "critical",
        ],
        required: true,
        default: "medium",
      },

      status: {
        type: String,
        enum: [
          "active",
          "maintenance",
          "archived",
        ],
        default: "active",
      },

      description: {
        type: String,
        trim: true,
        maxlength: 500,
        default: "",
      },

      settings: {
        type: environmentSettingsSchema,
        default: () => ({}),
      },

      createdByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      maintenanceReason: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null,
      },

      maintenanceStartedAt: {
        type: Date,
        default: null,
      },

      archivedAt: {
        type: Date,
        default: null,
      },

      archivedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      archiveReason: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

/**
 * Environment slug must be unique inside one organization.
 */
environmentSchema.index(
  {
    organizationId: 1,
    slug: 1,
  },
  {
    unique: true,
  }
);

/**
 * Common tenant/status filtering.
 */
environmentSchema.index({
  organizationId: 1,
  status: 1,
});

/**
 * Common type-based filtering.
 */
environmentSchema.index({
  organizationId: 1,
  type: 1,
});

/**
 * Prevent more than one non-archived production environment
 * from existing inside the same organization.
 *
 * An organization may eventually have multiple production-like
 * regions/clusters, but those should belong under one logical
 * Production environment rather than becoming separate
 * production environments at this domain level.
 */
environmentSchema.index(
  {
    organizationId: 1,
    type: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      type: "production",
      status: {
        $in: [
          "active",
          "maintenance",
        ],
      },
    },
  }
);

/**
 * Keep production defaults conservative.
 */
environmentSchema.pre(
  "validate",
  function environmentSafetyDefaults(
    next
  ) {
    if (
      this.type ===
      "production"
    ) {
      if (
        !this.criticality ||
        this.criticality ===
          "low"
      ) {
        this.criticality =
          "critical";
      }

      if (
        !this.settings
      ) {
        this.settings = {};
      }

      if (
        this.isNew &&
        this.settings
          .allowAutonomousExecution ===
          undefined
      ) {
        this.settings
          .allowAutonomousExecution =
          false;
      }

      if (
        this.isNew &&
        this.settings
          .requireApprovalForDestructiveActions ===
          undefined
      ) {
        this.settings
          .requireApprovalForDestructiveActions =
          true;
      }
    }

    if (
      this.status ===
      "maintenance"
    ) {
      if (
        !this.maintenanceStartedAt
      ) {
        this.maintenanceStartedAt =
          new Date();
      }
    } else {
      this.maintenanceStartedAt =
        null;

      this.maintenanceReason =
        null;
    }

    if (
      this.status ===
      "archived"
    ) {
      if (!this.archivedAt) {
        this.archivedAt =
          new Date();
      }
    }

    next();
  }
);

module.exports =
  mongoose.model(
    "Environment",
    environmentSchema
  );