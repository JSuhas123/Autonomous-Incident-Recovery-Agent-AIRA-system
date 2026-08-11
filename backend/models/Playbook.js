'use strict';

const mongoose = require('mongoose');
const {
  LIFECYCLE_VALUES,
  STAGE_TYPE_VALUES,
  FAILURE_POLICY_VALUES,
  ROLLBACK_STRATEGY_VALUES,
  RISK_LEVEL_VALUES,
  APPROVAL_MODE_VALUES,
  OWNER_TYPE_VALUES,
  PLAYBOOK_LIFECYCLE,
} = require('../constants/playbook');

// ── Runbook reference ──────────────────────────────────────────────────────
const runbookRefSchema = new mongoose.Schema({
  runbookId:          { type: String, required: true },
  versionConstraint:  { type: String, default: null }, // e.g. ">=1.0.0", null = latest
  required:           { type: Boolean, default: true },
  parameterMappings:  { type: mongoose.Schema.Types.Mixed, default: {} },
  conditions:         { type: mongoose.Schema.Types.Mixed, default: {} },
  description:        { type: String },
}, { _id: false });

// ── Stage ──────────────────────────────────────────────────────────────────
const stageSchema = new mongoose.Schema({
  id:           { type: String, required: true },
  order:        { type: Number, required: true },
  name:         { type: String, required: true },
  type:         { type: String, enum: STAGE_TYPE_VALUES, required: true },
  description:  { type: String },
  conditions:   { type: mongoose.Schema.Types.Mixed, default: {} },
  runbooks:     [runbookRefSchema],
  failurePolicy:{ type: String, enum: FAILURE_POLICY_VALUES, default: 'STOP' },
}, { _id: false });

// ── Main schema ────────────────────────────────────────────────────────────
const playbookSchema = new mongoose.Schema(
  {
    // ── Identity
    apiVersion:   { type: String, default: 'aira.io/v1' },
    kind:         { type: String, default: 'Playbook' },
    playbookId:   { type: String, required: true, index: true },
    semver:       { type: String, required: true },
    name:         { type: String, required: true },
    description:  { type: String },
    category:     { type: String },
    lifecycle:    { type: String, enum: LIFECYCLE_VALUES, default: PLAYBOOK_LIFECYCLE.DRAFT },

    // ── Ownership
    tenantId:     { type: String, index: true, default: null },
    owner: {
      ownerType:  { type: String, enum: OWNER_TYPE_VALUES, default: 'system' },
      name:       { type: String },
      team:       { type: String },
    },

    // ── Incident matching
    incident: {
      types:        [{ type: String }],
      severities:   [{ type: String }],
      providers:    [{ type: String }],
      environments: [{ type: String }],
      serviceTypes: [{ type: String }],
    },

    // ── Triggers
    triggers: {
      all:  { type: mongoose.Schema.Types.Mixed, default: [] },
      any:  { type: mongoose.Schema.Types.Mixed, default: [] },
      none: { type: mongoose.Schema.Types.Mixed, default: [] },
    },

    // ── Required evidence fields
    requiredEvidence: [{ type: String }],

    // ── Eligibility conditions
    conditions: {
      minimumConfidence: { type: Number, min: 0, max: 1, default: 0.7 },
      requiredSignals:   [{ type: String }],
      safetyConditions:  { type: mongoose.Schema.Types.Mixed },
    },

    // ── Risk
    risk: {
      level:       { type: String, enum: RISK_LEVEL_VALUES },
      blastRadius: { type: String },
    },

    // ── Policy
    policy: {
      required:    { type: Boolean, default: false },
      constraints: { type: mongoose.Schema.Types.Mixed },
    },

    // ── Approval
    approval: {
      mode:       { type: String, enum: APPROVAL_MODE_VALUES, default: 'AUTOMATIC' },
      conditions: { type: mongoose.Schema.Types.Mixed },
    },

    // ── Stages (the core orchestration definition)
    stages: [stageSchema],

    // ── Rollback
    rollback: {
      strategy:    { type: String, enum: ROLLBACK_STRATEGY_VALUES, default: 'NONE' },
      maxAttempts: { type: Number, default: 1 },
      stages:      [{ type: String }],  // stage IDs to run on rollback
    },

    // ── Escalation
    escalation: {
      maxRecoveryAttempts: { type: Number, default: 3 },
      condition:           { type: String },
      escalateTo:          { type: String },
      notifyChannels:      [{ type: String }],
    },

    // ── Outcome configuration
    outcome: {
      captureLearning:      { type: Boolean, default: false },
      updateIncidentMemory: { type: Boolean, default: false },
      successMetrics:       [{ type: String }],
    },

    // ── Versioning / immutability
    checksum:  { type: String },
    immutable: { type: Boolean, default: false },

    // ── Audit
    tags: [{ type: String }],
  },
  {
    timestamps: true,
    strict: true,
  },
);

// ── Compound indexes ───────────────────────────────────────────────────────
playbookSchema.index({ playbookId: 1, semver: 1 }, { unique: true });
playbookSchema.index({ tenantId: 1, lifecycle: 1 });
playbookSchema.index({ 'incident.types': 1, lifecycle: 1 });
playbookSchema.index({ 'incident.severities': 1, lifecycle: 1 });

// TTL — 2 years (playbooks are long-lived)
playbookSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63_072_000 });

module.exports = mongoose.model('Playbook', playbookSchema);
