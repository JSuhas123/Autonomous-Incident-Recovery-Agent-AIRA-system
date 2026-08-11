'use strict';

const mongoose = require('mongoose');

/**
 * RunbookExecution — forensic-grade execution record (Phase L)
 *
 * Status lifecycle (uppercase):
 *   CREATED → VALIDATING → WAITING_FOR_APPROVAL → RUNNING
 *     → VERIFYING → SUCCEEDED
 *     → FAILED → ROLLBACK_PENDING → ROLLING_BACK → ROLLED_BACK | ROLLBACK_FAILED
 *     → ESCALATED | CANCELLED
 *
 * Immutability:
 *   - runbookSnapshot: frozen copy of the runbook definition at execution time
 *   - runbookChecksum: SHA-256 of canonical definition (tamper-detection)
 *   - resolvedParameters: provenance-tracked parameter values
 */

const EXECUTION_STATUS = [
  'CREATED', 'VALIDATING', 'WAITING_FOR_APPROVAL', 'RUNNING',
  'VERIFYING', 'SUCCEEDED', 'FAILED',
  'ROLLBACK_PENDING', 'ROLLING_BACK', 'ROLLED_BACK', 'ROLLBACK_FAILED',
  'ESCALATED', 'CANCELLED',
];

const STEP_STATUS = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'TIMED_OUT'];

// ── Resolved parameter ─────────────────────────────────────────────────────
const resolvedParameterSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  value:      { type: mongoose.Schema.Types.Mixed },
  source:     { type: String },
  confidence: { type: Number },
  resolvedAt: { type: String },
  sensitive:  { type: Boolean, default: false },
  redacted:   { type: Boolean, default: false },
}, { _id: false });

// ── Step attempt ───────────────────────────────────────────────────────────
const stepAttemptSchema = new mongoose.Schema({
  stepId:         { type: String, required: true },
  attemptNumber:  { type: Number, default: 1 },
  type:           { type: String },
  action:         { type: String },
  status:         { type: String, enum: STEP_STATUS, default: 'PENDING' },
  startedAt:      { type: Date },
  completedAt:    { type: Date },
  durationMs:     { type: Number },
  params:         { type: mongoose.Schema.Types.Mixed },  // runtime params (sensitive redacted)
  output:         { type: mongoose.Schema.Types.Mixed },
  preState:       { type: mongoose.Schema.Types.Mixed },
  postState:      { type: mongoose.Schema.Types.Mixed },
  error:          { type: String },
  timedOut:       { type: Boolean, default: false },
  evidence:       [{ type: String }],
}, { _id: false });

// ── Rollback step result ───────────────────────────────────────────────────
const rollbackStepResultSchema = new mongoose.Schema({
  stepId:  { type: String },
  status:  { type: String },
  result:  { type: mongoose.Schema.Types.Mixed },
  error:   { type: String },
  message: { type: String },
}, { _id: false });

// ── Rollback state ─────────────────────────────────────────────────────────
const rollbackStateSchema = new mongoose.Schema({
  strategy:    { type: String },
  triggeredAt: { type: Date },
  completedAt: { type: Date },
  success:     { type: Boolean },
  skipped:     { type: Boolean },
  reason:      { type: String },
  stepResults: [rollbackStepResultSchema],
}, { _id: false });

// ── Verification check result ──────────────────────────────────────────────
const verificationCheckSchema = new mongoose.Schema({
  id:            { type: String },
  type:          { type: String },
  result:        { type: String },
  observedValue: { type: mongoose.Schema.Types.Mixed },
  expected:      { type: mongoose.Schema.Types.Mixed },
  evidence:      { type: mongoose.Schema.Types.Mixed },
  error:         { type: String },
  durationMs:    { type: Number },
  timestamp:     { type: String },
}, { _id: false });

// ── Verification result ────────────────────────────────────────────────────
const verificationResultSchema = new mongoose.Schema({
  passed:   { type: Boolean },
  strategy: { type: String },
  summary:  { type: String },
  skipped:  { type: Boolean },
  checks:   [verificationCheckSchema],
}, { _id: false });

// ── Policy / approval ──────────────────────────────────────────────────────
const policyDecisionSchema = new mongoose.Schema({
  allowed:     { type: Boolean },
  policyId:    { type: String },
  reason:      { type: String },
  decidedAt:   { type: Date },
  decidedBy:   { type: String },
}, { _id: false });

// ── Main schema ────────────────────────────────────────────────────────────
const runbookExecutionSchema = new mongoose.Schema(
  {
    // ── Identity
    executionId:   { type: String, required: true, unique: true },
    tenantId:      { type: String, index: true },
    orgId:         { type: String },
    incidentId:    { type: String, index: true },
    correlationId: { type: String, required: true, index: true },

    // ── Runbook identity + immutable snapshot
    runbookId:       { type: String, required: true, index: true },
    runbookVersion:  { type: String, required: true },
    runbookSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    runbookChecksum: { type: String, required: true },
    versionRef:      { type: String },  // "RB-K8S-POD-RESTART@1.0.0"

    // ── Resolved parameters (sensitive values redacted in stored copy)
    resolvedParameters: [resolvedParameterSchema],

    // ── Policy + approval
    policyDecision: policyDecisionSchema,
    approvalId:     { type: String },
    approver:       { type: String },
    approvedAt:     { type: Date },

    // ── Status
    status: {
      type:    String,
      enum:    EXECUTION_STATUS,
      default: 'CREATED',
      required: true,
    },
    statusReason: { type: String },

    // ── Timing
    createdAt_:   { type: Date, default: Date.now },  // alias for TTL
    startedAt:    { type: Date },
    completedAt:  { type: Date },
    durationMs:   { type: Number },

    // ── Initiator
    initiatedBy:  { type: String },
    initiatorType:{ type: String, enum: ['user', 'agent', 'system', 'api'], default: 'api' },

    // ── Execution trace
    stepAttempts: [stepAttemptSchema],

    // ── Verification
    verificationResult: verificationResultSchema,

    // ── Rollback
    rollbackState: rollbackStateSchema,

    // ── Aggregate state capture
    preExecutionState:  { type: mongoose.Schema.Types.Mixed },
    postExecutionState: { type: mongoose.Schema.Types.Mixed },

    // ── Audit references
    auditEventIds:  [{ type: String }],
    decisionTraceId:{ type: String },

    // ── Failure context
    failedStepId:  { type: String },
    errorMessage:  { type: String },
    errorCode:     { type: String },

    // ── Flags
    requiresHumanReview: { type: Boolean, default: false },
    escalated:           { type: Boolean, default: false },
    escalatedAt:         { type: Date },
    escalationReason:    { type: String },
  },
  {
    timestamps: true,
    strict:     true,
  },
);

// ── Indexes ────────────────────────────────────────────────────────────────
runbookExecutionSchema.index({ tenantId: 1, runbookId: 1, status: 1 });
runbookExecutionSchema.index({ tenantId: 1, incidentId: 1 });

// TTL — purge after 90 days (based on Mongoose timestamps createdAt)
runbookExecutionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7_776_000 },
);

// ── Statics ────────────────────────────────────────────────────────────────
runbookExecutionSchema.statics.EXECUTION_STATUS = EXECUTION_STATUS;
runbookExecutionSchema.statics.STEP_STATUS = STEP_STATUS;

module.exports = mongoose.model('RunbookExecution', runbookExecutionSchema);
module.exports.EXECUTION_STATUS = EXECUTION_STATUS;
module.exports.STEP_STATUS = STEP_STATUS;
