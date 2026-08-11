'use strict';

/**
 * AIRA YAML Runbook Loader
 *
 * Loads one or more Runbook YAML files from the filesystem, detects their
 * format, normalises legacy format to Canonical Runbook v1, validates each
 * normalised definition through the authoritative validateRunbook() pipeline,
 * and returns a structured result separating accepted from rejected definitions.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * IMPORT LIFECYCLE CONTRACT
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  - The loader NEVER writes to the database.
 *  - The loader NEVER activates a Runbook.
 *  - A canonical YAML that declares lifecycle: ACTIVE is accepted AS REQUESTED
 *    metadata; the loader does not override it, but activation requires a
 *    separate Registry operation.
 *  - Legacy YAMLs always import with lifecycle: DRAFT (enforced by normaliser).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * FORMAT DETECTION
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  FORMAT.CANONICAL  – apiVersion === 'aira.io/v1' AND kind === 'Runbook'
 *  FORMAT.LEGACY     – has legacy root fields (id, steps[].step, etc.) but
 *                      does NOT have canonical envelope
 *  FORMAT.UNKNOWN    – neither canonical nor recognisably legacy
 *
 *  Unknown formats are rejected with RUNBOOK_UNKNOWN_FORMAT.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * YAML SECURITY
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  - CORE_SCHEMA only (no !!python/object, !!js/undefined, or other custom tags)
 *  - Single document per file (loadAll rejects multi-document files)
 *  - Maximum raw file size: 512 KB (configurable via options.maxFileSizeBytes)
 *  - Maximum object depth: 20 levels  (configurable via options.maxDepth)
 *  - Maximum alias references per document: 50 (configurable)
 *  - No prototype injection: result is plain-object-validated after parse
 *
 * ──────────────────────────────────────────────────────────────────────────
 * DIAGNOSTIC CODES EMITTED BY THE LOADER
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  RUNBOOK_YAML_PARSE_ERROR         – YAML is syntactically invalid
 *  RUNBOOK_YAML_MULTI_DOCUMENT      – file contains more than one YAML document
 *  RUNBOOK_YAML_NOT_OBJECT          – YAML root is not a plain object
 *  RUNBOOK_YAML_TOO_LARGE           – file exceeds size limit
 *  RUNBOOK_YAML_DEPTH_EXCEEDED      – object nesting exceeds depth limit
 *  RUNBOOK_UNKNOWN_FORMAT           – format cannot be identified as canonical or legacy
 *  RUNBOOK_DUPLICATE_DEFINITION     – same runbookId+semver already loaded in this session
 *  (plus all codes from validateRunbook pipeline and RUNBOOK_LEGACY_* from normaliser)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ACCEPTED / REJECTED RESULT CONTRACT
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  LoadResult = {
 *    accepted: AcceptedEntry[],
 *    rejected: RejectedEntry[],
 *  }
 *
 *  AcceptedEntry = {
 *    file:       string,             // absolute or relative path
 *    runbook:    object,             // canonical Runbook v1 plain object
 *    validation: PipelineResult,     // from validateRunbook()
 *    migration:  MigrationResult,    // from normaliser (null for canonical format)
 *  }
 *
 *  RejectedEntry = {
 *    file:        string,
 *    diagnostics: Diagnostic[],      // loader or pipeline diagnostics
 *    migration:   MigrationResult,   // from normaliser if reached that stage (may be null)
 *  }
 */

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { validateRunbook, VALIDATION_PURPOSE } = require('../validators/runbookValidator');
const { normaliseLegacyRunbook }              = require('../normalizers/legacyRunbookNormalizer');
const { RUNBOOK_API_VERSION, RUNBOOK_KIND }   = require('../../constants/runbook');

// ── Format identifiers ─────────────────────────────────────────────────────

const FORMAT = Object.freeze({
  CANONICAL: 'CANONICAL',
  LEGACY:    'LEGACY',
  UNKNOWN:   'UNKNOWN',
});

