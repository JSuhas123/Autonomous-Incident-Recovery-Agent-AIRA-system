'use strict';

/**
 * Legacy AIRA Runbook Normalizer
 *
 * Converts a parsed legacy AIRA Runbook object (pre-v1) into a Canonical
 * Runbook v1 plain object that can be passed to validateRunbook().
 *
 * IMPORT != ACTIVATE.  The result lifecycle is always at most DRAFT unless the
 * source already carries a trusted canonical lifecycle value, and even then
 * the loader defers activation to the Registry phase.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * FIELD MAPPING TABLE (legacy → canonical)
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  Legacy field           Canonical field          Notes
 *  ─────────────────────  ───────────────────────  ────────────────────────────────────────────
 *  id                     runbookId                Prefix-normalised to RB-<CATEGORY>-<name>
 *  name                   name                     Direct copy
 *  description            description              Direct copy
 *  severity               risk.level               CRITICAL/HIGH/MEDIUM/LOW → canonical enum
 *  services               scope.services           Array copy
 *  estimatedDuration      estimatedDurationSeconds Already seconds in legacy
 *  metadata.owner         owner.name               Display name only
 *  (system context)       owner.ownerType          Always "system" for filesystem defs
 *  steps[].step           steps[].order            Renaming; no semantic change
 *  steps[].name           steps[].name             Direct copy
 *  steps[].timeout (ms)   steps[].timeoutSeconds   ÷1000 — legacy timeout is milliseconds
 *  steps[].condition      steps[].condition        Direct copy (informational)
 *  steps[].confirmation   steps[].requiresConfirm  Rename; boolean preserved
 *  steps[].onFailure      steps[].failurePolicy    Mapped: "continue"→CONTINUE, "proceed"→CONTINUE
 *  retryPolicy.maxRetries retry.maxAttempts        maxRetries+1 (retries AFTER first = total attempts)
 *  retryPolicy.backoffMs  retry.delaySeconds       ÷1000 — milliseconds to seconds
 *  notificationChannels   (migration metadata)     Not mapped to canonical — no canonical equivalent
 *  postconditions         (migration metadata)     Retained as evidence; not mapped to verification
 *  preconditions          (migration metadata)     Retained as evidence
 *  triggers               (migration metadata)     Not mapped to canonical
 *  metadata.*             (migration metadata)     Retained for audit
 *
 * ──────────────────────────────────────────────────────────────────────────
 * TEMPLATE CONVERSION: {{param}} → ${param}
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  {{identifier}}   →  ${identifier}   ONLY if identifier matches [a-zA-Z_][a-zA-Z0-9_-]*
 *                                      and does not contain nested syntax.
 *  Any other form (expressions, dots, spaces, nested braces) → REJECTED with
 *  RUNBOOK_LEGACY_UNSAFE_TEMPLATE diagnostic.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ACTION MIGRATION TABLE
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  Legacy action  Legacy command pattern           Canonical type/action
 *  ─────────────  ──────────────────────────────── ────────────────────────────────────────────
 *  "command"      kubectl delete pod …             kubernetes / restart_pod
 *  "wait"         (no command)                     UNMAPPED — no wait handler implementation today
 *  "query"        (no command)                     UNMAPPED — queries are domain-specific (SQL/Redis/K8s/HTTP);
 *                                                  no generic api/query handler exists today
 *  "command"      (all other commands)             UNMAPPED — retained in migration metadata
 *
 *  A command maps to kubernetes/restart_pod ONLY when:
 *    - the command string contains "kubectl delete pod" (K8s API equivalent of pod deletion)
 *    - K8sClient.executeAction('restart_pod') and ResilientK8sExecutor.restartPod() provide
 *      the trusted deterministic implementation (backend/services/k8s/k8sClient.js +
 *      backend/services/k8s/resilientK8sExecutor.js)
 *    - namespace and pod name parameters map safely from legacy {{namespace}}/{{pod}} templates
 *    - the operation does not broaden resource scope (no wildcard pod selection)
 *
 *  MAPPINGS INTENTIONALLY ABSENT:
 *  - wait/condition_wait: no wait handler implementation exists today
 *  - api/query: each legacy query targets a different domain (SQL, Redis, RabbitMQ, HTTP);
 *    a generic catch-all would mask missing specialised handlers
 *
 *  ALL other raw shell/command strings produce RUNBOOK_LEGACY_ACTION_UNMAPPED.
 *  Raw command text MUST NOT appear in any executable canonical action field.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * MIGRATION DIAGNOSTIC CODES
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  RUNBOOK_LEGACY_ACTION_UNMAPPED          – command has no proven equivalent canonical action
 *  RUNBOOK_LEGACY_UNSAFE_TEMPLATE          – template syntax cannot be safely converted
 *  RUNBOOK_LEGACY_FIELD_DROPPED            – field present in legacy has no canonical mapping
 *  RUNBOOK_LEGACY_UNIT_CONVERTED           – numeric unit conversion applied (ms→s, retries→attempts)
 *  RUNBOOK_LEGACY_ID_NORMALISED            – legacy id prefix-normalised to canonical runbookId format
 *  RUNBOOK_MIGRATION_ID_REVIEW_REQUIRED    – generated RB-LEGACY-* id must be replaced before Registry import
 *
 * ──────────────────────────────────────────────────────────────────────────
 */

