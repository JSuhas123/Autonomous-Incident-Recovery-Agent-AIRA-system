"use strict";

const mongoose = require("mongoose");

const organizationSettingsSchema = new mongoose.Schema(
  {
    timezone: {
      type: String,
      default: "UTC",
    },
    defaultRecoveryMode: {
      type: String,
      enum: ["auto", "approval", "suggest_only"],
      default: "approval",
    },
  },
  { _id: false }
);

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9_-]+$/,
    },
    // Maps to TenantConfig.tenantId - intentionally a string to stay compatible
    tenantId: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["provisioning", "active", "provisioning_failed", "suspended", "pending_deletion", "deleted"],
      default: "provisioning",
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    settings: {
      type: organizationSettingsSchema,
      default: () => ({}),
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ tenantId: 1 }, { unique: true });
organizationSchema.index({ status: 1 });

module.exports = mongoose.model("Organization", organizationSchema);
