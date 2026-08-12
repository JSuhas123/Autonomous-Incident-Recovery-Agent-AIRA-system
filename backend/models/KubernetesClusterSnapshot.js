"use strict";

const mongoose =
  require("mongoose");

const KubernetesClusterSnapshotSchema =
  new mongoose.Schema(
    {
      /**
       * Legacy tenant identifier.
       *
       * Keep for compatibility with existing discovery/inventory code.
       */
      tenantId: {
        type:
          mongoose.Schema.Types.ObjectId,
        required:
          true,
        index:
          true,
      },

      /**
       * Canonical organization ownership boundary.
       */
      organizationId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Organization",
        required:
          true,
        index:
          true,
      },

      /**
       * Canonical environment ownership boundary.
       *
       * Temporarily optional until existing snapshots
       * are migrated.
       */
      environmentId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Environment",
        required:
          false,
        default:
          null,
        index:
          true,
      },

      /**
       * Integration/cluster connection that produced
       * this discovery snapshot.
       */
      integrationId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "IntegrationConnection",
        required:
          true,
        index:
          true,
      },

      discoveredAt: {
        type:
          Date,
        required:
          true,
      },

      summary: {
        namespaces: {
          type:
            Number,
          default:
            0,
        },

        deployments: {
          type:
            Number,
          default:
            0,
        },

        pods: {
          type:
            Number,
          default:
            0,
        },

        services: {
          type:
            Number,
          default:
            0,
        },

        replicaSets: {
          type:
            Number,
          default:
            0,
        },

        nodes: {
          type:
            Number,
          default:
            0,
        },

        unhealthyPods: {
          type:
            Number,
          default:
            0,
        },

        unhealthyNodes: {
          type:
            Number,
          default:
            0,
        },
      },

      durationMs: {
        type:
          Number,
        default:
          null,
      },

      success: {
        type:
          Boolean,
        default:
          true,
      },

      error: {
        type:
          String,
        maxlength:
          1024,
        default:
          null,
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,
    }
  );

/**
 * ------------------------------------------------------------------
 * ENVIRONMENT-SCOPED INDEXES
 * ------------------------------------------------------------------
 */

/**
 * Latest snapshots for an integration in one environment.
 */
KubernetesClusterSnapshotSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  integrationId:
    1,

  discoveredAt:
    -1,
});

/**
 * Environment-level snapshot history.
 */
KubernetesClusterSnapshotSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  discoveredAt:
    -1,
});

/**
 * Operational success/failure history.
 */
KubernetesClusterSnapshotSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  success:
    1,

  discoveredAt:
    -1,
});

module.exports =
  mongoose.model(
    "KubernetesClusterSnapshot",
    KubernetesClusterSnapshotSchema
  );
  