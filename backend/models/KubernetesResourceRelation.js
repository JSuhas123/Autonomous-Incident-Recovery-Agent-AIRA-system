"use strict";

const mongoose =
  require("mongoose");

const KubernetesResourceRelationSchema =
  new mongoose.Schema(
    {
      /**
       * Legacy tenant identifier.
       *
       * Retained for compatibility with the current
       * discovery/relationship service.
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
       * Temporarily optional until existing relationship
       * records have been migrated.
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
       * Kubernetes integration / cluster that owns
       * this relationship graph.
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

      sourceResourceId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "KubernetesResource",
        required:
          true,
        index:
          true,
      },

      targetResourceId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "KubernetesResource",
        required:
          true,
        index:
          true,
      },

      relationType: {
        type:
          String,
        enum: [
          "service_selects_pod",
          "deployment_owns_replicaset",
          "replicaset_owns_pod",
          "deployment_owns_pod",
          "pod_runs_on_node",
        ],
        required:
          true,
        index:
          true,
      },

      confidence: {
        type:
          Number,
        min:
          0,
        max:
          1,
        default:
          1,
      },

      evidence: {
        type:
          mongoose.Schema.Types.Mixed,
        default:
          {},
      },

      active: {
        type:
          Boolean,
        default:
          true,
        index:
          true,
      },

      discoveredAt: {
        type:
          Date,
        default:
          Date.now,
      },

      lastSeenAt: {
        type:
          Date,
        default:
          Date.now,
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
 * RELATIONSHIP IDENTITY
 * ------------------------------------------------------------------
 *
 * The same pair of resource names/IDs may exist in multiple
 * environments or clusters.
 *
 * Therefore uniqueness is scoped to:
 *
 * organization
 * + environment
 * + integration
 * + source
 * + target
 * + relation type
 */
KubernetesResourceRelationSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    integrationId:
      1,

    sourceResourceId:
      1,

    targetResourceId:
      1,

    relationType:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_kubernetes_relation_per_environment",
  }
);

/**
 * Graph traversal from a source resource.
 */
KubernetesResourceRelationSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  integrationId:
    1,

  sourceResourceId:
    1,

  active:
    1,
});

/**
 * Reverse graph traversal into a target resource.
 */
KubernetesResourceRelationSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  integrationId:
    1,

  targetResourceId:
    1,

  active:
    1,
});

/**
 * Relationship type queries.
 */
KubernetesResourceRelationSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  integrationId:
    1,

  relationType:
    1,

  active:
    1,
});

/**
 * Stale relationship cleanup.
 */
KubernetesResourceRelationSchema.index({
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
    "KubernetesResourceRelation",
    KubernetesResourceRelationSchema
  );