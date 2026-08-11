'use strict';

/**
 * Runbook Versioning Utilities — Phase C
 *
 * Canonical identity: runbookId + semver (e.g. RB-K8S-POD-RESTART@1.0.0)
 *
 * Once a version has been executed its definition is immutable:
 * all mutations require a new semver.
 */

const crypto = require('crypto');

// ── Semver helpers ─────────────────────────────────────────────────────────

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(-[\w.]+)?(\+[\w.]+)?$/;

/**
 * Parse a semver string into { major, minor, patch, preRelease, buildMeta }.
 * Throws for invalid input.
 */
function parseSemver(semver) {
  if (typeof semver !== 'string') throw new TypeError(`semver must be a string, got ${typeof semver}`);
  const m = semver.match(SEMVER_RE);
  if (!m) throw new Error(`Invalid semver: "${semver}"`);
  return {
    major:      parseInt(m[1], 10),
    minor:      parseInt(m[2], 10),
    patch:      parseInt(m[3], 10),
    preRelease: m[4] ? m[4].slice(1) : null,
    buildMeta:  m[5] ? m[5].slice(1) : null,
  };
}

/**
 * Compare two semver strings.
 * Returns: -1 (a < b), 0 (a === b), 1 (a > b)
 */
function compareVersions(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);

  for (const field of ['major', 'minor', 'patch']) {
    if (pa[field] !== pb[field]) return pa[field] < pb[field] ? -1 : 1;
  }

  // Pre-release lowers precedence; no pre-release > has pre-release
  if (!pa.preRelease && pb.preRelease)  return 1;
  if (pa.preRelease  && !pb.preRelease) return -1;
  if (pa.preRelease  && pb.preRelease)  return pa.preRelease < pb.preRelease ? -1 : pa.preRelease > pb.preRelease ? 1 : 0;

  return 0;
}

/**
 * Return true if version a is strictly newer than b.
 */
function isNewerVersion(a, b) {
  return compareVersions(a, b) > 0;
}

/**
 * Select the latest version from an array of semver strings.
 * Throws if the array is empty.
 */
function getLatestVersion(versions) {
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error('getLatestVersion: versions array must be non-empty');
  }
  return versions.reduce((best, v) => compareVersions(v, best) > 0 ? v : best);
}

/**
 * Validate that a new version is strictly newer than all existing versions.
 * Returns { valid, reason }.
 */
function validateNewVersion(newVersion, existingVersions) {
  try {
    parseSemver(newVersion);
  } catch (e) {
    return { valid: false, reason: e.message };
  }

  if (existingVersions && existingVersions.length > 0) {
    const latest = getLatestVersion(existingVersions);
    if (compareVersions(newVersion, latest) <= 0) {
      return {
        valid:  false,
        reason: `New version "${newVersion}" must be strictly greater than existing latest "${latest}"`,
      };
    }
  }

  return { valid: true };
}

// ── Canonical serialization + checksum ────────────────────────────────────

/** Fields included in the canonical serialization (deterministic order). */
const CANONICAL_FIELDS = [
  'apiVersion', 'kind', 'runbookId', 'semver', 'name', 'description',
  'lifecycle', 'owner', 'scope', 'risk', 'parameters', 'steps',
  'rollbackConfig', 'verification', 'notifications', 'auditConfig',
];

/**
 * Produce a stable canonical JSON string for checksum calculation.
 * Only CANONICAL_FIELDS are included; keys within objects are sorted.
 */
function canonicalSerialize(runbook) {
  const obj = {};
  for (const field of CANONICAL_FIELDS) {
    if (runbook[field] !== undefined) {
      obj[field] = runbook[field];
    }
  }
  return _stableStringify(obj);
}

/**
 * SHA-256 hex digest of the canonical serialization.
 */
function computeChecksum(runbook) {
  return crypto.createHash('sha256').update(canonicalSerialize(runbook)).digest('hex');
}

/**
 * Return the canonical version reference string: runbookId@semver.
 */
function versionRef(runbookId, semver) {
  return `${runbookId}@${semver}`;
}

// ── Private helpers ────────────────────────────────────────────────────────

function _stableStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(_stableStringify).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + _stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

module.exports = {
  parseSemver,
  compareVersions,
  isNewerVersion,
  getLatestVersion,
  validateNewVersion,
  canonicalSerialize,
  computeChecksum,
  versionRef,
};
