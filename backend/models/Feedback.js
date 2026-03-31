const mongoose = require("mongoose");

/**
 * Feedback Model
 * Stores human feedback on decisions for learning and improvement
 */
const feedbackSchema = new mongoose.Schema(
  {
    feedbackId: {
      type: String,
      required: true,
      unique: true,
    },
    tenantId: {
      type: String,
      required: true,
    },
    decisionId: {
      type: String,
      required: true,
    },
    correlationId: {
      type: String,
    },
    feedback: {
      type: String,
      enum: ["correct", "incorrect", "partial"],
      required: true,
    },
    notes: String,
    providedBy: {
      type: String,
      required: true, // User ID or system
    },
    providedAt: {
      type: Date,
      default: Date.now,
    },
    // Impact tracking
    impactOnConfidence: {
      type: Number,
      default: 0, // -1 to +1 adjustment
    },
    impactOnMemory: {
      type: String,
      enum: ["updated", "flagged", "none"],
      default: "none",
    },
    // Cross-reference to decision impact
    originalDecision: {
      recommendedAction: String,
      confidence: Number,
      policyMatches: [String],
    },
    correctionSuggestion: String,
    // Analytics
    actionTaken: {
      type: Boolean,
      default: false, // Was correction applied?
    },
    actionDescription: String,
  },
  { timestamps: true }
);

// Index for queries
feedbackSchema.index({ tenantId: 1, decisionId: 1 });
feedbackSchema.index({ tenantId: 1, providedAt: -1 });
feedbackSchema.index({ tenantId: 1, feedback: 1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
