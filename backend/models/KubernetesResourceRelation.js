"use strict";

const mongoose = require("mongoose");

const KubernetesResourceRelationSchema =
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

      sourceResourceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "KubernetesResource",
        required: true,
        index: true,
      },

      targetResourceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "KubernetesResource",
        required: true,
        index: true,
      },

      relationType: {
        type: String,
        enum: [
          "service_selects_pod",
          "deployment_owns_replicaset",
          "replicaset_owns_pod",
          "deployment_owns_pod",
          "pod_runs_on_node",
        ],
        required: true,
        index: true,
      },

      confidence: {
        type: Number,
        min: 0,
        max: 1,
        default: 1,
      },

      evidence: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },

      active: {
        type: Boolean,
        default: true,
        index: true,
      },

      discoveredAt: {
        type: Date,
        default: Date.now,
      },

      lastSeenAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      timestamps: true,
    }
  );

KubernetesResourceRelationSchema.index(
  {
    tenantId: 1,
    integrationId: 1,
    sourceResourceId: 1,
    targetResourceId: 1,
    relationType: 1,
  },
  {
    unique: true,
  }
);

module.exports =
  mongoose.model(
    "KubernetesResourceRelation",
    KubernetesResourceRelationSchema
  );