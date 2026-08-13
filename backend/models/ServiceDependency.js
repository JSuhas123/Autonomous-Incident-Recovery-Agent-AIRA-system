"use strict";

const mongoose = require("mongoose");

const DEPENDENCY_TYPES = [
  "critical",
  "degraded",
  "optional",
];

const DISCOVERY_METHODS = [
  "manual",
  "configuration",
  "telemetry",
  "connector",
  "inferred",
];

const serviceDependencySchema =
  new mongoose.Schema(
    {
      /*
       * ------------------------------------------------------------
       * OWNERSHIP
       * ------------------------------------------------------------
       */

      organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        index: true,
      },

      environmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Environment",
        required: true,
        index: true,
      },

      tenantId: {
        type: String,
        required: true,
        index: true,
      },

      /*
       * ------------------------------------------------------------
       * SERVICE GRAPH
       * ------------------------------------------------------------
       */

      sourceServiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
        required: true,
        index: true,
      },

      targetServiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
        required: true,
        index: true,
      },

      dependencyType: {
        type: String,
        enum: DEPENDENCY_TYPES,
        default: "critical",
        index: true,
      },

      /*
       * ------------------------------------------------------------
       * BUSINESS IMPORTANCE
       * ------------------------------------------------------------
       */

      criticality: {
        type: Number,
        min: 1,
        max: 10,
        default: 5,
      },

      userFacing: {
        type: Boolean,
        default: false,
      },

      /*
       * ------------------------------------------------------------
       * SERVICE LEVEL INFORMATION
       * ------------------------------------------------------------
       */

      sla: {
        availabilityTarget: {
          type: Number,
          min: 0,
          max: 100,
          default: 99.9,
        },

        maxErrorBudgetPercent: {
          type: Number,
          min: 0,
          max: 100,
          default: 0.1,
        },
      },

      /*
       * ------------------------------------------------------------
       * OBSERVED RELATIONSHIP HEALTH
       * ------------------------------------------------------------
       */

      latencyMs: {
        type: Number,
        min: 0,
        default: 0,
      },

      failureRate: {
        type: Number,
        min: 0,
        max: 1,
        default: 0,
      },

      /*
       * ------------------------------------------------------------
       * DISCOVERY
       * ------------------------------------------------------------
       */

      discoveryMethod: {
        type: String,
        enum: DISCOVERY_METHODS,
        default: "manual",
      },

      evidence: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },

      confidence: {
        type: Number,
        min: 0,
        max: 1,
        default: 1,
      },

      active: {
        type: Boolean,
        default: true,
        index: true,
      },

      firstSeenAt: {
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
      versionKey: false,
    }
  );

/*
 * Prevent:
 *
 * service-A -> service-A
 */
serviceDependencySchema.pre(
  "validate",
  function validateDependency(
    next
  ) {
    if (
      String(
        this.sourceServiceId
      ) ===
      String(
        this.targetServiceId
      )
    ) {
      return next(
        new Error(
          "A service cannot depend on itself"
        )
      );
    }

    return next();
  }
);

/*
 * One dependency edge per environment.
 */
serviceDependencySchema.index(
  {
    organizationId: 1,
    environmentId: 1,
    sourceServiceId: 1,
    targetServiceId: 1,
  },
  {
    unique: true,

    name:
      "unique_service_dependency_per_environment",
  }
);

/*
 * Outbound dependencies.
 */
serviceDependencySchema.index({
  organizationId: 1,
  environmentId: 1,
  sourceServiceId: 1,
  active: 1,
});

/*
 * Reverse dependencies / blast radius.
 */
serviceDependencySchema.index({
  organizationId: 1,
  environmentId: 1,
  targetServiceId: 1,
  active: 1,
});

/*
 * Critical dependency lookup.
 */
serviceDependencySchema.index({
  organizationId: 1,
  environmentId: 1,
  criticality: -1,
  active: 1,
});

const ServiceDependency =
  mongoose.model(
    "ServiceDependency",
    serviceDependencySchema
  );

module.exports =
  ServiceDependency;

module.exports.DEPENDENCY_TYPES =
  DEPENDENCY_TYPES;

module.exports.DISCOVERY_METHODS =
  DISCOVERY_METHODS;