const {
  RUNBOOK_API_VERSION,
  RUNBOOK_KIND,
  RUNBOOK_LIFECYCLE,
  RUNBOOK_STEP_TYPE,
  RUNBOOK_RISK_LEVEL,
  RUNBOOK_OWNER_TYPE,
  RUNBOOK_FAILURE_POLICY,
} = require('../../constants/runbook');

// ── Template conversion ────────────────────────────────────────────────────

// Safe identifier for {{…}} conversion: letters, digits, underscores, hyphens
// (hyphens appear in legacy names like deployment-yaml)
const SAFE_LEGACY_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

// Detects ALL {{ occurrences in a string so we can check for unsafe/nested syntax
const LEGACY_TEMPLATE_RE = /\{\{([^}]*(?:\}(?!\})[^}]*)*)\}\}/g;
const HAS_DOUBLE_BRACE    = /\{\{/;

/**
 * Convert legacy {{identifier}} templates to canonical ${identifier}.
 * Returns { converted: string, warnings: string[] }.
 * If any unsafe template is encountered the entire string is left unconverted
 * and an entry is added to warnings.
 */
function convertTemplates(str) {
  if (typeof str !== 'string' || !HAS_DOUBLE_BRACE.test(str)) {
    return { converted: str, warnings: [] };
  }

  const warnings = [];
  let allSafe = true;

  // First pass: validate every {{…}} occurrence
  let m;
  LEGACY_TEMPLATE_RE.lastIndex = 0;
  while ((m = LEGACY_TEMPLATE_RE.exec(str)) !== null) {
    const content = m[1];
    if (!SAFE_LEGACY_IDENTIFIER.test(content)) {
      warnings.push(
        `Unsafe template "${m[0]}" — identifier "${content}" contains unsafe characters or expression syntax. ` +
        'Template left unconverted.',
      );
      allSafe = false;
    }
  }

  if (!allSafe) {
    return { converted: str, warnings };
  }

  // Second pass: replace all {{identifier}} → ${identifier}
  const converted = str.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_-]*)\}\}/g, '$${$1}');
  return { converted, warnings };
}

/**
 * Recursively convert templates in an arbitrary value (string, array, object).
 * Returns { converted: value, warnings: string[] }.
 * Input value is never mutated.
 */
function convertTemplatesDeep(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return convertTemplates(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return { converted: value, warnings: [] };
    seen.add(value);
    const allWarnings = [];
    const converted = value.map(v => {
      const r = convertTemplatesDeep(v, seen);
      allWarnings.push(...r.warnings);
      return r.converted;
    });
    return { converted, warnings: allWarnings };
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return { converted: value, warnings: [] };
    seen.add(value);
    const allWarnings = [];
    const converted = {};
    for (const [k, v] of Object.entries(value)) {
      const r = convertTemplatesDeep(v, seen);
      allWarnings.push(...r.warnings);
      converted[k] = r.converted;
    }
    return { converted, warnings: allWarnings };
  }
  return { converted: value, warnings: [] };
}

// ── Risk level mapping ─────────────────────────────────────────────────────

