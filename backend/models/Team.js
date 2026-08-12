"use strict";

const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema(
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

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },

    memberIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
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

teamSchema.index(
  {
    organizationId: 1,
    slug: 1,
  },
  {
    unique: true,
  }
);

teamSchema.index({
  organizationId: 1,
  status: 1,
});

module.exports = mongoose.model("Team", teamSchema);