// Legacy format heuristics — presence of ANY of these fields (and absence of
// canonical envelope) identifies the document as legacy AIRA format.
const LEGACY_INDICATOR_FIELDS = new Set([
  'id', 'severity', 'services', 'estimatedDuration',
  'triggers', 'preconditions', 'postconditions', 'notificationChannels',
]);

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS = {
  maxFileSizeBytes: 512 * 1024, // 512 KB
  maxDepth:         20,
  maxAliases:       50,
  validationContext: {},        // injected into validateRunbook
};

// ── Inline diagnostic builders (loader-specific) ──────────────────────────

function loaderError(code, message) {
  return Object.freeze({ code, path: '', message, severity: 'ERROR' });
}

// ── Depth checker ──────────────────────────────────────────────────────────

function checkDepth(value, max, current = 0, seen = new WeakSet()) {
  if (current > max) return true; // exceeded
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.some(v => checkDepth(v, max, current + 1, seen));
}

// ── Prototype-injection guard ──────────────────────────────────────────────

/**
 * Return true if the parsed object contains any key that could inject into
 * Object.prototype (__proto__, constructor, prototype).
 */
function hasDangerousKey(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const keys = Object.keys(value);
  if (keys.some(k => k === '__proto__' || k === 'constructor' || k === 'prototype')) return true;
  return keys.some(k => hasDangerousKey(value[k], seen));
}

// ── Alias-count approximation ──────────────────────────────────────────────

// js-yaml CORE_SCHEMA forbids custom tag handlers but allows aliases.
// We count structural sharing after parse (same object reference).
function countAliases(value, seen = new WeakSet(), count = { n: 0 }) {
  if (value === null || typeof value !== 'object') return count.n;
  if (seen.has(value)) { count.n++; return count.n; }
  seen.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  children.forEach(v => countAliases(v, seen, count));
  return count.n;
}

// ── Format detection ────────────────────────────────────────────────────────

function detectFormat(doc) {
  if (
    doc.apiVersion === RUNBOOK_API_VERSION &&
    doc.kind === RUNBOOK_KIND
  ) {
    return FORMAT.CANONICAL;
  }
  // Check for legacy indicators: must have at least 2 known legacy fields
  const legacyCount = LEGACY_INDICATOR_FIELDS.size
    ? [...LEGACY_INDICATOR_FIELDS].filter(f => f in doc).length
    : 0;
  if (legacyCount >= 2) return FORMAT.LEGACY;
  return FORMAT.UNKNOWN;
}

// ── Single-file pipeline ────────────────────────────────────────────────────

/**
 * Parse and validate a single YAML content string.
 *
 * @param {string} content   - raw YAML text
 * @param {string} filePath  - path used in diagnostics
 * @param {object} opts      - merged options
 * @returns {{ runbook, migration, diagnostics, format, valid }}
 *   diagnostics: loader-level issues (not yet pipeline-level)
 *   valid: false if loader-level rejection occurred
 */
