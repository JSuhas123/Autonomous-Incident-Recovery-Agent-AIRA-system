const mongoose = require("mongoose");

// API Key subdocument schema
const apiKeySchema = new mongoose.Schema(
  {
    keyId: { type: String, required: true },
    keyHash: { type: String, required: true },
    secretHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    rotationDeadline: Date,
    scopes: { type: [String], default: ["read:*", "write:*"] },
    status: { type: String, enum: ["active", "rotating", "retired"], default: "active" },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

// Admin subdocument schema
const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    role: { type: String, enum: ["superadmin", "policy_manager", "viewer"], default: "viewer" },
    permissions: [String],
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Settings subdocument schema
const settingsSchema = new mongoose.Schema(
  {
    maxEventsPerSecond: { type: Number, default: 10000 },
    maxConcurrentIncidents: { type: Number, default: 100 },
    maxConcurrentActions: { type: Number, default: 5 },
    maxActionsPerHour: { type: Number, default: 10 },
    auditRetentionDays: { type: Number, default: 2555 },
  },
  { _id: false }
);

const tenantConfigSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[a-zA-Z0-9_-]+$/,
    },
    name: String,
    apiKeys: [apiKeySchema],
    secretKey: String,
    policyVersion: { type: Number, default: 1 },
    settings: settingsSchema,
    admins: [adminSchema],
    status: { type: String, enum: ["active", "suspended", "archived"], default: "active" },
    createdAt: { type: Date, default: Date.now },
    createdBy: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// Indexes for performance
// Note: tenantId has unique: true in field definition, so no explicit index needed
tenantConfigSchema.index({ status: 1 });
tenantConfigSchema.index({ "apiKeys.keyId": 1 });

module.exports = mongoose.model("TenantConfig", tenantConfigSchema);
