'use strict';

/**
 * Playbook Structural Validator
 *
 * Validates the shape and field-level correctness of a Playbook definition.
 * Pure function — no DB access, no async.
 * Returns diagnostics array, valid boolean.
 */

const {
  PLAYBOOK_ID_REGEX,
  PLAYBOOK_API_VERSION,
  PLAYBOOK_KIND,
  LIFECYCLE_VALUES,
  STAGE_TYPE_VALUES,
  FAILURE_POLICY_VALUES,
  ROLLBACK_STRATEGY_VALUES,
  RISK_LEVEL_VALUES,
  APPROVAL_MODE_VALUES,
  OWNER_TYPE_VALUES,
  PLAYBOOK_DIAGNOSTIC_CODES: C,
} = require('../../constants/playbook');

// ── Semver validator (reuse from runbook versioning) ──────────────────────
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(-[\w.]+)?(\+[\w.]+)?$/;

// ── Diagnostics helpers ───────────────────────────────────────────────────

function error(code, path, message) {
  return { severity: 'ERROR', code, path, message };
}

function warning(code, path, message) {
  return { severity: 'WARNING', code, path, message };
}

function info(code, path, message) {
  return { severity: 'INFO', code, path, message };
}

// ── Main validator ────────────────────────────────────────────────────────