function parseYaml(content, filePath, opts) {
  const diagnostics = [];

  // Size guard
  if (Buffer.byteLength(content, 'utf8') > opts.maxFileSizeBytes) {
    diagnostics.push(loaderError(
      'RUNBOOK_YAML_TOO_LARGE',
      `File exceeds maximum size of ${opts.maxFileSizeBytes} bytes.`,
    ));
    return { valid: false, diagnostics };
  }

  // Multi-document detection: count --- document separators
  // js-yaml loadAll would parse multiple docs; we reject them.
  let docCount = 0;
  let parsed;
  try {
    yaml.loadAll(content, doc => { docCount++; if (docCount === 1) parsed = doc; }, {
      schema: yaml.CORE_SCHEMA,
      filename: filePath,
    });
  } catch (e) {
    diagnostics.push(loaderError('RUNBOOK_YAML_PARSE_ERROR', e.message));
    return { valid: false, diagnostics };
  }

  if (docCount > 1) {
    diagnostics.push(loaderError(
      'RUNBOOK_YAML_MULTI_DOCUMENT',
      `File contains ${docCount} YAML documents. Only single-document files are supported.`,
    ));
    return { valid: false, diagnostics };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    diagnostics.push(loaderError(
      'RUNBOOK_YAML_NOT_OBJECT',
      'YAML root value must be a plain object (mapping), not a scalar or sequence.',
    ));
    return { valid: false, diagnostics };
  }

  // Prototype injection guard
  if (hasDangerousKey(parsed)) {
    diagnostics.push(loaderError(
      'RUNBOOK_YAML_PARSE_ERROR',
      'Parsed YAML contains dangerous object keys (__proto__, constructor, or prototype).',
    ));
    return { valid: false, diagnostics };
  }

  // Alias bomb guard
  const aliasCount = countAliases(parsed);
  if (aliasCount > opts.maxAliases) {
    diagnostics.push(loaderError(
      'RUNBOOK_YAML_PARSE_ERROR',
      `Parsed YAML contains ${aliasCount} alias references, exceeding the limit of ${opts.maxAliases}.`,
    ));
    return { valid: false, diagnostics };
  }

  // Depth guard
  if (checkDepth(parsed, opts.maxDepth)) {
    diagnostics.push(loaderError(
      'RUNBOOK_YAML_DEPTH_EXCEEDED',
      `Object nesting exceeds the maximum depth of ${opts.maxDepth}.`,
    ));
    return { valid: false, diagnostics };
  }

  // Format detection
  const format = detectFormat(parsed);

  if (format === FORMAT.UNKNOWN) {
    diagnostics.push(loaderError(
      'RUNBOOK_UNKNOWN_FORMAT',
      'Document is neither a Canonical AIRA Runbook v1 (apiVersion+kind) nor a recognisable legacy format.',
    ));
    return { valid: false, diagnostics, format, parsed };
  }

  return { valid: true, diagnostics, format, parsed };
}

/**
 * Normalise a parsed document (if legacy) and run the validation pipeline.
 *
 * @returns {{ runbook, migration, pipelineResult, loaderDiagnostics }}
 */
