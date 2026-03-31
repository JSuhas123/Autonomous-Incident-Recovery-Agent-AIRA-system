const mongoose = require("mongoose");

/**
 * FailedMessage Schema (Phase 2 Sprint 2)
 * Stores messages that failed processing for investigation and replay
 */

const failedMessageSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
    },
    eventId: {
      type: String,
      required: true,
    },
    correlationId: {
      type: String,
      required: true,
    },
    topic: {
      type: String,
    },
    originalMessage: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    errorMessage: String,
    errorStack: String,
    failureCount: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ["retriable", "permanent_failure", "ready_for_replay", "replaying", "resolved"],
      default: "retriable",
    },
    dlqEntryTime: {
      type: Date,
      default: Date.now,
    },
    lastFailureTime: Date,
    lastRetryTime: Date,
    lastReplayTime: Date,
    nextRetryTime: Date,
    replayCount: {
      type: Number,
      default: 0,
    },
    manualRetryCount: {
      type: Number,
      default: 0,
    },
    retryHistory: [
      {
        timestamp: Date,
        reason: String,
        overrideLogic: mongoose.Schema.Types.Mixed,
      },
    ],
    resolution: String, // Why message was resolved (if applicable)
    resolvedAt: Date,
    investigationNotes: String,
    tags: [String], // For categorization
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient querying
failedMessageSchema.index({ tenantId: 1, status: 1 });
failedMessageSchema.index({ tenantId: 1, correlationId: 1 });
failedMessageSchema.index({ tenantId: 1, dlqEntryTime: 1 });
failedMessageSchema.index({ nextRetryTime: 1 }); // For batch retry queries

// TTL index: Delete resolved messages after 90 days
failedMessageSchema.index(
  { resolvedAt: 1 },
  {
    expireAfterSeconds: 7776000, // 90 days
    partialFilterExpression: { status: "resolved" },
  }
);

module.exports = mongoose.model("FailedMessage", failedMessageSchema);
