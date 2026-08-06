"use strict";

const mongoose = require("mongoose");

const emailVerificationTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: { createdAt: true, updatedAt: false },
  }
);

emailVerificationTokenSchema.index({ tokenHash: 1 }, { unique: true });
emailVerificationTokenSchema.index({ userId: 1 });
// TTL index: MongoDB purges documents once expiresAt is in the past
emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("EmailVerificationToken", emailVerificationTokenSchema);
