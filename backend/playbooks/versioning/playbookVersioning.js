'use strict';

/**
 * Playbook Versioning
 *
 * Wraps runbook versioning utilities adapted for Playbooks.
 * Provides stable checksum for Playbook definitions.
 */

const crypto = require('crypto');

// Re-use semver utilities from runbook versioning
const {
  parseSemver,
  compareVersions,
  isNewerVersion,
  getLatestVersion,
  validateNewVersion,
} = require('../../runbooks/versioning/runbookVersioning');

// ── Playbook canonical fields for checksum ────────────────────────────────

const PLAYBOOK_CANONICAL_FIELDS = [
  'apiVersion',
  'kind',
  'playbookId',
  'semver',
  'name',
  'description',
  'lifecycle',
  'owner',
  'risk',
  'conditions',
  'triggers',
  'requiredEvidence',
  'stages',
  'rollback',
  'escalation',
  'policy',
  'approval',
  'outcome',
];

// ── Canonical serialization ───────────────────────────────────────────────

function canonicalSerializePlaybook(playbook) {
  const canonical = {};

  for (const field of PLAYBOOK_CANONICAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(playbook, field)) {
      canonical[field] = playbook[field];
    }
  }

  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

// ── Checksum ──────────────────────────────────────────────────────────────

function computePlaybookChecksum(playbook) {
  const serialized = canonicalSerializePlaybook(playbook);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

// ── Version ref ───────────────────────────────────────────────────────────

function playbookVersionRef(playbookId, semver) {
  if (!playbookId || !semver) throw new Error('playbookVersionRef requires playbookId and semver');
  return `${playbookId}@${semver}`;
}

// ── Re-exports ────────────────────────────────────────────────────────────

module.exports = {
  // Playbook-specific
  computePlaybookChecksum,
  canonicalSerializePlaybook,
  playbookVersionRef,
  PLAYBOOK_CANONICAL_FIELDS,

  // Re-exported from runbook versioning
  parseSemver,
  compareVersions,
  isNewerVersion,
  getLatestVersion,
  validateNewVersion,
};
