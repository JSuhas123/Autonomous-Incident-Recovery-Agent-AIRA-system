"use strict";

const mongoose = require("mongoose");

const RESOURCE_PROVIDERS = [
  "kubernetes",
  "docker",
  "aws",
  "azure",
  "gcp",
  "mongodb",
  "postgresql",
  "mysql",
  "redis",
  "rabbitmq",
  "kafka",
  "datadog",
  "prometheus",
  "generic",
];

const RESOURCE_TYPES = [
  "cluster",
  "namespace",
  "workload",
  "container",
  "compute",
  "database",
  "cache",
  "queue",
  "storage",
  "network",
  "load_balancer",
  "service_endpoint",
  "node",
  "serverless",
  "other",
];

const RESOURCE_LIFECYCLE = [
  "active",
  "missing",
  "stale",
  "archived",
];

const RESOURCE_HEALTH = [
  "healthy",
  "degraded",
  "unhealthy",
  "unknown",
];

const DISCOVERY_SOURCES = [
  "connector",
  "api",
  "manual",
  "import",
  "inferred",
];

const CRITICALITY_LEVELS = [
  "low",
  "medium",
  "high",
  "critical",
];

const infrastructureResourceSchema =
  new mongoose.Schema(
    {
      // ======================================================================
      // OWNERSHIP
      // ======================================================================

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

      environmentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Environment",

        required:
          true,

        index:
          true,
      },

      /*
       * Legacy compatibility identifier.
       *
       * organizationId + environmentId remain canonical.
       */
      tenantId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      // ======================================================================
      // RESOURCE IDENTITY
      // ======================================================================

      provider: {
        type:
          String,

        enum:
          RESOURCE_PROVIDERS,

        required:
          true,

        index:
          true,
      },

      resourceType: {
        type:
          String,

        enum:
          RESOURCE_TYPES,

        required:
          true,

        index:
          true,
      },

      /*
       * Provider-specific resource type.
       *
       * Examples:
       *
       * deployment
       * replicaset
       * pod
       * ec2
       * rds
       * mongodb
       */
      resourceSubtype: {
        type:
          String,

        required:
          true,

        trim:
          true,

        lowercase:
          true,

        maxlength:
          100,

        index:
          true,
      },

      /*
       * Provider-side stable identity.
       *
       * Kubernetes -> UID
       * AWS        -> ARN/resource ID
       * Docker     -> container ID
       */
      externalId: {
        type:
          String,

        trim:
          true,

        maxlength:
          1024,

        default:
          null,
      },

      /*
       * AIRA canonical inventory identity.
       *
       * Must remain deterministic between discovery runs.
       */
      inventoryKey: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          2048,
      },

      name: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          255,

        index:
          true,
      },

      // ======================================================================
      // LOCATION
      // ======================================================================

      region: {
        type:
          String,

        trim:
          true,

        default:
          null,
      },

      zone: {
        type:
          String,

        trim:
          true,

        default:
          null,
      },

      namespace: {
        type:
          String,

        trim:
          true,

        default:
          null,

        index:
          true,
      },

      cluster: {
        type:
          String,

        trim:
          true,

        default:
          null,
      },

      // ======================================================================
      // DISCOVERY SOURCE
      // ======================================================================

      integrationId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "IntegrationConnection",

        default:
          null,

        index:
          true,
      },

      discoverySource: {
        type:
          String,

        enum:
          DISCOVERY_SOURCES,

        default:
          "connector",
      },

      /*
       * Provider-specific source model.
       *
       * Kubernetes:
       *
       * sourceModel = KubernetesResource
       */
      sourceModel: {
        type:
          String,

        default:
          null,
      },

      sourceResourceId: {
        type:
          mongoose.Schema.Types.ObjectId,

        default:
          null,

        index:
          true,
      },

      // ======================================================================
      // RECONCILIATION
      // ======================================================================

      /*
       * Unique identifier for the most recent successful discovery run
       * in which this resource was observed.
       *
       * This is critical:
       *
       * discovery starts
       *      ↓
       * resources receive current syncId
       *      ↓
       * discovery completes successfully
       *      ↓
       * older syncIds may safely be marked missing
       *
       * Failed or partial runs must NEVER trigger stale cleanup.
       */
      lastSeenSyncId: {
        type:
          String,

        trim:
          true,

        default:
          null,

        index:
          true,
      },

      /*
       * Number of successful discovery runs in which this resource
       * has been observed.
       *
       * Useful later for inventory confidence and stability scoring.
       */
      observationCount: {
        type:
          Number,

        min:
          0,

        default:
          1,
      },

      // ======================================================================
      // RESOURCE STATE
      // ======================================================================

      lifecycleStatus: {
        type:
          String,

        enum:
          RESOURCE_LIFECYCLE,

        default:
          "active",

        index:
          true,
      },

      healthStatus: {
        type:
          String,

        enum:
          RESOURCE_HEALTH,

        default:
          "unknown",

        index:
          true,
      },

      providerStatus: {
        type:
          String,

        default:
          null,
      },

      criticality: {
        type:
          String,

        enum:
          CRITICALITY_LEVELS,

        default:
          "medium",

        index:
          true,
      },

      // ======================================================================
      // METADATA
      // ======================================================================

      labels: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },

      tags: {
        type:
          [String],

        default:
          [],

        validate: {
          validator:
            (tags) =>
              tags.length <=
              100,

          message:
            "Maximum 100 inventory tags allowed",
        },
      },

      metadata: {
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

      status: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },

      // ======================================================================
      // DISCOVERY HISTORY
      // ======================================================================

      firstSeenAt: {
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

      missingSince: {
        type:
          Date,

        default:
          null,

        index:
          true,
      },

      /*
       * If a previously missing resource comes back,
       * this records the latest restoration time.
       */
      recoveredAt: {
        type:
          Date,

        default:
          null,
      },

      archivedAt: {
        type:
          Date,

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

// ============================================================================
// SAFETY NORMALIZATION
// ============================================================================

infrastructureResourceSchema.pre(
  "validate",

  function normalizeInventoryState(
    next
  ) {
    if (
      this.lifecycleStatus ===
      "active"
    ) {
      this.archivedAt =
        null;
    }

    if (
      this.lifecycleStatus ===
      "archived" &&
      !this.archivedAt
    ) {
      this.archivedAt =
        new Date();
    }

    return next();
  }
);

// ============================================================================
// UNIQUE INVENTORY IDENTITY
// ============================================================================

infrastructureResourceSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    inventoryKey:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_inventory_resource_per_environment",
  }
);

