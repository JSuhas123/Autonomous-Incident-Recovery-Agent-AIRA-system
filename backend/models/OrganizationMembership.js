"use strict";

const mongoose = require("mongoose");
const { ORGANIZATION_ROLE_VALUES } = require("../constants/roles");

const organizationMembershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    role: {
      type: String,
      enum: ORGANIZATION_ROLE_VALUES,
      required: true,
    },
    status: {
      type: String,
      enum: ["invited", "active", "suspended", "removed"],
      default: "invited",
    },
    // Reserved for future project-level authorization
    projectIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    invitedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    joinedAt: {
      type: Date,
      default: null,
    },
    suspendedAt: {
      type: Date,
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

organizationMembershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
organizationMembershipSchema.index({ organizationId: 1, status: 1 });
organizationMembershipSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model("OrganizationMembership", organizationMembershipSchema);