function validatePlaybookStructure(playbook) {
  const diag = [];

  if (!playbook || typeof playbook !== 'object') {
    return {
      valid: false,
      diagnostics: [error(C.PLAYBOOK_MISSING_ID, 'root', 'Playbook must be a non-null object')],
    };
  }

  // ── apiVersion / kind
  if (!playbook.apiVersion) {
    diag.push(error(C.PLAYBOOK_MISSING_API_VERSION, 'apiVersion', 'apiVersion is required'));
  } else if (playbook.apiVersion !== PLAYBOOK_API_VERSION) {
    diag.push(error(C.PLAYBOOK_INVALID_API_VERSION, 'apiVersion',
      `apiVersion must be "${PLAYBOOK_API_VERSION}", got "${playbook.apiVersion}"`));
  }

  if (!playbook.kind) {
    diag.push(error(C.PLAYBOOK_MISSING_KIND, 'kind', 'kind is required'));
  } else if (playbook.kind !== PLAYBOOK_KIND) {
    diag.push(error(C.PLAYBOOK_INVALID_KIND, 'kind',
      `kind must be "${PLAYBOOK_KIND}", got "${playbook.kind}"`));
  }

  // ── playbookId
  if (!playbook.playbookId) {
    diag.push(error(C.PLAYBOOK_MISSING_ID, 'playbookId', 'playbookId is required'));
  } else if (typeof playbook.playbookId !== 'string' || !PLAYBOOK_ID_REGEX.test(playbook.playbookId)) {
    diag.push(error(C.PLAYBOOK_INVALID_ID, 'playbookId',
      `playbookId must match ${PLAYBOOK_ID_REGEX} (e.g. PB-K8S-CRASHLOOP-001)`));
  }

  // ── semver
  if (!playbook.semver) {
    diag.push(error(C.PLAYBOOK_MISSING_SEMVER, 'semver', 'semver is required'));
  } else if (!SEMVER_RE.test(String(playbook.semver))) {
    diag.push(error(C.PLAYBOOK_INVALID_SEMVER, 'semver',
      `semver "${playbook.semver}" is not valid (expected e.g. 1.0.0)`));
  }

  // ── name
  if (!playbook.name || typeof playbook.name !== 'string' || playbook.name.trim() === '') {
    diag.push(error(C.PLAYBOOK_MISSING_NAME, 'name', 'name is required and must be a non-empty string'));
  } else if (playbook.name.length > 200) {
    diag.push(warning(C.PLAYBOOK_MISSING_NAME, 'name', 'name exceeds 200 characters'));
  }

  // ── lifecycle
  if (!playbook.lifecycle) {
    diag.push(error(C.PLAYBOOK_MISSING_LIFECYCLE, 'lifecycle', 'lifecycle is required'));
  } else if (!LIFECYCLE_VALUES.includes(playbook.lifecycle)) {
    diag.push(error(C.PLAYBOOK_INVALID_LIFECYCLE, 'lifecycle',
      `lifecycle "${playbook.lifecycle}" is invalid. Must be one of: ${LIFECYCLE_VALUES.join(', ')}`));
  }

  // ── owner
  if (!playbook.owner || typeof playbook.owner !== 'object') {
    diag.push(error(C.PLAYBOOK_MISSING_OWNER, 'owner', 'owner is required'));
  } else {
    if (!playbook.owner.ownerType) {
      diag.push(error(C.PLAYBOOK_MISSING_OWNER, 'owner.ownerType', 'owner.ownerType is required'));
    } else if (!OWNER_TYPE_VALUES.includes(playbook.owner.ownerType)) {
      diag.push(error(C.PLAYBOOK_INVALID_OWNER_TYPE, 'owner.ownerType',
        `owner.ownerType "${playbook.owner.ownerType}" must be one of: ${OWNER_TYPE_VALUES.join(', ')}`));
    }
  }

  // ── risk
  if (playbook.risk && typeof playbook.risk === 'object') {
    if (playbook.risk.level && !RISK_LEVEL_VALUES.includes(playbook.risk.level)) {
      diag.push(error(C.PLAYBOOK_INVALID_RISK_LEVEL, 'risk.level',
        `risk.level "${playbook.risk.level}" must be one of: ${RISK_LEVEL_VALUES.join(', ')}`));
    }
  }

  // ── approval
  if (playbook.approval && typeof playbook.approval === 'object') {
    if (playbook.approval.mode && !APPROVAL_MODE_VALUES.includes(playbook.approval.mode)) {
      diag.push(error(C.PLAYBOOK_INVALID_APPROVAL_MODE, 'approval.mode',
        `approval.mode "${playbook.approval.mode}" must be one of: ${APPROVAL_MODE_VALUES.join(', ')}`));
    }
  }

  // ── rollback
  if (playbook.rollback && typeof playbook.rollback === 'object') {
    if (playbook.rollback.strategy && !ROLLBACK_STRATEGY_VALUES.includes(playbook.rollback.strategy)) {
      diag.push(error(C.PLAYBOOK_INVALID_ROLLBACK_STRATEGY, 'rollback.strategy',
        `rollback.strategy "${playbook.rollback.strategy}" must be one of: ${ROLLBACK_STRATEGY_VALUES.join(', ')}`));
    }
    if (playbook.rollback.maxAttempts != null && (
      !Number.isInteger(Number(playbook.rollback.maxAttempts)) ||
      Number(playbook.rollback.maxAttempts) < 0
    )) {
      diag.push(warning(C.PLAYBOOK_INVALID_ROLLBACK_STRATEGY, 'rollback.maxAttempts',
        'rollback.maxAttempts must be a non-negative integer'));
    }
  }

  // ── stages
  if (!playbook.stages) {
    diag.push(error(C.PLAYBOOK_MISSING_STAGES, 'stages', 'stages array is required'));
  } else if (!Array.isArray(playbook.stages)) {
    diag.push(error(C.PLAYBOOK_MISSING_STAGES, 'stages', 'stages must be an array'));
  } else if (playbook.stages.length === 0) {
    diag.push(error(C.PLAYBOOK_EMPTY_STAGES, 'stages', 'stages must contain at least one stage'));
  } else {
    _validateStages(playbook.stages, diag);
  }

  // ── conditions
  if (playbook.conditions?.minimumConfidence != null) {
    const mc = Number(playbook.conditions.minimumConfidence);
    if (!Number.isFinite(mc) || mc < 0 || mc > 1) {
      diag.push(error(C.PLAYBOOK_INVALID_STAGE, 'conditions.minimumConfidence',
        'conditions.minimumConfidence must be between 0 and 1'));
    }
  }

  // ── Direct execution check: Playbooks must NOT have action/command/execute fields
  _checkNoDirectExecution(playbook, 'root', diag);

  const valid = !diag.some(d => d.severity === 'ERROR');
  return { valid, diagnostics: diag };
}

// ── Stage validation ───────────────────────────────────────────────────────

