const mongoose = require("mongoose");

const policyDefinitionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      required: true,
    },
    enforcementMode: {
      type: String,
      enum: ["strict", "permissive"],
      default: "strict",
    },
    policyYaml: {
      type: String,
      required: true,
    },
    policyJson: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "draft", "superseded"],
      default: "draft",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: String,
    approvedAt: Date,
    approvedBy: String,
    description: String,
    changeLog: {
      type: String,
      default: "",
    },
    services: {
      type: [
        {
          serviceId: String,
          criticality: {
            type: String,
            enum: ["critical", "high", "medium", "low"],
          },
          allowedActions: [
            {
              action: String,
              enabled: Boolean,
              cooldownSeconds: Number,
              maxActionsPerHour: Number,
              requiresApproval: Boolean,
              reason: String,
            },
          ],
        },
      ],
      default: [],
    },
    circuitBreakers: {
      type: [
        {
          action: String,
          failureThreshold: Number,
          failureWindow: String, // "1h"
          recoverableAfter: String,
        },
      ],
      default: [],
    },
    blackoutWindows: {
      type: [
        {
          name: String,
          startHour: Number,
          endHour: Number,
          daysOfWeek: [String],
        },
      ],
      default: [],
    },
    approvals: {
      type: [
        {
          groupId: String,
          level: String,
          escalationPath: [String],
          escalationDelaySeconds: Number,
        },
      ],
      default: [],
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// Unique index: tenantId + version
policyDefinitionSchema.index({ tenantId: 1, version: 1 }, { unique: true });
policyDefinitionSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model("PolicyDefinition", policyDefinitionSchema);
