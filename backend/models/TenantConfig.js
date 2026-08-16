"use strict";

const mongoose =
  require(
    "mongoose"
  );


// ============================================================================
// API KEY
// ============================================================================

const apiKeySchema =
  new mongoose.Schema(
    {
      keyId: {
        type:
          String,

        required:
          true,
      },

      keyHash: {
        type:
          String,

        required:
          true,
      },

      secretHash: {
        type:
          String,

        required:
          true,
      },

      createdAt: {
        type:
          Date,

        default:
          Date.now,
      },

      rotationDeadline:
        Date,

      scopes: {
        type: [
          String,
        ],

        default: [
          "read:*",
          "write:*",
        ],
      },

      status: {
        type:
          String,

        enum: [
          "active",
          "rotating",
          "retired",
        ],

        default:
          "active",
      },

      active: {
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
// ADMIN
// ============================================================================

const adminSchema =
  new mongoose.Schema(
    {
      email: {
        type:
          String,

        required:
          true,
      },

      role: {
        type:
          String,

        enum: [
          "superadmin",
          "policy_manager",
          "viewer",
        ],

        default:
          "viewer",
      },

      permissions: [
        String,
      ],

      addedAt: {
        type:
          Date,

        default:
          Date.now,
      },
    },
    {
      _id:
        false,
    }
  );


// ============================================================================
// PHASE 11.11 — RETENTION POLICY
// ============================================================================

const retentionSchema =
  new mongoose.Schema(
    {
      /*
       * Inactive learned incident-memory patterns.
       */
      incidentMemoryDays: {
        type:
          Number,

        default:
          30,

        min:
          1,

        max:
          3650,
      },


      /*
       * DecisionTrace is archived before deletion.
       */
      decisionTraceDays: {
        type:
          Number,

        default:
          90,

        min:
          1,

        max:
          3650,
      },


      /*
       * Completed RunbookExecution records are archived before deletion.
       */
      runbookExecutionDays: {
        type:
          Number,

        default:
          90,

        min:
          1,

        max:
          3650,
      },


      /*
       * Resolved DLQ records are transient and can be deleted.
       */
      failedMessageDays: {
        type:
          Number,

        default:
          7,

        min:
          1,

        max:
          365,
      },


      /*
       * Audit chains are protected.
       *
       * This value describes compliance retention expectations but
       * DOES NOT directly TTL/delete AuditEvent records.
       */
      auditRetentionDays: {
        type:
          Number,

        default:
          2555,

        min:
          365,

        max:
          36500,
      },


      /*
       * Maximum number of documents processed by one cleanup batch.
       */
      batchSize: {
        type:
          Number,

        default:
          500,

        min:
          10,

        max:
          5000,
      },


      /*
       * Maximum records retained in hot collections.
       */
      incidentMemoryLimit: {
        type:
          Number,

        default:
          10000,

        min:
          100,
      },


      decisionTraceLimit: {
        type:
          Number,

        default:
          50000,

        min:
          100,
      },


      /*
       * When enabled, records selected for archival are written to
       * RetentionArchive before being removed from the hot collection.
       */
      archiveEnabled: {
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
// SETTINGS
// ============================================================================

const settingsSchema =
  new mongoose.Schema(
    {
      maxEventsPerSecond: {
        type:
          Number,

        default:
          10000,
      },

      maxConcurrentIncidents: {
        type:
          Number,

        default:
          100,
      },

      maxConcurrentActions: {
        type:
          Number,

        default:
          5,
      },

      maxActionsPerHour: {
        type:
          Number,

        default:
          10,
      },


      /*
       * Kept for backwards compatibility.
       *
       * Phase 11.11's canonical configuration lives under
       * settings.retention.auditRetentionDays.
       */
      auditRetentionDays: {
        type:
          Number,

        default:
          2555,
      },


      retention: {
        type:
          retentionSchema,

        default:
          () => ({}),
      },
    },
    {
      _id:
        false,
    }
  );


// ============================================================================
// TENANT CONFIG
// ============================================================================

const tenantConfigSchema =
  new mongoose.Schema(
    {
      tenantId: {
        type:
          String,

        required:
          true,

        unique:
          true,

        trim:
          true,

        lowercase:
          true,

        match:
          /^[a-zA-Z0-9_-]+$/,
      },

      name:
        String,

      apiKeys: [
        apiKeySchema,
      ],

      /*
       * Existing compatibility field.
       *
       * Do not expose TenantConfig documents directly to clients.
       * Phase 11.17 should certify every remaining legacy secret field.
       */
      secretKey:
        String,

      policyVersion: {
        type:
          Number,

        default:
          1,
      },

      settings:
        settingsSchema,

      admins: [
        adminSchema,
      ],

      status: {
        type:
          String,

        enum: [
          "active",
          "suspended",
          "archived",
        ],

        default:
          "active",
      },

      createdAt: {
        type:
          Date,

        default:
          Date.now,
      },

      createdBy:
        String,

      metadata:
        mongoose.Schema.Types
          .Mixed,
    },
    {
      versionKey:
        false,

      timestamps:
        true,
    }
  );


// ============================================================================
// INDEXES
// ============================================================================

tenantConfigSchema
  .index({
    status:
      1,
  });


tenantConfigSchema
  .index({
    "apiKeys.keyId":
      1,
  });


module.exports =
  mongoose.model(
    "TenantConfig",
    tenantConfigSchema
  );