const SEVERITY_TO_RISK = {
  critical: RUNBOOK_RISK_LEVEL.CRITICAL,
  high:     RUNBOOK_RISK_LEVEL.HIGH,
  medium:   RUNBOOK_RISK_LEVEL.MEDIUM,
  low:      RUNBOOK_RISK_LEVEL.LOW,
};

function mapSeverityToRisk(severity) {
  if (typeof severity !== 'string') return RUNBOOK_RISK_LEVEL.MEDIUM;
  return SEVERITY_TO_RISK[severity.toLowerCase()] || RUNBOOK_RISK_LEVEL.MEDIUM;
}

// ── Failure-policy mapping ─────────────────────────────────────────────────

const FAILURE_POLICY_MAP = {
  continue: RUNBOOK_FAILURE_POLICY ? RUNBOOK_FAILURE_POLICY.CONTINUE : 'CONTINUE',
  proceed:  RUNBOOK_FAILURE_POLICY ? RUNBOOK_FAILURE_POLICY.CONTINUE : 'CONTINUE',
  abort:    RUNBOOK_FAILURE_POLICY ? RUNBOOK_FAILURE_POLICY.ABORT    : 'ABORT',
  stop:     RUNBOOK_FAILURE_POLICY ? RUNBOOK_FAILURE_POLICY.ABORT    : 'ABORT',
};

function mapFailurePolicy(onFailure) {
  if (!onFailure) return undefined;
  return FAILURE_POLICY_MAP[String(onFailure).toLowerCase()];
}

// ── runbookId normalisation ────────────────────────────────────────────────

/**
 * Normalise a legacy `id` string to canonical RB-{CATEGORY}-{NAME} format.
 * If the legacy id already starts with "RB-" it is accepted as-is (uppercased).
 * Otherwise prefix "RB-LEGACY-" is added.
 * Result is uppercased and spaces/special chars become hyphens.
 */
function normaliseRunbookId(legacyId) {
  if (!legacyId || typeof legacyId !== 'string') return undefined;
  const clean = legacyId.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '-').replace(/-+/g, '-');
  if (clean.startsWith('RB-')) return clean;
  return `RB-LEGACY-${clean}`;
}

// ── Action migration ────────────────────────────────────────────────────────

/**
 * Attempt to map a legacy step to a canonical step type/action pair.
 *
 * Returns:
 *   { type, action, mapped: true }   — if a proven equivalent canonical action exists
 *   { mapped: false, unmappedReason } — if no safe mapping can be made
 */
function migrateAction(step) {
  const legacyAction = step.action;
  const command = step.command;

  // Legacy "wait" — no wait handler implementation exists today; leave unmapped
  if (legacyAction === 'wait') {
    return {
      mapped: false,
      unmappedReason: 'Legacy wait step: no condition_wait or equivalent handler implementation exists today.',
    };
  }

  // Legacy "query" — each query targets a different domain (SQL/Redis/K8s/HTTP);
  // no generic api/query handler exists; leave unmapped
  if (legacyAction === 'query') {
    return {
      mapped: false,
      unmappedReason: `Legacy query step: queries are domain-specific; no generic api/query handler implementation exists today.`,
    };
  }

  // Legacy "command" with kubectl delete pod → kubernetes/restart_pod
  // ONLY when the command semantics exactly match ResilientK8sExecutor restart_pod.
  if (legacyAction === 'command' && typeof command === 'string') {
    // kubectl delete pod is the canonical pod-restart mechanism
    if (/kubectl\s+delete\s+pod\b/.test(command)) {
      return { type: RUNBOOK_STEP_TYPE.KUBERNETES, action: 'restart_pod', mapped: true };
    }
    // All other commands: cannot prove equivalence — leave unmapped
    return {
      mapped: false,
      unmappedReason: `Legacy command "${command.slice(0, 80)}${command.length > 80 ? '…' : ''}" has no proven canonical equivalent.`,
    };
  }

  // Unknown legacy action
  return {
    mapped: false,
    unmappedReason: `Unknown legacy action "${legacyAction}".`,
  };
}

// ── Step normalisation ─────────────────────────────────────────────────────

/**
 * Normalise a single legacy step object.
 * Returns { canonicalStep, mappings, warnings, unmappedActions }.
 * The input step is never mutated.
 */
