"use strict";

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedEmail: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending_verification", "active", "suspended", "disabled"],
      default: "pending_verification",
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    primaryOrganizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

userSchema.index({ normalizedEmail: 1 }, { unique: true });

// Normalize before validation so the required check on normalizedEmail passes
userSchema.pre("validate", function (next) {
  if (this.email) {
    this.normalizedEmail = this.email.toLowerCase().trim();
  }
  next();
});

userSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
