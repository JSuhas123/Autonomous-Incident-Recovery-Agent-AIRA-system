"use strict";

const mongoose = require("mongoose");
const { AUTH_EVENT_TYPE_VALUES, AUTH_EVENT_OUTCOME_VALUES } = require("../constants/authEvents");

const authenticationAuditEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: AUTH_EVENT_TYPE_VALUES,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserSession",
      default: null,
    },
    outcome: {
      type: String,
      enum: AUTH_EVENT_OUTCOME_VALUES,
      required: true,
    },
    reasonCode: {
      type: String,
      default: null,
    },
    requestId: {
      type: String,
      default: null,
    },
    correlationId: {
      type: String,
      default: null,
    },
    ipHash: {
      type: String,
      default: null,
    },
    userAgentHash: {
      type: String,
      default: null,
    },
    // Never store passwords, tokens, secrets, or Authorization headers here
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Reject updates and deletes — events are append-only by convention
authenticationAuditEventSchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate", "findByIdAndUpdate", "findOneAndDelete", "findByIdAndDelete", "deleteOne", "deleteMany"],
  function guardImmutable() {
    throw new Error("AuthenticationAuditEvent records are immutable");
  }
);

authenticationAuditEventSchema.index({ userId: 1, createdAt: -1 });
authenticationAuditEventSchema.index({ organizationId: 1, createdAt: -1 });
authenticationAuditEventSchema.index({ eventType: 1, createdAt: -1 });
authenticationAuditEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuthenticationAuditEvent", authenticationAuditEventSchema);