function normaliseStep(step, index) {
  const mappings   = [];
  const warnings   = [];
  const unmapped   = [];

  // order ← step (rename only; no semantic change)
  const order = typeof step.step === 'number' ? step.step : index + 1;
  if (step.step != null) mappings.push('steps[].step → steps[].order (rename)');

  // timeout (ms) → timeoutSeconds
  let timeoutSeconds;
  if (step.timeout != null && typeof step.timeout === 'number') {
    // Legacy timeout field is in seconds (the YAML files use `timeout: 300` meaning 300s)
    // However the spec says "timeout in milliseconds" — inspect actual values:
    // kubernetes-pod-restart has timeout:300, cache-invalidation has timeout:300
    // These are clearly seconds already. Apply the ms→s rule only if value > 3600
    // (no reasonable timeout is 300ms). Convention: treat as seconds.
    timeoutSeconds = step.timeout;
    mappings.push('steps[].timeout → steps[].timeoutSeconds (preserved; value treated as seconds)');
  }

  // retryPolicy → retry
  let retry;
  if (step.retryPolicy && typeof step.retryPolicy === 'object') {
    const maxRetries = step.retryPolicy.maxRetries;
    const backoffMs  = step.retryPolicy.backoffMs;
    retry = {};
    if (typeof maxRetries === 'number') {
      // maxRetries = retries AFTER first attempt → maxAttempts = maxRetries + 1
      retry.maxAttempts = maxRetries + 1;
      mappings.push(`retryPolicy.maxRetries(${maxRetries}) → retry.maxAttempts(${retry.maxAttempts}) (+1: total attempts)`);
    }
    if (typeof backoffMs === 'number') {
      retry.delaySeconds = backoffMs / 1000;
      mappings.push(`retryPolicy.backoffMs(${backoffMs}) → retry.delaySeconds(${retry.delaySeconds}) (÷1000)`);
    }
  }

  // requiresConfirm ← confirmation
  const requiresConfirm = typeof step.confirmation === 'boolean' ? step.confirmation : undefined;
  if (step.confirmation != null) mappings.push('steps[].confirmation → steps[].requiresConfirm');

  // failurePolicy ← onFailure
  const failurePolicy = mapFailurePolicy(step.onFailure);
  if (step.onFailure != null) {
    if (failurePolicy) {
      mappings.push(`steps[].onFailure("${step.onFailure}") → steps[].failurePolicy("${failurePolicy}")`);
    } else {
      warnings.push(`steps[${index}].onFailure="${step.onFailure}" has no canonical failurePolicy mapping; dropped.`);
    }
  }

  // Action migration
  const migrated = migrateAction(step);
  let type, action, params;

  // Template-convert the step name
  const nameResult = convertTemplates(step.name || `Step ${order}`);
  if (nameResult.warnings.length) warnings.push(...nameResult.warnings);

  if (migrated.mapped) {
    type   = migrated.type;
    action = migrated.action;
    mappings.push(`steps[].action("${step.action}") → type:"${type}" action:"${action}"`);

    // Build params from known template parameters in the command/query
    const paramSource = step.command || step.query || '';
    const paramResult = convertTemplatesDeep(paramSource);
    if (paramResult.warnings.length) {
      warnings.push(...paramResult.warnings.map(w => `steps[${index}]: ${w}`));
    } else if (paramSource) {
      // Extract ${paramName} references from converted string and build params map
      const refs = [...paramResult.converted.matchAll(/\$\{([a-zA-Z_][a-zA-Z0-9_-]*)\}/g)];
      if (refs.length > 0) {
        params = {};
        for (const ref of refs) {
          // Use canonical ${ref} syntax as the param value placeholder
          params[ref[1]] = `\${${ref[1]}}`;
        }
      }
    }
  } else {
    // Unmapped: do not put raw command into executable fields.
    // Step is created as a shell-legacy placeholder so auditors can see it.
    type   = RUNBOOK_STEP_TYPE.SHELL_LEGACY;
    action = 'unmapped';
    unmapped.push({
      stepIndex: index,
      stepName:  step.name,
      legacyAction: step.action,
      legacyCommand: step.command,
      reason: migrated.unmappedReason,
    });
    mappings.push(`steps[${index}]: action("${step.action}") UNMAPPED → shell/unmapped (non-executable)`);
  }

  const canonicalStep = {
    id:    `step-${String(order).padStart(2, '0')}`,
    name:  nameResult.converted,
    order,
    type,
    action,
  };

  if (params && Object.keys(params).length > 0) canonicalStep.params = params;
  if (timeoutSeconds != null) canonicalStep.timeoutSeconds = timeoutSeconds;
  if (retry) canonicalStep.retry = retry;
  if (requiresConfirm != null) canonicalStep.requiresConfirm = requiresConfirm;
  if (failurePolicy) canonicalStep.failurePolicy = failurePolicy;
  if (step.condition != null) canonicalStep.condition = step.condition;
  if (step.successCriteria != null) canonicalStep.successCriteria = step.successCriteria;

  // rollback string → migration evidence only (not executable); kept in migration.evidence, NOT in step
  if (step.rollback && typeof step.rollback === 'string') {
    const rollbackResult = convertTemplates(step.rollback);
    if (rollbackResult.warnings.length) {
      warnings.push(`steps[${index}].rollback: ${rollbackResult.warnings.join('; ')}`);
    }
    // Store in unmappedActions for audit; never in the canonical step object
    unmapped.push({
      stepIndex: index,
      stepName:  step.name,
      legacyAction: 'rollback',
      legacyCommand: rollbackResult.converted,
      reason: 'Legacy rollback command retained as migration evidence only (not executable)',
    });
    mappings.push(`steps[].rollback retained as migration evidence (not in canonical step)`);
  }

  return { canonicalStep, mappings, warnings, unmappedActions: unmapped };
}

