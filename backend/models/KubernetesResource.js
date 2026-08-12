"use strict";

const mongoose =
  require("mongoose");

const KubernetesResourceSchema =
  new mongoose.Schema(
    {
      /**
       * Legacy tenant identifier.
       *
       * Kept unchanged for compatibility with the existing
       * discovery persistence layer.
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
       * Temporarily optional until existing Kubernetes
       * inventory records are migrated.
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
       * Integration / Kubernetes cluster connection
       * that discovered this resource.
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

      provider: {
        type:
          String,
        default:
          "kubernetes",
        immutable:
          true,
      },

      kind: {
        type:
          String,
        enum: [
          "namespace",
          "deployment",
          "replicaset",
          "pod",
          "service",
          "node",
        ],
        required:
          true,
        index:
          true,
      },

      name: {
        type:
          String,
        required:
          true,
        trim:
          true,
      },

      /**
       * Null for cluster-scoped resources such as Nodes.
       */
      namespace: {
        type:
          String,
        default:
          null,
        index:
          true,
      },

      /**
       * Kubernetes object UID.
       *
       * Prefer this for identity when available, but keep
       * namespace/name identity for compatibility.
       */
      uid: {
        type:
          String,
        default:
          null,
        index:
          true,
      },

      labels: {
        type:
          mongoose.Schema.Types.Mixed,
        default:
          {},
      },

      metadata: {
        type:
          mongoose.Schema.Types.Mixed,
        default:
          {},
      },

      status: {
        type:
          mongoose.Schema.Types.Mixed,
        default:
          {},
      },

      spec: {
        type:
          mongoose.Schema.Types.Mixed,
        default:
          {},
      },

      discoveredAt: {
        type:
          Date,
        required:
          true,
        default:
          Date.now,
      },

      lastSeenAt: {
        type:
          Date,
        required:
          true,
        default:
          Date.now,
        index:
          true,
      },

      active: {
        type:
          Boolean,
        default:
          true,
        index:
          true,
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
 * RESOURCE IDENTITY
 * ------------------------------------------------------------------
 *
 * A resource is unique only within:
 *
 * organization
 * + environment
 * + integration/cluster
 * + kind
 * + namespace
 * + name
 *
 * This prevents identically named Production and Staging
 * Kubernetes resources from colliding.
 */
KubernetesResourceSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    integrationId:
      1,

    kind:
      1,

    namespace:
      1,

    name:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_kubernetes_resource_per_environment",
  }
);

/**
 * UID lookup inside one integration/environment.
 */
KubernetesResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  integrationId:
    1,

  uid:
    1,
});

/**
 * Environment inventory query.
 */
KubernetesResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  active:
    1,

  kind:
    1,
});

/**
 * Cluster/integration inventory query.
 */
KubernetesResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  integrationId:
    1,

  active:
    1,

  kind:
    1,
});

/**
 * Namespace-scoped inventory query.
 */
KubernetesResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  integrationId:
    1,

  namespace:
    1,

  active:
    1,
});

/**
 * Stale resource detection.
 */
KubernetesResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  integrationId:
    1,

  lastSeenAt:
    1,
});

module.exports =
  mongoose.model(
    "KubernetesResource",
    KubernetesResourceSchema
  );