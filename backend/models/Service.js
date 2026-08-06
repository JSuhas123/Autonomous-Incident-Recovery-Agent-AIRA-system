"use strict";

const mongoose = require("mongoose");

const SERVICE_TYPES = ["website", "api", "backend", "microservice", "kubernetes", "docker", "cloud", "database", "other"];
const SERVICE_ENVS  = ["production", "staging", "development", "testing"];
const SERVICE_STATUSES      = ["active", "paused", "archived"];
const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "failed"];
const MONITORING_STATUSES   = ["not_configured", "configuring", "active", "paused", "error"];

const ownershipVerificationSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ["dns_txt", "file", "meta_tag", "none"], default: "none" },
    token: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
  },
  { _id: false }
);

const serviceSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9_-]+$/,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    type: {
      type: String,
      enum: SERVICE_TYPES,
      required: true,
    },
    environment: {
      type: String,
      enum: SERVICE_ENVS,
      required: true,
    },
    baseUrl: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: SERVICE_STATUSES,
      default: "active",
    },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: "unverified",
    },
    monitoringStatus: {
      type: String,
      enum: MONITORING_STATUSES,
      default: "not_configured",
    },
    ownershipVerification: {
      type: ownershipVerificationSchema,
      default: () => ({}),
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 20,
        message: "Maximum 20 tags allowed",
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// One service name per org (case-insensitive via slug uniqueness)
serviceSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
serviceSchema.index({ organizationId: 1, status: 1 });
serviceSchema.index({ organizationId: 1, type: 1 });
serviceSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model("Service", serviceSchema);
module.exports.SERVICE_TYPES = SERVICE_TYPES;
module.exports.SERVICE_ENVS = SERVICE_ENVS;
module.exports.SERVICE_STATUSES = SERVICE_STATUSES;
module.exports.VERIFICATION_STATUSES = VERIFICATION_STATUSES;
module.exports.MONITORING_STATUSES = MONITORING_STATUSES;