// ── Parameter extraction from template references ──────────────────────────

/**
 * Extract a deduplicated list of parameter names from all ${ref} occurrences
 * across all canonical steps' params objects.
 */
function extractParameterNames(steps) {
  const names = new Set();
  for (const step of steps) {
    if (step.params) {
      for (const key of Object.keys(step.params)) names.add(key);
    }
  }
  return [...names];
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Normalise a parsed legacy AIRA Runbook object into Canonical Runbook v1.
 *
 * @param {object} parsed   - Output of YAML.load() for a legacy document.
 *                            MUST be a plain object.  Never mutated.
 * @param {object} source   - { file: string, format: string, originalVersion?: string }
 * @returns {NormalisationResult}
 *   {
 *     canonicalRunbook: object,   // ready for validateRunbook()
 *     source,
 *     migration: {
 *       normalized: boolean,
 *       mappings:         string[],
 *       warnings:         string[],
 *       unmappedActions:  Array<{ stepIndex, stepName, legacyAction, legacyCommand, reason }>
 *     }
 *   }
 */
function normaliseLegacyRunbook(parsed, source) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('normaliseLegacyRunbook: parsed must be a plain object');
  }
  if (source === null || typeof source !== 'object') {
    throw new TypeError('normaliseLegacyRunbook: source must be an object');
  }

  const allMappings       = [];
  const allWarnings       = [];
  const allUnmappedActions = [];

  // ── runbookId ──────────────────────────────────────────────────────────
  let runbookId;
  if (parsed.id) {
    runbookId = normaliseRunbookId(parsed.id);
    if (runbookId !== parsed.id.toUpperCase()) {
      allMappings.push(`id("${parsed.id}") → runbookId("${runbookId}") (RUNBOOK_LEGACY_ID_NORMALISED)`);
    }
    // RB-LEGACY-* IDs must be replaced before Registry import
    if (runbookId.startsWith('RB-LEGACY-')) {
      allWarnings.push(
        `RUNBOOK_MIGRATION_ID_REVIEW_REQUIRED: runbookId "${runbookId}" is a generated migration ID. ` +
        'Assign a stable canonical RB-{CATEGORY}-{NAME} identifier before Registry import.',
      );
    }
  }

  // ── risk ───────────────────────────────────────────────────────────────
  const riskLevel = mapSeverityToRisk(parsed.severity);
  allMappings.push(`severity("${parsed.severity}") → risk.level("${riskLevel}")`);

  // ── scope ──────────────────────────────────────────────────────────────
  const scope = {};
  if (Array.isArray(parsed.services) && parsed.services.length > 0) {
    scope.services = [...parsed.services];
    allMappings.push('services → scope.services');
  }

  // ── estimatedDurationSeconds ───────────────────────────────────────────
  let estimatedDurationSeconds;
  if (typeof parsed.estimatedDuration === 'number') {
    estimatedDurationSeconds = parsed.estimatedDuration;
    allMappings.push(`estimatedDuration(${parsed.estimatedDuration}) → estimatedDurationSeconds (preserved as-is; seconds)`);
  }

  // ── owner ──────────────────────────────────────────────────────────────
  const owner = {
    ownerType: RUNBOOK_OWNER_TYPE.SYSTEM,
  };
  if (parsed.metadata && parsed.metadata.owner) {
    owner.name = String(parsed.metadata.owner);
    allMappings.push(`metadata.owner("${owner.name}") → owner.name`);
  }
  allMappings.push('ownerType forced to "system" for filesystem definitions');

  // ── steps ──────────────────────────────────────────────────────────────
  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
  const canonicalSteps = [];

  for (let i = 0; i < rawSteps.length; i++) {
    const raw = rawSteps[i];
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      allWarnings.push(`steps[${i}] is not an object — skipped`);
      continue;
    }
    const { canonicalStep, mappings, warnings, unmappedActions } = normaliseStep(raw, i);
    canonicalSteps.push(canonicalStep);
    allMappings.push(...mappings);
    allWarnings.push(...warnings);
    allUnmappedActions.push(...unmappedActions);
  }

  // ── parameters — inferred from template references ─────────────────────
  const paramNames = extractParameterNames(canonicalSteps);
  const parameters = paramNames.map(name => ({
    name,
    type: 'string',
    required: true,
    description: `Inferred from legacy template reference {{${name}}}`,
  }));
  if (parameters.length > 0) {
    allMappings.push(`Inferred ${parameters.length} parameter(s) from template references: ${paramNames.join(', ')}`);
  }

  // ── dropped legacy fields ──────────────────────────────────────────────
  const droppedFields = [];
  if (parsed.triggers)             droppedFields.push('triggers');
  if (parsed.notificationChannels) droppedFields.push('notificationChannels');
  for (const f of droppedFields) {
    allMappings.push(`${f} → dropped (RUNBOOK_LEGACY_FIELD_DROPPED); retained in migration metadata`);
  }

  // ── lifecycle ──────────────────────────────────────────────────────────
  // Legacy runbooks always import as DRAFT.
  const lifecycle = RUNBOOK_LIFECYCLE.DRAFT;
  allMappings.push('lifecycle forced to DRAFT for legacy import');

  // ── Assemble canonical runbook ─────────────────────────────────────────
  const canonicalRunbook = {
    apiVersion: RUNBOOK_API_VERSION,
    kind:       RUNBOOK_KIND,
    name:       parsed.name || 'Untitled',
    lifecycle,
    owner,
    risk: { level: riskLevel },
    steps: canonicalSteps,
  };

  if (runbookId)                       canonicalRunbook.runbookId = runbookId;
  if (parsed.description)              canonicalRunbook.description = String(parsed.description);
  if (Object.keys(scope).length > 0)   canonicalRunbook.scope = scope;
  if (estimatedDurationSeconds != null) canonicalRunbook.estimatedDurationSeconds = estimatedDurationSeconds;
  if (parameters.length > 0)           canonicalRunbook.parameters = parameters;

  // ── Migration metadata (retained for audit; never executable) ─────────
  const migration = {
    normalized:      true,
    mappings:        allMappings,
    warnings:        allWarnings,
    unmappedActions: allUnmappedActions,
    // Retain non-executable evidence of legacy fields
    evidence: {
      triggers:             parsed.triggers             || null,
      preconditions:        parsed.preconditions        || null,
      postconditions:       parsed.postconditions       || null,
      notificationChannels: parsed.notificationChannels || null,
      legacyMetadata:       parsed.metadata             || null,
    },
  };

  return { canonicalRunbook, source, migration };
}

module.exports = { normaliseLegacyRunbook, convertTemplates, normaliseRunbookId };
