const mongoose = require('mongoose');

/**
 * AgentIntelligenceRun — persistent record of one full orchestrator run.
 * Reuses correlationId/incidentId for cross-reference with V1 audit.
 */
const agentRunSchema = new mongoose.Schema(
  {
    runId:         { type: String, required: true, unique: true },
    incidentId:    { type: String, required: true },
    correlationId: { type: String, required: true },
    tenantId:      { type: String, required: true },
    state:         { type: String, required: true },
    startedAt:     { type: Date,   required: true },
    completedAt:   { type: Date },
    manualRequired:{ type: Boolean, default: false },
    manualReason:  { type: String },
    error:         { type: String },

    agentTrace: [
      {
        agent:        String,
        version:      String,
        status:       String,
        startedAt:    String,
        completedAt:  String,
        durationMs:   Number,
        confidence:   Number,
        evidenceUsed: [String],
        // Structured rationale summary only — NOT raw chain-of-thought
        result:       mongoose.Schema.Types.Mixed,
        warnings:     [String],
        error:        String,
        model:        String,
        provider:     String,
        fallbackUsed: Boolean,
        tokenEstimate:Number,
      },
    ],

    // Summary references — not full objects (those live in V1)
    playbookExecutionId: String,
    explanationTitle:    String,
    finalOutcome:        String,
    learningCount:       Number,
  },
  { collection: 'agent_intelligence_runs', timestamps: true },
);

agentRunSchema.index({ tenantId: 1, incidentId: 1 });
agentRunSchema.index({ tenantId: 1, createdAt: -1 });
agentRunSchema.index({ tenantId: 1, state: 1 });
// TTL: 30 days
agentRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('AgentIntelligenceRun', agentRunSchema);
