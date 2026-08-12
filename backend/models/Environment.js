"use strict";

const mongoose = require("mongoose");

const environmentSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
      match: /^[a-z0-9_-]+$/,
    },

    type: {
      type: String,
      enum: [
        "development",
        "testing",
        "staging",
        "production",
        "custom",
      ],
      required: true,
      default: "custom",
    },

    criticality: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
      default: "medium",
    },

    status: {
      type: String,
      enum: ["active", "maintenance", "archived"],
      default: "active",
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

environmentSchema.index(
  {
    organizationId: 1,
    slug: 1,
  },
  {
    unique: true,
  }
);

environmentSchema.index({
  organizationId: 1,
  status: 1,
});

environmentSchema.index({
  organizationId: 1,
  type: 1,
});

module.exports = mongoose.model("Environment", environmentSchema);