function normalize(parsed, format, filePath, opts) {
  let runbook;
  let migration = null;
  const loaderDiagnostics = [];

  const source = {
    file:   filePath,
    format,
    originalVersion: parsed.version || parsed.semver || parsed.metadata?.version || null,
  };

  if (format === FORMAT.LEGACY) {
    try {
      const result = normaliseLegacyRunbook(parsed, source);
      runbook   = result.canonicalRunbook;
      migration = result.migration;
    } catch (e) {
      loaderDiagnostics.push(loaderError('RUNBOOK_YAML_PARSE_ERROR', `Normalisation error: ${e.message}`));
      return { valid: false, loaderDiagnostics, migration };
    }
  } else {
    // FORMAT.CANONICAL — use as-is
    runbook = parsed;
  }

  const ctx = Object.assign({}, opts.validationContext, {
    purpose: VALIDATION_PURPOSE.IMPORT,
  });

  const pipelineResult = validateRunbook(runbook, ctx);

  return {
    valid:             pipelineResult.valid,
    runbook,
    migration,
    pipelineResult,
    loaderDiagnostics,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Load and validate a single YAML file.
 *
 * @param {string} filePath
 * @param {object} [options]
 * @returns {LoadResult}  { accepted: [], rejected: [] }
 */
function loadFile(filePath, options = {}) {
  const opts = Object.assign({}, DEFAULT_OPTIONS, options);
  const accepted = [];
  const rejected = [];

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    rejected.push({
      file: filePath,
      diagnostics: [loaderError('RUNBOOK_YAML_PARSE_ERROR', `Cannot read file: ${e.message}`)],
      migration: null,
    });
    return { accepted, rejected };
  }

  const parsed_result = parseYaml(content, filePath, opts);

  if (!parsed_result.valid) {
    rejected.push({ file: filePath, diagnostics: parsed_result.diagnostics, migration: null });
    return { accepted, rejected };
  }

  const norm = normalize(parsed_result.parsed, parsed_result.format, filePath, opts);

  if (norm.loaderDiagnostics.length > 0) {
    rejected.push({ file: filePath, diagnostics: norm.loaderDiagnostics, migration: norm.migration });
    return { accepted, rejected };
  }

  if (norm.valid) {
    accepted.push({ file: filePath, runbook: norm.runbook, validation: norm.pipelineResult, migration: norm.migration });
  } else {
    rejected.push({ file: filePath, diagnostics: norm.pipelineResult.diagnostics, migration: norm.migration });
  }

  return { accepted, rejected };
}

/**
 * Load all .yaml/.yml files in a directory (non-recursive by default).
 * Detects duplicate runbookId+semver across the loaded set.
 *
 * @param {string} dirPath
 * @param {object} [options]
 * @param {boolean} [options.recursive=false]
 * @returns {LoadResult}  { accepted: [], rejected: [] }
 */
function loadDirectory(dirPath, options = {}) {
  const opts     = Object.assign({}, DEFAULT_OPTIONS, options);
  const accepted = [];
  const rejected = [];

  let entries;
  try {
    entries = fs.readdirSync(dirPath);
  } catch (e) {
    rejected.push({
      file: dirPath,
      diagnostics: [loaderError('RUNBOOK_YAML_PARSE_ERROR', `Cannot read directory: ${e.message}`)],
      migration: null,
    });
    return { accepted, rejected };
  }

  const yamlFiles = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    let stat;
    try { stat = fs.statSync(fullPath); } catch { continue; }

    if (stat.isDirectory() && opts.recursive) {
      const sub = loadDirectory(fullPath, opts);
      accepted.push(...sub.accepted);
      rejected.push(...sub.rejected);
    } else if (stat.isFile() && /\.(yaml|yml)$/i.test(entry)) {
      yamlFiles.push(fullPath);
    }
  }

  // Sort for deterministic ordering (filesystem ordering is non-deterministic)
  yamlFiles.sort();

  for (const fp of yamlFiles) {
    const result = loadFile(fp, opts);
    accepted.push(...result.accepted);
    rejected.push(...result.rejected);
  }

  // ── Duplicate detection ────────────────────────────────────────────────
  const seen = new Map(); // key: "runbookId::semver" → file
  const duplicateFiles = new Set();

  for (const entry of accepted) {
    const id = entry.runbook.runbookId || entry.runbook.name || '(unnamed)';
    const ver = entry.runbook.semver || '(no-version)';
    const key = `${id}::${ver}`;

    if (seen.has(key)) {
      duplicateFiles.add(entry.file);
      // Also flag the first occurrence if not already flagged
      duplicateFiles.add(seen.get(key));
    } else {
      seen.set(key, entry.file);
    }
  }

  if (duplicateFiles.size > 0) {
    const surviving  = [];
    const duplicated = [];

    for (const entry of accepted) {
      if (duplicateFiles.has(entry.file)) {
        duplicated.push({
          file: entry.file,
          diagnostics: [loaderError(
            'RUNBOOK_DUPLICATE_DEFINITION',
            `Duplicate runbookId+version: ${entry.runbook.runbookId || entry.runbook.name} @ ${entry.runbook.semver || '(no-version)'}.`,
          )],
          migration: entry.migration,
        });
      } else {
        surviving.push(entry);
      }
    }

    return {
      accepted: surviving,
      rejected: [...rejected, ...duplicated],
    };
  }

  return { accepted, rejected };
}

/**
 * Validate an already-normalised canonical runbook plain object.
 * Convenience wrapper for callers that own normalisation themselves.
 *
 * @param {object} runbook
 * @param {object} [context]
 * @returns {PipelineResult}
 */
function validateImported(runbook, context = {}) {
  return validateRunbook(runbook, Object.assign({}, context, {
    purpose: VALIDATION_PURPOSE.IMPORT,
  }));
}

module.exports = {
  loadFile,
  loadDirectory,
  parseYaml: (content, source, options = {}) => {
    const opts = Object.assign({}, DEFAULT_OPTIONS, options);
    return parseYaml(content, source, opts);
  },
  normalize,
  validateImported,
  FORMAT,
};
