"use strict";

const mongoose = require("mongoose");

const passwordCredentialSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // select: false prevents passwordHash from appearing in normal queries
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    algorithm: {
      type: String,
      enum: ["argon2id"],
      default: "argon2id",
    },
    hashVersion: {
      type: Number,
      default: 1,
    },
    passwordChangedAt: {
      type: Date,
      default: Date.now,
    },
    failedAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    lastFailedAt: {
      type: Date,
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// One active password credential per user
passwordCredentialSchema.index({ userId: 1 }, { unique: true });

// Belt-and-suspenders: also remove from toJSON even when explicitly selected
passwordCredentialSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("PasswordCredential", passwordCredentialSchema);
