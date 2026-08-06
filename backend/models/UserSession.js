"use strict";

const mongoose = require("mongoose");

const userSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    activeOrganizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    // Only the hash is stored; the raw token must never be persisted
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },
    status: {
      type: String,
      enum: ["active", "revoked", "expired"],
      default: "active",
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    idleExpiresAt: {
      type: Date,
      required: true,
    },
    absoluteExpiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revocationReason: {
      type: String,
      default: null,
    },
    ipHash: {
      type: String,
      default: null,
      select: false,
    },
    userAgentHash: {
      type: String,
      default: null,
      select: false,
    },
    deviceId: {
      type: String,
      default: null,
    },
    deviceLabel: {
      type: String,
      default: null,
    },
    authenticationMethods: {
      type: [
        {
          type: String,
          enum: ["password", "totp", "passkey", "oidc", "recovery_code"],
        },
      ],
      default: ["password"],
    },
    assuranceLevel: {
      type: String,
      enum: ["aal1", "aal2", "aal3"],
      default: "aal1",
    },
    rememberMe: {
      type: Boolean,
      default: false,
    },
    // Per-session CSRF secret; browser receives a derived token, never this value
    csrfSecret: {
      type: String,
      default: null,
      select: false,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

userSessionSchema.index({ tokenHash: 1 }, { unique: true });
userSessionSchema.index({ userId: 1, status: 1 });
userSessionSchema.index({ idleExpiresAt: 1 });
userSessionSchema.index({ absoluteExpiresAt: 1 });

// Remove all hashes and PII-adjacent fields from any JSON representation
userSessionSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.tokenHash;
    delete ret.ipHash;
    delete ret.userAgentHash;
    delete ret.csrfSecret;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("UserSession", userSessionSchema);