// ============================================================================
// MAIN ENVIRONMENT INVENTORY
// ============================================================================

infrastructureResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  lifecycleStatus:
    1,

  resourceType:
    1,
});

// ============================================================================
// PROVIDER INVENTORY
// ============================================================================

infrastructureResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  provider:
    1,

  integrationId:
    1,

  lifecycleStatus:
    1,
});

// ============================================================================
// DISCOVERY RECONCILIATION
// ============================================================================

infrastructureResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  provider:
    1,

  integrationId:
    1,

  lastSeenSyncId:
    1,

  lifecycleStatus:
    1,
});

// ============================================================================
// RESOURCE SEARCH
// ============================================================================

infrastructureResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  name:
    1,
});

// ============================================================================
// SOURCE RECORD LOOKUP
// ============================================================================

infrastructureResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  sourceModel:
    1,

  sourceResourceId:
    1,
});

// ============================================================================
// STALE DETECTION
// ============================================================================

infrastructureResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  integrationId:
    1,

  lastSeenAt:
    1,
});

// ============================================================================
// HEALTH INVENTORY
// ============================================================================

infrastructureResourceSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  lifecycleStatus:
    1,

  healthStatus:
    1,

  criticality:
    1,
});

const InfrastructureResource =
  mongoose.model(
    "InfrastructureResource",
    infrastructureResourceSchema
  );

module.exports =
  InfrastructureResource;

module.exports.RESOURCE_PROVIDERS =
  RESOURCE_PROVIDERS;

module.exports.RESOURCE_TYPES =
  RESOURCE_TYPES;

module.exports.RESOURCE_LIFECYCLE =
  RESOURCE_LIFECYCLE;

module.exports.RESOURCE_HEALTH =
  RESOURCE_HEALTH;

module.exports.DISCOVERY_SOURCES =
  DISCOVERY_SOURCES;

module.exports.CRITICALITY_LEVELS =
  CRITICALITY_LEVELS;