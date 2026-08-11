'use strict';

const mongoose = require('mongoose');
const {
  EXECUTION_STATUS_VALUES,
  STAGE_EXECUTION_STATUS_VALUES,
  PLAYBOOK_EXECUTION_STATUS,
} = require('../constants/playbook');

// ── Runbook execution reference (per-stage per-runbook) ───────────────────
const rbExecRefSchema = new mongoose.Schema({
  runbookId:        { type: String },
  runbookVersion:   { type: String },
  executionId:      { type: String },  // → RunbookExecution.executionId
  status:           { type: String },
  startedAt:        { type: Date },
  completedAt:      { type: Date },
  durationMs:       { type: Number },
  mappedParams:     { type: mongoose.Schema.Types.Mixed },  // redacted
  output:           { type: mongoose.Schema.Types.Mixed },
  error:            { type: String },
}, { _id: false });

// ── Stage execution ────────────────────────────────────────────────────────
const stageExecutionSchema = new mongoose.Schema({
  stageId:           { type: String, required: true },
  stageName:         { type: String },
  stageType:         { type: String },
  status:            { type: String, enum: STAGE_EXECUTION_STATUS_VALUES, default: 'PENDING' },
  startedAt:         { type: Date },
  completedAt:       { type: Date },
  durationMs:        { type: Number },
  runbookExecutions: [rbExecRefSchema],
  output:            { type: mongoose.Schema.Types.Mixed },
  error:             { type: String },
  skipped:           { type: Boolean, default: false },
  skippedReason:     { type: String },
}, { _id: false });

// ── Resolved mapping entry ─────────────────────────────────────────────────
const resolvedMappingSchema = new mongoose.Schema({
  key:        { type: String },
  rawExpr:    { type: String },
  value:      { type: mongoose.Schema.Types.Mixed },
  source:     { type: String },
  sensitive:  { type: Boolean, default: false },
  redacted:   { type: Boolean, default: false },
}, { _id: false });

// ── Approval record ────────────────────────────────────────────────────────
const approvalRecordSchema = new mongoose.Schema({
  approvalId:  { type: String },
  approver:    { type: String },
  approvedAt:  { type: Date },
  mode:        { type: String },
  decision:    { type: String },
}, { _id: false });

// ── Escalation record ──────────────────────────────────────────────────────
const escalationSchema = new mongoose.Schema({
  triggered:    { type: Boolean, default: false },
  triggeredAt:  { type: Date },
  reason:       { type: String },
  escalatedTo:  { type: String },
  notified:     { type: Boolean, default: false },
  channels:     [{ type: String }],
}, { _id: false });

// ── Rollback record ────────────────────────────────────────────────────────
const rollbackRecordSchema = new mongoose.Schema({
  strategy:    { type: String },
  triggeredAt: { type: Date },
  completedAt: { type: Date },
  success:     { type: Boolean },
  reason:      { type: String },
  stageResults:{ type: mongoose.Schema.Types.Mixed },
}, { _id: false });

// ── Outcome ────────────────────────────────────────────────────────────────
const outcomeSchema = new mongoose.Schema({
  successful:           { type: Boolean },
  recoveryTimeMs:       { type: Number },
  learningCaptured:     { type: Boolean, default: false },
  incidentMemoryUpdated:{ type: Boolean, default: false },
  summary:              { type: String },
  failureReason:        { type: String },
  humanInvolved:        { type: Boolean, default: false },
  rootContext:          { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

// ── Main schema ────────────────────────────────────────────────────────────
const playbookExecutionSchema = new mongoose.Schema(
  {
    // ── Identity
    executionId:      { type: String, required: true, unique: true },
    correlationId:    { type: String, required: true, index: true },
    tenantId:         { type: String, index: true },
    orgId:            { type: String },
    incidentId:       { type: String, index: true },

    // ── Playbook identity + snapshot
    playbookId:       { type: String, required: true, index: true },
    playbookVersion:  { type: String, required: true },
    playbookSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    playbookChecksum: { type: String, required: true },
    versionRef:       { type: String },  // "PB-K8S-CRASHLOOP-001@1.0.0"

    // ── Incident context (evidence used for matching/execution)
    incidentContext:  { type: mongoose.Schema.Types.Mixed },

    // ── Resolved parameter mappings (per stage, sensitive redacted)
    resolvedMappings: [resolvedMappingSchema],

    // ── Policy / approval
    policyDecision:   { type: mongoose.Schema.Types.Mixed },
    approval:         approvalRecordSchema,

    // ── Status
    status:           { type: String, enum: EXECUTION_STATUS_VALUES, default: 'CREATED', required: true },
    statusReason:     { type: String },

    // ── Timing
    startedAt:        { type: Date },
    completedAt:      { type: Date },
    durationMs:       { type: Number },

    // ── Initiator
    initiatedBy:      { type: String },
    initiatorType:    { type: String, enum: ['user', 'agent', 'system', 'api'], default: 'api' },

    // ── Stage executions (ordered array)
    stageExecutions:  [stageExecutionSchema],

    // ── Rollback
    rollback:         rollbackRecordSchema,

    // ── Escalation
    escalation:       escalationSchema,

    // ── Outcome
    outcome:          outcomeSchema,

    // ── Failure context
    failedStageId:    { type: String },
    errorMessage:     { type: String },
    errorCode:        { type: String },

    // ── Audit
    auditEventIds:    [{ type: String }],
    decisionTraceId:  { type: String },

    // ── Flags
    requiresHumanReview: { type: Boolean, default: false },
    matchScore:          { type: Number },
    matchReasons:        [{ type: String }],
  },
  {
    timestamps: true,
    strict: true,
  },
);

// ── Indexes ────────────────────────────────────────────────────────────────
playbookExecutionSchema.index({ tenantId: 1, playbookId: 1, status: 1 });
playbookExecutionSchema.index({ tenantId: 1, incidentId: 1 });

// TTL — 90 days
playbookExecutionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7_776_000 });

playbookExecutionSchema.statics.EXECUTION_STATUS = PLAYBOOK_EXECUTION_STATUS;

module.exports = mongoose.model('PlaybookExecution', playbookExecutionSchema);
module.exports.PLAYBOOK_EXECUTION_STATUS = PLAYBOOK_EXECUTION_STATUS;