function _validateStages(stages, diag) {
  const seenIds     = new Set();
  const seenOrders  = new Set();

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const path  = `stages[${i}]`;

    if (!stage || typeof stage !== 'object') {
      diag.push(error(C.PLAYBOOK_INVALID_STAGE, path, `Stage ${i} must be an object`));
      continue;
    }

    // Required fields — accept both 'id' and 'stageId' (YAML catalogue uses stageId)
    const stageId = stage.id || stage.stageId;
    if (!stageId || typeof stageId !== 'string' || stageId.trim() === '') {
      diag.push(error(C.PLAYBOOK_INVALID_STAGE, `${path}.id`, `Stage ${i}: id is required`));
    } else {
      if (seenIds.has(stageId)) {
        diag.push(error(C.PLAYBOOK_DUPLICATE_STAGE_ID, `${path}.id`,
          `Duplicate stage id: "${stageId}"`));
      }
      seenIds.add(stageId);
    }

    if (stage.order == null) {
      diag.push(error(C.PLAYBOOK_INVALID_STAGE_ORDER, `${path}.order`, `Stage ${i}: order is required`));
    } else {
      const order = Number(stage.order);
      if (!Number.isInteger(order) || order < 1) {
        diag.push(error(C.PLAYBOOK_INVALID_STAGE_ORDER, `${path}.order`,
          `Stage ${i}: order must be a positive integer, got "${stage.order}"`));
      } else {
        if (seenOrders.has(order)) {
          diag.push(error(C.PLAYBOOK_DUPLICATE_STAGE_ORDER, `${path}.order`,
            `Duplicate stage order: ${order}`));
        }
        seenOrders.add(order);
      }
    }

    if (!stage.name || typeof stage.name !== 'string' || stage.name.trim() === '') {
      diag.push(error(C.PLAYBOOK_INVALID_STAGE, `${path}.name`, `Stage ${i}: name is required`));
    }

    if (!stage.type) {
      diag.push(error(C.PLAYBOOK_INVALID_STAGE_TYPE, `${path}.type`, `Stage ${i}: type is required`));
    } else if (!STAGE_TYPE_VALUES.includes(stage.type)) {
      diag.push(error(C.PLAYBOOK_INVALID_STAGE_TYPE, `${path}.type`,
        `Stage ${i}: type "${stage.type}" must be one of: ${STAGE_TYPE_VALUES.join(', ')}`));
    }

    if (stage.failurePolicy && !FAILURE_POLICY_VALUES.includes(stage.failurePolicy)) {
      diag.push(error(C.PLAYBOOK_INVALID_FAILURE_POLICY, `${path}.failurePolicy`,
        `Stage ${i}: failurePolicy "${stage.failurePolicy}" must be one of: ${FAILURE_POLICY_VALUES.join(', ')}`));
    }

    // Validate runbook references
    if (stage.runbooks != null) {
      if (!Array.isArray(stage.runbooks)) {
        diag.push(error(C.PLAYBOOK_INVALID_RUNBOOK_REF, `${path}.runbooks`,
          `Stage ${i}: runbooks must be an array`));
      } else {
        stage.runbooks.forEach((ref, j) => _validateRunbookRef(ref, `${path}.runbooks[${j}]`, i, j, diag));
      }
    }
  }
}

function _validateRunbookRef(ref, path, stageIdx, refIdx, diag) {
  if (!ref || typeof ref !== 'object') {
    diag.push(error(C.PLAYBOOK_INVALID_RUNBOOK_REF, path,
      `Stage ${stageIdx} runbook ref ${refIdx} must be an object`));
    return;
  }

  if (!ref.runbookId || typeof ref.runbookId !== 'string' || ref.runbookId.trim() === '') {
    diag.push(error(C.PLAYBOOK_INVALID_RUNBOOK_REF, `${path}.runbookId`,
      `Stage ${stageIdx} runbook ref ${refIdx}: runbookId is required`));
  }

  if (ref.parameterMappings != null && typeof ref.parameterMappings !== 'object') {
    diag.push(error(C.PLAYBOOK_INVALID_RUNBOOK_REF, `${path}.parameterMappings`,
      `Stage ${stageIdx} runbook ref ${refIdx}: parameterMappings must be an object`));
  }
}

// ── No direct execution check ─────────────────────────────────────────────

const FORBIDDEN_EXECUTION_KEYS = ['action', 'command', 'execute', 'script', 'shell', 'cmd'];

function _checkNoDirectExecution(obj, path, diag) {
  if (!obj || typeof obj !== 'object') return;
  // Don't descend into stages.runbooks.parameterMappings (those are mapping expressions, not actions)
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_EXECUTION_KEYS.includes(key.toLowerCase()) && path !== 'root') {
      diag.push(error(C.PLAYBOOK_DIRECT_EXECUTION, `${path}.${key}`,
        `Playbooks must never contain direct execution fields ("${key}"). ` +
        'All execution must flow through Runbook references.'));
    }
  }
}

module.exports = { validatePlaybookStructure };
