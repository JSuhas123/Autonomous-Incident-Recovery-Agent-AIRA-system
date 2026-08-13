"use strict";

const mongoose = require("mongoose");

const RELATIONSHIP_TYPES = [
  "depends_on",
  "runs_on",
  "uses",
  "connects_to",
  "backed_by",
  "exposed_by",
  "owned_by",
  "contains",
  "routes_to",
  "selects",
  "scheduled_on",
  "replicates_to",
  "member_of",
  "related_to",
];

const NODE_TYPES = [
  "service",
  "resource",
];

const DISCOVERY_METHODS = [
  "manual",
  "connector",
  "kubernetes_owner_reference",
  "kubernetes_selector",
  "configuration",
  "telemetry",
  "inferred",
];

const resourceRelationshipSchema =
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

      tenantId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      // ======================================================================
      // SOURCE NODE
      // ======================================================================

      sourceType: {
        type:
          String,

        enum:
          NODE_TYPES,

        required:
          true,
      },

      sourceId: {
        type:
          mongoose.Schema.Types.ObjectId,

        required:
          true,

        index:
          true,
      },

      // ======================================================================
      // TARGET NODE
      // ======================================================================

      targetType: {
        type:
          String,

        enum:
          NODE_TYPES,

        required:
          true,
      },

      targetId: {
        type:
          mongoose.Schema.Types.ObjectId,

        required:
          true,

        index:
          true,
      },

      relationshipType: {
        type:
          String,

        enum:
          RELATIONSHIP_TYPES,

        required:
          true,

        index:
          true,
      },

      // ======================================================================
      // EVIDENCE / CONFIDENCE
      // ======================================================================

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

      discoveryMethod: {
        type:
          String,

        enum:
          DISCOVERY_METHODS,

        default:
          "manual",
      },

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

      sourceRelationshipModel: {
        type:
          String,

        default:
          null,
      },

      sourceRelationshipId: {
        type:
          mongoose.Schema.Types.ObjectId,

        default:
          null,

        index:
          true,
      },

      evidence: {
        type:
          mongoose.Schema.Types.Mixed,

        default:
          {},
      },

      // ======================================================================
      // RECONCILIATION
      // ======================================================================

      /*
       * Relationship was observed during this successful
       * connector synchronization.
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

      observationCount: {
        type:
          Number,

        min:
          0,

        default:
          1,
      },

      // ======================================================================
      // BLAST-RADIUS METADATA
      // ======================================================================

      criticality: {
        type:
          Number,

        min:
          1,

        max:
          10,

        default:
          5,
      },

      userFacing: {
        type:
          Boolean,

        default:
          false,
      },

      /*
       * Whether failures should normally propagate
       * from target → source.
       *
       * Example:
       *
       * payment-api DEPENDS_ON redis
       *
       * redis failure may affect payment-api.
       */
      propagatesFailure: {
        type:
          Boolean,

        default:
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

      inactiveSince: {
        type:
          Date,

        default:
          null,
      },

      recoveredAt: {
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
// SAFETY
// ============================================================================

resourceRelationshipSchema.pre(
  "validate",

  function validateRelationship(
    next
  ) {
    if (
      this.sourceType ===
        this.targetType &&
      String(
        this.sourceId
      ) ===
        String(
          this.targetId
        )
    ) {
      return next(
        new Error(
          "A resource relationship cannot reference itself"
        )
      );
    }

    return next();
  }
);

// ============================================================================
// UNIQUE GRAPH EDGE
// ============================================================================

resourceRelationshipSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    sourceType:
      1,

    sourceId:
      1,

    targetType:
      1,

    targetId:
      1,

    relationshipType:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_inventory_relationship_per_environment",
  }
);

// ============================================================================
// FORWARD GRAPH TRAVERSAL
// ============================================================================

resourceRelationshipSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  sourceType:
    1,

  sourceId:
    1,

  active:
    1,
});

// ============================================================================
// REVERSE GRAPH TRAVERSAL
// ============================================================================

resourceRelationshipSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  targetType:
    1,

  targetId:
    1,

  active:
    1,
});

// ============================================================================
// RELATIONSHIP TYPE LOOKUP
// ============================================================================

resourceRelationshipSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  relationshipType:
    1,

  active:
    1,
});

// ============================================================================
// CONNECTOR RECONCILIATION
// ============================================================================

resourceRelationshipSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  integrationId:
    1,

  sourceRelationshipModel:
    1,

  lastSeenSyncId:
    1,

  active:
    1,
});

// ============================================================================
// PROVIDER SOURCE LOOKUP
// ============================================================================

resourceRelationshipSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  sourceRelationshipModel:
    1,

  sourceRelationshipId:
    1,
});

const ResourceRelationship =
  mongoose.model(
    "ResourceRelationship",
    resourceRelationshipSchema
  );

module.exports =
  ResourceRelationship;

module.exports.RELATIONSHIP_TYPES =
  RELATIONSHIP_TYPES;

module.exports.NODE_TYPES =
  NODE_TYPES;

module.exports.DISCOVERY_METHODS =
  DISCOVERY_METHODS;