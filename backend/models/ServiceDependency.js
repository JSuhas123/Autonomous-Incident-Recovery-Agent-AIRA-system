const mongoose = require("mongoose");

const serviceDependencySchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
    },
    sourceService: {
      type: String,
      required: true,
    },
    targetService: {
      type: String,
    },
    criticality: {
      type: Number,
      min: 1,
      max: 10,
      default: 5, // 1-10, higher = more critical
    },
    userFacing: {
      type: Boolean,
      default: false,
    },
    sla: {
      availabilityTarget: { type: Number, default: 99.9 }, // percentage
      maxErrorBudgetPercent: { type: Number, default: 0.1 },
    },
    dependencyType: {
      type: String,
      enum: ["critical", "degraded", "optional"],
      default: "critical",
    },
    latencyMs: {
      type: Number,
      default: 0,
    },
    failureRate: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
serviceDependencySchema.index({ tenantId: 1, sourceService: 1 });
serviceDependencySchema.index({ tenantId: 1, targetService: 1 });
serviceDependencySchema.index({ tenantId: 1, criticality: -1 });

const ServiceDependency = mongoose.model("ServiceDependency", serviceDependencySchema);

module.exports = ServiceDependency;
