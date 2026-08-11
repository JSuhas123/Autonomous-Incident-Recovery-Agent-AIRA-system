"use strict";

const mongoose = require("mongoose");

const KubernetesResourceSchema =
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

      provider: {
        type: String,
        default: "kubernetes",
        immutable: true,
      },

      kind: {
        type: String,
        enum: [
          "namespace",
          "deployment",
          "replicaset",
          "pod",
          "service",
          "node",
        ],
        required: true,
        index: true,
      },

      name: {
        type: String,
        required: true,
        trim: true,
      },

      namespace: {
        type: String,
        default: null,
        index: true,
      },

      uid: {
        type: String,
        default: null,
        index: true,
      },

      labels: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },

      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },

      status: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },

      spec: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },

      discoveredAt: {
        type: Date,
        required: true,
        default: Date.now,
      },

      lastSeenAt: {
        type: Date,
        required: true,
        default: Date.now,
        index: true,
      },

      active: {
        type: Boolean,
        default: true,
        index: true,
      },
    },
    {
      timestamps: true,
    }
  );

KubernetesResourceSchema.index(
  {
    tenantId: 1,
    integrationId: 1,
    kind: 1,
    namespace: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

module.exports =
  mongoose.model(
    "KubernetesResource",
    KubernetesResourceSchema
  );