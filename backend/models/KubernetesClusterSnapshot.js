"use strict";

const mongoose = require("mongoose");

const KubernetesClusterSnapshotSchema =
  new mongoose.Schema(
    {
      tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
      },

      organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
      },

      integrationId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
      },

      discoveredAt: {
        type: Date,
        required: true,
      },

      summary: {
        namespaces: {
          type: Number,
          default: 0,
        },

        deployments: {
          type: Number,
          default: 0,
        },

        pods: {
          type: Number,
          default: 0,
        },

        services: {
          type: Number,
          default: 0,
        },
        replicaSets: {
  type: Number,
  default: 0,
},

unhealthyPods: {
  type: Number,
  default: 0,
},

unhealthyNodes: {
  type: Number,
  default: 0,
},

        nodes: {
          type: Number,
          default: 0,
        },
      },

      durationMs: {
        type: Number,
        default: null,
      },

      success: {
        type: Boolean,
        default: true,
      },

      error: {
        type: String,
        default: null,
      },
    },
    {
      timestamps: true,
    }
  );

module.exports =
  mongoose.model(
    "KubernetesClusterSnapshot",
    KubernetesClusterSnapshotSchema
  );