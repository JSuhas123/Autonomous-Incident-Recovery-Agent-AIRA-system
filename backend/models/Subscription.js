"use strict";

const mongoose = require("mongoose");
const { PLAN_VALUES } = require("../constants/plans");

const subscriptionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
      index: true,
    },

    plan: {
      type: String,
      enum: PLAN_VALUES,
      default: "developer",
      required: true,
    },

    status: {
      type: String,
      enum: [
        "active",
        "trialing",
        "past_due",
        "suspended",
        "cancelled",
      ],
      default: "active",
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    endsAt: {
      type: Date,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model(
  "Subscription",
  subscriptionSchema
);